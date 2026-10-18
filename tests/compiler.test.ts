// Copyright 2026 Joey Parrish
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { describe, expect, it } from 'vitest';
import { CaptionTimeline, type Pen, type Window } from '../src/timeline.js';
import { buildTimelineActions708, compileTimeline } from '../src/compiler.js';
import { BorderType, Justify, Opacity } from '../src/cea708/types.js';

describe('compileTimeline', () => {
  it('compiles a simple timeline to cc_data tuples', () => {
    const timeline = new CaptionTimeline();
    timeline.defineWindow({
      id: 0,
      visible: true,
      rowCount: 2,
      columnCount: 32,
    });
    
    timeline.addEvent({
      startTimeSec: 0.1,
      endTimeSec: 2.1,
      text: 'Hello World',
      windowId: 0,
    });

    // 30 fps -> 20 cc_data tuples per frame (60 bytes/frame).
    // Latest action is the HideWindows at endTimeSec=2.1s, plus 1s of
    // trailing drain. Total = ceil(2.1 * 30) + 30 = 63 + 30 = 93 frames.
    const out = compileTimeline(timeline, { fps: 30 });
    
    expect(out.length).toBe(93 * 60);
    
    // We should have valid DTVCC start packets in the stream.
    // DTVCC_START is type 3, so first byte of tuple is 0xFF (if valid).
    let foundStart = false;
    for (let i = 0; i < out.length; i += 3) {
      if (out[i] === 0xFF) {
        foundStart = true;
        break;
      }
    }
    expect(foundStart).toBe(true);
  });

  it('throws when bursts overflow the 128-byte Service Input Buffer', () => {
    const timeline = new CaptionTimeline();
    timeline.defineWindow({ id: 0, visible: true, rowCount: 4, columnCount: 32 });
    // Two long cues at the same instant produce well over 128 bytes of
    // pending data with no time to drain.
    const longText = 'x'.repeat(60);
    timeline.addEvent({ startTimeSec: 0, endTimeSec: 1, text: longText, windowId: 0 });
    timeline.addEvent({ startTimeSec: 0, endTimeSec: 1, text: longText, windowId: 0 });
    expect(() => compileTimeline(timeline, { fps: 30 })).toThrow(/input buffer/);
  });

  it('throws when a cue references an undefined window', () => {
    const timeline = new CaptionTimeline();
    timeline.addEvent({
      startTimeSec: 0,
      endTimeSec: 1,
      text: 'Orphan',
      windowId: 3,
    });
    expect(() => compileTimeline(timeline, { fps: 30 })).toThrow(/undefined window/);
  });
});

// Expected bytes below are packed by hand from the CTA-708-E command
// layouts (DefineWindow section 8.10.5.2, SetWindowAttributes 8.10.5.8,
// SetPenAttributes 8.10.5.9, SetPenColor 8.10.5.10) and the predefined
// window / pen styles (Tables 26 and 27), not produced by the encoders
// under test.

// DF0: opcode 0x98; p1 = visible | row lock | column lock = 0x38;
// p2 = absolute, anchor V 0; p3 = anchor H 0; p4 = anchor point 0,
// 15 rows (14); p5 = 32 columns (31); p6 = window style << 3 | pen style.
function df0(windowStyle: number, penStyle: number): number[] {
  return [0x98, 0x38, 0x00, 0x00, 0x0E, 0x1F, (windowStyle << 3) | penStyle];
}
const CW0 = [0x80];
const TEXT_HI = [0x48, 0x69];
const DSW0 = [0x89, 0x01];
// SPA / SPC that reload pen style 1: STANDARD, NORMAL, Dialog, font 0,
// no edge; white (2,2,2) solid on black solid.
const SPA_STYLE_1 = [0x90, 0x05, 0x00];
const SPC_STYLE_1 = [0x91, 0x2A, 0x00, 0x00];

