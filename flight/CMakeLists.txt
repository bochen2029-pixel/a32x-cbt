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

# --- WebAssembly: the same sources through Emscripten (P7 step 6) --------------------------------
#
#   emcmake cmake -S flight -B flight/build-wasm -G Ninja -DCMAKE_BUILD_TYPE=Release \
#     -DA32NX_DIR=<clone> -DJSBSIM_DIR=<clone>
#   cmake --build flight/build-wasm && ctest --test-dir flight/build-wasm
#
# Native WebAssembly exceptions throughout, upstream included: JSBSim throws and our code catches.
# The test programs run under node on the real file system; the browser's module is at the end.
if(EMSCRIPTEN)
  add_compile_options(-fwasm-exceptions)
  add_link_options(-fwasm-exceptions -sALLOW_MEMORY_GROWTH=1 -sSTACK_SIZE=4MB)
endif()
function(flight_node_program target)
  if(EMSCRIPTEN)
    target_link_options(${target} PRIVATE -sENVIRONMENT=node -sNODERAWFS=1 -sEXIT_RUNTIME=1)
  endif()
endfunction()

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

set(FLIGHT_WORLD harness/efcs.cpp harness/world.cpp harness/airframe.cpp harness/runway.cpp)
add_library(flight_world STATIC
  ${FLIGHT_WORLD}
  harness/core.cpp)  # the step loop behind a C API: start, inputs, step, state
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
flight_node_program(law_harness)

# The flight core's C API, called from C.
add_executable(core_test harness/core_test.c)
target_link_libraries(core_test PRIVATE flight_world)
set_target_properties(core_test PROPERTIES LINKER_LANGUAGE CXX)
flight_warnings(core_test)
flight_node_program(core_test)

# An approach start on LSZH 14's ILS, through the same API.
add_executable(ils_test harness/ils_test.c)
target_link_libraries(ils_test PRIVATE flight_world)
set_target_properties(ils_test PROPERTIES LINKER_LANGUAGE CXX)
flight_warnings(ils_test)
flight_node_program(ils_test)

# The scorer: the airframe against the A320's targets, so a fitted A320 has numbers to beat.
add_executable(airframe_score harness/score.cpp)
target_link_libraries(airframe_score PRIVATE flight_world)
target_compile_definitions(airframe_score PRIVATE
  JSBSIM_COMMIT="${JSBSIM_COMMIT}"
  FLIGHT_TARGETS_DIR="${CMAKE_CURRENT_SOURCE_DIR}/targets")
flight_warnings(airframe_score)
flight_node_program(airframe_score)

# The fitter: CMA-ES over our A320's coefficients, each candidate scored by airframe_score in a process
# of its own. It links nothing of JSBSim's or A32NX's: it reads the seeds and writes the aircraft file.
# A desktop tool: it starts processes, which WebAssembly cannot.
if(NOT EMSCRIPTEN)
  add_executable(airframe_fit harness/fit.cpp)
  target_compile_definitions(airframe_fit PRIVATE FLIGHT_JSBSIM_DIR="${CMAKE_CURRENT_SOURCE_DIR}/jsbsim")
  add_dependencies(airframe_fit airframe_score)
  flight_warnings(airframe_fit)
endif()

