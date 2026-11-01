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

# Which commit an upstream is at: a clone says so through git. The source archive of a release
# (flight/web/tools/release.mjs) holds exports, not clones, and an export has no .git to ask: each says
# the commit it was exported from in a SOURCE-COMMIT file of its own, which is read first.
find_package(Git QUIET)
function(upstream_commit dir out)
  set(commit "")
  if(EXISTS "${dir}/SOURCE-COMMIT")
    file(STRINGS "${dir}/SOURCE-COMMIT" commit LIMIT_COUNT 1)
    string(SUBSTRING "${commit}" 0 7 commit)
  elseif(GIT_FOUND)
    execute_process(COMMAND "${GIT_EXECUTABLE}" -C "${dir}" rev-parse --short=7 HEAD
                    OUTPUT_VARIABLE commit OUTPUT_STRIP_TRAILING_WHITESPACE ERROR_QUIET)
  endif()
  set(${out} "${commit}" PARENT_SCOPE)
endfunction()

upstream_commit("${A32NX_DIR}" A32NX_COMMIT)
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
upstream_commit("${JSBSIM_DIR}" JSBSIM_COMMIT)
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
  # our implementation of their Arinc429.h, its words starting at zero (harness/arinc429.cpp)
  "${CMAKE_CURRENT_SOURCE_DIR}/harness/arinc429.cpp"
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

# The build's own name (harness/build-id.cmake): the commit it is built from, asked of git at every
# build rather than at configure, so that every recording names the build that flew it.
set(FLIGHT_GENERATED "${CMAKE_CURRENT_BINARY_DIR}/generated")
add_custom_target(flight_build_id
  COMMAND "${CMAKE_COMMAND}" "-DSOURCE_DIR=${CMAKE_CURRENT_SOURCE_DIR}" "-DOUT=${FLIGHT_GENERATED}/build_id.h"
          "-DGIT=${GIT_EXECUTABLE}" -P "${CMAKE_CURRENT_SOURCE_DIR}/harness/build-id.cmake"
  BYPRODUCTS "${FLIGHT_GENERATED}/build_id.h"
  VERBATIM)

set(FLIGHT_WORLD harness/efcs.cpp harness/world.cpp harness/airframe.cpp harness/runway.cpp harness/judge.cpp
                 harness/build_id.cpp)
add_library(flight_world STATIC
  ${FLIGHT_WORLD}
  harness/core.cpp)  # the step loop behind a C API: start, inputs, step, state
target_link_libraries(flight_world PUBLIC a32nx_efcs libJSBSim)
target_include_directories(flight_world PUBLIC harness PRIVATE "${FLIGHT_GENERATED}")
add_dependencies(flight_world flight_build_id)
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

# The gate's judge through the C API, as the browser reads it.
add_executable(judge_test harness/judge_test.c)
target_link_libraries(judge_test PRIVATE flight_world)
set_target_properties(judge_test PROPERTIES LINKER_LANGUAGE CXX)
flight_warnings(judge_test)
flight_node_program(judge_test)

