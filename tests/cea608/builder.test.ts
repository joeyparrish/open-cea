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
  isControlWord,
  doubleControls,
  PopOnBuilder,
  PaintOnBuilder,
  RollUpBuilder,
} from '../../src/cea608/builder.js';
import { ControlCode, controlCommand } from '../../src/cea608/control.js';
import { rowColumnPreamble } from '../../src/cea608/pac.js';
import { basicNaPair } from '../../src/cea608/text.js';

describe('isControlWord', () => {
  it('identifies control words (0x10..0x1F first byte without parity)', () => {
    // 0x14 0x20 -> parity applied is 0x14 0x20
    const cmd = controlCommand(ControlCode.ResumeCaptionLoading, 0);
    expect(isControlWord(cmd)).toBe(true);

    // 0x11 0x40 -> PAC
    const pac = rowColumnPreamble(1, 0, 0, 0);
    expect(isControlWord(pac)).toBe(true);

    // Basic-NA text is not a control word (e.g. 'A' = 0x41)
    const text = basicNaPair(0x41, 0x42);
    expect(isControlWord(text)).toBe(false);
  });
});

describe('doubleControls', () => {
  it('doubles control words but leaves text words alone', () => {
    const cmd = controlCommand(ControlCode.ResumeCaptionLoading, 0);
    const text = basicNaPair(0x41, 0x42);
    const pac = rowColumnPreamble(1, 0, 0, 0);

    const input = [cmd, text, pac];
    const output = doubleControls(input);

    expect(output).toEqual([
      cmd, cmd,
      text,
      pac, pac,
    ]);
  });
});

describe('PopOnBuilder', () => {
  it('generates correct doubled sequences', () => {
    const builder = new PopOnBuilder(0);
    const words = builder.begin();
    const cmd = controlCommand(ControlCode.ResumeCaptionLoading, 0);
    expect(words).toEqual([cmd, cmd]);
  });

  it('generates text with doubled extended characters', () => {
    const builder = new PopOnBuilder(0);
    const words = builder.text('Aü'); // 'A' + fallback 'u' + extended 'ü'
    
    // 'A' and 'u' are packed. Then the extended character (0x12 0x25) is emitted.
    // The extended character has a first byte of 0x12, so it's a control word and must be doubled!
    expect(words.length).toBe(3); // 1 text word, 2 extended control words
    expect(isControlWord(words[1])).toBe(true);
    expect(words[1]).toEqual(words[2]);
  });
});

describe('RollUpBuilder', () => {
  it('generates RU2/3/4 and CR commands', () => {
    const builder = new RollUpBuilder(0, 3);
    const begin = builder.begin();
    expect(begin.length).toBe(2);
    
    const cr = builder.carriageReturn();
    expect(cr.length).toBe(2);
  });
});

describe('PaintOnBuilder', () => {
  it('generates RDC commands', () => {
    const builder = new PaintOnBuilder(2); // F2 ch1
    const begin = builder.begin();
    const cmd = controlCommand(ControlCode.ResumeDirectCaptioning, 2);
    expect(begin).toEqual([cmd, cmd]);
  });
});
