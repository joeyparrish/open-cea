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

// Spec-curated tests for CEA-608 background and foreground attribute
// codes (§4.4, Table 3). libcaption does not implement these optional
// EIA-608-D extensions, so there is no golden cross-check; the
// expected byte values come directly from the spec table.

import { describe, expect, test } from 'vitest';
import {
  BackgroundColor,
  backgroundAttribute,
  backgroundTransparent,
  foregroundBlack,
  foregroundBlackUnderlined,
  type BackgroundOpacity,
} from '../../src/cea608/attributes.js';
import { withParityWord } from '../../src/cea608/parity.js';
import type { Channel } from '../../src/cea608/types.js';

interface BgCase {
  color: BackgroundColor;
  opacity: BackgroundOpacity;
  chan: Channel;
  expected: number;
}

describe('backgroundAttribute (CTA-608 §4.4 Table 3)', () => {
  const cases: BgCase[] = [
    // BWO..BAS, opaque sweep across all eight colors on ch1.
    { color: BackgroundColor.White,   opacity: 'opaque',           chan: 0, expected: 0x1020 },
    { color: BackgroundColor.Green,   opacity: 'opaque',           chan: 0, expected: 0x1022 },
    { color: BackgroundColor.Blue,    opacity: 'opaque',           chan: 0, expected: 0x1024 },
    { color: BackgroundColor.Cyan,    opacity: 'opaque',           chan: 0, expected: 0x1026 },
    { color: BackgroundColor.Red,     opacity: 'opaque',           chan: 0, expected: 0x1028 },
    { color: BackgroundColor.Yellow,  opacity: 'opaque',           chan: 0, expected: 0x102A },
    { color: BackgroundColor.Magenta, opacity: 'opaque',           chan: 0, expected: 0x102C },
    { color: BackgroundColor.Black,   opacity: 'opaque',           chan: 0, expected: 0x102E },
    // Semi-transparent flips the LSB.
    { color: BackgroundColor.White,   opacity: 'semi-transparent', chan: 0, expected: 0x1021 },
    { color: BackgroundColor.Black,   opacity: 'semi-transparent', chan: 0, expected: 0x102F },
    // Channel 2 adds 0x08 to the first byte.
    { color: BackgroundColor.White,   opacity: 'opaque',           chan: 1, expected: 0x1820 },
    { color: BackgroundColor.Black,   opacity: 'semi-transparent', chan: 1, expected: 0x182F },
  ];

  test.each(cases)(
    'color=$color opacity=$opacity chan=$chan',
    ({ color, opacity, chan, expected }) => {
      expect(backgroundAttribute(color, opacity, chan)).toBe(withParityWord(expected));
    },
  );
});

describe('0x17/0x1F-prefixed attribute codes (CTA-608 §4.4)', () => {
  test('Background Transparent (BT) on ch1 and ch2', () => {
    expect(backgroundTransparent(0)).toBe(withParityWord(0x172D));
    expect(backgroundTransparent(1)).toBe(withParityWord(0x1F2D));
  });
  test('Foreground Black (FA) on ch1 and ch2', () => {
    expect(foregroundBlack(0)).toBe(withParityWord(0x172E));
    expect(foregroundBlack(1)).toBe(withParityWord(0x1F2E));
  });
  test('Foreground Black Underlined (FAU) on ch1 and ch2', () => {
    expect(foregroundBlackUnderlined(0)).toBe(withParityWord(0x172F));
    expect(foregroundBlackUnderlined(1)).toBe(withParityWord(0x1F2F));
  });
});
