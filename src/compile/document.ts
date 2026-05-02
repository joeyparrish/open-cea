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

// Shape and validator for the JSON document consumed by the `compile`
// subcommand. The doc is one or more tracks; each track is either a
// CEA-708 service (with declarative windows + events) or a CEA-608
// channel (with style + events). Multiple tracks fold into one shared
// Encoder via runOrchestrator, so a single output stream can carry
// CC1 + CC3 in F1/F2 and a 708 service simultaneously.
//
// fps and output format are taken from the global CLI flags rather
// than the JSON, so the same authoring doc can be retargeted across
// frame rates without edits.

import type {
  AnchorPoint,
  BorderType,
  Color,
  Direction,
  DisplayEffect,
  EdgeType,
  Justify,
  Offset,
  Opacity,
  PenSize,
} from '../cea708/types.js';

export interface CompileDocument {
  tracks: CompileTrack[];
}

export type CompileTrack = CompileTrack708 | CompileTrack608;

export interface CompileTrack708 {
  target: '708';
  service?: number;          // 1..63, default 1
  windows: WindowSpec[];     // at least one
  events: EventSpec708[];
}

export interface CompileTrack608 {
  target: '608';
  channel?: 'CC1' | 'CC2' | 'CC3' | 'CC4'; // default CC1
  style: 'pop-on' | 'paint-on' | 'roll-up';
  rollUpRows?: 2 | 3 | 4;    // only with style=roll-up
  row?: number;              // 1..15, default 15
  column?: number;           // 0..31, default 0
  events: EventSpec608[];
}

export interface WindowSpec {
  id: number;                // 0..7
  priority?: number;         // 0..7
  anchorVertical?: number;   // 0..74 absolute
  anchorHorizontal?: number; // 0..209 (16:9) or 0..159 (4:3)
  anchorPoint?: AnchorPoint;
  rowCount?: number;         // 1..15
  columnCount?: number;      // 1..42
  visible?: boolean;
  fillColor?: Color;
  fillOpacity?: Opacity;
  borderColor?: Color;
  borderType?: BorderType;
  printDirection?: Direction;
  scrollDirection?: Direction;
  justify?: Justify;
  effectDirection?: Direction;
  effectSpeed?: number;      // 1..15
  displayEffect?: DisplayEffect;
}

export interface EventSpec708 {
  startTimeSec: number;
  endTimeSec?: number;
  text: string;
  windowId?: number;         // default 0
  row?: number;              // 0..14
  column?: number;           // 0..41
  pen?: PenSpec;
}

export interface EventSpec608 {
  startTimeSec: number;
  endTimeSec?: number;
  text: string;
}

export interface PenSpec {
  size?: PenSize;
  offset?: Offset;
  fontStyle?: number;        // 0..7
  edgeType?: EdgeType;
  underline?: boolean;
  italics?: boolean;
  foregroundColor?: Color;
  foregroundOpacity?: Opacity;
  backgroundColor?: Color;
  backgroundOpacity?: Opacity;
  edgeColor?: Color;
}

class ValidationError extends Error {
  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = 'CompileDocumentValidationError';
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function expectObject(v: unknown, path: string): Record<string, unknown> {
  if (!isObject(v)) throw new ValidationError(path, 'expected an object');
  return v;
}

function expectArray(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v)) throw new ValidationError(path, 'expected an array');
  return v;
}

function expectString(v: unknown, path: string): string {
  if (typeof v !== 'string') throw new ValidationError(path, 'expected a string');
  return v;
}

function expectNumber(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new ValidationError(path, 'expected a finite number');
  }
  return v;
}

function expectInt(v: unknown, path: string, min: number, max: number): number {
  const n = expectNumber(v, path);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new ValidationError(path, `expected an integer in [${String(min)}, ${String(max)}]`);
  }
  return n;
}

function expectBool(v: unknown, path: string): boolean {
  if (typeof v !== 'boolean') throw new ValidationError(path, 'expected a boolean');
  return v;
}

function expectOneOf<T extends string>(v: unknown, path: string, allowed: readonly T[]): T {
  const s = expectString(v, path);
  if (!(allowed as readonly string[]).includes(s)) {
    throw new ValidationError(path, `expected one of ${allowed.join(', ')}`);
  }
  return s as T;
}

