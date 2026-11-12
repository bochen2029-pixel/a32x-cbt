# Unreal port: the sketch, part by part, in Unreal Engine 5.8

What becomes a plugin around the existing core, what becomes actors and components, what Unreal gives
for free, what does not translate, the performance tiers on your machines, and VR. Bracketed tags
point into `SOURCES.md`; a tag marked *search* there is unverified until you open the page. Code here
is a sketch of shape and has not been compiled.

## 0. The shape

```
core/                         the sketch's core: C++20, CMake, no engine headers, its own tests
  │  C API (oc_*): the only seam. Versioned; frozen for the length of a wave
Plugins/OrbitSim/
  Source/ThirdParty/OrbitCore the core's headers and the static library CMake built (an External module)
  Source/OrbitSim             runtime: the subsystem that steps the core, the Snapshot, the Tape
  Source/OrbitSimEditor       editor only: mesh and material generators, commandlets, a dev MCP toolset
Source/<Game>/                runtime: game mode, pawns, HUD, the actors that draw the Snapshot
tools/blender/                mesh generators a background Blender runs
Content/Generated/            build output: made by the generators, never committed
```

The Core owns every number that moves. Unreal draws the Snapshot and turns the player's hands into
Commands. Nothing in Unreal is read back into the Core. This is the canon's L1 and ADR 001, and the
Booster Lander's rule, "precompute in, telemetry out, always" (R3).

## 1. In the engine's process, or beside it

