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

// CEA-708 Text and Control Codes (CTA-708 §7)

export const EXT1 = 0x10;

export const ControlCode708 = {
  Nul: 0x00,
  Etx: 0x03,
  Backspace: 0x08,
  FormFeed: 0x0C,
  CarriageReturn: 0x0D,
  HorizontalCarriageReturn: 0x0E,
} as const;

export type ControlCode708 = (typeof ControlCode708)[keyof typeof ControlCode708];

const G2_MAP: ReadonlyMap<string, number> = new Map([
  ['\u200B', 0x20], // TSP (zero-width space or transparent space)
  ['\u2060', 0x21], // NBTSP (word joiner or non-breaking transparent space)
  ['…', 0x25],
  ['Š', 0x2A],
  ['Œ', 0x2C],
  ['█', 0x30],
  ['‘', 0x31],
  ['’', 0x32],
  ['“', 0x33],
  ['”', 0x34],
  ['•', 0x35],
  ['™', 0x39],
  ['š', 0x3A],
  ['œ', 0x3C],
  ['℠', 0x3D],
  ['Ÿ', 0x3F],
  ['⅛', 0x76],
  ['⅜', 0x77],
  ['⅝', 0x78],
  ['⅞', 0x79],
  ['│', 0x7A],
  ['⎤', 0x7B],
  ['⎣', 0x7C],
  ['─', 0x7D],
  ['⎦', 0x7E],
  ['⎡', 0x7F],
]);

/**
 * Encodes a string into a sequence of CEA-708 character bytecodes.
 * Supports G0, G1, and G2 character sets. Unsupported characters are
 * replaced with an underscore ('_', 0x5F).
 *
 * @param text The string to encode.
 * @returns A Uint8Array of encoded CEA-708 bytecodes.
 */
export function encodeString708(text: string): Uint8Array {
  const out: number[] = [];

  for (const char of text) {
    if (char === '♪') {
      out.push(0x7F);
      continue;
    }

    const code = char.charCodeAt(0);

    if (code >= 0x20 && code <= 0x7E) {
      // G0: Standard ASCII (0x7F is music note, handled above)
      out.push(code);
    } else if (code >= 0xA0 && code <= 0xFF) {
      // G1: Latin-1
      out.push(code);
    } else {
      // Check G2
      const g2Code = G2_MAP.get(char);
      if (g2Code !== undefined) {
        out.push(EXT1);
        out.push(g2Code);
      } else {
        // Unsupported character: substitute with underscore (0x5F)
        out.push(0x5F);
      }
    }
  }

  return new Uint8Array(out);
}

/**
 * Generates a CC logo icon (G3 set).
 */
export function ccLogo(): Uint8Array {
  return new Uint8Array([EXT1, 0xA0]);
}

/**
 * Generates a standalone C0 control code (e.g., CarriageReturn).
 */
export function controlCode(code: ControlCode708): Uint8Array {
  return new Uint8Array([code]);
}
