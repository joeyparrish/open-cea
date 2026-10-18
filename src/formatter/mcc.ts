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

// MCC (MacCaption) v2.0 sidecar formatter.
//
// MCC is a plain-text container indexed by SMPTE timecode. Each data
// line is not the bare cc_data() payload but the vertical ancillary
// (VANC) packet that would carry it: a type 2 ANC packet with DID 0x61
// / SDID 0x01 (SMPTE ST 334-1 section 5.1, Table 1) whose user data
// words are a Caption Distribution Packet (CDP, SMPTE ST 334-2). The
// cc_data() tuples ride in the CDP's ccdata_section. ffmpeg's demuxer
// (specs/mccdec.c) decodes each line as an ANC packet and extracts the
// CDP, so a line holding only raw cc_data (first byte 0xF8 read as the
// DID) is ignored as "not a closed captions packet".
//
// Per-line byte layout (uncompressed), see specs/334-2.md:
//   61 01 DC                          ANC DID / SDID / data count
//   96 69 len fr flags seq(2)         cdp_header (334-2 section 5.2)
//   72 (E0|cc_count) <tuples...>      ccdata_section (section 5.4)
//   74 seq(2) packet_checksum         cdp_footer (section 5.6)
//   <trailing byte>                   see wrapAncPacket
// DC counts the user data words (334-1 section 5.1), i.e. the CDP, so
// DC == cdp_length.
//
// Header lines (confirmed against specs/mccdec.c):
//   - "File Format=MacCaption_MCC V2.0"
//   - "Time Code Rate=<rate>" in {24, 25, 30, 30DF, 50, 60, 60DF}.
// Everything else with an `=` is an attribute; `//` lines are comments.
//
// The MCC v2.0 single-byte dictionary aliases (G..Z run-length codes)
// are a size optimization only; we emit uncompressed uppercase hex,
// which the demuxer accepts (its convert() treats 0-9A-F as literal
// nibbles and only G-Z as aliases).

import { writeFileSync } from 'node:fs';
import { ccCountPerFrame, type FrameRate } from '../encoder.js';
import { frameToTimecode, mccTimeCodeRate } from './timecode.js';

// cdp_frame_rate codes, SMPTE ST 334-2 section 5.2, Table 3. The CDP
// carries the code in the high nibble over a reserved '1111'.
function cdpFrameRateCode(fps: FrameRate): number {
  switch (fps) {
    case 24:    return 0x2;
    case 25:    return 0x3;
    case 29.97: return 0x4;
    case 30:    return 0x5;
    case 50:    return 0x6;
    case 59.94: return 0x7;
    case 60:    return 0x8;
  }
}

// True when a frame carries at least one tuple with cc_valid=1, of
// either CEA-608 (cc_type 00 / 01) or DTVCC (10 / 11) data. The first
// byte of each tuple is marker(11111) cc_valid cc_type(2). Empty 608
// slots and DTVCC padding both have cc_valid=0, so a stream of nothing
// but those carries no caption service.
function frameHasCaptionData(ccData: Uint8Array): boolean {
  for (let t = 0; t + 3 <= ccData.length; t += 3) {
    if ((ccData[t] & 0x04) !== 0) return true;
  }
  return false;
}

// Wrap one frame's cc_data() tuples in a CDP + ANC packet.
// `seq` is the CDP sequence counter (header and footer must match).
// `serviceActive` drives caption_service_active, which SMPTE ST 334-2
// section 5.2 defines per CDP *stream* ("the CDP stream is conveying an
// active caption service"), so it is decided once for the whole output
// (see formatMcc) rather than per frame.
function wrapAncPacket(
  ccData: Uint8Array,
  fps: FrameRate,
  seq: number,
  serviceActive: boolean,
): Uint8Array {
  const ccCount = ccData.length / 3; // validated by formatMcc
  const frByte = (cdpFrameRateCode(fps) << 4) | 0x0F;
  const seqHi = (seq >> 8) & 0xFF;
  const seqLo = seq & 0xFF;

  // cdp_flags (section 5.2, Table 2), MSB first: time_code_present 0,
  // ccdata_present 1, svcinfo_present 0, svc_info_start / change /
  // complete 0 (no ccsvcinfo_section), caption_service_active, then
  // the reserved bit, which is '1'.
  const flags = 0x40 | (serviceActive ? 0x02 : 0x00) | 0x01;

  // cdp_length counts every CDP byte, cdp_identifier through
  // packet_checksum: header 7 + ccdata_section (2 + 3*ccCount) +
  // footer 4.
  const cdpLen = 7 + 2 + ccData.length + 4;

  const cdp = new Uint8Array(cdpLen);
  let i = 0;
  cdp[i++] = 0x96; cdp[i++] = 0x69;      // cdp_identifier
  cdp[i++] = cdpLen;                     // cdp_length
  cdp[i++] = frByte;                     // cdp_frame_rate | reserved
  cdp[i++] = flags;                      // cdp_flags
  cdp[i++] = seqHi; cdp[i++] = seqLo;    // cdp_hdr_sequence_cntr
  cdp[i++] = 0x72;                       // ccdata_id
  cdp[i++] = 0xE0 | ccCount;             // marker(111) + cc_count
  cdp.set(ccData, i); i += ccData.length;
  cdp[i++] = 0x74;                       // cdp_footer_id
  cdp[i++] = seqHi; cdp[i++] = seqLo;    // cdp_ftr_sequence_cntr
  // packet_checksum makes the sum of all CDP bytes 0 (mod 256).
  let cdpSum = 0;
  for (let j = 0; j < cdpLen - 1; j++) cdpSum = (cdpSum + cdp[j]) & 0xFF;
  cdp[i] = (256 - cdpSum) & 0xFF;

  // The ANC checksum (SMPTE ST 291-1) is a 9-bit sum over 10-bit words
  // whose parity bits an 8-bit MCC line cannot carry, and 8-bit ST 436
  // sample coding excludes it. MCC lines nonetheless end with one byte
  // in that position, which ffmpeg strips unread before decoding the
  // packet. It is filler: we write the 8-bit sum of the preceding bytes,
  // which no reader checks; it is not a valid ST 291-1 checksum.
  const out = new Uint8Array(3 + cdpLen + 1);
  out[0] = 0x61;    // DID: closed captioning (334-1 Table 1)
  out[1] = 0x01;    // SDID: CEA-708 CDP
  out[2] = cdpLen;  // DC: number of user data words == cdp_length
  out.set(cdp, 3);
  let fill = 0;
  for (let j = 0; j < 3 + cdpLen; j++) fill = (fill + out[j]) & 0xFF;
  out[3 + cdpLen] = fill;
  return out;
}

