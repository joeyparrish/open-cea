# open-cea

https://github.com/joeyparrish/open-cea

A comprehensive, strictly-typed TypeScript library and command-line
tool for generating byte-accurate CEA-608 and CEA-708 closed-caption
streams. Output is the MacCaption MCC v2.0 sidecar that FFmpeg
natively ingests, or a raw `cc_data()` binary dump for testing.

Released under the Apache 2.0 license. See [LICENSE.md](LICENSE.md).

## Why

The CEA-608 and CEA-708 standards are well documented but cover a lot
of ground (channels, modes, character sets, control codes, window
geometry, pen attributes, services, transport). Existing open-source
implementations either focus on decoding or have known spec-compliance
bugs. `open-cea` is encoder-only and tests every byte against the
CTA-608-E and CTA-708-E tables directly: the spec is the oracle.

## Install

```
npm install open-cea
```

The package ships ESM-only, targets Node 18+, and has a single
runtime dependency (`commander`).

## What is supported

### CEA-608

- All three caption styles: pop-on, paint-on, roll-up (with 2 / 3 / 4
  visible rows).
- All four caption channels: CC1, CC2, CC3, CC4 (F1 vs F2 routing
  handled automatically).
- Preamble Address Codes (rows 1..15, indents 0/4/8/12/16/20/24/28,
  underline, color or italic per Table 53).
- Tab Offsets (TO1/TO2/TO3) for non-aligned column placement.
- Mid-Row codes (Table 51): seven colors plus italic, with optional
  underline.
- All Misc Control codes (RCL, BS, DER, RU2/3/4, FON, RDC, EDM, CR,
  ENM, EOC).
- Background and foreground-black attribute codes (EIA-608-D optional
  extension: BWO..BAS, BT, FA, FAU).
- Basic North American character set (Table 50, with the §4.1
  reassigned slots: 0x2A=á, 0x5C=é, ..., 0x7E=ñ).
- Special North American characters (Table 49: ®, °, ½, ¿, ™, ¢, £,
  ♪, à, transparent space, è, â, ê, î, ô, û).
- Extended Western European characters (Tables 5..10) with the
  spec-mandated auto-backspace pair: a basic-NA fallback character is
  emitted first so legacy decoders show a reasonable approximation.
- Odd parity on every byte (Section 2).
- Control-pair doubling on every caption-mode and text-mode control
  pair (Section 9.1 / FCC mandate).

### CEA-708

- Up to 63 services per stream (Standard 1-byte and Extended 2-byte
  service block headers).
- Up to 8 windows per service, with the full set of window-style
  parameters: anchor point (9 positions), absolute or relative
  positioning, row count 1..15, column count 1..42, priority 0..7,
  visibility, fill / border colors, fill / border opacity, border
  type, print and scroll direction, justify, display effect (snap,
  fade, wipe), effect direction, effect speed.
- All C1 captioning commands: CW0..CW7, CLW, DSW, HDW, TGW, DLW, DLY,
  DLC, RST, SPA, SPC, SPL, SWA, DF0..DF7.
- All C0 control codes used by the encoder: NUL, ETX, BS, FF, CR,
  HCR, EXT1.
- Pen attributes (SPA): three sizes (small / standard / large), eight
  font styles, sub / normal / superscript, italic, underline, six
  edge types, all sixteen text tags.
- Pen colors (SPC): full 64-color palette (2 bits per RGB channel),
  four opacity levels for foreground / background / edge.
- G0 ASCII (with 0x7F = music note, per Section 5.3).
- G1 Latin-1 (single-byte 0xA0..0xFF).
- The mandatory G2 subset (TSP, NBTSP via G1 NBS, solid block, ™, Š,
  Œ, š, œ, Ÿ) plus other defined entries (ellipsis, smart quotes,
  bullet, service mark, fractions, box-drawing pieces).
- The G3 cc-logo glyph.
- 9600 bps constant-rate output: every frame contains a fixed number
  of `cc_data()` tuples; padding fills the unused slots.
- CCP framing with sequence numbers and the standard
  `packet_size_code` derivation.
- Multiplexed CEA-608 + CEA-708 in one `cc_data()` stream (one shared
  encoder; CC1 + CC3 + a 708 service can coexist).
