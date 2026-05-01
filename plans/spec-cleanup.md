# Spec compliance cleanup

A line-by-line review of `src/` against `specs/608.md` (CTA-608-E) and
`specs/708.md` (CTA-708-E). Items are grouped by severity. "Out of scope"
items (text mode, XDS, MCC, multi-CCP splitting) are noted at the bottom
but are tracked separately in `remaining-features.md`; they are not
deviations from what the code claims to do today.

## High-impact deviations

### 1. Pop-on multi-cue bursts omit RCL on every cue after the first

`src/compiler608.ts` `buildCueWords` emits `begin()` (which is RCL for
`PopOnBuilder`) only when `isFirstCue` is true. Every subsequent cue
sends `ENM + PAC + text + EOC` with no RCL.

Per CTA-608-E §9.2 and §11 ("each new caption as a self-contained
burst"), each pop-on caption should start with RCL so a tune-in /
channel-changer / mid-stream decoder reset acquires the correct mode. It
is true that EOC forces pop-on (§5.5), so once one EOC has been
processed the service is sticky in pop-on. But the spec's authoring
pattern is normative for service-provider behavior, not just
decoder-internal state, and a downstream encoder that interleaves with
roll-up content on another channel would then leave this stream's
decoder in the wrong mode at acquire.

Fix: emit RCL at the head of every pop-on cue, not just the first.

### 2. Roll-up cues after the first do not re-issue a PAC

Same file, same function. For roll-up the code does:

```
isFirstCue: RUx + PAC(row, col=0)
each cue: text...                  (paint-on case sends CR before; roll-up sends CR before)
```

For roll-up, only the first cue ever sends a PAC. Subsequent cues send
CR + text. Per §5.7 a CR with no PAC drops the cursor at column 1 of the
base row, so this is *correct as long as the user wants column 1*. But
`Compiler608Options.column` is honored only for the first cue.

There are two reasonable fixes:

- Document that `column` is the indent for the first row only, since
  roll-up authoring conventionally starts each row at column 1; or
- Re-issue the PAC + (optional Tab Offset) on every cue so the base
  column is honored throughout.

CTA-608-E §9.3's recommended pattern (`RU + CR + PAC + text` per row)
matches the second option. Prefer that.

### 3. Roll-up first cue duplicates the PAC

In the same code path, the first roll-up cue currently emits:

```
RUx
PAC(row, 0)         <-- from the isFirstCue branch
text...             <-- text() does not include a PAC
```

But there is no `PAC(row, column)` emitted for the requested column
because the roll-up branch of the per-cue switch does *only* `text`. So
when `column != 0`, the configured column is silently dropped even on
the first cue. Fix together with item 2.

### 4. CEA-708 `encodeServiceBlock` produces an undecodable block for `serviceNumber == 7, data.length == 0`

`src/cea708/service.ts` always emits the 2-byte extended header when
`serviceNumber > 6`. But CTA-708-E §6.2 (Table 10) gates the second
header byte on `block_size != 0`: with `service_number == 7` and
`block_size == 0`, only the 1-byte standard header is present. A
decoder reading `0xE0 0x07 ...` would parse `0xE0` as
"service 7 / block_size 0" with no extended header, then try to parse
`0x07` as the next service block header.

This is not exercised by the current compiler (which never sends empty
service blocks), but the helper is exported and the bug is latent.

Fix: in `encodeServiceBlock`, treat `serviceNumber == 7 && data.length == 0`
either as an error or as a 1-byte `0xE0` block (matching the spec
encoding when the extended header is absent).

### 5. CEA-708 compiler does not enforce that the current window is defined before SetCurrentWindow

`src/compiler.ts` `buildRenderPayload` only emits `defineWindow` when
the timeline has a matching window definition. If a `CaptionEvent`
references a `windowId` that the timeline does not define, the compiler
emits `setCurrentWindow(winId)` to an undefined window, followed by
text. CTA-708-E §7.1 ("The window must already have been defined ...
for it to be addressable") forbids this; decoder behavior is undefined.

Fix: throw at compile time when an event references a window the
timeline has not defined, or auto-define a sensible default.

## Medium-impact deviations

### 6. WebVTT multi-line cues are joined with a space, not CR

`src/parser/vtt.ts` does `textLines.join(' ')`. CTA-708-E forces
wordwrap to 0, so multi-line VTT cues need an explicit
`controlCode708(ControlCode708.CarriageReturn)` to span rows. Today the
two lines collapse onto one row (which may also overflow the configured
column count and trigger §6.4's "characters at the end of a row are
either replaced or discarded" branch).

Fix: split the joined text on the original line break and inject CR
between segments. Make sure the row count of the default window is
large enough to hold the cue's line count.

### 7. CEA-708 compiler does not bound writes against the 128-byte Service Input Buffer

CTA-708-E §6.8 / §9.1 mandates a Service Input Buffer of at least 128
bytes; encoders are expected to deliver bursts that fit. `compiler.ts`
checks `ccpPayloadLen > 127` (the CCP cap) but does not track the
service-side buffer. A long event whose rendered payload is, say, 120
bytes inside a single CCP plus a follow-up burst before the decoder
drains will overflow the service buffer and trigger a service reset.

Fix: keep a running estimate of in-flight unread bytes per service and
either insert delay or reject events that would exceed 128 bytes.

### 8. `dtvccPadding()` always uses cc_type=10; spec also allows cc_type=11

`src/cea708/transport.ts` always emits cc_type=10 padding. CTA-708-E
§2.2 / §2.3 lets padding be either `cc_type=10, cc_valid=0` or
`cc_type=11, cc_valid=0`. The current choice is conformant, just
inflexible. Mention only because some downstream tooling complains
about runs of identical padding patterns; not a correctness fix.

### 9. CEA-608 datastream rate at 50 fps is 50/s/field, below the 60/1.001 line-21 rate

`src/encoder.ts` `leading608Count` returns 2 entries (1 F1 + 1 F2) at
50 fps, yielding 50 byte-pairs/s/field. CTA-608-E line-21 mandates
60/1.001 ≈ 59.94 byte-pairs/s/field. At 25/30 fps the code emits 4
entries per frame (2/field × 25 = 50/s/field at 25 fps as well, same
issue).

This only matters when the produced stream is decoded back onto an
NTSC line-21 signal. PAL-rate frame counts do not naturally line up
with the NTSC field rate. Acceptable if the project explicitly excludes
PAL-rate NTSC re-emission; document that constraint in
`remaining-features.md` if so.

### 10. `cea608/charmap.ts` documentation references libcaption ordering

The header comment in `src/cea608/charmap.ts` still describes the
charmap as adopted from libcaption's flattened layout for cross-checking
"against libcaption's `eia608_from_utf8_1` golden vectors." The
libcaption oracle is gone (per `remaining-features.md` step 0). Update
the comment so it reads as a self-contained spec citation, not a
historical justification.

## Low-impact / cosmetic

### 11. Extended-character fallbacks for `^`, `_`, `|`, `~`, `{`, `}`, `\`

`src/cea608/string.ts` `EXTENDED_FALLBACKS` substitutes Basic-NA bytes
that, on a legacy decoder, would render as accented glyphs (because
0x5C, 0x5E, 0x5F, 0x60, 0x7B-0x7E are reassigned in CTA-608-E §4.1).
The current choices (e.g. `|` → `!`, `~` → `-`) are reasonable
approximations. Document the rationale for each visibly weird mapping
so future readers don't try to "fix" them by sending the literal byte.
The existing comment explains the principle but not the per-glyph
choice.

### 12. CEA-708 G2 0x21 NBTSP maps to U+2060 (Word Joiner)

`src/cea708/text.ts` G2_MAP uses `⁠` (WORD JOINER) for NBTSP. The
spec digest equates NBTSP with TSP since wordwrap is forced off, and
WORD JOINER is invisible on render — fine in practice. But it is
ambiguous to readers; consider U+00A0 (NO-BREAK SPACE) which round-trips
better with text editors.

### 13. CEA-708 box-drawing G2 chars use light-line glyphs in `cea608/glyphs.ts`

`src/cea608/glyphs.ts` uses `┌┐└┘` for charmap indices 172-175 (CTA-608
Table 10 0x3C..0x3F corner pieces). The spec digest writes them as
`⎡⎤⎣⎦` (squarish bracket-corners). Encoded byte values are correct;
only the on-disk Unicode rendering choice differs. No change needed
unless a reverse-decoder consumer cares.

### 14. `compiler.ts` always sets `visible: true` on the defined window

The pop-on authoring pattern in CTA-708-E §9.3 uses two windows
(define-hidden, fill text, then TGW to swap). The current code defines
a single visible window and writes text into it directly, which renders
more like paint-on. This is a design choice, not a violation, but it
means the `visible` flag on `Window` is effectively ignored for
end-user pop-on workflows. Either:

- Document that the 708 path is paint-on-style by default; or
- Implement true pop-on using two windows + TGW for events whose
  `visible` flag is intentionally false at definition time.

## Out of scope (tracked elsewhere)

- CEA-608 Text Mode (T1..T4), URL transport on T2, XDS (§7, §8): not
  implemented and not claimed by the architecture doc.
- CEA-708 C2/C3/G3 extended code spaces beyond the cc-logo: not
  implemented and not claimed.
- Multi-CCP splitting at element boundaries: stated TODO in
  `compiler.ts`; tracked under `remaining-features.md`.
- MCC formatter, drop-frame timecode, `compile` and `test-pattern`
  subcommands: tracked as steps 3-5 of `remaining-features.md`.
- True pop-on via two-window TGW (item 14 above) belongs with the
  `compile` subcommand work since it requires multi-window timeline
  semantics.
