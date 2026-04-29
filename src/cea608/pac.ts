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

// CEA-608 Preamble Address Codes (CTA-608 §5.1, Table 53).
//
// A PAC sets the cursor row, the indent or initial pen attributes, and an
// underline flag in a single byte pair. Field is not encoded in the bytes
// (PACs use the same first byte values on F1 and F2); the in-field channel
// adds 0x08 to the first byte.

import { withParityWord } from './parity.js';
import type { CcWord, Channel, Style, Underline } from './types.js';

/**
 * Row → first-byte (channel 1) mapping per Table 53. Most rows pair up
 * under one first byte and disambiguate via the second byte's high nibble
 * (upper half = first row of the pair, lower half = second). Row 11 is the
 * only unpaired row.
 */
const ROW_TO_FIRST_BYTE_CH1: Readonly<Record<number, number>> = {
   1: 0x11,  2: 0x11,
   3: 0x12,  4: 0x12,
   5: 0x15,  6: 0x15,
   7: 0x16,  8: 0x16,
   9: 0x17, 10: 0x17,
  11: 0x10,
  12: 0x13, 13: 0x13,
  14: 0x14, 15: 0x14,
};

/**
 * Whether a row is the upper half (true) or lower half (false) of its
 * row-pair under a shared first byte. Upper rows use second-byte
 * 0x40..0x5F; lower rows use 0x60..0x7F (add 0x20).
 */
const ROW_IS_UPPER_HALF: Readonly<Record<number, boolean>> = {
   1: true,   2: false,
   3: true,   4: false,
   5: true,   6: false,
   7: true,   8: false,
   9: true,  10: false,
  11: true,
  12: true,  13: false,
  14: true,  15: false,
};

const VALID_COLUMNS: ReadonlySet<number> = new Set([0, 4, 8, 12, 16, 20, 24, 28]);

function pacFirstByte(row: number, channel: Channel): number {
  if (!Object.hasOwn(ROW_TO_FIRST_BYTE_CH1, row)) {
    throw new RangeError(`Invalid PAC row: ${String(row)} (must be 1..15)`);
  }
  const base = ROW_TO_FIRST_BYTE_CH1[row];
  return base | (channel ? 0x08 : 0x00);
}

function pacRowHalfBits(row: number): number {
  return ROW_IS_UPPER_HALF[row] ? 0x00 : 0x20;
}

/**
 * Style-form PAC: row, color/italic, underline. Sets pen attributes
 * without choosing an indent. Cursor lands at column 0 (or wherever the
 * decoder chose to leave it for non-indenting PACs; see §5.1).
 *
 * Second-byte layout (Table 53):
 *   0x40 | (style << 1) | underline       (for upper-half rows)
 *   0x60 | (style << 1) | underline       (for lower-half rows)
 */
export function rowStylePreamble(
  row: number,
  channel: Channel,
  style: Style,
  underline: Underline,
): CcWord {
  const first = pacFirstByte(row, channel);
  const second = 0x40 | pacRowHalfBits(row) | (style << 1) | underline;
  return withParityWord((first << 8) | second);
}

/**
 * Indent-form PAC: row, column (one of 0/4/8/12/16/20/24/28), underline.
 * Implicitly sets color = white, italic = off (per §5.1).
 *
 * Second-byte layout (Table 53):
 *   0x50 | ((column / 4) << 1) | underline   (for upper-half rows)
 *   0x70 | ((column / 4) << 1) | underline   (for lower-half rows)
 *
 * Equivalently: 0x40 | half-bits | (8 + column/4) << 1 | underline.
 */
export function rowColumnPreamble(
  row: number,
  column: number,
  channel: Channel,
  underline: Underline,
): CcWord {
  if (!VALID_COLUMNS.has(column)) {
    throw new RangeError(
      `Invalid PAC column: ${String(column)} (must be one of 0,4,8,12,16,20,24,28)`,
    );
  }
  const first = pacFirstByte(row, channel);
  const indentCode = 8 + (column / 4);  // 8..15
  const second = 0x40 | pacRowHalfBits(row) | (indentCode << 1) | underline;
  return withParityWord((first << 8) | second);
}
