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

// Time-driven action pump shared by the 608 and 708 compilers and the
// JSON-driven `compile` subcommand.
//
// A single Encoder owns the constant-rate output budget for one
// stream. To mix CEA-608 channels (CC1 + CC3) or both 608 and 708 in
// one cc_data() stream, all tracks must push into the *same* Encoder.
// This module formalizes that contract: callers build a flat list of
// time-stamped actions (608 byte-pairs or 708 CCP payloads), and the
// orchestrator drains them through one Encoder, emitting the per-
// frame cc_data() tuples.

import { Encoder, type FrameRate } from './encoder.js';
import type { CcWord } from './cea608/types.js';

export type Action =
  | { kind: '608'; timeSec: number; field: 0 | 1; words: CcWord[] }
  | { kind: '708'; timeSec: number; payload: Uint8Array };

export interface OrchestratorOptions {
  fps: FrameRate;
  /** Total trailing padding seconds after the last action (default 1). */
  trailingDrainSec?: number;
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
 * Drive a single shared Encoder from a flat, time-stamped action list
 * and return the concatenated cc_data() output.
 */
export function runOrchestrator(actions: Action[], options: OrchestratorOptions): Uint8Array {
  const fps = options.fps;
  const trailing = options.trailingDrainSec ?? 1;

  const sorted = [...actions].sort((a, b) => a.timeSec - b.timeSec);

  let maxTimeSec = 0;
  for (const a of sorted) {
    if (a.timeSec > maxTimeSec) maxTimeSec = a.timeSec;
  }
  const totalFrames = Math.ceil(maxTimeSec * fps) + Math.ceil(trailing * fps);

  const encoder = new Encoder(fps);
  const outFrames: Uint8Array[] = [];
  let nextIdx = 0;
  for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
    const timeSec = frameIdx / fps;
    while (nextIdx < sorted.length && sorted[nextIdx].timeSec <= timeSec) {
      const action = sorted[nextIdx++];
      if (action.kind === '708') {
        encoder.push708(action.payload);
      } else if (action.field === 0) {
        encoder.push608F1(action.words);
      } else {
        encoder.push608F2(action.words);
      }
    }
    outFrames.push(encoder.nextFrame());
  }

  return concatChunks(outFrames);
}
