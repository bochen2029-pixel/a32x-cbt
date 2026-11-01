/**
 * Two trainees, one procedure.
 *
 *   node src/demo-flow.ts
 *
 * A does the flow in order and passes. B powers up, works the fuel panel, and stops — the debrief
 * names what was missed and why it mattered. Model, clock, procedure, score, rationale.
 */

import { Dictionary } from './dictionary.ts';
import { declareAll, tick, type World } from './systems/index.ts';
import { Scorer, formatDebrief } from './training/procedure.ts';
import { powerUp } from './training/powerup.ts';

type Action = readonly [sec: number, do: (d: Dictionary) => void];

const world: World = {
  externalPowerAvailable: true,
  groundAirAvailable: false,
  tanks: { leftHasFuel: true, rightHasFuel: true, centerHasFuel: false },
  ratDeployed: false,
};

function session(name: string, actions: readonly Action[]): void {
  const d = new Dictionary();
  declareAll(d);
  const s = new Scorer(powerUp, d);

  const pending = [...actions];
  for (let t = 0; t < 240 && !s.done; t += 0.05) {
    while (pending.length && pending[0][0] <= t) pending.shift()![1](d);
    tick(d, world, 0.05);
    s.tick(0.05);
  }

  console.log(`\n=== ${name}`);
  console.log(formatDebrief(s.debrief()));
}

const power = (d: Dictionary) => {
  d.set('sw.bat1', true);
  d.set('sw.bat2', true);
  d.set('sw.extPwr', true);
  d.set('sw.busTie', true);
};
const fuelPanel = (d: Dictionary) => {
  d.set('sw.fuelPumpL1', true);
  d.set('sw.fuelPumpR1', true);
  d.set('sw.fuelEng1LpValve', true);
  d.set('sw.fuelEng2LpValve', true);
};

session('A: works the flow', [
  [1, power],
  [4, (d) => d.set('sw.apuMaster', true)],
  [5, (d) => d.set('sw.apuStart', true)],
  [34, fuelPanel],
  [38, (d) => d.set('sw.hydBlueEpump', true)],
  [42, (d) => d.set('sw.apuBleed', true)],
]);

session('B: stops after the fuel panel', [
  [1, power],
  [4, (d) => d.set('sw.apuMaster', true)],
  [5, (d) => d.set('sw.apuStart', true)],
  [34, fuelPanel],
]);
