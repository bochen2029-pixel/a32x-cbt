/**
 * B1 systems tests: fuel, pneumatic, hydraulic, and the dispatch order that ties them together.
 * Run with:  node --test tests/systems.test.ts
 *
 * Systems read each other through the dictionary, so a test seeds the dictionary the way the real
 * model would arrive at that state — it does not reach into a system's private inputs.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Dictionary } from '../src/dictionary.ts';
import { declareAll, tick, type World } from '../src/systems/index.ts';

const base: World = {
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

function step(d: Dictionary, w: World = base): void {
  tick(d, w, 0.05);
}

// ---------------------------------------------------------------- fuel

test('fuel: an engine with its pump and valve running gets fuel', () => {
  const d = rig();
  d.set('sw.fuelEng1LpValve', true);
  d.set('sw.fuelPumpL1', true);
  step(d);
  assert.equal(d.bool('sys.fuelToEng1'), true);
  assert.equal(d.bool('sys.fuelToEng2'), false, 'valve still shut on the right');
});

test('fuel: crossfeed lets a dry side run from the other tank', () => {
  const d = rig();
  d.set('sw.fuelEng1LpValve', true);
  d.set('sw.fuelEng2LpValve', true);
  d.set('sw.fuelPumpL1', true);
  d.set('sw.fuelXfeed', true);
  step(d);
  assert.equal(d.bool('sys.fuelToEng2'), true, 'engine 2 draws across the open crossfeed');
});

test('fuel: closing the LP valve stops the engine regardless of pump state', () => {
  const d = rig();
  d.set('sw.fuelPumpL1', true);
  d.set('sw.fuelEng1LpValve', false);
  step(d);
  assert.equal(d.bool('sys.fuelToEng1'), false);
});

test('fuel: center tank feeds both engines with no side pumps', () => {
  const d = rig();
  d.set('sw.fuelEng1LpValve', true);
  d.set('sw.fuelEng2LpValve', true);
  d.set('sw.fuelPumpC1', true);
  step(d, { ...base, tanks: { leftHasFuel: false, rightHasFuel: false, centerHasFuel: true } });
  assert.equal(d.bool('sys.fuelToEng1'), true);
  assert.equal(d.bool('sys.fuelToEng2'), true);
});

// ---------------------------------------------------------------- pneumatic

test('pneumatic: engine 1 bleed feeds the left duct and pack 1 only', () => {
  const d = rig();
  d.set('sys.eng1Running', true);
  d.set('sw.eng1Bleed', true);
  d.set('sw.pack1', true);
  d.set('sw.pack2', true);
  step(d);
  assert.equal(d.bool('sys.bleedDuctL'), true);
  assert.equal(d.bool('sys.bleedDuctR'), false);
  assert.equal(d.bool('sys.pack1Running'), true);
  assert.equal(d.bool('sys.pack2Running'), false, 'no bleed on the right, crossbleed shut');
});

test('pneumatic: crossbleed carries one engine bleed to both packs', () => {
  const d = rig();
  d.set('sys.eng1Running', true);
  d.set('sw.eng1Bleed', true);
  d.set('sw.xbleed', true);
  d.set('sw.pack2', true);
  step(d);
  assert.equal(d.bool('sys.bleedDuctR'), true);
  assert.equal(d.bool('sys.pack2Running'), true);
});

test('pneumatic: APU bleed runs the packs with no engine running', () => {
  const d = rig();
  d.set('sys.apuRunning', true);
  d.set('sw.apuBleed', true);
  d.set('sw.xbleed', true);
  d.set('sw.pack1', true);
  d.set('sw.pack2', true);
  step(d);
  assert.equal(d.bool('sys.bleedApu'), true);
  assert.equal(d.bool('sys.pack1Running'), true);
  assert.equal(d.bool('sys.pack2Running'), true);
});

// ---------------------------------------------------------------- hydraulic

test('hydraulic: engine pumps need their engine and their switch', () => {
  const d = rig();
  d.set('sys.eng1Running', true);
  d.set('sw.hydGreenEng1', true);
  d.set('sw.hydYellowEng2', true);
  step(d);
  assert.equal(d.num('hyd.green'), 3000);
  assert.equal(d.num('hyd.yellow'), 0);
});

test('hydraulic: the PTU pressurises a dead side from a live one', () => {
  const d = rig();
  d.set('sys.eng1Running', true);
  d.set('sw.hydGreenEng1', true);
  d.set('sw.ptu', true);
  step(d);
  assert.equal(d.bool('sys.ptuRunning'), true);
  assert.ok(d.num('hyd.yellow') > 0, 'yellow is being driven by green through the PTU');
  assert.ok(d.num('hyd.green') > 0);
});

test('hydraulic: the PTU does not run when both sides are alive', () => {
  const d = rig();
  d.set('sys.eng1Running', true);
  d.set('sys.eng2Running', true);
  d.set('sw.hydGreenEng1', true);
  d.set('sw.hydYellowEng2', true);
  d.set('sw.ptu', true);
  step(d);
  assert.equal(d.bool('sys.ptuRunning'), false);
});

test('hydraulic: the blue electric pump needs AC power from the model, not a flag', () => {
  const d = rig();
  d.set('sw.hydBlueEpump', true);
  step(d);
  assert.equal(d.bool('sys.hydBluePump'), false);
  assert.equal(d.num('hyd.blue'), 0);

  d.set('sw.extPwr', true);
  d.set('sw.busTie', true);
  step(d, { ...base, externalPowerAvailable: true });
  assert.equal(d.bool('bus.acEss'), true);
  assert.equal(d.bool('sys.hydBluePump'), true);
  assert.equal(d.num('hyd.blue'), 3000);
});

test('hydraulic: the RAT drives the blue system with no AC', () => {
  const d = rig();
  step(d, { ...base, ratDeployed: true });
  assert.equal(d.bool('sys.hydBluePump'), true);
  assert.equal(d.num('hyd.blue'), 2000, 'RAT pressure is lower than a pump');
});

// ---------------------------------------------------------------- dispatch

test('dispatch: the electric pump sees AC ESS from the same tick', () => {
  const d = rig();
  d.set('sw.hydBlueEpump', true);
  d.set('sw.extPwr', true);
  d.set('sw.busTie', true);
  step(d, { ...base, externalPowerAvailable: true });
  assert.equal(d.bool('bus.acEss'), true);
  assert.equal(d.bool('sys.hydBluePump'), true, 'electrical runs before hydraulics in the same pass');
});

test('dispatch: order is stable — one tick is idempotent once settled', () => {
  const d = rig();
  d.set('sw.extPwr', true);
  d.set('sw.busTie', true);
  d.set('sw.hydBlueEpump', true);
  const w = { ...base, externalPowerAvailable: true };
  for (let i = 0; i < 100; i++) step(d, w); // settle: lags and EGT converge
  const snapshot = d.names().map((n) => `${n}=${String(d.get(n))}`);
  for (let i = 0; i < 20; i++) step(d, w);
  const second = d.names().map((n) => `${n}=${String(d.get(n))}`);
  assert.deepEqual(second, snapshot, 'a settled aircraft does not drift between ticks');
});

