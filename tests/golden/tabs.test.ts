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
import { tab } from '../../src/cea608/control.js';
import type { CcChannel } from '../../src/cea608/types.js';
import { expectBytesEqual, loadGolden, packBigEndian } from './helpers.js';

const ALL_CC: readonly CcChannel[] = [0, 1, 2, 3];
const SIZES = [1, 2, 3] as const;

describe('CEA-608 tab offsets', () => {
  test('matches libcaption golden for CC1..CC4 across TO1..TO3', () => {
    const words: number[] = [];
    for (const cc of ALL_CC) {
      for (const size of SIZES) {
        words.push(tab(size, cc));
      }
    }
    expectBytesEqual(packBigEndian(words), loadGolden('tabs.bin'));
  });
});
