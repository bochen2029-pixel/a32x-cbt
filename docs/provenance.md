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
| A32NX `ElacComputer`, α max and α prot tables | GPLv3 | the alpha the wing must still lift at, at low speed and, from the α max table's Mach column, at Mach 0.45 to 0.78; and the alpha ceiling at VLS | read out of the compiled parameter table and cited by value |
| A32NX lateral normal law | GPLv3 | the 15°/s roll rate full stick asks for | cited by value |
| A32NX MSFS flight model, `flight_model.cfg` (§1a clone) | GPLv3 | the second weight: the A320-251N it carries has a maximum zero-fuel weight of 64.3 t and a maximum landing weight of 67.4 t; rows are repeated at 65 t | cited by value |
| AAIB India, final report on the serious incident to A320-271N VT-WGR at Bengaluru, 11 November 2019 | a public investigation report | a recorded approach: 65.2 t, CG 30.6 % MAC, CONF FULL, on the ILS glide slope at VLS + 8 kt, pitch +2.5° at 1,000 ft and +2.5 to +3.5° down to 220 ft, from Airbus's analysis of the flight data recorder quoted in the report | cited by value; the band's 0.5° either way is ours |
| OpenAP's drag model (`junzis/openap`, `openap/drag.py`; Sun, Hoekstra and Ellerbroek, *Aerospace* 7(8) 104, 2020), after Gur, Mason and Schetz, *Journal of Aircraft* 47(4), 2010 | LGPL-3.0; the paper's equations | the drag rise: Korn's drag-divergence Mach (technology factor 0.95, OpenAP's default thickness 0.12, the A320's 25° of sweep from OpenAP's `a320.yml`) and Lock's fourth-power rise above a critical Mach 0.108 below it; at a lift coefficient of 0.5 the rise reaches 20 counts at Mach 0.827 | computed from the published equations; no code copied. A model, not a measurement, and the file says so |
| OpenAP WRAP, A320 (Sun, Ellerbroek and Hoekstra, *Transportation Research Part C*, 2019; `junzis/openap`) | LGPL-3.0 | the ranges of its ADS-B fits for takeoff acceleration, liftoff speed, climb and descent rate, and its typical cruise | four ranges and a typical cruise Mach and level cited, units converted; no file copied. The four ranges are context rows, not counted: they are what airlines fly, at reduced thrust and mixed weights |
| MIL-F-8785C, *Flying Qualities of Piloted Airplanes* (US DoD, 1980) | public domain | Level 1 floors for large aircraft: roll-mode time constant at most 1.4 s, Dutch-roll damping at least 0.08, short-period damping 0.30 to 2.00; in the terminal phases (category C), short-period damping 0.35 to 1.30 (table IV), a control anticipation parameter of 0.16 to 3.6 per g per s² and a natural frequency of at least 0.7 rad/s (figure 3, read off its log scales) | cited |
| Foster, Cunningham, Fremaux, Shah, Stewart, Rivers, Wilborn and Gato, *Dynamics Modeling and Simulation of Large Transport Airplanes in Upset Conditions*, AIAA 2005-5933 (NASA Langley and Boeing; NTRS 20050214373) | a paper published on NASA's technical reports server | wind tunnel tests of a twin-jet transport to 85° of alpha: the highest steady alpha full nose-up elevator holds, the stabiliser at 0, about 25° with the flaps up, and the peak alpha of piloted stalls 4 to 5° lower with the flaps down; that pitch stability falls near the stall and the elevator loses power with alpha | cited by value; the flaps-down figure is our inference from it, and the file says so. Most of the paper's figures carry no numbers, the company's data being proprietary |
| 14 CFR 33.73(b), *Power or thrust response* (FAA, engine certification; EASA's CS-E 745 asks the same) | public domain, a US federal regulation | from minimum flight idle, or not more than 15 % of rated take-off thrust, to 95 % of rated take-off thrust in not over 5 s, from a stabilized static condition | cited by value: a limit every certified engine meets, not CFM56-5A1 data; the fit row of the engines' spool-up, bounding it from one side, the fit 1 s clear by the fitter's rule for one-sided limits. A published CFM56-5A acceleration time would replace it |
| Wey and Wey, *Gas Emissions Acquired during the Aircraft Particle Emission Experiment (APEX) Series*, ISABE-2007-1277 (NASA Glenn; NTRS 20070022426) | a paper on NASA's technical reports server | APEX's test matrices on CFM56-2C1, -3B1, -3B2 and -7B22 engines, "defined as ground idle (approximately 4%)" of rated thrust and up: the ground idle of our engine | cited by value; other CFM56s than the -5A1 |
| Asbury and Yetter, *Static Performance of Six Innovative Thrust Reverser Concepts for Subsonic Transport Applications*, NASA/TM-2000-210300 | public domain, a work of the US government | a cascade reverser's overall effectiveness, net reverse force over the engine's forward thrust, "about 0.31, which is typical of cascade thrust reversers" (figure 23(a)), and 0.35 to 0.40 for cascade systems: our reverser's efficiency | cited by value; the A320-211's reverser is a four-door pivoting type |
| Noel and Boeker, *Thrust Reverser Analysis for Implementation in the Aviation Environmental Design Tool (AEDT)*, Volpe Center letter report RTV-4F-FA4T-LR1, June 2007 (US DOT) | public domain, a work of the US government | from FAA flight-loads data on 56 A320s and 10,066 operations: 68.4 % N1 on average while the reversers are deployed, 32.0 % of rated thrust | cited by value: a floor for MAX REV, which stays provisional |
| Deiler and Fezans, *Modeling of the A320 Landing Gear Drag During Their Extension and Retraction*, AIAA SciTech Forum 2025, AIAA 2025-1250 (DLR) | a paper on DLR's repository | the A320 family's gear drag coefficient identified from 804 extensions in A320neo airline flights: 0.0296, 0.0291 and 0.0311 in CONF 2, 3 and FULL, 0.0299 as one | cited by value |
| Hueschen, *Development of the Transport Class Model (TCM) Aircraft Simulation From a Sub-Scale Generic Transport Model (GTM) Simulation*, NASA/TM-2011-217169 (NTRS 20110014509) | public domain, a work of the US government | the non-proprietary aerodynamics NASA derived from the same wind tunnel model, full scale: the lift past the peak at flaps 30, 0.89 of the peak 5° past it and 0.64 15° past (figure 34); the pitching moment's nose-down break across the stall with the flaps up, 0.20 below its earlier line 6° past the lift peak, and its levelling off past the stall, −0.090 from 6° to 16° past the peak (figure 33) | read off the figures by eye, and figure 33's moment past the stall digitised from its image; no data file used |
| EASA type-certificate data sheet E.067, issue 02, 17 April 2018, CFM56-5 series | a public certification document | the CFM56-5-A1's ratings: 11,120 daN take-off, 10,540 daN maximum continuous, static, sea level, ISA, no air bled | cited by value |
| The Aircraft Noise and Performance (ANP) database, version 2.3, A320-211 / CFM56-5A1 (EUROCONTROL and ECAC; the archive tables EASA publishes) | public: EASA's notice, "Reproduction is authorised, provided the source is acknowledged, save where otherwise stated"; EASA's ANP page names its users under Regulation (EU) No 598/2014, Art. 7(6) and 7(3), "other parties that can demonstrate a need for modelling purposes" among them, and links the legacy archive tables for download; its data are developed by the manufacturer and reviewed by the FAA, EASA, the Volpe Center and EUROCONTROL | Airbus's thrust coefficients for the MaxTakeoff, MaxClimb and IdleApproach ratings; its drag-to-lift ratios for clean, CONF 1+F, CONF 1 and CONF 2 (with the gear up and down), and for CONF 3 and FULL with the gear down; its take-off speed coefficient for CONF 1+F, its approach speed coefficients for CONF 3 and FULL, and its default departure's speeds in CONF 1 at its stage-3 weight | cited by value; thrust and gradients computed with the equations below; no file copied |
| Commission Directive (EU) 2015/996, Annex II, Appendix B: ECAC Doc 29's flight-performance method | EU law, public | equation B-1, corrected net thrust from the ANP coefficients; B-12, the climb gradient; B-15, the take-off speed; its guidance on reduced take-off and climb thrust, read for the WRAP rows | cited |
| OpenAP's engine table (`junzis/openap`, `openap/data/engine/engines.csv`, from Svoboda's turbofan database, *Aircraft Design* 3, 2000, and ICAO's engine emissions databank) and its thrust model (`openap/thrust.py`) | LGPL-3.0 | the CFM56-5A3's thrust at Mach 0.8 and 35,000 ft, and the model's fallback for an engine without it, the CFM56-5A1; the CFM56-5A1's bypass ratio, 6.0; its climb thrust (Bartel and Young's equations 15 to 19), compared with ANP's MaxClimb below 10,000 ft and not used, falling 14 to 28 % short of it | cited by value; no file copied |
| Bartel and Young, "Simplified Thrust and Fuel Consumption Models for Modern Two-Shaft Turbofan Engines", *Journal of Aircraft* 45(4), 2008, as OpenAP implements it | the paper's equations | take-off thrust against Mach for a bypass ratio of 6.0, and with the runway's pressure ratio at a high airfield (equations 12 to 14) | computed from the published equations; no code copied |
| pilot literature | — | cruise attitude; the approach attitude it gave first is now inside the recorded one above | a wide band, marked in the file as not confirmed against Airbus's FCTM. To confirm |

The margins and the bands' widths that no source gives — ±3 kt on a stall speed, 1° above α max,
0.5° around a recorded attitude, 0.02 of Mach around a modelled drag rise, 1 % around a rating, 3 %
around ANP's thrust and 1 kN around its idle, 5 % around a generic model, 10 % around a gradient
from another airframe's drag, 4° around Foster's alphas, 0.10 around the TCM's lift past the stall and
−0.35 to −0.05 around its pitch break — are this project's, and the file says so where it uses them.

Quoted for comparison, not scored: NASA CR-2144, Heffley and Jewell, *Aircraft Handling Qualities Data*
(1972, NTRS 19730003312), whose tables give the Boeing 747's and the Convair 880M's pitch derivatives in
their landing configurations; `flight/README.md` sets ours beside them (step 4).

ANP's tables were read from its version 2.3 archive tables, `archive_anp_v2.3.zip` (release notes of
14 October 2020, https://www.easa.europa.eu/en/downloads/138159/en), fetched on 2026-11-01 from
https://www.easa.europa.eu/en/downloads/138164/en, where EASA's ANP data page links it
(https://www.easa.europa.eu/en/domains/environment/policy-support-and-research/aircraft-noise-and-performance-anp-data):
152,914 bytes, SHA-256 6147f05ea50f57df816ad2bbf8a1e870bcc74f253fb32bfeea5f468ea85d852f. Read as data,
nothing in it run, and copied by value: no file of it is in the repository.

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
| JSBSim's `engine/CFM56_5.xml` (§1c) | LGPL-2.1 | the engines' seed. Our engine file, `Engines/CFM56-5A1-fit.xml` (GPLv3), keeps its bypass ratio, fuel flow and idle and maximum spool speeds, six numbers, by value (its pace of
spool-up is JSBSim's own rate, written out in the file and scaled by one fitted number), which LGPL-2.1's section 3 allows under the GPL; its 25,000 lb rating is the type certificate's (§1d), the same. Its thrust tables, fitted in our form by least squares, are the seeds of the thrust (`thrust-seeds.csv`). Not read at run time |
| textbook methods: USAF DATCOM's lift-curve slope, tail volume and downwash for the tail's terms (Etkin and Reid, *Dynamics of Flight*), McCormick's ground-effect factor, Korn's equation and Lock's rise | — | our estimates of the slopes, the tail's damping and power, ground effect and the drag rise's shape, from the file's geometry |
| our own estimates | — | the rest, each said in the seeds file; where an estimate was compared with a held-out row of §1d while it was made, the seeds file says which |

The fit is `flight/harness/fit.cpp`: CMA-ES as Hansen's tutorial sets it (arXiv:1604.00772), written
here, scored by `airframe_score` on the fit rows of §1d only. The method is the tutorial's; the code
is ours. It fits the aerodynamics on every group of rows but the thrust and post-stall groups; with
`--thrust`, the engines' nine numbers on the thrust group's fit rows: the rating, Airbus's thrust of
§1d and Bartel and Young's static thrust at an 8,000 ft airfield; with `--poststall` five numbers past
the stall (`poststall-seeds.csv`) on the post-stall group's fit rows, Foster's alpha with full nose-up
elevator in CONF FULL and the TCM's lift past the peak; and
with `--drag` the drag of the flaps and the gear (`drag-seeds.csv`) on the drag group's, ANP's
drag-to-lift ratios for CONF 1+F, CONF 1, CONF 2, CONF 3 and FULL and DLR's gear drag; and with
`--spool` the one number that scales JSBSim's own spool-up rate (`spool-seeds.csv`, seeded at 1,
JSBSim's default) on the spool group's fit row, 14 CFR 33.73(b)'s limit. The
form those numbers sit in, δ^x (1 + a1 M + a2 M²)(1 + (c M + c2 M²)(1 − δ)) for take-off thrust and
δ (i0 + i1 M) for idle, is ours, chosen against ANP's points before the fit; c2 was added for the fit
at a high airfield.

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

### 1h · The orbit sketch: a spaceplane, a round Earth, a ring

`flight/orbit` is ours, GPLv3: a sketch made on the operator's word of 2026-11-12, outside the roadmap's
phases (`flight/orbit/README.md`). Its core links nothing from A32NX or JSBSim; its page reads
`flight/web`'s KDFW drawing (1f, 1g) unchanged. Every texture is painted by code; no image, model or
font file ships.

| source | licence | what is taken |
|---|---|---|
| Natural Earth 1:50m land and lakes, `geojson/ne_50m_land.geojson` (1,636,166 bytes, SHA-256 `e874b27a51d146452be360cafb3cc50c86001074a67d534113e6534682f9826b`) and `ne_50m_lakes.geojson` (876,018 bytes, SHA-256 `d350b75978b26fe839b797c2c529b2fb8f47fb3983c03f4964e36d5df9378a52`), from `nvkelso/natural-earth-vector` at `ca96624` (version 5.2.0-pre), downloaded 2026-11-12 | public domain: "All versions of Natural Earth raster + vector map data … are in the public domain" (its `LICENSE.md`) | the coastlines and lakes the globe is painted from: simplified to 0.03° and kept in hundredths of a degree by `flight/orbit/web/tools/land.mjs` into `web/data/land.js`, 855 land rings and 393 lakes. The GeoJSON files are not in the repository |
| U.S. Standard Atmosphere, 1976 (NOAA, NASA and the US Air Force) | public domain, a work of the US government | the atmosphere to 86 km: its layers' base heights and lapse rates, its sea-level values and constants, as a method; the densities at 86, 120, 200 and 500 km that the core's exponentials pass through above it. The tests check the core against its tables |
| E. C. Polhamus, *A concept of the vortex lift of sharp-edge delta wings based on a leading-edge-suction analogy*, NASA TN D-3767 (1966) | public domain, a work of the US government | the form of a slender delta's lift and drag: a potential term and a vortex term. The two constants, 2.4 and 3.0, are this project's |
| Newtonian impact theory | textbook | the lift and drag of a surface at hypersonic speed, blended in from Mach 1.5 to 5 |
| R. F. Jaggers, *An explicit solution to the exoatmospheric powered flight guidance and trajectory optimization problem for rocket propelled vehicles*, AIAA Guidance and Control Conference (1977): the Space Shuttle's powered explicit guidance | the paper's method | as a method: steering linear in time, solved again each step for the time still to burn, with the rocket equation's integrals for thrust over a falling mass. Cut down for this sketch, a flat-Earth gravity term falling to nothing at orbital speed; the code is ours |
| this project | — | the craft (mass, size, the drive, every derivative), the control law, the gear, the crew's take-off, climb and pitch schedule, the Ring's dimensions and where it waits, the flight's date (12 November 2026, 19:00 UTC), the land's colours by latitude and its desert boxes, the clouds, and the clear day over Texas |

Each further part of the sketch keeps its own sources here, in the subsection below that names it.

#### Docking

| source | licence | what is taken |
|---|---|---|
| probe-and-drogue docking, the kind Soyuz and Progress use: a probe on the active craft, a cone with a socket on the passive one | general engineering knowledge; no document is copied | the idea of the mechanism only: a probe's head guided by a cone into a socket, where latches catch it and then draw the craft in. No dimension, tolerance, load or procedure of any real system is used |
| the signed distance of a point from a box | textbook geometry | the Ring's band, hub and spokes as boxes in the Ring's frame, which a sphere touches where its centre is nearer than its radius; each sphere is swept along its step in pieces shorter than half the smallest radius |
| this project | — | every number: the probe's place and length, the six tolerances of the catch, the probe's spring, damper and stroke, the draw-in, the separation speed, the craft's spheres, the crew's way round the Ring and its closing profile, and the target painted on the hub's face |

#### The flight deck

`flight/orbit/core/deck.cpp`, `orbit_deck.h`, `deck_state.h`, `web/src/deck-view.js`, `deck-hud.js` and their
tests are ours, GPLv3. What is taken below is taken as ideas and methods; no code is copied, and no number
of a real aircraft, ship or station is used.

| source | licence | what is taken |
|---|---|---|
| the F-35B's short take-off and vertical landing: a swivelling aft nozzle, a lift fan ahead of the centre of mass and roll posts in the wings, balanced so the lift passes through it; and its "unified" flight controls, in which the stick commands translational velocity in the hover and the throttle the vertical speed | general engineering knowledge of a publicly described aircraft; no document is copied | the ideas only: the drive swivelling from aft to straight down through the centre of mass, attitude bled from the drive while jet-borne, and the deck hold's stick as a velocity and throttle as a climb or sink. The swivel's rate, the posts' and jet's shares and every gain are this project's |
| the instrument landing system: a localizer, a glide path, deviation needles and a flight director | general aviation knowledge | the idea of a beam to fly and needles that point to it; here a path in the Ring's turning frame, curved with the floor |
| motion in a rotating frame, and plane polar coordinates (any text on classical mechanics, e.g. D. Kleppner and R. Kolenkow, *An Introduction to Mechanics*) | textbook | the centrifugal and Coriolis accelerations, and that in a cylinder about the Ring's axis, fixed among the stars, the motion is ρ̈ − ρψ̇² radially and ρψ̈ + 2ρ̇ψ̇ along: the laws work their thrust out from these exactly |
| feedback linearisation (J.-J. E. Slotine and W. Li, *Applied Nonlinear Control*, 1991) | textbook method | asking for the deck coordinates' accelerations and cancelling the known dynamics to get the thrust, with linear loops on the errors |
| the owner's booster-lander simulator (`bochen2029-pixel/booster-lander-simulator` at `e0e5769`: `core/guidance_hoverslam.c`, `CLAUDE_v1.md` §9.1 and §13.3), Bo Chen, 2026 | MIT | as ideas, read and not copied: a speed scheduled by the distance still to go at a constant deceleration, v = √(v₁² + 2 a d), the deceleration frozen when the burn starts so the profile does not steepen as the propellant goes (here the glide's bleed); a place loop that commands a capped velocity, then tracks it, so the approach decays without overshoot (here the hover); a touchdown judged by sink, drift and tilt against stated limits; and Monte-Carlo runs on fixed seeds with the worst case printed. No code |
| P. R. Dahl, *A solid friction model*, The Aerospace Corporation, TOR-0158(3107-18)-1 (1968) | the report's idea | a contact that sticks as a stiff spring until friction gives way, the bristle idea, as the tyres' hold on the deck at rest. The spring, its damping and the friction are this project's |
| K. Perlin, "Improving noise", *ACM Transactions on Graphics* 21 (2002), 681–682 | the paper's result | the quintic step 6x⁵ − 15x⁴ + 10x³, whose second derivative is nought at both ends, for the course onto the centreline |
| this project | — | the deck's shape and the pads' places (with the Ring's drawing), the craft's hard points, the touchdown's tolerances and crash limits, the glide's height and side, the final's clearance and bend, the swivel's rate, the roll posts' and lift jet's authority, the tyres' spring and friction, the departure and the wait, every gain, the pads' paint and lights, and the approach display |

The landing does not claim the fidelity of any real system: the drive is the sketch's one fiction, and a
craft that lands like this on a turning deck has never been built.

#### The walk

`flight/orbit/core/walk.cpp` and `orbit_walk.h`, `flight/orbit/web/src/walk-*.js` are ours, GPLv3.

| source | licence | what is taken |
|---|---|---|
| Newtonian mechanics in a rotating frame: the centrifugal and Coriolis terms | textbook | as a method: the walker's and a ball's motion in the ring's frame, held by its floors. The tests work each motion out again in the frame that does not turn, where it is a straight line |
| the classical fourth-order Runge–Kutta method | textbook | as a method: free flight in the ring's frame |
| C. Schlick, *An Inexpensive BRDF Model for Physically-based Rendering*, Computer Graphics Forum 13(3), 1994 | the paper's method | the Fresnel term of the canal's water and the lifts' glass, as a formula |
| this project | — | the walker's size, pace, push, friction and jump; the hub's lobby; the lifts and their ride (the sideways push held to 1.5 m/s², the hub's easing at half the riders' weight, the braking); the floor's plan (streets, the canal and its bridges, the plazas, the paths, 1,500 blocks laid out from a seeded hash); the Sun's way into the band; the roof's lattice and lamps; the fill light and the haze; the signs, canvas text in the system's fonts |

The walk's physics is Newton's; its numbers are chosen, and the place is drawn by code. It describes no real
station.

#### The flight home

`core/return.cpp`, `web/src/return-view.js`. Methods only: no code or data file is taken from any of
these, and the code is ours.

| source | licence | what is taken |
|---|---|---|
| K. Sutton and R. A. Graves Jr., *A general stagnation-point convective-heating equation for arbitrary gas mixtures*, NASA TR R-376 (1971) | public domain, a work of the US government | the stagnation point's heat flux, q̇ = k √(ρ / R<sub>n</sub>) V³, and its constant for the Earth's air, 1.7415 × 10⁻⁴ in SI units. The nose radius, 1 m, is ours |
| P. Lu, "Entry guidance: a unified method", *Journal of Guidance, Control, and Dynamics* 37(3), 2014 | the paper's method | the numerical predictor-corrector: the rest of the entry flown forward with the vehicle's own model each guidance cycle, the bank's size on a profile whose one parameter is moved until the predicted miss at the entry's end is nil; the quasi-equilibrium glide as the condition a steady glide's sink rate is damped toward. Ours is simpler: the profile linear in speed (Lu's is in energy), a secant step on its start, the miss measured as path to go at a gate |
| P. Lu, C. J. Brunner, S. J. Stachowiak, G. F. Mendeck, M. A. Tigges and C. J. Cerimele, "Verification of a fully numerical entry guidance algorithm", *Journal of Guidance, Control, and Dynamics* 40(2), 2017 | the paper's method | after it: fading-memory filters on the ratios of the sensed to the modelled lift and drag accelerations, which scale the predictor's model in flight. The memory (10 s), the threshold below which the air teaches nothing, and the second pair against the air data's dynamic pressure below Mach 4 are ours |
| J. C. Harpold and C. A. Graves Jr., "Shuttle entry guidance", *Journal of the Astronautical Sciences* 27(3), 1979 | the paper's method | the lateral logic: the bank reverses when the bearing to the target passes a deadband that narrows as the speed falls. Our deadband, 8 to 12°, is on the bearing to where the glide joins the circle below |
| T. E. Moore, *Space Shuttle entry terminal area energy management*, NASA TM-104744 (1991) | public domain, a work of the US government | the heading alignment circle: a circle tangent to the extended centreline, flown to and round onto the final, with the energy to spend reckoned over the path to go. Ours spends it by angle of attack and whole turns round the circle, not a speed brake, and the drive is relit for a powered final |
| radiative equilibrium (Stefan and Boltzmann) | physics | the skin's temperature, the heat flux and the air's own temperature against εσT⁴, emissivity 0.85 (ours) |
| E. B. Wilson, "Probable inference, the law of succession, and statistical inference", *Journal of the American Statistical Association* 22 (1927) | the paper's method | the 95 % interval on a Monte Carlo's success rate |
| SplitMix64: G. L. Steele, D. Lea and C. H. Flood, "Fast splittable pseudorandom number generators", OOPSLA 2014; S. Vigna's C version | the published algorithm; Vigna's code is public domain | the Monte Carlo's generator: its increment and its two multipliers |
| `booster-lander-simulator`, this project's owner's 6-DOF propulsive-landing simulator | MIT | a practice, read and not ported: predictors shoot forward only, never integrating the plant back; a controller is judged by its success rate over many dispersed runs, with an interval, and development pools are kept apart from held-out pools flown once. No code taken |
| this project | — | the plan (the pass search, the late pass taken with more bank, the burn to a 60 km low point), the entry's angle of attack schedule and its easing, the limits and their margins, the gate, the terminal area's and the approach's laws, the flare and the rollout, the feed-forward of the Earth's turn on the final, the dispersions and their boxes, the glow and the trail |

#### The Sun and the Moon

`core/sky.cpp` and `core/orbit_sky.h` are ours: the code is written from the methods below, and
`test/test_sky.cpp` holds it to each method's worked example and to an ephemeris that shares nothing
with them. The page's part (`web/src/sky.js`, `sky-model.js`, `moon-face.js`) is ours too: the Moon's
face is painted by code from the Gazetteer's numbers, the stars drawn from Wikidata's, and no image of
the Moon or the sky was copied or ships. `web/test/sky.test.mjs` holds the page's Moon, as seen from
KDFW, to Horizons.

| source | licence | what is taken |
|---|---|---|
| J. Meeus, *Astronomical Algorithms*, 2nd ed. (Willmann-Bell, 1998) | a textbook's methods and published constants; it prints no code | the Julian Day (ch. 7); Greenwich sidereal time (ch. 12); precession from J2000.0 (ch. 21); the mean obliquity and the nutation's four largest terms (ch. 22); the Sun by the low-accuracy method, 0.01° (ch. 25); the Moon (ch. 47): the five fundamental arguments and tables 47.A and 47.B whole, 60 terms in longitude and distance, 60 in latitude, and the additive terms, about 10″; the phase angle (ch. 48); the Moon's attitude from Cassini's laws, which gives the optical librations (ch. 53). Formulae and coefficients are written out in `sky.cpp`; the tests reproduce the book's examples 7.a, 12.a, 12.b, 21.b, 25.a, 47.a, 48.a and 53.a: its series and sums to the last digit it prints, its apparent places to an arcsecond (the book's examples carry the full nutation or a one-term shortcut, the core the four terms) |
| M. Chapront-Touzé and J. Chapront, *The lunar ephemeris ELP 2000*, Astronomy and Astrophysics 124 (1983) | — | named for the record: the lunar theory whose principal terms the book's tables carry. Nothing is taken from the paper itself |
| NASA/JPL Horizons (ssd.jpl.nasa.gov/horizons), ephemeris DE441, queried 2026-11-12 | a public service of the US government; nothing of it ships | the independent values the tests hold the core to, copied by value into `test_sky.cpp`: the Sun's and the Moon's apparent places, distances and place in KDFW's sky on 2026-11-12 at 19:00 and 20:00 UTC and on 2026-12-24 at 03:00 UTC, the Moon's lit fraction, phase angle, sub-Earth point and pole angle there, the local sidereal time, the Moon's lit fraction on 1969-07-20, and the Sun's and the Moon's closest approach over KDFW on 2024-04-08. Against it over 2018 to 2034 the core's Moon stays within 7″ and 41 km and its Sun within 21″. And into `sky.test.mjs`, the Moon as seen from KDFW at those three times: its lit fraction, phase angle, sub-observer point, pole angle and angular diameter |
| Gazetteer of Planetary Nomenclature, IAU Working Group for Planetary System Nomenclature and USGS Astrogeology Science Center (planetarynames.wr.usgs.gov): the Moon's named features as a shapefile, `MOON_nomenclature_center_pts.zip` (23,845,070 bytes, SHA-256 `8093d4028a944f0db5a16a96262f1117872440edd599241df7278065f2b8a9d3`), and the pages of 42 features, downloaded 2026-11-12 | public domain: the shapefile's metadata gives its use constraints as "Public domain."; a work of the US government | packed by `web/tools/moon.mjs` into `web/data/moon.js` (the inputs' sizes and digests in its header): the outlines of 42 maria, lacus, sinus and paludes, simplified to 0.15°, and the centre and diameter of the 4,164 named craters of 8 km and more within 100° of the near side's middle; the names, centres and diameters of 40 craters treated by name (rays, dark floors). The shapefile and the pages are not in the repository |
| Wikidata (www.wikidata.org), through its query service, 2026-11-12 | CC0 1.0 | packed by `web/tools/stars.mjs` into `web/data/stars.js` (the answers' sizes and digests in its header): the 8,615 stars with a V magnitude under 6.5, their right ascension and declination for J2000.0, their magnitude, and their spectral class, read as a B−V colour. Clusters, nebulae, galaxies, novae, supernovae, planets and entries with no spectral class are left out. The Yale Bright Star Catalogue was the first choice; HEASARC, which serves its fifth edition, says Yale or its authors may still hold its copyright, so it is not used |
| R. J. Pike, *Size-dependence in the shape of fresh craters on the Moon*, in *Impact and Explosion Cratering* (Pergamon, 1977) | the paper's measured relations | the depth and rim height of a fresh lunar crater from its diameter: 0.196 D^1.010 and 0.036 D^1.014 km below 15 km, 1.044 D^0.301 and 0.236 D^0.399 above. How far each crater is worn is this project's |
| H. Seeliger (1888), the Lommel–Seeliger law of a dusty surface: brightness as cos i / (cos i + cos e) | textbook | the Moon's shading, which leaves its full disc as bright at the limb as at the middle; and the law's whole-disc light at phase angle α, 1 − sin(α/2) tan(α/2) ln cot(α/4) |
| *Allen's Astrophysical Quantities* (4th ed., A. N. Cox, ed., 2000): the Moon's magnitude with phase angle, 0.026 \|α\| + 4 × 10⁻⁹ α⁴ | published values | how much faster the real Moon fades with phase than the law alone: the ratio, held beyond 150° |
| the IAU's radii: the Moon's mean 1,737.4 km; the Sun's nominal 695,700 km (IAU 2015 Resolution B3) | facts | the discs' sizes |
| this project | — | the default epoch; Terrestrial Time taken as UTC + 69.184 s and UT1 as UTC; the range of dates taken, 1900 to 2100. On the page: the plains' tones and colours, the highlands' mottling, how worn each crater is, the rays (how many, how long, and their directions, a seeded draw but for Tycho's long ray to Bessel), the dark floors and the bright young craters, Reiner Gamma's swirl and the Aristarchus plateau's dark patch, and the outlines of Mare Frigoris and Mare Insularum, where the Gazetteer gives a box and a circle; the eye's adjustments (the Moon's own exposure with no tone curve, its fall with phase at the power 0.35, earthshine lifted 250 times); the Sun's glare; the stars' sizes, brightness and tints, and the spectral classes' B−V; the telescope's 1.4° |

#### Graphics

The tiers, the Ring's detail and its flight deck, the craft, the Earth's lighting and its night lights,
the page's layout (`flight/orbit/README.md`, Graphics). Every texture is still painted by code, into
typed arrays (`web/src/paint.js`); no image, model or font file ships.

| source | licence | what is taken |
|---|---|---|
| Natural Earth 1:10m populated places, `geojson/ne_10m_populated_places_simple.geojson` (4,932,147 bytes, SHA-256 `fd3fa867a320cbd5c5b6bb5bc550afeec2939fb2cef688e508007282a55ac42f`), from `nvkelso/natural-earth-vector` at `ca96624` (version 5.2.0-pre), downloaded 2026-11-12 | public domain: "All versions of Natural Earth raster + vector map data … are in the public domain" (its `LICENSE.md`) | each place's point and its urban population (`pop_max`), coded by `flight/orbit/web/tools/places.mjs` into `web/data/places.js`, 7,332 places of 7,342 (those with no population dropped); the night side's lights are painted from them, a spot for each town whose spread and brightness by population are this project's. The GeoJSON file is not in the repository |
| three.js's post-processing examples, `examples/jsm/postprocessing/UnrealBloomPass.js` and `OutputPass.js`, from the installed `three` 0.186.1 (§2) | MIT | the glow pass and the pass that tone-maps the picture onto the canvas, used as they are and bundled with three.js; `web/src/pipeline.js` replaces the glow's bright-pass shader (a clamp, and NaN dropped) and makes the output opaque |
| three.js's AgX tone mapping (Filament's, after Blender's) | MIT | the tone curve, as three.js has it. The look applied in its slot (a power of 1.18, saturation 1.22) is this project's, after Blender's "Punchy" look as a method |
| C. Cox and W. Munk, *Measurement of the roughness of the sea surface from photographs of the Sun's glitter*, J. Opt. Soc. Am. 44 (1954) | the paper's method | the sea's glint as a distribution of its waves' slopes, Gaussian in their tangent; the variance, a light breeze's, is this project's choice |
| E. Bruneton, *Precomputed Atmospheric Scattering: a New Implementation* (2017) | its constants as physical data; the implementation's code (BSD-3-Clause) is not used | ozone's absorption coefficients at the three colours and its layer from 10 to 40 km, as 1g's atmosphere has them |
| NACA Report 460, *The characteristics of 78 related airfoil sections* (1933) | public domain, a work of the US government | the four-digit sections' thickness distribution, for the craft's wing along its chord |
| the airglow's green line (atomic oxygen at 557.7 nm, near 95 km) | textbook | its height and colour; how bright it is drawn is this project's |
| the owner's booster-lander-simulator (`ui/src/fx/plume.ts`, `ui/src/scene/postfx.ts`, its `DECISIONS.md`, D-010), Bo Chen, read from a clone | MIT | ideas, no code: the picture kept in HDR with AgX's roll-off and a glow over only what is brighter than white; the plume as a marched volume whose shock diamonds open out and fade as the air thins; the plume made the brightest thing in the frame. The shaders here are written for three.js's WebGL renderer, where its are TSL for WebGPU. Its volumetric cloud deck is not adopted: the sketch's launch keeps its clear day over Texas |
| this project | — | the tiers and how a device's report places it in one; the Ring's plan (its walls, ribs, girders, trusses, lift tubes, glazing, town, radiators, solar mast and lights) and its flight deck, drawn to the deck's numbers (`RING.deck`, from orbit_core.h's `OC_DECK_*`); the craft's shape, tiles, panels and plume; the Earth's land colours, fields, relief, clouds and their shadows, and its lighting brought to the craft's scale; the depth slices; the page's layout |

#### The map and the sound

The sound is made as it plays from the browser's Web Audio nodes; no sound file, sample or recording
ships. The map is drawn by code from the core's state and the coastlines already here. What is taken below
is taken as ideas, numbers and methods, and the code is this project's.

| source | licence | what is taken |
|---|---|---|
| The operator's ASTRA-7 warp-hull audio study, `astra-7/ASTRA_AUDIO` (`DESIGN_SPEC.md`, `Source/AstraAudio/WarpHullSynthNode.cpp`, at `2077332`), Bo Chen, 2026 | MIT | the voice: a drive heard through its hull, every layer driven by the state and none a recording. Its drone's partial ratios 1, 2, 2.98, 4.21 with gains 1, 0.5, 0.3, 0.18 (the drive's hum); a bank of eight hull modes on a stretched inharmonic series, which ours moves down a step for a smaller hull, damped less as the drive rises so that the hull rings under power and rings down after; two-operator FM with the modulator at π times the carrier, a shear that never resolves, with its DC blocker as a highpass; the soft ceiling tanh(1.15 x) × 0.85 on the master |
| The operator's booster-lander simulator, `DECISIONS.md` D-011 and `ui/src/audio/propagation.ts` and `crackle.ts` (at `e0e5769`), Bo Chen, 2026 | MIT | sound as an observer that writes nothing back; the delay by the time sound takes to arrive, 1 / r spreading, and the air's absorption as a lowpass whose corner falls log-linearly from 18 kHz at 150 m to 30 Hz at 20 km (its two anchors); crackle as shocklets at random, up to 900 a second at full thrust, leaning positive; a reverb whose impulse response is made in code; a panner through a head (HRTF) |
| The operator's subsim, `spec/SPEC-dsp.md` REQ-AUDIO-005 (at `ceb0059`), Bo Chen, unpublished | none stated; an idea only | that compressed time is not played as if it were real: here quieter at each doubling and silent from 50×, not muted above 1× |
| K. Sutton and R. A. Graves, *A general stagnation-point convective-heating equation for arbitrary gas mixtures*, NASA TR R-376 (1971) | public domain, a work of the US government | the stagnation heating k √(ρ / r) v³ with k = 1.7415 × 10⁻⁴ for air, which an entry's plasma is as loud as |
| H. D. Curtis, *Orbital Mechanics for Engineering Students*, algorithms 3.3 and 3.4; D. A. Vallado, *Fundamentals of Astrodynamics and Applications* | textbook methods | the map's Kepler's problem by the universal variable: Stumpff's functions, Newton's method on Kepler's equation, the Lagrange coefficients (Curtis), and the starting guess for a hyperbola (Vallado). As methods; the code is ours |
| W. H. Clohessy and R. S. Wiltshire, *Terminal guidance system for satellite rendezvous*, Journal of the Aerospace Sciences 27 (1960) | the paper's result | the frame that turns with a round orbit (radial, along the track, across it) that the map draws a rendezvous in; and, as a test, that a craft 1 km below drifts ahead at 3/2 n Δh |
| Natural Earth's coastlines and lakes (above) | public domain | drawn again by the map, on its globe and its ground track, from `web/data/land.js` |
| ISO 9613-1:1993, *Acoustics — Attenuation of sound during propagation outdoors — Part 1: Calculation of the absorption of sound by the atmosphere* | the standard's formula, as a method; no text of the standard is copied | the air's absorption of sound by frequency, temperature, humidity and pressure (the oxygen's and the nitrogen's relaxation and the classical term), coded in `airAbsorption`; a test holds it to the values ISO 9613-2's table 2 gives at 10 and 20 °C |
| W. C. Sabine (1900) and C. F. Eyring, *Reverberation time in "dead" rooms*, J. Acoust. Soc. Am. 1 (1930); the critical distance after Hopkins and Stryker (1948) | textbook methods | each room's reverberation time by octave from its volume, its surfaces and the air, −S ln(1 − ᾱ) + 4mV; its diffuse field against a sound's own, √(16π / A) |
| tables of absorption coefficients by octave, 125 Hz to 4 kHz, for grass and turf, water, heavy glass, concrete and paving, rubber flooring, perforated metal over an absorber, steel panels, as textbooks of architectural acoustics reproduce them | facts, rounded | the coefficients in `MATERIALS`; their ends at 63 Hz and 8 kHz, and which material stands for which surface of the band, the lobby and a car, are this project's |
| G. B. Whitham, *The flow pattern of a supersonic projectile*, Comm. Pure Appl. Math. 5 (1952); H. W. Carlson, *Simplified sonic-boom prediction*, NASA TP-1122 (1978) | a method; Carlson's is public domain, a work of the US government | the boom heard where the Mach cone's surface passes the ear, an N-wave whose overpressure falls as the distance to the −¾, with the air's pressure where it is made and where it is heard; the N-wave's length from the craft's at the cone's angle. A rule of scale from them, not Carlson's whole method |
| M. Minnaert, *On musical air-bubbles and the sounds of running water*, Phil. Mag. 16 (1933) | the paper's result | a bubble rings at about 3.26 m/s over its radius in water at a bar: the canal's bubbles |
| R. McN. Alexander and A. S. Jayes, *A dynamic similarity hypothesis for the gaits of quadrupedal mammals*, J. Zool. 201 (1983) | an idea | the Froude number's similarity: at a given v² / g L the cadence goes as √(g / L), which with the cadence's rise with the speed (to the 0.4, fitted here to 1.87 steps a second at 1.4 m/s and 2.85 running at 4) makes the walk's g to the 0.3 |
| J. W. Cooley and J. W. Tukey, *An algorithm for the machine calculation of complex Fourier series*, Math. Comp. 19 (1965) | textbook method | the transform the rooms' answers are made with, frame by frame in the frequency domain |
| this project | — | the sound's instrument and every level and trim; the hull's modes for a 28 m craft; the runway's joints every 6 m; the flight deck's voices (the hover's thrum and its mode, the duct, the lift jet's whine, the roll posts, the actuators, the plating's modes) and how the jets' work is found from the craft's motion; the Ring's rooms' shapes, their echoes and the band's 20 dB lift; the footsteps' surfaces, the canal, the town's hum, the draught, the lifts, the hatch; the tour's tone. The map's views, its layout and the Ring's orbit found from the readouts |

#### Rigour

`flight/orbit/INVARIANTS.md`, `flight/orbit/test/test_invariants.cpp` and `flight/orbit/evidence/` are
ours, GPLv3. Nothing in them is copied from the sources below; the two of the owner's are read for their
method, and Abacus is run, not shipped.

| source | licence | what is taken |
|---|---|---|
| Subsim, the owner's own submarine simulator (a private repository, read at `ceb0059`): its `INVARIANTS.md`, `GATES.md`, `CONVENTIONS.md`, and ADRs 0008 (determinism and numerics), 0011 (data with receipts) and 0016 (gates with negative controls) | the owner's own | as a doctrine. Each invariant names what enforces it. Each check is shown able to fail. A test that could not set up what it measures fails rather than passes. A tolerance is derived, never fitted. Every quoted number has a receipt. The same binary gives the same hash, and different builds a bounded deviation |
| Abacus, the owner's catalogue of certified math commands (a private repository; abacus 0.1.0 at `14025b5`, built outside this repository for this work) | MIT, the owner's | used, not shipped: its `check.contains`, `check.equal`, `check.units`, `units.const` and `float.inspect` certify the sketch's numbers. Its 76 requests and answers, each with its SHA-256 receipt, are in `flight/orbit/evidence/`, whose `INDEX.md` says what each backs; `abacus batch` re-runs them. Nothing of Abacus is in this repository or in any build |
| NIST, CODATA 2022 recommended values, through Abacus's frozen copy of NIST's table | facts | standard gravity, 9.80665 m/s², exact |
| IERS Conventions (2010), Table 1.1; WGS 84 (NIMA TR8350.2) | facts | the Earth's gravitational parameter, 3.986004418×10¹⁴ m³/s², which the core uses. The Earth's turn among the stars, 7.292115×10⁻⁵ rad/s, against which the core's 7.2921159×10⁻⁵ (2π over the mean sidereal day) was checked |
| H. Moritz, *Geodetic Reference System 1980* | facts | the Earth's mean radius, 6,371,008.8 m, of which the core's sphere is the kilometre |
| ISO 2533:1975, *Standard Atmosphere* | facts | the gas constant the core uses, 287.05287 J/(kg K), the 1976 standard's own being 287.05307 |
| The Astronomical Almanac's low-precision formulas for the Sun; J. Meeus, *Astronomical Algorithms* (2nd ed., 1998), chapter 25 | methods | the Sun's declination on 12 November 2026, worked two ways, against the core's −17.9° |
| D. Brouwer, "On the accumulation of errors in numerical integration", *Astronomical Journal* 46 (1937), 149–153 | method | rounding over many steps as a random walk, for the invariants' bounds |
| W. Kahan, "Further remarks on reducing truncation errors", *Communications of the ACM* 8 (1965), 40 | method | compensated summation, so the ledgers add no rounding of their own |
| E. Hairer, S. P. Nørsett and G. Wanner, *Solving Ordinary Differential Equations I* (2nd ed., 1993) | method | RK4's order, and the difference of a second- and a fourth-order rule as an estimate of error, for the ledgers' bounds |

The drive, 2,000 s of specific impulse at 1.2 times the take-off weight, is the sketch's one fiction,
and its README says so. The coastlines are real; the land's colours and the clouds are not. Nothing
here is fit for navigation, and none of it describes a real vehicle.

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
| Emscripten (emsdk) | `flight/`'s WebAssembly build (P7), and `flight/orbit`'s: build only, but its JavaScript runtime and system libraries are linked into the module (§2b) | emsdk MIT; Emscripten MIT or NCSA; musl MIT; libc++ Apache-2.0 with LLVM exception | no, installed separately, `6.0.12` |
| three.js | `flight/web`: the out-the-window view, bundled into the page at build time; `flight/orbit`'s page too, from `flight/web`'s install | MIT | no, `npm i`, `0.186.1` |
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
