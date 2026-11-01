/**
 * The dispatch list.
 *
 * One tick, fixed order, hand-written and causal — the PSX `Core` pattern (notes 01, 09). A
 * consumer never reads a node its producer has not written this pass, except where the real
 * aircraft also has a one-tick lag: a generator contactor closes on the *previous* tick's engine
 * state, exactly as a real ELAC sees a stale generator discrete.
 *
 * Order: APU → electrical → fuel → bleed → engines → hydraulics.
 *   APU first: it is what lets an engine start on a cold aircraft.
 *   Electrical before fuel: pumps are electric.
 *   Bleed before engines: the starter is air.
 *   Hydraulics last: every hydraulic pump needs an engine or the electric network.
 */

import type { Dictionary } from '../dictionary.ts';
import { declareApu, updateApu } from './apu.ts';
import { declareElec, updateElec } from './elec.ts';
import { declareFuel, updateFuel, type FuelState } from './fuel.ts';
import { declareBleed, updateBleed } from './pneumatic.ts';
import { declareEngine, updateEngine } from './engine.ts';
import { declareHyd, updateHyd } from './hydraulic.ts';
import { declarePress, updatePress } from './press.ts';
import { declareFaults } from '../faults/index.ts';

export interface World {
  /** ground power cart connected */
  externalPowerAvailable: boolean;
  /** low-pressure ground air cart connected */
  groundAirAvailable: boolean;
  /** pressure altitude; B1 has no aero, so this is a world input, default 0 */
  pressureAltitudeFt?: number;
  /** what is actually in the tanks */
  tanks: FuelState;
  ratDeployed: boolean;
}

export function declareAll(d: Dictionary): void {
  declareApu(d);
  declareElec(d);
  declareFuel(d);
  declareBleed(d);
  declareEngine(d, 1);
  declareEngine(d, 2);
  declareHyd(d);
  declarePress(d);
  declareFaults(d);
}

export function tick(d: Dictionary, w: World, dt: number): void {
  const apuRunning = d.bool('sys.apuRunning');
  const eng1 = d.bool('sys.eng1Running');
  const eng2 = d.bool('sys.eng2Running');

  // 1 — APU. The ECB is a DC consumer, so it needs DC power that already exists.
  updateApu(
    d,
    { dcPowered: d.bool('bus.dcBat') || d.bool('bus.dcEss'), groundAirAvailable: w.groundAirAvailable },
    dt,
  );

  // 2 — electrical network, using last tick's engine state for the generator contactors
  updateElec(d, {
    eng1Running: eng1,
    eng2Running: eng2,
    apuRunning,
    externalPowerAvailable: w.externalPowerAvailable,
  });

  // 3 — fuel
  updateFuel(d, w.tanks);

  // 4 — bleed: engines feed their own side, APU feeds the left duct
  updateBleed(d, {
    eng1Running: eng1,
    eng2Running: eng2,
    apuRunning,
    groundAirAvailable: w.groundAirAvailable,
  });

  // 5 — engines: air on the duct, fuel at the valve
  updateEngine(d, 1, { bleedAvailable: d.bool('sys.bleedDuctL'), fuelAvailable: d.bool('sys.fuelToEng1') }, dt);
  updateEngine(d, 2, { bleedAvailable: d.bool('sys.bleedDuctR'), fuelAvailable: d.bool('sys.fuelToEng2') }, dt);

  // 6 — pressurisation: packs are the only air source, altitude comes from the world
  updatePress(d, { altFt: w.pressureAltitudeFt ?? 0, packsOn: d.bool('sys.pack1Running') || d.bool('sys.pack2Running') }, dt);

  // 7 — hydraulics: engine pumps and the electric pump, which needs AC ESS
  updateHyd(d, {
    eng1Running: eng1,
    eng2Running: eng2,
    ratDeployed: w.ratDeployed,
    elecPowered: d.bool('bus.acEss'),
  });
}



