#include <iostream>
#include <vector>
#include <string>
#include <cstdint>
#include <cstdio>
#include <sys/stat.h>
#include <sys/types.h>

extern "C" {
#include "caption/eia608.h"
#include "caption/utf8.h"
#include "caption/eia608_charmap.h"
#include "caption/cea708.h"
}

void write_vector(const std::string& filename, const std::vector<uint16_t>& data) {
    FILE* f = fopen(filename.c_str(), "wb");
    if (!f) {
        perror(filename.c_str());
        return;
    }
    fwrite(data.data(), sizeof(uint16_t), data.size(), f);
    fclose(f);
}

int main() {
    mkdir("golden", 0755);

    // 1. Control Commands
    std::vector<uint16_t> controls;
    eia608_control_t cmds[] = {
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
    for (int chan = 1; chan <= 2; chan++) {
        for (size_t i = 0; i < sizeof(cmds)/sizeof(cmds[0]); i++) {
            controls.push_back(eia608_control_command(cmds[i], chan));
        }
    }
    write_vector("golden/control.bin", controls);

    // 2. Preambles
    std::vector<uint16_t> preambles;
    for (int chan = 1; chan <= 2; chan++) {
        for (int row = 1; row <= 15; row++) {
            for (int col = 0; col < 32; col++) {
                preambles.push_back(eia608_row_column_pramble(row, col, chan, 0));
                preambles.push_back(eia608_row_column_pramble(row, col, chan, 1));
            }
            for (int style = 0; style <= 7; style++) {
                preambles.push_back(eia608_row_style_pramble(row, chan, static_cast<eia608_style_t>(style), 0));
                preambles.push_back(eia608_row_style_pramble(row, chan, static_cast<eia608_style_t>(style), 1));
            }
        }
    }
    write_vector("golden/preambles.bin", preambles);

    // 3. Midrow Changes
    std::vector<uint16_t> midrow;
    for (int chan = 1; chan <= 2; chan++) {
        for (int style = 0; style <= 7; style++) {
            midrow.push_back(eia608_midrow_change(chan, static_cast<eia608_style_t>(style), 0));
            midrow.push_back(eia608_midrow_change(chan, static_cast<eia608_style_t>(style), 1));
        }
    }
    write_vector("golden/midrow.bin", midrow);

    // 4. Basic NA (Basic North American characters)
    std::vector<uint16_t> basic;
    for (uint16_t i = 0x20; i < 0x80; i++) {
        for (uint16_t j = 0x20; j < 0x80; j+=4) { // Step by 4 to save space but check combinations
            basic.push_back(eia608_from_basicna(i, j));
        }
    }
    write_vector("golden/basic_na.bin", basic);

    // 5. Tabs
    std::vector<uint16_t> tabs;
    for (int chan = 1; chan <= 2; chan++) {
        for (int size = 1; size <= 3; size++) {
            tabs.push_back(eia608_tab(size, chan));
        }
    }
    write_vector("golden/tabs.bin", tabs);

    // 6. Extended/Special Characters
    std::vector<uint16_t> special_chars;
    for (int chan = 1; chan <= 2; chan++) {
        for (int i = 0; i < EIA608_CHAR_COUNT; i++) {
            const char* str = eia608_char_map[i];
            if (str && str[0] != '\0') {
                uint16_t val = eia608_from_utf8_1((const utf8_char_t*)str, chan);
                if (val != 0) {
                    special_chars.push_back(val);
                }
            }
        }
    }
    write_vector("golden/special_chars.bin", special_chars);

    // 7. CEA-708 Framing
    cea708_t cea708;
    cea708_init(&cea708, 0.0);
    cea708_add_cc_data(&cea708, 1, cc_type_dtvcc_packet_start, 0x1234);
    cea708_add_cc_data(&cea708, 1, cc_type_dtvcc_packet_data, 0x5678);
    cea708_add_cc_data(&cea708, 0, cc_type_ntsc_cc_field_1, 0x0000);
    cea708_add_cc_data(&cea708, 1, cc_type_ntsc_cc_field_2, 0xABCD);

    std::vector<uint8_t> cea708_buffer(256);
    int render_len = cea708_render(&cea708, cea708_buffer.data(), cea708_buffer.size());
    FILE* f_708 = fopen("golden/cea708.bin", "wb");
    if (f_708) {
        fwrite(cea708_buffer.data(), 1, render_len, f_708);
        fclose(f_708);
    }

    std::cout << "Generated golden vectors in golden/" << std::endl;
    return 0;
}
