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

// CEA-608 odd-parity helpers (CTA-608 Section 2).
//
// Every byte on the wire is 7 data bits plus an odd-parity bit in the MSB,
// such that the total number of '1' bits in the 8-bit octet is odd. Spec
// reference tables list bytes without parity (lower 7 bits only); these
// helpers add the parity bit before transmission and verify or strip it
// during reception.

/** Add an odd-parity bit (bit 7) to the lower 7 bits of `byte`. */
export function withParity(byte: number): number {
  const lower = byte & 0x7F;
  let folded = lower;
  folded ^= folded >> 4;
  folded ^= folded >> 2;
  folded ^= folded >> 1;
  // folded & 1 is the XOR of all 7 lower bits = popcount parity.
  // For odd total parity, set the MSB iff that XOR is 0 (i.e. even popcount).
  const parityBit = (folded & 1) === 0 ? 0x80 : 0x00;
  return parityBit | lower;
}

/** Apply parity to both bytes of a 16-bit cc word. */
export function withParityWord(word: number): number {
  const high = withParity((word >> 8) & 0xFF);
  const low = withParity(word & 0xFF);
  return ((high << 8) | low) & 0xFFFF;
}

/** True if the 8-bit byte already has correct odd parity. */
export function hasValidParity(byte: number): boolean {
  return withParity(byte) === (byte & 0xFF);
}

/** Strip the parity bit, returning only the data bits. */
export function stripParity(byte: number): number {
  return byte & 0x7F;
}
