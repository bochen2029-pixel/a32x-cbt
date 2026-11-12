# Sources

Every claim in this kit about Unreal Engine, Cesium, Blender, Claude Code or a licence carries one of
the tags below. Gathered on 2026-11-12.

How each was read:

- **read**: the text itself was fetched and read.
- **search**: known only from web-search results and their summaries. The page itself could not be
  opened from the session that wrote this kit: Epic's documentation, forums and EULA pages sit behind
  a bot check (`dev.epicgames.com`, `forums.unrealengine.com`, `unrealengine.com` answered 403 or did
  not resolve). Treat these as **unverified until you open the page** on your own machine.
- **local**: your own repositories, as cloned on the machine that wrote the kit.
- **measured**: run by the session that wrote the kit; the command is given where the number is used.

## Unreal Engine

| tag | source | read | what it supports |
|---|---|---|---|
| E1 | Epic Games, *Unreal Engine Skills for Claude Code*, `README.md`, https://github.com/EpicGames/unreal-engine-skills-for-claude-code-plugin (main, via raw.githubusercontent.com) | read | Unreal MCP needs the **ModelContextProtocol** and **AllToolsets** plugins; default port 8000, path `/mcp`; `ModelContextProtocol.StartServer [port]`; `ModelContextProtocol.GenerateClientConfig ClaudeCode` writes `.mcp.json`; tool search on by default (`list_toolsets`, `describe_toolset`, `call_tool`); an optional `unreal_mcp_proxy` under `Engine/Plugins/Experimental/ModelContextProtocol/Extras/Proxy`; `ProgrammaticToolset.execute_tool_script` runs arbitrary Python in the editor; "Localhost is not a trust boundary"; installed with `/plugin install unreal-engine-skills-for-claude-code@claude-plugins-official`; its SessionStart hook needs bash (Git Bash or WSL on Windows) |
| E2 | the same repository, `skills/unreal-mcp/SKILL.md` | read | "MCP accepts concurrent requests and handles dispatch synchronization ... request order does not guarantee execution or completion order"; save before bulk changes; wait for compilation, drive `LiveCodingToolset.CompileLiveCoding`; check every result; mind PIE; project Agent Skills through `AgentSkillToolset` |
| E3 | the same repository, `skills/unreal-mcp/references/setup.md` | read | the server stays stopped by default; `bAutoStartServer=True` under `[/Script/ModelContextProtocolEngine.ModelContextProtocolSettings]` in `<Project>/Saved/Config/<Platform>Editor/EditorPerProjectUserSettings.ini`; `ServerPortNumber`, `ServerUrlPath`; command line `-ModelContextProtocolStartServer -ModelContextProtocolPort=<port>`; `.mcp.json` written next to the `.uproject` for a launcher build; several editors need one fixed port each |
| E4 | the same repository, `skills/unreal-mcp/references/operations.md` | read | console commands (`StartServer`, `StopServer`, `RefreshTools`, `GenerateClientConfig`); `bEnableToolSearch`; instance metadata in the `initialize` result; tool calls hang while the editor compiles, loads or plays |
| S1 | UE 5.8 release coverage: https://gamefromscratch.com/unreal-engine-5-8-released/, https://www.cgchannel.com/?p=176531 (17 June 2026), https://guru3d.com/story/unreal-engine-58-debuts-lumen-lite-and-productionready-megalights/, https://pcgamer.com/software/unreal-engine-5-8-launches-with-improved-terrain-and-vegetation-tools-a-lumen-lite-option-for-faster-global-illumination-and-for-the-times-we-now-live-in-an-open-standard-plugin-for-llm-systems/ | search | UE 5.8 released 17 June 2026; the last major UE5 release; MegaLights production-ready; Lumen Lite (a cheaper Lumen); Mesh Terrains experimental; the MCP plugin experimental |
| S2 | hotfixes: https://forums.unrealengine.com/t/5-8-4-hotfix-released/2842775, https://www.autobound.ai/companies/epic-games/signals/epic-games-shipped-unreal-engine-version-5-8-4-on-october-20-aa9fb4a9, https://forums.unrealengine.com/t/5-8-3-hotfix-released/2833315 | search | 5.8.4 shipped 20 October 2026; 5.8.1 to 5.8.3 before it |
| S3 | Unreal MCP coverage: https://www.pugetsystems.com/blog/2026/07/09/unreal-engine-mcp-hands-on-testing-ai-inside-the-editor/, https://indieforgames.com/claude-unreal-engine-mcp/, https://forums.unrealengine.com/t/unreal-mcp-codex-issue-analysis-report/2730883, https://forums.unrealengine.com/t/ue-5-8-2-unreal-mcp-tool-cancellation-is-not-session-scoped-when-sessions-reuse-the-same-json-rpc-request-id/2762739 | search | experimental; no authentication on the local server; users report missing readiness APIs and a cancellation bug in 5.8.2 |
| S4 | https://forums.unrealengine.com/t/bug-report-modelcontextprotocol-plugin-causes-cook-failure-exitcode-1-when-editor-is-running/2735398 | search (title only) | a cook fails while an editor with the plugin runs |
| S5 | Epic, *Large World Coordinates in Unreal Engine 5*, https://dev.epicgames.com/documentation/en-us/unreal-engine/large-world-coordinates-in-unreal-engine-5 | search | double-precision world positions on by default; default WORLD_MAX about 88 million km |
| S6 | Epic, *Sky Atmosphere Component*, https://dev.epicgames.com/documentation/en-us/unreal-engine/sky-atmosphere-component-in-unreal-engine; *Volumetric Cloud Component*, https://dev.epicgames.com/documentation/en-us/unreal-engine/volumetric-cloud-component-in-unreal-engine; S. Hillaire, SIGGRAPH 2020 course slides, https://blog.selfshadow.com/publications/s2020-shading-course/hillaire/s2020_pbs_hillaire_slides.pdf; https://forums.unrealengine.com/t/volumetric-clouds-lighting-from-space-view/623045 | search | SkyAtmosphere renders ground, aerial and space views on a spherical planet; the fast sky LUT shows artefacts at the Earth's shadow; clouds are ray-marched and meant for ground-to-space transitions, but their ambient light from space is not spatialised |
| S7 | https://forums.unrealengine.com/t/tutorial-custom-gravity-in-ue-5-4/1765303; Fab listing https://www.fab.com/listings/c74de757-8cf8-45ff-9d6e-82d3b421af5b | search | the Character Movement Component takes a custom gravity direction since 5.4 (`SetGravityDirection`); walking works, other modes and floor finding need care; a vendor says fixes for non-owning clients came in 5.6 |
| S8 | Epic, *MetaSound Builder API*, https://dev.epicgames.com/documentation/en-us/unreal-engine/metasound-builder-api-in-unreal-engine; `UMetaSoundBuilderSubsystem` API pages | search | MetaSounds can be built in memory, from C++ or Blueprint, without the editor; variables are not supported by the builder; live updates were beta as of 5.5 |
| S9 | Epic, *Android Development Requirements*, https://dev.epicgames.com/documentation/en-us/unreal-engine/android-development-requirements-for-unreal-engine; Meta, https://developers.meta.com/vr/documentation/unreal/unreal-quick-start-install-android/ | search | for 5.8, Epic lists Android Studio Koala 2024.1.2 Patch 1, target SDK 35, minimum compile SDK 34, NDK r27c; Meta's guide says NDK 25.1.8937393 for UE 5.5 and later. **They disagree** |
| S10 | Meta, Unreal Engine 5 integration, https://developers.meta.com/vr/downloads/package/unreal-engine-5-integration/; Meta's tracker, https://developers.meta.com/horizon/feedback/vr/investigations/1053459897316880/; https://developers.meta.com/horizon/documentation/unreal/unreal-openxr/ | search | Meta XR plugin 207.0 lists UE 5.8.0; Meta's tracker reports its plugins claim 5.8 but were built for 5.7.0 (investigating); Epic's native OpenXR is Meta's recommended backend |
| S11 | Meta, *Forward renderer*, https://developers.meta.com/horizon/documentation/unreal/unreal-forward-renderer/; https://www.roadtovr.com/meta-quest-unreal-engine-5-support-lumen-nanite/ | search | Nanite and Lumen need the deferred renderer and are unavailable with forward shading, which Quest uses; Meta's samples use forward shading, MSAA 4x, Mobile HDR off |
| S12 | Epic, *Geometry Scripting Users Guide*, https://dev.epicgames.com/documentation/unreal-engine/geometry-scripting-users-guide-in-unreal-engine; https://forums.unrealengine.com/t/all-geometry-script-mesh-writing-functions-crash-on-first-call-in-packaged-non-shipping-and-shipping-builds-ue-5-8-3-windows/2836311 | search | Geometry Script runs in the editor and at runtime; Dynamic Mesh Components get no Nanite or Lumen, so bake to Static Meshes; a user reports every mesh-writing function crashing in packaged 5.8.3 builds |
| S13 | Epic, *Mover*, https://dev.epicgames.com/documentation/ja-jp/unreal-engine/mover-in-unreal-engine; https://forums.unrealengine.com/t/any-roadmap-updates-on-mover/2833898 | search | Mover, the intended successor to the Character Movement Component, is still Experimental in 5.8 |
| S14 | Epic, *Setting up Visual Studio*, https://dev.epicgames.com/documentation/en-us/unreal-engine/setting-up-visual-studio-development-environment-for-cplusplus-projects-in-unreal-engine; https://forums.unrealengine.com/t/ue-5-8-doc-mismatch-recommended-msvc-version-in-documentation-vs-engine-source-code/2734076; https://forums.unrealengine.com/t/ue-5-8-fails-to-compile-with-visual-studio-2026-hash-map-missing-source-fix/2732357 | search | MSVC 14.44.35214, Windows SDK 10.0.22621.0, .NET 8 for 5.8; the engine's `Engine\Config\Windows\Windows_SDK.json` recommends 14.44 (VS 2022) or 14.50 (VS 2026); users report VS 2026 build problems |
| S15 | https://forums.unrealengine.com/t/how-to-change-floating-point-model/409626; https://forums.unrealengine.com/t/debug-game-development/2668723; https://forums.unrealengine.com/t/sse-intrinsic-may-mulfunction-using-clang-19-with-ffast-math-or-recommendation-to-add-fno-finite-math-only/2568978 | search | a forum report that Development builds compile with `/fp:fast` and DebugGame with `/fp:precise` (look for `/fp:fast` in UBT's `VCToolChain.cs`); a module-level floating-point setting is mentioned for 5.4+ but not confirmed |
| S16 | Unreal Engine EULA, "Non-Compatible Licenses": https://www.unrealengine.com/en-US/eula/unreal (the page did not open); quoted in https://www.github.com/larsjsol/NavGrid/issues/11 and https://conductatlas.com/platform/unreal-engine/unreal-engine-eula/non-compatible-license-prohibition-gpllgpl-ban/ | search | you may not combine the Licensed Technology with code under the GPL, the LGPL (unless merely dynamically linking a shared library) or CC BY-SA; BSD, MIT, MS-PL and Apache are allowed |
| S17 | Epic's UE6 direction: https://www.invenglobal.com/articles/28098/epic-games-will-remove-blueprints-and-actors-from-unreal-engine-6, https://gamefromscratch.com/unreal-deprecating-blueprints-and-actors/, https://create.fortnite.com/news/scene-graph-is-now-available-as-an-experimental-feature-in-uefn | search | press reports that Actors and Blueprints are to be deprecated in UE6 in favour of Verse and Scene Graph; UE6 early access reported for the end of 2027 |
| S18 | Fab plugin 0.0.22: https://forums.unrealengine.com/t/fab-plugin-0-0-22-fabtoolset-module-breaks-every-c-project-build-on-launcher-engines-ubt-ruleserror/2846816 | search | late October 2026: Fab 0.0.22 adds a `FabToolset` module that breaks every C++ build on launcher engines with a RulesError; uninstalling Fab, or `-DisablePlugin=Fab`, gets the build through |

