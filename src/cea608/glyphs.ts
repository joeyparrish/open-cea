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

// CEA-608 glyph table and UTF-8 -> charmap-index reverse lookup.
//
// Glyph data is transcribed from CTA-608 §4.1 (Basic North American,
// Annex A substitutions), §4.2 (Special North American, Table 49), and
// §4.3 (Extended Western European, Tables 5–10). One entry per
// charmap slot 0..175.
//
// Index 105 (Special-NA second byte 0x39) is the "transparent space"
// in the spec — a one-column-wide character whose underlying video
// shows through. We map it to U+00A0 NO-BREAK SPACE so it round-trips,
// but the reverse lookup deliberately omits it: a typed ' ' should
// always map to Basic-NA 0x20, not to a transparent special.

import { CHARMAP_SIZE } from './charmap.js';

/** Kind of cc-word a glyph encodes to. */
export type GlyphKind = 'basic' | 'special' | 'extended';

const BASIC_NA_END = 96;
const SPECIAL_NA_END = BASIC_NA_END + 16;

function buildGlyphs(): readonly string[] {
  const g: string[] = new Array<string>(CHARMAP_SIZE);

  // Basic-NA: ASCII at the same code point, with §4.1 / Annex A
  // substitutions for the slots that CEA-608 reassigns to accented
  // letters and the solid-block.
  for (let i = 0; i < 96; i++) {
    g[i] = String.fromCharCode(0x20 + i);
  }
  g[0x2A - 0x20] = 'á';  // á
  g[0x5C - 0x20] = 'é';  // é
  g[0x5E - 0x20] = 'í';  // í
  g[0x5F - 0x20] = 'ó';  // ó
  g[0x60 - 0x20] = 'ú';  // ú
  g[0x7B - 0x20] = 'ç';  // ç
  g[0x7C - 0x20] = '÷';  // ÷
  g[0x7D - 0x20] = 'Ñ';  // Ñ
  g[0x7E - 0x20] = 'ñ';  // ñ
  g[0x7F - 0x20] = '■';  // ■

  // Special-NA (§4.2 Table 49), 16 entries, second byte 0x30..0x3F.
  g[ 96] = '®';   // ®
  g[ 97] = '°';   // °
  g[ 98] = '½';   // ½
  g[ 99] = '¿';   // ¿
  g[100] = '™';   // ™
  g[101] = '¢';   // ¢
  g[102] = '£';   // £
  g[103] = '♪';   // ♪
  g[104] = 'à';   // à
  g[105] = ' ';   // transparent space (round-trip only; see header)
  g[106] = 'è';   // è
  g[107] = 'â';   // â
  g[108] = 'ê';   // ê
  g[109] = 'î';   // î
  g[110] = 'ô';   // ô
  g[111] = 'û';   // û

  // Extended Spanish/Misc/French (§4.3, Tables 5–7), prefix 0x12/0x1A.
  g[112] = 'Á';   // Á
  g[113] = 'É';   // É
  g[114] = 'Ó';   // Ó
  g[115] = 'Ú';   // Ú
  g[116] = 'Ü';   // Ü
  g[117] = 'ü';   // ü
  g[118] = '‘';   // ‘ left single quote
  g[119] = '¡';   // ¡
  g[120] = '*';
  g[121] = "'";        // apostrophe
  g[122] = '—';   // — em dash
  g[123] = '©';   // ©
  g[124] = '℠';   // ℠
  g[125] = '●';   // ● bullet (full circle per spec digest)
  g[126] = '“';   // “ left double quote
  g[127] = '”';   // ” right double quote
  g[128] = 'À';   // À
  g[129] = 'Â';   // Â
  g[130] = 'Ç';   // Ç
  g[131] = 'È';   // È
  g[132] = 'Ê';   // Ê
  g[133] = 'Ë';   // Ë
  g[134] = 'ë';   // ë
  g[135] = 'Î';   // Î
  g[136] = 'Ï';   // Ï
  g[137] = 'ï';   // ï
  g[138] = 'Ô';   // Ô
  g[139] = 'Ù';   // Ù
  g[140] = 'ù';   // ù
  g[141] = 'Û';   // Û
  g[142] = '«';   // «
  g[143] = '»';   // »

  // Extended Portuguese/German/Danish (§4.3, Tables 8–10), prefix 0x13/0x1B.
  g[144] = 'Ã';   // Ã
  g[145] = 'ã';   // ã
  g[146] = 'Í';   // Í
  g[147] = 'Ì';   // Ì
  g[148] = 'ì';   // ì
  g[149] = 'Ò';   // Ò
  g[150] = 'ò';   // ò
  g[151] = 'Õ';   // Õ
  g[152] = 'õ';   // õ
  g[153] = '{';
  g[154] = '}';
  g[155] = '\\';
  g[156] = '^';
  g[157] = '_';
  g[158] = '|';
  g[159] = '~';
  g[160] = 'Ä';   // Ä
  g[161] = 'ä';   // ä
  g[162] = 'Ö';   // Ö
  g[163] = 'ö';   // ö
  g[164] = 'ß';   // ß
  g[165] = '¥';   // ¥
  g[166] = '¤';   // ¤
  g[167] = '⏐';   // ⏐ vertical-line extension (full-cell connector)
  g[168] = 'Å';   // Å
  g[169] = 'å';   // å
  g[170] = 'Ø';   // Ø
  g[171] = 'ø';   // ø
  // Table 10's "corner pieces" intended to combine with em-dash and the
  // vertical-line connector to draw boxes. The spec digest writes them
  // as bracket-corners (U+23A1, U+23A4, U+23A3, U+23A6); use the same
  // glyphs here so the round-trip table matches the spec verbatim.
  g[172] = '⎡';   // upper-left corner
  g[173] = '⎤';   // upper-right corner
  g[174] = '⎣';   // lower-left corner
  g[175] = '⎦';   // lower-right corner
  return g;
}

