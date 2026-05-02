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

// Synthesized "timing" test pattern: emits a continuously updating
// caption that displays the current wall-clock-style timestamp once
// per second. An operator watching playback can read the lag between
// the rendered caption and the picture's true timing.

import { CaptionTimeline } from '../timeline.js';

function pad2(n: number): string {
  return n < 10 ? `0${String(n)}` : String(n);
}

function formatStamp(seconds: number): string {
  const hh = Math.floor(seconds / 3600);
  const mm = Math.floor(seconds / 60) % 60;
  const ss = seconds % 60;
  return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`;
}

export interface TimingPatternOptions {
  /** Total duration in seconds. Defaults to 60. */
  durationSec?: number;
}

/**
 * Build a CaptionTimeline that emits one cue per second carrying the
 * current `HH:MM:SS` stamp. Cues are 0.95 s long so the decoder has
 * time to register a clean transition between adjacent stamps without
 * gaps that would auto-clear the display.
 */
export function buildTimingTimeline(options: TimingPatternOptions = {}): CaptionTimeline {
  const duration = options.durationSec ?? 60;
  const timeline = new CaptionTimeline();
  // One default window centered near the bottom so it works for both
  // 4:3 and 16:9 decoders. The 608 path ignores window definitions.
  timeline.defineWindow({
    id: 0,
    visible: true,
    rowCount: 1,
    columnCount: 12,
    anchorVertical: 14,
    anchorHorizontal: 104,
    anchorPoint: 7,
  });
  for (let s = 0; s < duration; s++) {
    timeline.addEvent({
      startTimeSec: s,
      endTimeSec: s + 0.95,
      text: formatStamp(s),
      windowId: 0,
    });
  }
  return timeline;
}
