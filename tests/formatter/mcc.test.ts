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
import { formatMcc } from '../../src/formatter/mcc.js';

const FIXED_OPTIONS = {
  uuid: '00000000-0000-0000-0000-000000000000',
  creationDate: '2026-05-01',
  creationTime: '12:00:00',
  creationProgram: 'open-cea-test',
};

function tinyFrame(byte: number, fps: 24 | 25 | 29.97 | 30 | 50 | 59.94 | 60): Uint8Array {
  // Build a frame full of `byte` at the per-frame size for the rate.
  const sizes = { 24: 75, 25: 72, 29.97: 60, 30: 60, 50: 36, 59.94: 30, 60: 30 };
  return new Uint8Array(sizes[fps]).fill(byte);
}

describe('formatMcc - header', () => {
  it('starts with the spec-mandated File Format line', () => {
    const out = formatMcc([], { fps: 30, ...FIXED_OPTIONS });
    expect(out.startsWith('File Format=MacCaption_MCC V2.0\n')).toBe(true);
  });

  it.each([
    [24, '24'],
    [25, '25'],
    [29.97, '30DF'],
    [30, '30'],
    [50, '50'],
    [59.94, '60DF'],
    [60, '60'],
  ] as const)('writes Time Code Rate=%s for %f fps', (fps, expected) => {
    const out = formatMcc([], { fps, ...FIXED_OPTIONS });
    expect(out).toContain(`Time Code Rate=${expected}\n`);
  });

  it('passes through caller-pinned metadata for reproducibility', () => {
    const out = formatMcc([], { fps: 30, ...FIXED_OPTIONS });
    expect(out).toContain('UUID=00000000-0000-0000-0000-000000000000\n');
    expect(out).toContain('Creation Program=open-cea-test\n');
    expect(out).toContain('Creation Date=2026-05-01\n');
    expect(out).toContain('Creation Time=12:00:00\n');
  });
});

describe('formatMcc - data lines', () => {
  it('emits one data line per input frame', () => {
    const frames = [tinyFrame(0xAA, 30), tinyFrame(0xBB, 30), tinyFrame(0xCC, 30)];
    const out = formatMcc(frames, { fps: 30, ...FIXED_OPTIONS });
    const dataLineRe = /^\d{2}:\d{2}:\d{2}[:;]\d{2}\t/;
    const dataLines = out.split('\n').filter((l) => dataLineRe.exec(l) !== null);
    expect(dataLines.length).toBe(3);
  });

  it('formats each line as <timecode>\\t<uppercase-hex>', () => {
    const frame = new Uint8Array([0xFC, 0x80, 0x80]);
    // 30 fps frames are normally 60 bytes; this test crafts a 3-byte
    // frame to make the hex assertion easy. The formatter does not
    // enforce a frame size; the round-trip happens at splitByFrame.
    const out = formatMcc([frame], { fps: 30, ...FIXED_OPTIONS });
    expect(out).toContain('00:00:00:00\tFC8080\n');
  });

  it('uses ; separator for drop-frame rates', () => {
    const out = formatMcc([new Uint8Array([0x00])], { fps: 29.97, ...FIXED_OPTIONS });
    expect(out).toContain('00:00:00;00\t00\n');
    expect(out.includes('00:00:00:00\t')).toBe(false);
  });

  it('advances the timecode by one frame per data line', () => {
    const frames = [tinyFrame(0x00, 30), tinyFrame(0x00, 30), tinyFrame(0x00, 30)];
    const out = formatMcc(frames, { fps: 30, ...FIXED_OPTIONS });
    expect(out).toContain('00:00:00:00\t');
    expect(out).toContain('00:00:00:01\t');
    expect(out).toContain('00:00:00:02\t');
  });

  it('produces hex whose byte count equals the frame size', () => {
    const frames = [tinyFrame(0xFA, 30)];
    const out = formatMcc(frames, { fps: 30, ...FIXED_OPTIONS });
    const dataLine = out.split('\n').find((l) => l.startsWith('00:00:00:00\t')) ?? '';
    expect(dataLine).not.toBe('');
    const hex = dataLine.split('\t')[1];
    // 30 fps -> 20 tuples * 3 bytes = 60 bytes -> 120 hex chars.
    expect(hex.length).toBe(60 * 2);
  });
});

describe('formatMcc - whole-document shape', () => {
  it('round-trips a small empty stream to a deterministic string', () => {
    const out = formatMcc([], { fps: 30, ...FIXED_OPTIONS });
    expect(out).toBe(
      'File Format=MacCaption_MCC V2.0\n' +
        '\n' +
        'UUID=00000000-0000-0000-0000-000000000000\n' +
        'Creation Program=open-cea-test\n' +
        'Creation Date=2026-05-01\n' +
        'Creation Time=12:00:00\n' +
        'Time Code Rate=30\n' +
        '\n',
    );
  });
});
