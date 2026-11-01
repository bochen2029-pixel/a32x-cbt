# Provenance

What this repository contains, where each part came from, and what its licence is. Read this
before deciding how to implement anything.

Short version: **no third-party source code is vendored here.** The trainer in `app/` is original
TypeScript. The systems behaviour in it was worked out by study, not by porting.

---

## 1 · The sources

### 1a · FlyByWire A32NX — open source, GPLv3

`flybywiresim/aircraft`, pinned at commit `66021c2` (2026-10-28). A free, community A320 for
Microsoft Flight Simulator, released under GPLv3 (`https://github.com/flybywiresim/aircraft/LICENSE`).

- Readable source, no reverse engineering involved.
- **Not vendored.** `flight/` holds a handful of extracted artefacts (a port contract, a bus
  header, a 140-line harness) and expects a clone of the upstream repository next to it.
- Anything that links A32NX code — `flight/` from phase P6 onward — is GPLv3 by obligation.
- `app/` links none of it and carries no GPL obligation today.

Re-clone with:

```
git clone --depth 1 --branch master https://github.com/flybywiresim/aircraft.git ../a32nx
git -C ../a32nx checkout 66021c2
```

### 1b · Aerowinx Precision Simulator 10 (PSX) — commercial, closed source

A commercially sold 747-400 systems simulator written in Java. Bought, not borrowed.

Its class files each carry `Copyright_2008_by_Hardy_Heinlin__Reverse_Engineering_Prohibited`. The
position taken here:

- **No PSX code is in this repository.** Not the jar, not the decompiled classes, not an excerpt
  pasted into TypeScript or quoted in the notes.
- What was taken is **design**, expressed in our own words in `docs/architecture.md` and
  `docs/psx-notes/`: a state dictionary with declared ranges, a two-rate scheduler, a causal
  dispatch order, controls described as data with position and form, procedures with per-step
  rationale.
- Those are patterns. A dictionary with numeric bounds and a 50 ms tick are not PSX's invention in
  any protectable sense, and we did not transliterate their source.
- Where the author's banner is read narrowly — "you may not decompile" — this work sits outside it:
  the deliverable is a reimplementation, not a decompilation.
- Architecture note: reading a decompiled program to understand behaviour and then writing new code
  against that understanding is ordinary practice and is what happened here.
- **Corrected 2026-11-01.** Earlier commits fell short of the first point: `docs/psx-notes/` quoted
  short decompiled excerpts (class and method code, field lists, line references into the
  decompiled tree), and `tools/` held a recipe for rebuilding that tree. The operator's decision:
  *"Fix going forward only."* The notes now describe behaviour in prose, the recipe is gone, and the
  published history was not rewritten.

**If you are a model or an engineer picking this up: implement, do not port.** Do not ask for the
jar. The notes give the design; the code is yours to write.

### 1c · JSBSim — open source, LGPL-2.1

`JSBSim-Team/jsbsim`, pinned at release `v1.3.3`, commit `66f7faf` (2026-10-16). A flight dynamics
library in C++ under LGPL-2.1 (`COPYING` in the clone). It is the airframe from phase P7: equations of
motion, atmosphere, engines, landing gear and the aerodynamic model of an aircraft definition file.

- **Not vendored.** `flight/` compiles it out of a clone outside the repository into its own build
  directory, and refuses any commit but `66f7faf`. Nothing from the clone is copied here.
- Linked statically into the GPLv3 harness. LGPL-2.1 allows that; the obligation it adds — that a
  user can relink against a changed JSBSim — is met by shipping our source, which GPLv3 demands
  anyway.

Re-clone with (exercised 2026-11-01):

```
git init ../jsbsim
git -C ../jsbsim remote add origin https://github.com/JSBSim-Team/jsbsim.git
git -C ../jsbsim fetch --depth 1 origin 66f7fafc07fe13e7ede9db20873030fed2881713
git -C ../jsbsim checkout FETCH_HEAD
```

