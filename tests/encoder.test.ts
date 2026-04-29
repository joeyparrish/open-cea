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
import { CC_TYPE_608_F1, CC_TYPE_608_F2, CC_TYPE_DTVCC_CONTINUE, CC_TYPE_DTVCC_START } from '../src/cea708/transport.js';

describe('Encoder', () => {
  it('initializes with correct ccCountPerFrame based on fps', () => {
    /* eslint-disable @typescript-eslint/dot-notation */
    expect(new Encoder(30)['ccCountPerFrame']).toBe(20);
    expect(new Encoder(60)['ccCountPerFrame']).toBe(10);
    expect(new Encoder(24)['ccCountPerFrame']).toBe(25);
    /* eslint-enable @typescript-eslint/dot-notation */
  });

  it('generates a frame with padding when queues are empty', () => {
    const encoder = new Encoder(30);
    const frame = encoder.nextFrame();
    
    expect(frame.length).toBe(20 * 3); // 60 bytes
    
    // First tuple: 608 F1 invalid
    expect(frame[0]).toBe(0xF8 | 0x00 | CC_TYPE_608_F1);
    
    // Second tuple: 608 F2 invalid
    expect(frame[3]).toBe(0xF8 | 0x00 | CC_TYPE_608_F2);
    
    // Remaining tuples: DTVCC padding (invalid, CONTINUE)
    for (let i = 2; i < 20; i++) {
      expect(frame[i * 3]).toBe(0xF8 | 0x00 | CC_TYPE_DTVCC_CONTINUE);
    }
  });

  it('drains 608 F1 and F2 queues one word per frame', () => {
    const encoder = new Encoder(30);
    encoder.push608F1([0x1234, 0x5678]);
    encoder.push608F2([0xABCD]);

    const frame1 = encoder.nextFrame();
    // 608 F1 valid
    expect(frame1[0]).toBe(0xF8 | 0x04 | CC_TYPE_608_F1);
    expect(frame1[1]).toBe(0x12);
    expect(frame1[2]).toBe(0x34);
    // 608 F2 valid
    expect(frame1[3]).toBe(0xF8 | 0x04 | CC_TYPE_608_F2);
    expect(frame1[4]).toBe(0xAB);
    expect(frame1[5]).toBe(0xCD);

    const frame2 = encoder.nextFrame();
    // 608 F1 valid
    expect(frame2[0]).toBe(0xF8 | 0x04 | CC_TYPE_608_F1);
    expect(frame2[1]).toBe(0x56);
    expect(frame2[2]).toBe(0x78);
    // 608 F2 invalid (empty)
    expect(frame2[3]).toBe(0xF8 | 0x00 | CC_TYPE_608_F2);
    expect(frame2[4]).toBe(0x00);
    expect(frame2[5]).toBe(0x00);
  });

  it('frames 708 service blocks and drains them across frames', () => {
    const encoder = new Encoder(60); // 10 tuples per frame
    
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
    
    // Tuples 8..9 are DTVCC padding.
    expect(frame1[8 * 3]).toBe(0xF8 | 0x00 | CC_TYPE_DTVCC_CONTINUE);
  });
});
