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

// Background and foreground attribute codes (CTA-608 §4.4, Table 3).
//
// These are an OPTIONAL extension added by EIA-608-D — they are not part
// of the FCC-mandated decoder profile (§11). The conventional encoder
// idiom is to send a Basic-NA space (0x20) immediately before the
// attribute pair. Legacy decoders display the space and silently ignore
// the attribute pair; conforming decoders backspace and replace the
// space with a colored or pen-attributed cell.
//
// Two prefix bytes are involved:
//   0x10 / 0x18  - background-color attributes (BWO..BAS, second byte
//                  0x20..0x2F).
//   0x17 / 0x1F  - background-transparent (BT, 0x2D), foreground-black
//                  (FA, 0x2E), and foreground-black underlined (FAU,
//                  0x2F). The same prefix carries Tab Offsets at
//                  second-byte 0x21..0x23, which are emitted via the
//                  separate `tab()` helper in control.js.
//
// Field is implicit: F1 and F2 use the same first-byte values (no
// remap; only Misc Control Codes have the F1->F2 remap, per §3).

import { withParityWord } from './parity.js';
import type { CcWord, Channel } from './types.js';

/**
 * Background colors (CTA-608 §4.4, Table 3). Note: index 7 is Black,
 * not Italics — the value space differs from the {@link Style} enum
 * even though indices 0..6 happen to match.
 */
export const BackgroundColor = {
  White:    0,
  Green:    1,
  Blue:     2,
  Cyan:     3,
  Red:      4,
  Yellow:   5,
  Magenta:  6,
  Black:    7,
} as const;
export type BackgroundColor = (typeof BackgroundColor)[keyof typeof BackgroundColor];

/** Background opacity: opaque or semi-transparent (default = opaque). */
export type BackgroundOpacity = 'opaque' | 'semi-transparent';

/**
 * Encode a background-color attribute (BWO..BAS).
 *
 * Second byte: 0x20 | (color << 1) | (semi-transparent ? 1 : 0).
 * White Opaque = 0x20, Black Semi-transparent = 0x2F.
 *
 * Prefix byte: 0x10 (ch1) or 0x18 (ch2), same on both fields.
 */
export function backgroundAttribute(
  color: BackgroundColor,
  opacity: BackgroundOpacity,
  channel: Channel,
): CcWord {
  const firstByte  = 0x10 | (channel ? 0x08 : 0x00);
  const secondByte = 0x20 | (color << 1) | (opacity === 'semi-transparent' ? 1 : 0);
  return withParityWord((firstByte << 8) | secondByte);
}

function attribute17(secondByte: number, channel: Channel): CcWord {
  const firstByte = 0x17 | (channel ? 0x08 : 0x00);
  return withParityWord((firstByte << 8) | secondByte);
}

/** Background Transparent (BT). Prefix 0x17/0x1F, second byte 0x2D. */
export function backgroundTransparent(channel: Channel): CcWord {
  return attribute17(0x2D, channel);
}

/**
 * Foreground Black (FA). Prefix 0x17/0x1F, second byte 0x2E.
 *
 * Per §4.4: when used, encoders must precede FA with a non-black
 * background to avoid black-on-black. This helper does not enforce
 * that — it just emits the attribute pair.
 */
export function foregroundBlack(channel: Channel): CcWord {
  return attribute17(0x2E, channel);
}

/**
 * Foreground Black + Underline (FAU). Prefix 0x17/0x1F, second byte
 * 0x2F. Same precaution as {@link foregroundBlack}.
 */
export function foregroundBlackUnderlined(channel: Channel): CcWord {
  return attribute17(0x2F, channel);
}
