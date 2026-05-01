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
  ccLogo,
  ControlCode708,
  controlCode,
  encodeString708,
  EXT1,
} from '../../src/cea708/text.js';

describe('encodeString708', () => {
  it('encodes G0 standard ASCII', () => {
    const out = encodeString708('Hello 123');
    expect(out).toEqual(new Uint8Array([
      0x48, 0x65, 0x6C, 0x6C, 0x6F, 0x20, 0x31, 0x32, 0x33
    ]));
  });

  it('encodes the music note in G0', () => {
    const out = encodeString708('♪');
    expect(out).toEqual(new Uint8Array([0x7F]));
  });

  it('encodes G1 Latin-1 characters', () => {
    const out = encodeString708('¿Qué?');
    // ¿ = 0xBF, Q = 0x51, u = 0x75, é = 0xE9, ? = 0x3F
    expect(out).toEqual(new Uint8Array([0xBF, 0x51, 0x75, 0xE9, 0x3F]));
  });

  it('encodes G2 extended characters with EXT1 prefix', () => {
    const out = encodeString708('“Hello”');
    // “ = EXT1 + 0x33, H=0x48, e=0x65, l=0x6C, l=0x6C, o=0x6F, ” = EXT1 + 0x34
    expect(out).toEqual(new Uint8Array([
      EXT1, 0x33,
      0x48, 0x65, 0x6C, 0x6C, 0x6F,
      EXT1, 0x34
    ]));
  });

  it('substitutes unmappable characters with an underscore', () => {
    const out = encodeString708('A🚀B');
    // A = 0x41, 🚀 (surrogate pair) -> one underscore (since for...of iterates code points), B = 0x42
    expect(out).toEqual(new Uint8Array([0x41, 0x5F, 0x42]));
  });

  it('translates a literal newline to the CarriageReturn control code', () => {
    const out = encodeString708('A\nB');
    expect(out).toEqual(new Uint8Array([0x41, 0x0D, 0x42]));
  });
});

describe('ccLogo', () => {
  it('encodes the G3 CC logo', () => {
    expect(ccLogo()).toEqual(new Uint8Array([EXT1, 0xA0]));
  });
});

describe('controlCode', () => {
  it('encodes C0 control codes', () => {
    expect(controlCode(ControlCode708.CarriageReturn)).toEqual(new Uint8Array([0x0D]));
    expect(controlCode(ControlCode708.FormFeed)).toEqual(new Uint8Array([0x0C]));
  });
});
