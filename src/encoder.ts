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

import { encodeCcp } from './cea708/packet.js';
import {
  CC_TYPE_608_F1,
  CC_TYPE_608_F2,
  dtvccPadding,
  encodeCcDataTuple,
  packetToCcData,
} from './cea708/transport.js';
import type { CcWord } from './cea608/types.js';

export type FrameRate = 24 | 25 | 29.97 | 30 | 50 | 59.94 | 60;

/**
 * Number of leading CEA-608 byte-pair tuples in each cc_data() per frame,
 * per CTA-708 §4.3.6 (Table 4) and CTA-608 line-21 byte-rate constraints.
 *
 * NTSC line-21 mandates 60/1.001 byte-pairs/s/field; the encoder must
 * emit enough leading 608 entries each frame to drive that rate without
 * exceeding it. Counts here are the TOTAL leading 608 entries per frame
 * (split half F1 / half F2):
 *
 *   60 / 59.94 / 50 fps : 2 entries (1 F1 + 1 F2)
 *   30 / 29.97 / 25 / 24 fps : 4 entries (2 F1 + 2 F2)
 *
 * 24p strictly delivers 48/s/field, slightly under the line-21 rate of
 * 60/s/field; the §4.3.6 table tolerates 4..6 entries at 24p, so this
 * lands at the lower bound. Mixing in occasional 6-entry frames could
 * raise the rate to ~60/s/field, but is left out for simplicity.
 *
 * 25p / 50p deliver 50/s/field, below the NTSC line-21 rate of 60/1.001.
 * That is acceptable for PAL-native captioning, but a 25p stream that is
 * later re-emitted onto an NTSC line-21 output would underrun. The MCC
 * formatter and the 708→608 NTSC re-emission path are out of scope here;
 * see the corresponding entries in `plans/remaining-features.md`.
 */
function leading608Count(fps: FrameRate): number {
  switch (fps) {
    case 60:
    case 59.94:
    case 50:
      return 2;
    case 30:
    case 29.97:
    case 25:
    case 24:
      return 4;
  }
}

/**
 * Total cc_data() iterations per frame, set by the 9600 bps DTVCC payload
 * cap (= 600 byte-pairs/s) divided by the frame rate. Includes both
 * leading 608 entries and DTVCC entries.
 */
function ccCountPerFrameFor(fps: FrameRate): number {
  switch (fps) {
    case 24: return 25;
    case 25: return 24;
    case 29.97:
    case 30: return 20;
    case 50: return 12;
    case 59.94:
    case 60: return 10;
  }
}

/**
 * Orchestrates the constant-rate encoding of CEA-608 and CEA-708 data
 * into a stream of cc_data() tuples per video frame.
 */
export class Encoder {
  private readonly ccCountPerFrame: number;
  private readonly leading608Count: number;
  private readonly f1Queue: CcWord[] = [];
  private readonly f2Queue: CcWord[] = [];
  private readonly dtvccQueue: Uint8Array[] = []; // Array of encoded CCPs
  private dtvccCurrentCcp: Uint8Array | null = null;
  private dtvccCurrentOffset = 0;
  private sequenceNumber = 0;
  private justClosedCcp = false;

  constructor(public readonly fps: FrameRate) {
    this.ccCountPerFrame = ccCountPerFrameFor(fps);
    this.leading608Count = leading608Count(fps);
  }

  /** Pushes a sequence of CEA-608 byte-pairs into the Field 1 buffer. */
  public push608F1(words: CcWord[]): void {
    this.f1Queue.push(...words);
  }

  /** Pushes a sequence of CEA-608 byte-pairs into the Field 2 buffer. */
  public push608F2(words: CcWord[]): void {
    this.f2Queue.push(...words);
  }

  /**
   * Pushes a raw CEA-708 Service Block payload.
   * This is immediately framed into a Caption Channel Packet (CCP).
   */
  public push708(serviceBlockData: Uint8Array): void {
    const ccp = encodeCcp(this.sequenceNumber, serviceBlockData);
    this.sequenceNumber = (this.sequenceNumber + 1) % 4;
    this.dtvccQueue.push(packetToCcData(ccp));
  }

  /**
   * Generates the cc_data() tuples for the next video frame.
   * Maintains the strict constant-rate bandwidth required by the transport.
   *
   * @param topFieldFirst If true, emit cc_type=01 (F2) before cc_type=00
   *   (F1) within each interleaved leading-608 slot, per CTA-708 §4.3.5
   *   for pictures with top_field_first=1. Defaults to false (F1 first).
   */
  public nextFrame(topFieldFirst = false): Uint8Array {
    const out = new Uint8Array(this.ccCountPerFrame * 3);
    let offset = 0;

    // 1. Leading CEA-608 entries, interleaved in field-display order.
    //    `leading608Count` is the total per frame; half goes to F1 and
    //    half to F2.
    const perField = this.leading608Count / 2;
    const writeField = (queue: CcWord[], ccType: number): void => {
      const word = queue.shift();
      if (word !== undefined) {
        out.set(
          encodeCcDataTuple(true, ccType, (word >> 8) & 0xFF, word & 0xFF),
          offset,
        );
      } else {
        out.set(encodeCcDataTuple(false, ccType, 0, 0), offset);
      }
      offset += 3;
    };
    for (let i = 0; i < perField; i++) {
      if (topFieldFirst) {
        writeField(this.f2Queue, CC_TYPE_608_F2);
        writeField(this.f1Queue, CC_TYPE_608_F1);
      } else {
        writeField(this.f1Queue, CC_TYPE_608_F1);
        writeField(this.f2Queue, CC_TYPE_608_F2);
      }
    }

    // 2. DTVCC (708) entries fill the remainder.
    for (let i = this.leading608Count; i < this.ccCountPerFrame; i++) {
      if (!this.dtvccCurrentCcp) {
        this.dtvccCurrentCcp = this.dtvccQueue.shift() ?? null;
        this.dtvccCurrentOffset = 0;
      }

      if (this.dtvccCurrentCcp) {
        out.set(
          this.dtvccCurrentCcp.subarray(
            this.dtvccCurrentOffset,
            this.dtvccCurrentOffset + 3,
          ),
          offset,
        );
        this.dtvccCurrentOffset += 3;
        offset += 3;

        if (this.dtvccCurrentOffset >= this.dtvccCurrentCcp.length) {
          this.dtvccCurrentCcp = null;
          this.justClosedCcp = true;
        }
      } else {
        // First padding slot after a CCP completes uses cc_type=11
        // (start-but-invalid) to mark the packet boundary; subsequent
        // padding in the same frame uses cc_type=10. Both are spec-
        // conformant; this just avoids long runs of identical bytes
        // that some downstream tools flag as anomalous.
        const padKind = this.justClosedCcp ? 'start' : 'continue';
        this.justClosedCcp = false;
        out.set(dtvccPadding(padKind), offset);
        offset += 3;
      }
    }

    return out;
  }
}
