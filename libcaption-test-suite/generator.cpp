// Generator for libcaption golden test vectors.
//
// CEA-608 vectors are flat streams of 16-bit cc_data words written in
// big-endian wire order (high byte first, low byte second). Every word
// already includes odd parity in the MSB of each byte, exactly as the byte
// pair would appear on a line-21 waveform or inside a `cc_data()` tuple.
//
// Inputs to libcaption are restricted to spec-legal values only. For
// preambles this means columns are restricted to the eight legal positions
// {0, 4, 8, 12, 16, 20, 24, 28}. Other tables iterate their full enumerated
// domains exhaustively.
//
// The CC1..CC4 channel selector for control codes and tabs is libcaption's
// 2-bit packed form: bit 0 = secondary channel within field, bit 1 = field.
// Preambles and mid-row codes take a 1-bit in-field channel (0 or 1); the
// field is implicit from which CC pair carries them on the wire.

#include <array>
#include <cstdint>
#include <cstdio>
#include <filesystem>
#include <iostream>
#include <string>
#include <vector>

extern "C" {
#include "caption/cea708.h"
#include "caption/eia608.h"
#include "caption/eia608_charmap.h"
#include "caption/utf8.h"
}

namespace {

constexpr const char* kGoldenDir = "golden";

void write_be(const std::string& filename, const std::vector<uint16_t>& words) {
    const std::filesystem::path path = std::filesystem::path(kGoldenDir) / filename;
    FILE* f = std::fopen(path.string().c_str(), "wb");
    if (!f) {
        std::perror(path.string().c_str());
        return;
    }
    std::vector<uint8_t> bytes;
    bytes.reserve(words.size() * 2);
    for (uint16_t w : words) {
        bytes.push_back(static_cast<uint8_t>(w >> 8));
        bytes.push_back(static_cast<uint8_t>(w & 0xFF));
    }
    std::fwrite(bytes.data(), 1, bytes.size(), f);
    std::fclose(f);
    std::cout << "  " << path.string() << " (" << bytes.size() << " bytes)\n";
}

void write_raw(const std::string& filename, const uint8_t* data, size_t size) {
    const std::filesystem::path path = std::filesystem::path(kGoldenDir) / filename;
    FILE* f = std::fopen(path.string().c_str(), "wb");
    if (!f) {
        std::perror(path.string().c_str());
        return;
    }
    std::fwrite(data, 1, size, f);
    std::fclose(f);
    std::cout << "  " << path.string() << " (" << size << " bytes)\n";
}

constexpr std::array<int, 4> kAllCc = {0, 1, 2, 3};            // CC1..CC4
constexpr std::array<int, 8> kLegalCols = {0, 4, 8, 12, 16, 20, 24, 28};
constexpr std::array<eia608_style_t, 8> kAllStyles = {
    eia608_style_white,   eia608_style_green,   eia608_style_blue,
    eia608_style_cyan,    eia608_style_red,     eia608_style_yellow,
    eia608_style_magenta, eia608_style_italics,
};
constexpr std::array<eia608_control_t, 15> kAllControls = {
    eia608_control_resume_caption_loading,
    eia608_control_backspace,
    eia608_control_alarm_off,
    eia608_control_alarm_on,
    eia608_control_delete_to_end_of_row,
    eia608_control_roll_up_2,
    eia608_control_roll_up_3,
    eia608_control_roll_up_4,
    eia608_control_resume_direct_captioning,
    eia608_control_text_restart,
    eia608_control_text_resume_text_display,
    eia608_control_erase_display_memory,
    eia608_control_carriage_return,
    eia608_control_erase_non_displayed_memory,
    eia608_control_end_of_caption,
};

void emit_controls() {
    std::vector<uint16_t> out;
    for (int cc : kAllCc) {
        for (eia608_control_t cmd : kAllControls) {
            out.push_back(eia608_control_command(cmd, cc));
        }
    }
    write_be("control.bin", out);
}

void emit_tabs() {
    std::vector<uint16_t> out;
    for (int cc : kAllCc) {
        for (int size = 1; size <= 3; ++size) {
            out.push_back(eia608_tab(size, cc));
        }
    }
    write_be("tabs.bin", out);
}

void emit_preambles() {
    std::vector<uint16_t> out;
    for (int chan = 0; chan <= 1; ++chan) {
        for (int row = 1; row <= 15; ++row) {
            for (int col : kLegalCols) {
                for (int underline = 0; underline <= 1; ++underline) {
                    out.push_back(eia608_row_column_pramble(row, col, chan, underline));
                }
            }
            for (eia608_style_t style : kAllStyles) {
                for (int underline = 0; underline <= 1; ++underline) {
                    out.push_back(eia608_row_style_pramble(row, chan, style, underline));
                }
            }
        }
    }
    write_be("preambles.bin", out);
}

void emit_midrow() {
    std::vector<uint16_t> out;
    for (int chan = 0; chan <= 1; ++chan) {
        for (eia608_style_t style : kAllStyles) {
            for (int underline = 0; underline <= 1; ++underline) {
                out.push_back(eia608_midrow_change(chan, style, underline));
            }
        }
    }
    write_be("midrow.bin", out);
}

void emit_basic_na_pairs() {
    // Exhaustive Cartesian product of all printable Basic-NA byte values.
    // CTA-608 reserves 0x20..0x7F as the printable Basic-NA range; this is
    // what eia608_from_basicna packs into a single cc word.
    std::vector<uint16_t> out;
    for (uint16_t a = 0x20; a < 0x80; ++a) {
        for (uint16_t b = 0x20; b < 0x80; ++b) {
            out.push_back(eia608_from_basicna(a, b));
        }
    }
    write_be("basic_na_pairs.bin", out);
}

void emit_charmap() {
    // Round-trip every entry in libcaption's character map through
    // eia608_from_utf8_1, for both in-field channels. This exercises
    // Basic-NA singles, Special-NA, and the Extended Western European
    // tables in one pass. Empty entries are skipped.
    std::vector<uint16_t> out;
    for (uint16_t i = 0; i < EIA608_CHAR_COUNT; ++i) {
        const char* glyph = eia608_char_map[i];
        if (!glyph || glyph[0] == '\0') continue;
        for (int chan = 0; chan <= 1; ++chan) {
            uint16_t word = eia608_from_utf8_1(
                reinterpret_cast<const utf8_char_t*>(glyph), chan);
            if (word == 0) continue;
            out.push_back(i);                                // map index
            out.push_back(static_cast<uint16_t>(chan));      // in-field channel
            out.push_back(word);                             // cc word
        }
    }
    write_be("charmap.bin", out);
}

void emit_cea708_framing() {
    // CEA-708 transport framing primitives. This drives libcaption's
    // user_data_registered_itu_t_t35() rendering of a small mixed packet
    // (DTVCC start + data, plus 608 field 1 padding and field 2 data).
    // The output is the full ITU-T-T35 user-data byte buffer ready to be
    // wrapped in an SEI message.
    cea708_t cea708;
    cea708_init(&cea708, 0.0);
    cea708_add_cc_data(&cea708, 1, cc_type_dtvcc_packet_start, 0x1234);
    cea708_add_cc_data(&cea708, 1, cc_type_dtvcc_packet_data,  0x5678);
    cea708_add_cc_data(&cea708, 0, cc_type_ntsc_cc_field_1,    0x0000);
    cea708_add_cc_data(&cea708, 1, cc_type_ntsc_cc_field_2,    0xABCD);

    std::array<uint8_t, 256> buffer{};
    int rendered = cea708_render(&cea708, buffer.data(), buffer.size());
    if (rendered < 0) {
        std::fprintf(stderr, "cea708_render failed (%d)\n", rendered);
        return;
    }
    write_raw("cea708_framing.bin", buffer.data(), static_cast<size_t>(rendered));
}

}  // namespace

int main() {
    std::filesystem::create_directories(kGoldenDir);

    std::cout << "Generating golden vectors in " << kGoldenDir << "/\n";
    emit_controls();
    emit_tabs();
    emit_preambles();
    emit_midrow();
    emit_basic_na_pairs();
    emit_charmap();
    emit_cea708_framing();
    std::cout << "Done.\n";
    return 0;
}
