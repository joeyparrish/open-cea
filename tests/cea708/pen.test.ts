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
  delay,
  delayCancel,
  reset,
  setPenAttributes,
  setPenColor,
  setPenLocation,
} from '../../src/cea708/pen.js';
import { EdgeType, Offset, Opacity, PenSize } from '../../src/cea708/types.js';

describe('CEA-708 Pen and Misc Commands', () => {
  it('encodes Delay (DLY)', () => {
    expect(delay(10)).toEqual(new Uint8Array([0x8D, 10]));
  });

  it('encodes DelayCancel (DLC)', () => {
    expect(delayCancel()).toEqual(new Uint8Array([0x8E]));
  });

  it('encodes Reset (RST)', () => {
    expect(reset()).toEqual(new Uint8Array([0x8F]));
  });

  it('encodes SetPenAttributes (SPA)', () => {
    const out = setPenAttributes({
      penSize: PenSize.Large, // 2
      offset: Offset.Normal, // 1
      textTag: 0, // Dialog
      fontStyle: 2, // Proportional with serifs
      edgeType: EdgeType.Uniform, // 3
      underline: true,
      italics: false,
    });

    // p1 = tag(0000) | offset(01) | size(10) -> 0x06
    expect(out[1]).toBe(0x06);
    // p2 = i(0) | u(1) | edge(011) | font(010) -> 0101 1010 = 0x5A
    expect(out[2]).toBe(0x5A);
    expect(out[0]).toBe(0x90);
  });

  it('encodes SetPenColor (SPC)', () => {
    const out = setPenColor({
      foregroundColor: { r: 2, g: 2, b: 2 }, // White
      foregroundOpacity: Opacity.Solid, // 0
      backgroundColor: { r: 0, g: 0, b: 0 }, // Black
      backgroundOpacity: Opacity.Translucent, // 2
      edgeColor: { r: 0, g: 2, b: 2 }, // Cyan
    });

    // p1 = fg_op(00) | fg_c(10 10 10) -> 0010 1010 = 0x2A
    expect(out[1]).toBe(0x2A);
    // p2 = bg_op(10) | bg_c(00 00 00) -> 1000 0000 = 0x80
    expect(out[2]).toBe(0x80);
    // p3 = 00 | edge_c(00 10 10) -> 0000 1010 = 0x0A
    expect(out[3]).toBe(0x0A);
    expect(out[0]).toBe(0x91);
  });

  it('encodes SetPenLocation (SPL)', () => {
    const out = setPenLocation(5, 10);
    expect(out).toEqual(new Uint8Array([0x92, 5, 10]));
  });
});
