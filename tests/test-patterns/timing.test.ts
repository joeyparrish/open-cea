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
import { buildTimingTimeline } from '../../src/test-patterns/timing.js';

describe('buildTimingTimeline', () => {
  it('emits one cue per second of duration', () => {
    const tl = buildTimingTimeline({ durationSec: 5 });
    const events = tl.getEvents();
    expect(events.length).toBe(5);
    expect(events[0].text).toBe('00:00:00');
    expect(events[4].text).toBe('00:00:04');
  });

  it('formats stamps that span minutes and hours', () => {
    const tl = buildTimingTimeline({ durationSec: 3661 });
    const events = tl.getEvents();
    expect(events[60].text).toBe('00:01:00');
    expect(events[3600].text).toBe('01:00:00');
    expect(events[3661 - 1].text).toBe('01:01:00');
  });

  it('uses a 0.95 s dwell so cues do not overlap', () => {
    const tl = buildTimingTimeline({ durationSec: 3 });
    const events = tl.getEvents();
    expect(events[0].endTimeSec).toBeCloseTo(0.95, 5);
    expect(events[1].startTimeSec).toBe(1);
  });
});