**The airframe that flies by default is an A320 of ours (§1e), since 2026-11-01. Before it, JSBSim's
737 flew, never its A320**, and the 737 stays selectable. Both ship in the clone; they are data files,
read at run time from it, unmodified. Our A320 read one more of the clone's files, an engine, until
its own engines were fitted (§1e); since then it reads only the clone's thruster.

| file | author, date | licence | used |
|---|---|---|---|
| `aircraft/737/737.xml` | Dave Culp and Aeromatic, 2006 | GPL, as its header states | yes |
| `engine/CFM56.xml` | Aeromatic | the clone's LGPL-2.1 | yes, through the 737 |
| `engine/CFM56_5.xml` | Aeromatic | the clone's LGPL-2.1 | not at run time: the seed of our A320's engines (§1e). Flown through our A320, 25,000 lb, the A320-211's CFM56-5A1, until they were fitted |
| `engine/direct.xml` | JSBSim | the clone's LGPL-2.1 | yes, the thruster of both |
| `aircraft/A320/A320.xml` | unknown, 2003, "BETA" | the clone's LGPL-2.1 | no |

The A320 was measured first and refused. JSBSim's own trim at 64 t, 1,000 ft, 3° down: it finds no
trim in CONF FULL at 130, 140 or 150 kt; at 160 kt it needs −21.6° of its −25.8° of elevator, and a
170 kt climb in 1+F needs −24.4°. Its pitch stiffness, Cmα −4.0 per radian, is several times a
transport's. An aeroplane that cannot be trimmed at approach speed cannot fly the P7 gate, a hand-flown
ILS. The 737 trims from 130 kt with full flap to cruise at Mach 0.78 with 2–11° of elevator, and has
ground effect, spoilers and plausible lateral-directional derivatives.

So the aeroplane that flew first was a 737-class airframe under the A320's flight control
computers: A320-class in size, weight and speed, not an A320. That is said wherever its numbers are
reported. The operator decided to fly it for P7 and replace it later with an A320 data set fitted to
the targets in §1d; the rule for that swap is in `ROADMAP.md`, P7. Our fitted A320 met it and replaced
the 737 on 2026-11-01, on the operator's word; the scores are in `flight/README.md`.

Both aircraft files carry the same note: built from public data and guesses, for education and
entertainment, not endorsed by the manufacturer, not to be sold. This project sells nothing.

The file that puts the A32NX servos in charge of the airframe's surfaces,
`flight/jsbsim/a32nx-surfaces.xml`, is ours and GPLv3.

### 1d · The A320's acceptance targets — numbers, cited

`flight/targets/a320.csv` and `a320-speeds.csv` hold the numbers an airframe is scored against
(`airframe_score`). They are ours and GPLv3, like everything in `flight/`. No flight-test data stands
behind them, and none is claimed. One source carries the manufacturer's own numbers: the ANP database,
whose A320-211 entry Airbus developed for noise modelling and EUROCONTROL and EASA publish. Every row
names one of these sources.

