# AGENTS.md

Orientation for an agent picking up work on `open-cea`.

## Attribution

Read [AGENT-ATTRIBUTION.md](AGENT-ATTRIBUTION.md) for attribution details.

## What this project is

A strictly-typed TypeScript library and CLI that generates byte-accurate
CEA-608 and CEA-708 closed-caption streams. Output is a flat sequence
of `cc_data()` tuples (and, eventually, MCC sidecar files for FFmpeg
ingestion). High-level goal: full coverage of both CTA-608-E and
CTA-708-E for encoding, with byte-precise spec compliance.

Released under Apache 2.0.

## Where to find context

- `plans/open-cea-architecture.md` - top-level architecture, CLI
  surface, output formats, verification rules. Read first.
- `plans/remaining-features.md` - current implementation roadmap
  (libcaption removal, CLI parser, MCC formatter, `compile` and
  `test-pattern` subcommands). Steps 0, 1, 2 are done; 3, 4, 5 are
  pending. The doc lists the order and dependencies.
- `specs/608.md` - comprehensive digest of CTA-608-E S-2019.
- `specs/708.md` - comprehensive digest of CTA-708-E S-2023 + errata.
- `specs/mccdec.c` - ffmpeg MCC decoder, because there is no spec.
- `README.md` - one-paragraph project blurb. No technical content.

## When to consult the specs

**Always**, before writing or modifying any of:

- byte values (control codes, PACs, mid-row codes, character tables,
  C0/C1/G0/G1/G2/G3 entries),
- bit-level layouts (`cc_data()`, CCP header, Service Block header,
  SPA / SPC / SWA / DefineWindow parameter packing),
- protocol semantics (control-pair doubling, pop-on / paint-on /
  roll-up flow, EOC / EDM / ENM, cursor movement, attribute
  inheritance, service input buffer behavior),
- bandwidth / rate constraints (9600 bps DTVCC budget, 60/1.001 byte-
  pairs/s/field on line 21, leading-608 entries per frame).

The digests cite the relevant CTA section in parentheses (`section
8.10.5.2`, etc.). When citing the spec in code comments, prefer the
section number from the digest. Do not cite a third-party
implementation as authority for a byte value: the spec is the oracle.

Do **not** consult the specs for general TypeScript style, refactoring
decisions, test infrastructure, or build configuration; those follow
ordinary engineering practice.

## Code layout

```
src/
  cea608/                     stateless CTA-608-E layer
    types.ts                  channel / style / underline enums
    parity.ts                 odd-parity bit
    control.ts                Misc Control Codes + Tab Offsets
    pac.ts                    Preamble Address Codes (Table 53)
    midrow.ts                 Mid-Row codes (Table 51)
    text.ts                   Basic / Special / Extended char encoders
    charmap.ts                176-slot flat character table dispatch
    glyphs.ts                 UTF-8 round-trip glyphs + reverse map
    string.ts                 UTF-8 -> CcWord[] with extended-char
                              fallback insertion
    builder.ts                stateful PopOn / PaintOn / RollUp builders
                              (handles control-pair doubling)
    attributes.ts             optional EIA-608-D background / FA / FAU

  cea708/                     stateless CTA-708-E layer
    types.ts                  Opacity / BorderType / etc. enums
    transport.ts              `cc_data()` tuple framing, padding
    packet.ts                 CCP framing (sequence, `packet_size_code`)
    service.ts                Service Block headers (standard / extended)
    window.ts                 DefineWindow / SetWindowAttributes / DSW...
    pen.ts                    SetPenAttributes / SetPenColor / SPL / DLY...
    text.ts                   G0 / G1 / G2 string encoder + C0 codes

  timeline.ts                 declarative API: CaptionTimeline,
                              CaptionEvent, Window, Pen
  encoder.ts                  the orchestrator: per-frame `cc_data()`
                              emission, leading-608 + DTVCC budget,
                              CCP queue draining, sequence numbers
  compiler.ts                 CaptionTimeline -> 708 `cc_data()` bytes
  compiler608.ts              CaptionTimeline -> 608 `cc_data()` bytes

  parser/vtt.ts               WebVTT -> CaptionTimeline (basic)
  formatter/raw.ts            Uint8Array -> binary file
  cli/runCli.ts               commander-based CLI entry point
  index.ts                    package re-exports

tests/
  cea608/, cea708/            per-module unit tests
  *.test.ts                   integration / orchestration tests
  golden/                     spec-derived byte expectations for
                              control codes, PACs, mid-row, tabs,
                              attributes, basic-NA pairs, and the
                              charmap dispatcher
```

