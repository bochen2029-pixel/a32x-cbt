/**
 * Soak: run the model for a long time and assert it does not rot.
 *
 * Long sim runs are where integrators drift, lags creep and a settle test that looked idempotent
 * at two ticks turns out to wander at fifty thousand. This drives an hour of simulated time with
 * the crew working switches, then holds still and checks that nothing is NaN, nothing is out of
 * its declared range, and a settled aircraft is actually still.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Dictionary } from '../src/dictionary.ts';
import { declareAll, tick, type World } from '../src/systems/index.ts';

const world = (altFt = 0): World => ({
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

function run(d: Dictionary, w: World, seconds: number): void {
  const n = Math.round(seconds / 0.05);
  for (let i = 0; i < n; i++) tick(d, w, 0.05);
}

test('an hour of simulated time leaves every variable finite and in range', () => {
  const d = rig();
  const w = world(0);

  d.set('sw.bat1', true);
  d.set('sw.bat2', true);
  d.set('sw.extPwr', true);
  d.set('sw.busTie', true);
  run(d, w, 5);

  // a start, an hour of flight, and a shutdown
  d.set('sw.apuMaster', true);
  d.set('sw.apuStart', true);
  run(d, w, 30);
  d.set('sw.apuBleed', true);
  d.set('sw.fuelPumpL1', true);
  d.set('sw.fuelPumpR1', true);
  d.set('sw.fuelEng1LpValve', true);
  d.set('sw.fuelEng2LpValve', true);
  d.set('sw.eng1Start', 1);
  run(d, w, 20);
  d.set('sw.eng1Master', true);
  d.set('sw.eng2Master', true);
  d.set('sw.eng2Start', 1);
  run(d, w, 60);
  d.set('sw.gen1', true);
  d.set('sw.gen2', true);
  d.set('sw.eng1Bleed', true);
  d.set('sw.eng2Bleed', true);
  d.set('sw.pack1', true);
  d.set('sw.pack2', true);
  d.set('sw.hydGreenEng1', true);
  d.set('sw.hydYellowEng2', true);
  d.set('sw.hydBlueEpump', true);

  const air = world(35000);
  for (const t of [0, 10, 30, 60]) {
    run(d, air, t === 0 ? 0 : 300);
  }
  run(d, air, 60 * 60);

  for (const name of d.names()) {
    const v = d.get(name);
    if (typeof v === 'number') {
      assert.ok(Number.isFinite(v), `${name} = ${v}`);
      const spec = d.spec(name);
      assert.ok(v >= spec.min! - 1e-6 && v <= spec.max! + 1e-6, `${name} = ${v} outside [${spec.min}, ${spec.max}]`);
    }
  }
});

test('a settled aircraft is still after an hour of holding', () => {
  const d = rig();
  const w = world(35000);
  d.set('sw.extPwr', true);
  d.set('sw.busTie', true);
  d.set('sw.hydBlueEpump', true);
  d.set('sw.pressMode', 0);
  // pressurised properly, or the cabin is legitimately still climbing toward the aircraft
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
  run(d, w, 60 * 60);

  const a = d.names().map((n) => `${n}=${String(d.get(n))}`);
  run(d, w, 60);
  const b = d.names().map((n) => `${n}=${String(d.get(n))}`);
  assert.deepEqual(b, a, 'nothing moves once it has settled');
});

test('no variable goes NaN when every fault fires at once', () => {
  const d = rig();
  const w = world(41000);
  d.set('sw.extPwr', true);
  d.set('sw.busTie', true);
  d.set('sw.hydBlueEpump', true);
  run(d, w, 30);

  for (const f of ['fault.hydGreenPump', 'fault.hydBluePump', 'fault.hydYellowPump', 'fault.pack1', 'fault.pack2', 'fault.bleed1']) {
    d.set(f, true);
  }
  run(d, w, 60 * 10);

  for (const name of d.names()) {
    const v = d.get(name);
    if (typeof v === 'number') assert.ok(Number.isFinite(v), `${name} = ${v}`);
  }
});

