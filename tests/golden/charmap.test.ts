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

// Range-boundary tests for the charmap dispatch (CTA-608 §§4.1–4.3).
//
// `fromCharmapIndex` partitions index 0..175 into four spec-defined ranges:
//   0..95    Basic-NA singles            (basicNaSingle of 0x20+i)
//   96..111  Special-NA                  (specialChar of 0x30+(i-96))
//   112..143 Extended Spanish/Misc/Fr.   (extendedChar 'spanish-french'
//                                         of 0x20+(i-112))
//   144..175 Extended Pt/De/Da           (extendedChar 'portuguese-german
//                                         -danish' of 0x20+(i-144))
// The tests assert representative indices at each range boundary land in
// the right encoder, with the spec's expected byte values.

import { describe, expect, test } from 'vitest';
import { CHARMAP_SIZE, fromCharmapIndex } from '../../src/cea608/charmap.js';
import { withParityWord } from '../../src/cea608/parity.js';

describe('CEA-608 charmap dispatch (spec §§4.1–4.3)', () => {
  test('range 0..95: Basic-NA single, character byte in high byte, no channel bit', () => {
    // Index 0 -> 0x20 (' '), index 95 -> 0x7F.
    expect(fromCharmapIndex(0, 0)).toBe(withParityWord(0x2000));
    expect(fromCharmapIndex(0, 1)).toBe(withParityWord(0x2000));  // channel ignored
    expect(fromCharmapIndex(33, 0)).toBe(withParityWord(0x4100)); // 'A'
    expect(fromCharmapIndex(95, 0)).toBe(withParityWord(0x7F00));
  });

  test('range 96..111: Special-NA, prefix 0x11/0x19, second byte 0x30..0x3F', () => {
    // Index 96 -> first 0x11/0x19, second 0x30. Index 111 -> second 0x3F.
    expect(fromCharmapIndex(96, 0)).toBe(withParityWord(0x1130));
    expect(fromCharmapIndex(96, 1)).toBe(withParityWord(0x1930));
    expect(fromCharmapIndex(111, 0)).toBe(withParityWord(0x113F));
    expect(fromCharmapIndex(111, 1)).toBe(withParityWord(0x193F));
  });

  test('range 112..143: Extended Spanish/Misc/French, prefix 0x12/0x1A', () => {
    // Index 112 -> first 0x12/0x1A, second 0x20. Index 143 -> second 0x3F.
    expect(fromCharmapIndex(112, 0)).toBe(withParityWord(0x1220));
    expect(fromCharmapIndex(112, 1)).toBe(withParityWord(0x1A20));
    expect(fromCharmapIndex(143, 0)).toBe(withParityWord(0x123F));
    expect(fromCharmapIndex(143, 1)).toBe(withParityWord(0x1A3F));
  });

  test('range 144..175: Extended Portuguese/German/Danish, prefix 0x13/0x1B', () => {
    // Index 144 -> first 0x13/0x1B, second 0x20. Index 175 -> second 0x3F.
    expect(fromCharmapIndex(144, 0)).toBe(withParityWord(0x1320));
    expect(fromCharmapIndex(144, 1)).toBe(withParityWord(0x1B20));
    expect(fromCharmapIndex(175, 0)).toBe(withParityWord(0x133F));
    expect(fromCharmapIndex(175, 1)).toBe(withParityWord(0x1B3F));
  });

  test('rejects indices outside 0..CHARMAP_SIZE-1', () => {
    expect(() => fromCharmapIndex(-1, 0)).toThrow(RangeError);
    expect(() => fromCharmapIndex(CHARMAP_SIZE, 0)).toThrow(RangeError);
  });
});
