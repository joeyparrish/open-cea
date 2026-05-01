# VTT CLI: separate `vtt-to-cea-608` and `vtt-to-cea-708` subcommands

## Goal

Replace today's single `vtt-to-cea` (which is 708-only and has no positioning
knobs) with two scoped subcommands so each target has its own flag namespace
without runtime "flag X is incompatible with flag Y" validation.

This delivers the CEA-608 path promised by `open-cea-architecture.md` §3:

> `vtt-to-cea`: ... Flags will allow selecting the target CEA-608 style
> (`--style pop-on|paint-on|roll-up`).

It also gives the existing 708 path the window/positioning knobs it has been
missing.

The architecture document still references a single `vtt-to-cea` command;
treat the split into `-608` / `-708` as a refinement of that. The
architecture document should be updated in the same change set.

## Why two subcommands

The 608 and 708 flag namespaces are disjoint:

- 708-only: `--anchor-v`, `--anchor-h`, `--anchor-point`, `--win-rows`,
  `--win-cols`, `--service`.
- 608-only: `--style`, `--rows` (roll-up row count), `--row`, `--column`,
  `--channel`.

Trying to share one command would mean runtime validation of incompatible
combinations and a confusing help screen. Separate subcommands give clean
help output, no cross-target validation, and a natural place for each path's
defaults. Per-cue control beyond what these flags expose remains the job of
the planned `compile` subcommand (JSON-driven), which is out of scope here.

## `vtt-to-cea-708`

Drives the existing `compileTimeline` (708 path).

```
vtt-to-cea-708 <input.vtt> <output.bin> --fps <rate>
               [--anchor-v N] [--anchor-h N] [--anchor-point N]
               [--win-rows N] [--win-cols N]
               [--service N]
```

Flags:

- `--fps <rate>` — required. Same valid set as today (24, 25, 29.97, 30, 50,
  59.94, 60).
- `--anchor-v` — vertical anchor coordinate, 0–99. Default 14 (near-bottom).
- `--anchor-h` — horizontal anchor coordinate, 0–209 (16:9) or 0–159 (4:3).
  Default centered for the chosen aspect: 104 (16:9 default).
- `--anchor-point` — 0..8, which corner/edge of the window the anchor coords
  refer to. Default 7 (bottom-center) so the window grows up from the
  anchor.
- `--win-rows` — window row count, 1–15. Default 2 (typical caption strip).
- `--win-cols` — window column count, 1–42 (4:3) / 1–32 (16:9). Default 32.
- `--service` — DTVCC service number, 1–63. Default 1.

These become the document-wide defaults applied at parse time when
`parseVtt` builds the default window. Plumb via a window-template parameter
on `parseVtt` so the function stays pure.

## `vtt-to-cea-608`

Drives a new `compileTimeline608` (CEA-608 path).

```
vtt-to-cea-608 <input.vtt> <output.bin> --fps <rate>
               --style pop-on|paint-on|roll-up
               [--rows 2|3|4]
               [--row N] [--column N]
               [--channel CC1|CC2|CC3|CC4]
```

Flags:

- `--fps <rate>` — required, same set as 708.
- `--style` — required. Selects the CEA-608 caption mode.
- `--rows` — roll-up row count (RU2 / RU3 / RU4). Default 3. Error if used
  with non-roll-up styles.
- `--row` — base row, 1–15. Default 15 (bottom).
- `--column` — base column, 1–32. Default 1.
- `--channel` — CC1, CC2, CC3, or CC4. Default CC1. CC1/CC2 share Field 1;
  CC3/CC4 share Field 2.

## Why 608 modes do not exist in 708

Pop-on / paint-on / roll-up are CEA-608 concepts. CEA-708 is window-based
and composes equivalents from window and pen attributes (hidden window +
DisplayWindows ≈ pop-on; visible window written-into ≈ paint-on; window
with `scrollDirection` ≈ roll-up). So `--style` only appears on the 608
subcommand.

## Roll-up row count (rationale)

Roll-up keeps a window of N visible rows at a fixed base row; each
carriage-return scrolls contents up one row, with new text on the bottom.

- RU2: tightest screen footprint; standard for live news where the priority
  is "show the most recent line ASAP, don't block the picture".
- RU3: historical compromise; gives slow readers an extra line of context
  without much extra screen impact. **Default for this CLI.**
- RU4: most context, biggest footprint, rarer.

## New compiler: `src/compiler608.ts`

```
compileTimeline608(timeline, options): Uint8Array
```

Options:

- `fps: FrameRate` — required.
- `channel: 'CC1' | 'CC2' | 'CC3' | 'CC4'` — default `'CC1'`. Routes
  builder output to `encoder.push608F1()` (CC1/CC2) or `push608F2()`
  (CC3/CC4).
- `style: 'pop-on' | 'paint-on' | 'roll-up'` — required.
- `rollUpRows: 2 | 3 | 4` — default `3`. Only meaningful when
  `style === 'roll-up'`.