# Ground idle and reverse thrust through the C API, the crew's hands on the levers.
add_executable(reverse_test harness/reverse_test.c)
target_link_libraries(reverse_test PRIVATE flight_world)
set_target_properties(reverse_test PROPERTIES LINKER_LANGUAGE CXX)
flight_warnings(reverse_test)
flight_node_program(reverse_test)

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
  target_include_directories(flight_world_web PUBLIC harness PRIVATE "${FLIGHT_GENERATED}")
  add_dependencies(flight_world_web flight_build_id)
  target_compile_definitions(flight_world_web PRIVATE JSBSIM_ROOT="/jsbsim" FLIGHT_JSBSIM_DIR="/flight")
  flight_warnings(flight_world_web)

  set(FLIGHT_EMBED
    "${JSBSIM_DIR}/aircraft/737/737.xml@/jsbsim/aircraft/737/737.xml"
    "${JSBSIM_DIR}/engine/CFM56.xml@/jsbsim/engine/CFM56.xml"
    "${JSBSIM_DIR}/engine/direct.xml@/jsbsim/engine/direct.xml"
    "${CMAKE_CURRENT_SOURCE_DIR}/jsbsim/a32nx-surfaces.xml@/flight/a32nx-surfaces.xml"
    "${CMAKE_CURRENT_SOURCE_DIR}/jsbsim/aircraft/A320-fit/A320-fit.xml@/flight/aircraft/A320-fit/A320-fit.xml"
    "${CMAKE_CURRENT_SOURCE_DIR}/jsbsim/aircraft/A320-fit/Engines/CFM56-5A1-fit.xml@/flight/aircraft/A320-fit/Engines/CFM56-5A1-fit.xml")
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
    "SHELL:-sEXPORTED_FUNCTIONS=_flight_start,_flight_start_scenario,_flight_inputs,_flight_input_count,_flight_input_name,_flight_step,_flight_state,_flight_state_count,_flight_state_name,_flight_state_text,_flight_debrief,_flight_airframe,_flight_build"
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
# The gate's judge (judge.h) as the browser reads it, through the C API: the scripted crew's approach
# judged STABLE; nobody's, which holds the beams and never flares, NOT STABLE on its touchdown; and no
# approach to judge from the runway.
add_test(NAME the_judge_finds_the_scripted_approach_stable COMMAND judge_test scripted)
add_test(NAME the_judge_finds_an_unflared_approach_not_stable COMMAND judge_test hands-off)
add_test(NAME the_judge_has_nothing_to_judge_on_the_runway COMMAND judge_test runway)
# From 3.5 nm the window opens before the FAC's VLS has settled: the judge waits for it before it fixes
# Vapp, and leaves speed out of the in-band slot until then.
add_test(NAME the_judge_waits_for_the_fac_s_vls_on_a_short_approach COMMAND judge_test short)
# Ground idle and reverse thrust (airframe.cpp) act only on an airframe whose file has them: on one without
# them, JSBSim's 737, there is one idle, below idle is idle, and nothing deploys, on the ground or in flight.
add_test(NAME without_reversers_below_idle_is_idle COMMAND reverse_test ground)
add_test(NAME without_reversers_nothing_deploys_in_flight COMMAND reverse_test air)
set_tests_properties(without_reversers_below_idle_is_idle without_reversers_nothing_deploys_in_flight
                     PROPERTIES ENVIRONMENT "FLIGHT_AIRFRAME=737")

# The scripted crew flies KDFW 17C's ILS from 10 nm to a stop, judged by the hand-flown ILS's bands
# (ROADMAP.md, P7): on the beams, a dot off each of them either way, 10 kt fast and slow, a 15 kt
# crosswind from either side. In light turbulence the gusts are felt, normal law holds and it reaches
# the runway; how it lands there is not judged, since its flare is not robust in gusts (main.cpp,
# --expect turbulence, says how far from robust).
foreach(start IN ITEMS
    "on_the_beams|approach"
    "from_a_dot_left|approach$<SEMICOLON>loc=1"
    "from_a_dot_right|approach$<SEMICOLON>loc=-1"
    "from_a_dot_low|approach$<SEMICOLON>gs=1"
    "from_a_dot_high|approach$<SEMICOLON>gs=-1"
    "from_10_kt_fast|approach$<SEMICOLON>cas=150"
    "from_10_kt_slow|approach$<SEMICOLON>cas=130"
    "in_a_crosswind_from_the_left|approach$<SEMICOLON>wind=90/15"
    "in_a_crosswind_from_the_right|approach$<SEMICOLON>wind=270/15")
  string(FIND "${start}" "|" bar)
  string(SUBSTRING "${start}" 0 ${bar} name)
  math(EXPR after "${bar} + 1")
  string(SUBSTRING "${start}" ${after} -1 scenario)
  add_test(NAME ils_flown_${name} COMMAND law_harness --scenario "${scenario}" --minutes 6 --expect ils)
endforeach()
add_test(NAME ils_in_light_turbulence_reaches_the_runway
         COMMAND law_harness --scenario "approach$<SEMICOLON>wind=270/15$<SEMICOLON>turbulence=1" --minutes 6 --expect turbulence)
# A recorded approach replays from its file alone to the same bytes, touchdown and verdict (every
# hand-flown approach must too); and five of the scripted crew's, from varied starts, pass the gate's
# repeatability as five hand-flown ones would be asked to. On copies of those five, relabelled as only a
# test may, the gate's build rules: five flown on two builds, or on a build other than law_harness's, are
# refused; --rejudge passes five another build flew that are stable on this one, naming a changed band.
if(NOT EMSCRIPTEN)
  add_test(NAME ils_approach_replays_to_the_same_touchdown
           COMMAND law_harness --scenario "approach$<SEMICOLON>wind=270/15$<SEMICOLON>turbulence=1" --minutes 6 --check-replay)
  add_test(NAME five_scripted_approaches_are_repeatable COMMAND law_harness --check-repeatable)
endif()

