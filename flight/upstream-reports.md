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

## 4 · The ELAC's high-AoA protection acts on an alpha lagged by 2 s, and keeps swinging after a fast entry

Drafted 2026-11-01 by the P7 session, **not filed**: it waits for the operator's word. Our condition for
writing it was that the overshoot persist on an airframe fitted where it happens; it did. The lag was
then tested directly, before the operator's decision, in a throwaway copy of the sources (the table
below), and the test narrowed the report: the lag keeps the protection swinging; it does not make the
first overshoot.

**Title:** ELAC: the high-AoA protection acts on an alpha lagged by 2 s, and keeps swinging after a fast entry

**Body:**

In `fbw-a32nx/src/wasm/fbw_a320/src/model/ElacComputer.cpp` (`master`, 66021c2), the ELAC passes the
angle of attack it takes from the ADRs through a first-order lag before anything uses it:

```cpp
ElacComputer_LagFilter(static_cast<real_T>(rtb_alpha), ElacComputer_P.LagFilter_C1, ElacComputer_U.in.time.dt,
  &rtb_Y, &ElacComputer_DWork.sf_LagFilter_a);
```

(lines 545–546). `LagFilter_C1` is 0.5 (`ElacComputer_data.cpp`, line 103), and `ElacComputer_LagFilter`
(lines 132–149) is the bilinear form of C1 / (s + C1), so `rtb_Y` follows alpha with a time constant of
2 s. The high-AoA protection acts on that lagged alpha. It engages when `rtb_Y` exceeds α prot (line 1161),
and stays engaged until the stick is pushed forward — past about 3 % of its travel for half a second while
`rtb_Y` is under α max, or past half its travel at once — or, below 200 ft radio height, until `rtb_Y`
falls 2° under α prot (lines 1157–1165). The pitch normal law receives `rtb_Y` as `In_alpha_deg` (the
`LawMDLOBJ5.step` call from line 1435, `&rtb_Y` on line 1438), lags it again by 0.625 s
(`PitchNormalLaw.cpp`, line 1874, `LagFilter1_C1` = 1.6), and regulates the difference between that and
the alpha the stick asks for, with the difference's rate.

We run the ELAC, SEC, FAC and FCDC unmodified, outside MSFS, against JSBSim airframes — an A320 model of
our own and JSBSim's 737 — and log the ELAC's own outputs every step. From level flight at 150 kt and
8,000 ft in CONF FULL (α prot 10.6°, α max 13.0°), with full back stick held for 20 s, our A320's true
alpha passes α prot 1.6 s before the lagged one does, and the protection engages only then, with the
true alpha at 17°. It pushes on a lagged alpha still near 11° while the true alpha falls to −4°, then
pulls on a lagged alpha near 1° while the true alpha rises to 20°; the swing repeats about every 9 s,
and is still between 5° and 17° when the stick is let go. JSBSim's 737 overshoots to 19.5°, swings down
to 2.7° and back to 14.3°, and settles at α max.

Whether an airframe keeps swinging is partly its own: its short period and its pitch response near the
stall. Fitting our A320's pitch response to cited data — MIL-F-8785C's short-period limits, published
elevator-hold measurements and NASA's GTM post-stall data — every setting inside those bands still
swings back to 16° to 20°, the first overshoot 15.3° to 16.7°, wherever the fit puts the airframe. So we
changed `LagFilter_C1` alone, to 5 (a 0.2 s lag), in a copy of the same sources, and flew the same
manoeuvres:

| full back stick from 150 kt, CONF FULL | lag 2 s, as it is | lag 0.2 s |
|---|---|---|
| our A320: true alpha when the protection engages | 17.0° | 12.0° |
| our A320: the true alpha's swings | 17.1° → −4.1° → 20.4° → 5.3° | 16.9° → −3.6° → 14.2° → 9.1° → 13.5° |
| our A320: the last 5 s of the hold | 5.3° to 16.5° | 10.5° to 13.5° |
| JSBSim's 737: the true alpha's swings | 19.5° → 2.7° → 14.3°, then settled | 16.6° → 6.7° → 11.3° → 7.2° → 15.2° |
| entered slowly, idle into the protection: highest alpha, A320 / 737 | 13.8° / 13.9° | 13.3° / 13.1° |

On our A320, then, the lag is what keeps the protection swinging: with it at 0.2 s the same pull settles
toward α max within the hold, where with 2 s it still swings between 5° and 17° when the stick is let
go. The lag is not what makes the first overshoot, which stays near 17° though the protection engages
1.4 s sooner — the fit found it at 15.3° to 16.7° whatever the airframe — and a shorter lag is not free:
on the 737 it lowered the first overshoot and drew out the swings after it. Entered slowly, the
protection holds α max more closely with the shorter lag on both.

We don't know whether the lag is meant to be this long — the vanes' noise may call for a filter — nor
whether MSFS's flight model, which the laws are tuned against, swings as ours does; 0.2 s was a
diagnostic, not a proposal. What we would ask: whether the protection should engage on, and regulate,
an alpha with less lag, or with some phase advance — an alpha-rate or pitch-rate term — so that after a
fast entry it does not keep acting on where the aircraft was.

---

§1 to §3 came out of `flight/`'s A320 targets (`flight/targets/a320-speeds.csv`, which corrects the
three points and says so) and its law harness; see `flight/README.md`, Findings. §4 came out of P7's
step 4, the protections, the airframe fit after it, and a direct test of the lag in a copy of the
sources, deleted after; see `flight/README.md`, the protections.