- `top_field_first` ordering option for interlaced sources.
- DTVCC padding alternates `cc_type=11` at CCP boundaries with
  `cc_type=10` mid-stream so packet boundaries are visible in a hex
  dump.
- Wordwrap forced off and row / column lock forced on, per
  CTA-708-E Section 6.4.
- Per-service Service Input Buffer guard at compile time: the encoder
  rejects bursts that would overflow the decoder's 128-byte input
  buffer (Section 6.8 / 9.1).

### Output formats

- **MCC v2.0** (default). MacCaption sidecar that FFmpeg natively
  demuxes into `cc_data()` payloads, ready to mux into SEI for any
  modern video codec without feature loss.
- **Raw**. Flat binary dump of `cc_data()` tuples, primarily for
  testing or piping into other parsers.

### Frame rates

- 24, 25, 30, 50, 60 (non-drop SMPTE timecode in MCC).
- 29.97, 59.94 (SMPTE drop-frame timecode in MCC).

### Inputs

- WebVTT (basic): timing and text only; HTML / VTT inline tags are
  stripped; multi-line cues become a 708 CarriageReturn between
  segments.
- A JSON document describing one or more tracks (the `compile`
  subcommand). The schema is defined and validated in
  `src/compile/document.ts`.
- Programmatic: build a `CaptionTimeline` directly via the library
  API.

## What is not supported

These are deliberate scope boundaries; not bugs.

### CEA-608

- Text Mode (T1, T2, T3, T4) and the URL-transport-on-T2 mechanism.
- XDS (eXtended Data Service): the F2 metadata channel for program
  ID, ratings, content advisory, etc.
- Smooth-scroll roll-up (decoder hint, not encoder side).
- Article identifiers (ANS, ANE, AC, AE) and the page-id forward
  compatibility codes.
- The closed-group extension assignments (Table 4 alternate
  character sets, including CJK).
- Per-cue row / column variation in `compileTimeline608`: the
  `--row` / `--column` flags apply to the whole stream, not per cue.
  Multi-line 608 cues from VTT collapse the line break to a space
  for the same reason.

### CEA-708

- C2 and C3 extended control code spaces beyond the cc-logo.
- G3 character set beyond the cc-logo.
- P16 16-bit characters (reserved future CJK code set).
- Variable-length C3 commands (BOC / COC / EOC segment chains for
  font and graphics downloads).
- Multi-CCP splitting at syntactic-element boundaries: an event whose
  rendered payload exceeds the 127-byte CCP cap is rejected at
  compile time.
- Two-window TGW pop-on rendering. The library defines a visible
  window and writes text directly into it, which is paint-on
  semantics; the visual difference is invisible at typical caption
  rates.
- Caption Service Metadata (`caption_service_descriptor()` in PMT
  and EIT). Out-of-band; FFmpeg generates it during muxing.

### Output and I / O

- MCC v2.0 dictionary compression (size optimization only; FFmpeg
  accepts uncompressed hex).
- Direct muxing into video containers. Use FFmpeg with the MCC
  output.
- SCTE 21 user_data, MPEG-2 picture user_data, or SMPTE 334-2 CDP
  wrapping. Use FFmpeg.
- 708-to-608 NTSC re-emission. The embedded 608 datastream inside
  DTVCC is the spec-intended path for 608 viewers.
- WebVTT styling, positioning, regions, cue settings. The parser
  reads timing and text only.
- Decoding. `open-cea` is encode-only.

## Sample usage

### CLI: WebVTT to a 708 MCC sidecar (the most common path)

```
open-cea --fps 30 vtt-to-cea-708 captions.vtt captions.mcc
```

The resulting `captions.mcc` is a MacCaption v2.0 sidecar. FFmpeg
demuxes it into `cc_data()` payloads and muxes them into the video
stream as SEI (or the codec-equivalent ancillary location). Consult
the FFmpeg docs for the exact muxing command for your target
container and codec; the MCC file itself is the input shape FFmpeg
expects.

`--fps` is required; valid values are 24, 25, 29.97, 30, 50, 59.94,
60. Drop-frame rates (29.97 / 59.94) write `30DF` / `60DF` into the
`Time Code Rate=` header so FFmpeg interprets the timecode column
correctly.

### CLI: WebVTT to 608 (line 21 / DTVCC-embedded 608)

```
open-cea --fps 29.97 vtt-to-cea-608 captions.vtt captions.mcc \
    --style pop-on --channel CC1
```

