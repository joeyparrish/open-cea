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

// CEA-708 Packet Layer (CTA-708 §5)
//
// Caption Channel Packets (CCPs) assemble Service Blocks into framed packets
// with sequence numbers for loss detection.

/**
 * Encodes a CEA-708 Caption Channel Packet (CCP).
 *
 * A CCP encapsulates Service Blocks. The header includes a 2-bit sequence
 * number (0..3) and a 6-bit packet size code. The maximum payload size is
 * 127 bytes. Because DTVCC transport requires the total CCP length (header
 * + data) to be an even number of bytes, this function will automatically
 * append a 0x00 padding byte if the payload length is even, yielding an
 * odd payload length (and thus an even total length).
 *
 * @param sequenceNumber The sequence number (0..3). Rolls over per CCP.
 * @param payload The service block data to frame (max 127 bytes).
 * @returns A Uint8Array containing the complete, even-length CCP.
 */
export function encodeCcp(sequenceNumber: number, payload: Uint8Array): Uint8Array {
  if (sequenceNumber < 0 || sequenceNumber > 3) {
    throw new RangeError(`Invalid sequence number: ${String(sequenceNumber)} (must be 0..3)`);
  }

  let dataSize = payload.length;
  if (dataSize > 127) {
    throw new RangeError(`CCP payload too large: ${String(dataSize)} (max 127)`);
  }

  // A CCP total length must be even, so the data length must be odd.
  // We append a 0x00 byte (which acts as a Null Service Block or idle filler)
  // if the payload length is even.
  if (dataSize % 2 === 0) {
    dataSize += 1;
  }

  // Calculate packet_size_code.
  // If packet_size_code == 0, dataSize is 127.
  // Else, dataSize = packet_size_code * 2 - 1.
  let packetSizeCode = 0;
  if (dataSize === 127) {
    packetSizeCode = 0;
  } else {
    packetSizeCode = (dataSize + 1) / 2;
  }

  const header = (sequenceNumber << 6) | packetSizeCode;
  const out = new Uint8Array(1 + dataSize);
  out[0] = header;
  out.set(payload, 1);
  // Any padding byte at the end remains 0x00 (initialized by Uint8Array).

  return out;
}
