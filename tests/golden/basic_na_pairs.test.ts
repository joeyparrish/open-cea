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

// Spec-derived tests for CEA-608 Basic-NA pair packing (CTA-608 §4.1).
//
// A Basic-NA pair packs two 7-bit ASCII bytes (0x20..0x7F) into the high
// and low halves of a single cc word, each byte stamped with odd parity.
// The pair occupies a single byte-pair on the wire; no first-byte prefix
// is involved.

import { describe, expect, test } from 'vitest';
import { basicNaPair } from '../../src/cea608/text.js';
import { withParityWord } from '../../src/cea608/parity.js';

describe('CEA-608 Basic-NA pairs (spec §4.1)', () => {
  test('packs (a, b) as withParityWord((a << 8) | b) for representative ASCII inputs', () => {
    const samples: { a: number; b: number }[] = [
      { a: 0x41, b: 0x42 },  // "AB"
      { a: 0x48, b: 0x69 },  // "Hi"
      { a: 0x20, b: 0x21 },  // " !"  - lowest pairing
      { a: 0x7E, b: 0x7F },  // "~\x7F" - highest pairing
      { a: 0x30, b: 0x39 },  // "09"
    ];
    for (const { a, b } of samples) {
      expect(basicNaPair(a, b)).toBe(withParityWord((a << 8) | b));
    }
  });

  test('exhaustively packs every (a, b) in 0x20..0x7F as the spec defines', () => {
    // 96 * 96 = 9216 pairings; structural check that the function is just
    // the spec rule with parity, with no surprise collisions or zero
    // outputs anywhere in the range.
    for (let a = 0x20; a < 0x80; a++) {
      for (let b = 0x20; b < 0x80; b++) {
        const expected = withParityWord((a << 8) | b);
        if (basicNaPair(a, b) !== expected) {
          throw new Error(
            `basicNaPair(0x${a.toString(16)}, 0x${b.toString(16)}) = ` +
              `0x${basicNaPair(a, b).toString(16).padStart(4, '0')}, ` +
              `expected 0x${expected.toString(16).padStart(4, '0')}`,
          );
        }
      }
    }
  });
});
