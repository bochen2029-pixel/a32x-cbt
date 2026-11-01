/**
 * The engine-start flow, graded.  node --test tests/startengine.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Dictionary } from '../src/dictionary.ts';
import { declareAll, tick, type World } from '../src/systems/index.ts';
import { Scorer, formatDebrief } from '../src/training/procedure.ts';
import { startEngine1 } from '../src/training/startengine.ts';

const world: World = {
  externalPowerAvailable: false,
  groundAirAvailable: false,
  pressureAltitudeFt: 0,
  tanks: { leftHasFuel: true, rightHasFuel: true, centerHasFuel: false },
  ratDeployed: false,
};

function rig() {
  const d = new Dictionary();
  declareAll(d);
  return d;
}

/** Run the model and the scorer together until the procedure ends or time is up. */
function run(d: Dictionary, s: Scorer, seconds: number, each?: (n: number) => void): void {
  const steps = Math.round(seconds / 0.05);
  for (let i = 0; i < steps && !s.done; i++) {
    tick(d, world, 0.05);
    s.tick(0.05);
    each?.(i);
  }
}

/** Batteries on, APU to available — the state a scenario would hand the trainee. */
function apuReady(): Dictionary {
  const d = rig();
  d.set('sw.bat1', true);
  d.set('sw.bat2', true);
  for (let i = 0; i < 20; i++) tick(d, world, 0.05);
  d.set('sw.apuMaster', true);
  d.set('sw.apuStart', true);
  for (let i = 0; i < 600; i++) tick(d, world, 0.05);
  assert.equal(d.bool('sys.apuRunning'), true, 'fixture: APU must be available');
  return d;
}

test('a clean start passes every step', () => {
  const d = apuReady();
  const s = new Scorer(startEngine1, d);

  d.set('sw.apuBleed', true);
  d.set('sw.fuelPumpL1', true);
  d.set('sw.fuelEng1LpValve', true);
  run(d, s, 20);
  d.set('sw.eng1Start', 1);
  run(d, s, 30); // crank to light-up speed
  d.set('sw.eng1Master', true);
  run(d, s, 60);

  const r = s.debrief();
  assert.equal(r.passed, true, formatDebrief(r));
  assert.equal(r.steps.every((x) => x.status === 'done'), true);
});

test('arming the master too early is caught as a hot start', () => {
  const d = apuReady();
  const s = new Scorer(startEngine1, d);

  d.set('sw.apuBleed', true);
  d.set('sw.fuelPumpL1', true);
  d.set('sw.fuelEng1LpValve', true);
  run(d, s, 20);
  d.set('sw.eng1Start', 1);
  d.set('sw.eng1Master', true); // immediately — the classic mistake
  run(d, s, 200);

  const r = s.debrief();
  assert.equal(r.passed, false, 'a hot start cannot pass');
  assert.equal(r.steps.find((x) => x.id === 'armed-clean')?.status, 'missed');
});

test('starting without the APU bleed is a miss, not a hang', () => {
  const d = apuReady();
  const s = new Scorer(startEngine1, d);

  // bleed deliberately left off
  d.set('sw.fuelPumpL1', true);
  d.set('sw.fuelEng1LpValve', true);
  run(d, s, 20);
  d.set('sw.eng1Start', 1);
  d.set('sw.eng1Master', true);
  run(d, s, 280);

  const r = s.debrief();
  assert.equal(r.passed, false);
  assert.equal(r.steps.find((x) => x.id === 'bleed')?.status, 'missed');
  assert.equal(d.bool('sys.eng1Running'), false, 'the engine never turned');
});

test('the procedure names the reason on the steps it missed', () => {
  const d = apuReady();
  const s = new Scorer(startEngine1, d);
  run(d, s, 310);
  const text = formatDebrief(s.debrief());
  assert.match(text, /why it mattered:/);
  assert.match(text, /no bleed means the starter has nothing/);
});
