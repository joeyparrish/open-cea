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

// Spec-curated tests for CEA-608 PAC encoders. libcaption's PAC encoder
// has two bugs (drops the indent/color discriminator and applies parity
// before low-bit OR), so it cannot serve as the oracle here. These cases
// pin known-good byte values from CTA-608 §5.1 / Table 53 directly.

import { describe, test, expect } from 'vitest';
import { rowColumnPreamble, rowStylePreamble } from '../../src/cea608/pac.js';
import { withParityWord } from '../../src/cea608/parity.js';
import { Style } from '../../src/cea608/types.js';
import type { Channel, Underline } from '../../src/cea608/types.js';

interface PacCase {
  row: number;
  chan: Channel;
  u: Underline;
  expected: number; // raw cc word, no parity
}

interface ColCase extends PacCase {
  col: number;
}

interface StyleCase extends PacCase {
  style: Style;
}

describe('rowColumnPreamble (spec §5.1, Table 53)', () => {
  // Indent form: second byte = 0x40 | half | (indentCode << 1) | underline,
  // where indentCode = 8 + column/4 (so columns 0,4,8,...,28 -> 8..15).
  const cases: ColCase[] = [
    // Row 1 = upper half of 0x11 pair, sweeping all 8 legal columns.
    { row: 1, col:  0, chan: 0, u: 0, expected: 0x1150 },
    { row: 1, col:  4, chan: 0, u: 0, expected: 0x1152 },
    { row: 1, col:  8, chan: 0, u: 0, expected: 0x1154 },
    { row: 1, col: 12, chan: 0, u: 0, expected: 0x1156 },
    { row: 1, col: 16, chan: 0, u: 0, expected: 0x1158 },
    { row: 1, col: 20, chan: 0, u: 0, expected: 0x115A },
    { row: 1, col: 24, chan: 0, u: 0, expected: 0x115C },
    { row: 1, col: 28, chan: 0, u: 0, expected: 0x115E },
    // Underline LSB.
    { row: 1, col:  0, chan: 0, u: 1, expected: 0x1151 },
    { row: 1, col: 28, chan: 0, u: 1, expected: 0x115F },
    // Row 2 = lower half of 0x11 pair (second-byte +0x20).
    { row: 2, col:  0, chan: 0, u: 0, expected: 0x1170 },
    { row: 2, col: 28, chan: 0, u: 1, expected: 0x117F },
    // Row 11 is the only unpaired row (uses 0x10, upper-half-only per spec).
    { row: 11, col:  0, chan: 0, u: 0, expected: 0x1050 },
    { row: 11, col: 28, chan: 0, u: 1, expected: 0x105F },
    // Channel 2 adds 0x08 to the first byte.
    { row:  1, col:  0, chan: 1, u: 0, expected: 0x1950 },
    // Row 15 = lower half of 0x14 pair, sanity-check both channels.
    { row: 15, col: 16, chan: 0, u: 0, expected: 0x1478 },
    { row: 15, col: 16, chan: 1, u: 1, expected: 0x1C79 },
  ];

  test.each(cases)(
    'row=$row col=$col chan=$chan u=$u',
    ({ row, col, chan, u, expected }) => {
      expect(rowColumnPreamble(row, col, chan, u)).toBe(withParityWord(expected));
    },
  );

  test('rejects illegal columns', () => {
    expect(() => rowColumnPreamble(1, 1, 0, 0)).toThrow(RangeError);
    expect(() => rowColumnPreamble(1, 32, 0, 0)).toThrow(RangeError);
  });

  test('rejects illegal rows', () => {
    expect(() => rowColumnPreamble(0, 0, 0, 0)).toThrow(RangeError);
    expect(() => rowColumnPreamble(16, 0, 0, 0)).toThrow(RangeError);
  });
});

describe('rowStylePreamble (spec §5.1, Table 53)', () => {
  // Style form: second byte = 0x40 | half | (style << 1) | underline,
  // where style is 0..7 (white..italics). White = 0x40, italics underline = 0x4F.
  const cases: StyleCase[] = [
    // Row 1 sweeping all 8 styles, no underline.
    { row: 1, chan: 0, u: 0, style: Style.White,    expected: 0x1140 },
    { row: 1, chan: 0, u: 0, style: Style.Green,    expected: 0x1142 },
    { row: 1, chan: 0, u: 0, style: Style.Blue,     expected: 0x1144 },
    { row: 1, chan: 0, u: 0, style: Style.Cyan,     expected: 0x1146 },
    { row: 1, chan: 0, u: 0, style: Style.Red,      expected: 0x1148 },
    { row: 1, chan: 0, u: 0, style: Style.Yellow,   expected: 0x114A },
    { row: 1, chan: 0, u: 0, style: Style.Magenta,  expected: 0x114C },
    { row: 1, chan: 0, u: 0, style: Style.Italics,  expected: 0x114E },
    // Underline.
    { row: 1, chan: 0, u: 1, style: Style.White,    expected: 0x1141 },
    { row: 1, chan: 0, u: 1, style: Style.Italics,  expected: 0x114F },
    // Row 2 (lower half of pair).
    { row: 2, chan: 0, u: 0, style: Style.White,    expected: 0x1160 },
    { row: 2, chan: 0, u: 1, style: Style.Italics,  expected: 0x116F },
    // Row 11 unpaired, upper half only.
    { row: 11, chan: 0, u: 0, style: Style.White,   expected: 0x1040 },
    // Channel 2 across a few rows.
    { row:  1, chan: 1, u: 0, style: Style.Green,   expected: 0x1942 },
    { row: 15, chan: 1, u: 1, style: Style.Italics, expected: 0x1C6F },
  ];

  test.each(cases)(
    'row=$row chan=$chan u=$u style=$style',
    ({ row, chan, u, style, expected }) => {
      expect(rowStylePreamble(row, chan, style, u)).toBe(withParityWord(expected));
    },
  );

  test('rejects illegal rows', () => {
    expect(() => rowStylePreamble(0, 0, Style.White, 0)).toThrow(RangeError);
    expect(() => rowStylePreamble(16, 0, Style.White, 0)).toThrow(RangeError);
  });
});
