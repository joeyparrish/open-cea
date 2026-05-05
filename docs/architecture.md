# Architecture

This document describes how `open-cea` is structured today and the
design choices behind the structure. It is meant for someone who is
about to read or modify the source. For the user-facing feature list
and CLI usage examples, see [README.md](../README.md). For agent
orientation and conventions, see [AGENTS.md](../AGENTS.md).

## Overview

`open-cea` is an encoder. It takes a high-level description of a
caption presentation (timed text, optionally with windows, pens, and
per-cue position) and produces a stream of `cc_data()` bytes that
ride alongside a video signal. It targets MCC v2.0 as its primary
output container, since FFmpeg natively demuxes MCC and muxes the
payload into SEI for any modern video codec without feature loss.

The project deliberately stops at the `cc_data()` boundary. NAL unit
framing, codec-specific SEI injection, and container muxing are
FFmpeg's job. See [ffmpeg-mcc-ingest.md](ffmpeg-mcc-ingest.md) for
how the two pieces connect.

## Tools and infrastructure

- **TypeScript with `strict: true`.** The code is intended to be
  read; types pull their weight in catching the easy mistakes that
  bit-level encoders are prone to.
- **ESLint** for stylistic consistency and to forbid `any` casts.
- **Vitest** for tests. ESM and TypeScript work natively, watch mode
  is fast, and the assertion API is Jest-compatible. There is no
  separate compile step in the test loop.
- **commander** for CLI parsing. A hand-rolled argument parser would
  be unwieldy with subcommands and global options; `commander` handles
  nested subcommands, free `--help` output, and positional vs option
  ordering cleanly. `yargs` would have worked, but commander won on
  bundle size (about a quarter of yargs) and a tighter subcommand API
  for the nested shape this CLI uses.

`commander` is the only runtime dependency.

## Test strategy: the spec is the oracle

Every byte the encoder produces is justified directly by a section
or table in CTA-608-E or CTA-708-E. We do not cross-check against a
third-party reference encoder, on principle: the project started by
checking output against `libcaption` and discovered it had several
spec-compliance bugs that we would have inherited.

Tests in `tests/golden/` carry hand-curated byte expectations sourced
from the spec digests in `specs/608.md` and `specs/708.md`. Each
expectation cites the section or table it comes from. The rule of
thumb: for every "shall" or "must" mandate the encoder is responsible
for, there should be a test that would fail if the rule were
violated.

The digests are the day-to-day reference. The original PDFs are
available for free if the digest is ever found to be ambiguous,
untrustworthy, or incomplete. But we do not have the rights to
redistribute them, so the original PDFs cannot be committed to
the repo.

## Code organization

The source is layered. The lower layers are stateless byte-level
encoders. The upper layers add scheduling, declarative shape, and
file format:

```
specs/608.md, specs/708.md       hand-written digests of the standards
specs/mccdec.c                   ffmpeg's MCC demuxer (de facto spec for MCC)

src/cea608/                      stateless CTA-608-E primitives
src/cea708/                      stateless CTA-708-E primitives
src/timeline.ts                  declarative API: CaptionTimeline / Event / Window / Pen
src/encoder.ts                   per-frame cc_data() emitter (the rate machine)
src/orchestrator.ts              time-driven action pump (drives one Encoder)
src/compiler.ts                  CaptionTimeline -> 708 actions
src/compiler608.ts               CaptionTimeline -> 608 actions
src/compile/                     JSON document type, validator, multi-track build
src/test-patterns/               synthesized verification streams
src/formatter/                   timecode helper, frame splitter, MCC, raw
src/parser/vtt.ts                WebVTT reader
src/cli/runCli.ts                commander wiring
```

Importantly:

- **`cea608/` and `cea708/` are pure functions over byte arrays.**
  They have no scheduling, no state beyond what is necessary to
  encode a single value. Anyone consuming the library can use them
  directly to construct `cc_data()` payloads from scratch.
- **State lives only in `encoder.ts`, `orchestrator.ts`, the
  compilers, and the `CaptionBuilder` subclasses in `cea608/`.**
  Everything else is referentially transparent.

