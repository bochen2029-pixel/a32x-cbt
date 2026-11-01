/**
 * Pressurisation tests.  node --test tests/press.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Dictionary } from '../src/dictionary.ts';
import { declareAll, tick, type World } from '../src/systems/index.ts';
import { active } from '../src/ecam/messages.ts';
import { page } from '../src/ecam/pages.ts';

const at = (altFt: number): World => ({
  externalPowerAvailable: true,
  groundAirAvailable: false,
  pressureAltitudeFt: altFt,
  tanks: { leftHasFuel: true, rightHasFuel: true, centerHasFuel: false },
  ratDeployed: false,
});

function rig() {
  const d = new Dictionary();
  declareAll(d);
  return d;
}

/** Both engines idling with bleed and both packs running. */
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
  tick(d, at(35000), 0.05);
  return d;
}

function run(d: Dictionary, w: World, seconds: number): void {
  const steps = Math.round(seconds / 0.05);
  for (let i = 0; i < steps; i++) tick(d, w, 0.05);
}

test('on the ground the cabin sits at zero and there is no differential', () => {
  const d = rig();
  run(d, at(0), 10);
  assert.equal(d.num('press.cabinAlt'), 0);
  assert.equal(d.num('press.diffPsi'), 0);
});

test('without packs the cabin climbs at the rate limit', () => {
  const d = rig();
  run(d, at(35000), 60);
  assert.ok(d.num('press.cabinVs') > 0, 'climbing');
  assert.ok(d.num('press.cabinVs') <= 500.0001, `vs ${d.num('press.cabinVs')}`);
  assert.ok(d.num('press.cabinAlt') > 400, `cabin ${d.num('press.cabinAlt')}`);
});

test('packs drive the cabin toward the schedule and stop at 8000', () => {
  const d = cruising();
  assert.equal(d.bool('sys.pressAuto'), true);
  run(d, at(35000), 1500); // long enough to settle
  assert.ok(Math.abs(d.num('press.cabinAlt') - 8000) < 60, `cabin ${d.num('press.cabinAlt')}`);
});

test('the differential never passes the relief band', () => {
  const d = cruising();
  run(d, at(41000), 6000);
  assert.ok(d.num('press.diffPsi') <= 8.6001, `diff ${d.num('press.diffPsi')}`);
  assert.ok(d.num('press.diffPsi') > 8.0, 'and it is genuinely pressurised');
});

test('manual mode with the valve open bleeds the cabin toward the aircraft', () => {
  const d = cruising();
  d.set('sw.pressMode', 1);
  d.set('sw.pressValve', 100);
  const before = d.num('press.cabinAlt');
  run(d, at(10000), 300);
  assert.equal(d.bool('sys.pressAuto'), false);
  assert.ok(d.num('press.cabinAlt') > before + 3000, `cabin ${d.num('press.cabinAlt')} from ${before}`);
  assert.ok(d.num('press.cabinAlt') <= 10000.5, 'never above the aircraft itself');
});

test('a cabin above 9550 raises the CABIN ALT caution', () => {
  const d = rig();
  d.set('press.cabinAlt', 9800);
  run(d, at(20000), 0.05);
  assert.ok(active(d).some((m) => m.id === 'cabin-alt'));
});

test('a cabin above 14000 escalates to EXCESS CABIN ALT', () => {
  const d = rig();
  d.set('press.cabinAlt', 14500);
  run(d, at(20000), 0.05);
  const ids = active(d).map((m) => m.id);
  assert.ok(ids.includes('excess-cabin-alt'), ids.join(','));
  assert.equal(active(d).find((m) => m.id === 'excess-cabin-alt')?.level, 'warning');
});

test('the PRESS page reports the numbers and flags a high cabin', () => {
  const d = rig();
  d.set('press.cabinAlt', 15000);
  tick(d, at(25000), 0.05);
  const lines = page('press')!.lines(d);
  assert.ok(lines.some((l) => l.text.includes('FT')));
  assert.ok(lines.some((l) => l.level === 'warning'), 'the cabin altitude line goes red');
});