# --- the browser's module (P7 step 6) ------------------------------------------------------------
# The flight core and every file it reads, as one JavaScript file with the WebAssembly inside it, for a
# worker (or node, which the module's own test uses). The airframes' files are embedded at /jsbsim and
# /flight, the paths this build of the world is compiled to read.
if(EMSCRIPTEN)
  add_library(flight_world_web STATIC ${FLIGHT_WORLD})
  target_link_libraries(flight_world_web PUBLIC a32nx_efcs libJSBSim)
  target_include_directories(flight_world_web PUBLIC harness)
  target_compile_definitions(flight_world_web PRIVATE JSBSIM_ROOT="/jsbsim" FLIGHT_JSBSIM_DIR="/flight")
  flight_warnings(flight_world_web)

  set(FLIGHT_EMBED
    "${JSBSIM_DIR}/aircraft/737/737.xml@/jsbsim/aircraft/737/737.xml"
    "${JSBSIM_DIR}/engine/CFM56.xml@/jsbsim/engine/CFM56.xml"
    "${JSBSIM_DIR}/engine/CFM56_5.xml@/jsbsim/engine/CFM56_5.xml"
    "${JSBSIM_DIR}/engine/direct.xml@/jsbsim/engine/direct.xml"
    "${CMAKE_CURRENT_SOURCE_DIR}/jsbsim/a32nx-surfaces.xml@/flight/a32nx-surfaces.xml"
    "${CMAKE_CURRENT_SOURCE_DIR}/jsbsim/aircraft/A320-fit/A320-fit.xml@/flight/aircraft/A320-fit/A320-fit.xml")
  set(FLIGHT_EMBED_OPTIONS "")
  set(FLIGHT_EMBED_FILES "")
  foreach(pair IN LISTS FLIGHT_EMBED)
    list(APPEND FLIGHT_EMBED_OPTIONS "SHELL:--embed-file ${pair}")
    string(REGEX REPLACE "@.*$" "" file "${pair}")
    list(APPEND FLIGHT_EMBED_FILES "${file}")
  endforeach()

  add_executable(flight_core harness/core.cpp)
  target_link_libraries(flight_core PRIVATE flight_world_web)
  flight_warnings(flight_core)
  target_link_options(flight_core PRIVATE
    --no-entry -sMODULARIZE=1 -sEXPORT_NAME=createFlightCore -sENVIRONMENT=worker,node -sSINGLE_FILE=1
    "SHELL:-sEXPORTED_FUNCTIONS=_flight_start,_flight_start_scenario,_flight_inputs,_flight_input_count,_flight_input_name,_flight_step,_flight_state,_flight_state_count,_flight_state_name,_flight_state_text"
    "SHELL:-sEXPORTED_RUNTIME_METHODS=ccall,UTF8ToString,HEAPF64"
    ${FLIGHT_EMBED_OPTIONS})
  set_target_properties(flight_core PROPERTIES LINK_DEPENDS "${FLIGHT_EMBED_FILES}")
endif()

# --- the gate and the properties it rests on -------------------------------------------------------
enable_testing()

# P6 gate: thirty simulated minutes at 50 Hz, every output finite, every computer healthy.
add_test(NAME p6_gate_30_minutes COMMAND law_harness --minutes 30 --gate)

# The same run twice gives the same bytes: nothing reads a wall clock or an uninitialised value.
# The flight core takes its crew from outside: the scripted crew's inputs, recorded and flown back
# through it, give the same bytes and the same touchdown. Both start fresh processes of their own, which
# WebAssembly cannot; the browser module's test replays in one (flight/web).
if(NOT EMSCRIPTEN)
  add_test(NAME deterministic COMMAND law_harness --minutes 3 --check-determinism)
  add_test(NAME replay_reaches_the_same_touchdown COMMAND law_harness --minutes 18 --check-replay)
endif()
add_test(NAME the_c_api_flies COMMAND core_test)

# A real runway and its ILS (P7 step 2): an approach start on LSZH 14 reads the beams where the scenario
# put it — on both, a dot right of the localizer, a dot below the glideslope — and holds the path hands off.
add_test(NAME ils_on_the_beams COMMAND ils_test "approach" 0 0)
add_test(NAME ils_a_dot_off_the_localizer COMMAND ils_test "approach$<SEMICOLON>loc=1" 1 0)
add_test(NAME ils_a_dot_low COMMAND ils_test "approach$<SEMICOLON>distance=8$<SEMICOLON>gs=1" 0 1)

# The parts of a flight the gate leans on, each checked on its own.
add_test(NAME computers_come_up COMMAND law_harness --minutes 1 --expect power-up)
add_test(NAME ground_check_moves_surfaces COMMAND law_harness --minutes 1 --expect ground-check)
add_test(NAME normal_law_in_flight COMMAND law_harness --minutes 6 --expect normal-law)
add_test(NAME stick_flies_the_aircraft COMMAND law_harness --minutes 8 --expect stick-response)

