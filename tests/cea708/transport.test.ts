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
import {
  encodeCcDataTuple,
  dtvccPadding,
  packetToCcData,
  CC_TYPE_DTVCC_START,
  CC_TYPE_DTVCC_CONTINUE,
} from '../../src/cea708/transport.js';

describe('encodeCcDataTuple', () => {
  it('encodes a valid tuple with correct marker bits', () => {
    // valid = true, type = 3
    const out = encodeCcDataTuple(true, 3, 0xAA, 0xBB);
    expect(out[0]).toBe(0xF8 | 0x04 | 0x03); // 0xFF
    expect(out[1]).toBe(0xAA);
    expect(out[2]).toBe(0xBB);
  });

  it('encodes an invalid tuple', () => {
    // valid = false, type = 2
    const out = encodeCcDataTuple(false, 2, 0x00, 0x00);
    expect(out[0]).toBe(0xF8 | 0x00 | 0x02); // 0xFA
    expect(out[1]).toBe(0x00);
    expect(out[2]).toBe(0x00);
  });
});

describe('dtvccPadding', () => {
  it('returns a standard padding tuple', () => {
    const pad = dtvccPadding();
    expect(pad.length).toBe(3);
    expect(pad[0]).toBe(0xF8 | 0x00 | 0x02); // invalid, continue
    expect(pad[1]).toBe(0);
    expect(pad[2]).toBe(0);
  });
});

describe('packetToCcData', () => {
  it('breaks a CCP into 3-byte cc_data tuples', () => {
    // A 4-byte CCP
    const ccp = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
    const out = packetToCcData(ccp);
    
    expect(out.length).toBe(6); // 2 tuples
    
    // First tuple: START
    expect(out[0]).toBe(0xF8 | 0x04 | CC_TYPE_DTVCC_START);
    expect(out[1]).toBe(0x01);
    expect(out[2]).toBe(0x02);
    
    // Second tuple: CONTINUE
    expect(out[3]).toBe(0xF8 | 0x04 | CC_TYPE_DTVCC_CONTINUE);
    expect(out[4]).toBe(0x03);
    expect(out[5]).toBe(0x04);
  });

  it('throws if CCP length is not even', () => {
    const ccp = new Uint8Array([0x01, 0x02, 0x03]);
    expect(() => packetToCcData(ccp)).toThrow('CCP length must be even');
  });
});