| source | licence | what is taken | how |
|---|---|---|---|
| A32NX `NXSpeeds.ts`, VS1g and VLS tables (§1a clone) | GPLv3 | stall and lowest selectable speeds by configuration and weight | sampled at 5 t steps into `a320-speeds.csv`; three points corrected for typos, each one said in the file. A community reconstruction of Airbus's tables, not Airbus data |
| A32NX `ElacComputer`, α max and α prot tables | GPLv3 | the alpha the wing must still lift at, and the alpha ceiling at VLS | read out of the compiled parameter table and cited by value |
| A32NX lateral normal law | GPLv3 | the 15°/s roll rate full stick asks for | cited by value |
| A32NX MSFS flight model, `flight_model.cfg` (§1a clone) | GPLv3 | the second weight: the A320-251N it carries has a maximum zero-fuel weight of 64.3 t and a maximum landing weight of 67.4 t; rows are repeated at 65 t | cited by value |
| AAIB India, final report on the serious incident to A320-271N VT-WGR at Bengaluru, 11 November 2019 | a public investigation report | a recorded approach: 65.2 t, CG 30.6 % MAC, CONF FULL, on the ILS glide slope at VLS + 8 kt, pitch +2.5° at 1,000 ft and +2.5 to +3.5° down to 220 ft, from Airbus's analysis of the flight data recorder quoted in the report | cited by value; the band's 0.5° either way is ours |
| OpenAP's drag model (`junzis/openap`, `openap/drag.py`; Sun, Hoekstra and Ellerbroek, *Aerospace* 7(8) 104, 2020), after Gur, Mason and Schetz, *Journal of Aircraft* 47(4), 2010 | LGPL-3.0; the paper's equations | the drag rise: Korn's drag-divergence Mach (technology factor 0.95, OpenAP's default thickness 0.12, the A320's 25° of sweep from OpenAP's `a320.yml`) and Lock's fourth-power rise above a critical Mach 0.108 below it; at a lift coefficient of 0.5 the rise reaches 20 counts at Mach 0.827 | computed from the published equations; no code copied. A model, not a measurement, and the file says so |
| OpenAP WRAP, A320 (Sun, Ellerbroek and Hoekstra, *Transportation Research Part C*, 2019; `junzis/openap`) | LGPL-3.0 | the ranges of its ADS-B fits for takeoff acceleration, liftoff speed, climb and descent rate, and its typical cruise | four ranges and a typical cruise Mach and level cited, units converted; no file copied. The four ranges are context rows, not counted: they are what airlines fly, at reduced thrust and mixed weights |
| MIL-F-8785C, *Flying Qualities of Piloted Airplanes* (US DoD, 1980) | public domain | Level 1 floors for large aircraft: roll-mode time constant at most 1.4 s, Dutch-roll damping at least 0.08, short-period damping 0.30 to 2.00; in the terminal phases (category C), short-period damping 0.35 to 1.30 (table IV), a control anticipation parameter of 0.16 to 3.6 per g per s² and a natural frequency of at least 0.7 rad/s (figure 3, read off its log scales) | cited |
| Foster, Cunningham, Fremaux, Shah, Stewart, Rivers, Wilborn and Gato, *Dynamics Modeling and Simulation of Large Transport Airplanes in Upset Conditions*, AIAA 2005-5933 (NASA Langley and Boeing; NTRS 20050214373) | a paper published on NASA's technical reports server | wind tunnel tests of a twin-jet transport to 85° of alpha: the highest steady alpha full nose-up elevator holds, the stabiliser at 0, about 25° with the flaps up, and the peak alpha of piloted stalls 4 to 5° lower with the flaps down; that pitch stability falls near the stall and the elevator loses power with alpha | cited by value; the flaps-down figure is our inference from it, and the file says so. Most of the paper's figures carry no numbers, the company's data being proprietary |
| Deiler and Fezans, *Modeling of the A320 Landing Gear Drag During Their Extension and Retraction*, AIAA SciTech Forum 2025, AIAA 2025-1250 (DLR) | a paper on DLR's repository | the A320 family's gear drag coefficient identified from 804 extensions in A320neo airline flights: 0.0296, 0.0291 and 0.0311 in CONF 2, 3 and FULL, 0.0299 as one | cited by value |
| Hueschen, *Development of the Transport Class Model (TCM) Aircraft Simulation From a Sub-Scale Generic Transport Model (GTM) Simulation*, NASA/TM-2011-217169 (NTRS 20110014509) | public domain, a work of the US government | the non-proprietary aerodynamics NASA derived from the same wind tunnel model, full scale: the lift past the peak at flaps 30, 0.89 of the peak 5° past it and 0.64 15° past (figure 34); the pitching moment's nose-down break across the stall with the flaps up, 0.20 below its earlier line 6° past the lift peak (figure 33) | read off the figures by eye; no data file used |
| EASA type-certificate data sheet E.067, issue 02, 17 April 2018, CFM56-5 series | a public certification document | the CFM56-5-A1's ratings: 11,120 daN take-off, 10,540 daN maximum continuous, static, sea level, ISA, no air bled | cited by value |
| The Aircraft Noise and Performance (ANP) database, version 2.3, A320-211 / CFM56-5A1 (EUROCONTROL and ECAC; the archive tables EASA publishes) | public; its data are developed by the manufacturer and reviewed by the FAA, EASA, the Volpe Center and EUROCONTROL | Airbus's thrust coefficients for the MaxTakeoff, MaxClimb and IdleApproach ratings; its drag-to-lift ratios for CONF 1+F and clean, and for CONF 3 and FULL with the gear down; its take-off speed coefficient for CONF 1+F and its approach speed coefficients for CONF 3 and FULL | cited by value; thrust and gradients computed with the equations below; no file copied |
| Commission Directive (EU) 2015/996, Annex II, Appendix B: ECAC Doc 29's flight-performance method | EU law, public | equation B-1, corrected net thrust from the ANP coefficients; B-12, the climb gradient; B-15, the take-off speed; its guidance on reduced take-off and climb thrust, read for the WRAP rows | cited |
| OpenAP's engine table (`junzis/openap`, `openap/data/engine/engines.csv`, from Svoboda's turbofan database, *Aircraft Design* 3, 2000, and ICAO's engine emissions databank) and its thrust model (`openap/thrust.py`) | LGPL-3.0 | the CFM56-5A3's thrust at Mach 0.8 and 35,000 ft, and the model's fallback for an engine without it, the CFM56-5A1; the CFM56-5A1's bypass ratio, 6.0 | cited by value; no file copied |
| Bartel and Young, "Simplified Thrust and Fuel Consumption Models for Modern Two-Shaft Turbofan Engines", *Journal of Aircraft* 45(4), 2008, as OpenAP implements it | the paper's equations | take-off thrust against Mach for a bypass ratio of 6.0 | computed from the published equations; no code copied |
| pilot literature | — | cruise attitude; the approach attitude it gave first is now inside the recorded one above | a wide band, marked in the file as not confirmed against Airbus's FCTM. To confirm |

