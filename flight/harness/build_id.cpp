// The build's own name (core.h, flight_build), from the header build-id.cmake writes at every build. Its
// own translation unit, so that a new commit recompiles this file alone. GPLv3.

#include "build_id.h"
#include "core.h"

const char* flight_build(void) {
  return FLIGHT_BUILD_ID;
}
