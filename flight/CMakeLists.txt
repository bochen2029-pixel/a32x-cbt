# The P6 law harness: the A32NX flight control computers, unmodified, stepped at 50 Hz against a stub
# world. GPLv3, like everything in flight/.
#
# The upstream sources are compiled straight out of a clone of flybywiresim/aircraft; nothing from it
# is copied into this repository. Point A32NX_DIR at the clone (flight/README.md says how to get it):
#
#   cmake -S flight -B flight/build -DA32NX_DIR=<clone>
#   cmake --build flight/build --config Release
#   ctest --test-dir flight/build -C Release --output-on-failure

cmake_minimum_required(VERSION 3.20)
project(a32nx_law_harness LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

set(A32NX_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../../a32nx" CACHE PATH "clone of flybywiresim/aircraft at 66021c2")
set(A32NX_COMMIT_EXPECTED "66021c2")
set(FBW "${A32NX_DIR}/fbw-a32nx/src/wasm/fbw_a320/src")

if(NOT EXISTS "${FBW}/model/ElacComputer.cpp")
  message(FATAL_ERROR
    "No A32NX sources under ${A32NX_DIR}.\n"
    "Clone them as flight/README.md says, or pass -DA32NX_DIR=<path to the clone>.")
endif()

find_package(Git QUIET)
if(GIT_FOUND)
  execute_process(COMMAND "${GIT_EXECUTABLE}" -C "${A32NX_DIR}" rev-parse --short=7 HEAD
                  OUTPUT_VARIABLE A32NX_COMMIT OUTPUT_STRIP_TRAILING_WHITESPACE ERROR_QUIET)
endif()
if(NOT A32NX_COMMIT STREQUAL A32NX_COMMIT_EXPECTED)
  message(FATAL_ERROR
    "The A32NX clone is at '${A32NX_COMMIT}'; the bus contract was written against ${A32NX_COMMIT_EXPECTED}.\n"
    "Check out ${A32NX_COMMIT_EXPECTED}, or re-derive flight/contract/ before moving the pin.")
endif()

# --- upstream: the flight control computers and what they need, compiled as they are -------------
file(GLOB FBW_MODEL CONFIGURE_DEPENDS "${FBW}/model/*.cpp")
list(FILTER FBW_MODEL EXCLUDE REGEX "/(Fmgc|Fcu|Fadec)[^/]*\\.cpp$")

add_library(a32nx_efcs STATIC
  ${FBW_MODEL}
  "${FBW}/elac/Elac.cpp"
  "${FBW}/sec/Sec.cpp"
  "${FBW}/fac/Fac.cpp"
  "${FBW}/fcdc/Fcdc.cpp"
  "${FBW}/utils/ConfirmNode.cpp"
  "${FBW}/utils/HysteresisNode.cpp"
  "${FBW}/utils/PulseNode.cpp"
  "${FBW}/utils/SRFlipFLop.cpp"
  "${FBW}/Arinc429.cpp"
  "${FBW}/Arinc429Utils.cpp")
target_include_directories(a32nx_efcs PUBLIC "${FBW}" "${FBW}/model")
# Upstream's warnings are upstream's: silence them here rather than edit a line of it.
if(MSVC)
  target_compile_options(a32nx_efcs PRIVATE /W0 /EHsc)
else()
  target_compile_options(a32nx_efcs PRIVATE -w)
endif()

# --- ours: the world adapter, the stub world, the runner -----------------------------------------
add_executable(law_harness
  harness/main.cpp
  harness/efcs.cpp
  harness/world.cpp)
target_link_libraries(law_harness PRIVATE a32nx_efcs)
target_compile_definitions(law_harness PRIVATE A32NX_COMMIT="${A32NX_COMMIT}")
if(MSVC)
  target_compile_options(law_harness PRIVATE /W4 /EHsc /permissive-)
  target_compile_definitions(law_harness PRIVATE _CRT_SECURE_NO_WARNINGS)  # plain fopen, as on every other platform
else()
  target_compile_options(law_harness PRIVATE -Wall -Wextra)
endif()

# --- the gate and the properties it rests on -------------------------------------------------------
enable_testing()

# P6 gate: thirty simulated minutes at 50 Hz, every output finite, every computer healthy.
add_test(NAME p6_gate_30_minutes COMMAND law_harness --minutes 30 --gate)

# The same run twice gives the same bytes: nothing reads a wall clock or an uninitialised value.
add_test(NAME deterministic COMMAND law_harness --minutes 3 --check-determinism)

# The parts of a flight the gate leans on, each checked on its own.
add_test(NAME computers_come_up COMMAND law_harness --minutes 1 --expect power-up)
add_test(NAME ground_check_moves_surfaces COMMAND law_harness --minutes 1 --expect ground-check)
add_test(NAME normal_law_in_flight COMMAND law_harness --minutes 6 --expect normal-law)
add_test(NAME stick_flies_the_aircraft COMMAND law_harness --minutes 8 --expect stick-response)

# Negative controls: the gate's two checks are shown able to fail.
add_test(NAME scanner_catches_a_planted_nan COMMAND law_harness --expect scanner-catches-nan)
add_test(NAME losing_all_air_data_ends_normal_law COMMAND law_harness --minutes 8 --fail-adr-at 240 --expect law-degrades)
