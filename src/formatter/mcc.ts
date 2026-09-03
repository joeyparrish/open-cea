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
// MCC is a plain-text container indexed by SMPTE timecode. Crucially,
// each data line is NOT the bare cc_data() payload: it is the full
// Video Ancillary (VANC) data packet as it would ride in the vertical
// blanking, i.e. a SMPTE 291M ancillary packet (DID/SDID/data-count)
// whose user-data words are a SMPTE 334-2 / CEA-708 Caption
// Distribution Packet (CDP). The cc_data() tuples live inside the
// CDP's ccdata_section. ffmpeg's demuxer (specs/mccdec.c) parses each
// line via av_smpte_291m_anc_8bit_decode + ..._extract_cta_708, so a
// line that is only raw cc_data (DID would read as 0xF8) is rejected
// as "not a closed captions packet" and silently produces no output.
//
// Per-line byte layout (uncompressed):
//   DID(0x61) SDID(0x01) DC          <- SMPTE 334-1 ANC header
//   96 69 len fr flags seq(2)        <- CDP header
//   72 (0xE0|cc_count) <tuples...>   <- ccdata_section
//   74 seq(2) packet_checksum        <- CDP footer (checksum zeroes the CDP)
//   anc_checksum                     <- trailing SMPTE 291M checksum
// ffmpeg strips the final trailing byte before parsing ("not included
// in 8-bit sample encodings"), so DC == cdp_length == the CDP byte
// count and the ANC checksum byte is required padding for that strip.
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
import type { FrameRate } from '../encoder.js';
import { frameToTimecode, mccTimeCodeRate } from './timecode.js';

// CEA-708-E cdp_frame_rate codes (4-bit), packed as (code << 4) | 0x0F.
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

// True when a frame carries at least one *valid* DTVCC tuple, i.e. a
// cc_data() word with cc_valid=1 and cc_type of dtvcc_packet_data (2)
// or dtvcc_packet_start (3). cc_type/cc_valid live in the low bits of
// each tuple's first byte: 111(marker) v(valid) tt(type).
function frameHasDtvcc(ccData: Uint8Array): boolean {
  for (let t = 0; t + 3 <= ccData.length; t += 3) {
    const b0 = ccData[t];
    const valid = (b0 >> 2) & 0x01;
    const type = b0 & 0x03;
    if (valid && type >= 2) return true;
  }
  return false;
}

// Wrap one frame's cc_data() tuples in a CDP + SMPTE 291M ANC packet.
// `seq` is the CDP sequence counter (header and footer must match).
// `serviceActive` drives the CDP caption_service_active flag; it is a
// stream-level decision (see formatMcc) rather than a per-frame one,
// because DTVCC packets are interleaved with padding frames and the
// flag describes whether a 708 service is running, not whether this
// particular CDP happens to carry a service block.
function wrapAncPacket(
  ccData: Uint8Array,
  fps: FrameRate,
  seq: number,
  serviceActive: boolean,
): Uint8Array {
  const ccCount = ccData.length / 3; // 3 bytes per cc_data tuple
  const frByte = (cdpFrameRateCode(fps) << 4) | 0x0F;
  const seqHi = (seq >> 8) & 0xFF;
  const seqLo = seq & 0xFF;

  // cdp_flags: ccdata_present (bit6) + reserved (bit0, always 1), plus
  // caption_service_active (bit1) only when the stream carries 708.
  const flags = 0x40 | (serviceActive ? 0x02 : 0x00) | 0x01;

  // cdp_length counts every CDP byte through packet_checksum:
  //   header 7 + ccdata_section (2 + 3*ccCount) + footer 4
  const cdpLen = 7 + 2 + ccData.length + 4;

  const cdp = new Uint8Array(cdpLen);
  let i = 0;
  cdp[i++] = 0x96; cdp[i++] = 0x69;      // cdp_identifier
  cdp[i++] = cdpLen & 0xFF;              // cdp_length
  cdp[i++] = frByte;                     // cdp_frame_rate | reserved
  cdp[i++] = flags;                      // cdp_flags
  cdp[i++] = seqHi; cdp[i++] = seqLo;    // cdp_hdr_sequence_counter
  cdp[i++] = 0x72;                       // ccdata_id
  cdp[i++] = 0xE0 | (ccCount & 0x1F);    // marker(111) + cc_count
  cdp.set(ccData, i); i += ccData.length;
  cdp[i++] = 0x74;                       // cdp_footer_id
  cdp[i++] = seqHi; cdp[i++] = seqLo;    // cdp_ftr_sequence_counter
  // packet_checksum makes the sum of all CDP bytes 0 (mod 256).
  let cdpSum = 0;
  for (let j = 0; j < cdpLen - 1; j++) cdpSum = (cdpSum + cdp[j]) & 0xFF;
  cdp[i] = (256 - cdpSum) & 0xFF;

  // SMPTE 334-1 ANC header + trailing SMPTE 291M checksum. ffmpeg drops
  // the trailing byte before parsing, so its value is advisory; we
  // still emit a real low-8-bits checksum for other consumers.
  const out = new Uint8Array(3 + cdpLen + 1);
  out[0] = 0x61;          // DID  (CEA-708)
  out[1] = 0x01;          // SDID
  out[2] = cdpLen & 0xFF; // data_count == cdp_length
  out.set(cdp, 3);
  let ancSum = 0;
  for (let j = 0; j < 3 + cdpLen; j++) ancSum = (ancSum + out[j]) & 0xFF;
  out[3 + cdpLen] = ancSum;
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
  // caption_service_active is a property of the whole stream: set it
  // when any frame carries a valid DTVCC (708) tuple, so a 608-only
  // stream reports 0 and a 708 stream reports 1 continuously rather
  // than flickering across the padding frames between DTVCC packets.
  const serviceActive = frames.some(frameHasDtvcc);

  for (let i = 0; i < frames.length; i++) {
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
