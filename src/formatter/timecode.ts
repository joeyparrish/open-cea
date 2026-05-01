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

// SMPTE timecode helper for the MCC formatter.
//
// MCC v2.0 uses one of seven Time Code Rate strings: 24, 25, 30, 30DF,
// 50, 60, 60DF. The DF variants signal drop-frame timecode for 29.97
// and 59.94 fps respectively. ffmpeg's MCC demuxer (specs/mccdec.c)
// confirms this list. Non-drop-frame uses HH:MM:SS:FF; drop-frame uses
// HH:MM:SS;FF (semicolon before the frame field).

import type { FrameRate } from '../encoder.js';

/**
 * The exact string written into the `Time Code Rate=` MCC header for
 * each supported frame rate.
 */
export function mccTimeCodeRate(fps: FrameRate): string {
  switch (fps) {
    case 24:    return '24';
    case 25:    return '25';
    case 29.97: return '30DF';
    case 30:    return '30';
    case 50:    return '50';
    case 59.94: return '60DF';
    case 60:    return '60';
  }
}

/**
 * True when the frame rate uses SMPTE drop-frame timecode (29.97 or
 * 59.94).
 */
export function isDropFrame(fps: FrameRate): boolean {
  return fps === 29.97 || fps === 59.94;
}

function pad2(n: number): string {
  return n < 10 ? `0${String(n)}` : String(n);
}

/**
 * Convert a 0-based frame index into an MCC timecode string. The
 * algorithm follows the SMPTE drop-frame rule: at 29.97 fps drop two
 * frame numbers (00 and 01) at the start of every minute except every
 * tenth minute; at 59.94 fps drop four. Non-drop rates use the
 * straightforward (frames % nominalFps) decomposition.
 */
export function frameToTimecode(frameIdx: number, fps: FrameRate): string {
  if (frameIdx < 0 || !Number.isFinite(frameIdx) || !Number.isInteger(frameIdx)) {
    throw new RangeError(`frameIdx must be a non-negative integer, got ${String(frameIdx)}`);
  }

  const drop = isDropFrame(fps);
  const nominalFps = Math.round(fps);

  let adjusted = frameIdx;
  if (drop) {
    // Standard SMPTE drop-frame constants (29.97 / 59.94):
    //   dropPerMinute = nominal frames dropped at each minute boundary
    //   framesPerMinute = actual frames in one minute of timecode
    //   framesPer10Min = actual frames in ten minutes of timecode
    //   (the 10-minute boundary keeps its 00 and 01 frames; nine of
    //    every ten minute boundaries drop dropPerMinute frame numbers)
    const dropPerMinute = fps === 29.97 ? 2 : 4;
    const framesPerMinute = nominalFps * 60 - dropPerMinute;
    const framesPer10Min = nominalFps * 60 * 10 - 9 * dropPerMinute;
    const m10 = Math.floor(frameIdx / framesPer10Min);
    const remainder = frameIdx % framesPer10Min;
    adjusted += 9 * dropPerMinute * m10;
    if (remainder > dropPerMinute) {
      adjusted += dropPerMinute *
        Math.floor((remainder - dropPerMinute) / framesPerMinute);
    }
  }

  const ff = adjusted % nominalFps;
  const ss = Math.floor(adjusted / nominalFps) % 60;
  const mm = Math.floor(adjusted / (nominalFps * 60)) % 60;
  const hh = Math.floor(adjusted / (nominalFps * 3600));
  const sep = drop ? ';' : ':';
  return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}${sep}${pad2(ff)}`;
}
