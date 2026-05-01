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

import { CaptionTimeline } from '../timeline.js';

/**
 * Parses a time string (e.g., "00:01:23.450" or "01:23.450") into seconds.
 */
function parseTime(timeStr: string): number {
  const parts = timeStr.trim().split(':');
  let seconds = 0;
  
  const secPart = parts.pop();
  if (secPart) {
    seconds += parseFloat(secPart);
  }
  
  const minPart = parts.pop();
  if (minPart) {
    seconds += parseInt(minPart, 10) * 60;
  }
  
  const hrPart = parts.pop();
  if (hrPart) {
    seconds += parseInt(hrPart, 10) * 3600;
  }
  
  return seconds;
}

/**
 * A basic WebVTT parser that ignores styling and positioning,
 * extracting only the text and timing to build a CaptionTimeline.
 * 
 * Creates a default window (ID 0) and places all text into it.
 */
export function parseVtt(vttContent: string): CaptionTimeline {
  const timeline = new CaptionTimeline();
  
  // Define a default window for the VTT captions
  timeline.defineWindow({
    id: 0,
    visible: true,
    rowCount: 14,
    columnCount: 32, // 4:3 safe by default
  });

  const lines = vttContent.split(/\r?\n/);
  let i = 0;

  // Skip WEBVTT header
  while (i < lines.length && !lines[i].includes('-->')) {
    i++;
  }

  while (i < lines.length) {
    const line = lines[i];
    
    // Look for timing line: "00:00:00.000 --> 00:00:05.000"
    if (line.includes('-->')) {
      const parts = line.split('-->');
      if (parts.length === 2) {
        const startSec = parseTime(parts[0]);
        const endSec = parseTime(parts[1].trim().split(' ')[0]); // Ignore settings
        
        i++;
        const textLines: string[] = [];
        
        // Read text until blank line
        while (i < lines.length && lines[i].trim() !== '') {
          // Strip out basic VTT tags like <b>, <i>, <c.class>
          const cleanText = lines[i].replace(/<[^>]+>/g, '');
          textLines.push(cleanText);
          i++;
        }
        
        if (textLines.length > 0) {
          // WebVTT uses newlines. Since wordwrap is OFF in CEA-708-E,
          // we could just join with spaces for a naive implementation,
          // or we could use the Carriage Return C0 code.
          // For now, join with spaces to keep it simple.
          const text = textLines.join(' ');
          
          timeline.addEvent({
            startTimeSec: startSec,
            endTimeSec: endSec,
            text,
            windowId: 0,
          });
          // The compiler emits HideWindows at endTimeSec automatically;
          // no separate "clear" event is needed.
        }
      }
    }
    i++;
  }

  return timeline;
}
