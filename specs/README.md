# CTA-608 / CTA-708 spec digests

This directory contains comprehensive Markdown digests of the CEA-608 and CEA-708 closed-captioning specifications, written to be sufficient for guiding an encoder or decoder implementation without needing to consult the original PDFs.

The PDFs themselves (`ANSI-CTA-608-E S-2019 FINAL.pdf` and `ANSI-CTA-708-E S-2023 + Errata FINAL.pdf`) are gitignored because we do not have rights to redistribute them. They are available for free download from:

- https://shop.cta.tech/products/cta-608
- https://shop.cta.tech/products/cta-708

## Files

- [`608.md`](./608.md) — ANSI/CTA-608-E S-2019 ("Line 21 Data Services"). Covers the line-21 byte-level protocol, character sets, control codes, caption modes (pop-on / roll-up / paint-on), Text Mode, and XDS. Applies whether the data is on the analog NTSC line-21 waveform or multiplexed inside CEA-708.
- [`708.md`](./708.md) — ANSI/CTA-708-E S-2023 ("Digital Television (DTV) Closed Captioning"). Covers the 5-layer DTVCC protocol stack (Transport, Packet, Service, Coding, Interpretation), `cc_data()` syntax, Caption Channel Packets, Service Blocks, the C0/C1/C2/C3/G0/G1/G2/G3 code spaces, the window/pen-based rendering model, and the full DTVCC command set with byte-level encodings.

Each digest aims to be a complete reference: control-code tables, parameter byte layouts, attribute interactions, encoder requirements, decoder requirements, and known gotchas / errata. Section numbers in parentheses inside each digest cross-reference the original spec for further detail.

## Scope

The digests are encoder-and-decoder oriented. The `open-cea` project itself is encoder-only, but the digests cover decoding behavior as well so that they can serve as a reference for related projects.