describe('buildTimelineActions708 - emitted 708 commands', () => {
  // Payload of each render action (not HideWindows), minus the 1-byte
  // service block header; every payload here fits one service block.
  function renders(timeline: CaptionTimeline): number[][] {
    const out: number[][] = [];
    for (const a of buildTimelineActions708(timeline, { fps: 30 })) {
      if (a.kind !== '708') throw new Error('expected a 708 action');
      const body = Array.from(a.payload.subarray(1));
      if (body[0] !== 0x8A) out.push(body); // skip HideWindows
    }
    return out;
  }

  function single(window: Window, pen?: Pen): number[] {
    const t = new CaptionTimeline();
    t.defineWindow(window);
    t.addEvent({ startTimeSec: 0, text: 'Hi', pen });
    return renders(t)[0];
  }

  it('emits no SetWindowAttributes, SetPenAttributes or SetPenColor when nothing is set', () => {
    expect(single({ id: 0 })).toEqual([...df0(1, 1), ...CW0, ...TEXT_HI, ...DSW0]);
  });

  it('emits SetWindowAttributes after SetCurrentWindow, unset fields from window style 1', () => {
    // fill red (3,0,0) TRANSLUCENT -> 10 11 00 00; border NONE black;
    // p3 = print L->R (0) | scroll B->T (3) | justify CENTER (2) = 0x0E;
    // p4 = speed 1 | effect dir 0 | SNAP = 0x10.
    expect(single({
      id: 0,
      justify: Justify.Center,
      fillColor: { r: 3, g: 0, b: 0 },
      fillOpacity: Opacity.Translucent,
    })).toEqual([
      ...df0(1, 1), ...CW0, 0x97, 0xB0, 0x00, 0x0E, 0x10, ...TEXT_HI, ...DSW0,
    ]);
  });

  it('keeps window style 2 transparent fill when only justify is set', () => {
    // Style 2: fill TRANSPARENT -> p1 = 11 000000 = 0xC0.
    expect(single({ id: 0, windowStyleId: 2, justify: Justify.Center })).toEqual([
      ...df0(2, 1), ...CW0, 0x97, 0xC0, 0x00, 0x0E, 0x10, ...TEXT_HI, ...DSW0,
    ]);
  });

  it('keeps window style 3 centre justification when only fill is set', () => {
    // Style 3: justify CENTER -> p3 = 0x0E; fill blue (0,0,2) solid = 0x02.
    expect(single({ id: 0, windowStyleId: 3, fillColor: { r: 0, g: 0, b: 2 } })).toEqual([
      ...df0(3, 1), ...CW0, 0x97, 0x02, 0x00, 0x0E, 0x10, ...TEXT_HI, ...DSW0,
    ]);
  });

  it('keeps window style 7 ticker directions when only the border is set', () => {
    // Style 7: print T->B (2), scroll R->L (1) -> p3 = 0010 0100 = 0x24.
    // Border RAISED (1) green (0,2,0) -> p2 = 01 00 10 00 = 0x48.
    expect(single({
      id: 0,
      windowStyleId: 7,
      borderType: BorderType.Raised,
      borderColor: { r: 0, g: 2, b: 0 },
    })).toEqual([
      ...df0(7, 1), ...CW0, 0x97, 0x00, 0x48, 0x24, 0x10, ...TEXT_HI, ...DSW0,
    ]);
  });

  it('treats window style 0 as style 1 for unset fields', () => {
    // Style 0 on creation selects style 1; fill FLASH -> p1 = 0x40.
    expect(single({ id: 0, windowStyleId: 0, fillOpacity: Opacity.Flash })).toEqual([
      ...df0(0, 1), ...CW0, 0x97, 0x40, 0x00, 0x0C, 0x10, ...TEXT_HI, ...DSW0,
    ]);
  });

  it('emits only SetPenColor for a colour-only pen, unset fields from pen style 1', () => {
    // fg yellow (3,3,0) solid -> 0x3C; bg black TRANSPARENT -> 0xC0.
    expect(single({ id: 0 }, {
      foregroundColor: { r: 3, g: 3, b: 0 },
      backgroundOpacity: Opacity.Transparent,
    })).toEqual([...df0(1, 1), ...CW0, 0x91, 0x3C, 0xC0, 0x00, ...TEXT_HI, ...DSW0]);
  });

  it('keeps pen style 6 transparent background when only the foreground is set', () => {
    // Style 6: bg TRANSPARENT -> 0xC0; fg red (2,0,0) solid -> 0x20.
    // No SPA, so the style's font 3 and UNIFORM edge are untouched.
    expect(single({ id: 0, penStyleId: 6 }, { foregroundColor: { r: 2, g: 0, b: 0 } })).toEqual([
      ...df0(1, 6), ...CW0, 0x91, 0x20, 0xC0, 0x00, ...TEXT_HI, ...DSW0,
    ]);
  });

  it('keeps pen style 5 font when only the text tag is set', () => {
    // p1 = tag 1 | NORMAL (1) | STANDARD (1) = 0001 01 01 = 0x15;
    // p2 = no italic / underline, edge NONE, font 4 = 0x04.
    expect(single({ id: 0, penStyleId: 5 }, { textTag: 1 })).toEqual([
      ...df0(1, 5), ...CW0, 0x90, 0x15, 0x04, ...TEXT_HI, ...DSW0,
    ]);
  });

  it('keeps pen style 7 font and UNIFORM edge when only italics is set', () => {
    // p2 = italic (1) | underline 0 | edge UNIFORM (3) | font 4 = 1001 1100.
    expect(single({ id: 0, penStyleId: 7 }, { italics: true })).toEqual([
      ...df0(1, 7), ...CW0, 0x90, 0x05, 0x9C, ...TEXT_HI, ...DSW0,
    ]);
  });

  it('carries text tag 15 through SetPenAttributes', () => {
    expect(single({ id: 0 }, { textTag: 15 })).toEqual([
      ...df0(1, 1), ...CW0, 0x90, 0xF5, 0x00, ...TEXT_HI, ...DSW0,
    ]);
  });

  it('carries windowStyleId, penStyleId and relativePositioning into DefineWindow', () => {
    // p2 = relative (0x80) | anchor V 50 (0x32) = 0xB2; p6 = 3 << 3 | 2.
    expect(single({
      id: 0, windowStyleId: 3, penStyleId: 2, relativePositioning: true, anchorVertical: 50,
    })).toEqual([
      0x98, 0x38, 0xB2, 0x00, 0x0E, 0x1F, 0x1A, ...CW0, ...TEXT_HI, ...DSW0,
    ]);
  });

  it('restores the style pen colour on the next event in the window', () => {
    // The per-event DefineWindow is identical, so a decoder treats it as
    // a no-op and keeps the previous event's pen (CTA-708-E section
    // 8.10.5.2); the compiler must reload pen style 1 explicitly, once.
    const t = new CaptionTimeline();
    t.defineWindow({ id: 0 });
    t.addEvent({ startTimeSec: 0, endTimeSec: 1, text: 'Hi', pen: { foregroundColor: { r: 3, g: 3, b: 0 } } });
    t.addEvent({ startTimeSec: 2, endTimeSec: 3, text: 'Hi' });
    t.addEvent({ startTimeSec: 4, text: 'Hi' });
    expect(renders(t)).toEqual([
      [...df0(1, 1), ...CW0, 0x91, 0x3C, 0x00, 0x00, ...TEXT_HI, ...DSW0],
      [...df0(1, 1), ...CW0, ...SPC_STYLE_1, ...TEXT_HI, ...DSW0],
      [...df0(1, 1), ...CW0, ...TEXT_HI, ...DSW0],
    ]);
  });

  it('restores the style pen attributes when the next event sets only colour', () => {
    const t = new CaptionTimeline();
    t.defineWindow({ id: 0 });
    t.addEvent({ startTimeSec: 0, endTimeSec: 1, text: 'Hi', pen: { italics: true } });
    t.addEvent({ startTimeSec: 2, text: 'Hi', pen: { foregroundColor: { r: 3, g: 3, b: 0 } } });
    expect(renders(t)).toEqual([
      [...df0(1, 1), ...CW0, 0x90, 0x05, 0x80, ...TEXT_HI, ...DSW0],
      [...df0(1, 1), ...CW0, ...SPA_STYLE_1, 0x91, 0x3C, 0x00, 0x00, ...TEXT_HI, ...DSW0],
    ]);
  });

  it('repeats a set pen on every event so a viewer who tunes in late gets it', () => {
    const t = new CaptionTimeline();
    t.defineWindow({ id: 0 });
    const pen = { foregroundColor: { r: 3, g: 3, b: 0 } };
    t.addEvent({ startTimeSec: 0, endTimeSec: 1, text: 'Hi', pen });
    t.addEvent({ startTimeSec: 2, text: 'Hi', pen });
    const spc = [0x91, 0x3C, 0x00, 0x00];
    expect(renders(t)).toEqual([
      [...df0(1, 1), ...CW0, ...spc, ...TEXT_HI, ...DSW0],
      [...df0(1, 1), ...CW0, ...spc, ...TEXT_HI, ...DSW0],
    ]);
  });

  it('reports a clear error when SetWindowAttributes + SetPenColor push an event past the 127-byte CCP cap', () => {
    // Without SWA (5) and SPC (4) this event is DF 7 + CW 1 + text 110 +
    // DSW 2 = 120 bytes plus 4 service block headers = 124, which fits.
    const t = new CaptionTimeline();
    t.defineWindow({ id: 0, justify: Justify.Center });
    t.addEvent({
      startTimeSec: 0,
      text: 'x'.repeat(110),
      pen: { foregroundColor: { r: 3, g: 3, b: 3 } },
    });
    expect(() => buildTimelineActions708(t, { fps: 30 })).toThrow(/too large for a single CCP/);
  });
});

