# The P6 law harness: the A32NX flight control computers, unmodified, stepped at 50 Hz against a stub
# world. GPLv3, like everything in flight/.
#
# The upstream sources are compiled straight out of clones of flybywiresim/aircraft and
# JSBSim-Team/jsbsim; nothing from either is copied into this repository. Point A32NX_DIR and
# JSBSIM_DIR at the clones (flight/README.md and docs/provenance.md say how to get them):
#
#   cmake -S flight -B flight/build -DA32NX_DIR=<clone> -DJSBSIM_DIR=<clone>
#   cmake --build flight/build --config Release
#   ctest --test-dir flight/build -C Release --output-on-failure

cmake_minimum_required(VERSION 3.25)
project(a32nx_law_harness LANGUAGES C CXX)

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

set(JSBSIM_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../../jsbsim" CACHE PATH "clone of JSBSim-Team/jsbsim at 66f7faf (v1.3.3)")
set(JSBSIM_COMMIT_EXPECTED "66f7faf")

if(NOT EXISTS "${JSBSIM_DIR}/src/FGFDMExec.cpp")
  message(FATAL_ERROR
    "No JSBSim sources under ${JSBSIM_DIR}.\n"
    "Clone them as docs/provenance.md says, or pass -DJSBSIM_DIR=<path to the clone>.")
endif()
if(GIT_FOUND)
  execute_process(COMMAND "${GIT_EXECUTABLE}" -C "${JSBSIM_DIR}" rev-parse --short=7 HEAD
                  OUTPUT_VARIABLE JSBSIM_COMMIT OUTPUT_STRIP_TRAILING_WHITESPACE ERROR_QUIET)
endif()
if(NOT JSBSIM_COMMIT STREQUAL JSBSIM_COMMIT_EXPECTED)
  message(FATAL_ERROR
    "The JSBSim clone is at '${JSBSIM_COMMIT}'; the airframe was measured against ${JSBSIM_COMMIT_EXPECTED}.\n"
    "Check out ${JSBSIM_COMMIT_EXPECTED}, or re-measure the airframe (docs/provenance.md) before moving the pin.")
endif()

if(MSVC)
  add_compile_options(/MP)  # JSBSim is some two hundred files; compile them in parallel
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

# --- upstream: JSBSim, the airframe, built out of its clone into this build tree -------------------
# Its documentation, Python module, unit tests and packaging stay off, its utilities stay unbuilt,
# and nothing is written into the clone. SYSTEM: its headers are not ours to warn about.
set(BUILD_DOCS OFF)
set(BUILD_PYTHON_MODULE OFF)
set(CMAKE_DISABLE_FIND_PACKAGE_CxxTest ON)
set(CMAKE_DISABLE_FIND_PACKAGE_PkgConfig ON)
add_subdirectory("${JSBSIM_DIR}" jsbsim EXCLUDE_FROM_ALL SYSTEM)

# --- ours: the world adapter, the world and its airframe, and the two programs that run them -------
function(flight_warnings target)
  if(MSVC)
    target_compile_options(${target} PRIVATE /W4 /EHsc /permissive-)
    target_compile_definitions(${target} PRIVATE _CRT_SECURE_NO_WARNINGS)  # plain fopen, as on every other platform
  else()
    target_compile_options(${target} PRIVATE -Wall -Wextra)
  endif()
endfunction()

add_library(flight_world STATIC
  harness/efcs.cpp
  harness/world.cpp
  harness/airframe.cpp)
target_link_libraries(flight_world PUBLIC a32nx_efcs libJSBSim)
target_include_directories(flight_world PUBLIC harness)
target_compile_definitions(flight_world PRIVATE
  JSBSIM_ROOT="${JSBSIM_DIR}"                              # aircraft/ and engine/ are read from the clone
  FLIGHT_JSBSIM_DIR="${CMAKE_CURRENT_SOURCE_DIR}/jsbsim")  # and our own JSBSim files from here
flight_warnings(flight_world)

# The runner: the gate, the expectations, the trace.
add_executable(law_harness harness/main.cpp)
target_link_libraries(law_harness PRIVATE flight_world)
target_compile_definitions(law_harness PRIVATE A32NX_COMMIT="${A32NX_COMMIT}" JSBSIM_COMMIT="${JSBSIM_COMMIT}")
flight_warnings(law_harness)

# The scorer: the airframe against the A320's targets, so a fitted A320 has numbers to beat.
add_executable(airframe_score harness/score.cpp)
target_link_libraries(airframe_score PRIVATE flight_world)
target_compile_definitions(airframe_score PRIVATE
  JSBSIM_COMMIT="${JSBSIM_COMMIT}"
  FLIGHT_TARGETS_DIR="${CMAKE_CURRENT_SOURCE_DIR}/targets")
flight_warnings(airframe_score)

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

# What a real airframe adds: the laws trim it, damp it, and land it.
add_test(NAME stabiliser_takes_the_trim COMMAND law_harness --minutes 8 --expect autotrim)
add_test(NAME yaw_damper_takes_out_a_pedal_kick COMMAND law_harness --minutes 8 --expect pedal-kick)
add_test(NAME lands_inside_the_limits COMMAND law_harness --minutes 16 --expect landing)

# The scorer runs, and measures every target and context row. It scores the airframe; a row outside
# its band is information, not a failure.
add_test(NAME airframe_is_scored_against_the_a320 COMMAND airframe_score --check)

# The scorer's instruments read the 737's own file back: its gear drag, the Mach where its drag table
# crosses 20 counts, a pitch pulse answered the right way round.
add_test(NAME scorer_instruments_read_the_737_right COMMAND airframe_score --instruments)

# Negative controls: the gate's two checks are shown able to fail.
add_test(NAME scanner_catches_a_planted_nan COMMAND law_harness --expect scanner-catches-nan)
add_test(NAME losing_all_air_data_ends_normal_law COMMAND law_harness --minutes 8 --fail-adr-at 240 --expect law-degrades)
