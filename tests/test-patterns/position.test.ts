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
import { buildPositionTimeline } from '../../src/test-patterns/position.js';

describe('buildPositionTimeline', () => {
  it('produces ceil(duration / cueSec) events at the default cue length', () => {
    const tl = buildPositionTimeline({ durationSec: 18, cueSec: 2 });
    expect(tl.getEvents().length).toBe(9);
  });

  it('cycles through nine anchor labels and stamps coords into the text', () => {
    const tl = buildPositionTimeline({ durationSec: 18, cueSec: 2 });
    const labels = tl.getEvents().map((e) => e.text.split(' ')[0]);
    expect(labels).toEqual(['TL', 'TC', 'TR', 'ML', 'CC', 'MR', 'BL', 'BC', 'BR']);
    for (const e of tl.getEvents()) {
      expect(e.text).toMatch(/v=\d+ h=\d+ ap=\d/);
    }
  });

  it('repeats the anchor cycle past the ninth cue', () => {
    const tl = buildPositionTimeline({ durationSec: 20, cueSec: 1 });
    const events = tl.getEvents();
    expect(events.length).toBe(20);
    expect(events[0].text.startsWith('TL ')).toBe(true);
    expect(events[9].text.startsWith('TL ')).toBe(true);
  });

  it('cycles window IDs 0..7 (708 max)', () => {
    const tl = buildPositionTimeline({ durationSec: 18, cueSec: 2 });
    const ids = tl.getEvents().map((e) => e.windowId);
    expect(ids).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 0]);
  });
});
