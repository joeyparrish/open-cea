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

// MCC (MacCaption) v2.0 sidecar formatter.
//
// MCC is a plain-text container that holds one cc_data() payload per
// video frame, indexed by SMPTE timecode. ffmpeg natively demuxes MCC
// and muxes the cc_data() payloads into SEI for downstream encoders
// without feature loss; that is the project's primary embedding path.
//
// The on-disk format is documented in the MacCaption File Format spec
// (ATSC, MCC v2.0). The minimum viable set of header lines, confirmed
// against ffmpeg's parser at specs/mccdec.c:
//   - "File Format=MacCaption_MCC V2.0"
//   - "Time Code Rate=<rate>" where <rate> is one of 24, 25, 30, 30DF,
//     50, 60, 60DF (the DF variants signal SMPTE drop-frame).
// Everything else with an `=` is parsed as an attribute and skipped;
// anything starting with `//` is treated as a comment.
//
// v1 emits uncompressed hex for every frame. The MCC v2.0 dictionary
// substitution scheme (single-byte aliases for common cc_data run-
// length patterns) is a size optimization, not a correctness one;
// ffmpeg accepts plain hex without complaint.

import { writeFileSync } from 'node:fs';
import type { FrameRate } from '../encoder.js';
import { frameToTimecode, mccTimeCodeRate } from './timecode.js';

export interface MccOptions {
  fps: FrameRate;
  /**
   * Override the UUID written into the header. Defaults to a fresh
   * `crypto.randomUUID()`. Tests should pin it for determinism.
   */
  uuid?: string;
  /**
   * Override the `Creation Date=` field. Defaults to the current UTC
   * date in YYYY-MM-DD form. Tests should pin it.
   */
  creationDate?: string;
  /**
   * Override the `Creation Time=` field. Defaults to the current UTC
   * time in HH:MM:SS form. Tests should pin it.
   */
  creationTime?: string;
  /** Override `Creation Program=`. Defaults to `open-cea`. */
  creationProgram?: string;
}

function pad2(n: number): string {
  return n < 10 ? `0${String(n)}` : String(n);
}

function defaultDateUTC(): string {
  const d = new Date();
  return `${String(d.getUTCFullYear())}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function defaultTimeUTC(): string {
  const d = new Date();
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
}

function toHex(bytes: Uint8Array): string {
  const out = new Array<string>(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    const hi = (bytes[i] >> 4) & 0x0F;
    const lo = bytes[i] & 0x0F;
    out[i] = HEX[hi] + HEX[lo];
  }
  return out.join('');
}

const HEX = '0123456789ABCDEF';

/**
 * Format per-frame cc_data() payloads as an MCC v2.0 string.
 */
export function formatMcc(frames: Uint8Array[], options: MccOptions): string {
  const uuid = options.uuid ?? globalThis.crypto.randomUUID();
  const creationDate = options.creationDate ?? defaultDateUTC();
  const creationTime = options.creationTime ?? defaultTimeUTC();
  const creationProgram = options.creationProgram ?? 'open-cea';

  const lines: string[] = [];
  lines.push('File Format=MacCaption_MCC V2.0');
  lines.push('');
  lines.push(`UUID=${uuid}`);
  lines.push(`Creation Program=${creationProgram}`);
  lines.push(`Creation Date=${creationDate}`);
  lines.push(`Creation Time=${creationTime}`);
  lines.push(`Time Code Rate=${mccTimeCodeRate(options.fps)}`);
  lines.push('');
  for (let i = 0; i < frames.length; i++) {
    lines.push(`${frameToTimecode(i, options.fps)}\t${toHex(frames[i])}`);
  }
  lines.push('');
  return lines.join('\n');
}

/** Write the formatted MCC string to a file. */
export function writeMccFile(path: string, frames: Uint8Array[], options: MccOptions): void {
  writeFileSync(path, formatMcc(frames, options), 'utf-8');
}
