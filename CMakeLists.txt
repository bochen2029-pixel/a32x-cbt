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

add_library(orbit_core STATIC core/orbit_core.cpp core/return.cpp core/dock.cpp core/deck.cpp core/fd.cpp core/walk.cpp core/sky.cpp)
target_include_directories(orbit_core PUBLIC core)
if(MSVC)
  target_compile_options(orbit_core PRIVATE /W4)
else()
  target_compile_options(orbit_core PRIVATE -Wall -Wextra)
endif()

add_executable(orbit_run tools/orbit_run.cpp)
target_link_libraries(orbit_run PRIVATE orbit_core)

# One test program for each part of the core; each names its tests in lines of its own that read
# "// TEST: <name>", and is registered here from them, so a part's tests change with its file.
enable_testing()
foreach(part orbit return dock deck fd walk sky invariants)
  set(src ${CMAKE_CURRENT_SOURCE_DIR}/test/test_${part}.cpp)
  add_executable(test_${part} ${src})
  target_link_libraries(test_${part} PRIVATE orbit_core)
  set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS ${src})
  file(STRINGS ${src} lines REGEX "^// TEST: [a-z0-9_]+$")
  foreach(line ${lines})
    string(REGEX REPLACE "^// TEST: " "" t "${line}")
    add_test(NAME ${part}.${t} COMMAND test_${part} ${t})
  endforeach()
endforeach()

# The page's module: the core as WebAssembly inside one JavaScript file (SINGLE_FILE), so the page opens
# from file:// and fetches nothing. Built with Emscripten (docs/provenance.md, 2b):
#
#   emcmake cmake -S flight/orbit -B flight/orbit/build-wasm
#   cmake --build flight/orbit/build-wasm
#   ctest --test-dir flight/orbit/build-wasm --output-on-failure    (the same tests, under node)
if(EMSCRIPTEN)
  # What the page may call: core/exports/*.txt, one function a line, a file for each part of the core,
  # so a part's exports change with it.
  file(GLOB ORBIT_EXPORT_FILES ${CMAKE_CURRENT_SOURCE_DIR}/core/exports/*.txt)
  set(ORBIT_EXPORTS "_malloc,_free")
  foreach(f ${ORBIT_EXPORT_FILES})
    file(STRINGS ${f} names REGEX "^oc_")
    foreach(n ${names})
      string(APPEND ORBIT_EXPORTS ",_${n}")
    endforeach()
  endforeach()
  add_executable(orbit_core_js core/orbit_core.cpp core/return.cpp core/dock.cpp core/deck.cpp core/fd.cpp core/walk.cpp core/sky.cpp)
  set_target_properties(orbit_core_js PROPERTIES OUTPUT_NAME orbit_core SUFFIX .js)
  target_link_options(orbit_core_js PRIVATE --no-entry -sMODULARIZE=1 -sEXPORT_NAME=createOrbitCore
    -sENVIRONMENT=web,node -sSINGLE_FILE=1 -sFILESYSTEM=0
    "SHELL:-sEXPORTED_FUNCTIONS=${ORBIT_EXPORTS}"
    "SHELL:-sEXPORTED_RUNTIME_METHODS=HEAPF64")
  # The same core as plain JavaScript, for a host that refuses WebAssembly; the page falls back to it.
  add_executable(orbit_core_plainjs core/orbit_core.cpp core/return.cpp core/dock.cpp core/deck.cpp core/fd.cpp core/walk.cpp core/sky.cpp)
  set_target_properties(orbit_core_plainjs PROPERTIES OUTPUT_NAME orbit_core_plain SUFFIX .js)
  target_link_options(orbit_core_plainjs PRIVATE --no-entry -sMODULARIZE=1 -sEXPORT_NAME=createOrbitCoreJs -sWASM=0
    -sENVIRONMENT=web,node -sFILESYSTEM=0
    "SHELL:-sEXPORTED_FUNCTIONS=${ORBIT_EXPORTS}"
    "SHELL:-sEXPORTED_RUNTIME_METHODS=HEAPF64")
endif()
