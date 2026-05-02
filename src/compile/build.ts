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

import { CaptionTimeline, type CaptionEvent } from '../timeline.js';
import { buildTimelineActions708 } from '../compiler.js';
import { buildTimelineActions608 } from '../compiler608.js';
import { runOrchestrator, type Action } from '../orchestrator.js';
import type { FrameRate } from '../encoder.js';
import type {
  CompileDocument,
  CompileTrack608,
  CompileTrack708,
  EventSpec708,
} from './document.js';

function trackTo708Actions(track: CompileTrack708, fps: FrameRate): Action[] {
  const timeline = new CaptionTimeline();
  for (const w of track.windows) {
    timeline.defineWindow(w);
  }
  for (const e of track.events) {
    timeline.addEvent(eventTo708(e));
  }
  const opts: { fps: FrameRate; serviceNumber?: number } = { fps };
  if (track.service !== undefined) opts.serviceNumber = track.service;
  return buildTimelineActions708(timeline, opts);
}

function eventTo708(e: EventSpec708): CaptionEvent {
  const ev: CaptionEvent = { startTimeSec: e.startTimeSec, text: e.text };
  if (e.endTimeSec !== undefined) ev.endTimeSec = e.endTimeSec;
  if (e.windowId !== undefined) ev.windowId = e.windowId;
  if (e.row !== undefined) ev.row = e.row;
  if (e.column !== undefined) ev.column = e.column;
  if (e.pen !== undefined) ev.pen = e.pen;
  return ev;
}

function trackTo608Actions(track: CompileTrack608, fps: FrameRate): Action[] {
  const timeline = new CaptionTimeline();
  for (const e of track.events) {
    timeline.addEvent({
      startTimeSec: e.startTimeSec,
      text: e.text,
      ...(e.endTimeSec !== undefined ? { endTimeSec: e.endTimeSec } : {}),
    });
  }
  const opts: Parameters<typeof buildTimelineActions608>[1] = {
    fps,
    style: track.style,
  };
  if (track.channel !== undefined) opts.channel = track.channel;
  if (track.rollUpRows !== undefined) opts.rollUpRows = track.rollUpRows;
  if (track.row !== undefined) opts.row = track.row;
  if (track.column !== undefined) opts.column = track.column;
  return buildTimelineActions608(timeline, opts);
}

/**
 * Compile a validated CompileDocument into a single cc_data() byte
 * stream. All tracks share one Encoder via runOrchestrator, so 608
 * and 708 (and multiple 608 channels) coexist in one output.
 *
 * Validation against multi-track conflicts (two 708 tracks targeting
 * the same service number, or two 608 tracks on the same channel) is
 * left to the document validator and the underlying encoder; this
 * function is a pure assembly step.
 */
export function compileDocument(doc: CompileDocument, fps: FrameRate): Uint8Array {
  const actions: Action[] = [];
  for (const track of doc.tracks) {
    if (track.target === '708') {
      actions.push(...trackTo708Actions(track, fps));
    } else {
      actions.push(...trackTo608Actions(track, fps));
    }
  }
  return runOrchestrator(actions, { fps });
}
