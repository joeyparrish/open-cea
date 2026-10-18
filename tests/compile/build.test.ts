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
import { Justify } from '../../src/cea708/types.js';

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

  it('emits the window-attribute, pen and style commands the document asks for', () => {
    const doc = validateCompileDocument({
      tracks: [{
        target: '708',
        windows: [{
          id: 0,
          justify: Justify.Center,
          windowStyleId: 2,
          penStyleId: 6,
          relativePositioning: true,
          anchorVertical: 40,
        }],
        events: [{
          startTimeSec: 0,
          endTimeSec: 1,
          text: 'Hi',
          pen: { textTag: 3, foregroundColor: { r: 3, g: 3, b: 0 } },
        }],
      }],
    });
    const dtvcc = dtvccBytes(compileDocument(doc, 30));

    // Hand-packed from CTA-708-E sections 8.10.5.2 / 8.10.5.8 /
    // 8.10.5.9 / 8.10.5.10 and Tables 26 / 27:
    // DF0: visible + locks; relative | V 40; H 0; 15 rows; 32 cols;
    //   window style 2, pen style 6.
    // CW0.
    // SWA: style 2 fill TRANSPARENT (0xC0); no border; L->R, B->T,
    //   CENTER (0x0E); speed 1, SNAP (0x10).
    // SPA: tag 3 | NORMAL | STANDARD (0x35); style 6 edge UNIFORM,
    //   font 3 (0x1B).
    // SPC: yellow solid (0x3C); style 6 bg TRANSPARENT (0xC0); edge black.
    // "Hi", DSW0.
    const expected = [
      0x98, 0x38, 0xA8, 0x00, 0x0E, 0x1F, 0x16,
      0x80,
      0x97, 0xC0, 0x00, 0x0E, 0x10,
      0x90, 0x35, 0x1B,
      0x91, 0x3C, 0xC0, 0x00,
      0x48, 0x69,
      0x89, 0x01,
    ];
    expect(indexOfSequence(dtvcc, expected)).toBeGreaterThanOrEqual(0);
  });
});

// The DTVCC byte stream (cc_type 2 / 3 payload bytes of valid entries).
function dtvccBytes(out: Uint8Array): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < out.length; i += 3) {
    const header = out[i];
    if ((header & 0x04) === 0x04 && (header & 0x03) >= 2) bytes.push(out[i + 1], out[i + 2]);
  }
  return bytes;
}

function indexOfSequence(haystack: number[], needle: number[]): number {
  for (let i = 0; i + needle.length <= haystack.length; i++) {
    if (needle.every((b, j) => haystack[i + j] === b)) return i;
  }
  return -1;
}
