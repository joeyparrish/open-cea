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

// CEA-708 Transport Layer (CTA-708 §4.3)
//
// Extracts/embeds DTVCC bytes from/into DTV video user-data `cc_data()` tuples.

export const CC_TYPE_608_F1 = 0;
export const CC_TYPE_608_F2 = 1;
export const CC_TYPE_DTVCC_CONTINUE = 2;
export const CC_TYPE_DTVCC_START = 3;

/**
 * Encodes a 3-byte cc_data tuple.
 * First byte layout: 11111_valid_type = 0xF8 | (valid << 2) | type.
 * Second and third bytes are the payload.
 */
export function encodeCcDataTuple(valid: boolean, type: number, data1: number, data2: number): Uint8Array {
  const b1 = 0xF8 | (valid ? 0x04 : 0x00) | (type & 0x03);
  return new Uint8Array([b1, data1, data2]);
}

/**
 * Generates a DTVCC padding tuple.
 *
 * Per CTA-708-E section 2.2 / 2.3, padding uses cc_valid=0 with
 * cc_type=10 (continue) or cc_type=11 (start). Both are conformant.
 * The default is `continue`, which matches mid-CCP semantics; pass
 * `'start'` to emit cc_type=11, which is appropriate when the encoder
 * has just finished a CCP and the next tuple in the same `cc_data()`
 * is also padding (some downstream tooling flags long runs of identical
 * padding bytes, so callers may want to vary the type at packet
 * boundaries).
 */
export function dtvccPadding(kind: 'continue' | 'start' = 'continue'): Uint8Array {
  const ccType = kind === 'start' ? CC_TYPE_DTVCC_START : CC_TYPE_DTVCC_CONTINUE;
  return encodeCcDataTuple(false, ccType, 0, 0);
}

/**
 * Converts an even-length Caption Channel Packet (CCP) into a flat array of 3-byte cc_data tuples.
 * The first tuple is marked as DTVCC_START (type 3).
 * Subsequent tuples are marked as DTVCC_CONTINUE (type 2).
 */
export function packetToCcData(ccp: Uint8Array): Uint8Array {
  if (ccp.length % 2 !== 0) {
    throw new Error('CCP length must be even');
  }
  
  const numTuples = ccp.length / 2;
  const out = new Uint8Array(numTuples * 3);
  
  if (numTuples > 0) {
    out[0] = 0xF8 | 0x04 | CC_TYPE_DTVCC_START;
    out[1] = ccp[0];
    out[2] = ccp[1];
    
    for (let i = 1; i < numTuples; i++) {
      out[i * 3 + 0] = 0xF8 | 0x04 | CC_TYPE_DTVCC_CONTINUE;
      out[i * 3 + 1] = ccp[i * 2];
      out[i * 3 + 2] = ccp[i * 2 + 1];
    }
  }
  
  return out;
}
