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

import { fromCharmapIndex } from './charmap.js';
import { lookupGlyph } from './glyphs.js';
import { basicNaPair, basicNaSingle } from './text.js';
import type { CcWord, Channel } from './types.js';

// Fallback mapping for the 64 Extended Western European characters.
// Because extended characters are non-printing pairs that auto-backspace,
// we must emit a basic-NA fallback character first. Older decoders show
// the fallback; modern decoders replace it with the extended char.
//
// IMPORTANT: per CTA-608 §4.1 / Annex A, several ASCII byte positions are
// REASSIGNED to accented letters in the Basic-NA character set:
//   0x2A=á  0x5C=é  0x5E=í  0x5F=ó  0x60=ú  0x7B=ç  0x7C=÷  0x7D=Ñ  0x7E=ñ
// So sending byte 0x7C as the fallback for `|` would render `÷` on a
// legacy decoder, not a vertical bar. The fallbacks below pick a
// Basic-NA byte whose CEA-608 glyph is a reasonable visual stand-in;
// where no good stand-in exists we fall back to space (0x20).
//
// Per-glyph reasoning for the non-obvious choices:
//   index 120 (`*`) -> space: 0x2A is reassigned to á; the Special-NA set
//                     has no asterisk, so a leading-space backspace is the
//                     least-bad option.
//   index 156 (`^`) -> space: 0x5E is reassigned to í; '~' / '/' would be
//                     misleading caret stand-ins.
//   index 157 (`_`) -> '-': 0x5F is reassigned to ó; an em-dash is the
//                     closest baseline-adjacent ASCII glyph.
//   index 158 (`|`) -> '!': 0x7C is reassigned to ÷; '!' is the only
//                     basic-NA glyph with a centered vertical stem.
//   index 159 (`~`) -> '-': 0x7E is reassigned to ñ; no diacritic-like
//                     basic-NA glyph exists, so the dash is a neutral
//                     placeholder for legacy renders.
//   index 167 (`⏐`) -> '!': same reasoning as `|`.
//   indices 172..175 (⎡ ⎤ ⎣ ⎦) -> '+': any single ASCII char is wrong;
//                     '+' at least suggests "junction" on a legacy
//                     render.
const EXTENDED_FALLBACKS: ReadonlyMap<number, number> = new Map([
  // Spanish/Misc/French (prefix 0x12/0x1A)
  [112, 0x41], // Á -> A
  [113, 0x45], // É -> E
  [114, 0x4F], // Ó -> O
  [115, 0x55], // Ú -> U
  [116, 0x55], // Ü -> U
  [117, 0x75], // ü -> u
  [118, 0x27], // ‘ -> ' (apostrophe)
  [119, 0x21], // ¡ -> !
  [120, 0x20], // * -> space (Basic-NA 0x2A is reassigned to á)
  [121, 0x27], // ' -> '
  [122, 0x2D], // — -> -
  [123, 0x43], // © -> C
  [124, 0x53], // ℠ -> S
  [125, 0x2D], // ● -> -
  [126, 0x22], // “ -> "
  [127, 0x22], // ” -> "
  [128, 0x41], // À -> A
  [129, 0x41], // Â -> A
  [130, 0x43], // Ç -> C
  [131, 0x45], // È -> E
  [132, 0x45], // Ê -> E
  [133, 0x45], // Ë -> E
  [134, 0x65], // ë -> e
  [135, 0x49], // Î -> I
  [136, 0x49], // Ï -> I
  [137, 0x69], // ï -> i
  [138, 0x4F], // Ô -> O
  [139, 0x55], // Ù -> U
  [140, 0x75], // ù -> u
  [141, 0x55], // Û -> U
  [142, 0x3C], // « -> <
  [143, 0x3E], // » -> >

  // Portuguese/German/Danish (prefix 0x13/0x1B)
  [144, 0x41], // Ã -> A
  [145, 0x61], // ã -> a
  [146, 0x49], // Í -> I
  [147, 0x49], // Ì -> I
  [148, 0x69], // ì -> i
  [149, 0x4F], // Ò -> O
  [150, 0x6F], // ò -> o
  [151, 0x4F], // Õ -> O
  [152, 0x6F], // õ -> o
  [153, 0x28], // { -> (
  [154, 0x29], // } -> )
  [155, 0x2F], // \ -> /
  [156, 0x20], // ^ -> space (Basic-NA 0x5E is reassigned to í)
  [157, 0x2D], // _ -> -      (Basic-NA 0x5F is reassigned to ó)
  [158, 0x21], // | -> !      (Basic-NA 0x7C is reassigned to ÷)
  [159, 0x2D], // ~ -> -      (Basic-NA 0x7E is reassigned to ñ)
  [160, 0x41], // Ä -> A
  [161, 0x61], // ä -> a
  [162, 0x4F], // Ö -> O
  [163, 0x6F], // ö -> o
  [164, 0x42], // ß -> B
  [165, 0x59], // ¥ -> Y
  [166, 0x24], // ¤ -> $
  [167, 0x21], // ⏐ -> !      (Basic-NA 0x7C is reassigned to ÷)
  [168, 0x41], // Å -> A
  [169, 0x61], // å -> a
  [170, 0x4F], // Ø -> O
  [171, 0x6F], // ø -> o
  [172, 0x2B], // ⎡ -> +
  [173, 0x2B], // ⎤ -> +
  [174, 0x2B], // ⎣ -> +
  [175, 0x2B], // ⎦ -> +
]);

