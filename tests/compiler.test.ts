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
import { CaptionTimeline } from '../src/timeline.js';
import { compileTimeline } from '../src/compiler.js';

describe('compileTimeline', () => {
  it('compiles a simple timeline to cc_data tuples', () => {
    const timeline = new CaptionTimeline();
    timeline.defineWindow({
      id: 0,
      visible: true,
      rowCount: 2,
      columnCount: 32,
    });
    
    timeline.addEvent({
      startTimeSec: 0.1,
      endTimeSec: 2.1,
      text: 'Hello World',
      windowId: 0,
    });

    // 30 fps -> 20 cc_data tuples per frame (60 bytes/frame).
    // Latest action is the HideWindows at endTimeSec=2.1s, plus 1s of
    // trailing drain. Total = ceil(2.1 * 30) + 30 = 63 + 30 = 93 frames.
    const out = compileTimeline(timeline, { fps: 30 });
    
    expect(out.length).toBe(93 * 60);
    
    // We should have valid DTVCC start packets in the stream.
    // DTVCC_START is type 3, so first byte of tuple is 0xFF (if valid).
    let foundStart = false;
    for (let i = 0; i < out.length; i += 3) {
      if (out[i] === 0xFF) {
        foundStart = true;
        break;
      }
    }
    expect(foundStart).toBe(true);
  });
});
