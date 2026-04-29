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

// CEA-608 Mid-Row codes (CTA-608 §5.2, Table 51).
//
// A mid-row code occupies one column on screen as a space and applies the
// new pen attributes to subsequent characters. First byte is 0x11 (ch1) or
// 0x19 (ch2), same on both fields. Second byte 0x20..0x2F encodes:
//   bits 3..1 = style (0..7)
//   bit 0     = underline flag
// Italic styles (style = 7) force color = white (no italic+color combos).

import { withParityWord } from './parity.js';
import type { CcWord, Channel, Style, Underline } from './types.js';

/** Encode a mid-row code for the given in-field channel. */
export function midrowChange(
  channel: Channel,
  style: Style,
  underline: Underline,
): CcWord {
  const first = 0x11 | (channel ? 0x08 : 0x00);
  const second = 0x20 | (style << 1) | underline;
  return withParityWord((first << 8) | second);
}
