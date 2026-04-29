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
import { encodeCcp } from '../../src/cea708/packet.js';

describe('encodeCcp', () => {
  it('pads an even payload to odd length', () => {
    // 2 bytes payload
    const data = new Uint8Array([0x01, 0x02]);
    const out = encodeCcp(0, data);
    // dataSize becomes 3, so total length is 4. packetSizeCode = (3+1)/2 = 2.
    expect(out.length).toBe(4);
    expect(out[0]).toBe((0 << 6) | 2); // sequence 0, size code 2
    expect(out[1]).toBe(0x01);
    expect(out[2]).toBe(0x02);
    expect(out[3]).toBe(0x00); // padding
  });

  it('does not pad an odd payload', () => {
    // 3 bytes payload
    const data = new Uint8Array([0x01, 0x02, 0x03]);
    const out = encodeCcp(1, data);
    // dataSize remains 3, total length 4. packetSizeCode = (3+1)/2 = 2.
    expect(out.length).toBe(4);
    expect(out[0]).toBe((1 << 6) | 2); // sequence 1, size code 2
    expect(out[1]).toBe(0x01);
    expect(out[2]).toBe(0x02);
    expect(out[3]).toBe(0x03);
  });

  it('handles the maximum payload of 127 bytes correctly', () => {
    const data = new Uint8Array(127);
    data.fill(0xFF);
    const out = encodeCcp(3, data);
    expect(out.length).toBe(128);
    expect(out[0]).toBe((3 << 6) | 0); // sequence 3, size code 0 = 127 bytes
    expect(out[127]).toBe(0xFF);
  });

  it('throws on invalid sequence numbers or payload sizes', () => {
    expect(() => encodeCcp(-1, new Uint8Array(1))).toThrow(RangeError);
    expect(() => encodeCcp(4, new Uint8Array(1))).toThrow(RangeError);
    expect(() => encodeCcp(0, new Uint8Array(128))).toThrow(RangeError);
  });
});
