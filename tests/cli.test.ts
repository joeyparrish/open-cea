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

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli, type CliStreams } from '../src/cli/runCli.js';

function tmpWorkdir(): string {
  return mkdtempSync(join(tmpdir(), 'open-cea-cli-'));
}

function silentStreams(): { streams: CliStreams; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return {
    streams: {
      stdout: (line) => out.push(line),
      stderr: (line) => err.push(line),
    },
    out,
    err,
  };
}

const SAMPLE_VTT = `WEBVTT

00:00:01.000 --> 00:00:02.000
Hello
`;

describe('vtt-to-cea-708', () => {
  it('compiles a basic VTT to a non-empty raw output', () => {
    const dir = tmpWorkdir();
    const input = join(dir, 'in.vtt');
    const output = join(dir, 'out.bin');
    writeFileSync(input, SAMPLE_VTT);
    const { streams } = silentStreams();

    const code = runCli(
      ['--fps', '30', '--output-format', 'raw', 'vtt-to-cea-708', input, output],
      streams,
    );

    expect(code).toBe(0);
    const bytes = readFileSync(output);
    expect(bytes.length).toBeGreaterThan(0);
    // 30 fps -> 20 cc_data tuples per frame -> 60 bytes per frame
    expect(bytes.length % 60).toBe(0);
  });

  it('window-template flags change the output bytes', () => {
    const dir = tmpWorkdir();
    const input = join(dir, 'in.vtt');
    writeFileSync(input, SAMPLE_VTT);
    const a = join(dir, 'a.bin');
    const b = join(dir, 'b.bin');
    const { streams } = silentStreams();

    expect(runCli(['--fps', '30', '--output-format', 'raw', 'vtt-to-cea-708', input, a], streams)).toBe(0);
    expect(runCli(
      [
        '--fps', '30', '--output-format', 'raw', 'vtt-to-cea-708', input, b,
        '--anchor-v', '50', '--win-rows', '4',
      ],
      streams,
    )).toBe(0);

    const bytesA = readFileSync(a);
    const bytesB = readFileSync(b);
    expect(bytesA.length).toBe(bytesB.length); // DefineWindow is fixed-size
    expect(Buffer.compare(bytesA, bytesB)).not.toBe(0);
  });

  it('rejects an unknown flag', () => {
    const dir = tmpWorkdir();
    const input = join(dir, 'in.vtt');
    writeFileSync(input, SAMPLE_VTT);
    const { streams, err } = silentStreams();

    const code = runCli(
      ['--fps', '30', 'vtt-to-cea-708', input, join(dir, 'out.bin'), '--bogus', '1'],
      streams,
    );

    expect(code).toBe(1);
    expect(err.join('\n')).toContain("unknown option '--bogus'");
  });

  it('rejects an out-of-range anchor-v', () => {
    const dir = tmpWorkdir();
    const input = join(dir, 'in.vtt');
    writeFileSync(input, SAMPLE_VTT);
    const { streams, err } = silentStreams();

    const code = runCli(
      ['--fps', '30', 'vtt-to-cea-708', input, join(dir, 'out.bin'), '--anchor-v', '200'],
      streams,
    );

    expect(code).toBe(1);
    expect(err.join('\n')).toContain('--anchor-v');
  });

  it('rejects an unsupported fps', () => {
    const dir = tmpWorkdir();
    const input = join(dir, 'in.vtt');
    writeFileSync(input, SAMPLE_VTT);
    const { streams, err } = silentStreams();

    const code = runCli(
      ['--fps', '15', 'vtt-to-cea-708', input, join(dir, 'out.bin')],
      streams,
    );

    expect(code).toBe(1);
    expect(err.join('\n')).toContain('Invalid fps');
  });
});