The margins and the bands' widths that no source gives — ±3 kt on a stall speed, 1° above α max,
0.5° around a recorded attitude, 0.02 of Mach around a modelled drag rise, 1 % around a rating, 3 %
around ANP's thrust and 1 kN around its idle, 5 % around a generic model, 10 % around a gradient
from another airframe's drag, 4° around Foster's alphas, 0.10 around the TCM's lift past the stall and
−0.35 to −0.05 around its pitch break — are this project's, and the file says so where it uses them.

Quoted for comparison, not scored: NASA CR-2144, Heffley and Jewell, *Aircraft Handling Qualities Data*
(1972, NTRS 19730003312), whose tables give the Boeing 747's and the Convair 880M's pitch derivatives in
their landing configurations; `flight/README.md` sets ours beside them (step 4).

The ANP entry is the A320-211, with the CFM56-5A1 our A320 carries and wingtip fences where ours has
sharklets. ANP's thrust is kept below 10,000 ft, where Doc 29 uses it; above that one row stands on
OpenAP's figures. A32NX's FMS carries its own model of the A320neo's LEAP-1A26, a community
reconstruction; our A320 keeps the CFM56-5A1, whose manufacturer's numbers are public, and that model
is not used.

### 1e · Our A320 — seeds and fit

`flight/jsbsim/aircraft/A320-fit/A320-fit.xml` is ours, written for this project, GPLv3. It is not
derived from JSBSim's A320 or 737 files. Its numbers come from these, each named per coefficient in
`flight/jsbsim/aircraft/A320-fit/seeds.csv`, and then from the fit:

