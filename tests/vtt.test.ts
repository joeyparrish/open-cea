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
import { parseVtt } from '../src/parser/vtt.js';

describe('parseVtt', () => {
  it('parses a basic WebVTT file into a CaptionTimeline', () => {
    const vtt = `WEBVTT

1
00:00:01.000 --> 00:00:03.500
Hello World!

2
00:00:04.000 --> 00:00:06.000
This is a test.
Line two.
`;

    const timeline = parseVtt(vtt);
    const events = timeline.getEvents();

    // Two cues, two events. Clearing is the compiler's job: it emits
    // HideWindows at endTimeSec, so the parser does not synthesize empty
    // events.
    expect(events.length).toBe(2);

    expect(events[0].startTimeSec).toBe(1);
    expect(events[0].endTimeSec).toBe(3.5);
    expect(events[0].text).toBe('Hello World!');

    expect(events[1].startTimeSec).toBe(4);
    expect(events[1].endTimeSec).toBe(6);
    expect(events[1].text).toBe('This is a test. Line two.');
  });

  it('strips HTML/VTT tags from the text', () => {
    const vtt = `WEBVTT

00:00:00.000 --> 00:00:01.000
<b>Bold</b> and <i>Italic</i>
<c.color.red>Red text</c>
`;
    const timeline = parseVtt(vtt);
    const events = timeline.getEvents();
    expect(events[0].text).toBe('Bold and Italic Red text');
  });
});
