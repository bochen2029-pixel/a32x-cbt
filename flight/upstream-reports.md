# Reports for FlyByWire A32NX — drafted, not posted

Two defects found in the A32NX sources while running its flight control computers outside MSFS.
Both are drafted below as issues for `flybywiresim/aircraft`.

**Status: not posted.** Posting puts them on GitHub under the operator's account, so it waits for
the operator's yes on this text. Checked on 2026-11-01: `master` of `flybywiresim/aircraft` was
`66021c24448c44399a8ff569eb14715b6b26558e`, the commit this project pins, so both defects are in
current code. Searches of the repository's issues and pull requests for `idLeftSpoilerPosition`,
"spoiler position out of bounds", "NXSpeeds VLS", "NXSpeeds stall speed", "VS1G CONF 1+F" and "VLS
CONF 3 wrong" found nothing about either.

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

These came out of `flight/`'s A320 targets (`flight/targets/a320-speeds.csv`, which corrects the
three points and says so) and its law harness; see `flight/README.md`, Findings.