## Cesium

| tag | source | read | what it supports |
|---|---|---|---|
| C1 | CesiumGS, `cesium-unreal` `CHANGES.md`, https://github.com/CesiumGS/cesium-unreal/blob/main/CHANGES.md | read | v2.31.0 of 2026-11-02 is the newest; v2.28.0 (2026-07-01) added UE 5.8; v2.29.0 needs UE 5.6+; `file:///` URLs on all platforms (v2.0.0); non-WGS84 ellipsoids through a `CesiumEllipsoid` asset (v2.7.0); a "From Ellipsoid" tileset, a globe with no terrain (v2.11.0); `CesiumOriginShiftComponent` (v2.0.0); an SQLite request cache with "Clear Request Cache" (v2.26.0); `CesiumSunSky` sizes the atmosphere to the globe and has `EnableMobileRendering` (v1.7.0); origin-rebasing options removed as "not usually necessary with Unreal Engine 5's double-precision coordinates" (v1.12.0) |
| C2 | `Source/CesiumRuntime/Public/CesiumGeoreference.h` (main) | read | at the georeference, Unreal axes are East-South-Up: +X east, +Y south, +Z up |
| C3 | `cesium-unreal` `README.md` | read | Apache 2.0, "free for both commercial and non-commercial use" |
| C4 | Cesium ion terms, https://cesium.com/legal/terms-of-service/; Unreal FAQ, https://cesium.com/learn/unreal/unreal-faq/ | search | "You may not copy, store, or redistribute any portion of Cesium Data Output in, or for use in, an offline, disconnected, or local computer environment" (Clips excepted); Asset Depot data such as Cesium World Terrain cannot be downloaded; offline use needs a commercial licence; the Community plan is for non-commercial use |
| C5 | Google, Map Tiles API policies, https://developers.google.com/maps/documentation/tile/policies | search | Photorealistic 3D Tiles may not be cached or used offline; Google and data attribution must be shown |
| C6 | https://community.cesium.com/t/how-to-use-terrain-files-in-cesium-for-unreal/40579, https://community.cesium.com/t/how-to-load-maps-offline/12832 | search | your own quantized-mesh terrain (made by cesium-terrain-builder, with a `layer.json`) can be loaded from a local server or a `file:///` URL |
| C7 | Cesium, *Build for Quest*, https://cesium.com/learn/unreal/build-for-quest/; https://community.cesium.com/t/rendering-artifacts-on-quest3-standalone/43202; https://community.cesium.com/t/cesium-tile-sets-render-black-inside-meta-quest-headsets/30238 | search | standalone headsets need `EnableMobileRendering` on `CesiumSunSky`, forward shading, MSAA 4x, Mobile HDR off; users report artefacts and black tiles on Quest 3 standalone that do not occur over Link |

