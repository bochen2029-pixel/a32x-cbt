# The orbit sketch: a spaceplane, a round Earth and a ring in orbit. Standalone: it links nothing from
# A32NX or JSBSim and builds without their clones. GPLv3, like everything in flight/.
#
#   cmake -S flight/orbit -B flight/orbit/build
#   cmake --build flight/orbit/build
#   ctest --test-dir flight/orbit/build --output-on-failure

cmake_minimum_required(VERSION 3.25)
project(orbit_sketch LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
  set(CMAKE_BUILD_TYPE Release)
endif()

add_library(orbit_core STATIC core/orbit_core.cpp)
target_include_directories(orbit_core PUBLIC core)
if(MSVC)
  target_compile_options(orbit_core PRIVATE /W4)
else()
  target_compile_options(orbit_core PRIVATE -Wall -Wextra)
endif()

add_executable(orbit_run tools/orbit_run.cpp)
target_link_libraries(orbit_run PRIVATE orbit_core)

add_executable(test_orbit test/test_orbit.cpp)
target_link_libraries(test_orbit PRIVATE orbit_core)

enable_testing()
foreach(t atmosphere ground_settles deterministic crew_reaches_orbit kepler_holds rocket_equation
          attitude_hold hand_flown_takeoff thrusters_translate approach_holds crew_takes_over)
  add_test(NAME ${t} COMMAND test_orbit ${t})
endforeach()

# The page's module: the core as WebAssembly inside one JavaScript file (SINGLE_FILE), so the page opens
# from file:// and fetches nothing. Built with Emscripten (docs/provenance.md, 2b):
#
#   emcmake cmake -S flight/orbit -B flight/orbit/build-wasm
#   cmake --build flight/orbit/build-wasm
#   ctest --test-dir flight/orbit/build-wasm --output-on-failure    (the same tests, under node)
if(EMSCRIPTEN)
  add_executable(orbit_core_js core/orbit_core.cpp)
  set_target_properties(orbit_core_js PROPERTIES OUTPUT_NAME orbit_core SUFFIX .js)
  target_link_options(orbit_core_js PRIVATE --no-entry -sMODULARIZE=1 -sEXPORT_NAME=createOrbitCore
    -sENVIRONMENT=web,node -sSINGLE_FILE=1 -sFILESYSTEM=0
    "SHELL:-sEXPORTED_FUNCTIONS=_oc_reset,_oc_controls,_oc_auto,_oc_sas,_oc_step,_oc_out,_oc_out_len,_oc_hash,_oc_eci,_oc_atmosphere,_malloc,_free"
    "SHELL:-sEXPORTED_RUNTIME_METHODS=HEAPF64")
  # The same core as plain JavaScript, for a host that refuses WebAssembly; the page falls back to it.
  add_executable(orbit_core_plainjs core/orbit_core.cpp)
  set_target_properties(orbit_core_plainjs PROPERTIES OUTPUT_NAME orbit_core_plain SUFFIX .js)
  target_link_options(orbit_core_plainjs PRIVATE --no-entry -sMODULARIZE=1 -sEXPORT_NAME=createOrbitCoreJs -sWASM=0
    -sENVIRONMENT=web,node -sFILESYSTEM=0
    "SHELL:-sEXPORTED_FUNCTIONS=_oc_reset,_oc_controls,_oc_auto,_oc_sas,_oc_step,_oc_out,_oc_out_len,_oc_hash,_oc_eci,_oc_atmosphere,_malloc,_free"
    "SHELL:-sEXPORTED_RUNTIME_METHODS=HEAPF64")
endif()
