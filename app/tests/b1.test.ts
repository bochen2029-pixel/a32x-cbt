/**
 * B1 foundation tests. Run with:  node --test tests/
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Dictionary } from '../src/dictionary.ts';
import { Clock } from '../src/clock.ts';
import { declareElec, updateElec, type ElecInputs } from '../src/systems/elec.ts';

const dark: ElecInputs = {
  eng1Running: false,
  eng2Running: false,
  apuRunning: false,
  externalPowerAvailable: false,
};

function elecRig() {
  const d = new Dictionary();
  declareElec(d);
  return d;
}

// ---------------------------------------------------------------- dictionary

test('dictionary refuses a value outside its declared range instead of clamping', () => {
  const d = new Dictionary();
  d.declare({ name: 'n', kind: 'real', min: 0, max: 1 });
  assert.throws(() => d.set('n', 1.5), /outside/);
  assert.equal(d.num('n'), 0, 'the refused write is a no-op');
});

test('dictionary strips a non-integer write to an int slot', () => {
  const d = new Dictionary();
  d.declare({ name: 'i', kind: 'int', min: 0, max: 9999 });
  assert.throws(() => d.set('i', 3.5), /integer/);
  assert.equal(d.num('i'), 0);
});

test('dictionary edge detection fires once per change', () => {
  const d = new Dictionary();
  d.declare({ name: 'b', kind: 'bool' });
  assert.equal(d.take('b'), false, 'clean at rest');
  d.set('b', true);
  assert.equal(d.take('b'), true, 'first take sees the edge');
  assert.equal(d.take('b'), false, 'second take is clean');
  d.set('b', true);
  assert.equal(d.take('b'), false, 'a write of the same value is not an edge');
});

test('dictionary reset returns to defaults and clears dirt', () => {
  const d = new Dictionary();
  d.declare({ name: 'b', kind: 'bool' });
  d.set('b', true);
  d.reset();
  assert.equal(d.bool('b'), false);
  assert.equal(d.take('b'), false);
});

// ---------------------------------------------------------------- clock

test('clock runs exactly the steps the wall time earned', () => {
  const c = new Clock(20);
  assert.equal(c.advance(0), 0);
  assert.equal(c.advance(49), 0, 'under one step');
  assert.equal(c.advance(1), 1, '50 ms is one step');
  assert.equal(c.advance(100), 2);
  assert.ok(Math.abs(c.elapsed - 0.15) < 1e-9, `elapsed ${c.elapsed}`);
});

test('clock drops debt instead of widening the step', () => {
  const c = new Clock(20, 5);
  assert.equal(c.advance(1000), 5, 'a 1 s stall runs at most 5 steps');
  let widest = 0;
  c.run(50, (dt) => {
    widest = Math.max(widest, dt);
  });
  assert.equal(widest, 0.05, 'dt is always the fixed step');
});

// ---------------------------------------------------------------- electrical

test('cold and dark: only the unswitched hot battery bus is live', () => {
  const d = elecRig();
  updateElec(d, dark);
  assert.equal(d.bool('bus.ac1'), false);
  assert.equal(d.bool('bus.ac2'), false);
  assert.equal(d.bool('bus.dcEss'), false);
  assert.equal(d.bool('bus.hotBat'), true);
});

test('external power alone lights both AC buses through the tie', () => {
  const d = elecRig();
  d.set('sw.extPwr', true);
  d.set('sw.busTie', true);
  updateElec(d, { ...dark, externalPowerAvailable: true });
  assert.equal(d.bool('bus.ac1'), true);
  assert.equal(d.bool('bus.ac2'), true);
  assert.equal(d.bool('bus.dc1'), true);
  assert.equal(d.bool('bus.dc2'), true);
  assert.equal(d.bool('bus.dcEss'), true);
});

test('generator 1 alone feeds AC BUS 1 and nothing on the right with the tie open', () => {
  const d = elecRig();
  d.set('sw.gen1', true);
  updateElec(d, { ...dark, eng1Running: true });
  assert.equal(d.bool('bus.ac1'), true);
  assert.equal(d.bool('bus.ac2'), false);
  assert.equal(d.bool('bus.dc1'), true);
  assert.equal(d.bool('bus.dc2'), false);
  assert.equal(d.bool('bus.acEss'), true);
});

test('the bus tie carries generator 1 across when it is closed', () => {
  const d = elecRig();
  d.set('sw.gen1', true);
  d.set('sw.busTie', true);
  updateElec(d, { ...dark, eng1Running: true });
  assert.equal(d.bool('bus.ac2'), true, 'tie closed propagates the source');
});

test('APU generator feeds AC BUS 2 and, with the tie, the whole network', () => {
  const d = elecRig();
  d.set('sw.apuGen', true);
  updateElec(d, { ...dark, apuRunning: true });
  assert.equal(d.bool('bus.ac2'), true);
  assert.equal(d.bool('bus.ac1'), false, 'tie open');

  d.set('sw.busTie', true);
  updateElec(d, { ...dark, apuRunning: true });
  assert.equal(d.bool('bus.ac1'), true);
});

test('removing the last source drops the buses on the next tick', () => {
  const d = elecRig();
  d.set('sw.extPwr', true);
  updateElec(d, { ...dark, externalPowerAvailable: true });
  assert.equal(d.bool('bus.ac1'), true);

  updateElec(d, dark);
  assert.equal(d.bool('bus.ac1'), false, 'no stale power');
  assert.equal(d.bool('bus.dcEss'), false);
});

test('batteries alone hold the DC BAT bus and the essential bus', () => {
  const d = elecRig();
  d.set('sw.bat1', true);
  d.set('sw.bat2', true);
  updateElec(d, dark);
  assert.equal(d.bool('bus.ac1'), false);
  assert.equal(d.bool('bus.dcBat'), true);
  assert.equal(d.bool('bus.dcEss'), true);
});

test('a switch off disables its source even when the input is available', () => {
  const d = elecRig();
  d.set('sw.gen2', false);
  updateElec(d, { ...dark, eng2Running: true });
  assert.equal(d.bool('bus.ac2'), false);
});