describe('vtt-to-cea-608', () => {
  function f1Words(bytes: Buffer): number[] {
    const out: number[] = [];
    for (let i = 0; i < bytes.length; i += 3) {
      if (bytes[i] === 0xFC) {
        out.push(((bytes[i + 1] & 0x7F) << 8) | (bytes[i + 2] & 0x7F));
      }
    }
    return out;
  }

  it('--style pop-on emits non-empty F1 output starting with RCL', () => {
    const dir = tmpWorkdir();
    const input = join(dir, 'in.vtt');
    const output = join(dir, 'out.bin');
    writeFileSync(input, SAMPLE_VTT);
    const { streams } = silentStreams();

    const code = runCli(
      ['--fps', '30', '--output-format', 'raw', 'vtt-to-cea-608', input, output, '--style', 'pop-on'],
      streams,
    );

    expect(code).toBe(0);
    const bytes = readFileSync(output);
    expect(bytes.length).toBeGreaterThan(0);
    const words = f1Words(bytes);
    // First non-PAC control word should be RCL = 0x1420 on CC1.
    const firstControl = words.find((w) => {
      const high = (w >> 8) & 0x7F;
      return high >= 0x10 && high <= 0x17 && (w & 0x40) === 0;
    });
    expect(firstControl).toBe(0x1420);
  });

  it('--style roll-up --rows 2 emits RU2', () => {
    const dir = tmpWorkdir();
    const input = join(dir, 'in.vtt');
    const output = join(dir, 'out.bin');
    writeFileSync(input, SAMPLE_VTT);
    const { streams } = silentStreams();

    const code = runCli(
      ['--fps', '30', '--output-format', 'raw', 'vtt-to-cea-608', input, output,
        '--style', 'roll-up', '--rows', '2'],
      streams,
    );

    expect(code).toBe(0);
    const words = f1Words(readFileSync(output));
    const firstControl = words.find((w) => {
      const high = (w >> 8) & 0x7F;
      return high >= 0x10 && high <= 0x17 && (w & 0x40) === 0;
    });
    expect(firstControl).toBe(0x1425); // RU2
  });

  it('rejects --rows with --style pop-on', () => {
    const dir = tmpWorkdir();
    const input = join(dir, 'in.vtt');
    writeFileSync(input, SAMPLE_VTT);
    const { streams, err } = silentStreams();

    const code = runCli(
      ['--fps', '30', 'vtt-to-cea-608', input, join(dir, 'out.bin'),
        '--style', 'pop-on', '--rows', '4'],
      streams,
    );

    expect(code).toBe(1);
    expect(err.join('\n')).toContain('--rows is only valid with --style roll-up');
  });

  it('requires --style', () => {
    const dir = tmpWorkdir();
    const input = join(dir, 'in.vtt');
    writeFileSync(input, SAMPLE_VTT);
    const { streams, err } = silentStreams();

    const code = runCli(
      ['--fps', '30', 'vtt-to-cea-608', input, join(dir, 'out.bin')],
      streams,
    );

    expect(code).toBe(1);
    expect(err.join('\n')).toContain("required option '--style <style>' not specified");
  });

  it('rejects an invalid --style value', () => {
    const dir = tmpWorkdir();
    const input = join(dir, 'in.vtt');
    writeFileSync(input, SAMPLE_VTT);
    const { streams, err } = silentStreams();

    const code = runCli(
      ['--fps', '30', 'vtt-to-cea-608', input, join(dir, 'out.bin'),
        '--style', 'bogus'],
      streams,
    );

    expect(code).toBe(1);
    expect(err.join('\n')).toContain('Invalid --style');
  });
});

describe('--output-format', () => {
  it('defaults to MCC when no --output-format flag is given', () => {
    const dir = tmpWorkdir();
    const input = join(dir, 'in.vtt');
    const output = join(dir, 'out.mcc');
    writeFileSync(input, SAMPLE_VTT);
    const { streams } = silentStreams();

    const code = runCli(['--fps', '30', 'vtt-to-cea-708', input, output], streams);

    expect(code).toBe(0);
    const text = readFileSync(output, 'utf-8');
    expect(text.startsWith('File Format=MacCaption_MCC V2.0\n')).toBe(true);
    expect(text).toContain('Time Code Rate=30\n');
  });

  it('--output-format mcc produces an MCC sidecar with drop-frame timecode at 29.97', () => {
    const dir = tmpWorkdir();
    const input = join(dir, 'in.vtt');
    const output = join(dir, 'out.mcc');
    writeFileSync(input, SAMPLE_VTT);
    const { streams } = silentStreams();

    const code = runCli(
      ['--fps', '29.97', '--output-format', 'mcc', 'vtt-to-cea-708', input, output],
      streams,
    );

    expect(code).toBe(0);
    const text = readFileSync(output, 'utf-8');
    expect(text).toContain('Time Code Rate=30DF\n');
    expect(text).toContain('00:00:00;00\t');
  });

  it('--output-format mcc works for the 608 path too', () => {
    const dir = tmpWorkdir();
    const input = join(dir, 'in.vtt');
    const output = join(dir, 'out.mcc');
    writeFileSync(input, SAMPLE_VTT);
    const { streams } = silentStreams();

    const code = runCli(
      ['--fps', '30', '--output-format', 'mcc', 'vtt-to-cea-608', input, output, '--style', 'pop-on'],
      streams,
    );

    expect(code).toBe(0);
    const text = readFileSync(output, 'utf-8');
    expect(text.startsWith('File Format=MacCaption_MCC V2.0\n')).toBe(true);
  });

  it('rejects an unknown --output-format value', () => {
    const dir = tmpWorkdir();
    const input = join(dir, 'in.vtt');
    writeFileSync(input, SAMPLE_VTT);
    const { streams, err } = silentStreams();

    const code = runCli(
      ['--fps', '30', '--output-format', 'bogus', 'vtt-to-cea-708', input, join(dir, 'out')],
      streams,
    );

    expect(code).toBe(1);
    expect(err.join('\n')).toContain('Invalid --output-format');
  });
});

