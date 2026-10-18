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

// Bytes of the `index`-th data line of an MCC document.
function lineBytes(out: string, index: number): Uint8Array {
  const line = out.split('\n').filter((l) => l.includes('\t'))[index];
  return hexToBytes(line.split('\t')[1]);
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

  it('wraps the cc_data in a CDP inside an ANC packet, byte for byte', () => {
    // 60 fps: Table 3 cc_count 10. One valid field-1 608 tuple, an
    // empty field-2 slot, then DTVCC padding.
    const tuples = [0xFC, 0x94, 0x2C, 0xF9, 0x00, 0x00];
    for (let i = 0; i < 8; i++) tuples.push(0xFA, 0x00, 0x00);
    const out = formatMcc([new Uint8Array(tuples)], { fps: 60, ...FIXED_OPTIONS });
    // Hand-packed from SMPTE ST 334-1 section 5.1 and ST 334-2 sections
    // 5.2 / 5.4 / 5.6:
    //   61 01 2B           DID, SDID, DC = 43 (the CDP length)
    //   96 69 2B           cdp_identifier, cdp_length 43 = 7 + 2 + 30 + 4
    //   8F                 frame rate code 8 (60) over reserved 1111
    //   43                 ccdata_present | caption_service_active | reserved 1
    //   00 00              cdp_hdr_sequence_cntr 0
    //   72 EA              ccdata_id, 111 + cc_count 10
    //   <30 tuple bytes>
    //   74 00 00 AF        cdp_footer_id, footer counter 0, checksum
    //                      (0x96 + ... + 0x00 + 0xAF = 0 mod 256)
    //   8D                 trailing filler byte (8-bit sum of the rest)
    expect(out).toContain(
      '00:00:00:00\t61012B96692B8F43000072EAFC942CF90000' +
        'FA0000FA0000FA0000FA0000FA0000FA0000FA0000FA0000740000AF8D\n',
    );
  });

  it('uses ; separator for drop-frame rates', () => {
    const out = formatMcc([tinyFrame(0xFA, 29.97)], { fps: 29.97, ...FIXED_OPTIONS });
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

  // SMPTE ST 334-2 section 5.2, Table 3: frame-rate code and cc_count.
  it.each([
    [24, 0x2, 25],
    [25, 0x3, 24],
    [29.97, 0x4, 20],
    [30, 0x5, 20],
    [50, 0x6, 12],
    [59.94, 0x7, 10],
    [60, 0x8, 10],
  ] as const)('at %s fps writes frame-rate code %i and cc_count %i', (fps, code, ccCount) => {
    const frame = tinyFrame(0xFA, fps);
    const b = lineBytes(formatMcc([frame], { fps, ...FIXED_OPTIONS }), 0);
    const cdpLen = 7 + 2 + 3 * ccCount + 4;
    expect(b[2]).toBe(cdpLen);                    // DC
    expect(b[5]).toBe(cdpLen);                    // cdp_length
    expect(b[6]).toBe((code << 4) | 0x0F);        // cdp_frame_rate + reserved
    expect(b[11]).toBe(0xE0 | ccCount);           // marker + cc_count
    expect(Array.from(b.slice(12, 12 + 3 * ccCount))).toEqual(Array.from(frame));
    expect(b.length).toBe(3 + cdpLen + 1);
  });

  it('increments the header and footer sequence counters together per CDP', () => {
    const b1 = lineBytes(formatMcc([tinyFrame(0xFA, 60), tinyFrame(0xFA, 60)], { fps: 60, ...FIXED_OPTIONS }), 1);
    // cdp_hdr_sequence_cntr at bytes 8..9; footer 74 + counter after the tuples.
    expect([b1[8], b1[9]]).toEqual([0x00, 0x01]);
    expect([b1[42], b1[43], b1[44]]).toEqual([0x74, 0x00, 0x01]);
  });

  it('wraps the sequence counter from 65535 to 0', () => {
    const frames = Array.from({ length: 65537 }, () => tinyFrame(0xFA, 60));
    const out = formatMcc(frames, { fps: 60, ...FIXED_OPTIONS });
    const last = out.split('\n').filter((l) => l.includes('\t'));
    const at = (i: number): number[] => Array.from(hexToBytes(last[i].split('\t')[1]).slice(8, 10));
    expect(at(65535)).toEqual([0xFF, 0xFF]);
    expect(at(65536)).toEqual([0x00, 0x00]);
  });
});

describe('formatMcc - cc_count guard', () => {
  it('rejects a frame whose tuple count differs from the frame-rate value', () => {
    expect(() => formatMcc([tinyFrame(0xFA, 30), new Uint8Array(57)], { fps: 30, ...FIXED_OPTIONS }))
      .toThrow(/Frame 1: cc_data is 57 bytes; a 30 fps CDP carries exactly 20 tuples \(60 bytes\)/);
    expect(() => formatMcc([new Uint8Array(63)], { fps: 30, ...FIXED_OPTIONS })).toThrow(/exactly 20 tuples/);
    expect(() => formatMcc([new Uint8Array(4)], { fps: 30, ...FIXED_OPTIONS })).toThrow(/exactly 20 tuples/);
  });
});

describe('formatMcc - caption_service_active flag', () => {
  // [DID SDID DC | 96 69 len fr FLAGS ...]
  const FLAGS = 7;
  const CSA = 0x02;
  const paddingFrame = (): Uint8Array => tinyFrame(0xFA, 30); // cc_valid=0 everywhere
  const dtvccFrame = (): Uint8Array => {
    const f = paddingFrame();
    f[0] = 0xFF; f[1] = 0x02; f[2] = 0x21; // dtvcc_packet_start, cc_valid=1
    return f;
  };
  const ntscOnlyFrame = (): Uint8Array => {
    const f = paddingFrame();
    f[0] = 0xFC; f[1] = 0x94; f[2] = 0x2C; // 608 field 1, cc_valid=1
    return f;
  };
  const flagsOf = (out: string, i: number): number => lineBytes(out, i)[FLAGS];

  it('sets caption_service_active when the stream carries DTVCC', () => {
    const out = formatMcc([dtvccFrame()], { fps: 30, ...FIXED_OPTIONS });
    expect(flagsOf(out, 0) & CSA).toBe(CSA);
  });

  it('sets caption_service_active for a 608-only stream (608 is caption service 0)', () => {
    const out = formatMcc([ntscOnlyFrame(), paddingFrame()], { fps: 30, ...FIXED_OPTIONS });
    expect(flagsOf(out, 0) & CSA).toBe(CSA);
    expect(flagsOf(out, 1) & CSA).toBe(CSA);
  });

  it('clears caption_service_active for a stream with no valid caption data', () => {
    const out = formatMcc([paddingFrame(), paddingFrame()], { fps: 30, ...FIXED_OPTIONS });
    expect(flagsOf(out, 0)).toBe(0x41);
    expect(flagsOf(out, 1)).toBe(0x41);
  });

  it('holds the flag high on every frame (no flicker across padding frames)', () => {
    const out = formatMcc([dtvccFrame(), paddingFrame()], { fps: 30, ...FIXED_OPTIONS });
    expect(flagsOf(out, 0)).toBe(0x43);
    expect(flagsOf(out, 1)).toBe(0x43);
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
