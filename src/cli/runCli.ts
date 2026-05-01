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
import { parseVtt } from '../parser/vtt.js';
import { compileTimeline } from '../compiler.js';
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

interface ParsedArgs {
  positional: string[];
  flags: Map<string, string>;
}

/**
 * Parses an args list into positional args and `--key value` flags.
 * Throws on `--key` with no following value or with another `--flag` as
 * its value.
 */
function parseArgs(args: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags = new Map<string, string>();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      if (i + 1 >= args.length || args[i + 1].startsWith('--')) {
        throw new Error(`Flag ${arg} requires a value`);
      }
      flags.set(arg.slice(2), args[i + 1]);
      i++;
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

function requireFps(flags: Map<string, string>): FrameRate {
  const raw = flags.get('fps');
  if (raw === undefined) {
    throw new Error('--fps is required');
  }
  const fps = parseFloat(raw);
  if (!VALID_FPS.includes(fps)) {
    throw new Error(
      `Invalid fps: ${raw}. Supported: ${VALID_FPS.join(', ')}`,
    );
  }
  return fps as FrameRate;
}

function parseIntFlag(
  flags: Map<string, string>,
  name: string,
  min: number,
  max: number,
): number | undefined {
  const raw = flags.get(name);
  if (raw === undefined) return undefined;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new Error(`--${name} must be an integer in [${String(min)}, ${String(max)}]`);
  }
  return n;
}

function rejectUnknownFlags(flags: Map<string, string>, allowed: Set<string>): void {
  for (const key of flags.keys()) {
    if (!allowed.has(key)) {
      throw new Error(`Unknown flag --${key}`);
    }
  }
}

function usage708(): string {
  return [
    'Usage: open-cea vtt-to-cea-708 <input.vtt> <output.bin> --fps <rate>',
    '         [--anchor-v N] [--anchor-h N] [--anchor-point N]',
    '         [--win-rows N] [--win-cols N] [--service N]',
  ].join('\n');
}

function run708(args: string[], streams: CliStreams): number {
  const { positional, flags } = parseArgs(args);
  if (positional.length !== 2) {
    streams.stderr(usage708());
    return 1;
  }
  rejectUnknownFlags(flags, new Set([
    'fps', 'anchor-v', 'anchor-h', 'anchor-point',
    'win-rows', 'win-cols', 'service',
  ]));

  const [inputFile, outputFile] = positional;
  const fps = requireFps(flags);
  const serviceNumber = parseIntFlag(flags, 'service', 1, 63);

  const windowTemplate: Omit<Window, 'id'> = { visible: true };
  const av = parseIntFlag(flags, 'anchor-v', 0, 99);
  const ah = parseIntFlag(flags, 'anchor-h', 0, 209);
  const ap = parseIntFlag(flags, 'anchor-point', 0, 8);
  const wr = parseIntFlag(flags, 'win-rows', 1, 15);
  const wc = parseIntFlag(flags, 'win-cols', 1, 42);
  if (av !== undefined) windowTemplate.anchorVertical = av;
  if (ah !== undefined) windowTemplate.anchorHorizontal = ah;
  if (ap !== undefined) (windowTemplate as { anchorPoint?: number }).anchorPoint = ap;
  if (wr !== undefined) windowTemplate.rowCount = wr;
  if (wc !== undefined) windowTemplate.columnCount = wc;

  const vttContent = readFileSync(inputFile, 'utf-8');
  const timeline = parseVtt(vttContent, windowTemplate);
  const compileOpts: { fps: FrameRate; serviceNumber?: number } = { fps };
  if (serviceNumber !== undefined) compileOpts.serviceNumber = serviceNumber;
  const ccData = compileTimeline(timeline, compileOpts);

  writeRawFile(outputFile, ccData);
  streams.stdout(
    `Successfully compiled ${inputFile} to ${outputFile} at ${String(fps)} fps (CEA-708).`,
  );
  return 0;
}

export function runCli(args: string[], streams: CliStreams = defaultStreams): number {
  if (args.length < 1) {
    streams.stderr('Usage: open-cea <command> [options]');
    streams.stderr('Commands:');
    streams.stderr('  vtt-to-cea-708 <input.vtt> <output.bin> --fps <rate> [...]');
    return 1;
  }

  const command = args[0];
  const rest = args.slice(1);

  try {
    switch (command) {
      case 'vtt-to-cea-708':
        return run708(rest, streams);
      default:
        streams.stderr(`Unknown command: ${command}`);
        return 1;
    }
  } catch (err) {
    streams.stderr(err instanceof Error ? err.message : String(err));
    return 1;
  }
}
