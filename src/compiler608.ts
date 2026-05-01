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

import { Encoder, type FrameRate } from './encoder.js';
import { tab } from './cea608/control.js';
import {
  CaptionBuilder,
  PaintOnBuilder,
  PopOnBuilder,
  RollUpBuilder,
  doubleControls,
} from './cea608/builder.js';
import type { CaptionEvent, CaptionTimeline } from './timeline.js';
import type { CcChannel, CcWord } from './cea608/types.js';

export type CcChannelName = 'CC1' | 'CC2' | 'CC3' | 'CC4';
export type Cea608Style = 'pop-on' | 'paint-on' | 'roll-up';

export interface Compiler608Options {
  fps: FrameRate;
  style: Cea608Style;
  channel?: CcChannelName;
  rollUpRows?: 2 | 3 | 4;
  /** Base row, 1..15. Default 15 (bottom). */
  row?: number;
  /** Base column, 0..31. Default 0 (leftmost). */
  column?: number;
}

const CHANNEL_BITS: Record<CcChannelName, CcChannel> = {
  CC1: 0,
  CC2: 1,
  CC3: 2,
  CC4: 3,
};

interface CompiledAction {
  timeSec: number;
  words: CcWord[];
}

/**
 * Pairs/second/field at the given frame rate. Mirrors the leading-608
 * count in `Encoder` (CTA-708 §4.3.6 / CTA-608 line-21 rate).
 */
function pairsPerSecondPerField(fps: FrameRate): number {
  switch (fps) {
    case 60:
    case 59.94:
    case 50:
      return fps;
    case 30:
    case 29.97:
    case 25:
    case 24:
      return fps * 2;
  }
}

/**
 * PAC + optional Tab Offset to land the cursor at an arbitrary 0..31
 * column. PACs only support indents at columns 0/4/8/12/16/20/24/28; the
 * residual 0..3 is supplied by a Tab Offset, which is a control word and
 * therefore doubled per §9.1.
 */
function pacAtColumn(
  builder: CaptionBuilder,
  channel: CcChannel,
  row: number,
  column: number,
): CcWord[] {
  if (column < 0 || column > 31) {
    throw new RangeError(`column must be 0..31, got ${String(column)}`);
  }
  const pacCol = (column >> 2) << 2;
  const residual = column - pacCol;
  const words = builder.pac(row, pacCol);
  if (residual > 0) {
    words.push(...doubleControls([tab(residual as 1 | 2 | 3, channel)]));
  }
  return words;
}

function buildCueWords(
  builder: CaptionBuilder,
  channel: CcChannel,
  style: Cea608Style,
  cue: CaptionEvent,
  row: number,
  column: number,
  isFirstCue: boolean,
): CcWord[] {
  const words: CcWord[] = [];
  if (isFirstCue) {
    if (builder instanceof PaintOnBuilder) words.push(...builder.begin());
    else if (builder instanceof RollUpBuilder) {
      words.push(...builder.begin());
      // RUx initializes the mode; PAC sets the base row for the rolling
      // window.
      words.push(...pacAtColumn(builder, channel, row, 0));
    }
  }

  switch (style) {
    case 'pop-on':
      // RCL on every cue per CTA-608-E §9.2: each new caption is a
      // self-contained burst so a tune-in / channel-changer reacquires
      // pop-on mode without depending on prior EOC sticky state.
      words.push(...(builder as PopOnBuilder).begin());
      words.push(...builder.eraseNonDisplayed());
      words.push(...pacAtColumn(builder, channel, row, column));
      words.push(...builder.text(cue.text));
      words.push(...(builder as PopOnBuilder).end());
      break;
    case 'paint-on':
      if (!isFirstCue) {
        words.push(...builder.eraseDisplayed());
      }
      words.push(...pacAtColumn(builder, channel, row, column));
      words.push(...builder.text(cue.text));
      break;
    case 'roll-up':
      if (!isFirstCue) {
        words.push(...(builder as RollUpBuilder).carriageReturn());
      }
      words.push(...builder.text(cue.text));
      break;
  }

  return words;
}

/**
 * Compiles a CaptionTimeline into a CEA-608-only stream of cc_data()
 * tuples. CEA-708 slots are emitted as DTVCC padding by the underlying
 * Encoder (its dtvccQueue stays empty).
 */
export function compileTimeline608(
  timeline: CaptionTimeline,
  options: Compiler608Options,
): Uint8Array {
  const { fps, style } = options;
  const channelName = options.channel ?? 'CC1';
  const channel = CHANNEL_BITS[channelName];
  const row = options.row ?? 15;
  const column = options.column ?? 0;
  const rollUpRows = options.rollUpRows ?? 3;

  const builder: CaptionBuilder =
    style === 'pop-on' ? new PopOnBuilder(channel) :
    style === 'paint-on' ? new PaintOnBuilder(channel) :
    new RollUpBuilder(channel, rollUpRows);

  const useF2 = channelName === 'CC3' || channelName === 'CC4';
  const pairsBudget = pairsPerSecondPerField(fps);

  const events = timeline.getEvents();
  const actions: CompiledAction[] = [];

  events.forEach((cue, idx) => {
    const words = buildCueWords(builder, channel, style, cue, row, column, idx === 0);
    if (cue.endTimeSec !== undefined) {
      const available = Math.floor((cue.endTimeSec - cue.startTimeSec) * pairsBudget);
      if (words.length > available) {
        throw new Error(
          `CEA-608 cue at ${String(cue.startTimeSec)}s ("${cue.text}") needs ` +
            `${String(words.length)} byte-pairs but only ${String(available)} fit ` +
            `in the ${String(cue.endTimeSec - cue.startTimeSec)}s window at ${String(fps)} fps.`,
        );
      }
    }
    actions.push({ timeSec: cue.startTimeSec, words });
    if (cue.endTimeSec !== undefined) {
      actions.push({
        timeSec: cue.endTimeSec,
        words: builder.eraseDisplayed(),
      });
    }
  });
  actions.sort((a, b) => a.timeSec - b.timeSec);

  const encoder = new Encoder(fps);

  let maxTimeSec = 0;
  for (const a of actions) {
    if (a.timeSec > maxTimeSec) maxTimeSec = a.timeSec;
  }
  const totalFrames = Math.ceil(maxTimeSec * fps) + Math.ceil(fps);

  const outFrames: Uint8Array[] = [];
  let nextActionIdx = 0;
  for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
    const timeSec = frameIdx / fps;
    while (nextActionIdx < actions.length && actions[nextActionIdx].timeSec <= timeSec) {
      const w = actions[nextActionIdx].words;
      if (useF2) encoder.push608F2(w);
      else encoder.push608F1(w);
      nextActionIdx++;
    }
    outFrames.push(encoder.nextFrame());
  }

  const total = outFrames.reduce((acc, f) => acc + f.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const f of outFrames) {
    out.set(f, offset);
    offset += f.length;
  }
  return out;
}
