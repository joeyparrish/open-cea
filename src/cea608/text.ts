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

// CEA-608 character encoders.
//
//   §4.1  Basic North American (printable bytes 0x20..0x7F)
//   §4.2  Special North American (16 chars, second byte 0x30..0x3F)
//   §4.3  Extended Western European (64 chars across two prefix groups)
//
// Channel: Basic-NA bytes carry NO channel marker on the wire; the
// channel is set by the most recent control pair. The Special-NA and
// Extended-WE encoders DO carry a channel bit in the first byte (+0x08
// for in-field channel 1).

import { withParityWord } from './parity.js';
import type { CcWord, Channel } from './types.js';

function assertBasicNa(byte: number, position: string): void {
  if (byte < 0x20 || byte > 0x7F) {
    throw new RangeError(
      `Basic-NA byte (${position}) out of range: ` +
        `0x${byte.toString(16)} (must be 0x20..0x7F)`,
    );
  }
}

/** Pack two Basic-NA bytes (0x20..0x7F) into a single cc_data word. */
export function basicNaPair(first: number, second: number): CcWord {
  assertBasicNa(first, 'first');
  assertBasicNa(second, 'second');
  return withParityWord((first << 8) | second);
}

/**
 * Encode a single Basic-NA character with a null pad in the low byte.
 *
 * Useful when an odd number of characters needs to be flushed; the wire
 * is byte-pair-aligned, so a single character must share its pair with
 * a null. Returns `(charByte << 8) | 0x00` with parity applied. The
 * channel is NOT encoded (Basic-NA characters carry no channel bit).
 */
export function basicNaSingle(charByte: number): CcWord {
  assertBasicNa(charByte, 'single');
  return withParityWord((charByte << 8) | 0x00);
}

/**
 * Encode a Special-NA character (CTA-608 §4.2, Table 49).
 *
 * Prefix byte: 0x11 (ch1) or 0x19 (ch2). Second byte 0x30..0x3F selects
 * the glyph (registered mark, degree, fractions, music note, accented
 * lowercase vowels, etc.). Same first byte on F1 and F2; field is
 * implicit from line position.
 */
export function specialChar(secondByte: number, channel: Channel): CcWord {
  if (secondByte < 0x30 || secondByte > 0x3F) {
    throw new RangeError(
      `Special-NA second byte out of range: ` +
        `0x${secondByte.toString(16)} (must be 0x30..0x3F)`,
    );
  }
  const firstByte = 0x11 | (channel ? 0x08 : 0x00);
  return withParityWord((firstByte << 8) | secondByte);
}

/**
 * Selector for the two Extended Western European tables (CTA-608 §4.3).
 *
 *   'spanish-french'           — prefix 0x12 (ch1) / 0x1A (ch2).
 *                                Tables 5–7: Spanish (2nd byte 0x20..0x27),
 *                                Misc (0x28..0x2F), French (0x30..0x3F).
 *   'portuguese-german-danish' — prefix 0x13 (ch1) / 0x1B (ch2).
 *                                Tables 8–10: Portuguese (2nd byte
 *                                0x20..0x2F), German/misc (0x30..0x37),
 *                                Danish/box-drawing (0x38..0x3F).
 */
export type ExtendedGroup = 'spanish-french' | 'portuguese-german-danish';

/**
 * Encode an Extended Western European character.
 *
 * Per §4.3 the wire encoding carries an implicit auto-backspace: the
 * decoder moves the cursor left one column and overwrites the previous
 * cell with the extended glyph. The conventional sender pattern is to
 * emit a Basic-NA fallback character first and then this pair; legacy
 * decoders ignore the pair, modern decoders backspace and replace.
 * This function only emits the extended pair itself; the fallback
 * character is the caller's responsibility.
 */
export function extendedChar(
  group: ExtendedGroup,
  secondByte: number,
  channel: Channel,
): CcWord {
  if (secondByte < 0x20 || secondByte > 0x3F) {
    throw new RangeError(
      `Extended-char second byte out of range: ` +
        `0x${secondByte.toString(16)} (must be 0x20..0x3F)`,
    );
  }
  const groupPrefix = group === 'spanish-french' ? 0x12 : 0x13;
  const firstByte = groupPrefix | (channel ? 0x08 : 0x00);
  return withParityWord((firstByte << 8) | secondByte);
}
