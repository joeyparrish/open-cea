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

// CEA-708 Service Layer (CTA-708 §6.2)
//
// Service Blocks multiplex commands and text for up to 63 logical services
// into a single DTVCC stream.

/**
 * Encodes a CEA-708 Service Block.
 *
 * A service block contains up to 31 bytes of payload (bytecodes) for a
 * specific service (1..63). Service 0 is the Null Block, which contains
 * no data and indicates no more service blocks follow in the current packet.
 *
 * @param serviceNumber The service ID (0..63).
 * @param data The payload data (max 31 bytes). Must be empty if service is 0.
 * @returns A Uint8Array containing the Service Block header and data.
 */
export function encodeServiceBlock(serviceNumber: number, data: Uint8Array): Uint8Array {
  if (serviceNumber < 0 || serviceNumber > 63) {
    throw new RangeError(`Invalid service number: ${String(serviceNumber)} (must be 0..63)`);
  }
  if (data.length > 31) {
    throw new RangeError(`Service block data too large: ${String(data.length)} (max 31)`);
  }

  if (serviceNumber === 0) {
    if (data.length !== 0) {
      throw new RangeError('Service 0 (Null Block) cannot have data');
    }
    return new Uint8Array([0x00]);
  }

  if (serviceNumber <= 6) {
    // Standard header (1 byte): 3 bits service, 5 bits block_size
    const header = (serviceNumber << 5) | data.length;
    const out = new Uint8Array(1 + data.length);
    out[0] = header;
    out.set(data, 1);
    return out;
  } else {
    // Extended header (2 bytes):
    // Byte 1: 0b111 (extended marker) + 5 bits block_size
    // Byte 2: 0b00 (null_fill) + 6 bits extended service number
    const header1 = (0x07 << 5) | data.length;
    const header2 = serviceNumber & 0x3F;
    const out = new Uint8Array(2 + data.length);
    out[0] = header1;
    out[1] = header2;
    out.set(data, 2);
    return out;
  }
}