# The parts of a flight the gate leans on, each checked on its own.
add_test(NAME computers_come_up COMMAND law_harness --minutes 1 --expect power-up)
add_test(NAME ground_check_moves_surfaces COMMAND law_harness --minutes 1 --expect ground-check)
add_test(NAME normal_law_in_flight COMMAND law_harness --minutes 6 --expect normal-law)
add_test(NAME stick_flies_the_aircraft COMMAND law_harness --minutes 8 --expect stick-response)

# What a real airframe adds: the laws trim it, damp it, and land it.
add_test(NAME stabiliser_takes_the_trim COMMAND law_harness --minutes 8 --expect autotrim)
add_test(NAME yaw_damper_takes_out_a_pedal_kick COMMAND law_harness --minutes 8 --expect pedal-kick)
add_test(NAME rudder_trim_moves_the_nose_the_way_it_is_set COMMAND law_harness --minutes 8 --expect rudder-trim)
# Twenty minutes: our A320 descends at idle at about 1,100 fpm against the 737's 1,700, and since its
# engines were fitted climbs at about 3,300 fpm against 4,600; its first landing comes at 1,077 s, and a
# bounce is looked for over the 30 s after it.
add_test(NAME lands_inside_the_limits COMMAND law_harness --minutes 20 --expect landing)

# The scorer runs, and measures every target and context row. It scores the airframe; a row outside
# its band is information, not a failure.
add_test(NAME airframe_is_scored_against_the_a320 COMMAND airframe_score --check)

# The scorer's instruments read the 737's own file back: its gear drag, the Mach where its drag table
# crosses 20 counts, a pitch pulse answered the right way round, and an engine spooled up in time with
# the airframe held still, slower in thinner air.
add_test(NAME scorer_instruments_read_the_737_right COMMAND airframe_score --instruments)
# And the ones for pitch past the normal range read our A320's: a static moment with no alpha-rate damping
# in it, the elevator's power and its fade with alpha as the file has them; and two readings of a short
# period, by its extrema and by equation error, agree on the 737's clean pulse.
add_test(NAME scorer_instruments_read_pitch_as_the_files_have_it COMMAND airframe_score --instruments-pitch)

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

# The instructor's failures and the laws the computers choose for them (ROADMAP.md, P7 step 3): each
# failure in the circuit from KDFW 17C at 300 s, in the cruise, and the laws the FCDC reports from five
# seconds after it: pitch and lateral before the crew configures to land, and pitch once the gear is
# down; then the landing flown in them, judged as any other. A32NX's ELAC makes the lateral law direct
# whenever pitch leaves normal law, and every alternate law direct once the gear is down. With both SECs
# lost the ELAC cannot see the gear and goes direct on the flaps instead, a second later, so that case
# leaves the gear-down law out. One unit lost of each kind leaves normal law, if together they leave every
# surface a servo: green and ELAC 1 together take both of the left elevator's, and leave alternate 1.
foreach(case IN ITEMS
    "two_adrs_alternate_1_then_direct_at_gear_down|adr1+adr2@300|alternate-1/direct,direct"
    "three_adrs_alternate_2_then_direct_at_gear_down|adr1+adr2+adr3@300|alternate-2/direct,direct"
    "two_irs_alternate_1_then_direct_at_gear_down|ir1+ir2@300|alternate-1/direct,direct"
    "three_irs_direct|ir1+ir2+ir3@300|direct/direct,direct"
    "blue_and_yellow_alternate_1_then_direct_at_gear_down|blue+yellow@300|alternate-1/direct,direct"
    "both_elacs_alternate_1_then_direct_at_gear_down|elac1+elac2@300|alternate-1/direct,direct"
    "secs_1_and_2_alternate_1|sec1+sec2@300|alternate-1/direct"
    "an_adr_an_ir_an_elac_and_a_sec_normal|adr1+ir2+elac1+sec3@300|normal/normal,normal"
    "green_alone_normal|green@300|normal/normal,normal")
  string(REPLACE "|" ";" fields "${case}")
  list(GET fields 0 name)
  list(GET fields 1 failures)
  list(GET fields 2 laws)
  add_test(NAME laws_${name} COMMAND law_harness --fail "${failures}" --minutes 20 --expect "laws=${laws}")
