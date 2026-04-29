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

import { controlCommand, ControlCode } from './control.js';
import { rowColumnPreamble, rowStylePreamble } from './pac.js';
import { encodeString } from './string.js';
import type { CcChannel, CcWord, Style, Underline } from './types.js';

/**
 * Determines if a CcWord is a control code pair that must be doubled.
 * Any word whose first byte (without parity) is in 0x10..0x1F is a control pair.
 */
export function isControlWord(word: CcWord): boolean {
  const b1 = (word & 0x7F00) >> 8;
  return b1 >= 0x10 && b1 <= 0x1F;
}

/**
 * Replicates any control code words in the array.
 * Per CTA-608 §9.1, all caption and text mode control pairs must be transmitted twice.
 */
export function doubleControls(words: CcWord[]): CcWord[] {
  const out: CcWord[] = [];
  for (const w of words) {
    out.push(w);
    if (isControlWord(w)) {
      out.push(w);
    }
  }
  return out;
}

/**
 * Base class for stateful CEA-608 caption builders.
 * Provides shared primitives for PACs, text encoding, and memory erasure,
 * automatically applying control-pair doubling.
 */
export abstract class CaptionBuilder {
  constructor(public readonly channel: CcChannel) {}

  protected get inFieldChannel(): 0 | 1 {
    return (this.channel & 0x01) as 0 | 1;
  }

  protected format(words: CcWord[]): CcWord[] {
    return doubleControls(words);
  }

  public pac(row: number, column: number, underline: Underline = 0): CcWord[] {
    return this.format([rowColumnPreamble(row, column, this.inFieldChannel, underline)]);
  }

  public pacStyle(row: number, style: Style, underline: Underline = 0): CcWord[] {
    return this.format([rowStylePreamble(row, this.inFieldChannel, style, underline)]);
  }

  public text(text: string): CcWord[] {
    return this.format(encodeString(text, this.inFieldChannel));
  }

  public eraseDisplayed(): CcWord[] {
    return this.format([controlCommand(ControlCode.EraseDisplayedMemory, this.channel)]);
  }

  public eraseNonDisplayed(): CcWord[] {
    return this.format([controlCommand(ControlCode.EraseNonDisplayedMemory, this.channel)]);
  }
}

/**
 * Builds Pop-On style captions.
 * Captions are loaded into non-displayed memory and flipped onto the screen with EndOfCaption.
 */
export class PopOnBuilder extends CaptionBuilder {
  public begin(): CcWord[] {
    return this.format([controlCommand(ControlCode.ResumeCaptionLoading, this.channel)]);
  }

  public end(): CcWord[] {
    return this.format([controlCommand(ControlCode.EndOfCaption, this.channel)]);
  }
}

/**
 * Builds Paint-On style captions.
 * Captions are written directly to displayed memory.
 */
export class PaintOnBuilder extends CaptionBuilder {
  public begin(): CcWord[] {
    return this.format([controlCommand(ControlCode.ResumeDirectCaptioning, this.channel)]);
  }
}

/**
 * Builds Roll-Up style captions.
 * Captions are written to the base row and scrolled upwards by CarriageReturn.
 */
export class RollUpBuilder extends CaptionBuilder {
  constructor(channel: CcChannel, public readonly rows: 2 | 3 | 4) {
    super(channel);
  }

  public begin(): CcWord[] {
    const cmd = this.rows === 2 ? ControlCode.RollUp2 :
                this.rows === 3 ? ControlCode.RollUp3 :
                ControlCode.RollUp4;
    return this.format([controlCommand(cmd, this.channel)]);
  }

  public carriageReturn(): CcWord[] {
    return this.format([controlCommand(ControlCode.CarriageReturn, this.channel)]);
  }
}
