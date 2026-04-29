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

import { describe, expect, it } from 'vitest';
import {
  AnchorPoint,
  BorderType,
  Direction,
  DisplayEffect,
  Justify,
  Opacity,
} from '../../src/cea708/types.js';
import {
  setCurrentWindow,
  clearWindows,
  displayWindows,
  hideWindows,
  toggleWindows,
  deleteWindows,
  setWindowAttributes,
  defineWindow,
} from '../../src/cea708/window.js';

describe('CEA-708 Window Commands', () => {
  it('encodes SetCurrentWindow (CW0..CW7)', () => {
    expect(setCurrentWindow(0)).toEqual(new Uint8Array([0x80]));
    expect(setCurrentWindow(7)).toEqual(new Uint8Array([0x87]));
    expect(() => setCurrentWindow(8)).toThrow();
  });

  it('encodes bitmap window commands', () => {
    // Binary 01010101 = 0x55 (windows 0, 2, 4, 6)
    expect(clearWindows(0x55)).toEqual(new Uint8Array([0x88, 0x55]));
    expect(displayWindows(0xAA)).toEqual(new Uint8Array([0x89, 0xAA]));
    expect(hideWindows(0x01)).toEqual(new Uint8Array([0x8A, 0x01]));
    expect(toggleWindows(0xFF)).toEqual(new Uint8Array([0x8B, 0xFF]));
    expect(deleteWindows(0x00)).toEqual(new Uint8Array([0x8C, 0x00]));
  });

  it('encodes SetWindowAttributes (SWA)', () => {
    const out = setWindowAttributes({
      fillColor: { r: 2, g: 0, b: 0 }, // Red
      fillOpacity: Opacity.Solid, // 0
      borderColor: { r: 0, g: 2, b: 0 }, // Green
      borderType: BorderType.Raised, // 1
      printDirection: Direction.LeftToRight, // 0
      scrollDirection: Direction.BottomToTop, // 3
      justify: Justify.Left, // 0
      effectDirection: Direction.RightToLeft, // 1
      effectSpeed: 5,
      displayEffect: DisplayEffect.Snap, // 0
    });

    // p1 = fill opacity (00) | fill color R(10) G(00) B(00) -> 0x20
    expect(out[1]).toBe(0x20);
    // p2 = border type LSBs (01) | border color R(00) G(10) B(00) -> 01 00 10 00 = 0x48
    expect(out[2]).toBe(0x48);
    // p3 = border type MSB(0) | ww(0) | print LTR(00) | scroll BTT(11) | justify LEFT(00) -> 0000 1100 = 0x0C
    expect(out[3]).toBe(0x0C);
    // p4 = speed 5 (0101) | effect RTL(01) | effect SNAP(00) -> 0101 0100 = 0x54
    expect(out[4]).toBe(0x54);
    expect(out[0]).toBe(0x97);
  });

  it('encodes DefineWindow (DF0..DF7)', () => {
    const out = defineWindow({
      windowId: 3,
      priority: 5,
      anchorVertical: 70,
      anchorHorizontal: 150,
      anchorPoint: AnchorPoint.BottomCenter, // 7
      relativePositioning: false,
      rowCount: 3,
      columnCount: 32,
      visible: true,
      windowStyleId: 1,
      penStyleId: 1,
    });

    expect(out[0]).toBe(0x9B); // 0x98 + 3
    // p1 = 00 | visible(1) | row-lock(1) | col-lock(1) | priority(101) -> 0011 1101 = 0x3D
    expect(out[1]).toBe(0x3D);
    // p2 = relative(0) | vertical(70 = 0x46) -> 0x46
    expect(out[2]).toBe(0x46);
    // p3 = horizontal(150 = 0x96)
    expect(out[3]).toBe(0x96);
    // p4 = anchor pt(0111) | row count-1 (2 = 0010) -> 0111 0010 = 0x72
    expect(out[4]).toBe(0x72);
    // p5 = 00 | col count-1 (31 = 011111) -> 0001 1111 = 0x1F
    expect(out[5]).toBe(0x1F);
    // p6 = 00 | window style(001) | pen style(001) -> 0000 1001 = 0x09
    expect(out[6]).toBe(0x09);
  });
});
