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
  AnchorPoint,
  BorderType,
  Color,
  Direction,
  DisplayEffect,
  Justify,
  Opacity,
} from './types.js';

// Helper to encode a color into bits
function packColor(c: Color): number {
  return ((c.r & 3) << 4) | ((c.g & 3) << 2) | (c.b & 3);
}

/** SetCurrentWindow 0..7 (CW0..CW7) */
export function setCurrentWindow(windowId: number): Uint8Array {
  if (windowId < 0 || windowId > 7) throw new RangeError('Window ID must be 0..7');
  return new Uint8Array([0x80 | windowId]);
}

/** ClearWindows (CLW) */
export function clearWindows(windowBitmap: number): Uint8Array {
  return new Uint8Array([0x88, windowBitmap & 0xFF]);
}

/** DisplayWindows (DSW) */
export function displayWindows(windowBitmap: number): Uint8Array {
  return new Uint8Array([0x89, windowBitmap & 0xFF]);
}

/** HideWindows (HDW) */
export function hideWindows(windowBitmap: number): Uint8Array {
  return new Uint8Array([0x8A, windowBitmap & 0xFF]);
}

/** ToggleWindows (TGW) */
export function toggleWindows(windowBitmap: number): Uint8Array {
  return new Uint8Array([0x8B, windowBitmap & 0xFF]);
}

/** DeleteWindows (DLW) */
export function deleteWindows(windowBitmap: number): Uint8Array {
  return new Uint8Array([0x8C, windowBitmap & 0xFF]);
}

export interface WindowAttributes {
  fillColor: Color;
  fillOpacity: Opacity;
  borderColor: Color;
  borderType: BorderType;
  printDirection: Direction;
  scrollDirection: Direction;
  justify: Justify;
  effectDirection: Direction;
  effectSpeed: number; // 1..15
  displayEffect: DisplayEffect;
}

/**
 * SetWindowAttributes (SWA), CTA-708 §7.13.
 *
 * The wordwrap bit (parm3 b6) is forced to 0 per §6.4: encoders MUST
 * set it to 0 in CEA-708-E. Cursor only moves between rows on CR, FF,
 * or SPL. Enabling wordwrap would produce a non-conformant stream, so
 * it is not exposed in the API.
 */
export function setWindowAttributes(attr: WindowAttributes): Uint8Array {
  const p1 = ((attr.fillOpacity & 3) << 6) | packColor(attr.fillColor);
  const p2 = ((attr.borderType & 3) << 6) | packColor(attr.borderColor);
  const btMsb = (attr.borderType >> 2) & 1;
  const p3 = (btMsb << 7) |
             // bit 6: wordwrap - forced to 0 per §6.4
             ((attr.printDirection & 3) << 4) |
             ((attr.scrollDirection & 3) << 2) |
             (attr.justify & 3);
  const speed = attr.effectSpeed < 1 ? 1 : (attr.effectSpeed > 15 ? 15 : attr.effectSpeed);
  const p4 = ((speed & 15) << 4) |
             ((attr.effectDirection & 3) << 2) |
             (attr.displayEffect & 3);
  
  return new Uint8Array([0x97, p1, p2, p3, p4]);
}

export interface WindowDefinition {
  windowId: number; // 0..7
  priority: number; // 0..7
  anchorVertical: number;
  anchorHorizontal: number;
  anchorPoint: AnchorPoint;
  relativePositioning: boolean;
  rowCount: number; // 1..15
  columnCount: number; // 1..42
  visible: boolean;
  windowStyleId: number; // 0..7
  penStyleId: number; // 0..7
}

/** DefineWindow (DF0..DF7) */
export function defineWindow(def: WindowDefinition): Uint8Array {
  if (def.windowId < 0 || def.windowId > 7) throw new RangeError('Window ID must be 0..7');
  
  const p1 = 0x00 |
             ((def.visible ? 1 : 0) << 5) |
             (1 << 4) | // row lock forced to 1
             (1 << 3) | // column lock forced to 1
             (def.priority & 7);
             
  const p2 = ((def.relativePositioning ? 1 : 0) << 7) |
             (def.anchorVertical & 0x7F);
             
  const p3 = def.anchorHorizontal & 0xFF;
  
  const rc = def.rowCount < 1 ? 1 : (def.rowCount > 15 ? 15 : def.rowCount);
  const p4 = ((def.anchorPoint & 15) << 4) |
             ((rc - 1) & 15);
             
  const cc = def.columnCount < 1 ? 1 : (def.columnCount > 42 ? 42 : def.columnCount);
  const p5 = (cc - 1) & 0x3F;
  
  const p6 = ((def.windowStyleId & 7) << 3) |
             (def.penStyleId & 7);
             
  return new Uint8Array([0x98 | def.windowId, p1, p2, p3, p4, p5, p6]);
}
