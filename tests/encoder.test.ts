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

import { describe, expect, it } from 'vitest';
import { Encoder } from '../src/encoder.js';
import {
  CC_TYPE_608_F1,
  CC_TYPE_608_F2,
  CC_TYPE_DTVCC_CONTINUE,
  CC_TYPE_DTVCC_START,
} from '../src/cea708/transport.js';

describe('Encoder', () => {
  it('initializes with correct ccCountPerFrame based on fps', () => {
    /* eslint-disable @typescript-eslint/dot-notation */
    expect(new Encoder(30)['ccCountPerFrame']).toBe(20);
    expect(new Encoder(60)['ccCountPerFrame']).toBe(10);
    expect(new Encoder(24)['ccCountPerFrame']).toBe(25);
    /* eslint-enable @typescript-eslint/dot-notation */
  });

  it('emits 4 leading 608 entries per frame at 30p (2 per field)', () => {
    const encoder = new Encoder(30);
    const frame = encoder.nextFrame();

    expect(frame.length).toBe(20 * 3);

    // Tuples 0..3 are leading 608 in field-display order: F1, F2, F1, F2.
    expect(frame[0]).toBe(0xF8 | 0x00 | CC_TYPE_608_F1);
    expect(frame[3]).toBe(0xF8 | 0x00 | CC_TYPE_608_F2);
    expect(frame[6]).toBe(0xF8 | 0x00 | CC_TYPE_608_F1);
    expect(frame[9]).toBe(0xF8 | 0x00 | CC_TYPE_608_F2);

    // Remaining 16 tuples are DTVCC padding.
    for (let i = 4; i < 20; i++) {
      expect(frame[i * 3]).toBe(0xF8 | 0x00 | CC_TYPE_DTVCC_CONTINUE);
    }
  });

  it('emits 2 leading 608 entries per frame at 60p (1 per field)', () => {
    const encoder = new Encoder(60);
    const frame = encoder.nextFrame();

    expect(frame.length).toBe(10 * 3);
    expect(frame[0]).toBe(0xF8 | 0x00 | CC_TYPE_608_F1);
    expect(frame[3]).toBe(0xF8 | 0x00 | CC_TYPE_608_F2);
    // The next slot is DTVCC, not another 608 entry.
    expect(frame[6]).toBe(0xF8 | 0x00 | CC_TYPE_DTVCC_CONTINUE);
  });

  it('drains 608 F1 and F2 queues two words per frame at 30p', () => {
    const encoder = new Encoder(30);
    encoder.push608F1([0x1234, 0x5678, 0x9ABC]);
    encoder.push608F2([0xABCD]);

    const frame1 = encoder.nextFrame();
    // Slot 0: F1[0]=0x1234 valid
    expect(frame1[0]).toBe(0xF8 | 0x04 | CC_TYPE_608_F1);
    expect(frame1[1]).toBe(0x12);
    expect(frame1[2]).toBe(0x34);
    // Slot 1: F2[0]=0xABCD valid
    expect(frame1[3]).toBe(0xF8 | 0x04 | CC_TYPE_608_F2);
    expect(frame1[4]).toBe(0xAB);
    expect(frame1[5]).toBe(0xCD);
    // Slot 2: F1[1]=0x5678 valid
    expect(frame1[6]).toBe(0xF8 | 0x04 | CC_TYPE_608_F1);
    expect(frame1[7]).toBe(0x56);
    expect(frame1[8]).toBe(0x78);
    // Slot 3: F2 queue exhausted -> padding
    expect(frame1[9]).toBe(0xF8 | 0x00 | CC_TYPE_608_F2);
    expect(frame1[10]).toBe(0x00);
    expect(frame1[11]).toBe(0x00);

    const frame2 = encoder.nextFrame();
    // Slot 0: F1[2]=0x9ABC valid
    expect(frame2[0]).toBe(0xF8 | 0x04 | CC_TYPE_608_F1);
    expect(frame2[1]).toBe(0x9A);
    expect(frame2[2]).toBe(0xBC);
    // Slot 1: F2 empty -> padding
    expect(frame2[3]).toBe(0xF8 | 0x00 | CC_TYPE_608_F2);
    // Slot 2: F1 empty -> padding
    expect(frame2[6]).toBe(0xF8 | 0x00 | CC_TYPE_608_F1);
    // Slot 3: F2 empty -> padding
    expect(frame2[9]).toBe(0xF8 | 0x00 | CC_TYPE_608_F2);
  });

  it('honors topFieldFirst by emitting F2 before F1 in each leading slot', () => {
    const encoder = new Encoder(30);
    encoder.push608F1([0x1111]);
    encoder.push608F2([0x2222]);

    const frame = encoder.nextFrame(true);

    // With topFieldFirst, slot 0 emits F2 first.
    expect(frame[0]).toBe(0xF8 | 0x04 | CC_TYPE_608_F2);
    expect(frame[1]).toBe(0x22);
    expect(frame[2]).toBe(0x22);
    // Slot 0 second emit: F1.
    expect(frame[3]).toBe(0xF8 | 0x04 | CC_TYPE_608_F1);
    expect(frame[4]).toBe(0x11);
    expect(frame[5]).toBe(0x11);
  });

  it('frames 708 service blocks and drains them across frames', () => {
    const encoder = new Encoder(60); // 10 tuples per frame, 2 leading 608

    // A 10-byte payload will be framed into a CCP.
    // CCP Header = 1 byte. Total CCP payload = 10 bytes.
    // Length is 11, which is odd. Padding byte added -> 12 bytes total.
    // 12 bytes = 6 cc_data tuples.
    encoder.push708(new Uint8Array(10).fill(0xFF));

    const frame1 = encoder.nextFrame();

    // First 2 tuples are 608 padding.
    // Tuples 2..7 (6 tuples) are DTVCC data.
    expect(frame1[6]).toBe(0xF8 | 0x04 | CC_TYPE_DTVCC_START); // Tuple 2
    for (let i = 3; i < 8; i++) {
      expect(frame1[i * 3]).toBe(0xF8 | 0x04 | CC_TYPE_DTVCC_CONTINUE);
    }

    // Tuples 8..9 are DTVCC padding. The first padding slot after the
    // CCP completes uses cc_type=11 (start-but-invalid) to mark the
    // packet boundary; subsequent padding uses cc_type=10.
    expect(frame1[8 * 3]).toBe(0xF8 | 0x00 | CC_TYPE_DTVCC_START);
    expect(frame1[9 * 3]).toBe(0xF8 | 0x00 | CC_TYPE_DTVCC_CONTINUE);
  });
});
