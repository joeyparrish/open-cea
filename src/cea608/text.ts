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

// CEA-608 Basic North American character encoding (CTA-608 §4.1, Table 50).
//
// Two printable Basic-NA bytes (each in 0x20..0x7F) pack directly into one
// cc_data word, high byte first. Channel information is NOT encoded in the
// bytes themselves; the channel is determined by the most recent control
// pair on the stream.

import { withParityWord } from './parity.js';
import type { CcWord } from './types.js';

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
