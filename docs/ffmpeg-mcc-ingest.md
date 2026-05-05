# FFmpeg MCC Ingest

This document provides a technical overview of how FFmpeg ingests MacCaption (MCC) files and outlines the guidelines for generating CEA-608/708 captions into the MCC format.

## 1. Why target MCC instead of raw NALUs?

When generating digital closed captions (CEA-708) and legacy captions (CEA-608), the end goal is typically to embed them into video streams (like H.264 or HEVC) as Supplemental Enhancement Information (SEI) messages. 

While you could theoretically generate raw video NALUs containing these SEI messages, **targeting the MCC format is vastly superior** for the following reasons:

*   **Separation of Concerns:** MCC acts as a clean transport layer. It stores the raw hexadecimal payload of SMPTE 291M / SMPTE 436M Ancillary (ANC) data packets alongside timecodes. This allows the caption generator to focus exclusively on CEA-608/708 byte-code semantics without needing to understand video bitstream syntax, start codes, emulation prevention bytes, or container-specific (e.g., MP4 vs. Transport Stream) muxing requirements.
*   **Universal Container/Codec Support:** FFmpeg's `mcc` demuxer natively reads MCC files and converts them into an internal subtitle stream. FFmpeg's muxers then handle the heavy lifting of correctly wrapping that data into the specific SEI format required by the output video codec (H.264, HEVC, MPEG-2) and multiplexing it safely into the target container.
*   **Zero Feature Loss:** Despite FFmpeg mapping the MCC stream internally to `AV_CODEC_ID_EIA_608`, this stream type actually carries the raw `cc_data()` tuples (the 708 Transport Layer). Because both CEA-608 and CEA-708 features are encapsulated inside these 3-byte tuples, FFmpeg copies them bit-for-bit. **All CEA-708 features (windows, colors, fonts, positioning) are preserved perfectly** when muxed into a compatible video stream.

### The `eia608_extract` behavior
By default, FFmpeg's MCC demuxer operates with `-eia608_extract 1`. Despite the name, this process extracts the *entire* `cc_data()` array from the SMPTE 436M wrapper. Because `cc_data()` carries both 608 and 708 data multiplexed together, **full CEA-708 is preserved by default**. You do not need to use `-eia608_extract 0` unless you specifically require a raw SMPTE 436M track (e.g., for MXF outputs) rather than embedded video SEI messages.

---

## 2. Encoder Limitations & Compatibility Constraints

To ensure an MCC file is successfully ingested by FFmpeg, the generator **must** strictly adhere to the following limitations, which are hardcoded into FFmpeg's demuxer (`libavformat/mccdec.c`):

### 2.1. Strict Time Code Rates
FFmpeg validates the `Time Code Rate=` header against a hardcoded list of acceptable strings. **If the generator outputs a rate not on this exact list, FFmpeg will fatally reject the file.**

Valid strings for the `Time Code Rate=` header:
*   `24` (24 fps)
*   `25` (25 fps)
*   `30` (30 fps)
*   `30DF` (29.97 fps drop-frame)
*   `50` (50 fps)
*   `60` (60 fps)
*   `60DF` (59.94 fps drop-frame)

*Note: Do not use floating-point representations like `29.97` or `59.94`. You must use the exact strings `30DF` or `60DF`.*

### 2.2. MCC Version Constraints
The MCC file header must declare the format version, e.g., `File Format=MacCaption_MCC V2.0`.
*   **Prefer Version 2.0:** FFmpeg's support for V2.0 is more robust.
*   **Version 1.0 Limitations:** If you specify V1.0, FFmpeg explicitly enforces older constraints. **Don't do it.**

### 2.3. ANC Data Filtering
When using the default extraction mode, FFmpeg filters the ANC packets. It specifically looks for `DID == 0x61` and `SDID == 0x01` (the standard CTA-708 ANC identifiers).  Don't generate other types of ANC data (like SCTE-104 triggers or AFD) inside the MCC file, or FFmpeg will silently drop them during the `eia608_extract` phase. For a dedicated CEA-608/708 caption generator, this is safe.

### 2.4. Wrapping Types and Line Numbers
When formatting the timecodes for individual lines (e.g., `HH:MM:SS:FF.field,line`), ensure the field and line designations make sense for the video cadence. While FFmpeg handles parsing the `.` and `,` delimiters correctly, targeting standard VANC wrapping types (Field 1, Field 2, or Frame) and standard line numbers (e.g., line 9) ensures the highest compatibility across different versions of the MCC spec and FFmpeg.
