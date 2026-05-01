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
import { Encoder, FrameRate } from './encoder.js';
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

interface CompiledAction {
  timeSec: number;
  payload: Uint8Array;
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
 * Compiles a CaptionTimeline into a raw stream of cc_data() tuples.
 * This acts as the high-level orchestrator.
 */
export function compileTimeline(
  timeline: CaptionTimeline,
  options: CompilerOptions,
): Uint8Array {
  const fps = options.fps;
  const serviceNumber = options.serviceNumber ?? 1;
  const encoder = new Encoder(fps);

  // Build a flat, time-sorted list of actions: render at startTimeSec
  // and (if specified) hide at endTimeSec. HideWindows is the cleanest
  // way to make a caption disappear without dropping the window
  // definition, so a follow-up event for the same window doesn't have
  // to re-establish geometry.
  const actions: CompiledAction[] = [];
  const events = timeline.getEvents();
  for (const event of events) {
    actions.push({
      timeSec: event.startTimeSec,
      payload: buildCcpPayload(buildRenderPayload(event, timeline), serviceNumber),
    });
    if (event.endTimeSec !== undefined) {
      const winId = event.windowId ?? 0;
      actions.push({
        timeSec: event.endTimeSec,
        payload: buildCcpPayload(hideWindows(1 << winId), serviceNumber),
      });
    }
  }
  actions.sort((a, b) => a.timeSec - b.timeSec);

  // CTA-708-E §6.8 / §9.1 require decoders to have at least a 128-byte
  // Service Input Buffer per service. The DTVCC channel total is
  // 9600 bps = 1200 bytes/s; assume the worst-case where every emitted
  // byte targets this single service, drain at that rate between
  // consecutive actions, and reject any action whose arrival would
  // push the simulated buffer past 128 bytes. This catches both
  // oversized single events and back-to-back bursts that arrive faster
  // than the decoder can drain.
  const SERVICE_INPUT_BUFFER_BYTES = 128;
  const DTVCC_BYTES_PER_SECOND = 1200;
  let buffered = 0;
  let lastSec = 0;
  for (const a of actions) {
    const elapsed = Math.max(0, a.timeSec - lastSec);
    buffered = Math.max(0, buffered - elapsed * DTVCC_BYTES_PER_SECOND);
    buffered += a.payload.length;
    if (buffered > SERVICE_INPUT_BUFFER_BYTES) {
      throw new Error(
        `Service ${String(serviceNumber)} input buffer would overflow at ` +
          `${String(a.timeSec)}s: ${String(Math.ceil(buffered))} bytes ` +
          `pending vs 128-byte minimum (CTA-708-E §6.8).`,
      );
    }
    lastSec = a.timeSec;
  }

  // Find the latest action time, then add 1 s of trailing padding so any
  // late-emitted CCP has time to drain through the cc_data() bandwidth.
  let maxTimeSec = 0;
  for (const a of actions) {
    if (a.timeSec > maxTimeSec) maxTimeSec = a.timeSec;
  }
  const totalFrames = Math.ceil(maxTimeSec * fps) + Math.ceil(fps);
  const outFrames: Uint8Array[] = [];

  let nextActionIdx = 0;
  for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
    const timeSec = frameIdx / fps;
    while (nextActionIdx < actions.length && actions[nextActionIdx].timeSec <= timeSec) {
      encoder.push708(actions[nextActionIdx].payload);
      nextActionIdx++;
    }
    outFrames.push(encoder.nextFrame());
  }

  return concatChunks(outFrames);
}
