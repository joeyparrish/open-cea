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

import { ccCountPerFrame, type FrameRate } from '../encoder.js';

/**
 * Re-shape the flat per-stream cc_data() byte array produced by
 * `compileTimeline` / `compileTimeline608` into one Uint8Array per
 * video frame.
 *
 * The Encoder emits a fixed number of cc_data tuples per frame
 * (`ccCountPerFrame(fps)`), each tuple is 3 bytes, so each frame's
 * payload is exactly `ccCountPerFrame(fps) * 3` bytes. The MCC
 * formatter needs per-frame slices to write per-frame timecodes.
 */
export function splitByFrame(bytes: Uint8Array, fps: FrameRate): Uint8Array[] {
  const bytesPerFrame = ccCountPerFrame(fps) * 3;
  if (bytes.length % bytesPerFrame !== 0) {
    throw new Error(
      `Stream length ${String(bytes.length)} is not a multiple of the ` +
        `${String(bytesPerFrame)}-byte frame size at ${String(fps)} fps`,
    );
  }
  const frames: Uint8Array[] = [];
  for (let offset = 0; offset < bytes.length; offset += bytesPerFrame) {
    frames.push(bytes.subarray(offset, offset + bytesPerFrame));
  }
  return frames;
}
