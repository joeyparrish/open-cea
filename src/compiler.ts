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

import { CaptionTimeline, type CaptionEvent } from './timeline.js';
import type { FrameRate } from './encoder.js';
import { runOrchestrator, type Action } from './orchestrator.js';
import { encodeServiceBlock } from './cea708/service.js';
import {
  defineWindow,
  displayWindows,
  hideWindows,
  setCurrentWindow,
} from './cea708/window.js';
import { setPenAttributes, setPenLocation } from './cea708/pen.js';
import { encodeString708 } from './cea708/text.js';

export interface CompilerOptions {
  fps: FrameRate;
  /** Primary service number (defaults to 1). */
  serviceNumber?: number;
}

function concatChunks(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((acc, c) => acc + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/**
 * Build the byte stream that renders a single event's text in its window.
 *
 * Note: this path emits DefineWindow + SetCurrentWindow + text + DSW,
 * which renders as paint-on (the window is defined visible from the
 * start, so text appears as it streams in). True pop-on per
 * CTA-708-E section 9.3 uses two windows (define hidden, fill, then
 * TGW); that authoring pattern requires multi-window timeline
 * semantics and is tracked alongside the `compile` JSON-driven
 * subcommand in plans/remaining-features.md. For single-window
 * timelines this distinction is invisible at typical caption rates.
 */
function buildRenderPayload(
  event: CaptionEvent,
  timeline: CaptionTimeline,
): Uint8Array {
  const chunks: Uint8Array[] = [];
  const winId = event.windowId ?? 0;
  const winDef = timeline.getWindow(winId);

  // CTA-708-E §7.1: SetCurrentWindow may only target a previously
  // defined window. Refuse to compile an event whose window has no
  // timeline definition rather than emit an undecodable stream.
  if (!winDef) {
    throw new Error(
      `Caption event references undefined window id ${String(winId)}; ` +
        `call CaptionTimeline.defineWindow first`,
    );
  }

  chunks.push(defineWindow({
    windowId: winDef.id,
    priority: winDef.priority ?? 0,
    anchorVertical: winDef.anchorVertical ?? 0,
    anchorHorizontal: winDef.anchorHorizontal ?? 0,
    anchorPoint: winDef.anchorPoint ?? 0,
    relativePositioning: false,
    rowCount: winDef.rowCount ?? 15,
    columnCount: winDef.columnCount ?? 32,
    visible: winDef.visible ?? true,
    windowStyleId: 1,  // Default NTSC pop-up
    penStyleId: 1,     // Default pen
  }));

  chunks.push(setCurrentWindow(winId));

  if (event.pen) {
    chunks.push(setPenAttributes({
      penSize: event.pen.size ?? 1,    // Standard
      offset: event.pen.offset ?? 1,   // Normal
      textTag: 0,                       // Dialog
      fontStyle: event.pen.fontStyle ?? 0,
      edgeType: event.pen.edgeType ?? 0,
      underline: event.pen.underline ?? false,
      italics: event.pen.italics ?? false,
    }));
  }

  if (event.row !== undefined && event.column !== undefined) {
    chunks.push(setPenLocation(event.row, event.column));
  }

  chunks.push(encodeString708(event.text));
  chunks.push(displayWindows(1 << winId));

  return concatChunks(chunks);
}

/**
 * Wrap an event payload as one or more service blocks inside a single
 * CCP. Per CTA-708 §5.2 every syntactic element must be entirely within
 * one CCP; service-block boundaries inside a CCP may split elements.
 * For payloads that would exceed the §5.1 127-byte CCP cap, throws —
 * multi-CCP splitting at element boundaries is not yet implemented.
 */
function buildCcpPayload(eventPayload: Uint8Array, serviceNumber: number): Uint8Array {
  const blockCount = Math.ceil(eventPayload.length / 31);
  const ccpPayloadLen = eventPayload.length + blockCount;
  if (ccpPayloadLen > 127) {
    throw new Error(
      `Event payload too large for a single CCP: ` +
        `${String(ccpPayloadLen)} bytes > 127. ` +
        `Multi-CCP splitting at element boundaries is not yet implemented.`,
    );
  }
  const ccpPayload = new Uint8Array(ccpPayloadLen);
  let dst = 0;
  for (let src = 0; src < eventPayload.length; src += 31) {
    const slice = eventPayload.subarray(src, Math.min(src + 31, eventPayload.length));
    const block = encodeServiceBlock(serviceNumber, slice);
    ccpPayload.set(block, dst);
    dst += block.length;
  }
  return ccpPayload;
}

/**
 * Build the time-stamped Action list for a single 708 track. Exposed
 * so the JSON-driven `compile` subcommand can fold multiple tracks
 * into one shared Encoder via `runOrchestrator`.
 */
export function buildTimelineActions708(
  timeline: CaptionTimeline,
  options: CompilerOptions,
): Action[] {
  const serviceNumber = options.serviceNumber ?? 1;
  const actions: Action[] = [];
  const events = timeline.getEvents();
  for (const event of events) {
    actions.push({
      kind: '708',
      timeSec: event.startTimeSec,
      payload: buildCcpPayload(buildRenderPayload(event, timeline), serviceNumber),
    });
    if (event.endTimeSec !== undefined) {
      const winId = event.windowId ?? 0;
      actions.push({
        kind: '708',
        timeSec: event.endTimeSec,
        payload: buildCcpPayload(hideWindows(1 << winId), serviceNumber),
      });
    }
  }

  // CTA-708-E sections 6.8 / 9.1 require decoders to have at least a
  // 128-byte Service Input Buffer per service. Simulate per-service
  // buffering at the DTVCC channel rate (1200 B/s) between consecutive
  // actions and reject inputs that would push the buffer past 128
  // bytes. This catches both oversized single events and back-to-back
  // bursts that arrive faster than the decoder can drain.
  const SERVICE_INPUT_BUFFER_BYTES = 128;
  const DTVCC_BYTES_PER_SECOND = 1200;
  const sorted = [...actions].sort((a, b) => a.timeSec - b.timeSec);
  let buffered = 0;
  let lastSec = 0;
  for (const a of sorted) {
    if (a.kind !== '708') continue;
    const elapsed = Math.max(0, a.timeSec - lastSec);
    buffered = Math.max(0, buffered - elapsed * DTVCC_BYTES_PER_SECOND);
    buffered += a.payload.length;
    if (buffered > SERVICE_INPUT_BUFFER_BYTES) {
      throw new Error(
        `Service ${String(serviceNumber)} input buffer would overflow at ` +
          `${String(a.timeSec)}s: ${String(Math.ceil(buffered))} bytes ` +
          `pending vs 128-byte minimum (CTA-708-E section 6.8).`,
      );
    }
    lastSec = a.timeSec;
  }

  return actions;
}

/**
 * Compiles a CaptionTimeline into a raw stream of cc_data() tuples
 * targeting CEA-708 only.
 */
export function compileTimeline(
  timeline: CaptionTimeline,
  options: CompilerOptions,
): Uint8Array {
  const actions = buildTimelineActions708(timeline, options);
  return runOrchestrator(actions, { fps: options.fps });
}
