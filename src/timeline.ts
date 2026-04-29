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

import {
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
} from './cea708/types.js';

export interface Pen {
  size?: PenSize;
  offset?: Offset;
  fontStyle?: number;
  edgeType?: EdgeType;
  underline?: boolean;
  italics?: boolean;
  foregroundColor?: Color;
  foregroundOpacity?: Opacity;
  backgroundColor?: Color;
  backgroundOpacity?: Opacity;
  edgeColor?: Color;
}

export interface Window {
  id: number;
  priority?: number;
  anchorVertical?: number;
  anchorHorizontal?: number;
  anchorPoint?: AnchorPoint;
  rowCount?: number;
  columnCount?: number;
  visible?: boolean;
  fillColor?: Color;
  fillOpacity?: Opacity;
  borderColor?: Color;
  borderType?: BorderType;
  // wordwrap is forced to 0 per CTA-708-E §6.4; not exposed.
  printDirection?: Direction;
  scrollDirection?: Direction;
  justify?: Justify;
  effectDirection?: Direction;
  effectSpeed?: number;
  displayEffect?: DisplayEffect;
}

export interface CaptionEvent {
  /** The time in seconds when this event starts. */
  startTimeSec: number;
  /** The text to display. */
  text: string;
  /** The window to display the text in (defaults to 0). */
  windowId?: number;
  /** Row inside the window (0..14). Defaults to appending at the cursor. */
  row?: number;
  /** Column inside the window (0..41). Defaults to appending at the cursor. */
  column?: number;
  /** Pen attributes to apply to this text. */
  pen?: Pen;
  /** Optional time in seconds when this text should be cleared. */
  endTimeSec?: number;
}

/**
 * A declarative representation of a complete captioning presentation.
 */
export class CaptionTimeline {
  private events: CaptionEvent[] = [];
  private windows = new Map<number, Window>();

  /**
   * Defines a window's declarative attributes.
   */
  public defineWindow(win: Window): void {
    if (win.id < 0 || win.id > 7) {
      throw new RangeError('Window ID must be 0..7');
    }
    this.windows.set(win.id, win);
  }

  /**
   * Retrieves a defined window, if any.
   */
  public getWindow(id: number): Window | undefined {
    return this.windows.get(id);
  }

  /**
   * Returns all defined windows.
   */
  public getWindows(): Window[] {
    return Array.from(this.windows.values());
  }

  /**
   * Adds a caption event to the timeline.
   */
  public addEvent(event: CaptionEvent): void {
    if (event.startTimeSec < 0) {
      throw new RangeError('startTimeSec must be >= 0');
    }
    if (event.endTimeSec !== undefined && event.endTimeSec < event.startTimeSec) {
      throw new RangeError('endTimeSec cannot be less than startTimeSec');
    }
    this.events.push(event);
  }

  /**
   * Retrieves all events sorted by start time.
   */
  public getEvents(): CaptionEvent[] {
    return [...this.events].sort((a, b) => a.startTimeSec - b.startTimeSec);
  }
}