describe('CaptionTimeline range checks', () => {
  it('rejects window and pen style IDs outside 0..7', () => {
    expect(() => { new CaptionTimeline().defineWindow({ id: 0, windowStyleId: 8 }); }).toThrow(/windowStyleId/);
    expect(() => { new CaptionTimeline().defineWindow({ id: 0, penStyleId: -1 }); }).toThrow(/penStyleId/);
  });

  it('limits anchors by relativePositioning', () => {
    expect(() => { new CaptionTimeline().defineWindow({ id: 0, anchorVertical: 75 }); }).toThrow(/anchorVertical/);
    expect(() => { new CaptionTimeline().defineWindow({ id: 0, anchorVertical: 74, anchorHorizontal: 209 }); }).not.toThrow();
    expect(() => { new CaptionTimeline().defineWindow({
      id: 0, relativePositioning: true, anchorHorizontal: 100,
    }); }).toThrow(/anchorHorizontal/);
    expect(() => { new CaptionTimeline().defineWindow({
      id: 0, relativePositioning: true, anchorVertical: 99, anchorHorizontal: 99,
    }); }).not.toThrow();
  });

  it('rejects undefined text tags 12..14 and out-of-range tags', () => {
    const t = new CaptionTimeline();
    for (const textTag of [12, 13, 14, 16]) {
      expect(() => { t.addEvent({ startTimeSec: 0, text: 'Hi', pen: { textTag } }); }).toThrow(/textTag/);
    }
    expect(() => { t.addEvent({ startTimeSec: 0, text: 'Hi', pen: { textTag: 11 } }); }).not.toThrow();
    expect(() => { t.addEvent({ startTimeSec: 0, text: 'Hi', pen: { textTag: 15 } }); }).not.toThrow();
  });
});
