# The build's own name, for every recording it makes (core.h, flight_build): the commit of the repository
# it was built from, with "+dirty" when tracked files under flight/ differ from that commit; where there is
# no git to ask (a release's source archive), the commit a SOURCE-COMMIT file at the repository's root
# names, as each upstream's does; otherwise "unknown". Run at every build, not at configure, so that a
# build always names what it was built from; the header is rewritten only when the name changes, so an
# unchanged build compiles nothing more. GPLv3.
#
#   cmake -DSOURCE_DIR=<flight> -DOUT=<build_id.h> [-DGIT=<git>] -P build-id.cmake

set(id "")
if(GIT)
  execute_process(COMMAND "${GIT}" -C "${SOURCE_DIR}" rev-parse --short=7 HEAD
                  OUTPUT_VARIABLE id OUTPUT_STRIP_TRAILING_WHITESPACE ERROR_QUIET RESULT_VARIABLE failed)
  if(failed)
    set(id "")
  else()
    # No optional locks: a build never rewrites the index another git may hold. core.autocrlf: a checkout
    # whose line endings another platform's git wrote is not a change.
    execute_process(COMMAND "${GIT}" --no-optional-locks -c core.autocrlf=true -C "${SOURCE_DIR}"
                            status --porcelain --untracked-files=no -- .
                    OUTPUT_VARIABLE changes OUTPUT_STRIP_TRAILING_WHITESPACE ERROR_QUIET RESULT_VARIABLE failed)
    if(failed)
      set(id "")
    elseif(changes)
      string(APPEND id "+dirty")
    endif()
  endif()
endif()
if(id STREQUAL "" AND EXISTS "${SOURCE_DIR}/../SOURCE-COMMIT")
  file(STRINGS "${SOURCE_DIR}/../SOURCE-COMMIT" commit LIMIT_COUNT 1)
  string(STRIP "${commit}" commit)
  if(commit MATCHES "^[0-9a-f]+$")
    string(SUBSTRING "${commit}" 0 7 id)
  endif()
endif()
if(id STREQUAL "")
  set(id "unknown")
endif()

set(text "// Written at every build by flight/harness/build-id.cmake: the commit this build was made from.\n#define FLIGHT_BUILD_ID \"${id}\"\n")
set(old "")
if(EXISTS "${OUT}")
  file(READ "${OUT}" old)
endif()
if(NOT old STREQUAL text)
  file(WRITE "${OUT}" "${text}")
  message(STATUS "this build is ${id}")
endif()
