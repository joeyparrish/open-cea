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

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const goldenDir = join(here, '..', '..', 'libcaption-test-suite', 'golden');

export function loadGolden(filename: string): Uint8Array {
  return new Uint8Array(readFileSync(join(goldenDir, filename)));
}

/** Pack a sequence of 16-bit cc words as big-endian bytes. */
export function packBigEndian(words: readonly number[]): Uint8Array {
  const bytes = new Uint8Array(words.length * 2);
  for (let i = 0; i < words.length; i++) {
    const word = words[i] ?? 0;
    bytes[i * 2] = (word >> 8) & 0xFF;
    bytes[i * 2 + 1] = word & 0xFF;
  }
  return bytes;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Assert byte-for-byte equality between two byte sequences using a hex
 * representation, which gives readable diffs when they disagree.
 */
export function expectBytesEqual(actual: Uint8Array, expected: Uint8Array): void {
  expect(toHex(actual)).toBe(toHex(expected));
}