endforeach()
# The protections of normal law, flown as a test pilot flies them from an air start, level at 10,000 ft
# and 250 kt clean unless said (ROADMAP.md, P7 step 4; main.cpp, --expect protection, says what is
# judged and notes the rest). Judged on the product airframe, our fitted A320, whatever FLIGHT_AIRFRAME
# the suite runs with: alpha max and the stall are the A320's.
foreach(case IN ITEMS
    "full_stick_bank_stops_at_67_deg|air$<SEMICOLON>manoeuvre=bank"
    "full_pull_inside_2_5_g_and_30_deg|air$<SEMICOLON>manoeuvre=pull"
    "full_push_inside_minus_1_g|air$<SEMICOLON>manoeuvre=push"
    "alpha_max_held_without_a_stall|air$<SEMICOLON>cas=200$<SEMICOLON>manoeuvre=alpha")
  string(REPLACE "|" ";" fields "${case}")
  list(GET fields 0 name)
  list(GET fields 1 scenario)
  add_test(NAME protection_${name} COMMAND law_harness --scenario "${scenario}" --minutes 3 --expect protection)
  set_tests_properties(protection_${name} PROPERTIES ENVIRONMENT "FLIGHT_AIRFRAME=a320")
endforeach()

# A degraded flight, the trim wheel turned by hand in it, replays to the same bytes and touchdown.
if(NOT EMSCRIPTEN)
  add_test(NAME laws_three_irs_replays_to_the_same_touchdown
           COMMAND law_harness --fail "ir1+ir2+ir3@300" --minutes 18 --check-replay)
endif()

# The page's own tests (flight/web), in node: its clock wherever node is found, and in the WebAssembly
# build the browser's module itself, the very file the page loads.
find_program(FLIGHT_NODE NAMES node nodejs)
if(FLIGHT_NODE)
  add_test(NAME the_page_clock_keeps_50_hz COMMAND "${FLIGHT_NODE}" --test "${CMAKE_CURRENT_SOURCE_DIR}/web/test/clock.test.mjs")
  add_test(NAME the_hands_reach_the_controls COMMAND "${FLIGHT_NODE}" --test
           "${CMAKE_CURRENT_SOURCE_DIR}/web/test/controls.test.mjs" "${CMAKE_CURRENT_SOURCE_DIR}/web/test/mapping.test.mjs")
  add_test(NAME the_view_puts_the_eye_where_the_flight_is COMMAND "${FLIGHT_NODE}" --test
           "${CMAKE_CURRENT_SOURCE_DIR}/web/test/scene.test.mjs")
  add_test(NAME kdfw_is_laid_out_as_ourairports_and_the_faa_have_it COMMAND "${FLIGHT_NODE}" --test
           "${CMAKE_CURRENT_SOURCE_DIR}/web/test/airport.test.mjs")
  add_test(NAME the_view_draws_the_flight_model_s_airframe_under_its_sun COMMAND "${FLIGHT_NODE}" --test
           "${CMAKE_CURRENT_SOURCE_DIR}/web/test/visuals.test.mjs")
  add_test(NAME a_saved_recording_is_one_file_named_for_its_flight COMMAND "${FLIGHT_NODE}" --test
           "${CMAKE_CURRENT_SOURCE_DIR}/web/test/recording-name.test.mjs")
  add_test(NAME the_debrief_logs_the_flight_s_moments_from_the_core_s_slots COMMAND "${FLIGHT_NODE}" --test
           "${CMAKE_CURRENT_SOURCE_DIR}/web/test/events.test.mjs")
  # The Windows release (web/tools/release.mjs) refuses to ship without every licence and notice it owes.
  add_test(NAME the_release_refuses_to_ship_without_its_notices COMMAND "${FLIGHT_NODE}" --test
           "${CMAKE_CURRENT_SOURCE_DIR}/web/test/release.test.mjs")
  add_test(NAME the_mouse_turns_the_head_and_the_orbit_within_their_limits COMMAND "${FLIGHT_NODE}" --test
           "${CMAKE_CURRENT_SOURCE_DIR}/web/test/pointer.test.mjs")
  add_test(NAME the_pilots_guide_ships_as_a_page_with_its_pictures COMMAND "${FLIGHT_NODE}" --test
           "${CMAKE_CURRENT_SOURCE_DIR}/web/test/guide-html.test.mjs")
  if(EMSCRIPTEN)
    add_test(NAME the_browser_module_flies COMMAND "${FLIGHT_NODE}" --test "${CMAKE_CURRENT_SOURCE_DIR}/web/test/module.test.mjs")
    set_tests_properties(the_browser_module_flies PROPERTIES ENVIRONMENT "FLIGHT_CORE_JS=${CMAKE_CURRENT_BINARY_DIR}/flight_core.js")
  endif()
else()
  message(STATUS "node not found: the page's tests (flight/web) are not registered")
endif()
