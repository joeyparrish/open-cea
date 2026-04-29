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

// CEA-608 miscellaneous control codes and tab offsets (CTA-608 §5.3).

import { withParityWord } from './parity.js';
import type { CcChannel, CcWord } from './types.js';

/**
 * Misc-control second-byte values. The first byte is implicit:
 *   F1 ch1 = 0x14   F1 ch2 = 0x1C
 *   F2 ch1 = 0x15   F2 ch2 = 0x1D   (per §3, only this category remaps F2)
 */
export const ControlCode = {
  ResumeCaptionLoading:    0x20,  // RCL  - select pop-on
  Backspace:               0x21,  // BS
  AlarmOff:                0x22,  // AOF  - reserved
  AlarmOn:                 0x23,  // AON  - reserved
  DeleteToEndOfRow:        0x24,  // DER
  RollUp2:                 0x25,  // RU2
  RollUp3:                 0x26,  // RU3
  RollUp4:                 0x27,  // RU4
  FlashOn:                 0x28,  // FON
  ResumeDirectCaptioning:  0x29,  // RDC  - select paint-on
  TextRestart:             0x2A,  // TR
  ResumeTextDisplay:       0x2B,  // RTD
  EraseDisplayedMemory:    0x2C,  // EDM
  CarriageReturn:          0x2D,  // CR
  EraseNonDisplayedMemory: 0x2E,  // ENM
  EndOfCaption:            0x2F,  // EOC
} as const;
export type ControlCode = (typeof ControlCode)[keyof typeof ControlCode];

/**
 * Encode a misc-control command for the given CC service.
 *
 * Per CTA-608 §3, the first byte for misc control is 0x14 on F1 ch1, with
 * +0x08 added for ch2 and +0x01 added for F2 (so F1 ch2 = 0x1C, F2 ch1 =
 * 0x15, F2 ch2 = 0x1D). Tab Offsets do NOT remap by field; use {@link tab}.
 */
export function controlCommand(cmd: ControlCode, cc: CcChannel): CcWord {
  const channelBit = (cc & 0x01) ? 0x08 : 0x00;
  const fieldBit   = (cc & 0x02) ? 0x01 : 0x00;
  const firstByte  = 0x14 | channelBit | fieldBit;
  return withParityWord((firstByte << 8) | cmd);
}

/**
 * Encode a Tab Offset (TO1, TO2, or TO3): cursor moves right by `size`
 * columns without erasing.
 *
 * Per CTA-608 §3 and §5.3, tabs use first byte 0x17 (ch1) or 0x1F (ch2) on
 * BOTH fields; the field is not encoded in the first byte. Only the
 * in-field channel matters here.
 */
export function tab(size: 1 | 2 | 3, cc: CcChannel): CcWord {
  const channelBit = (cc & 0x01) ? 0x08 : 0x00;
  const firstByte  = 0x17 | channelBit;
  return withParityWord((firstByte << 8) | (0x20 | size));
}
