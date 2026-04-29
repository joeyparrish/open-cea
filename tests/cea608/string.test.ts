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
import { fromCharmapIndex } from '../../src/cea608/charmap.js';
import { encodeString } from '../../src/cea608/string.js';
import { basicNaPair, basicNaSingle } from '../../src/cea608/text.js';

describe('encodeString', () => {
  it('buffers and pairs Basic-NA characters', () => {
    // "Hi" -> 'H' (0x48), 'i' (0x69)
    const out = encodeString('Hi', 0);
    expect(out).toEqual([basicNaPair(0x48, 0x69)]);
  });

  it('flushes a trailing Basic-NA character with a null pad', () => {
    // "Hi!" -> 'H' (0x48), 'i' (0x69), '!' (0x21)
    const out = encodeString('Hi!', 0);
    expect(out).toEqual([
      basicNaPair(0x48, 0x69),
      basicNaSingle(0x21),
    ]);
  });

  it('flushes the Basic-NA buffer before a Special-NA character', () => {
    // "A®" -> 'A' (0x41), '®' (index 96)
    const out = encodeString('A®', 1);
    expect(out).toEqual([
      basicNaSingle(0x41),
      fromCharmapIndex(96, 1),
    ]);
  });

  it('emits a Basic-NA fallback and packs it before an Extended character', () => {
    // "ü" -> fallback 'u' (0x75), 'ü' (index 117)
    const out = encodeString('ü', 0);
    expect(out).toEqual([
      basicNaSingle(0x75),
      fromCharmapIndex(117, 0),
    ]);

    // "Aü" -> 'A' (0x41), fallback 'u' (0x75), 'ü' (index 117)
    const out2 = encodeString('Aü', 0);
    expect(out2).toEqual([
      basicNaPair(0x41, 0x75),
      fromCharmapIndex(117, 0),
    ]);
  });

  it('replaces unmappable characters with a Basic-NA space', () => {
    // "A🚀B" -> 'A' (0x41), space (0x20), 'B' (0x42)
    const out = encodeString('A🚀B', 0);
    expect(out).toEqual([
      basicNaPair(0x41, 0x20),
      basicNaSingle(0x42),
    ]);
  });

  // Regression test: several CEA-608 Basic-NA byte positions are
  // REASSIGNED to accented letters per §4.1 (e.g. 0x7C is ÷, not |).
  // The extended-char fallback table must not pretend those byte
  // values render as their ASCII counterparts.
  it('uses safe Basic-NA fallbacks for extended chars whose ASCII byte is reassigned', () => {
    // '|' (extended index 158): Basic-NA 0x7C is ÷, so fallback must NOT
    // be 0x7C. Current choice is '!' (0x21).
    const pipe = encodeString('|', 0);
    expect(pipe).toEqual([
      basicNaSingle(0x21),
      fromCharmapIndex(158, 0),
    ]);

    // '_' (index 157): Basic-NA 0x5F is ó. Fallback is '-' (0x2D).
    const under = encodeString('_', 0);
    expect(under).toEqual([
      basicNaSingle(0x2D),
      fromCharmapIndex(157, 0),
    ]);

    // '~' (index 159): Basic-NA 0x7E is ñ. Fallback is '-' (0x2D).
    const tilde = encodeString('~', 0);
    expect(tilde).toEqual([
      basicNaSingle(0x2D),
      fromCharmapIndex(159, 0),
    ]);
  });
});
