# `open-cea` Architecture and Infrastructure Plan

## Objective
Create a comprehensive, strictly-typed TypeScript library and CLI tool for generating complete CEA-608 and CEA-708 closed caption streams. The project prioritizes high spec compliance, verifiable correctness against existing tools (`libcaption`), and a flexible architecture to support various input and output formats.

## 1. TypeScript Infrastructure
- **Language:** TypeScript with `strict: true`.
- **Linter:** ESLint (configured for strict typing and stylistic consistency).
- **Testing Framework:** Jest (chosen for its robust assertion library, mocking, and snapshot capabilities).
- **Test Strategy:**
  - **Pure TS Unit Tests:** Exhaustive testing of state management, command encoding, and data structures.
  - **Integration/Golden Tests:** A separate module that builds the C-based `libcaption`, generates test vectors exercising its full feature set, and saves them as golden binary files. The TS unit tests will encode the same logical operations and assert binary equivalence against these golden files to guarantee spec interpretation alignment.

## 2. Core API Architecture (Declarative Model)
The core library will expose an object-oriented, declarative API. This abstracts the complexity of `cc_data()`, DTVCC packets, and service block fragmentation away from the user.

### Key Abstractions:
*   `CaptionTimeline`: The root object representing the entire presentation. Contains scheduling logic.
*   `CaptionEvent`: Represents a discrete captioning moment (e.g., text appearance, window creation).
*   `Window` / `Pen`: Declarative representations of CEA-708 window and pen attributes.
*   `Encoder`: The core engine that processes the `CaptionTimeline`. It manages the 9600 bps bandwidth budget, schedules CEA-608 padding, frames DTVCC CCPs, and emits a stream of valid `cc_data()` byte pairs.

## 3. CLI Design
The CLI will wrap the core library, offering specific subcommands tailored to common captioning workflows.

### Global Options:
*   `--output-format <mcc|raw|h264>`: Determines the output muxing.
    *   `mcc`: Industry-standard sidecar format (default).
    *   `raw`: Pure binary dump of `cc_data()` payloads (primarily for testing).
    *   `h264`: *Deferred implementation.* Injects SEI NAL units into a raw elementary stream (requires `--input-video`). Implementation depends on future FFmpeg research.

### Subcommands:
*   `vtt-to-cea`: Simple generation. Ingests a WebVTT file (ignoring styling), extracts times and text, and generates basic captions. Flags will allow selecting the target CEA-608 style (`--style pop-on|paint-on|roll-up`).
*   `test-pattern`: Generates long-running test vectors for video player verification.
    *   `--type position`: Places text at various screen coordinates identifying the location.
    *   `--type timing`: Displays timing text (e.g. timestamps) to verify synchronization.
*   `compile`: Advanced generation. Accepts a structured JSON document that fully exercises the declarative API. Validates input against a JSON schema and generates the corresponding caption stream.

## 4. Implementation Phases
1.  **Project Init:** Set up `package.json`, `tsconfig.json`, ESLint, Jest, and directory structure.
2.  **`libcaption` Subproject:** Create the `libcaption` builder script and the golden vector generator.
3.  **Core Encoders:** Implement the CEA-608 byte-pair encoder, CEA-708 command encoder, and the DTVCC packet/transport framing logic.
4.  **Declarative API:** Build the `CaptionTimeline`, `Window`, and `Pen` abstractions.
5.  **CLI & Formatters:** Implement the CLI parsing (e.g., using `yargs` or `commander`), the WebVTT parser, the JSON schema validator, and the MCC/Raw output formatters.

## 5. Verification
- All code must pass strict TS compilation and ESLint checks.
- Pure TS tests must achieve high coverage.
- The output of the TS encoder must be bit-for-bit identical to the `libcaption` golden vectors for overlapping features. If discrepancies arise, implementation halts pending spec discussion.
