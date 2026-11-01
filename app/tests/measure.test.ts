/**
 * The measurement harness's arithmetic, tested.  node --test tests/measure.test.ts
 *
 * The harness reads the tick rate off the page from outside: the times at which the status line's
 * whole second changes. That is only worth writing into the roadmap if it agrees with the clock's
 * own account, so here the real Clock is driven the way the page drives it and the estimate is
 * held to the truth — for a host that keeps up, and for one that stalls past the catch-up limit.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Clock } from '../src/clock.ts';
import { GRID_HZ, simRate, summary } from '../tools/measure.mjs';

/** Drive a 20 Hz clock with frames of `frameMs(i)`, marking where the shown whole second changes. */
function page(frameMs: (i: number) => number, seconds: number) {
  const clock = new Clock(GRID_HZ);
  const marks: Array<[number, number]> = [];
  let wall = 0;
  let shown = clock.elapsed.toFixed(0); // the page shows "0 s" before the first step; not a change
  for (let i = 0; wall < seconds * 1000; i++) {
    const dt = frameMs(i);
    wall += dt;
    if (clock.advance(dt) > 0) {
      const s = clock.elapsed.toFixed(0); // as the status line shows it
      if (s !== shown) {
        shown = s;
        marks.push([wall, Number(s)]);
      }
    }
  }
  return { marks, truth: clock.elapsed / (wall / 1000) };
}

const jitter = (i: number) => 1000 / 60 + (((i * 7919) % 11) - 5) * 0.3;

test('a host that keeps up reads as 20 steps per wall second', () => {
  const { marks, truth } = page(jitter, 60);
  assert.ok(Math.abs(truth - 1) < 0.002, `the clock itself kept ${truth}`);
  assert.ok(Math.abs(simRate(marks) * GRID_HZ - 20) < 0.02, `${simRate(marks) * GRID_HZ} steps/s`);
});

test('a host that stalls past the catch-up limit reads below 20, and agrees with the clock', () => {
  // every second, one 400 ms frame: the clock runs five steps and drops the rest of the debt
  const { marks, truth } = page((i) => (i % 60 === 59 ? 400 : jitter(i)), 60);
  const rate = simRate(marks);
  assert.ok(rate * GRID_HZ < 19, `${rate * GRID_HZ} steps/s should show the lost time`);
  assert.ok(Math.abs(rate - truth) / truth < 0.01, `estimate ${rate} against the clock's ${truth}`);
});

test('fewer than two whole-second marks is a failure, not a number', () => {
  assert.throws(() => simRate([]), /did not run/);
  assert.throws(() => simRate([[100, 3]]), /did not run/);
});

test('percentiles are nearest-rank, and an empty sample is refused', () => {
  assert.deepEqual(summary([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]), { n: 10, min: 1, median: 5, p95: 10, p99: 10, max: 10 });
  assert.deepEqual(summary([7]), { n: 1, min: 7, median: 7, p95: 7, p99: 7, max: 7 });
  assert.throws(() => summary([]), /no samples/);
});
