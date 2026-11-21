// What the readouts say. MIT.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AUTO, PH } from '../src/core.js';
import { DOCK } from '../src/dock-hud.js';
import { REACH, fixed, fmtClock, fmtDistance, inReach, readouts, status } from '../src/hud.js';

test('distances in a pilot\'s units', () => {
  assert.equal(fmtDistance(651), '651 m');
  assert.equal(fmtDistance(1500), '1.50 km');
  assert.equal(fmtDistance(25000), '25.0 km');
  assert.equal(fmtDistance(3444000), '3444 km');
  assert.equal(fmtClock(754), '12:34');
  // a day's wait for a pass reads in hours, not as 1263 minutes
  assert.equal(fmtClock(75804), '21:03:24');
  assert.equal(fmtClock(3599), '59:59');
});

test('a readout that rounds to nought reads as nought, never minus nought', () => {
  assert.equal(fixed(-0.2), '0');
  assert.equal(fixed(-0.04, 1), '0.0');
  assert.equal(fixed(-0.06, 1), '-0.1');
  assert.equal(fixed(12.345, 1), '12.3');
});

const s = {
  auto: AUTO.crew, phase: PH.hold, window: 19.2, crashed: 0, ringRange: 25000, portRange: 900, onGround: 1, qbar: 0, sas: 0, vrelE: 0.3, vrelN: 0.2, vrelU: 0,
};

test('the status line says what the craft does and what the pilot can do next', () => {
  assert.equal(status(s, 1).line, 'CREW · HOLD · brakes off in 19 s');
  assert.match(status(s, 1).hint, /^Space/);
  assert.match(status(s, 1).hint, /H: the keys$/);   // the help is not always shown at the start: the hint names it
  assert.match(status(s, 1, true).hint, /^CREW/);
  assert.equal(status({ ...s, phase: PH.orbit }, 1).line, 'CREW · IN ORBIT · the Ring 25.0 km ahead');
  assert.equal(status({ ...s, auto: AUTO.approach, portRange: 3 }, 1).line, 'APPROACH · HOLDING 300 m OFF THE HUB PORT');
  assert.equal(status({ ...s, auto: AUTO.off, onGround: 0, qbar: 0, sas: 3 }, 1).line, 'HAND · RATE + TARGET');
  // the law the core flies (OC_AIR_LAW), not a guess from the dynamic pressure: between its 200 and 400 Pa
  // either may hold, by which way the craft came
  assert.match(status({ ...s, auto: AUTO.off, onGround: 0, qbar: 300, airLaw: 1, sas: 0 }, 1).line, /^HAND · AIR LAW/);
  assert.match(status({ ...s, auto: AUTO.off, onGround: 0, qbar: 300, airLaw: 0, sas: 0 }, 1).line, /^HAND · RATE \+/);
  assert.equal(status({ ...s, crashed: 1 }, 1).line, 'CRASHED');
});

test('the approach is offered only where the core takes it, and the next step when it holds', () => {
  assert.deepEqual(REACH, { m: DOCK.engageM, speed: DOCK.engageSpeed });   // the core's reach, as docking's has it
  const orbit = { ...s, phase: PH.orbit };
  assert.ok(inReach(orbit));
  assert.match(status(orbit, 1).hint, /T: the crew flies the approach/);
  // up by hand, the crew's orbit can leave the Ring 230 km off and opening at 700 m/s (2026-11-21's play-test):
  // T and DOCK are refused there, so the hint is the way home
  const far = { ...orbit, ringRange: 228700, vrelE: 713, vrelN: 150 };
  assert.ok(!inReach(far));
  assert.equal(status(far, 1).line, 'CREW · IN ORBIT · the Ring 228.7 km away, passing at 729 m/s');
  assert.doesNotMatch(status(far, 1).hint, /approach$|T:/);
  assert.match(status(far, 1).hint, /R: the crew flies home/);
  assert.match(status(far, 1, true).hint, /RETURN: the crew flies home/);
  assert.ok(!inReach({ ...orbit, vrelE: 60 }));   // near, but passing too fast
  // held off the hub's port, the next step is docking
  const held = { ...s, auto: AUTO.approach, portRange: 3 };
  assert.match(status(held, 1).hint, /^P: the crew docks/);
  assert.match(status(held, 1, true).hint, /^DOCK: the crew docks/);
  assert.equal(status({ ...held, portRange: 2400 }, 1).hint, 'Space: take the controls');
});

test('a pilot handed the craft parked is told how to let the brakes go, and the readouts show them held', () => {
  const parked = { ...s, auto: AUTO.off, onGround: 1, airLaw: 1 };
  assert.equal(status(parked, 1, false, { brake: 1 }).hint, 'B: let the brakes go');
  assert.equal(status(parked, 1, true, { brake: 1 }).hint, 'MORE, BRAKES: let them go');   // a phone has no B
  assert.equal(status(parked, 1, false, { brake: 0 }).hint, '');
  assert.equal(status({ ...parked, onGround: 0 }, 1, false, { brake: 1 }).hint, '');
  assert.equal(status({ ...parked, auto: AUTO.crew, phase: PH.roll }, 1, false, { brake: 1 }).hint, 'Space: take the controls · .: faster');
});

const flying = {
  ...s, auto: AUTO.off, t: 75824, alt: 3, vs: -0.3, tas: 0, mach: 0, qbar: 0, pitch: -0.02, roll: -0.04, hdg: 180, alpha: -0.01, beta: 0, g: 1,
  vorb: 390, apo: 3, peri: -6e6, inc: 32.9, throttle: 0, prop: 30000, gear: 1, ringRate: -6624, onGround: 1,
};

test('the readouts: the warp while skipping, no minus nought, the brakes the pilot holds', () => {
  const desk = readouts(flying, { warp: 'MAX', view: 'chase', hands: { brake: 1 } }).split('\n');
  assert.match(desk[0], /^T\+21:03:24 {3}WARP MAX {3}VIEW chase$/);   // not "MAX×", and hours for a long flight
  assert.match(desk[1], /VS \+0 m\/s$/);
  assert.match(desk[3], /pitch 0\.0° {2}bank 0\.0°/);
  assert.match(desk[4], /α 0\.0°/);
  assert.match(desk[6], /gear DOWN {3}BRAKES$/);
  assert.doesNotMatch(readouts(flying, { warp: 5, view: 'chase', hands: { brake: 0 } }), /BRAKES/);
  assert.match(readouts(flying, { warp: 5, view: 'chase', hands: { brake: 0 } }), /WARP 5×/);
  assert.match(readouts(flying, { warp: 0, view: 'chase', hands: { brake: 0 } }), /WARP 0× paused {3}VIEW/);   // TIME − at one to one stops it
  const phone = readouts(flying, { warp: 'MAX', view: 'chase', hands: { brake: 1 } }, true, ['FD x']).split('\n');
  assert.match(phone[0], /^T\+21:03:24 {2}MAX {2}chase$/);
  assert.match(phone[1], /VS \+0$/);
  assert.match(phone[4], /BRAKES$/);
  assert.equal(phone[phone.length - 1], 'FD x');
});