- `row: number` — default `15`.
- `column: number` — default `1`.

Per-event flow:

1. Construct the appropriate `CaptionBuilder` subclass for `style`.
2. Feed cue text through the builder, including PAC for `(row, column)` and
   the necessary mode-control codes (RUx for roll-up, RCL for pop-on, RDC
   for paint-on).
3. Take the resulting `CcWord[]` (already with §9.1 control-pair doubling
   via `doubleControls`) and queue it at `event.startTimeSec` into F1 or F2.
4. At `event.endTimeSec`, queue an EraseDisplayedMemory (EDM) on the same
   channel.

The encoder already drains F1/F2 at the spec-mandated rate (60/1.001
pairs/s/field for NTSC, etc.). At the start-time frame, push the entire
CcWord[] into the queue; the encoder emits it across subsequent frames at
the per-frame pair rate. For typical cue lengths the queue drains well
before endTimeSec.

If a cue's word count exceeds `(endTimeSec - startTimeSec) * pairs/sec`,
throw a clear error naming the cue. Loud failure beats silent late display.

## Multi-channel composition (forward look, not now)

The user wants to be able to put language A in CC1 and language B in CC3.
The single-CLI-invocation surface above only supports one channel per run.
The right path forward is either:

- Run the CLI twice (once per channel) and a third tool muxes the two raw
  outputs by interleaving F1 and F2 byte-pairs frame-by-frame. Out of
  scope.
- Extend `compileTimeline608` to take multiple `(timeline, channel, style,
  ...)` triples in one call, behind a JSON config used by the planned
  `compile` subcommand.

Today's plan: keep `compileTimeline608` writing to a single channel and
build its own encoder. Defer a shared-encoder variant until the
multi-channel CLI surface is being designed.

## Tests

### Unit tests for `compileTimeline608`

- **Style routing.** For each style, compile a fixture cue and assert the
  first non-PAC control word in the F1 stream is RCL (pop-on) / RDC
  (paint-on) / RU3 (roll-up default).
- **Roll-up row count.** With `rollUpRows: 2` / `3` / `4`, assert the
  emitted control word is `0x1425` / `0x1426` / `0x1427` (CC1) respectively;
  CC2 variant uses the §9 channel bit flip.
- **Channel routing.** Compile with `channel: 'CC2'` and assert words appear
  in F1 cc_data tuples (cc_type=0) with the CC2 channel bit set, not in F2.
  Compile with `channel: 'CC3'` and assert words appear in F2 tuples
  (cc_type=1).
- **Erase at end.** Cue with explicit endTimeSec produces an EDM word on
  the channel at the endTimeSec frame.
- **Pair-doubling preserved end-to-end.** Confirm consecutive identical
  control words appear in successive cc_data tuples; verify the natural
  drain pattern still satisfies §9.1.
- **Overflow.** Cue whose word count exceeds the available pair budget
  between start and end throws with the cue's text in the message.

### CLI smoke tests

- `vtt-to-cea-708` with no positioning flags produces output identical to
  today's `vtt-to-cea` (regression guard for the rename).
- `vtt-to-cea-708 --anchor-v 50 --win-rows 4` produces output that differs
  from the default in the DefineWindow command bytes.
- `vtt-to-cea-608 --style pop-on` produces non-empty output starting with
  valid cc_data tuples; first F1 control word is RCL.
- `vtt-to-cea-608 --style roll-up --rows 2` first F1 control word is RU2.
- `vtt-to-cea-608 --style pop-on --rows 4` errors with a message naming the
  flag conflict.

## Out of scope

- Multi-channel-per-run (CC1+CC3 in one CLI invocation). Designed for, not
  implemented.
- 608 mid-row color/italic attributes. Builder supports them, but VTT
  styling is dropped at parse time; no plumbing needed today.
- 608 special / extended characters beyond what `encodeString` already
  produces (already correct).
- Per-cue 708 window overrides from VTT cue settings. Today the entire VTT
  document shares one default window; per-cue control belongs in the
  planned `compile` subcommand.

## Order of work

1. **Rename existing CLI command** `vtt-to-cea` → `vtt-to-cea-708`. Keep
   behavior identical at first; verify with the regression smoke test.
2. **Add 708 positioning flags** to `vtt-to-cea-708`. Plumb through to
   `parseVtt` so the default window honors them.
3. **Build `src/compiler608.ts`** with `compileTimeline608` and full unit
   tests.
4. **Add `vtt-to-cea-608` subcommand** that dispatches to the new compiler;
   include CLI smoke tests.
5. **Re-export** `compileTimeline608` from `src/index.ts`.
6. **Update `plans/open-cea-architecture.md`** to document the split into
   two subcommands.

## Verification

After each step: `npm test`, `npm run lint`, `npm run build` all clean.
