/**
 * The session, tested.  node --test tests/session.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Session } from '../src/session/session.ts';
import { powerUp } from '../src/training/powerup.ts';
import { packsFail } from '../src/training/packsfail.ts';
import { formatDebrief } from '../src/training/procedure.ts';

function run(s: Session, seconds: number): void {
  const n = Math.round(seconds / 0.05);
  for (let i = 0; i < n && !s.done; i++) s.step(0.05);
}

test('a session starts cold and dark with a live scorer', () => {
  const s = new Session({ procedure: powerUp });
  assert.equal(s.d.bool('bus.ac1'), false);
  assert.equal(s.d.bool('bus.hotBat'), false, 'nothing has ticked yet');
  assert.equal(s.done, false);
  assert.equal(s.debrief().steps.length, powerUp.steps.length);
});

test('advancing by wall time runs whole fixed steps and nothing partial', () => {
  const s = new Session({ procedure: powerUp });
  assert.equal(s.advance(49), 0);
  assert.equal(s.advance(1), 1);
  assert.equal(s.clock.elapsed, 0.05);
});

test('working the flow through the session passes it', () => {
  const s = new Session({ procedure: powerUp });
  s.d.set('sw.bat1', true);
  s.d.set('sw.bat2', true);
  s.d.set('sw.extPwr', true);
  s.d.set('sw.busTie', true);
  run(s, 2);
  s.d.set('sw.apuMaster', true);
  s.d.set('sw.apuStart', true);
  run(s, 35);
  s.d.set('sw.fuelPumpL1', true);
  s.d.set('sw.fuelPumpR1', true);
  s.d.set('sw.fuelEng1LpValve', true);
  s.d.set('sw.fuelEng2LpValve', true);
  s.d.set('sw.hydBlueEpump', true);
  s.d.set('sw.apuBleed', true);
  run(s, 30);

  const r = s.debrief();
  assert.equal(r.passed, true, formatDebrief(r));
});

test('a timed fault fires through the session at its second', () => {
  const s = new Session({
    procedure: packsFail,
    world: { pressureAltitudeFt: 35000 },
    faults: [
      { id: 'pack-1', trigger: { kind: 'atTime', sec: 3 } },
      { id: 'pack-2', trigger: { kind: 'atTime', sec: 3 } },
    ],
  });

  run(s, 2);
  assert.equal(s.d.bool('fault.pack1'), false);
  assert.deepEqual(s.faultsFired, []);

  run(s, 2);
  assert.equal(s.d.bool('fault.pack1'), true);
  assert.equal(s.d.bool('fault.pack2'), true);
  assert.deepEqual([...s.faultsFired], ['pack-1', 'pack-2']);
});

test('an altitude-triggered fault uses the world altitude', () => {
  const s = new Session({
    procedure: packsFail,
    world: { pressureAltitudeFt: 0 },
    faults: [{ id: 'bleed-1', trigger: { kind: 'atAltitude', ft: 10000 } }],
  });
  run(s, 1);
  assert.deepEqual(s.faultsFired, [], 'still on the ground');
});

test('a session is reset by making a new one, and the old one is untouched', () => {
  const a = new Session({ procedure: powerUp });
  a.d.set('sw.bat1', true);
  run(a, 1);
  assert.equal(a.d.bool('sw.bat1'), true);

  const b = new Session({ procedure: powerUp });
  assert.equal(b.d.bool('sw.bat1'), false);
  assert.equal(b.clock.elapsed, 0);
  assert.equal(a.d.bool('sw.bat1'), true, 'the first session kept its state');
});

test('the session describes itself for a header line', () => {
  const s = new Session({ procedure: powerUp });
  assert.match(s.describe(), /Cold & dark to fully powered/);
});
