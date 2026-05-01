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

// Index-driven dispatch over CEA-608 character tables (CTA-608 §§4.1–4.3).
//
// Slots are laid out as a flat 176-entry array in the order:
//   0..95    Basic-NA singles (second byte 0x20..0x7F).
//   96..111  Special-NA pair (prefix 0x11/0x19, second byte 0x30..0x3F).
//   112..143 Extended Spanish/Misc/French (prefix 0x12/0x1A,
//            second byte 0x20..0x3F).
//   144..175 Extended Portuguese/German/Danish (prefix 0x13/0x1B,
//            second byte 0x20..0x3F).
// All byte values come from CTA-608-E §§4.1–4.3 directly.

import {
  basicNaSingle,
  extendedChar,
  specialChar,
  type ExtendedGroup,
} from './text.js';
import type { CcWord, Channel } from './types.js';

/** Total number of charmap slots (matches libcaption's EIA608_CHAR_COUNT). */
export const CHARMAP_SIZE = 176;

const BASIC_NA_END = 96;                           // 0..95   Basic-NA singles
const SPECIAL_NA_END = BASIC_NA_END + 16;          // 96..111 Special-NA
const EXTENDED_GROUP_1_END = SPECIAL_NA_END + 32;  // 112..143 Spanish/Misc/French
// Extended group 2 (Portuguese/German/Danish) fills 144..175.

/**
 * Encode the cc word for a charmap index 0..175 in the given in-field
 * channel.
 *
 *   0..95   Basic-NA single, character byte 0x20+i in the high byte
 *           with null low-byte pad. The channel argument is ignored
 *           (Basic-NA characters carry no channel bit on the wire).
 *   96..111 Special-NA, second byte 0x30+(i-96) under prefix 0x11/0x19.
 *   112..143 Extended Spanish/Misc/French, second byte 0x20+(i-112)
 *            under prefix 0x12/0x1A.
 *   144..175 Extended Portuguese/German/Danish, second byte 0x20+(i-144)
 *            under prefix 0x13/0x1B.
 */
export function fromCharmapIndex(index: number, channel: Channel): CcWord {
  if (index < 0 || index >= CHARMAP_SIZE) {
    throw new RangeError(
      `charmap index out of range: ${String(index)} ` +
        `(must be 0..${String(CHARMAP_SIZE - 1)})`,
    );
  }
  if (index < BASIC_NA_END) {
    return basicNaSingle(0x20 + index);
  }
  if (index < SPECIAL_NA_END) {
    return specialChar(0x30 + (index - BASIC_NA_END), channel);
  }
  let group: ExtendedGroup;
  let base: number;
  if (index < EXTENDED_GROUP_1_END) {
    group = 'spanish-french';
    base = SPECIAL_NA_END;
  } else {
    group = 'portuguese-german-danish';
    base = EXTENDED_GROUP_1_END;
  }
  return extendedChar(group, 0x20 + (index - base), channel);
}
