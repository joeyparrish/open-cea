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

import { CaptionTimeline } from './timeline.js';
import { Encoder, FrameRate } from './encoder.js';
import { encodeServiceBlock } from './cea708/service.js';
import { defineWindow, setCurrentWindow, displayWindows } from './cea708/window.js';
import { setPenAttributes, setPenLocation } from './cea708/pen.js';
import { encodeString708 } from './cea708/text.js';

export interface CompilerOptions {
  fps: FrameRate;
  /** Primary service number (defaults to 1) */
  serviceNumber?: number;
}

/**
 * Compiles a CaptionTimeline into a raw stream of cc_data() tuples.
 * This acts as the high-level orchestrator.
 */
export function compileTimeline(timeline: CaptionTimeline, options: CompilerOptions): Uint8Array {
  const fps = options.fps;
  const serviceNumber = options.serviceNumber ?? 1;
  const encoder = new Encoder(fps);
  
  const events = timeline.getEvents();
  let currentEventIdx = 0;
  
  // Find the max time needed
  let maxTimeSec = 0;
  for (const event of events) {
    const end = event.endTimeSec ?? event.startTimeSec + 2; // Arbitrary 2s default duration if none
    if (end > maxTimeSec) {
      maxTimeSec = end;
    }
  }
  
  const totalFrames = Math.ceil(maxTimeSec * fps) + Math.ceil(fps); // Add 1s padding
  const outFrames: Uint8Array[] = [];
  
  // A naive compiler: simply inject commands as fast as possible when the event starts.
  // A robust compiler would buffer commands over time to not overflow the 128-byte service buffer.
  for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
    const timeSec = frameIdx / fps;
    
    // Process events starting at or before this frame
    while (currentEventIdx < events.length && events[currentEventIdx].startTimeSec <= timeSec) {
      const event = events[currentEventIdx];
      
      const payloadChunks: Uint8Array[] = [];
      
      const winId = event.windowId ?? 0;
      const winDef = timeline.getWindow(winId);
      
      if (winDef) {
        payloadChunks.push(defineWindow({
          windowId: winDef.id,
          priority: winDef.priority ?? 0,
          anchorVertical: winDef.anchorVertical ?? 0,
          anchorHorizontal: winDef.anchorHorizontal ?? 0,
          anchorPoint: winDef.anchorPoint ?? 0,
          relativePositioning: false,
          rowCount: winDef.rowCount ?? 15,
          columnCount: winDef.columnCount ?? 32,
          visible: winDef.visible ?? true,
          windowStyleId: 1, // Default NTSC pop-up
          penStyleId: 1, // Default pen
        }));
      }
      
      payloadChunks.push(setCurrentWindow(winId));
      
      if (event.pen) {
        payloadChunks.push(setPenAttributes({
          penSize: event.pen.size ?? 1, // Standard
          offset: event.pen.offset ?? 1, // Normal
          textTag: 0, // Dialog
          fontStyle: event.pen.fontStyle ?? 0,
          edgeType: event.pen.edgeType ?? 0,
          underline: event.pen.underline ?? false,
          italics: event.pen.italics ?? false,
        }));
      }
      
      if (event.row !== undefined && event.column !== undefined) {
        payloadChunks.push(setPenLocation(event.row, event.column));
      }
      
      payloadChunks.push(encodeString708(event.text));
      
      // If we made the window visible, make sure to show it
      payloadChunks.push(displayWindows(1 << winId));
      
      // Flatten chunks
      const totalLen = payloadChunks.reduce((acc, c) => acc + c.length, 0);
      const payload = new Uint8Array(totalLen);
      let offset = 0;
      for (const chunk of payloadChunks) {
        payload.set(chunk, offset);
        offset += chunk.length;
      }
      
      // Push as service blocks. Max 31 bytes per block.
      for (let i = 0; i < payload.length; i += 31) {
        const slice = payload.subarray(i, i + 31);
        const block = encodeServiceBlock(serviceNumber, slice);
        encoder.push708(block);
      }
      
      currentEventIdx++;
    }
    
    // Grab the cc_data for this frame and store it
    outFrames.push(encoder.nextFrame());
  }
  
  // Concat all frames
  const totalCcDataLen = outFrames.reduce((acc, f) => acc + f.length, 0);
  const out = new Uint8Array(totalCcDataLen);
  let outOffset = 0;
  for (const f of outFrames) {
    out.set(f, outOffset);
    outOffset += f.length;
  }
  
  return out;
}
