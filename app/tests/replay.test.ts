/**
 * P1 gate: park a run, resume it, replay it, and require the same outcome.
 *
 * This is what makes replay, autosave and diffing possible. If a resumed run can diverge, every
 * debrief is suspect.
 *
 * Step timestamps are deliberately not compared: a resumed scorer re-checks satisfied steps from
 * its own zero, so they would never match. The verdict, the count and every status must.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Session } from '../src/session/session.ts';
import { Recorder, replay } from '../src/session/replay.ts';
import { powerUp } from '../src/training/powerup.ts';
import { startEngine1 } from '../src/training/startengine.ts';

const world = {};

/** The trainee's script: second -> switches worked. */
const SCRIPT: ReadonlyArray<readonly [number, (r: Recorder) => void]> = [
  [0.5, (r) => {
    r.set('sw.bat1', true);
    r.set('sw.bat2', true);
  }],
  [1, (r) => {
    r.set('sw.extPwr', true);
    r.set('sw.busTie', true);
  }],
  [3, (r) => {
    r.set('sw.apuMaster', true);
    r.set('sw.apuStart', true);
  }],
  [36, (r) => {
    r.set('sw.fuelPumpL1', true);
    r.set('sw.fuelPumpR1', true);
    r.set('sw.fuelEng1LpValve', true);
    r.set('sw.fuelEng2LpValve', true);
  }],
  [40, (r) => r.set('sw.hydBlueEpump', true)],
  [44, (r) => r.set('sw.apuBleed', true)],
];

/** Drive `s` through the script up to `untilSec`, recording everything. */
function play(s: Session, r: Recorder, untilSec: number): void {
  for (const [at, fn] of SCRIPT) {
    if (at > untilSec) break;
    while (s.simSeconds < at) s.step(s.clock.dt);
    fn(r);
  }
  while (s.simSeconds < untilSec && !s.done) s.step(s.clock.dt);
}

const outcome = (s: Session) => {
  const d = s.debrief();
  return { passed: d.passed, completed: d.completed, statuses: d.steps.map((x) => x.status) };
};

test('a run resumed from a parked situation replays to the same outcome', () => {
  const straight = new Session({ procedure: powerUp, world });
  const straightRec = new Recorder(straight);
  play(straight, straightRec, 120);
  assert.equal(straight.debrief().passed, true, 'the reference run must actually pass');

  const cut = 38;
  const half = new Session({ procedure: powerUp, world });
  const halfRec = new Recorder(half);
  play(half, halfRec, cut);

  const resumed = Session.fromSituation({ procedure: powerUp, world }, half.toSituation('parked'));
  assert.equal(resumed.simSeconds, half.simSeconds, 'the clock resumes where it stopped');

  replay(resumed, straightRec.actions().filter((a) => a.sec > cut), 120);

  assert.deepEqual(outcome(resumed), outcome(straight));
  assert.equal(resumed.debrief().passed, true);
});

test('the park file carries the elapsed step count, not a rounded second', () => {
  const s = new Session({ procedure: powerUp, world });
  for (let i = 0; i < 100; i++) s.step(0.05);
  assert.match(s.toSituation('x'), /\[ElapsedSteps 100\]/);
});

test('a resumed session keeps the state the drill depends on', () => {
  const s = new Session({ procedure: startEngine1, world });
  s.d.set('sw.bat1', true);
  s.d.set('sw.bat2', true);
  for (let i = 0; i < 20; i++) s.step(0.05);
  s.d.set('sw.apuMaster', true);
  s.d.set('sw.apuStart', true);
  for (let i = 0; i < 600; i++) s.step(0.05);

  const resumed = Session.fromSituation({ procedure: startEngine1, world }, s.toSituation('apu up'));
  resumed.step(resumed.clock.dt);
  assert.equal(resumed.d.bool('sys.apuRunning'), true);
  assert.equal(resumed.debrief().steps[0].status, 'done', 'the satisfied step is seen on the first check');
});

test('replay stops at the session end rather than overrunning', () => {
  const s = new Session({ procedure: powerUp, world });
  const r = new Recorder(s);
  play(s, r, 120);
  const stepsAtEnd = s.steps;
  replay(s, r.actions(), 600);
  assert.equal(s.done, true);
  assert.ok(s.steps <= stepsAtEnd + 1, `replay ran on to ${s.steps} steps`);
});
