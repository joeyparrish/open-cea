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

// Synthesized "position" test pattern: cycles through the nine anchor
// points of the safe-title area and labels each cue with its
// coordinates. An operator watching playback can confirm the player
// honors per-cue window placement.
//
// 708 only. The 608 PAC row/column come from compileTimeline608's
// options rather than per-cue, so per-cue position variation would
// need a compiler608 API change. The timing pattern remains target-
// agnostic.

import { CaptionTimeline } from '../timeline.js';
import type { AnchorPoint } from './../cea708/types.js';

export interface PositionPatternOptions {
  /** Total duration in seconds. Defaults to 60. */
  durationSec?: number;
  /** Per-cue dwell time. Defaults to 2 s. */
  cueSec?: number;
}

interface AnchorTuple {
  anchorVertical: number;
  anchorHorizontal: number;
  anchorPoint: AnchorPoint;
  label: string;
}

// Nine reference positions (the standard CTA-708 anchor-point set),
// each placed near the corresponding edge / corner of the safe-title
// area at maximum (75 x 210) authoring resolution.
const ANCHOR_GRID: readonly AnchorTuple[] = [
  { anchorVertical: 7,  anchorHorizontal: 21,  anchorPoint: 0, label: 'TL' },
  { anchorVertical: 7,  anchorHorizontal: 105, anchorPoint: 1, label: 'TC' },
  { anchorVertical: 7,  anchorHorizontal: 189, anchorPoint: 2, label: 'TR' },
  { anchorVertical: 37, anchorHorizontal: 21,  anchorPoint: 3, label: 'ML' },
  { anchorVertical: 37, anchorHorizontal: 105, anchorPoint: 4, label: 'CC' },
  { anchorVertical: 37, anchorHorizontal: 189, anchorPoint: 5, label: 'MR' },
  { anchorVertical: 67, anchorHorizontal: 21,  anchorPoint: 6, label: 'BL' },
  { anchorVertical: 67, anchorHorizontal: 105, anchorPoint: 7, label: 'BC' },
  { anchorVertical: 67, anchorHorizontal: 189, anchorPoint: 8, label: 'BR' },
];

/**
 * Build a 708 CaptionTimeline that places each successive cue at a
 * different anchor point in the safe-title area, labelling the cue
 * with the coordinates the encoder asked for. Cycles through eight
 * window IDs so the cues don't all stack on a single window's
 * pen-cursor state.
 */
export function buildPositionTimeline(options: PositionPatternOptions = {}): CaptionTimeline {
  const duration = options.durationSec ?? 60;
  const cueSec = options.cueSec ?? 2;
  const timeline = new CaptionTimeline();

  let cueIdx = 0;
  for (let t = 0; t < duration; t += cueSec) {
    const a = ANCHOR_GRID[cueIdx % ANCHOR_GRID.length];
    const winId = cueIdx % 8;
    timeline.defineWindow({
      id: winId,
      visible: true,
      rowCount: 1,
      columnCount: 24,
      anchorVertical: a.anchorVertical,
      anchorHorizontal: a.anchorHorizontal,
      anchorPoint: a.anchorPoint,
    });
    timeline.addEvent({
      startTimeSec: t,
      endTimeSec: Math.min(t + cueSec - 0.05, duration),
      text: `${a.label} v=${String(a.anchorVertical)} h=${String(a.anchorHorizontal)} ap=${String(a.anchorPoint)}`,
      windowId: winId,
    });
    cueIdx++;
  }

  return timeline;
}
