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
import { splitByFrame } from '../../src/formatter/split.js';

describe('splitByFrame', () => {
  it('splits a 30 fps stream into 60-byte frames', () => {
    // 30 fps -> 20 cc_data tuples/frame -> 60 bytes/frame.
    const buf = new Uint8Array(60 * 5);
    for (let i = 0; i < buf.length; i++) buf[i] = i & 0xFF;
    const frames = splitByFrame(buf, 30);
    expect(frames.length).toBe(5);
    for (const f of frames) expect(f.length).toBe(60);
    expect(frames[0][0]).toBe(0);
    expect(frames[1][0]).toBe(60);
    expect(frames[4][59]).toBe((60 * 5 - 1) & 0xFF);
  });

  it('respects the per-frame size at each supported rate', () => {
    const cases: [number, number][] = [
      [24, 25 * 3],
      [25, 24 * 3],
      [29.97, 20 * 3],
      [30, 20 * 3],
      [50, 12 * 3],
      [59.94, 10 * 3],
      [60, 10 * 3],
    ];
    for (const [fps, bytesPerFrame] of cases) {
      const buf = new Uint8Array(bytesPerFrame * 3);
      const frames = splitByFrame(buf, fps as Parameters<typeof splitByFrame>[1]);
      expect(frames.length).toBe(3);
      for (const f of frames) expect(f.length).toBe(bytesPerFrame);
    }
  });

  it('throws when the buffer is not a multiple of the frame size', () => {
    const buf = new Uint8Array(60 * 2 + 1); // 121 bytes at 30 fps
    expect(() => splitByFrame(buf, 30)).toThrow(/multiple of/);
  });

  it('returns an empty array for an empty buffer', () => {
    expect(splitByFrame(new Uint8Array(0), 30)).toEqual([]);
  });
});
