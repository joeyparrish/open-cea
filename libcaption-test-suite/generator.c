#include <stdio.h>
#include "caption/eia608.h"

int main() {
    printf("libcaption generator initialized.\n");
    // This is just a stub to verify compilation and linking against libcaption.
    // Real vector generation will be added here later.
    eia608_control_command(eia608_control_erase_display_memory, 1); // Dummy call to ensure linkage
    return 0;
}
