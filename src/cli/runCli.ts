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
import { Command, CommanderError, InvalidArgumentError } from 'commander';
import { parseVtt } from '../parser/vtt.js';
import { compileTimeline } from '../compiler.js';
import {
  compileTimeline608,
  type Cea608Style,
  type CcChannelName,
} from '../compiler608.js';
import { writeRawFile } from '../formatter/raw.js';
import type { FrameRate } from '../encoder.js';
import type { Window } from '../timeline.js';

const VALID_FPS: readonly number[] = [24, 25, 29.97, 30, 50, 59.94, 60];

export interface CliStreams {
  stdout: (line: string) => void;
  stderr: (line: string) => void;
}

const defaultStreams: CliStreams = {
  // eslint-disable-next-line no-console
  stdout: (line) => { console.log(line); },
  // eslint-disable-next-line no-console
  stderr: (line) => { console.error(line); },
};

function parseFps(raw: string): FrameRate {
  const fps = parseFloat(raw);
  if (!VALID_FPS.includes(fps)) {
    throw new InvalidArgumentError(
      `Invalid fps: ${raw}. Supported: ${VALID_FPS.join(', ')}`,
    );
  }
  return fps as FrameRate;
}

function parseIntInRange(min: number, max: number, name: string): (raw: string) => number {
  return (raw: string) => {
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < min || n > max) {
      throw new InvalidArgumentError(
        `${name} must be an integer in [${String(min)}, ${String(max)}]`,
      );
    }
    return n;
  };
}

function parseStyle(raw: string): Cea608Style {
  if (raw !== 'pop-on' && raw !== 'paint-on' && raw !== 'roll-up') {
    throw new InvalidArgumentError(
      `Invalid --style: ${raw}. Choose pop-on, paint-on, or roll-up.`,
    );
  }
  return raw;
}

function parseChannel(raw: string): CcChannelName {
  if (raw !== 'CC1' && raw !== 'CC2' && raw !== 'CC3' && raw !== 'CC4') {
    throw new InvalidArgumentError(
      `Invalid --channel: ${raw}. Choose CC1, CC2, CC3, or CC4.`,
    );
  }
  return raw;
}

interface Common708Options {
  fps: FrameRate;
  anchorV?: number;
  anchorH?: number;
  anchorPoint?: number;
  winRows?: number;
  winCols?: number;
  service?: number;
}

function run708Action(
  inputFile: string,
  outputFile: string,
  opts: Common708Options,
  streams: CliStreams,
): void {
  const windowTemplate: Omit<Window, 'id'> = { visible: true };
  if (opts.anchorV !== undefined) windowTemplate.anchorVertical = opts.anchorV;
  if (opts.anchorH !== undefined) windowTemplate.anchorHorizontal = opts.anchorH;
  if (opts.anchorPoint !== undefined) {
    (windowTemplate as { anchorPoint?: number }).anchorPoint = opts.anchorPoint;
  }
  if (opts.winRows !== undefined) windowTemplate.rowCount = opts.winRows;
  if (opts.winCols !== undefined) windowTemplate.columnCount = opts.winCols;

  const vttContent = readFileSync(inputFile, 'utf-8');
  const timeline = parseVtt(vttContent, windowTemplate);
  const compileOpts: { fps: FrameRate; serviceNumber?: number } = { fps: opts.fps };
  if (opts.service !== undefined) compileOpts.serviceNumber = opts.service;
  const ccData = compileTimeline(timeline, compileOpts);

  writeRawFile(outputFile, ccData);
  streams.stdout(
    `Successfully compiled ${inputFile} to ${outputFile} at ${String(opts.fps)} fps (CEA-708).`,
  );
}

interface Common608Options {
  fps: FrameRate;
  style: Cea608Style;
  rows?: number;
  row?: number;
  column?: number;
  channel: CcChannelName;
}

