# The first slice: a demo with most of it walled off

The smallest Unreal build in which you sit in the Shuttle on KDFW 17C, take off, reach orbit, see the
Ring, dock, and walk 100 m inside it. Everything else is walled off, and every wall says so. The order
is your wave style: contracts first, a walking skeleton, parallel packets with owner directories,
mechanical gates, and the points where you look. Tags point into `SOURCES.md`.

## 1. What you can do in it

1. Sit in the cockpit on 17C, brakes on, the HUD's lines as the page has them.
2. Take off by hand, or press the crew key and watch them do it. Hand over either way at any time.
3. Climb to orbit: 12½ minutes, or faster with time warp up to 100×, or skip ahead.
4. See the Ring 25 km ahead; let the crew fly the approach to the hold point 300 m off the hub.
5. Dock: the crew matches the hub's 2.54°/s of roll and closes (from the docking part, `CANON_DELTA.md`
   §4.1).
6. Go aboard and walk 100 m along the floor in the Ring's turning frame (from the walk part, §4.2), to a
   barrier.

**The walls**, each of which speaks when reached:

| walled off | what you meet |
|---|---|
| the flight home | the key says "Not built: the flight home". The core flies it already (`CANON_DELTA.md` §4.3); the View's entry, glide and landing are a later wave |
| the flight deck | the key says "Not built: the flight deck". The core lands on it already (§4.8); its View (the pads, the swivel, the deck's ILS, the chase view riding the deck) comes after the walk. The deck is a vacuum sector behind bulkheads: the owner's open Ring (`OPEN_RING_AIR.md`) is not in the slice |
| the Ring past 100 m | a glazed barrier across the floor; the HUD line: "Not built: the city" |
| the rest of KDFW and every other field | 17C alone is drawn; elsewhere is the bare globe |
| TALLY, Residents, the arrivals hall | absent; the help panel lists them as not built |
| failures, weather, terrain | none; listed in the help panel |
| Quest without a PC | its own wave (4), after PCVR |

## 2. What it is built from

- **The core:** the sketch at 599e051, with every part built: docking, the walk, the flight home, the
  Sun and the Moon, the flight deck (`CANON_DELTA.md` §4); the exact commit goes in `PROVENANCE.md`.
  Each part has its header, its readout block and its tests (`orbit_dock.h`, `orbit_walk.h`,
  `orbit_return.h`, `orbit_deck.h`, `orbit_sky.h`), so the View's packets are written against contracts
  whose code already exists and is tested. The Ring's size comes from `OC_RING_*`, which become
  `station.yaml`: the generators read it rather than bake 5 km in, since the open-Ring idea would make it
  1,000 km (`OPEN_RING_AIR.md`).
- **Engine and tools:** Unreal Engine 5.8.x (5.8.4); Cesium for Unreal 2.31; Blender 5.3 (or 5.2 LTS)
  with Blender Lab's MCP server 1.0.3; Unreal's own MCP server (Experimental); Claude Code on Windows
  with Git for Windows. Pins and traps: `UNREAL_PORT.md` §9.
- **Data:** KDFW 17C from `flight/web/data/kdfw.json` (yours; its numbers from public-domain sources,
  `docs/provenance.md` §1f); public-domain imagery for the globe (NASA's Blue Marble; confirm the
  product's terms when you download it). Nothing from Cesium ion or Google in the build [C4, C5].
- **The licence decision first:** wave 0 stops before copying the core into the new repository until
  `LICENSING.md`'s question is answered.

## 3. How the harness uses MCP here

**Unreal.** Enable the `ModelContextProtocol` and `AllToolsets` plugins in the `.uproject` (without
`AllToolsets` the server exposes no tools) [E1, E3]. The server is off until started; to start it with
the editor, put `bAutoStartServer=True` under `[/Script/ModelContextProtocolEngine.ModelContextProtocolSettings]`
in `Saved/Config/WindowsEditor/EditorPerProjectUserSettings.ini`, which is per-user and not committed,
or pass `-ModelContextProtocolStartServer` [E3]. Give every worktree its own `ServerPortNumber`
(8100, 8101, ...) and its own `.mcp.json`, made by `ModelContextProtocol.GenerateClientConfig
ClaudeCode` [E3]. Tools are found, not memorised: `list_toolsets`, then `describe_toolset`, then
`call_tool` [E2]. The first session writes the toolset and tool names it uses into
`tools/mcp/TOOLSETS.md`, so the repository holds them as text.

What Unreal's MCP is for in this slice:

| use | how |
|---|---|
| look | viewport screenshots at the waypoints of §7, the output log, actor lists |
| try | spawn the slice's actors into a scratch level and set their properties, to find what the generators should make |
| import | bring the generators' glTF into `Content/Generated` (or let a commandlet do it) |
| compile | `LiveCodingToolset.CompileLiveCoding` after a C++ edit; it waits for the compile and returns MSVC's messages [E2] |
| test | run the automation tests and read their results |

What it is not for: anything that must exist the next time (write a generator); anything long (cooking
and packaging go through UAT from the shell, and Claude Code moves a call past two minutes to the
background and needs an HTTP server's first byte within 60 s [A1]); Blueprint graphs (the house rule).
Save before any bulk change and serialise changes that touch the same thing: the server accepts
concurrent requests and does not keep their order [E2].

**Blender.** Blender Lab's server [B1]: an MCP server on stdio, talking over a local socket to an
add-on inside Blender 5.1 or newer. Generators are committed Python files run in a background Blender
with `execute_blender_code_for_cli`; `get_objects_summary` and `get_object_detail_summary` check names
and dimensions; `render_thumbnail_to_path` gives a look. The same file must also run without MCP:
`blender --background --factory-startup --python tools/blender/shuttle.py -- --out <file>.glb`. No
cloud model generators (the canon's L12: nothing rented, nothing outbound).

## 4. Who makes which asset

Hero and organic shapes come from Blender, kits from code (the canon's ADR 022); all from text in the
repository; their outputs are build products in `Content/Generated/`, listed in an asset manifest
with the generator, its version and a hash.

| asset | made by | from | checked by |
|---|---|---|---|
| the Shuttle: lifting body, wing, fins, two bells, gear legs and wheels, a cockpit window frame | Blender, `tools/blender/shuttle.py` | `craft.js`'s shape, rewritten: the fuselage's `section()` over 40 stations and 32 points round; the wing and fins as slabs; 32 m from nose to tail, about 34 m with the bells, 18 m across; tiles below by facing | Blender MCP reports the bounding box; an automation test in Unreal: the wheels' lowest points within 2 cm of the core's gear contacts, body (10, 0, 3) and (−3, ±3.5, 3) m |
| the Ring: floor, roof glazing and lattice, hull, rim walls, six spokes and their lift tubes, the hub, its collar, the port | Geometry Script in C++, in the editor module, baked to Static Meshes [S12] | `OC_RING_*` and `OC_HUB_*` from `orbit_core.h`: one source for the core, the generator and the test | an automation test: each mesh's bounds against the header within 1 cm; a screenshot from 25 km and from the hold point |
| the 100 m inside: a floor patch, its path, two walls, the barrier and its sign, a few lamps | Geometry Script | the walk's own numbers (its header) | the core's walker reaches the barrier after 100 m along the floor, and no further |
| runway 17C/35C: 13,400 × 150 ft, threshold, centreline and edge markings, edge lights | a C++ generator | `kdfw.json` | the start point lies on the centreline at the 17C end; a cockpit screenshot at t = 0 |
| the Earth | Cesium actors spawned in C++ at startup: a georeference on a 6,371 km sphere, a *From Ellipsoid* tileset, a local imagery overlay from `file:///` [C1] | a tiling step in `tools/` (GDAL's `gdal2tiles` over the imagery) | a screenshot at 500 km with a known field of view: the horizon dips 22.0° (acos(6,371 / 6,871)); Texas under the craft at t = 0 |
| the sky, the Moon and the stars | SkyAtmosphere and a directional light; the real stars as the page has them (`orbit/web/data/stars.js`, CC0); the Moon a lit sphere | the Snapshot's Sun, Moon and the sky's J2000.0 axes (`oc_sky_out`, `UNREAL_PORT.md` §2.5) | a star stays still against the Ring's axis, which is fixed among the stars; Orion where Orion is on 12 November 2026 |
| materials: tiles, glass, metal, lights, runway paint | a C++ commandlet using Unreal's material-editing library | its own source | run twice headless, the same parameters both times |
| sound (wave 2) | MetaSounds built at runtime by the Builder API [S8], ASTRA_AUDIO's way (R1) | the drives the sound part names (§4.6 of the delta) | a WAV of a scripted ascent: loudness rises with throttle; then your ear |
| input actions and mapping contexts | C++ at startup | the page's key and pad table | an automation test presses keys and finds the Commands on the Tape |

## 5. The order

### Wave 0: the lead alone

One session, the coordinator. It decides, scaffolds, freezes the contracts, builds the walking
skeleton and writes wave 1's packets. It writes no View feature itself.

| step | does | checked by |
|---|---|---|
| W0.1 | reads the machine, changing nothing: the engine's path and `Windows_SDK.json`, MSVC, the Windows SDK, CMake, Git for Windows, Node, Blender's version | a table in the session's log; anything missing is asked about, not installed |
| W0.2 | scaffolds the repository as text: `CLAUDE.md` from the template, `README.md`, `DECISIONS.md`, `FICTION.md`, `PROVENANCE.md`, `.gitignore` (Binaries, Intermediate, Saved, DerivedDataCache, `Content/Generated`, `build/`), `.gitattributes` | your word before the first commit |
| W0.3 | **after your licence decision**: imports the kit's `orbit/` as `core/` and builds it with MSVC (`/fp:precise`, `/MD`, C++20) | `ctest` green, 120 of 120; `orbit_run 10 800` prints the rows of `CANON_DELTA.md` §1 (orbit at 753 s, 500.4 × 499.7 km, 32.84°, 4,389 kg, 36,568 Pa, 2.09 g); the hash it prints, `ea7847fe` on Linux at 599e051, is recorded beside the Windows build's as its baseline |
| W0.4 | freezes contracts 0.1: the C API as it is (the parts' stub headers included), the Snapshot's field list, the frame mapping (`UNREAL_PORT.md` §5), the Command table, the asset manifest's schema | a test that parses the headers and the Snapshot struct and holds them equal |
| W0.5 | writes the project as text: `.uproject`, `Config/*.ini`, the game module and targets, `Plugins/OrbitSim` (the External module, the runtime module with the subsystem and the Tape) | UBT builds `<Game>Editor Win64 Development` clean |
| W0.6 | the walking skeleton: the game mode spawns an engine cube driven by the Snapshot, a chase camera, the HUD's first three lines, time warp | in the editor, a screenshot at t = 0, 60 s and 753 s: the cube on the field, climbing, in orbit |
| W0.7 | automation tests: the crew's flight at frame times of 1/30, 1/60 and 1/144 s gives one hash; a taped hand-flown take-off replays to the same hash; the frame mapping at three attitudes; no `.uasset` or `.umap` in git outside an allow-list | all run headless and pass |
| W0.8 | the gate script (§6) with a negative control for each gate | each gate is shown able to fail |
| W0.9 | wave 1's packets and the board | every packet names its owner directories, contract version, checks and dependencies |

**Wave 0's exit:** the gates green, and **you see a cube leave 17C and reach orbit**.

### Wave 1: the View, in parallel

Each packet is one worker in its own worktree; those that need the editor get their own port. Test
and implementation by different agents where there is an oracle (the Tape, the mapping); screenshot
checks for the rest, reviewed by someone other than the author.

| packet | owner directories | makes | depends on |
|---|---|---|---|
| P-1-01 Earth and sky | `Source/<Game>/Earth/`, `tools/tiles/` | the Cesium globe on the sphere, the imagery tiles, SkyAtmosphere, the Sun and the stars from the Snapshot | W0 |
| P-1-02 the Shuttle | `tools/blender/`, `Source/<Game>/Shuttle/` | the Blender generator, its import, the actor with its plume cones and gear | W0 |
| P-1-03 the Ring kit | `Plugins/OrbitSim/Source/OrbitSimEditor/Ring/`, `Source/<Game>/Ring/` | the Ring's generators, baked meshes, the actor turning with the Snapshot | W0 |
| P-1-04 KDFW 17C | `Plugins/OrbitSim/Source/OrbitSimEditor/Airfield/`, `Source/<Game>/Airfield/` | the runway generator and its actor | W0 |
| P-1-05 input, cameras and HUD | `Source/<Game>/Pilot/` | Enhanced Input in C++, the pawn, the three cameras, the C++ HUD with the walls in its help panel | W0 |
| P-1-06 materials | `Plugins/OrbitSim/Source/OrbitSimEditor/Materials/` | the material commandlet and the master materials | W0 |

**Exit:** you see the Shuttle on 17C under a real sky, the Earth from orbit, and the Ring from 25 km.

### Wave 2: docking, the walk, sound, tiers

| packet | makes | depends on |
|---|---|---|
| P-2-01 docking | docking's View, the core having it (§4.1): the port's target turning with the hub, the probe, the cockpit's reticle, the capture and its sounds | P-1-03 |
| P-2-02 the walk | the 100 m patch, a kinematic first-person pawn ridden by the core's walker (§4.2), the barrier | P-1-03 |
| P-2-03 sound | MetaSounds by the Builder API: the drive's rumble with throttle and dynamic pressure, the thrusters' hiss, the dock's clunk, the Ring's hum | the sound part (§4.6) |
| P-2-04 tiers | the Desk, Desk-Lite and PCVR presets as config (`UNREAL_PORT.md` §7), and frame times at the waypoints | P-1-01 to P-1-03 |
| P-2-05 dev MCP toolset | an editor-only toolset: step the core, read the Snapshot, set a Command, record and replay a Tape (the canon's `dev-mcp`) | W0 |
| P-2-06 the tour | the sketch's tour (`web/src/tour-plan.js`, its stages pure and tested) as a director subsystem: the slice's path flown by the crew through the same Commands the player gives, with a caption, a time warp and a view for each stage; any input ends it | P-2-01, P-2-02 |

**Exit:** you dock, go aboard, walk 100 m and meet the barrier; and the tour flies that path with no
hands on the controls.

### Wave 3: PCVR

P-3-01: the seated VR pawn, the world-space HUD, controllers, comfort settings (`UNREAL_PORT.md` §8).
**Exit:** the whole path in a headset over Link, at 72 Hz or better on the reference machine.

### Wave 4, later: Quest standalone

Its own wave, with its own exit, once PCVR is comfortable (`UNREAL_PORT.md` §8 lists what it costs).

## 6. Gates

After subsim's (R4), cut to what this slice needs. A worker's "done" is not acceptance.

| gate | checks |
|---|---|
| G0 | one worker per packet, claimed on the board |
| G1 | builds from clean: the core with CMake (Debug and Release), the game with UBT (Development Editor, Development Game); warnings as errors in the core |
| G2 | the diff touches only the packet's owner directories |
| G3 | the contracts' hash is unchanged |
| G4 | the core's ctest and the packet's automation tests pass, run headless |
| G5 | determinism: the crew's flight at three frame rates gives one hash; a taped run replays to the same hash |
| G6 | text is source: no `.uasset` or `.umap` in git outside the allow-list; every generated asset in the manifest; regenerating changes nothing |
| G7 | budget: frame times at the waypoints on the reference machine, for the packet's tier |
| G8 | the screenshots at §7's waypoints, looked at by someone other than the author |
| G9 | an independent reviewer with one lens: the canon's laws, numerics, or licences |

Every gate has a negative control: a planted `/fp:fast`, a planted `.uasset`, a planted change outside
the owner directories must each fail.

## 7. Exit tests for the slice

**Mechanical,** all headless and in the gate script:

1. The core's ctest green on Windows; `orbit_run` matches the receipts' printed digits.
2. The crew's flight under the subsystem at 1/30, 1/60 and 1/144 s frame times: one hash, and the
   receipts of `CANON_DELTA.md` §1.
3. A taped hand-flown take-off and climb replays to the same hash.
4. The crew docks: the docked flag set, the spin matched within docking's 0.30°/s (the crew's reads
   0.00000°/s at the touch, `dock.capture_inside_tolerances`).
5. The walker goes 100 m along the floor and stops at the barrier.
6. The frame mapping test, the mesh-bounds tests, the no-binary-source test.
7. `BuildCookRun` packages a Win64 Development build, with the editor closed [S4], and the packaged
   game starts and reaches orbit under the crew with no input; from wave 2, the tour flies the slice's
   whole path in it with no input.

**Waypoints** for screenshots, in every build and tier: on 17C at t = 0; 2 km up; 40 km up; in orbit
with the Ring ahead; at the hold point; docked; 50 m into the walk; at the barrier.

**What you look for:** whether the take-off feels like the page's, whether the Earth from orbit is
right, whether the Ring's size reads, whether docking is legible, and the canon's slice-2 question,
asked early: whether you want to stay in the room.

**Budgets:** 60 fps at 1440p on the reference machine in the Desk tier at every waypoint; 72 Hz in
PCVR (wave 3).

## 8. The step list for the local harness

Commands for wave 0, run from the repository's root in PowerShell. `<UE>` is the engine's folder (for
a launcher install, `C:\Program Files\Epic Games\UE_5.8`); `<Game>` the project's name; paths absolute
where UBT wants them. Flags are standard for these tools; confirm any that the engine refuses with its
own `-help`.

1. Read the toolchain: `Get-Content "<UE>\Engine\Config\Windows\Windows_SDK.json"`; `cmake --version`;
   `git --version`; `node --version`; `blender --version`. Check: the versions agree with
   `UNREAL_PORT.md` §9, or the difference is written down.
2. Build and test the core:
   `cmake -S core -B build/core -G "Visual Studio 17 2022" -A x64 -DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreadedDLL`,
   then `cmake --build build/core --config Release`, then
   `ctest --test-dir build/core -C Release --output-on-failure`. Check: 120 of 120. Then
   `build/core/Release/orbit_run.exe 10 800`. Check: the rows of `CANON_DELTA.md` §1; record the hash
   beside Linux's `ea7847fe`.
3. Copy the library and headers into `Plugins/OrbitSim/Source/ThirdParty/OrbitCore/` (a script, not by
   hand). Check: the script refuses a library older than its sources.
4. Build the game:
   `& "<UE>\Engine\Build\BatchFiles\Build.bat" <Game>Editor Win64 Development -Project="<abs>\<Game>.uproject" -WaitMutex`
   (the form your ASTRA_AUDIO uses, R1). Check: `Result: Succeeded`.
5. Open the editor, start the MCP server (§3), generate `.mcp.json`, and from Claude Code call
   `list_toolsets`. Check: the toolsets are listed; write the ones used to `tools/mcp/TOOLSETS.md`.
6. Play in the editor; take the three screenshots of W0.6 through MCP. Check: the cube is on the field,
   climbing, in orbit.
7. Run the automation tests headless:
   `& "<UE>\Engine\Binaries\Win64\UnrealEditor-Cmd.exe" "<abs>\<Game>.uproject" -ExecCmds="Automation RunTests OrbitSim; Quit" -unattended -nullrhi -nosplash -NoSound -log`.
   Check: every test passes and the log says how many ran (zero tests is a failure).
8. Package, with the editor closed:
   `& "<UE>\Engine\Build\BatchFiles\RunUAT.bat" BuildCookRun -project="<abs>\<Game>.uproject" -platform=Win64 -clientconfig=Development -build -cook -stage -pak -archive -archivedirectory="<abs>\build\package" -unattended`.
   Check: the packaged game starts and the crew reaches orbit.

## 9. Risks, and what to do instead

| risk | instead |
|---|---|
| Unreal's MCP misbehaves (it is Experimental; users report missing readiness checks and a cancellation bug [S3]) | C++, commandlets and command-line screenshots (`HighResShot`) carry the same work; MCP is a convenience, never the only way |
| Geometry Script crashes a packaged build [S12] | it never runs in one: generate in the editor, bake, ship Static Meshes |
| the offline imagery fails to load | the bare ellipsoid with a plain material, and a wall: "Not built: imagery" |
| the Meta XR plugin's 5.8 build [S10] | Epic's OpenXR alone |
| the Ring's scale changes (the open Ring, `OPEN_RING_AIR.md`) | the generators take the radius from `station.yaml`; a 1,000 km Ring is another wave, with streaming, not a regeneration |
| the licence is undecided | wave 0 stops at W0.2; everything after W0.3 waits |