export interface MccOptions {
  fps: FrameRate;
  /**
   * Override the UUID written into the header. Defaults to a fresh
   * `crypto.randomUUID()`. Tests should pin it for determinism.
   */
  uuid?: string;
  /**
   * Override the `Creation Date=` field. Defaults to the current UTC
   * date in YYYY-MM-DD form. Tests should pin it.
   */
  creationDate?: string;
  /**
   * Override the `Creation Time=` field. Defaults to the current UTC
   * time in HH:MM:SS form. Tests should pin it.
   */
  creationTime?: string;
  /** Override `Creation Program=`. Defaults to `open-cea`. */
  creationProgram?: string;
}

function pad2(n: number): string {
  return n < 10 ? `0${String(n)}` : String(n);
}

function defaultDateUTC(): string {
  const d = new Date();
  return `${String(d.getUTCFullYear())}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function defaultTimeUTC(): string {
  const d = new Date();
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
}

function toHex(bytes: Uint8Array): string {
  const out = new Array<string>(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    const hi = (bytes[i] >> 4) & 0x0F;
    const lo = bytes[i] & 0x0F;
    out[i] = HEX[hi] + HEX[lo];
  }
  return out.join('');
}

const HEX = '0123456789ABCDEF';

/**
 * Format per-frame cc_data() payloads as an MCC v2.0 string.
 */
export function formatMcc(frames: Uint8Array[], options: MccOptions): string {
  const uuid = options.uuid ?? globalThis.crypto.randomUUID();
  const creationDate = options.creationDate ?? defaultDateUTC();
  const creationTime = options.creationTime ?? defaultTimeUTC();
  const creationProgram = options.creationProgram ?? 'open-cea';

  const lines: string[] = [];
  lines.push('File Format=MacCaption_MCC V2.0');
  lines.push('');
  lines.push(`UUID=${uuid}`);
  lines.push(`Creation Program=${creationProgram}`);
  lines.push(`Creation Date=${creationDate}`);
  lines.push(`Creation Time=${creationTime}`);
  lines.push(`Time Code Rate=${mccTimeCodeRate(options.fps)}`);
  lines.push('');
  // caption_service_active describes the whole CDP stream: set it when
  // any frame carries valid 608 or 708 data, so it holds steady across
  // the padding frames between captions.
  const serviceActive = frames.some(frameHasCaptionData);

  // cc_count shall be the SMPTE ST 334-2 Table 3 value for the frame
  // rate (section 5.4), which is the encoder's fixed per-frame count.
  const ccCount = ccCountPerFrame(options.fps);
  for (let i = 0; i < frames.length; i++) {
    const len = frames[i].length;
    if (len !== ccCount * 3) {
      throw new RangeError(
        `Frame ${String(i)}: cc_data is ${String(len)} bytes; a ${String(options.fps)} fps CDP ` +
          `carries exactly ${String(ccCount)} tuples (${String(ccCount * 3)} bytes)`,
      );
    }
    // Each frame's cc_data() is wrapped as a CDP inside a SMPTE 291M
    // ANC packet; the CDP sequence counter tracks the frame index.
    const anc = wrapAncPacket(frames[i], options.fps, i & 0xFFFF, serviceActive);
    lines.push(`${frameToTimecode(i, options.fps)}\t${toHex(anc)}`);
  }
  lines.push('');
  return lines.join('\n');
}

/** Write the formatted MCC string to a file. */
export function writeMccFile(path: string, frames: Uint8Array[], options: MccOptions): void {
  writeFileSync(path, formatMcc(frames, options), 'utf-8');
}
