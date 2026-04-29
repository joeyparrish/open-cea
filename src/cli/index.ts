#!/usr/bin/env node
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

/* eslint-disable no-console */

import { readFileSync } from 'node:fs';
import { parseVtt } from '../parser/vtt.js';
import { compileTimeline } from '../compiler.js';
import { writeRawFile } from '../formatter/raw.js';
import type { FrameRate } from '../encoder.js';

const args = process.argv.slice(2);

if (args.length < 1) {
  console.error('Usage: open-cea <command> [options]');
  console.error('Commands:');
  console.error('  vtt-to-cea <input.vtt> <output.bin> <fps>');
  process.exit(1);
}

const command = args[0];

if (command === 'vtt-to-cea') {
  if (args.length !== 4) {
    console.error('Usage: open-cea vtt-to-cea <input.vtt> <output.bin> <fps>');
    process.exit(1);
  }
  
  const inputFile = args[1];
  const outputFile = args[2];
  const fps = parseFloat(args[3]) as FrameRate;
  
  if (![24, 25, 29.97, 30, 50, 59.94, 60].includes(fps)) {
    console.error(`Invalid fps: ${String(fps)}. Supported: 24, 25, 29.97, 30, 50, 59.94, 60`);
    process.exit(1);
  }

  const vttContent = readFileSync(inputFile, 'utf-8');
  const timeline = parseVtt(vttContent);
  const ccData = compileTimeline(timeline, { fps });
  
  writeRawFile(outputFile, ccData);
  console.log(`Successfully compiled ${inputFile} to ${outputFile} at ${String(fps)} fps.`);
} else {
  console.error(`Unknown command: ${command}`);
  process.exit(1);
}
