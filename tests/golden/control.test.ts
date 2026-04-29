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
import { ControlCode, controlCommand } from '../../src/cea608/control.js';
import type { CcChannel } from '../../src/cea608/types.js';
import { expectBytesEqual, loadGolden, packBigEndian } from './helpers.js';

// Same 15 commands and same iteration order as
// libcaption-test-suite/generator.cpp `kAllControls` and `emit_controls`.
// Intentionally omits FlashOn (0x28) to match the libcaption enum.
const ORDERED_CONTROLS = [
  ControlCode.ResumeCaptionLoading,
  ControlCode.Backspace,
  ControlCode.AlarmOff,
  ControlCode.AlarmOn,
  ControlCode.DeleteToEndOfRow,
  ControlCode.RollUp2,
  ControlCode.RollUp3,
  ControlCode.RollUp4,
  ControlCode.ResumeDirectCaptioning,
  ControlCode.TextRestart,
  ControlCode.ResumeTextDisplay,
  ControlCode.EraseDisplayedMemory,
  ControlCode.CarriageReturn,
  ControlCode.EraseNonDisplayedMemory,
  ControlCode.EndOfCaption,
] as const;

const ALL_CC: readonly CcChannel[] = [0, 1, 2, 3];

describe('CEA-608 misc control commands', () => {
  test('matches libcaption golden for CC1..CC4 across all 15 commands', () => {
    const words: number[] = [];
    for (const cc of ALL_CC) {
      for (const cmd of ORDERED_CONTROLS) {
        words.push(controlCommand(cmd, cc));
      }
    }
    expectBytesEqual(packBigEndian(words), loadGolden('control.bin'));
  });
});
