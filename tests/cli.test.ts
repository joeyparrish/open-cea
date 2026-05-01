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
      ['vtt-to-cea-708', input, output, '--fps', '30'],
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

    expect(runCli(['vtt-to-cea-708', input, a, '--fps', '30'], streams)).toBe(0);
    expect(runCli(
      [
        'vtt-to-cea-708', input, b, '--fps', '30',
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
      ['vtt-to-cea-708', input, join(dir, 'out.bin'), '--fps', '30', '--bogus', '1'],
      streams,
    );

    expect(code).toBe(1);
    expect(err.join('\n')).toContain('Unknown flag --bogus');
  });

  it('rejects an out-of-range anchor-v', () => {
    const dir = tmpWorkdir();
    const input = join(dir, 'in.vtt');
    writeFileSync(input, SAMPLE_VTT);
    const { streams, err } = silentStreams();

    const code = runCli(
      ['vtt-to-cea-708', input, join(dir, 'out.bin'), '--fps', '30', '--anchor-v', '200'],
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
      ['vtt-to-cea-708', input, join(dir, 'out.bin'), '--fps', '15'],
      streams,
    );

    expect(code).toBe(1);
    expect(err.join('\n')).toContain('Invalid fps');
  });
});

describe('runCli dispatch', () => {
  it('reports unknown commands', () => {
    const { streams, err } = silentStreams();
    const code = runCli(['nonsense'], streams);
    expect(code).toBe(1);
    expect(err.join('\n')).toContain('Unknown command: nonsense');
  });

  it('prints usage on no args', () => {
    const { streams, err } = silentStreams();
    const code = runCli([], streams);
    expect(code).toBe(1);
    expect(err.join('\n')).toContain('Usage');
  });
});
