/**
 * The packs-fail drill and the PRESS panel controls.  node --test tests/packsfail.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Dictionary } from '../src/dictionary.ts';
import { declareAll, tick, type World } from '../src/systems/index.ts';
import { Scorer, formatDebrief } from '../src/training/procedure.ts';
import { packsFail } from '../src/training/packsfail.ts';
import { arm, fire } from '../src/faults/index.ts';
import { declarePanel, overhead } from '../src/panel/overhead.ts';
import { actuate, controlAt } from '../src/panel/controls.ts';

const world: World = {
  externalPowerAvailable: true,
  groundAirAvailable: false,
  pressureAltitudeFt: 35000,
  tanks: { leftHasFuel: true, rightHasFuel: true, centerHasFuel: false },
  ratDeployed: false,
};

function rig() {
  const d = new Dictionary();
  declareAll(d);
  declarePanel(d);
  return d;
}

/** Engines running, packs on, cabin settled. */
function cruising(): Dictionary {
  const d = rig();
  d.set('sw.extPwr', true);
  d.set('sw.busTie', true);
  for (const n of [1, 2] as const) {
    d.set(`eng${n}.n2`, 60);
    d.set(`sw.eng${n}Master`, true);
  }
  d.set('sw.fuelPumpL1', true);
  d.set('sw.fuelPumpR1', true);
  d.set('sw.fuelEng1LpValve', true);
  d.set('sw.fuelEng2LpValve', true);
  d.set('sw.eng1Bleed', true);
  d.set('sw.eng2Bleed', true);
  d.set('sw.pack1', true);
  d.set('sw.pack2', true);
  run(d, 900);
  return d;
}

function run(d: Dictionary, seconds: number): void {
  const n = Math.round(seconds / 0.05);
  for (let i = 0; i < n; i++) tick(d, world, 0.05);
}

function click(d: Dictionary, id: string): void {
  actuate(d, controlAt(overhead, id));
}

test('the panel can take pressurisation to manual and step the valve', () => {
  const d = rig();
  click(d, 'press-mode');
  assert.equal(d.num('sw.pressMode'), 1, 'selector moved to manual');

  const seen: number[] = [];
  for (let i = 0; i < 5; i++) {
    click(d, 'press-outflow');
    seen.push(d.num('sw.pressValve'));
  }
  assert.deepEqual(seen, [25, 50, 75, 100, 0], 'detents are the table, not 0..4');
});

test('closing the outflow valve in manual holds the cabin', () => {
  const d = cruising();
  // packs dead, manual, valve shut
  d.set('fault.pack1', true);
  d.set('fault.pack2', true);
  d.set('sw.pressMode', 1);
  d.set('sw.pressValve', 0);
  run(d, 5);
  const before = d.num('press.cabinAlt');
  run(d, 60);
  assert.ok(Math.abs(d.num('press.cabinAlt') - before) < 5, `cabin drifted to ${d.num('press.cabinAlt')}`);
  assert.ok(Math.abs(d.num('press.cabinVs')) < 1, `vs ${d.num('press.cabinVs')}`);
});

test('with the valve open the cabin climbs', () => {
  const d = cruising();
  d.set('fault.pack1', true);
  d.set('fault.pack2', true);
  d.set('sw.pressMode', 1);
  d.set('sw.pressValve', 100);
  run(d, 5);
  const before = d.num('press.cabinAlt');
  run(d, 60);
  assert.ok(d.num('press.cabinAlt') > before + 500, `cabin ${d.num('press.cabinAlt')} from ${before}`);
});

test('the drill passes when the trainee takes manual and shuts the valve', () => {
  const d = cruising();
  const s = new Scorer(packsFail, d);

  const set = arm([{ id: 'pack-1' }, { id: 'pack-2' }]);
  fire(d, set, 'pack-1');
  fire(d, set, 'pack-2');
  for (let i = 0; i < 20; i++) {
    tick(d, world, 0.05);
    s.tick(0.05);
  }

  click(d, 'press-mode');
  click(d, 'press-outflow'); // 25 -> ...
  d.set('sw.pressValve', 0);
  for (let i = 0; i < 600 && !s.done; i++) {
    tick(d, world, 0.05);
    s.tick(0.05);
  }

  const r = s.debrief();
  assert.equal(r.passed, true, formatDebrief(r));
});

test('doing nothing is a miss on every response step', () => {
  const d = cruising();
  const s = new Scorer(packsFail, d);
  const set = arm([{ id: 'pack-1' }, { id: 'pack-2' }]);
  fire(d, set, 'pack-1');
  fire(d, set, 'pack-2');
  for (let i = 0; i < 4000 && !s.done; i++) {
    tick(d, world, 0.05);
    s.tick(0.05);
  }
  const r = s.debrief();
  assert.equal(r.passed, false);
  assert.equal(r.steps.find((x) => x.id === 'manual')?.status, 'missed');
  assert.equal(r.steps.find((x) => x.id === 'valve-shut')?.status, 'missed');
  assert.equal(r.steps.find((x) => x.id === 'held')?.status, 'missed');
  assert.ok(d.num('press.cabinAlt') > 9000, 'and the cabin really did climb');
});

