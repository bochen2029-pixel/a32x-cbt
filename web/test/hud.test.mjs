// What the readouts say. GPLv3.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AUTO, PH } from '../src/core.js';
import { fmtClock, fmtDistance, status } from '../src/hud.js';

test('distances in a pilot\'s units', () => {
  assert.equal(fmtDistance(651), '651 m');
  assert.equal(fmtDistance(1500), '1.50 km');
  assert.equal(fmtDistance(25000), '25.0 km');
  assert.equal(fmtDistance(3444000), '3444 km');
  assert.equal(fmtClock(754), '12:34');
});

test('the status line says what the craft does and what the pilot can do next', () => {
  const s = { auto: AUTO.crew, phase: PH.hold, window: 19.2, crashed: 0, ringRange: 25000, portRange: 900, onGround: 1, qbar: 0, sas: 0 };
  assert.equal(status(s, 1).line, 'CREW · HOLD · brakes off in 19 s');
  assert.match(status(s, 1).hint, /^Space/);
  assert.match(status(s, 1, true).hint, /^CREW/);
  assert.equal(status({ ...s, phase: PH.orbit }, 1).line, 'CREW · IN ORBIT · the Ring 25.0 km ahead');
  assert.equal(status({ ...s, auto: AUTO.approach, portRange: 3 }, 1).line, 'APPROACH · HOLDING 300 m OFF THE HUB PORT');
  assert.equal(status({ ...s, auto: AUTO.off, onGround: 0, qbar: 0, sas: 3 }, 1).line, 'HAND · RATE + TARGET');
  assert.equal(status({ ...s, crashed: 1 }, 1).line, 'CRASHED');
});
