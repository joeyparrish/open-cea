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

import { describe, test } from 'vitest';
import { basicNaPair } from '../../src/cea608/text.js';
import { expectBytesEqual, loadGolden, packBigEndian } from './helpers.js';

describe('CEA-608 Basic-NA pairs', () => {
  test('matches libcaption golden for the full 96x96 Cartesian product', () => {
    const words: number[] = [];
    for (let a = 0x20; a < 0x80; a++) {
      for (let b = 0x20; b < 0x80; b++) {
        words.push(basicNaPair(a, b));
      }
    }
    expectBytesEqual(packBigEndian(words), loadGolden('basic_na_pairs.bin'));
  });
});
