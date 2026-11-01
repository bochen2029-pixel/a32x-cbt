/**
 * Fault injection tests.  node --test tests/faults.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Dictionary } from '../src/dictionary.ts';
import { declareAll, tick, type World } from '../src/systems/index.ts';
import { active } from '../src/ecam/messages.ts';
import { arm, fault, faultIds, fire, repair, step } from '../src/faults/index.ts';

const world: World = {
  externalPowerAvailable: true,
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

function run(d: Dictionary, seconds: number, w: World = world): void {
  const n = Math.round(seconds / 0.05);
  for (let i = 0; i < n; i++) tick(d, w, 0.05);
}

test('every declared fault has a flag the dictionary knows', () => {
  const d = rig();
  for (const id of faultIds()) {
    const flag = fault(id).flag;
    assert.doesNotThrow(() => d.spec(flag), `${id} -> ${flag}`);
    assert.equal(d.bool(flag), false, `${id} must start clear`);
  }
});

test('a blue pump failure drops BLUE pressure and raises the caution', () => {
  const d = rig();
  d.set('sw.extPwr', true);
  d.set('sw.busTie', true);
  d.set('sw.hydBlueEpump', true);
  run(d, 0.5);
  assert.ok(d.num('hyd.blue') > 2000, 'healthy to begin with');

  const set = arm([{ id: 'hyd-blue-pump' }]);
  fire(d, set, 'hyd-blue-pump');
  run(d, 0.5);

  assert.equal(d.num('hyd.blue'), 0);
  assert.ok(active(d).some((m) => m.id === 'hyd-b-lo-pr'));
});

test('repairing the pump restores pressure', () => {
  const d = rig();
  d.set('sw.extPwr', true);
  d.set('sw.busTie', true);
  d.set('sw.hydBlueEpump', true);
  const set = arm([{ id: 'hyd-blue-pump' }]);
  fire(d, set, 'hyd-blue-pump');
  run(d, 0.2);
  assert.equal(d.num('hyd.blue'), 0);

  repair(d, 'hyd-blue-pump');
  run(d, 0.2);
  assert.ok(d.num('hyd.blue') > 2000);
});

test('a timed fault fires once, at its time, and stays fired', () => {
  const d = rig();
  const set = arm([{ id: 'pack-1', trigger: { kind: 'atTime', sec: 2 } }]);

  let fired = step(d, set, { sec: 1, altitudeFt: 0 });
  assert.deepEqual(fired, []);
  assert.equal(d.bool('fault.pack1'), false);

  fired = step(d, set, { sec: 2, altitudeFt: 0 });
  assert.deepEqual(fired, ['pack-1']);
  assert.equal(d.bool('fault.pack1'), true);

  fired = step(d, set, { sec: 30, altitudeFt: 0 });
  assert.deepEqual(fired, [], 'does not fire twice');
});

test('an altitude-triggered fault waits for the altitude', () => {
  const d = rig();
  const set = arm([{ id: 'bleed-1', trigger: { kind: 'atAltitude', ft: 10000 } }]);
  assert.deepEqual(step(d, set, { sec: 0, altitudeFt: 9000 }), []);
  assert.deepEqual(step(d, set, { sec: 0, altitudeFt: 10000 }), ['bleed-1']);
  assert.equal(d.bool('fault.bleed1'), true);
});

test('a manual fault never fires on its own', () => {
  const d = rig();
  const set = arm([{ id: 'pack-2' }]);
  for (let i = 0; i < 100; i++) step(d, set, { sec: i, altitudeFt: 40000 });
  assert.equal(d.bool('fault.pack2'), false);
});

test('a pack failure taps the cabin out through the pressurisation system', () => {
  const d = rig();
  d.set('eng1.n2', 60);
  d.set('eng2.n2', 60);
  d.set('sw.eng1Master', true);
  d.set('sw.eng2Master', true);
  d.set('sw.fuelPumpL1', true);
  d.set('sw.fuelPumpR1', true);
  d.set('sw.fuelEng1LpValve', true);
  d.set('sw.fuelEng2LpValve', true);
  d.set('sw.eng1Bleed', true);
  d.set('sw.eng2Bleed', true);
  d.set('sw.pack1', true);
  d.set('sw.pack2', true);
  const at35 = { ...world, pressureAltitudeFt: 35000 };

  run(d, 600, at35);
  const settled = d.num('press.cabinAlt');
  assert.ok(settled > 0, `cabin climbing, got ${settled}`);

  fire(d, arm([{ id: 'pack-1' }, { id: 'pack-2' }]), 'pack-1');
  fire(d, arm([{ id: 'pack-1' }, { id: 'pack-2' }]), 'pack-2');
  run(d, 600, at35);
  assert.ok(d.num('press.cabinAlt') > settled, 'the cabin climbs with both packs dead');
});


