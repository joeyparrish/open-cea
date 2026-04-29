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

import {
  Color,
  EdgeType,
  Offset,
  Opacity,
  PenSize,
} from './types.js';

// Helper to encode a color into bits
function packColor(c: Color): number {
  return ((c.r & 3) << 4) | ((c.g & 3) << 2) | (c.b & 3);
}

/** Delay (DLY) - Suspends processing for `tenths` of a second (1..255). */
export function delay(tenths: number): Uint8Array {
  const t = tenths < 1 ? 1 : (tenths > 255 ? 255 : tenths);
  return new Uint8Array([0x8D, t]);
}

/** DelayCancel (DLC) */
export function delayCancel(): Uint8Array {
  return new Uint8Array([0x8E]);
}

/** Reset (RST) */
export function reset(): Uint8Array {
  return new Uint8Array([0x8F]);
}

export interface PenAttributes {
  penSize: PenSize;
  offset: Offset;
  textTag: number; // 0..15
  fontStyle: number; // 0..7
  edgeType: EdgeType;
  underline: boolean;
  italics: boolean;
}

/** SetPenAttributes (SPA) */
export function setPenAttributes(attr: PenAttributes): Uint8Array {
  const p1 = ((attr.textTag & 15) << 4) |
             ((attr.offset & 3) << 2) |
             (attr.penSize & 3);
             
  const p2 = ((attr.italics ? 1 : 0) << 7) |
             ((attr.underline ? 1 : 0) << 6) |
             ((attr.edgeType & 7) << 3) |
             (attr.fontStyle & 7);
             
  return new Uint8Array([0x90, p1, p2]);
}

export interface PenColor {
  foregroundColor: Color;
  foregroundOpacity: Opacity;
  backgroundColor: Color;
  backgroundOpacity: Opacity;
  edgeColor: Color;
}

/** SetPenColor (SPC) */
export function setPenColor(color: PenColor): Uint8Array {
  const p1 = ((color.foregroundOpacity & 3) << 6) | packColor(color.foregroundColor);
  const p2 = ((color.backgroundOpacity & 3) << 6) | packColor(color.backgroundColor);
  const p3 = packColor(color.edgeColor); // Top 2 bits are 0
  
  return new Uint8Array([0x91, p1, p2, p3]);
}

/** SetPenLocation (SPL) */
export function setPenLocation(row: number, column: number): Uint8Array {
  const r = row < 0 ? 0 : (row > 14 ? 14 : row);
  const c = column < 0 ? 0 : (column > 41 ? 41 : column);
  return new Uint8Array([0x92, r & 15, c & 63]);
}
