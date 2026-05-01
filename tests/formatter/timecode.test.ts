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
  frameToTimecode,
  isDropFrame,
  mccTimeCodeRate,
} from '../../src/formatter/timecode.js';

describe('mccTimeCodeRate', () => {
  it.each([
    [24, '24'],
    [25, '25'],
    [29.97, '30DF'],
    [30, '30'],
    [50, '50'],
    [59.94, '60DF'],
    [60, '60'],
  ] as const)('%f -> %s', (fps, expected) => {
    expect(mccTimeCodeRate(fps)).toBe(expected);
  });
});

describe('isDropFrame', () => {
  it('flags 29.97 and 59.94 as drop-frame', () => {
    expect(isDropFrame(29.97)).toBe(true);
    expect(isDropFrame(59.94)).toBe(true);
  });

  it('flags integer rates as non-drop-frame', () => {
    for (const fps of [24, 25, 30, 50, 60] as const) {
      expect(isDropFrame(fps)).toBe(false);
    }
  });
});

describe('frameToTimecode - non-drop-frame', () => {
  it('formats 00:00:00:00 at frame 0 (30 fps)', () => {
    expect(frameToTimecode(0, 30)).toBe('00:00:00:00');
  });

  it('rolls frames into seconds at the nominal rate', () => {
    expect(frameToTimecode(29, 30)).toBe('00:00:00:29');
    expect(frameToTimecode(30, 30)).toBe('00:00:01:00');
  });

  it('rolls seconds into minutes', () => {
    expect(frameToTimecode(30 * 60, 30)).toBe('00:01:00:00');
  });

  it('rolls minutes into hours', () => {
    expect(frameToTimecode(30 * 60 * 60, 30)).toBe('01:00:00:00');
  });

  it.each([24, 25, 50, 60] as const)('uses : separator at %i fps', (fps) => {
    const tc = frameToTimecode(fps, fps);
    expect(tc).toBe('00:00:01:00');
    expect(tc.includes(';')).toBe(false);
  });
});

describe('frameToTimecode - drop-frame at 29.97 fps', () => {
  // SMPTE drop-frame at 29.97: skip frame numbers 00 and 01 at the
  // start of every minute except every tenth minute.
  const fps = 29.97;

  it('uses ; separator before the frame field', () => {
    expect(frameToTimecode(0, fps)).toBe('00:00:00;00');
  });

  it('does not skip at frame 0', () => {
    expect(frameToTimecode(0, fps)).toBe('00:00:00;00');
  });

  it('skips frame numbers 00 and 01 at the 1-minute boundary', () => {
    // 60 actual seconds at 29.97 = 1800 actual frames. The 1-minute
    // timecode mark drops frame numbers 00 and 01, so frame index 1799
    // is the last 00:00:59 frame (29) and frame index 1800 jumps to
    // 00:01:00;02.
    expect(frameToTimecode(1798, fps)).toBe('00:00:59;28');
    expect(frameToTimecode(1799, fps)).toBe('00:00:59;29');
    expect(frameToTimecode(1800, fps)).toBe('00:01:00;02');
  });

  it('does not skip at the 10-minute boundary', () => {
    // 10 minutes of timecode contains 10 * 60 * 30 - 9 * 2 = 17982
    // actual frames. Frame 17982 is timecode 00:10:00;00; no skip on
    // multiples of 10 minutes.
    expect(frameToTimecode(17981, fps)).toBe('00:09:59;29');
    expect(frameToTimecode(17982, fps)).toBe('00:10:00;00');
  });

  it('matches a 1-hour wall-clock duration', () => {
    // 1 actual hour at 29.97 fps = 30 * 3600 / 1.001 frames =
    // 107892.107... actual frames. SMPTE drop-frame is calibrated so
    // 1 hour of timecode = 107892 actual frames (107892 / 29.97 ~= 1h).
    expect(frameToTimecode(107892, fps)).toBe('01:00:00;00');
  });
});

describe('frameToTimecode - drop-frame at 59.94 fps', () => {
  const fps = 59.94;

  it('uses ; separator before the frame field', () => {
    expect(frameToTimecode(0, fps)).toBe('00:00:00;00');
  });

  it('skips frame numbers 00..03 at the 1-minute boundary', () => {
    // 60 actual seconds = 60 * 60 = 3600 actual frames; minute boundary
    // drops 4 frame numbers.
    expect(frameToTimecode(3599, fps)).toBe('00:00:59;59');
    expect(frameToTimecode(3600, fps)).toBe('00:01:00;04');
  });

  it('does not skip at the 10-minute boundary', () => {
    // After 9 minute-skips of 4 frames each, 10-minute timecode is at
    // actual frame 10 * 60 * 60 - 36 = 35964.
    expect(frameToTimecode(35963, fps)).toBe('00:09:59;59');
    expect(frameToTimecode(35964, fps)).toBe('00:10:00;00');
  });
});

describe('frameToTimecode - input validation', () => {
  it('rejects negative or non-integer indices', () => {
    expect(() => frameToTimecode(-1, 30)).toThrow(RangeError);
    expect(() => frameToTimecode(1.5, 30)).toThrow(RangeError);
    expect(() => frameToTimecode(NaN, 30)).toThrow(RangeError);
    expect(() => frameToTimecode(Infinity, 30)).toThrow(RangeError);
  });
});
