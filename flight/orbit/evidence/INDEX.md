# The orbit sketch's numbers, with receipts

Every constant the sketch uses, and every number its README states or its tests assert, is certified
here by Abacus, the owner's catalogue of certified math commands, where it can be, and derived or cited
where it cannot. `flight/orbit/INVARIANTS.md` says what the sketch promises; this says what its numbers
rest on. Each line of `test_invariants.cpp`'s `certified_numbers`, and each bound elsewhere that uses a
number from here, names its request's id.

## What is here, and how to run it again

- `requests.jsonl`: one request a line, each with its `id`, what it `backs` (a test, a document or a line
  of the core) and its `source` (the claim, in words), then the `cmd` and `args` that Abacus runs.
- `batch.jsonl`: the same requests, bare, as `abacus batch` reads them: `requests.jsonl` less each line's
  `id`, `backs` and `source`.
- `results.jsonl`: Abacus's 76 answers, a line each in the same order, each with its grade and receipt.

```
abacus batch --in flight/orbit/evidence/batch.jsonl --out results.jsonl
```

The answers were made by abacus 0.1.0 (`abacus-core 0.1.0+git.14025b54c0d6 gnu-13.3.0 strict-fp`), built
from the owner's repository at that commit for this work, outside this one. Its selftest passed 18 of 18
and its frozen goldens 410 of 410; the other 134 goldens are its exact engine's, which this build leaves
out and no claim here needs. The batch's SHA-256 is `2095782df6e3b2bc…`, and a second run at four jobs
gave `results.jsonl` byte for byte. A receipt's id hashes the request and the answer, not the build
(Abacus's `contracts/envelope.md`), so any build that answers alike prints the same ids.

Every answer is graded `exact`: a decided verdict, "holds" or "refuted", whose certificate, an enclosure
by binary64 intervals with correctly rounded functions or by exact rationals, is in the answer. A
"refuted" is a certified falsehood. Seven are expected: five controls, each showing that a claim next to
one that holds can fail, and the two mismatches in the 1976 table below.

## The receipts

### Constants

| id | the claim | backs | verdict | receipt |
|---|---|---|---|---|
| `g0` | CODATA 2022: standard acceleration of gravity, exact | internal.h G0; test_invariants certified_numbers | 9.80665 (exact) | `abacus1:459b198f39a0` |
| `mu-double` | the literal 3.986004418e14 is a double with no rounding (IERS 2010 / WGS 84's GM) | internal.h MU | the double is exactly 398600441800000 | `abacus1:78523c224cde` |
| `we-sidereal` | 2 pi over the mean sidereal day, 86164.0905 s, to the 8 digits the core writes | internal.h WE; web/src/frames.js WE | holds | `abacus1:c62117bfc2eb` |
| `we-stellar` | 2 pi over the stellar day, 86164.0989 s: the Earth's turn among the stars, the IERS's 7.292115e-5 rad/s to eight digits | the mismatch noted in INDEX.md | holds | `abacus1:c8964e25d579` |
| `we-stellar-control` | control: the core's 7.2921159e-5 is not the turn among the stars (expected refuted) | the mismatch noted in INDEX.md | refuted | `abacus1:2fc3bf562ece` |
| `sidereal-day-hours` | the core's turn takes 23.934 hours | web/test/frames.test.mjs (23.934 h) | holds | `abacus1:72aeab0be33e` |
| `unit-roundoff` | 2^-53, the unit roundoff the bounds are written in | test_invariants U | holds | `abacus1:598e3964a472` |

### The 1976 standard atmosphere

| id | the claim | backs | verdict | receipt |
|---|---|---|---|---|
| `R-iso` | the core's gas constant is ISO 2533's, R*/M with M = 28.96442 | orbit_core.cpp atmosphere(): R = 287.05287 | holds | `abacus1:e540b2ae81b4` |
| `R-1976` | control: the 1976 standard's own R*/M0 (M0 = 28.9644) is not 287.05287 (expected refuted) | the mismatch noted in INDEX.md | refuted | `abacus1:114cf6e0dfef` |
| `a0` | the speed of sound at sea level, sqrt(1.4 R T0) | test_orbit atmosphere (340.29 m/s) | holds | `abacus1:8cc4789cbf08` |
| `rho0` | sea-level density from the 1976 standard's P0, T0, R* and M0 | test_orbit atmosphere (1.2250) | holds | `abacus1:621c731bc4ad` |
| `atm-5km-T` | the 1976 standard from its defining constants (g0, R*, M0, r0, the layers' bases and lapse rates), against the test's value to half its last digit | test_orbit atmosphere (the row at 5000 m) | holds | `abacus1:fff9ccfc681a` |
| `atm-5km-P` | the 1976 standard from its defining constants (g0, R*, M0, r0, the layers' bases and lapse rates), against the test's value to half its last digit | test_orbit atmosphere (the row at 5000 m) | holds | `abacus1:9cc5e3e8c2e1` |
| `atm-5km-rho` | the 1976 standard from its defining constants (g0, R*, M0, r0, the layers' bases and lapse rates), against the test's value to half its last digit | test_orbit atmosphere (the row at 5000 m) | holds | `abacus1:4eb1186d1c90` |
| `atm-11km-T` | the 1976 standard from its defining constants (g0, R*, M0, r0, the layers' bases and lapse rates), against the test's value to half its last digit | test_orbit atmosphere (the row at 11000 m) | holds | `abacus1:79d0a7e03a56` |
| `atm-11km-P` | the 1976 standard from its defining constants (g0, R*, M0, r0, the layers' bases and lapse rates), against the test's value to half its last digit | test_orbit atmosphere (the row at 11000 m) | holds | `abacus1:43cebe387954` |
| `atm-11km-rho` | the 1976 standard from its defining constants (g0, R*, M0, r0, the layers' bases and lapse rates), against the test's value to half its last digit | test_orbit atmosphere (the row at 11000 m) | holds | `abacus1:d8ef898973dc` |
| `atm-20km-T` | the 1976 standard from its defining constants (g0, R*, M0, r0, the layers' bases and lapse rates), against the test's value to half its last digit | test_orbit atmosphere (the row at 20000 m) | holds | `abacus1:446b0b8d2972` |
| `atm-20km-P` | the 1976 standard from its defining constants (g0, R*, M0, r0, the layers' bases and lapse rates), against the test's value to half its last digit | test_orbit atmosphere (the row at 20000 m) | holds | `abacus1:699bd883674d` |
| `atm-20km-rho` | the 1976 standard from its defining constants (g0, R*, M0, r0, the layers' bases and lapse rates), against the test's value to half its last digit | test_orbit atmosphere (the row at 20000 m) | holds | `abacus1:0077484338af` |
| `atm-32km-T` | the 1976 standard from its defining constants (g0, R*, M0, r0, the layers' bases and lapse rates), against the test's value to half its last digit | test_orbit atmosphere (the row at 32000 m) | holds | `abacus1:887d6a663e36` |
| `atm-32km-P` | the 1976 standard from its defining constants (g0, R*, M0, r0, the layers' bases and lapse rates), against the test's value to half its last digit | test_orbit atmosphere (the row at 32000 m) | holds | `abacus1:b34ff861bf64` |
| `atm-32km-rho` | the 1976 standard from its defining constants (g0, R*, M0, r0, the layers' bases and lapse rates), against the test's value to half its last digit | test_orbit atmosphere (the row at 32000 m) | holds | `abacus1:05027def124d` |
| `atm-50km-T` | the 1976 standard from its defining constants (g0, R*, M0, r0, the layers' bases and lapse rates), against the test's value to half its last digit | test_orbit atmosphere (the row at 50000 m) | holds | `abacus1:ff71ea5f06c2` |
| `atm-50km-P` | the 1976 standard from its defining constants (g0, R*, M0, r0, the layers' bases and lapse rates), against the test's value to half its last digit | test_orbit atmosphere (the row at 50000 m) | holds | `abacus1:5b52ad7c6332` |
| `atm-50km-rho` | the 1976 standard from its defining constants (g0, R*, M0, r0, the layers' bases and lapse rates), against the test's value to half its last digit | test_orbit atmosphere (the row at 50000 m) | holds | `abacus1:5d23a4ba8f7a` |
| `atm-71km-T` | the 1976 standard from its defining constants (g0, R*, M0, r0, the layers' bases and lapse rates), against the test's value to half its last digit | test_orbit atmosphere (the row at 71000 m) | holds | `abacus1:c8887f91c15e` |
| `atm-71km-P` | the 1976 standard from its defining constants (g0, R*, M0, r0, the layers' bases and lapse rates), against the test's value to half its last digit | test_orbit atmosphere (the row at 71000 m) | refuted | `abacus1:db388c95010b` |
| `atm-71km-rho` | the 1976 standard from its defining constants (g0, R*, M0, r0, the layers' bases and lapse rates), against the test's value to half its last digit | test_orbit atmosphere (the row at 71000 m) | holds | `abacus1:3735937efe77` |
| `atm-80km-T` | the 1976 standard from its defining constants (g0, R*, M0, r0, the layers' bases and lapse rates), against the test's value to half its last digit | test_orbit atmosphere (the row at 80000 m) | holds | `abacus1:5fc04e8df181` |
| `atm-80km-P` | the 1976 standard from its defining constants (g0, R*, M0, r0, the layers' bases and lapse rates), against the test's value to half its last digit | test_orbit atmosphere (the row at 80000 m) | refuted | `abacus1:15bce2236967` |
| `atm-80km-rho` | the 1976 standard from its defining constants (g0, R*, M0, r0, the layers' bases and lapse rates), against the test's value to half its last digit | test_orbit atmosphere (the row at 80000 m) | holds | `abacus1:2fbc28d6053b` |
| `atm-71km-P-1e-4` | the same, to one part in 10^4: the test's value differs from the standard's in its fifth digit only | the last-digit mismatch noted in INDEX.md | holds | `abacus1:a00750d19b73` |
| `atm-80km-P-1e-4` | the same, to one part in 10^4: the test's value differs from the standard's in its fifth digit only | the last-digit mismatch noted in INDEX.md | holds | `abacus1:dca8adad525b` |
| `thin-100km` | the core's fit above 86 km lies within 20 % of the standard's table at 100 km, 0.8 to 1.2 times it (the table value cited, not derived) | README.md (within 20 %); test_orbit atmosphere (the thin rows, 0.2) | holds | `abacus1:4f9b1b5ef4bd` |
| `thin-120km` | the core's fit above 86 km lies within 20 % of the standard's table at 120 km, 0.8 to 1.2 times it (the table value cited, not derived) | README.md (within 20 %); test_orbit atmosphere (the thin rows, 0.2) | holds | `abacus1:44197632baa0` |
| `thin-200km` | the core's fit above 86 km lies within 20 % of the standard's table at 200 km, 0.8 to 1.2 times it (the table value cited, not derived) | README.md (within 20 %); test_orbit atmosphere (the thin rows, 0.2) | holds | `abacus1:23435550babe` |
| `thin-500km` | the core's fit above 86 km lies within 20 % of the standard's table at 500 km, 0.8 to 1.2 times it (the table value cited, not derived) | README.md (within 20 %); test_orbit atmosphere (the thin rows, 0.2) | holds | `abacus1:a54269313433` |
| `thin-100km-control` | control: at 100 km the fit is 16 % above the table, so not within 15 % of it (expected refuted) | INDEX.md | refuted | `abacus1:a0c82a1dd7f5` |
| `thin-step-120km` | the fit just below 120 km lies above the next segment's start, 2.2e-8: a step down | test_orbit atmosphere (density never rises with height) | holds | `abacus1:36dbd9865fcf` |
| `thin-step-200km` | the fit just below 200 km lies above the next segment's start, 2.5e-10: a step down | test_orbit atmosphere (density never rises with height) | holds | `abacus1:3cc0300f576d` |

### The orbit, the ground and the air

| id | the claim | backs | verdict | receipt |
|---|---|---|---|---|
| `vcirc-500km` | the circular speed at 500 km, sqrt(mu/r) | test_invariants certified_numbers, readouts_are_derived | holds | `abacus1:90a050599ca2` |
| `kepler-500km` | Kepler's period of a round 500 km orbit, 2 pi sqrt(r^3/mu) | test_invariants certified_numbers | holds | `abacus1:fbbbbe965e9b` |
| `kepler-as-flown` | Kepler's period of the orbit as flown, 501.240 x 499.985 km after the thrust's tail | README.md (one revolution 5,669 s); test_orbit kepler_holds (5668.9 s) | holds | `abacus1:a6f115cae1aa` |
| `ring-ahead` | the chord of 25 km of arc on the 6,871 km orbit: the range at arrival | README.md (the Ring 25.0 km ahead) | holds | `abacus1:674253fc7e45` |
| `hold-vrel` | a craft holding 650 m off the Ring's centre on its fixed axis reads n x 650 m against the frame turning with the orbit | README.md (about 0.7 m/s); test_invariants readouts_are_derived | holds | `abacus1:2b575069958f` |
| `qbar-800km` | at 800 km, at any bound orbit's speed (under escape's, 2 mu / r), the fit's dynamic pressure is under 1e-7 Pa; the core pushes only above 1e-6 | test_invariants vacuum_conserves (above the air) | holds | `abacus1:a6598382d332` |
| `drag-500km` | what the thin air at 500 km takes a revolution, -1/2 rho v_air^2 S c_d v / m T, c_d 0.020, m 34,388 kg, the air turning with the Earth at 32.84 degrees | test_invariants thin_air_ledger | holds | `abacus1:1eae0f708e7d` |
| `surface-g` | the model's gravity at the sphere's surface, mu/RE^2: 0.14 % above standard gravity | INDEX.md | holds | `abacus1:115adabd8111` |
| `felt-g` | standing on the plumb-line ground at 32.92 N: gravity less the Earth's turn, in g | test_invariants readouts_are_derived (standing); test_orbit ground_settles (1 g to 1 %) | holds | `abacus1:d60f78830177` |
| `plumb-angle` | the plumb line leans 0.09 degrees from the radius at 32.92 N: square to the sphere, a parked craft would slide | orbit_core.cpp gearLoad (the ground level to the plumb line) | holds | `abacus1:41ba59bea0a7` |

### The drive

| id | the claim | backs | verdict | receipt |
|---|---|---|---|---|
| `tmax` | 1.2 x the take-off weight of 60 t | README.md (706 kN); internal.h T_MAX; test_invariants certified_numbers | holds | `abacus1:ffde175b444f` |
| `flow` | the flow at full thrust, T/(Isp g0): g0 cancels, 36 kg/s exactly | test_invariants mass_bookkeeping; test_orbit rocket_equation | holds | `abacus1:4d0813e2f4d8` |
| `dv-left` | the rocket equation for the propellant the crew has left, 4,388.51 kg | README.md (4.39 t left: about 2.7 km/s) | holds | `abacus1:be644bb38627` |
| `dv-left-rounded` | and 4.39 t, as the README rounds it, is 2.7 km/s to two figures | README.md (about 2.7 km/s) | holds | `abacus1:67fbcaeb7458` |
| `dv-450s` | half the mass in propellant at 450 s of specific impulse | README.md (at 450 s ... 3 km/s) | holds | `abacus1:d8c44f7116a0` |
| `dv-spent` | what the crew spends to orbit, 60 t to 34,388.51 kg at 2,000 s | INDEX.md (a third of what orbit takes) | holds | `abacus1:0017a68423f4` |
| `dv-ratio` | 450 s's 3 km/s is 28 % of what this flight spends | INDEX.md (a third of what orbit takes) | holds | `abacus1:ef28c4ce641d` |
| `max-load` | full thrust over 34.39 t, in g: g0 cancels | README.md (2.09 g at the end of the burn) | holds | `abacus1:c292eafbd710` |

### The Ring

| id | the claim | backs | verdict | receipt |
|---|---|---|---|---|
| `ring-spin-1g` | the spin for one g at the 5 km floor, sqrt(g0/R), is 0.0443 to three figures | orbit_core.h OC_RING_SPIN; README.md | holds | `abacus1:f0bb8bb675b2` |
| `ring-spin-control` | control: 0.0443 is not that spin to 1e-5 (expected refuted): the floor is 0.06 % over one g | INDEX.md | refuted | `abacus1:ec96865cecd8` |
| `ring-g` | 0.0443 rad/s at 5 km is one g to 0.1 % | test_invariants certified_numbers, ring_shape | holds | `abacus1:9f0986dc4461` |
| `ring-omega2R` | omega^2 R at the floor, exactly | INDEX.md | holds | `abacus1:bea4d095aa01` |
| `ring-turn` | 2 pi / 0.0443 | README.md, orbit_core.h (a turn in 142 s); test_invariants ring_shape | holds | `abacus1:38c98e86c68a` |

### The Sun

| id | the claim | backs | verdict | receipt |
|---|---|---|---|---|
| `sun-dec-almanac` | the Sun's declination, 2026-11-12 at 1 pm local mean solar time at KDFW: the Astronomical Almanac's low-precision formulae (0.01 degrees) | sky.cpp (-17.9 degrees); README.md | holds | `abacus1:71542fe62cb4` |
| `sun-dec-meeus` | the same by Meeus, Astronomical Algorithms, chapter 25 (0.01 degrees): an independent second method | sky.cpp (-17.9 degrees); README.md | holds | `abacus1:7383119551d5` |
| `sun-dec-core` | the core's -17.9 is the declination to the nearest tenth, within 0.06 degrees | sky.cpp (-17.9 degrees) | holds | `abacus1:8abf949ff32a` |
| `sun-dec-core-control` | control: and not within 0.04 degrees (expected refuted): -17.9 rounds -17.85 | INDEX.md | refuted | `abacus1:b704a126752c` |

### Dimensions

| id | the claim | backs | verdict | receipt |
|---|---|---|---|---|
| `units-ledger` | the formula's dimensions | test_invariants ledgers | holds | `abacus1:e825432949f7` |
| `units-energy` | the formula's dimensions | test_invariants ledgers | holds | `abacus1:fcbfe2925f0e` |
| `units-flow` | the formula's dimensions | test_invariants mass_bookkeeping | holds | `abacus1:f68aae4983e0` |
| `units-rocket` | the formula's dimensions | README.md, dv-left | holds | `abacus1:b37792363be7` |
| `units-kepler` | the formula's dimensions | kepler-500km | holds | `abacus1:47c002591ecc` |
| `units-hold-vrel` | the formula's dimensions | hold-vrel | holds | `abacus1:d657d4a7cb45` |
| `units-drag-power` | the formula's dimensions | test_invariants thin_air_ledger | holds | `abacus1:9b0125b733d5` |
| `units-ring-g` | the formula's dimensions | ring-g | holds | `abacus1:627d8ec9501d` |

## What Abacus cannot certify, and how each is held instead

| number | where | held by |
|---|---|---|
| mu = 3.986004418e14 m3/s2 | internal.h | a measured constant: the IERS Conventions (2010), Table 1.1, the geocentric gravitational constant; WGS 84 (NIMA TR8350.2) uses the same. `mu-double` shows the literal is a double with no rounding |
| RE = 6,371,000 m | internal.h | a choice of sphere: the IUGG's mean radius, 6,371,008.8 m (H. Moritz, *Geodetic Reference System 1980*), to the kilometre |
| the mean sidereal day, 86,164.0905 s; the stellar day, 86,164.0989 s | `we-*` | the Astronomical Almanac; the IERS (the Earth rotation angle's rate, 1.00273781191135448 turns a UT1 day) |
| the 1976 standard's defining constants | `rho0`, `atm-*` | U.S. Standard Atmosphere, 1976 (NOAA-S/T 76-1562): g0, R* = 8,314.32 J/(kmol K), M0 = 28.9644 kg/kmol, r0 = 6,356,766 m, the layers' base heights and lapse rates, P0 and T0. The `atm-*` requests are the derivation: the standard's formulas, written out and evaluated by Abacus |
| the densities at 100, 120, 200 and 500 km: 5.604e-7, 2.222e-8, 2.541e-10, 5.215e-13 kg/m3 | test_orbit's atmosphere; `thin-*` | the standard's table as printed; not derived here, since above 86 km the standard's density comes from its model of each gas's diffusion |
| R = 287.05287 J/(kg K) | orbit_core.cpp | ISO 2533:1975, the ICAO standard atmosphere's value; `R-iso` shows it is R*/M with M = 28.96442 |
| the Sun's place on the day | `sun-*` | two published low-precision methods, each good to 0.01°: the Astronomical Almanac's formulas for the Sun, and J. Meeus, *Astronomical Algorithms* (2nd ed., 1998), chapter 25. The date, 2026-11-12, is the operator's |
| the flight's own numbers | README.md's table | measured by running the core: the tests and `orbit_run`, below |
| the invariants' tolerances | test_invariants.cpp | derived in INVARIANTS.md from RK4's order, the step and Brouwer's law of rounding; none is fitted to a result |

## Mismatches

1. **The Earth turns at the equinox's rate, not the stars'.** `WE`, 7.2921159e-5 rad/s, is 2π over the
   mean sidereal day (`we-sidereal`): the turn against the moving equinox. A frame fixed among the stars
   wants 2π over the stellar day, 7.2921151e-5 (`we-stellar`; the IERS's 7.292115e-5). They differ by
   7.6e-12 rad/s, 1.0e-7 of the rate (`we-stellar-control`): over the 12½-minute ascent 6 mm at the
   ground, over a day 4 m. Nothing the tests read can see it, and the README's "turning once a sidereal
   day" is true as written. A change would be 7.2921151e-5 in `internal.h` and `web/src/frames.js` together.
2. **The gas constant is ISO 2533's, not the 1976 standard's.** 287.05287 J/(kg K) (`R-iso`) against the
   1976 R*/M0, 287.05307 (`R-1976`): 7e-7 apart. The two standards are one atmosphere to every digit the
   tests read (at 0.5 % no value moves), but the code says "the 1976 standard atmosphere".
3. **Two pressures in test_orbit's table differ from the standard's formulas in the fifth digit.** At
   71 km the test has 4.4795 Pa, the formulas 4.479563 (`atm-71km-P`); at 80 km 1.0524 against 1.052474
   (`atm-80km-P`). Each is within 1e-4 of it (`atm-71km-P-1e-4`, `atm-80km-P-1e-4`), fifty times inside the
   test's 0.5 %, and may be the printed table's own rounding. Every other value in that table is the
   standard's to its last printed digit.
4. **README.md, "airborne 43 s".** The wheels leave the runway at 38.8 s; 42.8 s is when the crew raises
   the gear, at 40 m.
5. **README.md, "729 s to the hold point".** test_orbit's approach_holds prints 730 s, since it looks once
   a second; to the step, the craft is within 5 m and under 0.2 m/s at 728.9 s.
6. **The Sun's declination**, −17.9° in `sky.cpp`, is −17.85° that afternoon by two methods
   (`sun-dec-almanac`, `sun-dec-meeus`): the core's is it to the nearest tenth (`sun-dec-core`), 0.05° off
   (`sun-dec-core-control`), less than a fifth of the Sun's own change over the day.

Not mismatches, but worth knowing. The Ring's floor is at 1.00059 g, 0.0443 rad/s being the spin to three
figures (`ring-spin-1g`, `ring-spin-control`). A round 500 km orbit takes 5,668.14 s; the README's 5,669 s
is the orbit as flown, 501.2 × 500.0 km (`kepler-as-flown`). "At 450 s … a third of what orbit takes":
3.06 km/s is 28 % of the 10.92 km/s this flight spends (`dv-spent`, `dv-ratio`), and about a third of a
typical launch's 9.3 km/s. The model's gravity at the surface is 9.820 m/s², 0.14 % over standard gravity
(`surface-g`), so a craft standing on the plumb-line ground feels 0.99895 g (`felt-g`). sky.cpp's "a third
of the way to the east, it is mid-afternoon": at the end of the burn the craft is 17.5° east of the field,
at 2:23 pm local solar time.

## The flight's numbers: README.md's table

| README.md says | measured | by |
|---|---|---|
| brakes off, rotate, airborne: 20 s, 34 s at 95 m/s, 43 s | 20.02 s; 34.42 s at 95.15 m/s; the wheels off at 38.80 s, the gear up at 42.80 s | `orbit_run` (phases); the readout OC_ON_GROUND; mismatch 4 |
| the turn to 090 from 300 m, banked 30° | from 306.9 m; the bank asked is limited to 30°, and peaks at 31.9° | the readouts OC_ALT, OC_ROLL_DEG |
| highest dynamic pressure 36.6 kPa, at Mach 0.8 and 2 km, the throttle eased | 36,568 Pa at Mach 0.818 and 2,151 m, the throttle at 0.708 | `orbit_run`; test_orbit crew_reaches_orbit (under 40 kPa) |
| highest load 2.09 g, at the end of the burn | 2.0887 g at 744.7 s | `orbit_run`; `max-load` |
| above the air (q̄ under 1 kPa): 38.6 km, 192 s | 38,594 m at 192.02 s | `orbit_run` (phase 5) |
| engine off, in orbit: 753 s, 500.4 × 499.7 km, inclined 32.84° | 752.58 s; 500.43 × 499.67 km; 32.844° | `orbit_run`; test_orbit crew_reaches_orbit |
| propellant left 4.39 t of 30: about 2.7 km/s | 4,388.5 kg: 2,677.7 m/s | test_orbit crew_reaches_orbit; `dv-left`, `dv-left-rounded`; test_invariants mass_bookkeeping |
| the Ring 25.0 km ahead, closing at 0.3 m/s | 25,000.03 m (`ring-ahead`); 0.29 m/s five seconds on, once the thrust's tail is gone | test_orbit crew_reaches_orbit |
| the crew's approach: 729 s to the hold point, 300 m off the hub's port | 730 s by the test's measure, 728.9 s to the step; 0.02 m off it after three hours | test_orbit approach_holds; test_invariants crew_flight_finite; mismatch 5 |
| one revolution: 5,669 s, Kepler's period for the orbit to 0.02 s | 5,668.9 s; above the air, two revolutions to 2e-9 s | test_orbit kepler_holds; `kepler-as-flown`; test_invariants vacuum_conserves |
| a craft holding off its hub reads about 0.7 m/s | 0.7206 m/s; n × 650 m = 0.72053 m/s | `hold-vrel`; test_invariants readouts_are_derived |
