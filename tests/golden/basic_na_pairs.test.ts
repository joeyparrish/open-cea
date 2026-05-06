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
// Hand-computed expected words below; the parity layer is itself
// independently verified by tests/cea608/parity.test.ts.

import { describe, expect, test } from 'vitest';
import { hasValidParity, stripParity } from '../../src/cea608/parity.js';
import { basicNaPair } from '../../src/cea608/text.js';

interface PairCase {
  a: number;
  b: number;
  expected: number;  // hand-computed, parity included
  label: string;
}

const cases: PairCase[] = [
  { a: 0x41, b: 0x42, expected: 0xC1C2, label: '"AB"' },
  { a: 0x48, b: 0x69, expected: 0xC8E9, label: '"Hi"' },
  { a: 0x20, b: 0x21, expected: 0x20A1, label: '" !" lowest pairing' },
  { a: 0x7E, b: 0x7F, expected: 0xFE7F, label: '"~\\x7F" highest pairing' },
  { a: 0x30, b: 0x39, expected: 0xB0B9, label: '"09"' },
];

describe('CEA-608 Basic-NA pairs (spec §4.1)', () => {
  test.each(cases)(
    '$label: basicNaPair(0x$a, 0x$b) === 0x$expected',
    ({ a, b, expected }) => {
      expect(basicNaPair(a, b)).toBe(expected);
    },
  );

  test('structural sweep over 0x20..0x7F: high=a, low=b, both bytes odd-parity', () => {
    // Property check (not an oracle): for every legal Basic-NA pair, the
    // returned word must place `a` in the high byte and `b` in the low
    // byte after stripping parity, and both bytes must carry valid odd
    // parity. This catches byte-swaps, parity drops, and bit-shuffles
    // without restating the implementation.
    for (let a = 0x20; a < 0x80; a++) {
      for (let b = 0x20; b < 0x80; b++) {
        const word = basicNaPair(a, b);
        const high = (word >> 8) & 0xFF;
        const low = word & 0xFF;
        if (stripParity(high) !== a || stripParity(low) !== b ||
            !hasValidParity(high) || !hasValidParity(low)) {
          throw new Error(
            `basicNaPair(0x${a.toString(16)}, 0x${b.toString(16)}) = ` +
              `0x${word.toString(16).padStart(4, '0')} ` +
              `(high=0x${high.toString(16)}, low=0x${low.toString(16)})`,
          );
        }
      }
    }
  });
});