This split is what makes the test suite sustainable. Most modules
can be tested without setting up a timeline.

## The 9600 bps bandwidth model

The DTVCC Transport Channel runs at a constant 9600 bps (1200 bytes
per second = 600 byte-pairs per second), divided by 1.001 for
fractional NTSC rates. `Encoder` exposes this as a fixed
`ccCountPerFrame(fps)`:

| fps          | tuples per frame |
|--------------|------------------|
| 24           | 25               |
| 25           | 24               |
| 29.97 / 30   | 20               |
| 50           | 12               |
| 59.94 / 60   | 10               |

Each frame's output is exactly `ccCountPerFrame * 3` bytes. There is
no variable-rate mode. The encoder always emits a full frame's worth;
unused tuples become DTVCC padding (`cc_valid=0`, `cc_type=10` or
`11`). This invariant is what makes per-frame timecodes possible and
what `splitByFrame` relies on for MCC formatting.

The leading positions in each frame carry the embedded CEA-608
datastream (one byte-pair per field per frame at NTSC rates, two at
30p). See `leading608Count` in `src/encoder.ts` for the per-rate
breakdown and the 708 spec's Section 4.3.6 / Table 4 mapping.

## The Action / orchestrator model

A `CaptionTimeline` is the user-facing input shape: a set of windows
plus a set of timed events. The compilers (`compileTimeline`,
`compileTimeline608`) translate that into a list of `Action` records:

```ts
type Action =
  | { kind: '608'; timeSec: number; field: 0 | 1; words: CcWord[] }
  | { kind: '708'; timeSec: number; payload: Uint8Array };
```

Each Action says "at this time, push this byte material into this
side of the encoder." The shared `runOrchestrator` walks the timeline
frame by frame, drains pending Actions into one `Encoder`, and
appends the resulting per-frame `cc_data()` slices to a flat
`Uint8Array`.

This is the lever that lets the JSON `compile` subcommand mix tracks.
A document with one CC1 track, one CC3 track, and one 708 service is
just three Action lists concatenated together. The Encoder fields
each track's data into the correct slot (F1 / F2 / DTVCC) on its own.

The Service Input Buffer guard for 708 tracks (CTA-708-E sections 6.8
and 9.1) lives at the action-building layer: `buildTimelineActions708`
simulates per-service buffering at the DTVCC channel rate (1200 B/s)
between consecutive actions and rejects any input that would push more
than 128 bytes of pending data on the decoder. CCP framing already
enforces a 127-byte cap per packet, so the only remaining failure mode
is a same-instant burst of multiple events; this catches that.

## CEA-608 modes vs CEA-708 windowing

Pop-on, paint-on, and roll-up are CEA-608 concepts. CEA-708 is window
based and composes equivalents from window and pen attributes:

| 608 style | 708 equivalent                                            |
|-----------|------------------------------------------------------------|
| pop-on    | hidden window filled with text, then `DisplayWindows`      |
| paint-on  | visible window written into directly                       |
| roll-up   | window with `scrollDirection = bottom-to-top`              |

This is why the CLI flag `--style pop-on|paint-on|roll-up` only
exists on `vtt-to-cea-608`. For 708 the equivalent choices come from
`Window.visible`, `Window.scrollDirection`, and the relative ordering
of `DefineWindow` and text writes.

The current 708 path (single-window timeline plus `compileTimeline`)
defines a visible window and writes text into it directly, which is
paint-on semantics. True 708 pop-on requires two windows plus
`ToggleWindows`; that pattern is reachable through the JSON `compile`
document but is not the default.

## Roll-up row count (RU2 / RU3 / RU4)

Roll-up keeps `N` visible rows at a fixed base row; each carriage
return scrolls contents up one row, with new text landing on the
bottom. The `--rows` flag picks `N`:

- **RU2.** Tightest screen footprint. Standard for live news where
  the priority is "show the most recent line ASAP, don't block the
  picture."
