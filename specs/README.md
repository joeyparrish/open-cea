# Specifications and References

This directory contains reference materials, protocol digests, and external source files used to implement the `open-cea` project.

## 1. CEA-608 & CEA-708 Digests

The core of this directory consists of comprehensive Markdown digests of the CEA-608 and CEA-708 closed-captioning specifications. These are written to be sufficient for guiding an encoder or decoder implementation without needing to consult the original PDFs.

*   [`608.md`](./608.md) — **ANSI/CTA-608-E S-2019 ("Line 21 Data Services")**
    *   Covers the line-21 byte-level protocol, character sets, control codes, caption modes (pop-on / roll-up / paint-on), Text Mode, and XDS. Applies whether the data is on the analog NTSC line-21 waveform or multiplexed inside CEA-708.
*   [`708.md`](./708.md) — **ANSI/CTA-708-E S-2023 ("Digital Television (DTV) Closed Captioning")**
    *   Covers the 5-layer DTVCC protocol stack (Transport, Packet, Service, Coding, Interpretation), `cc_data()` syntax, Caption Channel Packets, Service Blocks, the C0/C1/C2/C3/G0/G1/G2/G3 code spaces, the window/pen-based rendering model, and the full DTVCC command set with byte-level encodings.

Each digest aims to be a complete reference: control-code tables, parameter byte layouts, attribute interactions, encoder requirements, decoder requirements, and known gotchas / errata. Section numbers in parentheses inside each digest cross-reference the original spec for further detail.

### Original CTA Specifications
The authoritative PDFs themselves (`ANSI-CTA-608-E S-2019 FINAL.pdf` and `ANSI-CTA-708-E S-2023 + Errata FINAL.pdf`) are gitignored because we do not have rights to redistribute them. They are available to download for free from:
- [CTA-608 Download](https://shop.cta.tech/products/cta-608)
- [CTA-708 Download](https://shop.cta.tech/products/cta-708)

## 2. MacCaption (MCC) Format Reference

Because there is no publicly available, authoritative specification document for the proprietary MacCaption (`.mcc`) format, we rely on the open-source implementation within FFmpeg as our definitive guide. `open-cea` uses MCC as its primary output format for video embedding.

*   [`mccdec.c`](./mccdec.c) — **FFmpeg's MCC Demuxer**
    *   This C source file serves as our technical reference for generating valid MCC V2.0 files. It dictates the exact header strings (e.g., `Time Code Rate=`), file format definitions, and parsing logic that our output must satisfy to be safely ingested and multiplexed by FFmpeg.
    *   *License:* LGPL v2.1+
    *   *Source:* Copy from FFmpeg commit `0b77f79` (saved April 28, 2026). The latest version is available on [GitHub](https://github.com/FFmpeg/FFmpeg/blob/master/libavformat/mccdec.c).

## Scope

The digests in this directory are encoder-and-decoder oriented. While the `open-cea` project itself is encoder-only, the digests cover decoding behavior as well so they can serve as a comprehensive reference for related projects (such as video players or validation tools).
