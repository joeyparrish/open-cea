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
});