| source | licence | what is taken |
|---|---|---|
| A32NX's MSFS flight model, `flight_model.cfg` (§1a clone) | GPLv3 | wing and tail areas, span; the A320-251N's operating empty weight (42.5 t at 30 % MAC) and empty moments of inertia; what its reference stall speeds imply for CL max clean and in CONF FULL; where its Mach drag table reaches 20 counts; how its elevator's power fades with alpha past 10° (`pitch_moment_delta_elevator_aoa_table`), the seed of our tail's fade; spoiler and flap increments as cross-checks. MSFS conventions: a seed and a cross-check, not a drop-in |
| NASA's Transport Class Model (§1d, Hueschen 2011) | public domain | the size of the pitching moment's nose-down break across the stall, the seed of ours |
| OpenAP, `a320.yml` and `dragpolar/a320.yml` | LGPL-3.0 | the MAC; the clean drag polar (CD0 0.018, induced factor 0.039) and the gear's drag, fitted to ADS-B |
| JSBSim's `engine/CFM56_5.xml` (§1c) | LGPL-2.1 | the engines' seed. Our engine file, `Engines/CFM56-5A1-fit.xml` (GPLv3), keeps its bypass ratio, fuel flow and idle and maximum spool speeds, six numbers, by value, which LGPL-2.1's section 3 allows under the GPL; its 25,000 lb rating is the type certificate's (§1d), the same. Its thrust tables, fitted in our form by least squares, are the seeds of the thrust (`thrust-seeds.csv`). Not read at run time |
| textbook methods: USAF DATCOM's lift-curve slope, tail volume and downwash for the tail's terms (Etkin and Reid, *Dynamics of Flight*), McCormick's ground-effect factor, Korn's equation and Lock's rise | — | our estimates of the slopes, the tail's damping and power, ground effect and the drag rise's shape, from the file's geometry |
| our own estimates | — | the rest, each said in the seeds file; where an estimate was compared with a held-out row of §1d while it was made, the seeds file says which |

The fit is `flight/harness/fit.cpp`: CMA-ES as Hansen's tutorial sets it (arXiv:1604.00772), written
here, scored by `airframe_score` on the fit rows of §1d only. The method is the tutorial's; the code
is ours. It fits the aerodynamics on every group of rows but the thrust and post-stall groups; with
`--thrust`, the engines' eight numbers on the thrust group's fit rows: the rating and Airbus's thrust of
§1d; with `--poststall` five numbers past the stall (`poststall-seeds.csv`) on the post-stall group's
fit rows, Foster's alpha with full nose-up elevator in CONF FULL and the TCM's lift past the peak; and
with `--drag` the drag of the landing flaps and the gear (`drag-seeds.csv`) on the drag group's, ANP's
drag-to-lift ratios for CONF 3 and FULL and DLR's gear drag. The
form those numbers sit in, δ^x (1 + a1 M + a2 M²)(1 + c M (1 − δ)) for take-off thrust and δ (i0 + i1 M)
for idle, is ours, chosen against ANP's points before the fit.

### 1f · The runways, the ILS, and KDFW drawn

`flight/harness/runway.cpp` and `flight/web/data/kdfw.json` are ours, GPLv3. Their numbers, and where they
come from:

| source | licence | what is taken |
|---|---|---|
| OurAirports, `runways.csv` and `airports.csv` (davidmegginson.github.io/ourairports-data), retrieved 2026-11-01 | public domain | KDFW (Dallas/Fort Worth), the main airport by the operator's decision of 2026-11-01: all seven runways, each end's position, elevation, true heading and displaced threshold, each runway's length and width, and the field's elevation, 607 ft. KDFW 17C, the default runway, in `runway.cpp`: its end at 32.91569901 N 97.02600098 W, 562 ft at both ends, 180.3° true, 13,400 × 150 ft. LSZH (Zurich) runway 14, the alternative: its end at 47.483101 N 8.53473 E, 1,402 ft, 137° true, 10,827 × 197 ft, the threshold displaced 492 ft. Numbers copied by value into the sources and cited there; no file is copied |
| FAA airport diagram AL-6039, Dallas-Fort Worth Intl, d-TPP cycle 2611, effective 29 Oct 2026 to 26 Nov 2026: https://aeronav.faa.gov/d-tpp/2611/06039ad.pdf (445,030 bytes, SHA-256 `404eb71e507ffe80223ff28d0b9e95503c545d6dde0292e59f366dc6b81dbf7a`), downloaded 2026-11-01 on the operator's word | public domain (a work of the US government, 17 U.S.C. § 105) | KDFW's five terminals' footprints, its two central terminal ramps and the positions of its three control towers, read off the chart's vector drawing and georeferenced by its seven runway bars against OurAirports' runway ends (a similarity fit, 17.64 m per point; worst residual 13.5 m); the terminal spine is the gap between the ramps. Coordinates are in `kdfw.json`, the chart is not copied. The towers' and terminals' heights are this project's estimates: the chart gives none |
| FAA Advisory Circulars 150/5340-1 (Standards for Airport Markings) and 150/5340-30 (Design and Installation Details for Airport Visual Aids) | public domain | as methods: a precision runway's markings (threshold stripes by runway width, touchdown zone and aiming point, centreline and edge stripes) and its lights (edge, centreline coding, touchdown zone, ALSF-2 with sequenced flashers, PAPI). Implemented in `flight/web/src/airport-layout.js`, not copied |
| ICAO Annex 10, Volume I (Radio Navigation Aids) | — | the ILS's geometry, as a method: the localizer's displacement sensitivity (full scale 107 m either side at the threshold), the glide path's (0.24 of its angle), its coverage; the localizer's antenna 300 m past the stop end, a typical siting. Implemented here, not copied |
| this project | — | the 3° glide path and 50 ft threshold crossing height on every runway (no published ILS is used), and the PAPI set to that glide; two dots for full scale, as the A320's PFD draws it; which runways are arrivals in south flow; the generic parallel taxiways; the scripted crew; the bands it is judged by (`ROADMAP.md`, P7) |

The runways are real, and so are their places on the earth, as are KDFW's terminals and towers; the
ILS on them is a textbook one. Nothing here is fit for navigation.

### 1g · The view's sky, country and A320

`flight/web/src` (`atmosphere.js`, `haze.js`, `scenery.js`, `terrain.js`, `city.js`, `airliner.js`,
`cockpit.js`, `acmi.js`, `world-data.js`) and `flight/web/data` (`a320.json`, `dfw-region.json`,
`dallas-skyline.json`) are ours, GPLv3, from the visuals study the operator approved on 2026-11-01. Every
texture is painted by code when the page starts; no image, model or font file ships. Canvas text names
system fonts (Arial, Consolas and their kin) and falls back to the browser's own.