describe('compile', () => {
  const SAMPLE_DOC = JSON.stringify({
    tracks: [{
      target: '708',
      windows: [{ id: 0, anchorVertical: 14, rowCount: 2, columnCount: 32 }],
      events: [{ startTimeSec: 0, endTimeSec: 1, text: 'Hi' }],
    }],
  });

  it('compiles a JSON doc to MCC by default', () => {
    const dir = tmpWorkdir();
    const input = join(dir, 'in.json');
    const output = join(dir, 'out.mcc');
    writeFileSync(input, SAMPLE_DOC);
    const { streams } = silentStreams();

    const code = runCli(['--fps', '30', 'compile', input, output], streams);

    expect(code).toBe(0);
    expect(readFileSync(output, 'utf-8').startsWith('File Format=MacCaption_MCC V2.0\n')).toBe(true);
  });

  it('compiles a multi-track doc into a non-empty raw stream', () => {
    const dir = tmpWorkdir();
    const input = join(dir, 'in.json');
    const output = join(dir, 'out.bin');
    writeFileSync(input, JSON.stringify({
      tracks: [
        {
          target: '608', channel: 'CC1', style: 'pop-on',
          events: [{ startTimeSec: 0, endTimeSec: 1, text: 'A' }],
        },
        {
          target: '608', channel: 'CC3', style: 'pop-on',
          events: [{ startTimeSec: 0, endTimeSec: 1, text: 'B' }],
        },
      ],
    }));
    const { streams } = silentStreams();

    const code = runCli(['--fps', '30', '--output-format', 'raw', 'compile', input, output], streams);

    expect(code).toBe(0);
    expect(readFileSync(output).length).toBeGreaterThan(0);
  });

  it('reports validation errors with the offending JSON path', () => {
    const dir = tmpWorkdir();
    const input = join(dir, 'in.json');
    writeFileSync(input, JSON.stringify({
      tracks: [{ target: '708', windows: [], events: [] }],
    }));
    const { streams, err } = silentStreams();

    const code = runCli(['--fps', '30', 'compile', input, join(dir, 'out')], streams);

    expect(code).toBe(1);
    expect(err.join('\n')).toContain('windows');
    expect(err.join('\n')).toContain('at least one window');
  });
});

describe('test-pattern', () => {
  it('--type timing emits a non-empty MCC', () => {
    const dir = tmpWorkdir();
    const output = join(dir, 'out.mcc');
    const { streams } = silentStreams();

    const code = runCli(
      ['--fps', '30', 'test-pattern', output, '--type', 'timing', '--duration', '3'],
      streams,
    );

    expect(code).toBe(0);
    const text = readFileSync(output, 'utf-8');
    expect(text.startsWith('File Format=MacCaption_MCC V2.0\n')).toBe(true);
    // 3 seconds at 30 fps + 1 s drain = 120 frames, give or take.
    const dataLines = text.split('\n').filter((l) => /^\d{2}:\d{2}:\d{2}:\d{2}\t/.exec(l) !== null);
    expect(dataLines.length).toBeGreaterThan(60);
  });

  it('--type position --target 708 succeeds', () => {
    const dir = tmpWorkdir();
    const output = join(dir, 'out.bin');
    const { streams } = silentStreams();

    const code = runCli(
      ['--fps', '30', '--output-format', 'raw', 'test-pattern', output,
        '--type', 'position', '--duration', '4'],
      streams,
    );

    expect(code).toBe(0);
    expect(readFileSync(output).length).toBeGreaterThan(0);
  });

  it('--type position --target 608 is rejected', () => {
    const dir = tmpWorkdir();
    const output = join(dir, 'out.bin');
    const { streams, err } = silentStreams();

    const code = runCli(
      ['--fps', '30', 'test-pattern', output,
        '--type', 'position', '--target', '608', '--duration', '4'],
      streams,
    );

    expect(code).toBe(1);
    expect(err.join('\n')).toContain('708-only');
  });

  it('--type timing --target 608 produces a 608 stream', () => {
    const dir = tmpWorkdir();
    const output = join(dir, 'out.bin');
    const { streams } = silentStreams();

    const code = runCli(
      ['--fps', '30', '--output-format', 'raw', 'test-pattern', output,
        '--type', 'timing', '--target', '608', '--duration', '3'],
      streams,
    );

    expect(code).toBe(0);
    const bytes = readFileSync(output);
    // F1 entries (cc_type=00 with valid bit) carry the 608 stream.
    let f1Count = 0;
    for (let i = 0; i < bytes.length; i += 3) {
      if (bytes[i] === 0xFC) f1Count++;
    }
    expect(f1Count).toBeGreaterThan(0);
  });
});

describe('runCli dispatch', () => {
  it('reports unknown commands', () => {
    const { streams, err } = silentStreams();
    const code = runCli(['--fps', '30', 'nonsense'], streams);
    expect(code).toBe(1);
    expect(err.join('\n')).toContain("unknown command 'nonsense'");
  });

  it('prints usage on no args', () => {
    const { streams, err } = silentStreams();
    const code = runCli([], streams);
    expect(code).toBe(1);
    expect(err.join('\n')).toContain('Usage');
  });
});
