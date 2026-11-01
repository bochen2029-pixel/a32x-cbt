// The page's fixed-step clock: 20 ms steps whatever the frame rate, debt paid back up to five steps a
// frame and the rest dropped and counted, never a stretched step. GPLv3.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Clock } from '../src/clock.js';

test('a 60 Hz display gets 50 steps a second, none dropped', () => {
  const c = new Clock(20, 5);
  let steps = 0;
  for (let f = 0; f < 600; ++f) steps += c.advance(1000 / 60);
  assert.ok(steps >= 499 && steps <= 500, `${steps} steps in ten seconds`);
  assert.equal(c.dropped, 0);
});

test('a 144 Hz display, a 30 Hz display: the same steps for the same wall time', () => {
  const run = (hz) => {
    const c = new Clock(20, 5);
    let steps = 0;
    for (let f = 0; f < hz * 10; ++f) steps += c.advance(1000 / hz);
    return steps;
  };
  for (const hz of [144, 30]) assert.ok(Math.abs(run(hz) - 500) <= 1, `${hz} Hz gives ${run(hz)}`);
});

test('a stall pays back five steps and drops the rest, counted', () => {
  const c = new Clock(20, 5);
  assert.equal(c.advance(400), 5, 'a 400 ms stall is worth 20 steps: five run');
  assert.equal(c.dropped, 15, 'fifteen dropped');
  assert.equal(c.advance(20), 1, 'and the next frame is back to normal');
});

test('nonsense time is refused, not absorbed', () => {
  const c = new Clock();
  assert.throws(() => c.advance(-1), RangeError);
  assert.throws(() => c.advance(NaN), RangeError);
});