| | in-process (recommended for the slice) | a separate process (Booster Lander's way, R3) |
|---|---|---|
| how | the core linked into the plugin as a static library, stepped on the game thread | the core runs as its own program and streams Snapshots over a local socket; Unreal is one more client |
| for | simplest; nothing to keep in step; the C API the page already uses | the View stays disposable; the web page and Unreal can watch the same run; a GPL core stays out of the game's binary (`LICENSING.md`, path B) |
| against | the core is in the game binary, so its licence must be compatible with Unreal's EULA (`LICENSING.md`) | a protocol to version, a second process to supervise, a frame of latency |

Either way, write the plugin against the Snapshot and the Commands (§2.5), not against the layout of
`oc_out`, so the choice can be changed later without touching the actors.

## 2. The seam

### 2.1 Build the core outside UnrealBuildTool

Build the core with CMake into a static library, and link that into an External module. Reasons:

- **Floating point.** Unreal's Development builds are reported to compile with `/fp:fast` [S15]. The
  sketch's state hash changes under fast-math and under FMA contraction, though every printed digit
  stays the same (`CANON_DELTA.md` §2.3, M5). Build the core with `/fp:precise` and no `/fp:contract`
  on MSVC, `-ffp-contract=off` on clang (Android).
- **One set of flags for every client.** The ctest suite, the Unreal plugin and a headless runner then
  link the same objects.
- **The precedent.** Your ASTRA-7 deep dive planned the same shape: a CMake library behind a C API,
  linked through the module's `Build.cs` (R2).

Match Unreal's C runtime: Unreal links the release DLL runtime (`/MD`) in every configuration unless a
target sets otherwise (known engine behaviour, not re-checked here), so build the core with
`CMAKE_MSVC_RUNTIME_LIBRARY=MultiThreadedDLL` in Debug too, and with the same MSVC as the engine
(§9). The External module, in shape:

```csharp
// Plugins/OrbitSim/Source/ThirdParty/OrbitCore/OrbitCore.Build.cs (sketch)
using System.IO;
using UnrealBuildTool;

public class OrbitCore : ModuleRules
{
    public OrbitCore(ReadOnlyTargetRules Target) : base(Target)
    {
        Type = ModuleType.External;
        PublicSystemIncludePaths.Add(Path.Combine(ModuleDirectory, "include"));
        if (Target.Platform == UnrealTargetPlatform.Win64)
            PublicAdditionalLibraries.Add(Path.Combine(ModuleDirectory, "lib", "Win64", "orbit_core.lib"));
        else if (Target.Platform == UnrealTargetPlatform.Android)
            PublicAdditionalLibraries.Add(Path.Combine(ModuleDirectory, "lib", "Android", "arm64-v8a", "liborbit_core.a"));
    }
}
```

The alternative, compiling the core's five `.cpp` files inside a UBT module, is simpler to set up but
puts the core under UBT's flags; if you choose it, check the hash in Development and Shipping both.

### 2.2 The subsystem: a fixed step inside a variable tick

`UOrbitSimSubsystem`, a `UTickableWorldSubsystem` created only for game worlds (PIE and the game, not
the editor's own world), owns the core. Each render frame it adds the frame's time to a debt, runs
whole steps, and drops debt past a cap rather than stretching a step (the page does the same, and so
does this repository's own clock: `CLAUDE.md` §2).

```cpp
// sketch: UOrbitSimSubsystem::Tick
void UOrbitSimSubsystem::Tick(float DeltaTime)
{
    ApplyAndTapeCommands(StepIndex);              // sampled once per frame, applied from this step on
    Debt += double(DeltaTime) * Warp;             // Warp 0..100; 0 is paused. No global time dilation
    int64 N = FMath::FloorToInt64(Debt / OC_DT);
    const int64 Cap = FMath::Max<int64>(5, FMath::CeilToInt64(Warp * 0.1 / OC_DT));
    if (N > Cap) { N = Cap; Debt = 0.0; }         // past the cap the debt is dropped, not run
    else Debt -= double(N) * OC_DT;
    if (N > 0)
    {
        if (N > 1) oc_step(int(N - 1));
        Previous = ReadSnapshot();                // one step before the newest, to draw between
        oc_step(1);
        Current = ReadSnapshot();
        StepIndex += N;
    }
    Alpha = Debt / OC_DT;                         // the View draws Lerp(Previous, Current, Alpha)
}
```

- The core never sees `DeltaTime`. It sees whole steps and Commands.
- Commands (`oc_controls`, `oc_auto`, `oc_sas` and the parts' own) are applied at a step index and
  written to the Tape with it.
- Nothing that feeds the core reads `FPlatformTime`, `FDateTime::Now` or `FMath::Rand`, and no actor the
  core owns has *Simulate Physics* on.
- The core is one per process today (`CANON_DELTA.md` §2.4). The subsystem claims it and refuses a
  second claim with an error on screen (two PIE clients, say), until the handle API exists.

### 2.3 Determinism in an engine that ticks as it likes

What can be promised, and the tests that hold it:

1. **The crew's flight does not depend on the frame rate.** Run the subsystem headless with frame times
   of 1/30, 1/60 and 1/144 s: one hash at 800 s, and the receipts of `CANON_DELTA.md` §1.
2. **A taped run replays to the same hash** on the same build, whatever the frame times were when it
   was recorded. The Tape holds the step index, so the replay does not care how frames fell.
3. **Across builds and platforms, the flight agrees to the printed digits, not to the bit**, until the
   core has its own maths functions (`CANON_DELTA.md` §2.3). Record the build's identity in each Tape.

Drawing between steps: interpolate positions in the site frame (doubles) and slerp attitudes, by
`Alpha`. At 120 Hz steps and a 144 Hz monitor the judder without it is visible.

### 2.4 The Tape

A text header (core version, build identity, the start's latitude, longitude and heading, the step
length) and one row per Command: the step index, the call, its arguments as the bits of their doubles
(hex), so a replay is exact. Every 60 simulated seconds a checkpoint row carries the state hash; a
replay that meets a different hash stops and says where (the canon's `E_REPLAY_DIVERGENCE`). This is
the canon's L4 in its smallest form; FlatBuffers and the hash chain (ADR 024) can come later.

### 2.5 The Snapshot

A `USTRUCT` mirror of the readouts: `oc_out`'s 54 doubles and each part's block (`oc_dock_out`,
`oc_return_out`, `oc_walk_out`), read after every step. As the page does (`core.js`, `addBlock`), refuse
loudly when the plugin and the core disagree on a block's length, and hold the field list equal to the
header with a test that parses `orbit_core.h` (the page's `core.test.mjs` does exactly this). Add to it,
in the core, what the View now computes itself: the ECI-to-site rotation, for the stars; and the step
index.

## 3. Part by part

| the sketch | the canon's module | in Unreal | kind |
|---|---|---|---|
| `core/orbit_core.cpp`: the atmosphere, the craft's forces, gear, RK4, the laws, the crew, the approach, the Ring's placing | `world`, `orbit`, `flight`, `guidance` | the core library, unchanged | static library |
| `core/return.cpp`, `core/dock.cpp`, `core/walk.cpp`, `core/sky.cpp` | `guidance`, `ring-dynamics`, `world` | the core library | static library |
| `OC_RING_*`, `OC_HUB_*` in `orbit_core.h` | `station.yaml` (ADR 007) | one header, read by the core, by the Ring's generators and by their tests | constants |
| `oc_reset`, `oc_controls`, `oc_auto`, `oc_sas` | `bus`: Commands | methods on the subsystem, called from C++ only | plugin |
| `oc_out` and the parts' blocks | `contracts/snapshot.fbs` | `FOrbitSnapshot` | plugin |
| `oc_hash` | `tape`'s verifier | the Tape's checkpoints | plugin |
| `tools/orbit_run.cpp` | CI's headless run | kept as the core's command-line tool; plus a commandlet for a headless run in the engine | tool |
| `test/*.cpp` | CI | ctest for the core; Unreal automation tests for the plugin and the View | tests |
| `main.js`: the fixed step, the debt cap, time warp, skipping to orbit | `kernel`'s clock | the subsystem (§2.2) | plugin |
| `main.js`: the camera at the origin, a far pass and a near pass | the View | **gone**: double-precision world positions and reversed-Z depth [S5] | engine |
| `main.js`, `cameraPose`: chase, cockpit, from the Ring | the View | camera components on the pawns; the cockpit eye 11.6 m forward and 1.85 m up in the body frame, as the page has it | actor |
| `frames.js`: site to drawing axes, line of sight | `units-frames` (the View's side) | a small C++ mapping library (§5) and Cesium's georeference | plugin |
| `earth.js`: the ray-cast globe, the land mask, single scattering | `view-unreal`, `planet-data`, `world` | Cesium's globe (§5) and the SkyAtmosphere component [S6, C1] | engine, plugin |
| `earth.js`, `Stars` | the View | a star sphere turned by the Snapshot's ECI-to-site rotation | actor |
| `ring.js`: the superstructure, painted textures, lights | `station-graph`, then the View | Geometry Script generators in the editor module, baked to Static Meshes [S12]; the Ring's spin from the Snapshot's axis and reference | editor generator, actor |
| `craft.js`: the lifting body, gear, bells, plumes | `asset-pipeline` | a Blender generator, imported as a Static Mesh; the plume a cone with a dynamic material, as on the page; Niagara later | Blender generator, actor |
| `hud.js` | the View (debug) | a C++ HUD drawing text on the canvas; the walls listed; Instruments later (`CANON_DELTA.md` §2.6) | actor |
| `input.js`: keys, gamepad, touch | the View: input to Commands | Enhanced Input, its actions and mapping contexts made in C++ | game module |
| `land.js`, `data/land.js` | `planet-data` | **gone**: imagery replaces the land mask | — |
| `features.js` and its hooks | the View's own structure | one actor or subsystem per part (sky, docking, the flight home, the walk); `owns` and `frame` (the walk drawing the whole frame) become possessing another pawn | game module |
| `tools/build.mjs`, the single-file page | — | **gone**: UBT, and UAT's BuildCookRun. The page stays as the fast debug client (R3) | — |
| `flight/web`'s KDFW drawing (`airport.js`, `airport-layout.js`, `kdfw.json`) | site detail (ADR 012) | a C++ generator reading `kdfw.json` (licence: `LICENSING.md`) | editor generator |

The canon's modules with no counterpart in the sketch, and where they would live:

| module | where |
|---|---|
| `kernel`, `units-frames`, `tape`, `bus`, `schemas`, `networks`, `ring-systems`, `shuttle-systems`, `ring-dynamics`, `station-graph`, `census`, `services` | in the Core library: no engine |
| `room`, `tiers`, `perception`, `memory`, `tally`, `director`, `guardian`, `bench`, `sculptor` | the mind kernel: its own process on the Bus (the canon's ADR 019 puts minds on a second machine); never in Unreal |
| `view-unreal` | the plugin and the game module |
| `planet-data` | offline tools that make 3D Tiles or quantized-mesh terrain from open elevation data, for Cesium (§4) |
| `asset-pipeline` | the generators, an asset manifest in JSON, and its validator |
| `rigs` | the visual precision rig as an Unreal level that measures (the horizon's dip, the Ring's angular size); the audio rig as an ASTRA_AUDIO-style project of text only (R1) |
| `dev-mcp` | an editor-only Unreal MCP toolset that exposes the Core's Commands and the Snapshot to agents (UE 5.8 registers toolsets through its ToolsetRegistry, and Epic's `create-toolset` skill covers writing one) [E1, E2]; never in a packaged build |
| `build-gates` | scripts in `tools/`, run before every merge |

## 4. What Unreal gives for free, and what each costs against the canon

| the sketch built | Unreal gives | the catch |
|---|---|---|
| a camera at the origin and two depth passes, so a centimetre at the wheels and the Earth's disc both have depth | **Large World Coordinates**: double-precision positions by default, with a default world about 88 million km across [S5] | none for drawing. For engine physics far from the origin (a walk in the Ring, thousands of kilometres from DFW), use the core's walk, not Unreal's (the walk's row below) |
| a single-scattering sky ray-cast per pixel, from the runway to orbit | **SkyAtmosphere**: ground, aerial and space views on a spherical planet [S6] | its planet is a sphere: set its radius to the core's 6,371 km. The fast sky LUT shows artefacts at the Earth's shadow from space [S6]: turn it off for space views. Its Sun must be the Snapshot's, not a clock of its own |
| clouds painted on the ground from above | **Volumetric Clouds**, ray-marched, meant to go from ground to space [S6] | expensive; their ambient light from space is not spatialised [S6]. Cloudy imagery is cheaper for the slice |
| Natural Earth's coastlines on a sphere, land coloured by latitude | **Cesium for Unreal** v2.31.0, which supports UE 5.6 to 5.8 [C1], Apache 2.0 [C3]: a streamed globe, 3D Tiles, terrain, imagery overlays | its free data cannot be stored for offline use [C4, C5], and the canon is offline (L12). The slice's answer: a globe made from the ellipsoid itself, with public-domain imagery tiled locally and loaded from `file:///` [C1] (§5). Terrain later from open elevation data through your own tiler (cesium-terrain-builder's quantized-mesh with a `layer.json`) [C6] |
| (the walk is being built) | **the Character Movement Component with a custom gravity direction**, since 5.4 [S7] | it moves the person, so the engine owns state (against L1); and it knows no Coriolis, so a 2 m drop lands on the plumb point instead of 3.8 cm off it, and running spinward weighs nothing more. Use the core's walk and drive a kinematic pawn; keep the component for crowds and animation later (Mover, its successor, is still Experimental in 5.8 [S13]) |
| (sound is being built) | **MetaSounds**, with a Builder API that makes graphs at runtime from C++ [S8] | none for text-as-source: your ASTRA_AUDIO built its whole graph that way on 5.7 with no assets (R1). Custom DSP nodes need `METASOUND_PLUGIN` and `METASOUND_MODULE` defined in their module, or the editor crashes at startup (R1) |
| keys, a gamepad, a touch stick | **Enhanced Input** | actions and mapping contexts are assets by default; make them in C++ at startup to keep them text. The same mapping then takes OpenXR controllers |
| the Ring's lights as coloured points | **MegaLights**, production-ready in 5.8 [S1]; **Lumen**, and Lumen Lite in 5.8 [S1]; **Nanite** | the deferred renderer only: not in a forward-shaded VR build, not on Quest [S11]. The Ring's meshes are large and simple, and the Shuttle a few thousand triangles: Nanite pays only when the city comes |
| a plume of two additive cones | **Niagara** | its systems are assets; keep the cones for the slice |
| the page's tests under node | **automation and functional tests**, run headless from the command line; **commandlets**; **Live Coding** | none |
| agents drove the page through `window.orbitSketch` | **the editor's own MCP server**, Experimental in 5.8 [E1, S1, S3] | see `FIRST_SLICE.md` §3 and the template's rules: it can do a great deal, including run arbitrary Python in the editor [E1] |

## 5. Frames, units and the Earth's shape

- **Unreal:** centimetres, left-handed, Z up. At Cesium's georeference the axes are East-South-Up: +X
  east, +Y south, +Z up [C2].
- **The core:** metres; the site frame is east-north-up, right-handed, at the start point (KDFW 17C's
  end, 32.91569901 N, 97.02600098 W, the runway's true heading 180.3°), turning with the Earth; the
  body is x forward, y right, z down.
- **Positions:** put the georeference at the start point, height 0. Then a site point (E, N, U) in
  metres is the Unreal point (100 E, −100 N, 100 U).
- **Attitudes:** the core's quaternion takes body to site. An actor built X forward, Y right, Z up has
  the rotation R_actor = M_w · R(q) · M_b, with M_w = diag(1, −1, 1) and M_b = diag(1, 1, −1): two
  mirrors, so a proper rotation. Test it, do not trust it: at three attitudes, the mesh's nose, right
  wing and belly point where the core's body axes say.
- **The Ring:** its centre, axis and reference vector come in site axes; the same mapping, and the same
  kind of test against the generator's local axes, which the asset manifest records.
- **The Earth's shape.** The core flies on a sphere of 6,371 km; Cesium draws WGS-84 by default,
  860 m higher at DFW's latitude (`CANON_DELTA.md` §2.2). For the slice, make them the same Earth:
  give the georeference a `CesiumEllipsoid` with all three radii 6,371,000 m (non-WGS-84 ellipsoids
  since v2.7.0 [C1]), use a tileset made *From Ellipsoid* (a globe with no terrain, since v2.11.0
  [C1]), and drape public-domain imagery over it (NASA's Blue Marble, tiled locally with GDAL). Then
  the drawn Earth is the simulated one, exactly, and offline. Real terrain needs the core on WGS-84
  first, with one terrain query that physics and picture share (`contracts/terrain_query.h`).
- **The sky:** SkyAtmosphere's planet 6,371 km in radius, centred 637,100,000 cm below the
  georeference origin; the Sun's direction from the Snapshot, mapped as directions (M_w only).
- **The origin:** no rebasing is needed to draw (Cesium removed its own rebasing options as "not
  usually necessary with Unreal Engine 5's double-precision coordinates" [C1]). `CesiumOriginShiftComponent`
  exists [C1] if an engine feature misbehaves far from DFW.
- **Inside the Ring:** the canon puts the player's frame at the View's origin and turns the universe
  round it (§3.3). For the slice's 100 m walk, the simpler way is enough: draw the Ring where it is,
  turning, with the camera riding the core's walker. Nothing physical spins in the engine, which is
  what the canon forbids. The canon's way can come with crowds.

## 6. What does not translate

- One file that runs from `file://` on any phone, and its plain-JavaScript fallback. An Unreal build is
  a per-platform binary of gigabytes.
- Textures painted by code on a canvas: in Unreal they become material maths or generated textures.
- The DOM HUD, the touch stick and throttle.
- The globe's per-pixel roundness: Cesium's globe is tiles, round as far as their density allows. From
  the runway the field is flat in both.
- `?at=775` becomes a command-line option (say `-OrbitAt=775`).
- A rebuild in a second: UBT takes minutes; Live Coding helps for function bodies.
- **What stays:** the web page. It is the fast view an agent can drive and you can open on a phone. Keep
  it fed by the same core: "we add clients", never a migration (R3).

## 7. Performance tiers on your machines

Your reference machine, from subsim's sub:D113 and abacus: an RTX 4070 Ti SUPER (16 GB), an i9-9900K
(8 cores, 16 threads), 64 GB of DDR4 (R4). The laptop's GPU is not written anywhere this kit read:
measure it before giving it a tier. Every frame time below is a target, not a measurement.

| tier | where | renderer and features | target |
|---|---|---|---|
| Desk | the desktop at 1440p | deferred; Lumen, hardware ray tracing on the 4070 Ti SUPER; MegaLights for the Ring's lights; virtual shadow maps; volumetric clouds; Cesium at its default detail | 60 fps (the canon's §9.1) |
| Desk-Lite | the desktop at 4K, or the laptop | deferred; Lumen Lite [S1]; fewer cloud samples; TSR upscaling | 60 fps |
| PCVR | the desktop driving a Quest over Link or Air Link | forward shading, MSAA 4×; no Lumen, Nanite or MegaLights [S11]; SkyAtmosphere; simple or baked light inside the Ring; instanced stereo | 72 or 90 Hz: 13.9 or 11.1 ms |
| Quest | the headset alone | the mobile forward renderer on Vulkan, MSAA 4×, Mobile HDR off; Cesium's mobile atmosphere (`EnableMobileRendering`) [C7] | 72 Hz |

The Core costs nothing at these rates: about 5 µs a frame at 240 Hz (`CANON_DELTA.md` §1). The canon
wants a query that says what the machine can hold (§10): Unreal's scalability groups and its hardware
benchmark at first launch, with a command-line override.

## 8. VR: PCVR first, Quest later

**PCVR (wave 3 of the slice).** Epic's OpenXR plugin, which Meta recommends as the backend [S10]; the
Meta XR plugin only for Meta-specific features, and carefully: Meta's own tracker says its plugins
claim 5.8 but were built for 5.7.0 [S10]. The desktop renders; Link or Air Link carries it. A seated
cockpit: the headset's pose added to the cockpit eye. The HUD on a panel in the world, built in C++.
Controllers through the same Enhanced Input mapping. Comfort: the cockpit is a steady frame, so the
vehicle's own motion is tolerable; the spin-matched docking turns the universe outside the window at
2.54°/s; fade out above some time warp; snap turns in the walk.

**Quest standalone (its own wave, after PCVR is comfortable).** What it costs:

1. A second renderer: every part of the View needs a mobile-forward fallback, with no Lumen, Nanite,
   MegaLights or volumetric clouds, and few dynamic lights [S11].
2. The Android toolchain pinned to 5.8. Epic and Meta disagree on the NDK (r27c and 25.1) [S9]: follow
   the engine's own Android settings and its Turnkey checks rather than either page.
3. The core cross-compiled for arm64 with `-ffp-contract=off` (ARM compilers fuse multiply-adds by
   default), and its hash recorded per platform (`CANON_DELTA.md` §2.3).
4. Cesium on Quest 3: users report artefacts and black tiles in standalone that do not happen over
   Link [C7]. Try it in the first week of that wave, not the last.
5. 72 Hz on a phone-class GPU: the Ring's interior light baked or simple.
6. Packaging and side-loading, which you have done before for the Inspection Simulator.

## 9. Pins and traps

| what | pin or trap | source |
|---|---|---|
| Unreal Engine | 5.8.x, the newest hotfix (5.8.4 shipped 20 October 2026). 5.8 is the last UE5 release; UE6 early access is reported for the end of 2027, with Actors and Blueprints to be deprecated in favour of Verse and Scene Graph | S1, S2, S17 |
| MSVC and the Windows SDK | read `Engine\Config\Windows\Windows_SDK.json` in your install: 14.44 with VS 2022 (or 14.50 with VS 2026, which users report trouble with), SDK 10.0.22621.0, .NET 8. UE 5.7 refused MSVC 14.40 to 14.43 outright | S14, R1 |
| the Fab plugin | 0.0.22 breaks every C++ build on launcher engines with a `FabToolset` RulesError; uninstall or disable Fab until it is fixed | S18 |
| the MCP plugin | Experimental; the server is off until started; a cook is reported to fail while an editor with the plugin runs, so close the editor before cooking | E1, E3, S4 |
| Geometry Script | generate in the editor and bake to Static Meshes; mesh writes are reported to crash in packaged 5.8.3 builds | S12 |
| MetaSound nodes | define `METASOUND_PLUGIN` and `METASOUND_MODULE` in the module's `Build.cs` | R1 |
| floating point | the core outside UBT, precise, no contraction | S15, M5 |
| Cesium for Unreal | v2.31.0, for UE 5.6 to 5.8 | C1 |
| Blender | 5.3.0 (10 November 2026) or 5.2 LTS; the Blender Lab MCP add-on needs 5.1 or newer | B1, B2, B4 |
| Claude Code on Windows | native, with Git for Windows for the Bash tool; without it, the PowerShell tool | A2 |
