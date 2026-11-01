A32X CBT flight simulator @VERSION@: the Corresponding Source

Unofficial. Not affiliated with Airbus, FlyByWire Simulations or Aerowinx. Not for type training.

This archive is the Corresponding Source, as the GNU General Public License version 3 defines it,
of @BINARY@.zip: the source of every file in that zip that was built, and the scripts
that built it. The release step (a32x-cbt/flight/web/tools/release.mjs) wrote this archive first and
then built the other from it, unzipped, so the two correspond by construction.

WHAT IS HERE
  a32x-cbt/         A32X CBT: every file in the repository at commit
                    @COMMIT@ (@COMMIT_DATE@). flight/ is GPLv3
                    (a32x-cbt/flight/LICENSE); the rest is MIT (a32x-cbt/LICENSE).
  upstream/a32nx/   FlyByWire A32NX, @A32NX_REPOSITORY@, at
                    @A32NX_COMMIT@: the A320's flight-control code,
                    which is what is compiled (fbw-a32nx/src/wasm/fbw_a320/), and the repository's
                    licence, GPLv3. The rest of that repository, 1.4 GB of aircraft for Microsoft
                    Flight Simulator, is not.
  upstream/jsbsim/  JSBSim, @JSBSIM_REPOSITORY@, at
                    @JSBSIM_COMMIT@ (@JSBSIM_TAG@), whole. LGPL-2.1
                    (COPYING); its aircraft and engine files carry their own headers.
  upstream/three/   three.js @THREE_VERSION@ as npm publishes it: the files the page bundles into
                    web/flight.js, its licence (MIT) and its package.json.

  The upstream folders are exports of those commits, byte for byte as git stores them, not clones. Each
  one's SOURCE-COMMIT names its commit, and a32x-cbt/flight/CMakeLists.txt reads it in place of git. To
  check one against its repository, export the same paths there (git archive <commit> <paths>) and
  compare. a32x-cbt/SOURCE-COMMIT names this repository's own commit in the same way.

  Not included, because they are generally available tools, used unmodified:
    Emscripten @EMSCRIPTEN@ (emsdk @EMSDK@), which compiles the module. Its
    JavaScript runtime and system libraries (musl, libc++, libc++abi, libunwind, compiler-rt, dlmalloc)
    are linked into web/core.js; their licences are in the Windows zip's notices/. To install it:
      git init emsdk
      git -C emsdk remote add origin https://github.com/emscripten-core/emsdk.git
      git -C emsdk fetch --depth 1 origin @EMSDK@
      git -C emsdk checkout FETCH_HEAD
      emsdk/emsdk install @EMSCRIPTEN@
      emsdk/emsdk activate @EMSCRIPTEN@
      source emsdk/emsdk_env.sh
    Node.js 24 and npm, which run esbuild @ESBUILD_VERSION@. npm ci fetches it and three.js at the
    versions and hashes a32x-cbt/flight/web/package-lock.json pins.
    CMake 3.25 or later and Ninja; Visual Studio 2022 for A32X.exe.

BUILD IT
  From a clone of the repository, the release step does all of it: npm run release in flight/web.
  By hand, from this folder:

  The module that web/core.js carries, on Linux or in WSL, with Emscripten @EMSCRIPTEN@ active:
    emcmake cmake -S a32x-cbt/flight -B build-wasm -G Ninja -DCMAKE_BUILD_TYPE=Release \
      -DA32NX_DIR=$PWD/upstream/a32nx -DJSBSIM_DIR=$PWD/upstream/jsbsim
    SOURCE_DATE_EPOCH=@SOURCE_DATE_EPOCH@ cmake --build build-wasm --target flight_core
  SOURCE_DATE_EPOCH is the date JSBSim compiles into its version string; with it the module comes out
  the same, byte for byte.

  web/, in a32x-cbt/flight/web:
    npm ci
    node tools/build.mjs --core ../../../build-wasm/flight_core.js --out ../../../web

  A32X.exe, on Windows:
    cmake -S a32x-cbt/flight/launcher -B build-launcher
    cmake --build build-launcher --config Release

  trainer/ is a32x-cbt/app/web as committed, packaged by a32x-cbt/app/tools/package.mjs.

TEST IT
  The flight suite, natively (Visual Studio on Windows, or GCC), against the sources here:
    cmake -S a32x-cbt/flight -B build -DA32NX_DIR=<this folder>/upstream/a32nx \
      -DJSBSIM_DIR=<this folder>/upstream/jsbsim
    cmake --build build --config Release
    ctest --test-dir build -C Release --output-on-failure
  With FLIGHT_AIRFRAME=737 set, the suite flies JSBSim's 737 in place of our A320.
  a32x-cbt/flight/README.md says what each case shows.