function validateColor(v: unknown, path: string): Color {
  const o = expectObject(v, path);
  return {
    r: expectInt(o.r, `${path}.r`, 0, 3),
    g: expectInt(o.g, `${path}.g`, 0, 3),
    b: expectInt(o.b, `${path}.b`, 0, 3),
  };
}

function validateWindow(v: unknown, path: string): WindowSpec {
  const o = expectObject(v, path);
  const w: WindowSpec = { id: expectInt(o.id, `${path}.id`, 0, 7) };
  if (o.priority !== undefined) w.priority = expectInt(o.priority, `${path}.priority`, 0, 7);
  if (o.anchorVertical !== undefined) w.anchorVertical = expectInt(o.anchorVertical, `${path}.anchorVertical`, 0, 99);
  if (o.anchorHorizontal !== undefined) w.anchorHorizontal = expectInt(o.anchorHorizontal, `${path}.anchorHorizontal`, 0, 209);
  if (o.anchorPoint !== undefined) w.anchorPoint = expectInt(o.anchorPoint, `${path}.anchorPoint`, 0, 8) as AnchorPoint;
  if (o.rowCount !== undefined) w.rowCount = expectInt(o.rowCount, `${path}.rowCount`, 1, 15);
  if (o.columnCount !== undefined) w.columnCount = expectInt(o.columnCount, `${path}.columnCount`, 1, 42);
  if (o.visible !== undefined) w.visible = expectBool(o.visible, `${path}.visible`);
  if (o.fillColor !== undefined) w.fillColor = validateColor(o.fillColor, `${path}.fillColor`);
  if (o.fillOpacity !== undefined) w.fillOpacity = expectInt(o.fillOpacity, `${path}.fillOpacity`, 0, 3) as Opacity;
  if (o.borderColor !== undefined) w.borderColor = validateColor(o.borderColor, `${path}.borderColor`);
  if (o.borderType !== undefined) w.borderType = expectInt(o.borderType, `${path}.borderType`, 0, 5) as BorderType;
  if (o.printDirection !== undefined) w.printDirection = expectInt(o.printDirection, `${path}.printDirection`, 0, 3) as Direction;
  if (o.scrollDirection !== undefined) w.scrollDirection = expectInt(o.scrollDirection, `${path}.scrollDirection`, 0, 3) as Direction;
  if (o.justify !== undefined) w.justify = expectInt(o.justify, `${path}.justify`, 0, 3) as Justify;
  if (o.effectDirection !== undefined) w.effectDirection = expectInt(o.effectDirection, `${path}.effectDirection`, 0, 3) as Direction;
  if (o.effectSpeed !== undefined) w.effectSpeed = expectInt(o.effectSpeed, `${path}.effectSpeed`, 1, 15);
  if (o.displayEffect !== undefined) w.displayEffect = expectInt(o.displayEffect, `${path}.displayEffect`, 0, 2) as DisplayEffect;
  return w;
}

function validatePen(v: unknown, path: string): PenSpec {
  const o = expectObject(v, path);
  const p: PenSpec = {};
  if (o.size !== undefined) p.size = expectInt(o.size, `${path}.size`, 0, 2) as PenSize;
  if (o.offset !== undefined) p.offset = expectInt(o.offset, `${path}.offset`, 0, 2) as Offset;
  if (o.fontStyle !== undefined) p.fontStyle = expectInt(o.fontStyle, `${path}.fontStyle`, 0, 7);
  if (o.edgeType !== undefined) p.edgeType = expectInt(o.edgeType, `${path}.edgeType`, 0, 5) as EdgeType;
  if (o.underline !== undefined) p.underline = expectBool(o.underline, `${path}.underline`);
  if (o.italics !== undefined) p.italics = expectBool(o.italics, `${path}.italics`);
  if (o.foregroundColor !== undefined) p.foregroundColor = validateColor(o.foregroundColor, `${path}.foregroundColor`);
  if (o.foregroundOpacity !== undefined) p.foregroundOpacity = expectInt(o.foregroundOpacity, `${path}.foregroundOpacity`, 0, 3) as Opacity;
  if (o.backgroundColor !== undefined) p.backgroundColor = validateColor(o.backgroundColor, `${path}.backgroundColor`);
  if (o.backgroundOpacity !== undefined) p.backgroundOpacity = expectInt(o.backgroundOpacity, `${path}.backgroundOpacity`, 0, 3) as Opacity;
  if (o.edgeColor !== undefined) p.edgeColor = validateColor(o.edgeColor, `${path}.edgeColor`);
  return p;
}

