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
import { compileDocument } from '../../src/compile/build.js';
import { validateCompileDocument } from '../../src/compile/document.js';

function extractValidEntries(out: Uint8Array): { type: number; word: number }[] {
  const entries: { type: number; word: number }[] = [];
  for (let i = 0; i < out.length; i += 3) {
    const header = out[i];
    if ((header & 0x04) !== 0x04) continue;
    const type = header & 0x03;
    const high = out[i + 1] & 0x7F;
    const low = out[i + 2] & 0x7F;
    entries.push({ type, word: (high << 8) | low });
  }
  return entries;
}

describe('compileDocument', () => {
  it('produces non-empty output for a single 708 track', () => {
    const doc = validateCompileDocument({
      tracks: [{
        target: '708',
        windows: [{ id: 0, anchorVertical: 14, rowCount: 2, columnCount: 32 }],
        events: [{ startTimeSec: 0, endTimeSec: 1, text: 'Hi' }],
      }],
    });
    const out = compileDocument(doc, 30);
    expect(out.length).toBeGreaterThan(0);
    const dtvccStarts = extractValidEntries(out).filter((e) => e.type === 3);
    expect(dtvccStarts.length).toBeGreaterThan(0);
  });

  it('mixes a 608 CC1 track and a 708 track in one stream', () => {
    const doc = validateCompileDocument({
      tracks: [
        {
          target: '608',
          channel: 'CC1',
          style: 'pop-on',
          events: [{ startTimeSec: 0, endTimeSec: 1, text: 'Hi' }],
        },
        {
          target: '708',
          windows: [{ id: 0 }],
          events: [{ startTimeSec: 0, endTimeSec: 1, text: 'Hi' }],
        },
      ],
    });
    const out = compileDocument(doc, 30);
    const entries = extractValidEntries(out);
    // F1 entries (cc_type=00) carry the 608 stream.
    expect(entries.some((e) => e.type === 0)).toBe(true);
    // DTVCC start entries (cc_type=11) carry the 708 stream.
    expect(entries.some((e) => e.type === 3)).toBe(true);
  });

  it('routes a CC3 608 track to F2 entries (cc_type=01)', () => {
    const doc = validateCompileDocument({
      tracks: [{
        target: '608',
        channel: 'CC3',
        style: 'pop-on',
        events: [{ startTimeSec: 0, endTimeSec: 1, text: 'Hi' }],
      }],
    });
    const out = compileDocument(doc, 30);
    const entries = extractValidEntries(out);
    expect(entries.some((e) => e.type === 1)).toBe(true);
    expect(entries.some((e) => e.type === 0)).toBe(false);
  });

  it('mixes CC1 and CC3 in F1 / F2 of the same stream', () => {
    const doc = validateCompileDocument({
      tracks: [
        {
          target: '608', channel: 'CC1', style: 'pop-on',
          events: [{ startTimeSec: 0, endTimeSec: 1, text: 'A' }],
        },
        {
          target: '608', channel: 'CC3', style: 'pop-on',
          events: [{ startTimeSec: 0, endTimeSec: 1, text: 'B' }],
        },
      ],
    });
    const out = compileDocument(doc, 30);
    const entries = extractValidEntries(out);
    expect(entries.some((e) => e.type === 0)).toBe(true);
    expect(entries.some((e) => e.type === 1)).toBe(true);
  });
});
