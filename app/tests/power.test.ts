/**
 * APU and engine start tests.  node --test tests/power.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Dictionary } from '../src/dictionary.ts';
import { declareAll, tick, type World } from '../src/systems/index.ts';

const groundWorld: World = {
  externalPowerAvailable: false,
  groundAirAvailable: false,
  tanks: { leftHasFuel: true, rightHasFuel: true, centerHasFuel: false },
  ratDeployed: false,
};

function rig() {
  const d = new Dictionary();
  declareAll(d);
  return d;
}

function run(d: Dictionary, w: World, seconds: number): void {
  const steps = Math.round(seconds / 0.05);
  for (let i = 0; i < steps; i++) tick(d, w, 0.05);
}

/** Batteries on, APU master and start, far enough for the APU to be available. */
function startApu(d: Dictionary, w: World = groundWorld): void {
  d.set('sw.bat1', true);
  d.set('sw.bat2', true);
  run(d, w, 1);
  d.set('sw.apuMaster', true);
  d.set('sw.apuStart', true);
  run(d, w, 30);
}

/** APU bleed, both fuel sides, both LP valves. */
function feedAndBleed(d: Dictionary, w: World): void {
  d.set('sw.apuBleed', true);
  d.set('sw.busTie', true);
  d.set('sw.fuelPumpL1', true);
  d.set('sw.fuelPumpR1', true);
  d.set('sw.fuelEng1LpValve', true);
  d.set('sw.fuelEng2LpValve', true);
  run(d, w, 2);
}

// ---------------------------------------------------------------- APU

test('apu: does not start without DC power', () => {
  const d = rig();
  d.set('sw.apuMaster', true);
  d.set('sw.apuStart', true);
  run(d, groundWorld, 30);
  assert.equal(d.bool('sys.apuRunning'), false);
  assert.equal(d.num('apu.n1'), 0);
});

test('apu: battery power alone is enough to run the ECB and start it', () => {
  const d = rig();
  startApu(d);
  assert.equal(d.bool('sys.apuRunning'), true);
  assert.ok(d.num('apu.n1') >= 95, `n1 ${d.num('apu.n1')}`);
  assert.equal(d.bool('sys.apuGenAvail'), true);
  assert.equal(d.bool('sys.apuBleedAvail'), true);
});

test('apu: the start pushbutton is momentary — it clears itself', () => {
  const d = rig();
  d.set('sw.bat1', true);
  d.set('sw.bat2', true);
  run(d, groundWorld, 1);
  d.set('sw.apuMaster', true);
  d.set('sw.apuStart', true);
  run(d, groundWorld, 1);
  assert.equal(d.bool('sw.apuStart'), false);
  assert.equal(d.bool('sys.apuStarting'), true, 'but the sequence is latched');
});

test('apu: dropping the master shuts it down and takes the services with it', () => {
  const d = rig();
  startApu(d);
  d.set('sw.apuMaster', false);
  run(d, groundWorld, 20);
  assert.equal(d.bool('sys.apuRunning'), false);
  assert.equal(d.num('apu.n1'), 0);
  assert.equal(d.bool('sys.apuGenAvail'), false);
  assert.equal(d.bool('sys.apuBleedAvail'), false);
});

test('apu: the generator can be selected once the APU is available', () => {
  const d = rig();
  startApu(d);
  d.set('sw.apuGen', true);
  d.set('sw.busTie', true);
  run(d, groundWorld, 1);
  assert.equal(d.bool('bus.ac1'), true, 'APU generator feeds the left side and the tie carries it');
});

// ---------------------------------------------------------------- engine

test('engine: will not turn without bleed', () => {
  const d = rig();
  startApu(d);
  // bleed switch deliberately left off
  d.set('sw.fuelPumpL1', true);
  d.set('sw.fuelEng1LpValve', true);
  d.set('sw.eng1Master', true);
  d.set('sw.eng1Start', 1);
  run(d, groundWorld, 20);
  assert.equal(d.bool('sys.eng1StartValve'), false);
  assert.equal(d.num('eng1.n2'), 0);
});

test('engine: dry crank reaches light-up speed, then fuel carries it to idle', () => {
  const d = rig();
  startApu(d);
  feedAndBleed(d, groundWorld);

  // master off: the starter turns the engine on air alone
  d.set('sw.eng1Start', 1);
  run(d, groundWorld, 14);
  const dryN2 = d.num('eng1.n2');
  assert.ok(dryN2 > 15 && dryN2 < 18, `dry N2 ${dryN2}`);
  assert.equal(d.bool('sys.eng1Burning'), false);

  // master on: fuel, light-up, acceleration
  d.set('sw.eng1Master', true);
  run(d, groundWorld, 16);
  assert.equal(d.bool('sys.eng1Burning'), true);
  assert.equal(d.bool('sys.eng1Running'), true);
  assert.ok(d.num('eng1.n2') >= 58, `n2 ${d.num('eng1.n2')}`);
  assert.equal(d.bool('sys.eng1StartValve'), false, 'the valve closes at self-sustaining speed');
  assert.ok(d.num('eng1.egt') > 200, `egt ${d.num('eng1.egt')}`);
});

test('engine: fuel on before rotation is a hot start and runs hot', () => {
  const d = rig();
  startApu(d);
  feedAndBleed(d, groundWorld);

  d.set('sw.eng1Master', true); // master first — the classic mistake
  d.set('sw.eng1Start', 1);
  run(d, groundWorld, 4);
  assert.equal(d.bool('sys.eng1HotStart'), true);
  assert.ok(d.num('eng1.egt') > 500, `hot EGT should climb fast, got ${d.num('eng1.egt')}`);

  run(d, groundWorld, 30);
  assert.equal(d.bool('sys.eng1HotStart'), false, 'the flag clears once the engine is turning properly');
  assert.equal(d.bool('sys.eng1Running'), true);
});

test('engine: shutting the master down runs the engine back to zero', () => {
  const d = rig();
  startApu(d);
  feedAndBleed(d, groundWorld);
  d.set('sw.eng1Master', true);
  d.set('sw.eng1Start', 1);
  run(d, groundWorld, 30);
  assert.equal(d.bool('sys.eng1Running'), true);

  d.set('sw.eng1Master', false);
  run(d, groundWorld, 20);
  assert.equal(d.bool('sys.eng1Running'), false);
  assert.equal(d.num('eng1.n2'), 0);
});

test('engine: once running, the generator powers its own side and the green pump makes pressure', () => {
  const d = rig();
  startApu(d);
  feedAndBleed(d, groundWorld);
  d.set('sw.eng1Master', true);
  d.set('sw.eng1Start', 1);
  run(d, groundWorld, 30);
  assert.equal(d.bool('sys.eng1Running'), true);

  d.set('sw.gen1', true);
  d.set('sw.hydGreenEng1', true);
  run(d, groundWorld, 2);
  assert.equal(d.bool('bus.ac1'), true, 'generator 1 on line');
  assert.ok(d.num('hyd.green') > 2000, `green pressure ${d.num('hyd.green')}`);

  // and with the APU shut down the left side keeps running on its own
  d.set('sw.apuBleed', false);
  d.set('sw.apuMaster', false);
  run(d, groundWorld, 30);
  assert.equal(d.bool('sys.eng1Running'), true);
  assert.equal(d.bool('bus.ac1'), true);
});

