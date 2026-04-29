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
 * Orchestrates the constant-rate encoding of CEA-608 and CEA-708 data
 * into a stream of cc_data() tuples per video frame.
 */
export class Encoder {
  private readonly ccCountPerFrame: number;
  private readonly f1Queue: CcWord[] = [];
  private readonly f2Queue: CcWord[] = [];
  private readonly dtvccQueue: Uint8Array[] = []; // Array of encoded CCPs
  private dtvccCurrentCcp: Uint8Array | null = null;
  private dtvccCurrentOffset = 0;
  
  constructor(public readonly fps: FrameRate) {
    // 9600 bps = 1200 bytes/s = 600 byte-pairs/s
    switch (fps) {
      case 24:
        this.ccCountPerFrame = 25;
        break;
      case 25:
        this.ccCountPerFrame = 24;
        break;
      case 29.97:
      case 30:
        this.ccCountPerFrame = 20;
        break;
      case 50:
        this.ccCountPerFrame = 12;
        break;
      case 59.94:
      case 60:
        this.ccCountPerFrame = 10;
        break;
      default:
        throw new Error(`Unsupported frame rate: ${String(fps)}`);
    }
  }

  /**
   * Pushes a sequence of CEA-608 byte-pairs into the Field 1 buffer.
   */
  public push608F1(words: CcWord[]): void {
    this.f1Queue.push(...words);
  }

  /**
   * Pushes a sequence of CEA-608 byte-pairs into the Field 2 buffer.
   */
  public push608F2(words: CcWord[]): void {
    this.f2Queue.push(...words);
  }

  /**
   * Pushes a raw CEA-708 Service Block payload.
   * This is immediately framed into a Caption Channel Packet (CCP).
   */
  private sequenceNumber = 0;
  public push708(serviceBlockData: Uint8Array): void {
    const ccp = encodeCcp(this.sequenceNumber, serviceBlockData);
    this.sequenceNumber = (this.sequenceNumber + 1) % 4;
    this.dtvccQueue.push(packetToCcData(ccp));
  }

  /**
   * Generates the cc_data() tuples for the next video frame.
   * Maintains the strict constant-rate bandwidth required by the transport.
   * @param topFieldFirst If true, emits F2 before F1 padding when empty.
   */
  public nextFrame(topFieldFirst = false): Uint8Array {
    const out = new Uint8Array(this.ccCountPerFrame * 3);
    let offset = 0;

    // 1. CEA-608 F1
    const f1Word = this.f1Queue.shift();
    if (f1Word !== undefined) {
      out.set(encodeCcDataTuple(true, CC_TYPE_608_F1, (f1Word >> 8) & 0xFF, f1Word & 0xFF), offset);
    } else {
      out.set(encodeCcDataTuple(false, topFieldFirst ? CC_TYPE_608_F2 : CC_TYPE_608_F1, 0, 0), offset);
    }
    offset += 3;

    // 2. CEA-608 F2
    const f2Word = this.f2Queue.shift();
    if (f2Word !== undefined) {
      out.set(encodeCcDataTuple(true, CC_TYPE_608_F2, (f2Word >> 8) & 0xFF, f2Word & 0xFF), offset);
    } else {
      out.set(encodeCcDataTuple(false, topFieldFirst ? CC_TYPE_608_F1 : CC_TYPE_608_F2, 0, 0), offset);
    }
    offset += 3;

    // 3. DTVCC (708) Remainder
    for (let i = 2; i < this.ccCountPerFrame; i++) {
      if (!this.dtvccCurrentCcp) {
        this.dtvccCurrentCcp = this.dtvccQueue.shift() ?? null;
        this.dtvccCurrentOffset = 0;
      }

      if (this.dtvccCurrentCcp) {
        out.set(
          this.dtvccCurrentCcp.subarray(this.dtvccCurrentOffset, this.dtvccCurrentOffset + 3),
          offset
        );
        this.dtvccCurrentOffset += 3;
        offset += 3;

        if (this.dtvccCurrentOffset >= this.dtvccCurrentCcp.length) {
          this.dtvccCurrentCcp = null;
        }
      } else {
        // DTVCC Padding
        out.set(dtvccPadding(), offset);
        offset += 3;
      }
    }

    return out;
  }
}
