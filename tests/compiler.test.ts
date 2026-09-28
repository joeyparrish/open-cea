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
import { CaptionTimeline } from '../src/timeline.js';
import { buildTimelineActions708, compileTimeline } from '../src/compiler.js';
import {
  defineWindow,
  displayWindows,
  setCurrentWindow,
  setWindowAttributes,
} from '../src/cea708/window.js';
import { setPenAttributes, setPenColor } from '../src/cea708/pen.js';
import { encodeString708 } from '../src/cea708/text.js';
import { BorderType, Direction, DisplayEffect, Justify, Opacity } from '../src/cea708/types.js';

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

describe('buildTimelineActions708 - emitted 708 commands', () => {
  function renderOf(timeline: CaptionTimeline): number[] {
    const action = buildTimelineActions708(timeline, { fps: 30 })[0];
    if (action.kind !== '708') throw new Error('expected a 708 action');
    return Array.from(action.payload.subarray(1));
  }

  function bytes(...arrays: Uint8Array[]): number[] {
    return arrays.flatMap((a) => Array.from(a));
  }

  // DefineWindow with the compiler's defaults, allowing overrides.
  function defaultDefine(
    o: Partial<Parameters<typeof defineWindow>[0]> = {},
  ): Uint8Array {
    return defineWindow({
      windowId: 0, priority: 0, anchorVertical: 0, anchorHorizontal: 0,
      anchorPoint: 0, relativePositioning: false, rowCount: 15,
      columnCount: 32, visible: true, windowStyleId: 1, penStyleId: 1,
      ...o,
    });
  }

  it('emits no SetWindowAttributes or SetPenColor when no such field is set', () => {
    const t = new CaptionTimeline();
    t.defineWindow({ id: 0 });
    t.addEvent({ startTimeSec: 0, text: 'Hi' });
    expect(renderOf(t)).toEqual(bytes(
      defaultDefine(),
      setCurrentWindow(0),
      encodeString708('Hi'),
      displayWindows(1),
    ));
  });

  it('emits SetWindowAttributes after SetCurrentWindow, defaulting unset fields to window style 1', () => {
    const t = new CaptionTimeline();
    t.defineWindow({
      id: 0,
      justify: Justify.Center,
      fillColor: { r: 3, g: 0, b: 0 },
      fillOpacity: Opacity.Translucent,
    });
    t.addEvent({ startTimeSec: 0, text: 'Hi' });
    expect(renderOf(t)).toEqual(bytes(
      defaultDefine(),
      setCurrentWindow(0),
      setWindowAttributes({
        fillColor: { r: 3, g: 0, b: 0 }, fillOpacity: Opacity.Translucent,
        borderColor: { r: 0, g: 0, b: 0 }, borderType: BorderType.None,
        printDirection: Direction.LeftToRight, scrollDirection: Direction.BottomToTop,
        justify: Justify.Center, effectDirection: Direction.LeftToRight,
        effectSpeed: 1, displayEffect: DisplayEffect.Snap,
      }),
      encodeString708('Hi'),
      displayWindows(1),
    ));
  });

  it('emits SetPenColor after SetPenAttributes, defaulting unset fields to pen style 1', () => {
    const t = new CaptionTimeline();
    t.defineWindow({ id: 0 });
    t.addEvent({
      startTimeSec: 0,
      text: 'Hi',
      pen: { foregroundColor: { r: 3, g: 3, b: 0 }, backgroundOpacity: Opacity.Transparent },
    });
    expect(renderOf(t)).toEqual(bytes(
      defaultDefine(),
      setCurrentWindow(0),
      setPenAttributes({ penSize: 1, offset: 1, textTag: 0, fontStyle: 0, edgeType: 0, underline: false, italics: false }),
      setPenColor({
        foregroundColor: { r: 3, g: 3, b: 0 }, foregroundOpacity: Opacity.Solid,
        backgroundColor: { r: 0, g: 0, b: 0 }, backgroundOpacity: Opacity.Transparent,
        edgeColor: { r: 0, g: 0, b: 0 },
      }),
      encodeString708('Hi'),
      displayWindows(1),
    ));
  });

  it('carries text tag through SetPenAttributes without emitting SetPenColor', () => {
    const t = new CaptionTimeline();
    t.defineWindow({ id: 0 });
    t.addEvent({ startTimeSec: 0, text: 'Hi', pen: { textTag: 15 } });
    expect(renderOf(t)).toEqual(bytes(
      defaultDefine(),
      setCurrentWindow(0),
      setPenAttributes({ penSize: 1, offset: 1, textTag: 15, fontStyle: 0, edgeType: 0, underline: false, italics: false }),
      encodeString708('Hi'),
      displayWindows(1),
    ));
  });

  it('carries windowStyleId, penStyleId and relativePositioning into DefineWindow, without SetWindowAttributes', () => {
    const t = new CaptionTimeline();
    t.defineWindow({ id: 0, windowStyleId: 3, penStyleId: 2, relativePositioning: true, anchorVertical: 50 });
    t.addEvent({ startTimeSec: 0, text: 'Hi' });
    expect(renderOf(t)).toEqual(bytes(
      defaultDefine({ windowStyleId: 3, penStyleId: 2, relativePositioning: true, anchorVertical: 50 }),
      setCurrentWindow(0),
      encodeString708('Hi'),
      displayWindows(1),
    ));
  });

  it('reports a clear error when SetWindowAttributes + SetPenColor push an event past the 127-byte CCP cap', () => {
    const t = new CaptionTimeline();
    t.defineWindow({ id: 0, justify: Justify.Center });       // triggers SetWindowAttributes
    t.addEvent({
      startTimeSec: 0,
      text: 'x'.repeat(110),
      pen: { foregroundColor: { r: 3, g: 3, b: 3 } },         // triggers SetPenColor
    });
    expect(() => buildTimelineActions708(t, { fps: 30 })).toThrow(/too large for a single CCP/);
  });
});
