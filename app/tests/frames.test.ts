/**
 * Frame pacing, tested.  node --test tests/frames.test.ts
 *
 * The page advances the session from animation-frame stamps. The trainer once stopped on load
 * because the first stamp could predate the startup code that asked for it; these hold the pacing
 * to what a trainee needs: time starts, time keeps up with the wall, and freeze means freeze.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Session } from '../src/session/session.ts';
import { pacer } from '../src/app/frames.ts';
import { powerUp } from '../src/training/powerup.ts';

const FRAME = 1000 / 60;

/** Stamp `seconds` of 60 Hz frames starting at `from`, feeding each to `pace`. */
function frames(pace: (stamp: number) => number, from: number, seconds: number): number {
  let stamp = from;
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    pace(stamp);
    stamp += FRAME;
  }
  return stamp;
}

test('the first frame starts the clock wherever its stamp falls, and advances nothing itself', () => {
  for (const first of [0, 3.2, 995.4, 1e7]) {
    const s = new Session({ procedure: powerUp });
    const pace = pacer(() => s);
    assert.equal(pace(first), 0, 'the first frame is only the baseline');
    frames(pace, first + FRAME, 1);
    assert.ok(s.clock.elapsed >= 0.95, `from ${first}: ${s.clock.elapsed} s after a second of frames`);
  }
});

test('ten seconds of 60 Hz frames are ten simulated seconds, within a step', () => {
  const s = new Session({ procedure: powerUp });
  frames(pacer(() => s), 995.4, 10);
  assert.ok(Math.abs(s.clock.elapsed - 10) <= 0.05 + 1e-9, `${s.clock.elapsed} s`);
});

test('a frozen aircraft holds still and does not lurch forward when it is resumed', () => {
  const s = new Session({ procedure: powerUp });
  const pace = pacer(() => s);
  let stamp = frames(pace, 0, 1);
  const before = s.clock.elapsed;

  s.pause();
  stamp = frames(pace, stamp, 2);
  assert.equal(s.clock.elapsed, before, 'nothing moves while frozen');

  s.resume();
  frames(pace, stamp, 0.1);
  assert.ok(s.clock.elapsed - before <= 0.15 + 1e-9, `resumed by ${s.clock.elapsed - before} s, not by the frozen two`);
});

test('a reset hands the frames to the new session without a burst of old time', () => {
  let s = new Session({ procedure: powerUp });
  const pace = pacer(() => s);
  const stamp = frames(pace, 0, 2);
  s = new Session({ procedure: powerUp });
  frames(pace, stamp, 1);
  assert.ok(Math.abs(s.clock.elapsed - 1) <= 0.05 + 1e-9, `${s.clock.elapsed} s in the new session`);
});
