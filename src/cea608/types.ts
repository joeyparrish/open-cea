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

// Shared CEA-608 type definitions.

/** A 16-bit cc_data word: high byte then low byte, parity included. */
export type CcWord = number;

/**
 * In-field channel selector (CTA-608 §3): 0 selects the primary data
 * channel within a field, 1 selects the secondary. The encoded first
 * byte gains 0x08 when channel = 1.
 */
export type Channel = 0 | 1;

/**
 * Logical CC1..CC4 selector packed as 2 bits:
 *   bit 0 = in-field channel (0 = primary, 1 = secondary)
 *   bit 1 = field            (0 = F1,      1 = F2)
 *
 *   0 = CC1 (F1, ch1)    1 = CC2 (F1, ch2)
 *   2 = CC3 (F2, ch1)    3 = CC4 (F2, ch2)
 */
export type CcChannel = 0 | 1 | 2 | 3;

/** Pen color or italics, as encoded in PAC and mid-row second bytes. */
export const Style = {
  White:    0,
  Green:    1,
  Blue:     2,
  Cyan:     3,
  Red:      4,
  Yellow:   5,
  Magenta:  6,
  Italics:  7,
} as const;
export type Style = (typeof Style)[keyof typeof Style];

/** Underline flag: occupies the LSB of the second byte in PACs and mid-row. */
export type Underline = 0 | 1;
