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

import { describe, expect, test } from 'vitest';
import { CHARMAP_SIZE, fromCharmapIndex } from '../../src/cea608/charmap.js';
import type { Channel } from '../../src/cea608/types.js';
import { loadGolden } from './helpers.js';

// charmap.bin layout: a flat sequence of (index, channel, ccWord) triples,
// each field a 16-bit big-endian integer (so 6 bytes per triple). Order
// matches libcaption-test-suite/generator.cpp emit_charmap: outer index
// 0..EIA608_CHAR_COUNT-1, inner channel 0..1, skipping any combinations
// for which libcaption returns a zero cc word.
const TRIPLE_BYTES = 6;

describe('CEA-608 charmap dispatch', () => {
  test('matches libcaption golden across all glyph indices and channels', () => {
    const golden = loadGolden('charmap.bin');
    expect(golden.length % TRIPLE_BYTES).toBe(0);
    const view = new DataView(golden.buffer, golden.byteOffset, golden.byteLength);
    const triples = golden.length / TRIPLE_BYTES;

    for (let t = 0; t < triples; t++) {
      const off = t * TRIPLE_BYTES;
      const index = view.getUint16(off);
      const channel = view.getUint16(off + 2) as Channel;
      const expectedWord = view.getUint16(off + 4);

      expect(index).toBeLessThan(CHARMAP_SIZE);

      const actualWord = fromCharmapIndex(index, channel);
      if (actualWord !== expectedWord) {
        throw new Error(
          `triple #${String(t)}: index=${String(index)} chan=${String(channel)} ` +
            `expected 0x${expectedWord.toString(16).padStart(4, '0')} ` +
            `got 0x${actualWord.toString(16).padStart(4, '0')}`,
        );
      }
    }
  });
});