const GLYPHS: readonly string[] = buildGlyphs();

/** Glyph at a given charmap index, as a UTF-8 string. */
export function glyphAt(index: number): string {
  if (index < 0 || index >= CHARMAP_SIZE) {
    throw new RangeError(`charmap index out of range: ${String(index)}`);
  }
  return GLYPHS[index] ?? '';
}

interface ReverseEntry {
  readonly kind: GlyphKind;
  readonly index: number;
}

function buildReverseMap(): ReadonlyMap<string, ReverseEntry> {
  const m = new Map<string, ReverseEntry>();
  // Insert Basic-NA first so any glyph also reachable through Special
  // or Extended (e.g. apostrophe at both 0x27 and 0x12 0x29) keeps its
  // shorter Basic-NA encoding.
  for (let i = 0; i < BASIC_NA_END; i++) {
    m.set(GLYPHS[i] ?? '', { kind: 'basic', index: i });
  }
  for (let i = BASIC_NA_END; i < SPECIAL_NA_END; i++) {
    if (i === 105) continue;  // transparent space, see file header
    const g = GLYPHS[i] ?? '';
    if (!m.has(g)) m.set(g, { kind: 'special', index: i });
  }
  for (let i = SPECIAL_NA_END; i < CHARMAP_SIZE; i++) {
    const g = GLYPHS[i] ?? '';
    if (!m.has(g)) m.set(g, { kind: 'extended', index: i });
  }
  return m;
}

const REVERSE: ReadonlyMap<string, ReverseEntry> = buildReverseMap();

/**
 * Look up the encoding for a single UTF-8 codepoint string. Returns
 * `undefined` if the codepoint is not representable in CEA-608.
 */
export function lookupGlyph(grapheme: string): ReverseEntry | undefined {
  return REVERSE.get(grapheme);
}
