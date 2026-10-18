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
import { validateCompileDocument } from '../../src/compile/document.js';

describe('validateCompileDocument', () => {
  it('accepts a minimal 708 single-track doc', () => {
    const doc = validateCompileDocument({
      tracks: [
        {
          target: '708',
          windows: [{ id: 0 }],
          events: [{ startTimeSec: 0, endTimeSec: 1, text: 'Hi' }],
        },
      ],
    });
    expect(doc.tracks.length).toBe(1);
  });

  it('accepts a minimal 608 single-track doc', () => {
    const doc = validateCompileDocument({
      tracks: [
        {
          target: '608',
          style: 'pop-on',
          events: [{ startTimeSec: 0, endTimeSec: 1, text: 'Hi' }],
        },
      ],
    });
    expect(doc.tracks[0].target).toBe('608');
  });

  it('rejects non-object input', () => {
    expect(() => validateCompileDocument(null)).toThrow(/expected an object/);
    expect(() => validateCompileDocument([])).toThrow(/expected an object/);
    expect(() => validateCompileDocument('hi')).toThrow(/expected an object/);
  });

  it('rejects an empty tracks array', () => {
    expect(() => validateCompileDocument({ tracks: [] })).toThrow(/at least one track/);
  });

  it('rejects an unknown target', () => {
    expect(() => validateCompileDocument({
      tracks: [{ target: 'xxx', events: [] }],
    })).toThrow(/expected one of 608, 708/);
  });

  it('rejects 708 track with no windows', () => {
    expect(() => validateCompileDocument({
      tracks: [{ target: '708', windows: [], events: [] }],
    })).toThrow(/at least one window/);
  });

  it('rejects 608 track with rollUpRows on a non-roll-up style', () => {
    expect(() => validateCompileDocument({
      tracks: [{
        target: '608', style: 'pop-on', rollUpRows: 4,
        events: [],
      }],
    })).toThrow(/only valid with style=roll-up/);
  });

  it('rejects out-of-range integer fields with the offending path', () => {
    expect(() => validateCompileDocument({
      tracks: [{
        target: '708',
        windows: [{ id: 99 }],
        events: [],
      }],
    })).toThrow(/tracks\[0\]\.windows\[0\]\.id/);
  });

  it('rejects an event whose endTimeSec precedes startTimeSec', () => {
    expect(() => validateCompileDocument({
      tracks: [{
        target: '708',
        windows: [{ id: 0 }],
        events: [{ startTimeSec: 2, endTimeSec: 1, text: 'oops' }],
      }],
    })).toThrow(/endTimeSec.*must be >= startTimeSec/);
  });

  it('rejects a non-string text field', () => {
    expect(() => validateCompileDocument({
      tracks: [{
        target: '608',
        style: 'pop-on',
        events: [{ startTimeSec: 0, text: 123 }],
      }],
    })).toThrow(/text.*expected a string/);
  });

  it('accepts windowStyleId, penStyleId, relativePositioning and textTag', () => {
    const doc = validateCompileDocument({
      tracks: [{
        target: '708',
        windows: [{ id: 0, windowStyleId: 7, penStyleId: 0, relativePositioning: true }],
        events: [{ startTimeSec: 0, endTimeSec: 1, text: 'Hi', pen: { textTag: 15 } }],
      }],
    });
    const w = doc.tracks[0];
    expect(w.target).toBe('708');
    if (w.target === '708') {
      expect(w.windows[0].windowStyleId).toBe(7);
      expect(w.windows[0].penStyleId).toBe(0);
      expect(w.windows[0].relativePositioning).toBe(true);
      expect(w.events[0].pen?.textTag).toBe(15);
    }
  });

  it('rejects out-of-range windowStyleId', () => {
    expect(() => validateCompileDocument({
      tracks: [{ target: '708', windows: [{ id: 0, windowStyleId: 8 }], events: [] }],
    })).toThrow(/windowStyleId: expected an integer in \[0, 7\]/);
  });

  it('rejects out-of-range textTag', () => {
    expect(() => validateCompileDocument({
      tracks: [{
        target: '708',
        windows: [{ id: 0 }],
        events: [{ startTimeSec: 0, text: 'Hi', pen: { textTag: 16 } }],
      }],
    })).toThrow(/textTag: expected an integer in \[0, 15\]/);
  });

  it('rejects a non-boolean relativePositioning', () => {
    expect(() => validateCompileDocument({
      tracks: [{ target: '708', windows: [{ id: 0, relativePositioning: 'yes' }], events: [] }],
    })).toThrow(/relativePositioning: expected a boolean/);
  });

  it('limits anchors to 0..74 / 0..209 when absolute and 0..99 when relative', () => {
    const win = (w: Record<string, unknown>) => () => validateCompileDocument({
      tracks: [{ target: '708', windows: [{ id: 0, ...w }], events: [] }],
    });
    expect(win({ anchorVertical: 75 })).toThrow(/anchorVertical: expected an integer in \[0, 74\]/);
    expect(win({ anchorVertical: 74, anchorHorizontal: 209 })).not.toThrow();
    expect(win({ relativePositioning: true, anchorHorizontal: 100 }))
      .toThrow(/anchorHorizontal: expected an integer in \[0, 99\]/);
    expect(win({ relativePositioning: true, anchorVertical: 99, anchorHorizontal: 99 })).not.toThrow();
  });

  it('rejects the undefined text tags 12..14', () => {
    for (const textTag of [12, 13, 14]) {
      expect(() => validateCompileDocument({
        tracks: [{
          target: '708',
          windows: [{ id: 0 }],
          events: [{ startTimeSec: 0, text: 'Hi', pen: { textTag } }],
        }],
      })).toThrow(/textTag: tags 12\.\.14 are undefined/);
    }
  });
});