The `cea608/` and `cea708/` layers are stateless functions over byte
arrays. State (cursor, mode, queue) lives only in `encoder.ts`,
`compiler.ts`, `compiler608.ts`, and the `CaptionBuilder` subclasses.

## Key design decisions

1. **Spec is the oracle.** No third-party reference implementation. We
   used to cross-check against libcaption, until libcaption was
   discovered to have several spec-compliance bugs.  Tests assert
   byte-for-byte against spec tables.
2. **Strict TS + ESLint.** No `any` casts, no skipped tests, no TODO
   comments left in committed diffs.
3. **Vitest** for tests. `npm test`, `npm run lint`, `npm run build`
   must all pass clean before claiming a step done.
4. **commander** for CLI argument parsing. Don't hand-roll arg parsing
   in new subcommands.
5. **MCC is the primary output path** (planned). Raw `cc_data()` dump
   exists for testing only. FFmpeg ingests MCC and muxes into video.
6. **9600 bps constant-rate.** `Encoder` always emits a fixed
   `ccCountPerFrame` of `cc_data` tuples per frame; padding fills the
   gap. Don't change this without revisiting CTA-708-E section 11.1.
7. **Wordwrap and row/column-lock forced.** CTA-708-E section 6.4
   mandates wordwrap=0 and locks=1; the encoders enforce this and the
   `Window` API does not expose wordwrap.
8. **Single-window timelines render paint-on, not pop-on.** True 708
   pop-on uses two windows + TGW (CTA-708-E section 9.3); the current
   compiler defines one visible window and writes into it. Fine for
   typical caption rates; tracked for the `compile` subcommand work.
9. **Pop-on (608) re-emits RCL on every cue.** Each caption is a
   self-contained burst per CTA-608-E section 9.2. Don't optimize this
   out by relying on EOC's sticky pop-on side effect.
10. **Roll-up (608) re-emits PAC on every cue** at the configured
    `(row, column)` per CTA-608-E section 9.3.
11. **Service Input Buffer guard.** `compileTimeline` simulates the
    decoder's 128-byte buffer at 1200 bytes/s and rejects bursts that
    would overflow. CTA-708-E sections 6.8 / 9.1.

## Verification rule

After any change:

```
npm test
npm run lint
npm run build
```

All three must pass with no skipped tests, no `any` casts, no `TODO`
comments left in the diff. For each "shall" / "must" mandate the
encoder is responsible for, there must be a test that would fail if
the rule were violated.

## Working conventions

- One commit per logical change. Don't bundle an unrelated cleanup
  into a feature commit.
- Spec compliance review: read the relevant digest section before
  writing the code, not after.
- When citing the spec in a comment, write the section number as
  prose ("CTA-708-E section 6.2") rather than the U+00A7 character;
  the editor pipeline does not always round-trip non-ASCII glyphs
  cleanly.
- Don't add backwards-compatibility shims, feature flags, or removal
  markers for obsolete code. If something is unused, delete it.
- The CLI's `--fps` is a required global option (commander parent
  command). Subcommands access it via `optsWithGlobals()`.

## What is intentionally not implemented

- CEA-608 Text Mode (T1..T4), URL transport on T2, XDS. Not in
  architecture scope.
- CEA-708 C2 / C3 / G3 extended code spaces beyond the cc-logo.
  Skipped per CTA-708-E sections 9.3 / 10.2 minimum-decoder profile.
- Multi-CCP splitting at element boundaries. The compiler throws when
  an event payload exceeds 127 bytes; tracked in
  `remaining-features.md`.
- 708-to-608 NTSC re-emission. Out of scope.
- MCC dictionary compression. v1 emits uncompressed hex; FFmpeg
  accepts that fine.

## When in doubt

Read the digest section, write the test against the spec table, then
write the code. If the digest disagrees with the spec PDF, the PDF wins;
update the digest. The original spec PDFs are not committed, but can be
downloaded for free by any human, and can be provided to you on demand.