/**
 * Encode a UTF-8 string into a sequence of CEA-608 cc_data words.
 *
 * This function handles the stateful packing of Basic-NA characters
 * (two per cc_data word) and the injection of auto-backspace fallback
 * characters for Extended Western European characters.
 *
 * Unmappable characters are replaced with a Basic-NA space (0x20).
 *
 * @param text The UTF-8 string to encode.
 * @param channel The in-field channel (0 or 1) for Special/Extended chars.
 * @returns An array of 16-bit CcWords (with odd parity applied).
 */
export function encodeString(text: string, channel: Channel): CcWord[] {
  const out: CcWord[] = [];
  let bufferedBasic: number | null = null;

  const flushBuffer = () => {
    if (bufferedBasic !== null) {
      out.push(basicNaSingle(bufferedBasic));
      bufferedBasic = null;
    }
  };

  // Iterate over graphemes (we could use Intl.Segmenter for perfect
  // grapheme splitting, but standard string iteration handles surrogate
  // pairs, which is sufficient for our limited charset).
  for (const char of text) {
    const entry = lookupGlyph(char);

    if (!entry) {
      // Unmappable: substitute a space (0x20).
      if (bufferedBasic !== null) {
        out.push(basicNaPair(bufferedBasic, 0x20));
        bufferedBasic = null;
      } else {
        bufferedBasic = 0x20;
      }
      continue;
    }

    if (entry.kind === 'basic') {
      const byte = 0x20 + entry.index;
      if (bufferedBasic !== null) {
        out.push(basicNaPair(bufferedBasic, byte));
        bufferedBasic = null;
      } else {
        bufferedBasic = byte;
      }
    } else if (entry.kind === 'special') {
      flushBuffer();
      out.push(fromCharmapIndex(entry.index, channel));
    } else {
      // Extended characters require a Basic-NA fallback to be emitted first.
      const fallback = EXTENDED_FALLBACKS.get(entry.index) ?? 0x20;
      
      if (bufferedBasic !== null) {
        // Pack the fallback with the currently buffered Basic-NA character.
        out.push(basicNaPair(bufferedBasic, fallback));
        bufferedBasic = null;
      } else {
        // Flush the fallback as a single Basic-NA character.
        out.push(basicNaSingle(fallback));
      }
      // Then emit the Extended character itself.
      out.push(fromCharmapIndex(entry.index, channel));
    }
  }

  flushBuffer();
  return out;
}