# What a real airframe adds: the laws trim it, damp it, and land it.
add_test(NAME stabiliser_takes_the_trim COMMAND law_harness --minutes 8 --expect autotrim)
add_test(NAME yaw_damper_takes_out_a_pedal_kick COMMAND law_harness --minutes 8 --expect pedal-kick)
add_test(NAME rudder_trim_moves_the_nose_the_way_it_is_set COMMAND law_harness --minutes 8 --expect rudder-trim)
# Eighteen minutes: our A320 descends at idle at about 1,030 fpm against the 737's 1,700 and lands later.
add_test(NAME lands_inside_the_limits COMMAND law_harness --minutes 18 --expect landing)

# The scorer runs, and measures every target and context row. It scores the airframe; a row outside
# its band is information, not a failure.
add_test(NAME airframe_is_scored_against_the_a320 COMMAND airframe_score --check)

# The scorer's instruments read the 737's own file back: its gear drag, the Mach where its drag table
# crosses 20 counts, a pitch pulse answered the right way round.
add_test(NAME scorer_instruments_read_the_737_right COMMAND airframe_score --instruments)

# Our fitted A320 flies by default since 2026-11-01. The 737 it replaced stays selectable and keeps its
# own cases, so the swap rule can always score both: it is scored, flies the gate, and lands.
add_test(NAME the_737_is_scored_against_the_a320 COMMAND airframe_score --airframe 737 --check)
add_test(NAME the_737_flies_the_gate COMMAND law_harness --minutes 30 --gate)
add_test(NAME the_737_lands_inside_the_limits COMMAND law_harness --minutes 18 --expect landing)
set_tests_properties(the_737_flies_the_gate the_737_lands_inside_the_limits PROPERTIES ENVIRONMENT "FLIGHT_AIRFRAME=737")

# The fitter's optimiser finds known minima: a sphere, a rotated ellipsoid of condition 1e6, Rosenbrock.
if(NOT EMSCRIPTEN)
  add_test(NAME cma_es_finds_known_minima COMMAND airframe_fit --selftest)
endif()

# Negative controls: the gate's two checks are shown able to fail.
add_test(NAME scanner_catches_a_planted_nan COMMAND law_harness --expect scanner-catches-nan)
add_test(NAME losing_all_air_data_ends_normal_law COMMAND law_harness --minutes 8 --fail-adr-at 240 --expect law-degrades)

# The page's own tests (flight/web), in node: its clock wherever node is found, and in the WebAssembly
# build the browser's module itself, the very file the page loads.
find_program(FLIGHT_NODE NAMES node nodejs)
if(FLIGHT_NODE)
  add_test(NAME the_page_clock_keeps_50_hz COMMAND "${FLIGHT_NODE}" --test "${CMAKE_CURRENT_SOURCE_DIR}/web/test/clock.test.mjs")
  add_test(NAME the_hands_reach_the_controls COMMAND "${FLIGHT_NODE}" --test
           "${CMAKE_CURRENT_SOURCE_DIR}/web/test/controls.test.mjs" "${CMAKE_CURRENT_SOURCE_DIR}/web/test/mapping.test.mjs")
  add_test(NAME the_view_puts_the_eye_and_the_papi_right COMMAND "${FLIGHT_NODE}" --test
           "${CMAKE_CURRENT_SOURCE_DIR}/web/test/scene.test.mjs")
  if(EMSCRIPTEN)
    add_test(NAME the_browser_module_flies COMMAND "${FLIGHT_NODE}" --test "${CMAKE_CURRENT_SOURCE_DIR}/web/test/module.test.mjs")
    set_tests_properties(the_browser_module_flies PROPERTIES ENVIRONMENT "FLIGHT_CORE_JS=${CMAKE_CURRENT_BINARY_DIR}/flight_core.js")
  endif()
else()
  message(STATUS "node not found: the page's tests (flight/web) are not registered")
endif()
