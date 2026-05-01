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

// Spec-derived tests for CEA-608 misc control commands (CTA-608 §3 / §5.3).
//
// Per §3 the first byte is 0x14 with +0x08 if channel=1 and +0x01 if field=F2:
//   F1 ch1 = 0x14   F1 ch2 = 0x1C
//   F2 ch1 = 0x15   F2 ch2 = 0x1D
// The second byte is the command code (0x20..0x2F). Both bytes carry odd
// parity. The cases below are computed straight from those rules.

import { describe, expect, test } from 'vitest';
import { ControlCode, controlCommand } from '../../src/cea608/control.js';
import { withParityWord } from '../../src/cea608/parity.js';
import type { CcChannel } from '../../src/cea608/types.js';

interface Case {
  name: string;
  cmd: ControlCode;
  cc: CcChannel;
  expected: number;  // raw word, no parity
}

const cases: Case[] = [
  // CC1 (F1, ch1): first byte 0x14
  { name: 'RCL on CC1', cmd: ControlCode.ResumeCaptionLoading,    cc: 0, expected: 0x1420 },
  { name: 'BS  on CC1', cmd: ControlCode.Backspace,               cc: 0, expected: 0x1421 },
  { name: 'EDM on CC1', cmd: ControlCode.EraseDisplayedMemory,    cc: 0, expected: 0x142C },
  { name: 'EOC on CC1', cmd: ControlCode.EndOfCaption,            cc: 0, expected: 0x142F },
  // CC2 (F1, ch2): first byte 0x14 | 0x08 = 0x1C
  { name: 'RCL on CC2', cmd: ControlCode.ResumeCaptionLoading,    cc: 1, expected: 0x1C20 },
  { name: 'EOC on CC2', cmd: ControlCode.EndOfCaption,            cc: 1, expected: 0x1C2F },
  // CC3 (F2, ch1): first byte 0x14 | 0x01 = 0x15
  { name: 'RCL on CC3', cmd: ControlCode.ResumeCaptionLoading,    cc: 2, expected: 0x1520 },
  { name: 'EOC on CC3', cmd: ControlCode.EndOfCaption,            cc: 2, expected: 0x152F },
  // CC4 (F2, ch2): first byte 0x14 | 0x09 = 0x1D
  { name: 'RCL on CC4', cmd: ControlCode.ResumeCaptionLoading,    cc: 3, expected: 0x1D20 },
  { name: 'EOC on CC4', cmd: ControlCode.EndOfCaption,            cc: 3, expected: 0x1D2F },
  // Roll-up codes — used by the 608 compiler's --style roll-up path.
  { name: 'RU2 on CC1', cmd: ControlCode.RollUp2,                 cc: 0, expected: 0x1425 },
  { name: 'RU3 on CC1', cmd: ControlCode.RollUp3,                 cc: 0, expected: 0x1426 },
  { name: 'RU4 on CC1', cmd: ControlCode.RollUp4,                 cc: 0, expected: 0x1427 },
  // Carriage return and ENM (companions to roll-up / pop-on cycles).
  { name: 'CR  on CC1', cmd: ControlCode.CarriageReturn,          cc: 0, expected: 0x142D },
  { name: 'ENM on CC1', cmd: ControlCode.EraseNonDisplayedMemory, cc: 0, expected: 0x142E },
];

describe('CEA-608 misc control commands (spec §3 / §5.3)', () => {
  test.each(cases)('$name', ({ cmd, cc, expected }) => {
    expect(controlCommand(cmd, cc)).toBe(withParityWord(expected));
  });
});