function run608Action(
  inputFile: string,
  outputFile: string,
  opts: Common608Options,
  streams: CliStreams,
): void {
  if (opts.rows !== undefined && opts.style !== 'roll-up') {
    throw new Error('--rows is only valid with --style roll-up');
  }

  const compileOpts: Parameters<typeof compileTimeline608>[1] = {
    fps: opts.fps,
    style: opts.style,
    channel: opts.channel,
  };
  if (opts.rows === 2 || opts.rows === 3 || opts.rows === 4) {
    compileOpts.rollUpRows = opts.rows;
  }
  if (opts.row !== undefined) compileOpts.row = opts.row;
  if (opts.column !== undefined) compileOpts.column = opts.column - 1;

  const vttContent = readFileSync(inputFile, 'utf-8');
  const timeline = parseVtt(vttContent);
  const ccData = compileTimeline608(timeline, compileOpts);

  writeRawFile(outputFile, ccData);
  streams.stdout(
    `Successfully compiled ${inputFile} to ${outputFile} at ${String(opts.fps)} fps ` +
      `(CEA-608, ${opts.style}, ${opts.channel}).`,
  );
}

function buildProgram(streams: CliStreams): Command {
  const program = new Command()
    .name('open-cea')
    .description('CEA-608 / CEA-708 caption generator')
    .requiredOption(
      '--fps <rate>',
      'target frame rate (24, 25, 29.97, 30, 50, 59.94, 60)',
      parseFps,
    )
    .enablePositionalOptions()
    .exitOverride()
    .configureOutput({
      writeOut: (str) => { streams.stdout(str.replace(/\n+$/, '')); },
      writeErr: (str) => { streams.stderr(str.replace(/\n+$/, '')); },
    });

  program
    .command('vtt-to-cea-708')
    .description('Generate a CEA-708 stream from a WebVTT file')
    .argument('<input.vtt>')
    .argument('<output.bin>')
    .option('--anchor-v <n>', 'window vertical anchor (0..99)', parseIntInRange(0, 99, '--anchor-v'))
    .option('--anchor-h <n>', 'window horizontal anchor (0..209)', parseIntInRange(0, 209, '--anchor-h'))
    .option('--anchor-point <n>', 'window anchor corner (0..8)', parseIntInRange(0, 8, '--anchor-point'))
    .option('--win-rows <n>', 'window row count (1..15)', parseIntInRange(1, 15, '--win-rows'))
    .option('--win-cols <n>', 'window column count (1..42)', parseIntInRange(1, 42, '--win-cols'))
    .option('--service <n>', 'DTVCC service number (1..63)', parseIntInRange(1, 63, '--service'))
    .action(function (this: Command, input: string, output: string, opts: Omit<Common708Options, 'fps'>) {
      const fps = this.optsWithGlobals().fps as FrameRate;
      run708Action(input, output, { ...opts, fps }, streams);
    });

  program
    .command('vtt-to-cea-608')
    .description('Generate a CEA-608 stream from a WebVTT file')
    .argument('<input.vtt>')
    .argument('<output.bin>')
    .requiredOption('--style <style>', 'pop-on | paint-on | roll-up', parseStyle)
    .option('--rows <n>', 'roll-up row count (2, 3, or 4)', parseIntInRange(2, 4, '--rows'))
    .option('--row <n>', 'base row (1..15)', parseIntInRange(1, 15, '--row'))
    .option('--column <n>', 'base column, 1-based (1..32)', parseIntInRange(1, 32, '--column'))
    .option('--channel <name>', 'CC1 | CC2 | CC3 | CC4', parseChannel, 'CC1' as CcChannelName)
    .action(function (this: Command, input: string, output: string, opts: Omit<Common608Options, 'fps'>) {
      const fps = this.optsWithGlobals().fps as FrameRate;
      run608Action(input, output, { ...opts, fps }, streams);
    });

  return program;
}

export function runCli(args: string[], streams: CliStreams = defaultStreams): number {
  const program = buildProgram(streams);
  try {
    program.parse(args, { from: 'user' });
    return 0;
  } catch (err) {
    if (err instanceof CommanderError) {
      // commander has already written its message to writeErr (or to
      // writeOut for --help). Map its exit code into our return value.
      return err.exitCode === 0 ? 0 : 1;
    }
    streams.stderr(err instanceof Error ? err.message : String(err));
    return 1;
  }
}
