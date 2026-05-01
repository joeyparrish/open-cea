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

// Spec-derived tests for CEA-608 mid-row codes (CTA-608 §5.2, Table 51).
//
// First byte: 0x11 (ch1) or 0x19 (ch2), same on both fields.
// Second byte: 0x20 | (style << 1) | underline, with style in 0..7
// (white..italics) and underline in 0..1. Both bytes carry odd parity.

import { describe, expect, test } from 'vitest';
import { midrowChange } from '../../src/cea608/midrow.js';
import { withParityWord } from '../../src/cea608/parity.js';
import { Style } from '../../src/cea608/types.js';
import type { Channel, Underline } from '../../src/cea608/types.js';

interface Case {
  name: string;
  channel: Channel;
  style: Style;
  u: Underline;
  expected: number;
}

const cases: Case[] = [
  // ch1 sweep across all 8 styles, no underline (second byte = 0x20 | (style<<1))
  { name: 'ch1 White',    channel: 0, style: Style.White,   u: 0, expected: 0x1120 },
  { name: 'ch1 Green',    channel: 0, style: Style.Green,   u: 0, expected: 0x1122 },
  { name: 'ch1 Blue',     channel: 0, style: Style.Blue,    u: 0, expected: 0x1124 },
  { name: 'ch1 Cyan',     channel: 0, style: Style.Cyan,    u: 0, expected: 0x1126 },
  { name: 'ch1 Red',      channel: 0, style: Style.Red,     u: 0, expected: 0x1128 },
  { name: 'ch1 Yellow',   channel: 0, style: Style.Yellow,  u: 0, expected: 0x112A },
  { name: 'ch1 Magenta',  channel: 0, style: Style.Magenta, u: 0, expected: 0x112C },
  { name: 'ch1 Italics',  channel: 0, style: Style.Italics, u: 0, expected: 0x112E },
  // Underline LSB
  { name: 'ch1 White u',   channel: 0, style: Style.White,   u: 1, expected: 0x1121 },
  { name: 'ch1 Italics u', channel: 0, style: Style.Italics, u: 1, expected: 0x112F },
  // ch2: first byte 0x19
  { name: 'ch2 White',     channel: 1, style: Style.White,   u: 0, expected: 0x1920 },
  { name: 'ch2 Italics u', channel: 1, style: Style.Italics, u: 1, expected: 0x192F },
];

describe('CEA-608 mid-row codes (spec §5.2, Table 51)', () => {
  test.each(cases)('$name', ({ channel, style, u, expected }) => {
    expect(midrowChange(channel, style, u)).toBe(withParityWord(expected));
  });
});
