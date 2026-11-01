# Reports for FlyByWire A32NX — posted

Two defects found in the A32NX sources while running its flight control computers outside MSFS,
filed as issues on `flybywiresim/aircraft`.

**Status: posted 2026-11-01** on the operator's word (*"post them"*), under their account, with
the text below unchanged:
[#11005](https://github.com/flybywiresim/aircraft/issues/11005) (§1) and
[#11006](https://github.com/flybywiresim/aircraft/issues/11006) (§2); §3 followed later that day as
[#11007](https://github.com/flybywiresim/aircraft/issues/11007). §4 is a draft, not filed: it waits
for the operator's word. Filed through the API with
`gh`: the repository turns blank issues off and asks for its bug-report form, which is built for
reports from the simulator (simulator version, the EFB's build info, steps in the sim). These were
found in source, outside MSFS, so they went as written. Checked on 2026-11-01: `master` of `flybywiresim/aircraft` was
`66021c24448c44399a8ff569eb14715b6b26558e`, the commit this project pins, so both defects are in
current code. Searches of the repository's issues and pull requests for `idLeftSpoilerPosition`,
"spoiler position out of bounds", "NXSpeeds VLS", "NXSpeeds stall speed", "VS1G CONF 1+F" and "VLS
CONF 3 wrong" found nothing about either, and again just before posting, for `idLeftSpoilerPosition`,
"NXSpeeds" and "updateSec spoiler": two unrelated hits (#4432, an S-speed display mismatch; #2889, a
CONF 3 landing feature).

---

## 1 · `updateSec` reads past the spoiler position arrays for SEC 2

**Title:** FBW: `updateSec` reads `idLeftSpoilerPosition[5]` and `idRightSpoilerPosition[5]` for SEC 2

**Body:**

In `fbw-a32nx/src/wasm/fbw_a320/src/FlyByWireInterface.cpp` (`master`, 66021c2), `updateSec` sets
`splrIndex` to 4 for SEC 2 (line 1544), then reads the second spoiler pair's positions with
`splrIndex + 1`:

```cpp
secs[secIndex].modelInputs.in.analog_inputs.left_spoiler_2_pos_deg = -idLeftSpoilerPosition[splrIndex + 1]->get() * 50;
secs[secIndex].modelInputs.in.analog_inputs.right_spoiler_2_pos_deg = -idRightSpoilerPosition[splrIndex + 1]->get() * 50;
```

(lines 1586–1587). For SEC 2 that is index 5 of the five-element arrays declared at
`FlyByWireInterface.h:490-491`, which is undefined behaviour. With the usual member layout,
`idLeftSpoilerPosition[5]` is `idRightSpoilerPosition[0]` and `idRightSpoilerPosition[5]` is the
next member, `idElecDcBus2Powered`. So SEC 2 would see right spoiler 1's deflection as its left
spoiler 2, and the DC BUS 2 flag, scaled by −50, as its right spoiler 2.

The servo-fault reads just above already treat SEC 2 as driving a single pair (lines 1548–1554,
`if (secIndex != 1) … else … = false`). Guarding the two position reads the same way fixes it:

```cpp
if (secIndex != 1) {
  secs[secIndex].modelInputs.in.analog_inputs.left_spoiler_2_pos_deg = -idLeftSpoilerPosition[splrIndex + 1]->get() * 50;
  secs[secIndex].modelInputs.in.analog_inputs.right_spoiler_2_pos_deg = -idRightSpoilerPosition[splrIndex + 1]->get() * 50;
} else {
  secs[secIndex].modelInputs.in.analog_inputs.left_spoiler_2_pos_deg = 0;
  secs[secIndex].modelInputs.in.analog_inputs.right_spoiler_2_pos_deg = 0;
}
```

---

## 2 · Three typos in `NXSpeeds.ts`: CONF 1+F stall speed and CONF 3 VLS

**Title:** NXSpeeds: typos in the CONF 1+F VS1g and CONF 3 VLS tables

**Body:**

In `fbw-a32nx/src/systems/instruments/src/MCDU/legacy/NXSpeeds.ts` (`master`, 66021c2):

1. **`vs`, Conf 1 + F, lines 28–29:** `(m) => 117 + 0.8 + (m - 65)` and `(m) => 121 + 0.8 + (m - 70)`.
   The neighbouring entries multiply (`108 + 0.8 * (m - 55)`), and only the multiplied form meets
   both neighbours (117 kt at 65 t, 121 at 70, 125 at 75). As written, VS1g is 0.8 to 1.8 kt high
   from 65 to 75 t, and steps by +0.8, −1.0 and −1.8 kt at 65, 70 and 75 t. Fix:
   `117 + 0.8 * (m - 65)` and `121 + 0.8 * (m - 70)`.
2. **`vls`, Config 3, 75–80 t, line 135, the CG ≥ 25 % branch:** `151 + m - 65`. The neighbouring
   entries count from their own bracket (`146 + m - 70` on line 134), and only `151 + m - 75` meets
   both neighbours (151 kt at 75 t, the next entry's 156 at 80). As written, that branch is 10 kt high
   across 75–80 t. Fix: `151 + m - 75`.

---

## 3 · The FCDC's output bus starts from uninitialized words

Found 2026-11-01 by the P7 session with GCC's UBSan, after §1 and §2 were filed. Posted the same day
on the operator's word (*"post it"*), text unchanged, as
[#11007](https://github.com/flybywiresim/aircraft/issues/11007), after the same checks: `master` still
`66021c2`, and no issue or pull request on `getBusOutputs`, `FcdcBus` or the Arinc429 constructors.

**Title:** FCDC: `getBusOutputs` builds its bus from uninitialized ARINC 429 words

**Body:**

In `fbw-a32nx/src/wasm/fbw_a320/src/fcdc/Fcdc.cpp` (`master`, 66021c2), `getBusOutputs` starts with
`FcdcBus output = {};` (line 502). `FcdcBus` is made of `Arinc429DiscreteWord` and
`Arinc429NumericWord` members, whose default constructors are user-provided and empty
(`Arinc429.cpp` lines 4, 85 and 103), so `= {}` leaves each word's `rawSsm` and `rawData` holding
whatever the stack held. `setBit` (`Arinc429.cpp:100`) then converts that float to `uint32_t`, which
is undefined when the value is out of range or not a number, and every bit the FCDC does not set
comes from that conversion of whatever was on the stack. So the EFCS status words can carry
different bits from one call to the next for the same FCDC state. UBSan reports the conversion at
`Arinc429.cpp:100`.

Initializing the words fixes it for every user of the class, for example:

```cpp
template <typename T>
Arinc429Word<T>::Arinc429Word() : rawSsm(0), rawData(0) {}
```

(with the empty `Arinc429DiscreteWord` and `Arinc429NumericWord` constructors left as they are,
since they run the base constructor first).

---

## 4 · The ELAC's high-AoA protection flies an alpha lagged by 2 s

Drafted 2026-11-01 by the P7 session, **not filed**: it waits for the operator's word. Our condition for
writing it was that the overshoot persist on an airframe fitted where it happens; it did (below).

**Title:** ELAC: the high angle-of-attack protection engages on, and holds, an alpha lagged by 2 s

**Body:**

In `fbw-a32nx/src/wasm/fbw_a320/src/model/ElacComputer.cpp` (`master`, 66021c2), the ELAC passes the
angle of attack it takes from the ADRs through a first-order lag before anything uses it:

```cpp
ElacComputer_LagFilter(static_cast<real_T>(rtb_alpha), ElacComputer_P.LagFilter_C1, ElacComputer_U.in.time.dt,
  &rtb_Y, &ElacComputer_DWork.sf_LagFilter_a);
```

(lines 545–546). `LagFilter_C1` is 0.5 (`ElacComputer_data.cpp`), and `ElacComputer_LagFilter`
(lines 132–149) is the bilinear form of C1 / (s + C1), so `rtb_Y` follows alpha with a time constant
of 2 s. That lagged alpha is the one the high-AoA protection uses throughout: it engages when `rtb_Y`
exceeds α prot (line 1161) and stays engaged while `rtb_Y` is within 2° of it (line 1164), and the
pitch normal law receives it as `In_alpha_deg` (the `LawMDLOBJ5.step` call from line 1435, `&rtb_Y` on
line 1438), the alpha its protection regulates. It is also the alpha the ELAC reports
(`adr_computation_data.alpha_deg`, line 1749).

On a fast entry the protection therefore engages late, and then acts on where the aircraft was. We run
the ELAC, SEC, FAC and FCDC unmodified, outside MSFS, against JSBSim airframes — an A320 model of our
own and JSBSim's 737 — and log the ELAC's own outputs every step. From level flight at 150 kt and
8,000 ft in CONF FULL (α prot 10.6°, α max 13.0°), full back stick held for 20 s, on our A320:

- the true alpha passes α prot about 1.5 s before the lagged one does, and the protection engages
  only then, with the true alpha already at 16–17°;
- it pushes, on a lagged alpha still near 11°, while the true alpha falls to −4°; then pulls, on a
  lagged alpha near 1°, while the true alpha rises to 20°;
- the cycle repeats about every 8 s, the true alpha between −4.1° and 20.4°, for as long as the stick
  is held.

JSBSim's 737 under the same computers overshoots as far on the first swing, to 19.1°, and then settles
at α max within a cycle. Entered slowly — idle from 150 kt into the protection, then full back stick —
our A320 holds 12.1° to 13.8° without ringing.

Whether an airframe keeps ringing is the airframe's: its short period and its pitch response near the
stall. But the size of the first overshoot did not move with the airframe. Fitting our A320's pitch
response to cited data — MIL-F-8785C's short-period limits, published elevator-hold measurements and
NASA's GTM post-stall data — every setting inside those bands still swings back to 16° to 20°, the
first overshoot 15.3° to 16.7°, wherever the fit puts the airframe. That points us at the lag rather
than the airframe, though we cannot rule out that MSFS's flight model, which the laws are tuned
against, behaves differently.

We don't know whether the lag is meant to be this long — the vanes' noise may call for a filter — and
we have not changed the computers to try alternatives. Two directions we would look at: engaging the
protection on an alpha with less lag, and giving the regulated alpha some phase advance (an alpha-rate
or pitch-rate term), so that the protection does not act on where the aircraft was two seconds before.

---

§1 to §3 came out of `flight/`'s A320 targets (`flight/targets/a320-speeds.csv`, which corrects the
three points and says so) and its law harness; see `flight/README.md`, Findings. §4 came out of P7's
step 4, the protections, and the airframe fit after it; see `flight/README.md`, the protections.
