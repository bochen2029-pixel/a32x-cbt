/**
 * Instructor mode: freeze, inject, reposition.  node --test tests/instructor.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Session } from '../src/session/session.ts';
import { powerUp } from '../src/training/powerup.ts';
import { bluePumpDrill } from '../src/training/bluepump.ts';
import { packsFail } from '../src/training/packsfail.ts';

const cold = {};

test('a frozen session does not advance, and resumes where it stopped', () => {
  const s = new Session({ procedure: powerUp, world: cold });
  s.advance(500);
  const at = s.simSeconds;
  assert.ok(at > 0);

  s.pause();
  assert.equal(s.isPaused, true);
  assert.equal(s.advance(5000), 0, 'no steps run while frozen');
  assert.equal(s.simSeconds, at, 'time did not move');

  s.resume();
  assert.ok(s.advance(500) > 0);
  assert.ok(s.simSeconds > at);
});

test('the instructor can fire a fault the drill never armed', () => {
  const s = new Session({ procedure: bluePumpDrill, world: cold });
  assert.equal(s.d.bool('fault.hydBluePump'), false);

  s.injectFault('hyd-blue-pump');
  assert.equal(s.d.bool('fault.hydBluePump'), true);
  assert.deepEqual([...s.faultsFired], ['hyd-blue-pump']);
});

test('a repaired fault stops being reported', () => {
  const s = new Session({ procedure: bluePumpDrill, world: cold });
  s.injectFault('hyd-blue-pump');
  s.clearFault('hyd-blue-pump');
  assert.equal(s.d.bool('fault.hydBluePump'), false);
  assert.deepEqual([...s.faultsFired], []);
});

test('an unknown fault is refused rather than silently ignored', () => {
  const s = new Session({ procedure: powerUp, world: cold });
  assert.throws(() => s.injectFault('no-such-thing'), /unknown fault/);
});

test('repositioning moves the aircraft, restarts the score and counts the move', () => {
  const s = new Session({ procedure: powerUp, world: cold });

  // work part of the flow, then park it
  s.d.set('sw.bat1', true);
  s.d.set('sw.bat2', true);
  s.d.set('sw.extPwr', true);
  s.d.set('sw.busTie', true);
  s.advance(500);
  assert.ok(s.debrief().completed > 0, 'some credit earned');

  const parked = s.toSituation('instructor move');

  // the instructor drops the trainee into a different aircraft
  const other = new Session({ procedure: powerUp, world: cold });
  other.d.set('sw.apuMaster', true);
  const moved = other.toSituation('elsewhere');
  s.reposition(moved);

  assert.equal(s.repositionCount, 1);
  assert.equal(s.debrief().completed, 0, 'the attempt restarts');
  assert.equal(s.d.bool('sw.extPwr'), false, 'and the aircraft is the new one');
  assert.match(parked, /ElapsedSteps/);
});

test('a repositioned session still scores from the new state', () => {
  const s = new Session({ procedure: powerUp, world: cold });
  s.d.set('sw.extPwr', true);
  s.d.set('sw.busTie', true);
  s.advance(100);

  s.reposition(s.toSituation('parked with ground power'));
  s.advance(100);

  // the parked aircraft already had ground power, so the first step is satisfied on the new score
  assert.equal(s.debrief().steps[0].status, 'done');
});

test('freezing does not lose an armed fault trigger', () => {
  const s = new Session({
    procedure: packsFail,
    world: { pressureAltitudeFt: 35000 },
    faults: [{ id: 'pack-1', trigger: { kind: 'atTime', sec: 2 } }],
  });
  s.runFor(0.5);
  const before = s.simSeconds;
  s.pause();
  s.advance(10000);
  assert.equal(s.simSeconds, before, 'the clock is held');
  assert.equal(s.d.bool('fault.pack1'), false, 'and the trigger has not fired early');

  s.resume();
  s.runFor(3);
  assert.equal(s.d.bool('fault.pack1'), true, `sim ${s.simSeconds}, fired ${s.faultsFired.join(',')}`);
});