function validateEvent708(v: unknown, path: string): EventSpec708 {
  const o = expectObject(v, path);
  const e: EventSpec708 = {
    startTimeSec: expectNumber(o.startTimeSec, `${path}.startTimeSec`),
    text: expectString(o.text, `${path}.text`),
  };
  if (e.startTimeSec < 0) throw new ValidationError(`${path}.startTimeSec`, 'must be >= 0');
  if (o.endTimeSec !== undefined) {
    e.endTimeSec = expectNumber(o.endTimeSec, `${path}.endTimeSec`);
    if (e.endTimeSec < e.startTimeSec) {
      throw new ValidationError(`${path}.endTimeSec`, 'must be >= startTimeSec');
    }
  }
  if (o.windowId !== undefined) e.windowId = expectInt(o.windowId, `${path}.windowId`, 0, 7);
  if (o.row !== undefined) e.row = expectInt(o.row, `${path}.row`, 0, 14);
  if (o.column !== undefined) e.column = expectInt(o.column, `${path}.column`, 0, 41);
  if (o.pen !== undefined) e.pen = validatePen(o.pen, `${path}.pen`);
  return e;
}

function validateEvent608(v: unknown, path: string): EventSpec608 {
  const o = expectObject(v, path);
  const e: EventSpec608 = {
    startTimeSec: expectNumber(o.startTimeSec, `${path}.startTimeSec`),
    text: expectString(o.text, `${path}.text`),
  };
  if (e.startTimeSec < 0) throw new ValidationError(`${path}.startTimeSec`, 'must be >= 0');
  if (o.endTimeSec !== undefined) {
    e.endTimeSec = expectNumber(o.endTimeSec, `${path}.endTimeSec`);
    if (e.endTimeSec < e.startTimeSec) {
      throw new ValidationError(`${path}.endTimeSec`, 'must be >= startTimeSec');
    }
  }
  return e;
}

function validateTrack(v: unknown, path: string): CompileTrack {
  const o = expectObject(v, path);
  const target = expectOneOf(o.target, `${path}.target`, ['608', '708'] as const);
  if (target === '708') {
    const windows = expectArray(o.windows, `${path}.windows`)
      .map((w, i) => validateWindow(w, `${path}.windows[${String(i)}]`));
    if (windows.length === 0) {
      throw new ValidationError(`${path}.windows`, 'must define at least one window');
    }
    const events = expectArray(o.events, `${path}.events`)
      .map((e, i) => validateEvent708(e, `${path}.events[${String(i)}]`));
    const t: CompileTrack708 = { target: '708', windows, events };
    if (o.service !== undefined) t.service = expectInt(o.service, `${path}.service`, 1, 63);
    return t;
  }
  const style = expectOneOf(o.style, `${path}.style`, ['pop-on', 'paint-on', 'roll-up'] as const);
  const events = expectArray(o.events, `${path}.events`)
    .map((e, i) => validateEvent608(e, `${path}.events[${String(i)}]`));
  const t: CompileTrack608 = { target: '608', style, events };
  if (o.channel !== undefined) {
    t.channel = expectOneOf(o.channel, `${path}.channel`, ['CC1', 'CC2', 'CC3', 'CC4'] as const);
  }
  if (o.rollUpRows !== undefined) {
    if (style !== 'roll-up') {
      throw new ValidationError(`${path}.rollUpRows`, 'only valid with style=roll-up');
    }
    const r = expectInt(o.rollUpRows, `${path}.rollUpRows`, 2, 4);
    t.rollUpRows = r as 2 | 3 | 4;
  }
  if (o.row !== undefined) t.row = expectInt(o.row, `${path}.row`, 1, 15);
  if (o.column !== undefined) t.column = expectInt(o.column, `${path}.column`, 0, 31);
  return t;
}

/**
 * Parse and validate a CompileDocument from arbitrary JSON input.
 * Throws a descriptive Error on the first failure; the message
 * includes the dotted path to the offending field.
 */
export function validateCompileDocument(input: unknown): CompileDocument {
  const o = expectObject(input, '$');
  const tracks = expectArray(o.tracks, '$.tracks')
    .map((t, i) => validateTrack(t, `$.tracks[${String(i)}]`));
  if (tracks.length === 0) {
    throw new ValidationError('$.tracks', 'must contain at least one track');
  }
  return { tracks };
}