`--style` is required (`pop-on`, `paint-on`, or `roll-up`). Other
flags: `--rows 2|3|4` for roll-up depth, `--row N` (1..15) and
`--column N` (1..32) for the base position, `--channel CC1..CC4`.

### CLI: window placement and pen overrides for 708

```
open-cea --fps 30 vtt-to-cea-708 captions.vtt captions.mcc \
    --anchor-v 67 --anchor-h 105 --anchor-point 7 \
    --win-rows 2 --win-cols 32 \
    --service 1
```

Anchor coordinates are in CTA-708's max (75 x 210) authoring grid;
anchor point selects which of the nine reference positions on the
window the coordinate refers to.

### CLI: raw output for piping into other parsers

```
open-cea --fps 30 --output-format raw vtt-to-cea-708 captions.vtt out.bin
```

The output is a flat byte sequence of 3-byte `cc_data()` tuples
(`ccCountPerFrame * 3` bytes per frame).

### CLI: compile a multi-track JSON document

`captions.json`:

```json
{
  "tracks": [
    {
      "target": "608",
      "channel": "CC1",
      "style": "pop-on",
      "events": [
        { "startTimeSec": 1.0, "endTimeSec": 4.0, "text": "Primary line" }
      ]
    },
    {
      "target": "608",
      "channel": "CC3",
      "style": "pop-on",
      "events": [
        { "startTimeSec": 1.0, "endTimeSec": 4.0, "text": "Linea secundaria" }
      ]
    },
    {
      "target": "708",
      "service": 1,
      "windows": [
        { "id": 0, "anchorVertical": 67, "anchorHorizontal": 105,
          "anchorPoint": 7, "rowCount": 2, "columnCount": 32, "visible": true }
      ],
      "events": [
        { "startTimeSec": 1.0, "endTimeSec": 4.0, "text": "Primary line",
          "windowId": 0 }
      ]
    }
  ]
}
```

```
open-cea --fps 30 compile captions.json captions.mcc
```

All tracks fold into one `cc_data()` stream: F1 carries CC1, F2
carries CC3, and the DTVCC slots carry the 708 service.

### CLI: synthesize a verification stream (test patterns)

```
open-cea --fps 30 test-pattern timing.mcc --type timing --duration 60
```

Writes a 60-second stream that displays an updating `HH:MM:SS` once
per second; play it alongside any video to read the lag between the
rendered caption and picture timing.

```
open-cea --fps 30 test-pattern position.mcc --type position --duration 60
```

Cycles through the nine CTA-708 anchor reference positions
(top-left, top-center, ..., bottom-right) so a player's window
placement can be visually verified.

### Library: build a timeline programmatically

```ts
import { CaptionTimeline, compileTimeline } from 'open-cea';

const timeline = new CaptionTimeline();
timeline.defineWindow({
  id: 0,
  visible: true,
  rowCount: 2,
  columnCount: 32,
  anchorVertical: 67,
  anchorHorizontal: 105,
  anchorPoint: 7,
});
timeline.addEvent({
  startTimeSec: 1.0,
  endTimeSec: 4.0,
  text: 'Hello, world.',
  windowId: 0,
});

const ccData = compileTimeline(timeline, { fps: 30 });
// ccData is a Uint8Array of cc_data() tuples.
```

For 608, use `compileTimeline608` instead, with a `style` and
optional `channel`, `rollUpRows`, `row`, `column`.

### Library: emit MCC

```ts
import { CaptionTimeline, compileTimeline } from 'open-cea';
import { splitByFrame, formatMcc } from 'open-cea';

const timeline = new CaptionTimeline();
// ... define windows and events ...

const ccData = compileTimeline(timeline, { fps: 29.97 });
const frames = splitByFrame(ccData, 29.97);
const mcc = formatMcc(frames, { fps: 29.97 });
// mcc is a string ready to write to disk.
```

### Library: validate and compile a JSON document

```ts
import { validateCompileDocument, compileDocument } from 'open-cea';

const json = JSON.parse(input);
const doc = validateCompileDocument(json); // throws with a path-tagged error on failure
const ccData = compileDocument(doc, 30);
```

## Project layout

For everything else (architecture, design decisions, where the spec
digests live, when to consult them), see [AGENTS.md](AGENTS.md).