## Blender

| tag | source | read | what it supports |
|---|---|---|---|
| B1 | Blender Lab, `lab/blender_mcp`, https://projects.blender.org/lab/blender_mcp (its API: repository, tags, releases; `readme.md`, `readme_tools.rst`, `addon/blender_mcp_addon/blender_manifest.toml`) | read | GPL-3.0; v1.0.3 of 2026-09-11 (v1.0.0 2026-04-27); the add-on needs Blender 5.1.0 or newer; an MCP server over stdio talks to an add-on inside Blender over a local TCP socket; tools include `execute_blender_code`, `execute_blender_code_for_cli` (a background Blender), `get_objects_summary`, `get_object_detail_summary`, `render_thumbnail_to_path`, `get_screenshot_of_area_as_image`, `search_api_docs` |
| B2 | https://download.blender.org/release/Blender5.3/ | read | Blender 5.3.0 builds dated 10 November 2026 |
| B3 | Siddharth Ahuja, *MCP for Blender* (formerly blender-mcp), https://github.com/ahujasid/blender-mcp, `README.md` and `LICENSE` | read | MIT; "a third-party integration and not made by Blender"; runs any Python by default, `BLENDER_MCP_SAFE_MODE=1` screens scripts; optional cloud model generators |
| B4 | https://www.blender.org/releases/5-2/ and coverage, e.g. https://www.phoronix.com/news/Blender-5.2-Released | search | Blender 5.2 LTS, 14 July 2026, supported to July 2028 |

