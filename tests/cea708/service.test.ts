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
import { encodeServiceBlock } from '../../src/cea708/service.js';

describe('encodeServiceBlock', () => {
  it('encodes a standard header for services 1..6', () => {
    // Service 2, 3 bytes of data
    const data = new Uint8Array([0x01, 0x02, 0x03]);
    const out = encodeServiceBlock(2, data);
    expect(out.length).toBe(4);
    expect(out[0]).toBe((2 << 5) | 3); // 0b01000011 = 0x43
    expect(out[1]).toBe(0x01);
    expect(out[2]).toBe(0x02);
    expect(out[3]).toBe(0x03);
  });

  it('encodes an extended header for services 7..63', () => {
    // Service 7, 2 bytes of data
    const data = new Uint8Array([0xAA, 0xBB]);
    const out = encodeServiceBlock(7, data);
    expect(out.length).toBe(4);
    expect(out[0]).toBe((7 << 5) | 2); // 0b11100010 = 0xE2
    expect(out[1]).toBe(7); // 0b00000111
    expect(out[2]).toBe(0xAA);
    expect(out[3]).toBe(0xBB);
  });

  it('encodes a Null Block for service 0', () => {
    const out = encodeServiceBlock(0, new Uint8Array(0));
    expect(out.length).toBe(1);
    expect(out[0]).toBe(0x00);
  });

  it('throws on invalid service numbers or data sizes', () => {
    expect(() => encodeServiceBlock(-1, new Uint8Array())).toThrow(RangeError);
    expect(() => encodeServiceBlock(64, new Uint8Array())).toThrow(RangeError);
    expect(() => encodeServiceBlock(1, new Uint8Array(32))).toThrow(RangeError);
    expect(() => encodeServiceBlock(0, new Uint8Array(1))).toThrow(RangeError);
  });

  it('rejects extended service blocks with no data', () => {
    // Per CTA-708-E §6.2 the extended service number byte is only
    // present when block_size != 0. An empty extended block would
    // emit an undecodable 2-byte stub.
    expect(() => encodeServiceBlock(7, new Uint8Array(0))).toThrow(RangeError);
    expect(() => encodeServiceBlock(63, new Uint8Array(0))).toThrow(RangeError);
  });
});
