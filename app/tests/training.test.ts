/**
 * Scoring tests.  node --test tests/training.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Dictionary } from '../src/dictionary.ts';
import { declareAll, tick, type World } from '../src/systems/index.ts';
import { Scorer, formatDebrief, type Procedure } from '../src/training/procedure.ts';
import { powerUp } from '../src/training/powerup.ts';

const ground: World = {
  externalPowerAvailable: true,
  groundAirAvailable: false,
  tanks: { leftHasFuel: true, rightHasFuel: true, centerHasFuel: false },
  ratDeployed: false,
};

function rig() {
  const d = new Dictionary();
  declareAll(d);
  return d;
}

/** Run n seconds of model + scorer at 20 Hz. */
function run(d: Dictionary, s: Scorer, w: World, seconds: number): void {
  const steps = Math.round(seconds / 0.05);
  for (let i = 0; i < steps; i++) {
    tick(d, w, 0.05);
    s.tick(0.05);
    if (s.done) break;
  }
}

/** Get the APU available the way a trainee would, before the procedure clock matters. */
function apuUp(d: Dictionary, w: World): void {
  d.set('sw.bat1', true);
  d.set('sw.bat2', true);
  for (let i = 0; i < 20; i++) tick(d, w, 0.05);
  d.set('sw.apuMaster', true);
  d.set('sw.apuStart', true);
  for (let i = 0; i < 600; i++) tick(d, w, 0.05);
  assert.equal(d.bool('sys.apuRunning'), true, 'fixture: the APU must be running');
}

test('a complete flow passes with every step done in order', () => {
  const d = rig();
  apuUp(d, ground);
  const s = new Scorer(powerUp, d);
  d.set('sw.extPwr', true);
  d.set('sw.busTie', true);
  run(d, s, ground, 2);
  d.set('sw.fuelPumpL1', true);
  d.set('sw.fuelPumpR1', true);
  d.set('sw.fuelEng1LpValve', true);
  d.set('sw.fuelEng2LpValve', true);
  d.set('sw.hydBlueEpump', true);
  d.set('sw.apuBleed', true);
  run(d, s, ground, 20);

  const r = s.debrief();
  assert.equal(r.passed, true, JSON.stringify(r.steps));
  assert.equal(r.completed, powerUp.steps.length);
});

test('skipping a step is a miss, not a free pass', () => {
  const d = rig();
  apuUp(d, ground);
  const s = new Scorer(powerUp, d);
  d.set('sw.extPwr', true);
  d.set('sw.busTie', true);
  d.set('sw.fuelPumpL1', true);
  d.set('sw.fuelPumpR1', true);
  d.set('sw.fuelEng1LpValve', true);
  d.set('sw.fuelEng2LpValve', true);
  run(d, s, ground, 220); // past the BLUE pump and bleed windows

  const r = s.debrief();
  assert.equal(r.passed, false);
  assert.ok(r.steps.some((x) => x.status === 'missed'), 'a step ran out of time');
});

test('doing a later step early does not advance the cursor past an unfinished one', () => {
  const d = rig();
  const s = new Scorer(powerUp, d);
  d.set('sw.fuelPumpL1', true);
  d.set('sw.fuelPumpR1', true);
  d.set('sw.fuelEng1LpValve', true);
  d.set('sw.fuelEng2LpValve', true);
  run(d, s, ground, 1);
  assert.equal(s.debrief().steps[0].status, 'pending', 'still waiting on EXT PWR');
  assert.equal(s.currentStep?.id, 'ext-pwr');
});

test('a window expiry records the time it was noticed', () => {
  const proc: Procedure = {
    id: 'one',
    title: 'one step',
    steps: [{ id: 'x', label: 'x', done: () => false, withinSec: 1, why: 'because' }],
  };
  const s = new Scorer(proc, new Dictionary());
  for (let i = 0; i < 40; i++) s.tick(0.05);
  const r = s.debrief();
  assert.equal(r.steps[0].status, 'missed');
  assert.ok((r.steps[0].atSec ?? 0) > 1.0 && (r.steps[0].atSec ?? 0) < 1.2, `atSec ${r.steps[0].atSec}`);
});

test('the debrief prints the rationale for what was missed', () => {
  const d = rig();
  const s = new Scorer(powerUp, d);
  run(d, s, ground, 61);
  const text = formatDebrief(s.debrief());
  assert.match(text, /FAIL/);
  assert.match(text, /MISS/);
  assert.match(text, /why it mattered:/);
  assert.match(text, /without ground power/);
});
