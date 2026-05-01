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

// Spec-derived tests for CEA-608 Tab Offsets (CTA-608 §3, §5.3).
//
// Tab Offsets use first byte 0x17 (ch1) or 0x1F (ch2) on BOTH fields; the
// field is not encoded in the first byte (this is the §3 carve-out from
// the misc-control encoding). Second byte is 0x20 + size with size in 1..3.
// Both bytes carry odd parity.

import { describe, expect, test } from 'vitest';
import { tab } from '../../src/cea608/control.js';
import { withParityWord } from '../../src/cea608/parity.js';
import type { CcChannel } from '../../src/cea608/types.js';

interface Case {
  name: string;
  size: 1 | 2 | 3;
  cc: CcChannel;
  expected: number;
}

const cases: Case[] = [
  // ch1: first byte 0x17 (same on F1 and F2, so CC1 and CC3 share encoding)
  { name: 'TO1 on CC1 (ch1, F1)', size: 1, cc: 0, expected: 0x1721 },
  { name: 'TO2 on CC1 (ch1, F1)', size: 2, cc: 0, expected: 0x1722 },
  { name: 'TO3 on CC1 (ch1, F1)', size: 3, cc: 0, expected: 0x1723 },
  { name: 'TO1 on CC3 (ch1, F2)', size: 1, cc: 2, expected: 0x1721 },
  // ch2: first byte 0x1F (same on F1 and F2)
  { name: 'TO1 on CC2 (ch2, F1)', size: 1, cc: 1, expected: 0x1F21 },
  { name: 'TO2 on CC2 (ch2, F1)', size: 2, cc: 1, expected: 0x1F22 },
  { name: 'TO3 on CC2 (ch2, F1)', size: 3, cc: 1, expected: 0x1F23 },
  { name: 'TO3 on CC4 (ch2, F2)', size: 3, cc: 3, expected: 0x1F23 },
];

describe('CEA-608 tab offsets (spec §3, §5.3)', () => {
  test.each(cases)('$name', ({ size, cc, expected }) => {
    expect(tab(size, cc)).toBe(withParityWord(expected));
  });
});
