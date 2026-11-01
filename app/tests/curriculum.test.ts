/**
 * Before start and after start, and the measured readings a debrief can carry.
 *   node --test tests/curriculum.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Dictionary } from '../src/dictionary.ts';
import { declareAll, tick, type World } from '../src/systems/index.ts';
import { Scorer, formatDebrief } from '../src/training/procedure.ts';
import { beforeStart } from '../src/training/beforestart.ts';
import { afterStart } from '../src/training/afterstart.ts';

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

function run(d: Dictionary, s: Scorer, seconds: number, each?: () => void): void {
  const n = Math.round(seconds / 0.05);
  for (let i = 0; i < n && !s.done; i++) {
    tick(d, world, 0.05);
    s.tick(0.05);
    each?.();
  }
}

// ---------------------------------------------------------------- before start

test('before start passes when the flow is worked in order', () => {
  const d = rig();
  const s = new Scorer(beforeStart, d);

  d.set('sw.bat1', true);
  d.set('sw.bat2', true);
  d.set('sw.extPwr', true);
  d.set('sw.busTie', true);
  d.set('sw.apuMaster', true);
  d.set('sw.apuStart', true);
  run(d, s, 35);
  d.set('sw.apuBleed', true);
  run(d, s, 2);
  d.set('sw.pack1', false);
  d.set('sw.pack2', false);
  run(d, s, 2);
  d.set('sw.fuelPumpL1', true);
  d.set('sw.fuelPumpR1', true);
  d.set('sw.fuelEng1LpValve', true);
  d.set('sw.fuelEng2LpValve', true);
  d.set('sw.hydBlueEpump', true);
  run(d, s, 5);

  const r = s.debrief();
  assert.equal(r.passed, true, formatDebrief(r));
});

test('before start measures the blue pressure when the pump is selected', () => {
  const d = rig();
  const s = new Scorer(beforeStart, d);
  d.set('sw.bat1', true);
  d.set('sw.bat2', true);
  d.set('sw.extPwr', true);
  d.set('sw.busTie', true);
  d.set('sw.apuMaster', true);
  d.set('sw.apuStart', true);
  run(d, s, 35);
  d.set('sw.apuBleed', true);
  d.set('sw.xbleed', true); // APU feeds the left duct; the crossbleed carries it to engine 2
  d.set('sw.fuelPumpL1', true);
  d.set('sw.fuelPumpR1', true);
  d.set('sw.fuelEng1LpValve', true);
  d.set('sw.fuelEng2LpValve', true);
  d.set('sw.hydBlueEpump', true);
  run(d, s, 5);

  const hyd = s.debrief().steps.find((x) => x.id === 'hyd');
  assert.ok(hyd?.reading, 'the step carries a reading');
  assert.equal(hyd!.reading!.aim, 3000);
  assert.equal(hyd!.reading!.ok, true, `read ${hyd!.reading!.value}`);
});

test('leaving the packs on is a miss', () => {
  const d = rig();
  const s = new Scorer(beforeStart, d);
  d.set('sw.bat1', true);
  d.set('sw.bat2', true);
  d.set('sw.extPwr', true);
  d.set('sw.busTie', true);
  d.set('sw.apuMaster', true);
  d.set('sw.apuStart', true);
  run(d, s, 35);
  d.set('sw.apuBleed', true);
  d.set('sw.pack1', true);
  d.set('sw.pack2', true);
  run(d, s, 200); // past the packs window
  assert.equal(s.debrief().steps.find((x) => x.id === 'packs-off')?.status, 'missed');
});

// ---------------------------------------------------------------- after start

/** Both engines at idle, APU available, everything else still in the start configuration. */
function started(): Dictionary {
  const d = rig();
  d.set('sw.bat1', true);
  d.set('sw.bat2', true);
  d.set('sw.extPwr', true);
  d.set('sw.busTie', true);
  d.set('sw.apuMaster', true);
  d.set('sw.apuStart', true);
  for (let i = 0; i < 700; i++) tick(d, world, 0.05);

  d.set('sw.apuBleed', true);
  d.set('sw.xbleed', true); // APU feeds the left duct; the crossbleed carries it to engine 2
  d.set('sw.fuelPumpL1', true);
  d.set('sw.fuelPumpR1', true);
  d.set('sw.fuelEng1LpValve', true);
  d.set('sw.fuelEng2LpValve', true);

  for (const n of [1, 2] as const) {
    d.set(`sw.eng${n}Start`, 1);
    for (let i = 0; i < 2000 && d.num(`eng${n}.n2`) < 17; i++) tick(d, world, 0.05);
    d.set(`sw.eng${n}Master`, true);
    for (let i = 0; i < 2000 && !d.bool(`sys.eng${n}Running`); i++) tick(d, world, 0.05);
  }
  return d;
}

test('after start passes when the aircraft is handed over to its own generators', () => {
  const d = started();
  const s = new Scorer(afterStart, d);
  run(d, s, 1);

  d.set('sw.gen1', true);
  d.set('sw.gen2', true);
  run(d, s, 1);
  d.set('sw.eng1Bleed', true);
  d.set('sw.eng2Bleed', true);
  run(d, s, 1);
  d.set('sw.apuBleed', false);
  run(d, s, 1);
  d.set('sw.pack1', true);
  d.set('sw.pack2', true);
  run(d, s, 1);
  d.set('sw.apuMaster', false);
  run(d, s, 2);

  const r = s.debrief();
  assert.equal(r.passed, true, formatDebrief(r));
  const eng1 = r.steps.find((x) => x.id === 'eng1');
  assert.ok(eng1?.reading?.ok, `ENG 1 N2 read ${eng1?.reading?.value}`);
});

test('leaving the APU bleed open is caught', () => {
  const d = started();
  const s = new Scorer(afterStart, d);
  run(d, s, 1);
  d.set('sw.gen1', true);
  d.set('sw.gen2', true);
  run(d, s, 1);
  d.set('sw.eng1Bleed', true);
  d.set('sw.eng2Bleed', true);
  run(d, s, 120); // APU bleed left on, so the window expires
  assert.equal(s.debrief().steps.find((x) => x.id === 'apu-bleed-off')?.status, 'missed');
});

test('the debrief prints a reading that was outside its band', () => {
  const proc = {
    id: 'm',
    title: 'measure',
    steps: [
      {
        id: 'x',
        label: 'pressure',
        done: (d: Dictionary) => d.num('hyd.blue') > 0,
        why: 'because',
        measure: { var: 'hyd.blue', aim: 3000, band: 100, unit: 'psi' },
      },
    ],
  };
  const d = rig();
  d.set('hyd.blue', 2200);
  const s = new Scorer(proc, d);
  s.tick(0.05);
  const text = formatDebrief(s.debrief());
  assert.match(text, /off the aim:/);
  assert.match(text, /read 2200\.0 against 3000 ± 100 \(-800\.0\)/);
});