## Claude Code and licences

| tag | source | read | what it supports |
|---|---|---|---|
| A1 | Anthropic, Claude Code docs, *MCP*, https://code.claude.com/docs/en/mcp.md | read | a per-server `timeout` in `.mcp.json` or `MCP_TOOL_TIMEOUT` (default about 28 hours); an HTTP server must send its first byte within the greatest of 60 s, the tool timeout and `MCP_TIMEOUT`; idle calls abort after 5 minutes (HTTP) or 30 (stdio); a call still running after two minutes moves to a background task |
| A2 | Anthropic, Claude Code docs, *Set up*, https://code.claude.com/docs/en/setup.md | read | native Windows 10 1809+; Git for Windows optional but needed for the Bash tool; without it shell commands run through the PowerShell tool |
| F1 | Free Software Foundation, *GPL FAQ*, https://www.gnu.org/licenses/gpl-faq.en.html#MereAggregation and #GPLPlugins | read | "pipes, sockets and command-line arguments are communication mechanisms normally used between two separate programs", unless "the semantics of the communication are intimate enough, exchanging complex internal data structures"; modules "designed to run linked together in a shared address space" almost surely form one program |

## Your own work

| tag | source | read | what it supports |
|---|---|---|---|
| O1 | this repository, `flight/orbit` at 7e9aaea, and at 599e051 for the final pass (README, `INVARIANTS.md`, `evidence/`, `core/`, `test/`, `web/src/`) | local | everything the kit says about the sketch |
| O2 | this repository, `docs/provenance.md` §1f, §1h, §2, §2a; `CLAUDE.md` §10 | local | what the sketch took from where, and under which licence |
| R1 | ASTRA-7, `ASTRA_AUDIO/` (`README.md`, `CLAUDE.md`, `BUILD_LOG.md`, `DESIGN_SPEC.md`, `Source/AstraAudio/AstraAudio.Build.cs`) | local | a UE 5.7 project of text only: a MetaSound graph built at runtime by the Builder API, zero `.uasset`; UE 5.7 needs `METASOUND_PLUGIN` and `METASOUND_MODULE` defined in a game module that registers MetaSound nodes, or the editor crashes at startup; UE 5.7 refuses MSVC 14.40 to 14.43, and 14.44.35207 builds |
| R2 | ASTRA-7, `DISCOVERY_2026-05-16_TECHDIVE_UE5.md` §7 | local | a CMake-built library behind a C API, linked into a UE plugin module through its `Build.cs` |
| R3 | Booster Lander, `DECISIONS.md` D-011 and its addendum | local | Unreal as one more pure observer; "precompute in, telemetry out, always"; a cheap early UE spike; "we add clients", never a migration |
| R4 | subsim: `docs/DESIGN_repo_blueprint_for_parallel_agents_v1_2026-11-03.md`, `docs/RUNBOOK_implementation_v1_2026-11-07.md`, `GATES.md`, `INVARIANTS.md`, `DECISIONS.md` sub:D113 | local | how you run waves: contracts first, packets with owner directories, tests and implementation by different agents, gates G0 to G9, a walking skeleton on fakes, the coordinator merges; your reference machine (an RTX 4070 Ti SUPER, an i9-9900K, 64 GB); cross-compiler hashes need the project's own maths in place of `<cmath>` |
| R5 | abacus, `README.md` | local | certified maths over MCP (`units.convert`, `check.equal` and others), registered at user scope |

