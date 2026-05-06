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

// Hand-computed odd-parity tests for CTA-608 §2. This file is the
// independent oracle for the golden-table tests under tests/golden/, all
// of which apply withParityWord() to a raw spec byte on the right-hand
// side of their assertions. Without this test, those golden tests would
// pass even if parity were silently broken.

import { describe, expect, test } from 'vitest';
import {
  hasValidParity,
  stripParity,
  withParity,
  withParityWord,
} from '../../src/cea608/parity.js';

// Hand-computed reference: each lower-7-bit input maps to itself with
// the MSB set iff its popcount is even (so the resulting 8-bit byte has
// odd total popcount).
const SINGLE_BYTE_CASES: { input: number; expected: number }[] = [
  { input: 0x00, expected: 0x80 },  // 0 ones -> set MSB
  { input: 0x01, expected: 0x01 },  // 1 one  -> leave MSB clear
  { input: 0x02, expected: 0x02 },
  { input: 0x03, expected: 0x83 },
  { input: 0x11, expected: 0x91 },  // PAC/special-NA prefix (ch1)
  { input: 0x14, expected: 0x94 },  // misc-control prefix (F1 ch1)
  { input: 0x17, expected: 0x97 },  // tab-offset prefix (ch1)
  { input: 0x19, expected: 0x19 },  // PAC/special-NA prefix (ch2)
  { input: 0x1C, expected: 0x1C },  // misc-control prefix (F1 ch2)
  { input: 0x1F, expected: 0x1F },  // tab-offset prefix (ch2): 5 ones, odd
  { input: 0x20, expected: 0x20 },  // ' ': 1 one, odd
  { input: 0x21, expected: 0xA1 },  // '!': 2 ones, even
  { input: 0x30, expected: 0xB0 },  // '0'
  { input: 0x39, expected: 0xB9 },  // '9'
  { input: 0x40, expected: 0x40 },  // PAC/midrow second-byte base
  { input: 0x41, expected: 0xC1 },  // 'A'
  { input: 0x42, expected: 0xC2 },  // 'B'
  { input: 0x48, expected: 0xC8 },  // 'H'
  { input: 0x4F, expected: 0x4F },  // 7 ones, odd
  { input: 0x55, expected: 0xD5 },  // 0101 0101: 4 ones, even -> set MSB
  { input: 0x69, expected: 0xE9 },  // 'i'
  { input: 0x7E, expected: 0xFE },  // '~'
  { input: 0x7F, expected: 0x7F },  // 7 ones, odd
];

function hex(n: number, width = 2): string {
  return '0x' + n.toString(16).toUpperCase().padStart(width, '0');
}

describe('withParity (spec §2)', () => {
  test.each(SINGLE_BYTE_CASES.map((c) => ({
    ...c,
    name: `withParity(${hex(c.input)}) === ${hex(c.expected)}`,
  })))('$name', ({ input, expected }) => {
    expect(withParity(input)).toBe(expected);
  });

  test('ignores any pre-existing MSB on the input', () => {
    // The input's bit 7 must be discarded before parity is computed.
    expect(withParity(0x80)).toBe(0x80);  // lower 7 bits = 0x00
    expect(withParity(0xC1)).toBe(0xC1);  // lower 7 bits = 0x41 -> 0xC1
    expect(withParity(0xFF)).toBe(0x7F);  // lower 7 bits = 0x7F -> 0x7F
  });

  test('every output in 0..0x7F has odd 8-bit popcount', () => {
    // Structural property: this checks the function meets the spec
    // definition without re-running the implementation.
    for (let b = 0; b < 0x80; b++) {
      const stamped = withParity(b);
      expect(stamped & 0x7F).toBe(b);
      let ones = 0;
      for (let bit = 0; bit < 8; bit++) {
        if ((stamped >> bit) & 1) ones++;
      }
      expect(ones % 2).toBe(1);
    }
  });
});

describe('withParityWord (spec §2)', () => {
  // Hand-computed words anchoring each golden-table test.
  const WORD_CASES: { input: number; expected: number; note: string }[] = [
    { input: 0x1140, expected: 0x9140, note: 'rowStylePreamble row 1 White' },
    { input: 0x1420, expected: 0x9420, note: 'controlCommand RCL on CC1' },
    { input: 0x1721, expected: 0x97A1, note: 'tab TO1 on CC1' },
    { input: 0x1F21, expected: 0x1FA1, note: 'tab TO1 on CC2' },
    { input: 0x2000, expected: 0x2080, note: 'fromCharmapIndex(0) basicNaSingle' },
    { input: 0x1130, expected: 0x91B0, note: 'fromCharmapIndex(96) special-NA' },
    { input: 0x1220, expected: 0x9220, note: 'fromCharmapIndex(112) extended' },
    { input: 0x1320, expected: 0x1320, note: 'fromCharmapIndex(144) extended' },
    { input: 0x1120, expected: 0x9120, note: 'midrow ch1 White' },
    { input: 0x4142, expected: 0xC1C2, note: "basicNaPair('A','B')" },
    { input: 0x0000, expected: 0x8080, note: 'both bytes zero -> both MSBs set' },
    { input: 0xFFFF, expected: 0x7F7F, note: 'top bits ignored, lower 7s odd' },
  ];

  test.each(WORD_CASES)(
    '$note: withParityWord(0x$input) === 0x$expected',
    ({ input, expected }) => {
      expect(withParityWord(input)).toBe(expected);
    },
  );
});

describe('hasValidParity', () => {
  test('accepts bytes produced by withParity', () => {
    for (let b = 0; b < 0x80; b++) {
      expect(hasValidParity(withParity(b))).toBe(true);
    }
  });

  test('rejects bytes whose MSB is wrong', () => {
    // Flip the MSB on each valid byte; result must be invalid.
    for (let b = 0; b < 0x80; b++) {
      const valid = withParity(b);
      const flipped = valid ^ 0x80;
      expect(hasValidParity(flipped)).toBe(false);
    }
  });
});

describe('stripParity', () => {
  test('returns the lower 7 bits regardless of MSB', () => {
    expect(stripParity(0x00)).toBe(0x00);
    expect(stripParity(0x80)).toBe(0x00);
    expect(stripParity(0xC1)).toBe(0x41);
    expect(stripParity(0x41)).toBe(0x41);
    expect(stripParity(0xFF)).toBe(0x7F);
  });
});
