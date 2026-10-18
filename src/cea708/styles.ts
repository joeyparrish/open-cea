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

import type { WindowAttributes } from './window.js';
import type { PenAttributes, PenColor } from './pen.js';
import {
  BorderType,
  DisplayEffect,
  Direction,
  EdgeType,
  Justify,
  Offset,
  Opacity,
  PenSize,
} from './types.js';

// Predefined window and pen styles, the presets DefineWindow loads for
// a nonzero window / pen style ID (CTA-708-E section 8.10.5.2, Tables
// 26 and 27). Where the tables give "n/a" (fill color of a transparent
// window, effect direction / speed of a SNAP window, border color of a
// borderless window, background color of a transparent pen, edge color
// of an edgeless pen) the value has no visible effect; it is filled
// with black / LEFT_TO_RIGHT / speed 1 so the preset is a complete
// SetWindowAttributes / SetPenColor argument.

const BLACK = { r: 0, g: 0, b: 0 } as const;
const WHITE = { r: 2, g: 2, b: 2 } as const;

function windowStyle(
  justify: Justify,
  printDirection: Direction,
  scrollDirection: Direction,
  fillOpacity: Opacity,
): WindowAttributes {
  return {
    fillColor: BLACK,
    fillOpacity,
    borderColor: BLACK,
    borderType: BorderType.None,
    printDirection,
    scrollDirection,
    justify,
    effectDirection: Direction.LeftToRight,
    effectSpeed: 1,
    displayEffect: DisplayEffect.Snap,
  };
}

const L2R = Direction.LeftToRight;
const B2T = Direction.BottomToTop;

// Table 26, styles 1..7. Styles 4..6 carry wordwrap=YES in the table,
// but wordwrap is forced to 0 in CTA-708-E (section 8.10.5.8), so they
// differ from 1..3 only by name.
const WINDOW_STYLES: readonly WindowAttributes[] = [
  windowStyle(Justify.Left, L2R, B2T, Opacity.Solid),        // 1 NTSC pop-up
  windowStyle(Justify.Left, L2R, B2T, Opacity.Transparent),  // 2 pop-up, transparent
  windowStyle(Justify.Center, L2R, B2T, Opacity.Solid),      // 3 centered pop-up
  windowStyle(Justify.Left, L2R, B2T, Opacity.Solid),        // 4 NTSC roll-up
  windowStyle(Justify.Left, L2R, B2T, Opacity.Transparent),  // 5 roll-up, transparent
  windowStyle(Justify.Center, L2R, B2T, Opacity.Solid),      // 6 centered roll-up
  windowStyle(Justify.Left, Direction.TopToBottom, Direction.RightToLeft, Opacity.Solid), // 7 ticker
];

export interface PenStyle {
  attributes: PenAttributes;
  color: PenColor;
}

function penStyle(fontStyle: number, edgeType: EdgeType, backgroundOpacity: Opacity): PenStyle {
  return {
    attributes: {
      penSize: PenSize.Standard,
      offset: Offset.Normal,
      textTag: 0, // Dialog
      fontStyle,
      edgeType,
      underline: false,
      italics: false,
    },
    color: {
      foregroundColor: WHITE,
      foregroundOpacity: Opacity.Solid,
      backgroundColor: BLACK,
      backgroundOpacity,
      edgeColor: BLACK,
    },
  };
}

// Table 27, styles 1..7.
const PEN_STYLES: readonly PenStyle[] = [
  penStyle(0, EdgeType.None, Opacity.Solid),           // 1 default
  penStyle(1, EdgeType.None, Opacity.Solid),           // 2 mono serif
  penStyle(2, EdgeType.None, Opacity.Solid),           // 3 prop serif
  penStyle(3, EdgeType.None, Opacity.Solid),           // 4 mono sans
  penStyle(4, EdgeType.None, Opacity.Solid),           // 5 prop sans
  penStyle(3, EdgeType.Uniform, Opacity.Transparent),  // 6 mono sans, bordered
  penStyle(4, EdgeType.Uniform, Opacity.Transparent),  // 7 prop sans, bordered
];

function styleIndex(id: number): number {
  if (!Number.isInteger(id) || id < 0 || id > 7) {
    throw new RangeError(`Style ID must be 0..7, got ${String(id)}`);
  }
  // A style ID of 0 on window creation selects style 1 (CTA-708-E
  // section 8.10.5.2).
  return id === 0 ? 0 : id - 1;
}

/** Window attributes DefineWindow preloads for `windowStyleId`. */
export function windowStylePreset(windowStyleId: number): WindowAttributes {
  return WINDOW_STYLES[styleIndex(windowStyleId)];
}

/** Pen attributes and color DefineWindow preloads for `penStyleId`. */
export function penStylePreset(penStyleId: number): PenStyle {
  return PEN_STYLES[styleIndex(penStyleId)];
}