## Measured for this kit

All on the machine that wrote the kit: a 4-core 2.3 GHz Xeon virtual machine, Ubuntu 24.04, g++ 13.3,
clang 18.1.3, CMake, at commit 7e9aaea.

| tag | what | how |
|---|---|---|
| M1 | the sketch's 15 tests pass; the receipts in CANON_DELTA §1 | `cmake -S flight/orbit -B <build>`, `cmake --build <build>`, `ctest --test-dir <build>`; each test run by name prints its numbers |
| M2 | the same 15 tests pass with the step at 1/120 s and at 1/240 s, once the tests count seconds instead of steps | a scratch copy with `OC_DT` changed and every step count in the tests multiplied by 0.02 / OC_DT |
| M3 | headless speed | wall-clock time of `test_orbit crew_reaches_orbit` (1,806 simulated seconds), three runs each |
| M4 | the core includes only `<cmath>`, `<cstdint>`, `<cstring>`; calls no clock, random source, thread or file | `grep` over `core/` |
| M5 | the crew's flight hashes `143d7cd1` under g++ and clang, C++17 and C++20, `-O0` to `-O3`, x86-64 and x86-64-v3 with `-ffp-contract=off`; fast-math and FMA contraction change the hash | `orbit_run 1000 800`, last line |
| M6 | periods, eclipses, Δv and spin numbers | computed from the formulas named where each is used |

For the final pass, at 599e051, on the same kind of machine (a 4-core 2.3 GHz Xeon virtual machine, Ubuntu
24.04, g++ 13.3, clang 18.1.3, Emscripten 6.0.12, Node 22):

| tag | what | how |
|---|---|---|
| M7 | the sketch's 120 tests pass natively and 120 as WebAssembly, and the page's 146; the crew's flight prints the rows of `CANON_DELTA.md` §1 unchanged | `ctest` in `build` and `build-wasm`; `node --test flight/orbit/web/test/*.test.mjs`; `orbit_run 10 800` |
| M8 | the crew's flight to 800 s hashes `ea7847fe` (to 760 s, `b0444540`) under g++ 13.3 at `-O0` and `-O2` with `-ffp-contract=off` and at `-O3` as the CMake Release build, and clang 18 at `-O0` and `-O3` with `-ffp-contract=off`, x86-64; `370241c5` (`74277791`) as WebAssembly | each compiler over `core/*.cpp` and `tools/orbit_run.cpp`; `orbit_run 10 800`, last line |
| M9 | docking's handover: the catch takes the closing speed (0.100 m/s) in one step; the draw-in and the change into *Docked* are continuous to 8.9 × 10⁻¹⁰ m and 6.4 × 10⁻⁶ m/s a step | a scratch program against `liborbit_core.a` and `internal.h`: the crew docks from the hold point, and each step the craft's place and velocity against the Ring's turning frame are set against the step before |
