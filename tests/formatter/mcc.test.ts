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

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
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

  it('wraps the cc_data in a CDP inside a SMPTE 291M ANC packet', () => {
    const frame = new Uint8Array([0xFC, 0x80, 0x80]); // one cc_data tuple
    const out = formatMcc([frame], { fps: 30, ...FIXED_OPTIONS });
    const hex = out.split('\n').find((l) => l.startsWith('00:00:00:00\t'))?.split('\t')[1] ?? '';
    const b = hexToBytes(hex);
    // ANC header: DID=0x61, SDID=0x01, data_count == cdp_length.
    expect(b[0]).toBe(0x61);
    expect(b[1]).toBe(0x01);
    const cdpLen = b[2];
    expect(b.length).toBe(3 + cdpLen + 1); // + trailing ANC checksum
    // CDP header: identifier 0x9669, length, frame-rate code 5 (30 fps).
    expect(b[3]).toBe(0x96);
    expect(b[4]).toBe(0x69);
    expect(b[5]).toBe(cdpLen);
    expect(b[6]).toBe((0x5 << 4) | 0x0F);
    // ccdata_section: 0x72, then marker(111) + cc_count(1).
    expect(b[10]).toBe(0x72);
    expect(b[11]).toBe(0xE0 | 1);
    expect([b[12], b[13], b[14]]).toEqual([0xFC, 0x80, 0x80]);
    // CDP sums to zero (mod 256) via the footer packet_checksum.
    let cdpSum = 0;
    for (let i = 3; i < 3 + cdpLen; i++) cdpSum = (cdpSum + b[i]) & 0xFF;
    expect(cdpSum).toBe(0);
  });

  it('uses ; separator for drop-frame rates', () => {
    const out = formatMcc([new Uint8Array([0x00, 0x00, 0x00])], { fps: 29.97, ...FIXED_OPTIONS });
    expect(out).toContain('00:00:00;00\t');
    expect(out.includes('00:00:00:00\t')).toBe(false);
  });

  it('advances the timecode by one frame per data line', () => {
    const frames = [tinyFrame(0x00, 30), tinyFrame(0x00, 30), tinyFrame(0x00, 30)];
    const out = formatMcc(frames, { fps: 30, ...FIXED_OPTIONS });
    expect(out).toContain('00:00:00:00\t');
    expect(out).toContain('00:00:00:01\t');
    expect(out).toContain('00:00:00:02\t');
  });

  it('round-trips the exact cc_data tuples through the CDP wrapper', () => {
    // 30 fps -> 20 tuples * 3 = 60 cc_data bytes. Full line adds the
    // 3-byte ANC header, 13 bytes of CDP framing, and 1 ANC checksum.
    const frame = tinyFrame(0xFA, 30);
    const out = formatMcc([frame], { fps: 30, ...FIXED_OPTIONS });
    const hex = out.split('\n').find((l) => l.startsWith('00:00:00:00\t'))?.split('\t')[1] ?? '';
    const b = hexToBytes(hex);
    expect(b.length).toBe(3 + (13 + 60) + 1);
    const cdpLen = b[2];
    expect(cdpLen).toBe(13 + 60);
    const ccCount = b[11] & 0x1F;
    expect(ccCount).toBe(20);
    const tuples = b.slice(12, 12 + 60);
    expect(Array.from(tuples)).toEqual(Array.from(frame));
  });
});

describe('formatMcc - caption_service_active flag', () => {
  // cdp_flags is the 5th CDP byte: [DID SDID DC | 96 69 len fr FLAGS ...].
  const FLAGS = 7;
  const CSA = 0x02; // caption_service_active bit
  // A 30 fps frame with one valid DTVCC start tuple (0xFF), rest padding.
  const dtvccFrame = (): Uint8Array => {
    const f = new Uint8Array(60).fill(0xFA); // dtvcc padding (cc_valid=0)
    f[0] = 0xFF; f[1] = 0x02; f[2] = 0x21;   // dtvcc_packet_start, cc_valid=1
    return f;
  };
  // A 30 fps frame carrying only a valid 608 tuple + padding (no DTVCC).
  const ntscOnlyFrame = (): Uint8Array => {
    const f = new Uint8Array(60).fill(0xFA);
    f[0] = 0xFC; f[1] = 0x80; f[2] = 0x80;   // ntsc field 1, cc_valid=1
    return f;
  };
  const flagsOf = (out: string, tc: string): number =>
    hexToBytes(out.split('\n').find((l) => l.startsWith(`${tc}\t`))?.split('\t')[1] ?? '')[FLAGS];

  it('sets caption_service_active when the stream carries DTVCC', () => {
    const out = formatMcc([dtvccFrame()], { fps: 30, ...FIXED_OPTIONS });
    expect(flagsOf(out, '00:00:00:00') & CSA).toBe(CSA);
  });

  it('clears caption_service_active for a 608-only / DTVCC-free stream', () => {
    const out = formatMcc([ntscOnlyFrame(), ntscOnlyFrame()], { fps: 30, ...FIXED_OPTIONS });
    expect(flagsOf(out, '00:00:00:00') & CSA).toBe(0);
    expect(flagsOf(out, '00:00:00:01') & CSA).toBe(0);
  });

  it('holds the flag high on every frame (no flicker across padding frames)', () => {
    // One DTVCC frame followed by a padding-only frame: the stream is
    // "active", so both CDPs must report caption_service_active.
    const out = formatMcc([dtvccFrame(), ntscOnlyFrame()], { fps: 30, ...FIXED_OPTIONS });
    expect(flagsOf(out, '00:00:00:00') & CSA).toBe(CSA);
    expect(flagsOf(out, '00:00:00:01') & CSA).toBe(CSA);
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
