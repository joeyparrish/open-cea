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
import { CaptionTimeline } from '../src/timeline.js';
import { compileTimeline608 } from '../src/compiler608.js';

/**
 * Walk the cc_data tuple stream and pull out (cc_type, word) for every
 * VALID entry. The header byte for a valid entry is 0xF8 | 4 | type =
 * 0xFC (F1), 0xFD (F2), 0xFE (DTVCC continue), 0xFF (DTVCC start).
 * Parity is stripped so callers can compare against spec values.
 */
function extractValidEntries(out: Uint8Array): { type: number; word: number }[] {
  const entries: { type: number; word: number }[] = [];
  for (let i = 0; i < out.length; i += 3) {
    const header = out[i];
    if ((header & 0x04) !== 0x04) continue; // not valid
    const type = header & 0x03;
    const high = out[i + 1] & 0x7F;
    const low = out[i + 2] & 0x7F;
    entries.push({ type, word: (high << 8) | low });
  }
  return entries;
}

function extractF1Words(out: Uint8Array): number[] {
  return extractValidEntries(out).filter((e) => e.type === 0).map((e) => e.word);
}

function extractF2Words(out: Uint8Array): number[] {
  return extractValidEntries(out).filter((e) => e.type === 1).map((e) => e.word);
}

/** A control word's high byte (without parity) is in 0x10..0x1F. */
function isControlWord(word: number): boolean {
  const high = (word >> 8) & 0x7F;
  return high >= 0x10 && high <= 0x1F;
}

/** A PAC's high byte (without parity) is in 0x10..0x17. */
function isPac(word: number): boolean {
  const high = (word >> 8) & 0x7F;
  return high >= 0x10 && high <= 0x17 && (word & 0x40) !== 0;
}

function makeTimelineWith(cues: { startTimeSec: number; endTimeSec?: number; text: string }[]): CaptionTimeline {
  const timeline = new CaptionTimeline();
  for (const c of cues) {
    timeline.addEvent(c);
  }
  return timeline;
}

describe('compileTimeline608 - style routing', () => {
  it('pop-on emits RCL as the first non-PAC control word', () => {
    const timeline = makeTimelineWith([{ startTimeSec: 0, endTimeSec: 1, text: 'Hi' }]);
    const out = compileTimeline608(timeline, { fps: 30, style: 'pop-on' });
    const words = extractF1Words(out);
    const firstControl = words.find((w) => isControlWord(w) && !isPac(w));
    // CC1 misc-control first byte = 0x14; RCL = 0x20 → 0x1420
    expect(firstControl).toBe(0x1420);
  });

  it('paint-on emits RDC as the first non-PAC control word', () => {
    const timeline = makeTimelineWith([{ startTimeSec: 0, endTimeSec: 1, text: 'Hi' }]);
    const out = compileTimeline608(timeline, { fps: 30, style: 'paint-on' });
    const words = extractF1Words(out);
    const firstControl = words.find((w) => isControlWord(w) && !isPac(w));
    expect(firstControl).toBe(0x1429); // RDC = 0x29
  });

  it('roll-up default emits RU3 as the first non-PAC control word', () => {
    const timeline = makeTimelineWith([{ startTimeSec: 0, endTimeSec: 1, text: 'Hi' }]);
    const out = compileTimeline608(timeline, { fps: 30, style: 'roll-up' });
    const words = extractF1Words(out);
    const firstControl = words.find((w) => isControlWord(w) && !isPac(w));
    expect(firstControl).toBe(0x1426); // RU3 = 0x26
  });
});

describe('compileTimeline608 - roll-up row count', () => {
  it.each([[2, 0x1425], [3, 0x1426], [4, 0x1427]] as const)(
    'rollUpRows: %i emits RU%i = 0x%s on CC1',
    (rows, expected) => {
      const timeline = makeTimelineWith([{ startTimeSec: 0, endTimeSec: 1, text: 'Hi' }]);
      const out = compileTimeline608(timeline, {
        fps: 30, style: 'roll-up', rollUpRows: rows,
      });
      const words = extractF1Words(out);
      const firstControl = words.find((w) => isControlWord(w) && !isPac(w));
      expect(firstControl).toBe(expected);
    },
  );

  it('rollUpRows on CC2 flips the channel bit (high += 0x08)', () => {
    const timeline = makeTimelineWith([{ startTimeSec: 0, endTimeSec: 1, text: 'Hi' }]);
    const out = compileTimeline608(timeline, {
      fps: 30, style: 'roll-up', rollUpRows: 3, channel: 'CC2',
    });
    const words = extractF1Words(out);
    const firstControl = words.find((w) => isControlWord(w) && !isPac(w));
    // CC2 first byte = 0x14 | 0x08 = 0x1C
    expect(firstControl).toBe(0x1C26);
  });
});

