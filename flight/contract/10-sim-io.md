# The sim I/O layer (MSFS driver side)

> This is **layer 1**, the MSFS driver's struct. It is *not* the port contract — see `11-bus-contract.md` for the layer the computers actually consume. Kept because it is the full inventory of what the driver supplies, and 34 of its fields are provably dead.
>
> Recovered from `fbw-a32nx/src/wasm/fbw_a320/src/interface/SimConnectData.h` — 196 lines,
> **152 fields across 9 structs** [R]. GPLv3. This is the complete boundary between the
> MSFS driver and the MSFS world — the layer that gets deleted, not ported.

Files here:

- `contract.ts` — the same 152 fields as TypeScript, generated from the header, MSFS
  types replaced.
- `fields.json` — the parse, so the TS can be regenerated.

## Direction split

| struct | fields | direction |
|---|---|---|
| `SimData` | 114 | world → computers |
| `SimInput` | 1 (a 3-vector) | pilot → computers |
| `SimInputRudderTrim` | 3 | pilot → computers |
| `SimInputAutopilot` | 23 | pilot → computers |
| `SimInputThrottles` | 3 | pilot → computers |
| `SimOutputZetaTrim` | 1 | computers → world |
| `SimOutputThrottles` | 4 | computers → world |
| `SimOutputFlaps` | 1 | computers → world |
| `SimOutputSpoilers` | 1 | computers → world |
| `SimOutputAltimeter` | 1 | computers → world |

Inbound 146, outbound 8.

## The write-back surface is eight scalars

`SimConnectInterface::sendData` has one overload per struct, each forwarding to a
SimConnect data definition id [R]:

```cpp
bool SimConnectInterface::sendData(SimOutputZetaTrim output)  { return sendData(3, sizeof(output), &output); }
bool SimConnectInterface::sendData(SimOutputThrottles output) { return sendData(4, sizeof(output), &output); }
bool SimConnectInterface::sendData(SimOutputSpoilers output)  { return sendData(6, sizeof(output), &output); }
bool SimConnectInterface::sendData(SimOutputAltimeter output) { return sendData(7, sizeof(output), &output); }
```

So the entire aircraft-to-world contract is: rudder trim position, two throttle lever
positions, two managed modes, flaps handle index, spoilers handle position, altimeter
setting. A world adapter needs **five channels, eight numbers**. That is the whole
implementation surface for a driver.

## 34 of the 114 inbound fields are dead

Collected from the sim and never referenced anywhere in the crate [M]: searched
`fbw_a320`, `fadec_a32nx`, `extra-backend-a32nx` for `.<field>` — zero hits for every one
of these:

```
alpha_stall_deg            ambient_density_kg_per_m3    ap_H_c_ft
ap_V_c_kn                  beta_dot_deg_s               engine_1_thrust_lbf
engine_2_thrust_lbf        engine_n1_1                  engine_n1_2
engineAntiIce_2            engineEngineOilPressure_1    engineEngineOilPressure_2
engineEngineOilTemperature_1  engineEngineOilTemperature_2
gpsCourseToSteer           gpsIsFlightPlanActive        gpsWpCrossTrack
gpsWpTrackAngleError       is_mach_mode_active          isAutoThrottleActive
kohlsmanSetting_1          kohlsmanSetting_2            linear_cl_alpha_per_deg
nav_valid                  seaLevelPressure             simOnGround
speed_slot_index           spoilers_left_pos            spoilers_right_pos
throttle_lever_2_pos
```

So the working contract is **80 inbound fields**, not 114. The dead 34 are leftovers from
an earlier architecture — aerodata that moved to the FADEC, GPS that moved to the FMS,
duplicate N1 spellings (`engine_n1_1` vs `engine_N1_1_percent`).

Do not carry them. A port that implements 80 fields is complete against the current
build.

## The two vendor types to replace

| MSFS type | replacement |
|---|---|
| `SIMCONNECT_DATA_XYZ` | `{ x, y, z }` — body-axis rotation velocity and acceleration |
| `SIMCONNECT_DATA_LATLONALT` | `{ lat, lon, alt }` — only for `nav_loc_pos`, `nav_gs_pos` |

Those are the only two SDK types in the header. Everything else is `double` or
`unsigned long long`.

## Units are the field name

`_kn`, `_ft`, `_fpm`, `_deg`, `_deg_s`, `_m_s2`, `_m`, `_kg`, `_kg_per_m3`, `_mbar`,
`_celsius`, `_nmi`, `_percent`, `_lbf`, `_g`. There is no separate unit table because the
naming *is* the table, and it is consistent across all 152 fields.

**Rule for the port: never convert inside the computers.** The computers are written
against these suffixes; a world adapter that supplies SI leaks a conversion bug into the
law. Convert once, at the edge, on the way in and on the way out.

## The one enum

`SimOutputThrottles.throttleManagedMode_<n>` is documented in the header [R]:

```
0 UNKNOWN · 1 REVERSE · 2 IDLE · 3 AUTO · 4 CLIMB · 5 FLEX_MCT · 6 TOGA · 7 HOLD
```

This is the A320 detent ladder and it is the only declared enumeration in the contract.

## Boolean fields

19 of the 152 are boolean flags typed `unsigned long long` upstream; 128 are numbers and 5 are composites (2 × Vec3, 2 × LatLonAlt, 1 × the stick 3-vector). They are `>` -tests
in C++, so they become `boolean` in `contract.ts` and must be **rejected if not 0 or 1**
rather than coerced — a stray 2 is a bug in the world adapter, not in the computers.

## What this means for the port

The boundary is small, typed, and fully enumerable. A world adapter is: fill 80 numbers,
call the computers' update with the same timestep the driver passes
(`simulationTime` / `simulation_rate`), read back 8 numbers. No callback API, no
pointers, no sim handles.

That is the entire risk item from note 11, closed.

## Provenance

- Header: `C:\FID\747\a32nx\fbw-a32nx\src\wasm\fbw_a320\src\interface\SimConnectData.h`
- Driver: `...\src\FlyByWireInterface.cpp` (80 field reads, 5 write channels)
- Interface: `...\src\interface\SimConnectInterface.cpp` (sendData overloads)
- Repo HEAD `66021c2`, 2026-10-28.





