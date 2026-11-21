// The frame meter's sums: the rate from the mean interval, the 95th percentile and the worst, and lines
// that say them. MIT.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frameStats, perfLines } from '../src/perf-math.js';

test('a steady 60 Hz with one long frame: the rate from the mean, the long frame the worst, the 95th percentile not it', () => {
  const xs = [...Array(99).fill(1000 / 60), 50];
  const st = frameStats(xs);
  assert.equal(st.n, 100);
  assert.ok(Math.abs(st.mean - (99 * (1000 / 60) + 50) / 100) < 1e-9);
  assert.ok(Math.abs(st.fps - 1000 / st.mean) < 1e-9);
  assert.equal(st.worst, 50);
  assert.ok(Math.abs(st.p95 - 1000 / 60) < 1e-9, 'one frame in a hundred does not move the 95th percentile');
});

test('nothing measured, or nonsense, gives zeros, not NaN', () => {
  assert.deepEqual(frameStats([]), { n: 0, fps: 0, mean: 0, p95: 0, worst: 0 });
  const st = frameStats([NaN, -3, 0, Infinity, 20]);
  assert.equal(st.n, 1);
  assert.equal(st.fps, 50);
});

test('the lines say the rate, the tier, the picture and the draws', () => {
  const lines = perfLines(frameStats([20, 20, 20]), { tier: 'medium', chosen: 'auto', calls: 120, triangles: 210000, width: 2560, height: 1440, ratio: 2, slices: 2 });
  assert.match(lines[0], /^50 fps · 20\.0 ms a frame/);
  assert.match(lines[1], /tier medium \(auto\) · 2560×1440 at 2\.00, 3\.69 Mpx · 2 depth slices/);
  assert.match(lines[2], /120 draw calls · 210 k triangles a frame/);
  // a slow device's rate, to a tenth: one frame of 3.2 s read "0 fps" (2026-11-21's play-test, in software)
  assert.match(perfLines(frameStats([3233.2]))[0], /^0\.3 fps · 3233\.2 ms a frame/);
  assert.match(perfLines(frameStats([200, 200]))[0], /^5\.0 fps/);
});

test('the fourth line says how the frame rate is held: the picture\'s share of the tier\'s, the Earth\'s, the GPU\'s time', () => {
  const st = frameStats([20, 20, 20]);
  const at = (held) => perfLines(st, { tier: 'medium', held });
  assert.equal(at(null).length, 3, 'without the controller, three lines');
  assert.equal(at({ fixed: false, scale: 1, rung: 0, target: 1000 / 60, gpu: null, earth: 1 })[3], 'held at 60 fps: the tier\'s full picture');
  assert.equal(at({ fixed: false, scale: 0.8, rung: 2, target: 1000 / 30, gpu: 12.34, earth: 0.5 })[3], 'held at 30 fps: the picture 0.80 of the tier\'s, 2 rungs down, the Earth at half its size');
  assert.match(at({ fixed: false, scale: 0.8, rung: 2, target: 1000 / 30, gpu: 12.34, earth: 0.5 })[0], / · GPU 12\.3$/);
  assert.equal(at({ fixed: true, scale: 1, rung: 0, target: 1000 / 60, gpu: null, earth: 1 })[3], 'the picture\'s size fixed');
});