- **RU3.** Historical compromise. Gives slow readers an extra line
  of context without much extra screen impact. **Default for the
  CLI.**
- **RU4.** Most context, biggest footprint, rarer.

These are caption-author conventions, not spec mandates; the spec
allows any of the three on any caption channel.

## Frame rates and SMPTE timecode

Seven frame rates are supported: 24, 25, 29.97, 30, 50, 59.94, 60.
The fractional rates (29.97 / 59.94) use SMPTE drop-frame timecode in
MCC output: at 29.97 the timecode skips frame numbers 00 and 01 at
the start of every minute except every tenth minute; at 59.94 it
skips four. The non-drop rates use straightforward
`framesPerSecond = round(fps)` decomposition.

`mccTimeCodeRate(fps)` maps these to the seven exact strings FFmpeg's
MCC demuxer accepts: `24`, `25`, `30DF`, `30`, `50`, `60DF`, `60`.
This mapping is verified against `specs/mccdec.c`.

## Output formats

Two formats, both go through the same per-frame `cc_data()` byte
stream:

- **`mcc`** (default). MacCaption v2.0 sidecar. Plain ASCII header
  declaring `File Format=MacCaption_MCC V2.0` and `Time Code Rate=`,
  followed by one `<timecode><tab><hex-payload>` line per video
  frame. FFmpeg natively demuxes this and muxes the payload into
  whatever ancillary location the target codec expects. v1 emits
  uncompressed hex; the MCC dictionary substitution scheme is a size
  optimization, not a correctness one.
- **`raw`**. A flat binary dump of the per-frame `cc_data()` tuples
  concatenated. Primarily for testing or piping into other parsers.

For the FFmpeg side of the pipeline (which time-code-rate strings are
accepted, what `eia608_extract` does, why the MCC choice was made
over generating SEI directly), see
[ffmpeg-mcc-ingest.md](ffmpeg-mcc-ingest.md).

## CLI surface

Four subcommands plus two global options. The shapes:

- `vtt-to-cea-708 <input.vtt> <output>` and
  `vtt-to-cea-608 <input.vtt> <output> --style ...`. Quick paths for
  the common case of "I have a VTT file, give me an MCC."
- `compile <input.json> <output>`. JSON-driven multi-track. The
  document carries only `tracks`; `--fps` and `--output-format` stay
  on the CLI so the same authoring doc retargets across rates without
  edits.
- `test-pattern <output> --type position|timing`. Synthesized streams
  for player verification.

Globals:

- `--fps <rate>`. Required. One of 24 / 25 / 29.97 / 30 / 50 / 59.94 /
  60.
- `--output-format <mcc|raw>`. Defaults to `mcc`.

The two `vtt-to-cea-*` subcommands have intentionally disjoint flag
namespaces (window placement on the 708 side, channel and style on
the 608 side). Keeping them separate avoids runtime "flag X is
incompatible with flag Y" validation and lets each subcommand have
its own focused help screen. Per-cue or per-window control beyond
what these flags expose lives in the `compile` subcommand.

The CLI is a thin wrapper over the library. Everything available
through the CLI is also available programmatically; the
`runOrchestrator` and `compileDocument` entry points are exported.

## What is intentionally not implemented

The README has the user-facing list. From an architecture standpoint
the notable deliberate omissions:

- **CEA-608 Text Mode and XDS.** Both are out of the FCC-mandated
  caption profile and out of architecture scope.
- **CEA-708 C2 / C3 / G3 beyond the cc-logo, P16, variable-length C3
  commands (font / graphics download).** Reserved or rare; not in
  the minimum-decoder profile that this project targets.
- **Multi-CCP splitting at element boundaries.** Events whose
  rendered payload exceeds the 127-byte CCP cap throw at compile
  time. This is the right default; the splitting logic is
  straightforward to add when an event genuinely needs it.
- **Caption Service Metadata generation
  (`caption_service_descriptor()`).** Out-of-band; FFmpeg generates
  it during muxing.
- **Decoding.** `open-cea` is encode-only.
