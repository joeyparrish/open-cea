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
import { midrowChange } from '../../src/cea608/midrow.js';
import { Style } from '../../src/cea608/types.js';
import type { Channel } from '../../src/cea608/types.js';
import { expectBytesEqual, loadGolden, packBigEndian } from './helpers.js';

const CHANS: readonly Channel[] = [0, 1];
const STYLES = [
  Style.White,
  Style.Green,
  Style.Blue,
  Style.Cyan,
  Style.Red,
  Style.Yellow,
  Style.Magenta,
  Style.Italics,
] as const;

describe('CEA-608 mid-row codes', () => {
  test('matches libcaption golden for both channels x all styles x underline', () => {
    const words: number[] = [];
    for (const chan of CHANS) {
      for (const style of STYLES) {
        for (const u of [0, 1] as const) {
          words.push(midrowChange(chan, style, u));
        }
      }
    }
    expectBytesEqual(packBigEndian(words), loadGolden('midrow.bin'));
  });
});
