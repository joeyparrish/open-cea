# Remaining work to complete the architecture plan

This plan covers everything that the architecture document still calls for
beyond what is already shipped: the libcaption removal, CLI parser
modernization, global `--fps` / `--output-format` flags, the MCC formatter,
the `compile` JSON-driven subcommand, and the `test-pattern` subcommand.

The order below is chosen so each step lands a small, independently useful
change without forcing a stop-the-world refactor.

## 0. Drop the libcaption test oracle

`libcaption` is unmaintained and has multiple encoding bugs we already
documented in `libcaption-bug-reports/`. We have spec-derived hand-curated
expectations for the tests that matter, and the planning model has already
shifted away from libcaption as the reference. Time to make the codebase
match.

Steps:

1. Migrate every test in `tests/golden/*.test.ts` off the `loadGolden`
   helper. Replace each `loadGolden(...)` call with an inline byte sequence
   derived directly from the spec, plus a comment citing the section /
   table the bytes come from. Where the existing golden file already
   matches the spec (e.g. control codes, tabs, mid-row, basic-NA pairs;
   per `project_libcaption_known_bugs.md`), the migration is a
   byte-for-byte copy of the file content into the test source. Where the
   golden was wrong (PACs, basic-NA-via-libcaption-API), the migrated
   expectation must come from the spec, not the file.
2. Remove `tests/golden/helpers.ts`'s `loadGolden` once no test references
   it. Keep `packBigEndian` and `expectBytesEqual` (they are
   spec-agnostic helpers).
3. Delete `libcaption-test-suite/` entirely. Drop the `build-lib.sh`,
   `Makefile`, vendored `libcaption/`, generator C++, and golden binary
   files.
4. Delete `libcaption-bug-reports/`. We're done with the oracle; the bug
   reports were written for upstream and have served their purpose. (If
   we want to keep them as a historical record, move them under a
   `docs/history/` directory instead. Default: delete.)
5. Update `README.md` if it references libcaption. (Today it does not.)
6. Update `MEMORY.md` to drop the
   `project_libcaption_known_bugs.md` entry, since the project no longer
   interacts with libcaption. Move that memory file into the same delete
   set, or rewrite it as a one-line "libcaption is no longer used"
   marker.

Verification: `npm test`, `npm run lint`, `npm run build` clean.

## 1. Adopt a real CLI argument parser

Today's hand-rolled `parseArgs` in `src/cli/runCli.ts` is fine for a few
flags but will fight us as `--output-format`, `--fps` (global),
`--type`, and the `compile` schema-validation subcommand pile on. Adopt
either `yargs` or `commander`.

Choose **commander**. Reasoning:

- Tighter API for nested subcommands, which we now have two of and will
  soon have four.
- Smaller (~25 KB minified vs yargs ~100+ KB) and zero deps.
- Generates `--help` output for free, which is currently absent.

