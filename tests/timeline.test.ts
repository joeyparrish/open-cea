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

describe('CaptionTimeline', () => {
  it('allows defining and retrieving windows', () => {
    const timeline = new CaptionTimeline();
    timeline.defineWindow({ id: 0, visible: true });
    timeline.defineWindow({ id: 1, visible: false });

    expect(timeline.getWindow(0)?.visible).toBe(true);
    expect(timeline.getWindow(1)?.visible).toBe(false);
    expect(timeline.getWindows().length).toBe(2);
  });

  it('sorts events by start time', () => {
    const timeline = new CaptionTimeline();
    timeline.addEvent({ startTimeSec: 2, text: 'Second' });
    timeline.addEvent({ startTimeSec: 1, text: 'First' });
    timeline.addEvent({ startTimeSec: 3, text: 'Third' });

    const events = timeline.getEvents();
    expect(events.length).toBe(3);
    expect(events[0].text).toBe('First');
    expect(events[1].text).toBe('Second');
    expect(events[2].text).toBe('Third');
  });

  it('throws on invalid input', () => {
    const timeline = new CaptionTimeline();
    expect(() => { timeline.defineWindow({ id: 8 }); }).toThrow();
    expect(() => { timeline.addEvent({ startTimeSec: -1, text: '' }); }).toThrow();
    expect(() => { timeline.addEvent({ startTimeSec: 5, endTimeSec: 4, text: '' }); }).toThrow();
  });
});