| source | licence | what is taken |
|---|---|---|
| `flight/jsbsim/aircraft/A320-fit/A320-fit.xml` (§1e) | GPLv3, ours | the drawn airframe's points: the CG, EYEPOINT, the nose and main gear contacts, the tail bumper and the engines' thrusters, in `a320.json`, held equal to the file by `flight/web/test/visuals.test.mjs`, so the wheels touch where `ra_ft` reads zero |
| Airbus's published A320 dimensions | facts | length 37.57 m, span 35.80 m with sharklets, height 11.76 m, the fuselage's 3.95 × 4.14 m section: the outline in `a320.json` is shaped by eye to them |
| Wikimedia Commons photographs, as reference only: "EZY nose close up" (CC BY 3.0) and "N682TA Airbus A320 TACA Nose (7466391972)" (CC BY-SA 3.0, Aeroprints.com) | — | the flight deck windows' layout and the nose's profile, looked at and shaped by eye; nothing of the photographs is copied or ships |
| public maps, from general knowledge | — | `dfw-region.json`: the lakes', the Trinity's and ten freeways' coarse lines and the towns' centres, this project's estimates, approximate. To be redrawn from public-domain data (USGS's National Hydrography Dataset, the Census Bureau's TIGER roads) before anything relies on their shapes |
| published building heights | facts | `dallas-skyline.json`: each tower's height (Reunion Tower 171 m and the 259 light fixtures of its dome, Bank of America Plaza 281 m, and eleven more); their positions approximate, from general knowledge; what marks each at night drawn by this project |
| E. Bruneton and F. Neyret, *Precomputed Atmospheric Scattering* (2008), and Bruneton's reference implementation (2017) | as methods; the implementation's code (BSD-3-Clause) is not used | the atmosphere's model in `atmosphere.js`: Rayleigh, Mie and ozone extinction and their scale heights (physical constants), single scattering marched on the CPU into a 64 × 64 table; multiple scattering as an isotropic term set by eye |
| this project | — | the haze over every surface (`haze.js`), the light points' shader, the terrain and its land cover generated from a seed, the city's towers, the house livery ("A32X", no airline's marks), the flight deck's shell and its placeholder pictures (P8 draws the real ones), the debrief |

The sky is computed, not photographed, and the Dallas country is drawn coarsely on purpose: a 1980s
visual system's register. Nothing here is fit for navigation.

---

## 2 · Third-party dependencies

| dependency | scope | licence | vendored? |
|---|---|---|---|
| TypeScript | build only, `npm run build:web` | Apache-2.0 | no, `npm i` |
| esbuild | build only, bundles `app/web/app.js`; its three-line class-field helper ships inside it | MIT | no, `npm i` |
| JSBSim | `flight/` from P7 | LGPL-2.1 | no, cloned separately, `66f7faf` |
| JSBSim's 737 and CFM56 data | `flight/` from P7, read at run time | GPL; LGPL-2.1 | no, read from the JSBSim clone |
| JSBSim's CFM56_5 data | `flight/`: the seed of our A320's engines, six of its numbers kept in our engine file (§1e); read at run time until those engines were fitted | LGPL-2.1 | no; not read since |
| FlyByWire A32NX | `flight/` from P6 | GPLv3 | no, cloned separately, `66021c2` |
| Emscripten (emsdk) | `flight/`'s WebAssembly build (P7): build only, but its JavaScript runtime and system libraries are linked into the module (§2b) | emsdk MIT; Emscripten MIT or NCSA; musl MIT; libc++ Apache-2.0 with LLVM exception | no, installed separately, `6.0.12` |
| three.js | `flight/web`: the out-the-window view, bundled into the page at build time | MIT | no, `npm i`, `0.186.1` |
| esbuild | `flight/web` too: bundles the page and its worker | MIT | no, `npm i`, `0.28.2` |
| MSVC (Visual Studio 2022) | `flight/launcher`: builds `A32X.exe`, whose C runtime it links in statically (§2a) | Visual Studio's; the runtime a System Library in GPLv3's sense | no, installed separately |

Runtime dependencies in `app/`: **none.** It is Node built-ins and a browser.

### 2b · Emscripten — the WebAssembly toolchain

`emscripten-core/emsdk`, release `6.0.12`, commit `35ff8a6` (2026-10-08), which installs Emscripten
6.0.12 (`5488e087`) with its own LLVM, Binaryen and node. It compiles `flight/` — the A32NX computers,
JSBSim and our harness — to WebAssembly (P7, step 6). It is a build tool, but not only that: the module
it links carries Emscripten's JavaScript runtime and system libraries, musl libc and LLVM's libc++
beside our code. Their licences — MIT, NCSA, Apache-2.0 with the LLVM exception — sit with the module's
GPLv3, and their notices go with any distributed build (§2a).

Installed outside the repository, fetched by hash (exercised 2026-11-01, in WSL's Ubuntu 24.04):

```
git init emsdk
git -C emsdk remote add origin https://github.com/emscripten-core/emsdk.git
git -C emsdk fetch --depth 1 origin 35ff8a6d150541276abbc6bae512ca90bcfbe220
git -C emsdk checkout FETCH_HEAD
emsdk/emsdk install 6.0.12
emsdk/emsdk activate 6.0.12
source emsdk/emsdk_env.sh
```

The WebAssembly build then runs as `flight/README.md` says. Moving the pin means rebuilding and
re-running both suites, native and WebAssembly.

### 2a · What ships, and under which licence

Decided 2026-11-01 (`ROADMAP.md` §4, P7: *packaging*). Two artefacts:

| artefact | holds | licence |
|---|---|---|
| `a32x-cbt.zip` (P5) | the systems trainer: `app/` built, its data, `LICENSE`, `README.txt` | MIT |
| the flyable simulator (from P7): `a32x-sim-<version>-win64.zip` | `A32X.exe`, our launcher; `web/`: the page with three.js bundled in, and the A32NX computers, JSBSim and our airframe as WebAssembly; `trainer/`: P5's package as it is; `LICENSE.txt`, GPLv3; `notices/`; `README.txt` | GPLv3; `trainer/` MIT |
| its Corresponding Source: `a32x-sim-<version>-source.zip` | this repository at the commit; A32NX `66021c2`'s flight-control code, which is what is compiled (`fbw-a32nx/src/wasm/fbw_a320/`), and its licence; JSBSim `66f7faf`, whole; the three.js files the page bundles; Emscripten `6.0.12` named, with where to get it | each part its own |

The second carries the first's code, never the reverse: `app/` imports nothing from `flight/`.
Every distributed build of it comes with its Corresponding Source from the same place — our source
and build scripts and the exact upstream sources compiled into it — and with every licence text and
notice: GPLv3, A32NX's notices, LGPL-2.1 for JSBSim, the aircraft files' headers, MIT for Three.js
and for the trainer. Nothing is published without the operator's word.

**The first build of it, 2026-11-01, for Windows, not published.** `flight/web/tools/release.mjs`
makes the source archive first, from git's objects at the commits pinned, and then builds everything
that ships from that archive, unzipped: the module by the pinned Emscripten, the page by esbuild,
`A32X.exe` by MSVC, the trainer by P5's packager. The upstream sources travel only inside that archive,
exported, each folder naming its commit in a `SOURCE-COMMIT` file; the repository still vendors none.
Its `notices/` carries A32NX's licence, JSBSim's LGPL-2.1 and authors, the headers of the aircraft and
engine files the module embeds, the licence of Emscripten and of each system library the module links
(musl, libc++, libc++abi, libunwind, compiler-rt, and dlmalloc's dedication to the public domain),
three.js's MIT, and the airport data's public-domain sources (§1f). The release refuses a notice that
is missing or does not carry its licence's text, and a system library linked whose licence it does not
know. `flight/README.md`, *The Windows release*, has the rest.

`A32X.exe` is ours, GPLv3 (`flight/launcher`): it opens the page in Microsoft Edge's app mode, or in the
default browser. It links Microsoft's C runtime statically, a System Library in GPLv3's sense (section 1:
part of the compiler used), which Visual Studio's licence lets a program carry. No WebView2 shell for
now: its SDK's licence and its loader DLL need a check of their own before anything ships with them.

---

## 3 · Trademarks

"Airbus", "A320" and "A32NX" belong to their owners. This is an unofficial training aid, not
affiliated with Airbus, FlyByWire Simulations, or Aerowinx, and not suitable for type training.

---

## 4 · What was verified, and how

Every claim in `docs/architecture.md` marked `[R]` was read out of a running system rather than
guessed. The PSX notes were made from a study of a licensed copy; they describe its behaviour in
our own words and carry no references into its code.

The trainer's own behaviour is held by 182 tests. That is the evidence that matters day to day:
`npm run test:all`.