(yargs is also fine; I'm picking commander for the size and the cleaner
subcommand surface. If preferences differ, swap freely; the rest of this
plan doesn't depend on which.)

Steps:

1. Add `commander` to dependencies.
2. Rewrite `runCli.ts` using `commander`'s `Command` API. Each subcommand
   gets its own `.command(...)` declaration with `.option(...)` calls
   and a `.action(...)` handler.
3. The existing `runCli(args, streams)` entry point stays — commander's
   `parse(args, { from: 'user' })` accepts an explicit args array, so
   tests don't need to change shape.
4. Confirm all 7 existing `cli.test.ts` cases still pass (smoke
   regression). Update error-message assertions to match commander's
   wording where they diverge.

Verification: tests, lint, build clean.

## 2. Promote `--fps` to a global option

The architecture doc has always described `--fps` as global. Today both
subcommands accept it locally and emit identical validation. With
commander in place, move it to a top-level option that subcommands
inherit.

Same change applies to `--output-format` once it exists; consolidating
`--fps` first is the lower-risk dry-run.

Steps:

1. Define `--fps` on the root `Command`. Mark it required.
2. Each subcommand reads it from the parent options.
3. Drop the per-subcommand `--fps` declarations.
4. Update the help text and the README's CLI examples.
5. Tests: `vtt-to-cea-708 --fps 30 in.vtt out.bin` should still work; so
   should `--fps 30 vtt-to-cea-708 in.vtt out.bin` (commander accepts
   the global flag in either position).

Verification: tests, lint, build clean.

## 3. MCC formatter and `--output-format mcc|raw`  [DONE]

Shipped: `src/formatter/timecode.ts`, `src/formatter/split.ts`,
`src/formatter/mcc.ts`, plus the `--output-format` global option in
`runCli.ts`. Default is `mcc`. Drop-frame timecode covers 29.97 and
59.94 fps; the seven `Time Code Rate=` strings match the set ffmpeg
accepts (`specs/mccdec.c`). v1 emits uncompressed hex; dictionary
compression is still out of scope.

This was the heaviest piece. MCC is the format FFmpeg natively ingests;
without it the project's primary intended workflow does not exist.

### Format reference

MCC v2.0 is documented in
`https://www.atsc.org/wp-content/uploads/2017/06/MacCaption-File-Format.pdf`
(MacCaption File Format, ATSC). The structure:

- Plain ASCII / UTF-8 header lines, including:
  - `File Format=MacCaption_MCC V2.0`
  - `Time Code Rate=<rate>` where `<rate>` is one of `24`, `25`, `30`,
    `30DF`, `50`, `60`, `60DF` — the `DF` variants signal SMPTE
    drop-frame for 29.97 / 59.94.
  - Various metadata fields (UUID, creation date, source, etc.) — most
    can be filled with sensible defaults; FFmpeg only requires the
    format / rate lines.
- One data line per frame:
  - `<HH:MM:SS:FF>\t<hex-payload>`
  - Frame counter follows drop-frame rules at 29.97 / 59.94.
  - Hex payload is the cc_data() bytes for that frame, base-16 encoded,
    optionally compressed via the MCC dictionary substitutions (single
    byte placeholders for common run-length patterns). v2.0 spec
    documents the substitution table.

### Drop-frame timecode math

29.97 fps and 59.94 fps use SMPTE drop-frame: drop two frame numbers
(or four at 59.94) at the start of every minute except every tenth
minute. Implement once in a small `formatter/timecode.ts` module:

```
frameToDropFrameTimecode(frameIdx, fps): "HH:MM:SS:FF"
```

Reference algorithm:
```
dropPerMinute = fps === 29.97 ? 2 : 4   // 59.94 drops 4
framesPer10Min = round(fps * 60 * 10) - 9 * dropPerMinute
framesPerMinute = round(fps * 60) - dropPerMinute
m10 = floor(frameIdx / framesPer10Min)
remainder = frameIdx % framesPer10Min
if remainder > dropPerMinute:
  frameIdx += 9 * dropPerMinute * m10
              + dropPerMinute * floor((remainder - dropPerMinute) / framesPerMinute)
else:
  frameIdx += 9 * dropPerMinute * m10
nominalFps = round(fps)
ff = frameIdx % nominalFps
ss = floor(frameIdx / nominalFps) % 60
mm = floor(frameIdx / (nominalFps * 60)) % 60
hh = floor(frameIdx / (nominalFps * 3600))
return formatted with ';' separator before ff for drop-frame, ':' otherwise
```

### Steps

1. `src/formatter/timecode.ts`: pure function returning the timecode
   string. Tests cover 30 (no drop), 29.97 (drop-frame at minute
   boundaries), 25, 24, 50, 60, 59.94.
2. `src/formatter/mcc.ts`: takes the per-frame `Uint8Array[]` from the
   compiler (currently flattened too aggressively — see step 3a) plus
   `{ fps, ... }`, and emits an MCC v2.0 string. Includes:
   - Header block with required fields and sane defaults.
   - One data line per frame using the timecode helper.
   - Hex-encoded payload. v1: no dictionary substitution (FFmpeg
     accepts plain hex). v2 (later): add common substitutions.
3. **Compiler return shape.** Today `compileTimeline` and
   `compileTimeline608` return a flat `Uint8Array` of cc_data tuples.
   The MCC formatter needs per-frame payloads to write per-frame
   timecodes. Two options:
   a. Add a parallel return type that yields `Uint8Array[]` (one entry
      per frame). Existing raw formatter ignores the structure.
   b. Reshape after the fact: split the flat output into
      `ccCountPerFrame * 3`-byte chunks. This works because the encoder
      emits a fixed-size frame.
   Pick (b). It avoids changing the compiler API and the chunk size is
   already deterministic from `fps`. Add a `splitByFrame(bytes, fps)`
   helper.
4. `--output-format mcc|raw` global flag. Default `mcc`, since the
   architecture doc says MCC is the primary path. The CLI dispatches to
   the right formatter based on the flag.
5. Tests for the MCC formatter:
   - Header has `File Format=MacCaption_MCC V2.0` and the right
     `Time Code Rate=` for each fps.
   - Data line count equals the frame count.
   - Each data line starts with a valid timecode, then a tab, then hex
     digits whose byte length equals `ccCountPerFrame * 3`.
   - Drop-frame timecodes drop the right frame numbers at minute
     boundaries (regression on the timecode helper).
6. End-to-end smoke test: round-trip a small VTT through `vtt-to-cea-708
   --output-format mcc` and verify the output begins with
   `File Format=MacCaption_MCC V2.0`.

Out of scope for v1: MCC dictionary compression. FFmpeg parses
uncompressed hex correctly; compression is a size optimization, not a
correctness one.

Verification after each step: tests, lint, build clean.

## 4. `compile` subcommand: JSON-driven generation

This unblocks every advanced workflow: multi-channel composition,
per-cue window/pen overrides, CEA-608 + CEA-708 in one stream, etc.

### JSON shape

Match the existing `CaptionTimeline` declarative API directly. Rough
shape:

```json
{
  "fps": 30,
  "outputFormat": "mcc",
  "tracks": [
    {
      "target": "708",
      "service": 1,
      "windows": [{ "id": 0, "anchorVertical": 14, ... }],
      "events": [{ "startTimeSec": 1.0, "endTimeSec": 3.0,
                   "text": "Hello", "windowId": 0 }]
    },
    {
      "target": "608",
      "channel": "CC1",
      "style": "pop-on",
      "events": [...]
    }
  ]
}
```

A track is one source-of-bytes for the encoder. Multi-channel
composition (CC1 + CC3) becomes "two 608 tracks with different
channels". 608 + 708 in one stream becomes "one 608 track + one 708
track"; the CLI builds a single shared encoder and routes each track's
output to the right buffer.

### Steps

1. Define a TypeScript type `CompileDocument` for the input shape.
2. Add JSON Schema generation. Use `typescript-json-schema` or write
   the schema by hand — the shape is small. Validate input with `ajv`
   before processing; surface validation errors with line numbers.
3. Extract the shared encoder loop currently inlined in
   `compileTimeline` / `compileTimeline608` into a small orchestrator
   that takes an array of action streams (one per track) and a shared
   `Encoder`. Each existing single-target compiler delegates to it.
4. The `compile` subcommand parses the JSON, validates it, builds the
   per-track action lists, runs the orchestrator, and feeds the result
   through the chosen formatter.
5. Tests:
   - Valid documents produce non-empty output.
   - Each schema "must" / "required" field is rejected when missing.
   - Multi-channel: CC1 + CC3 in one document produces output where F1
     entries match a CC1-only run and F2 entries match a CC3-only run.
   - 608 + 708 mixed: F1/F2 carry the 608 stream, DTVCC slots carry the
     708 CCPs.

Verification: tests, lint, build.

## 5. `test-pattern` subcommand

Long-running synthesized vectors for player verification. Two types:

- `--type position`: emit text labels at varied screen coordinates so a
  human watching playback can confirm the player honors positioning.
  Cycle through a grid of (anchor-v, anchor-h, anchor-point) over the
  video duration; label each frame with its coords ("v=14 h=104 ap=7").
- `--type timing`: emit a continuously updating timestamp string
  ("00:00:01.234") so the operator can see by how much the rendered
  caption lags the picture. Update once per second.

Both modes accept `--duration <seconds>` (default 60) and the same
`--target 608|708` distinction other subcommands use.

### Steps

1. `src/test-patterns/position.ts`: builds a `CaptionTimeline` with the
   right cues; reuses the existing 608 / 708 compilers.
2. `src/test-patterns/timing.ts`: same shape, time-driven.
3. `test-pattern` subcommand wires it together.
4. Snapshot tests: 5 seconds of each pattern at 30 fps; assert the
   first / last data lines look right.

Verification: tests, lint, build.

## Order of work and dependencies

```
0. libcaption removal       (independent, ship first)
1. commander adoption       (depends on 0 only because 0 is small;
                             technically independent)
2. global --fps              (depends on 1)
3. MCC + --output-format     (depends on 1; 2 not strictly required
                             but easier after)
4. compile subcommand        (depends on 1, 3 — needs the formatter
                             and the parser surface area)
5. test-pattern              (depends on 1; could ship before 4)
```

Each step's commits should land separately so the history is
reviewable.

## Verification rule (carry-over)

After every step: `npm test`, `npm run lint`, `npm run build` all
clean. No skipped tests, no `any` casts, no TODO comments left in the
diff.
