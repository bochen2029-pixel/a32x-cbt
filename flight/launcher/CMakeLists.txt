# A32X.exe, the flight simulator's launcher: it opens the page beside it in Microsoft Edge as an app
# window, or in the default browser when there is no Edge. Windows and MSVC. The static CRT and system
# DLLs only, so it runs wherever it is unzipped, with no runtime to install. GPLv3, like all of flight/.
#
#   cmake -S flight/launcher -B flight/build-launcher
#   cmake --build flight/build-launcher --config Release
#   ctest --test-dir flight/build-launcher -C Release --output-on-failure
#
# It needs neither upstream clone. The release (flight/web/tools/release.mjs) builds it from the source
# archive and puts it beside web/. It builds reproducibly: /Brepro writes a hash where the linker would
# write the time, and a Release build carries no debug information, so no build path goes in either.

cmake_minimum_required(VERSION 3.25)
project(a32x_launcher VERSION 0.1.2 LANGUAGES CXX RC)

if(NOT WIN32 OR NOT MSVC)
  message(FATAL_ERROR "A32X.exe is a Windows program, built with MSVC (Visual Studio 2022).")
endif()

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")  # the static CRT: no VCRUNTIME140.dll

add_executable(A32X WIN32 A32X.cpp A32X.rc A32X.manifest)
target_compile_definitions(A32X PRIVATE
  UNICODE _UNICODE
  A32X_VERSION="${PROJECT_VERSION}"
  A32X_VERSION_MAJOR=${PROJECT_VERSION_MAJOR}
  A32X_VERSION_MINOR=${PROJECT_VERSION_MINOR}
  A32X_VERSION_PATCH=${PROJECT_VERSION_PATCH})
target_compile_options(A32X PRIVATE $<$<COMPILE_LANGUAGE:CXX>:/W4 /WX /permissive- /utf-8 /Brepro /guard:cf>)
# The manifest says asInvoker itself, so the linker writes none of its own.
target_link_options(A32X PRIVATE /Brepro /guard:cf /MANIFESTUAC:NO)
target_link_libraries(A32X PRIVATE user32 shell32 advapi32 ole32)

# The program through its test switch, in node: the page named from folders with awkward names, a missing
# page said rather than opened, and nothing imported but Windows' own DLLs.
enable_testing()
find_program(LAUNCHER_NODE NAMES node nodejs)
if(LAUNCHER_NODE)
  add_test(NAME the_launcher_names_the_page_beside_it
           COMMAND "${LAUNCHER_NODE}" --test "${CMAKE_CURRENT_SOURCE_DIR}/test/launcher.test.mjs")
  set_tests_properties(the_launcher_names_the_page_beside_it PROPERTIES ENVIRONMENT "A32X_EXE=$<TARGET_FILE:A32X>")
else()
  message(STATUS "node not found: the launcher's test is not registered")
endif()