describe('compileTimeline608 - channel routing', () => {
  it('CC1 words land in F1 entries, not F2', () => {
    const timeline = makeTimelineWith([{ startTimeSec: 0, endTimeSec: 1, text: 'Hi' }]);
    const out = compileTimeline608(timeline, { fps: 30, style: 'pop-on', channel: 'CC1' });
    expect(extractF1Words(out).length).toBeGreaterThan(0);
    expect(extractF2Words(out).length).toBe(0);
  });

  it('CC3 words land in F2 entries, not F1', () => {
    const timeline = makeTimelineWith([{ startTimeSec: 0, endTimeSec: 1, text: 'Hi' }]);
    const out = compileTimeline608(timeline, { fps: 30, style: 'pop-on', channel: 'CC3' });
    expect(extractF2Words(out).length).toBeGreaterThan(0);
    expect(extractF1Words(out).length).toBe(0);
    // CC3 first byte = 0x14 | 0x01 = 0x15; RCL = 0x1520
    const firstControl = extractF2Words(out).find((w) => isControlWord(w) && !isPac(w));
    expect(firstControl).toBe(0x1520);
  });
});

describe('compileTimeline608 - erase at end', () => {
  it('emits EDM after a cue with explicit endTimeSec', () => {
    const timeline = makeTimelineWith([{ startTimeSec: 0, endTimeSec: 1, text: 'Hi' }]);
    const out = compileTimeline608(timeline, { fps: 30, style: 'pop-on' });
    const words = extractF1Words(out);
    // EDM on CC1 = 0x142C
    expect(words).toContain(0x142C);
  });

  it('does not emit EDM for a cue without endTimeSec', () => {
    const timeline = makeTimelineWith([{ startTimeSec: 0, text: 'Hi' }]);
    const out = compileTimeline608(timeline, { fps: 30, style: 'pop-on' });
    const words = extractF1Words(out);
    expect(words).not.toContain(0x142C);
  });
});

describe('compileTimeline608 - control-pair doubling', () => {
  it('every emitted control word appears at least twice in succession', () => {
    const timeline = makeTimelineWith([{ startTimeSec: 0, endTimeSec: 2, text: 'Hi' }]);
    const out = compileTimeline608(timeline, { fps: 30, style: 'pop-on' });
    const words = extractF1Words(out);
    // For every control word at index i, the same word must appear at i+1.
    // (Our queue preserves insertion order; the encoder drains 2 pairs/frame
    // at 30p but doubling is a queue-order property, not a frame-layout one.)
    for (let i = 0; i < words.length - 1; i++) {
      if (isControlWord(words[i])) {
        // The next *F1 word* in the queue must be the same control word.
        // This holds because doubleControls inserts the duplicate
        // immediately after, and F1 words drain in queue order.
        expect(words[i + 1]).toBe(words[i]);
        i++; // Skip the duplicate so we don't require triples.
      }
    }
  });
});

describe('compileTimeline608 - overflow', () => {
  it('throws when a cue cannot drain in its time window', () => {
    // 30 fps -> 60 pairs/s/field. A 0.05s window = 3 pairs allowed.
    const timeline = makeTimelineWith([{
      startTimeSec: 0, endTimeSec: 0.05,
      text: 'Way too long to fit in three pairs',
    }]);
    expect(() => compileTimeline608(timeline, { fps: 30, style: 'pop-on' }))
      .toThrow(/too long to fit/);
  });
});

describe('compileTimeline608 - frame layout', () => {
  it('produces output sized to the per-frame cc_data total', () => {
    const timeline = makeTimelineWith([{ startTimeSec: 0.1, endTimeSec: 2.1, text: 'Hi' }]);
    const out = compileTimeline608(timeline, { fps: 30, style: 'pop-on' });
    // 30 fps -> 20 cc_data tuples per frame -> 60 bytes/frame.
    // Latest action at 2.1s + 1s drain = ceil(2.1*30) + 30 = 93 frames.
    expect(out.length).toBe(93 * 60);
  });
});
