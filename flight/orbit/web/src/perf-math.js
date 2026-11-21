// What the frame times say: the rate, the mean, the 95th percentile and the worst, from the intervals
// between frames in milliseconds. Pure, for perf.js and its test. GPLv3.

export function frameStats(intervals) {
  const xs = intervals.filter((x) => Number.isFinite(x) && x > 0);
  const n = xs.length;
  if (n === 0) return { n: 0, fps: 0, mean: 0, p95: 0, worst: 0 };
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const sorted = [...xs].sort((a, b) => a - b);
  const p95 = sorted[Math.min(n - 1, Math.ceil(0.95 * n) - 1)];
  return { n, fps: 1000 / mean, mean, p95, worst: sorted[n - 1] };
}

// The panel's lines, from the stats and what the renderer drew in a frame.
export function perfLines(st, { tier = '?', chosen = 'auto', calls = 0, triangles = 0, width = 0, height = 0, ratio = 1, slices = 1 } = {}) {
  const mpx = (width * height) / 1e6;
  // under ten a second, a tenth: a frame of 3.2 s read "0 fps" (a slow device is when the meter is wanted)
  return [
    `${st.fps.toFixed(st.fps < 10 ? 1 : 0)} fps · ${st.mean.toFixed(1)} ms a frame · 95% under ${st.p95.toFixed(1)} · worst ${st.worst.toFixed(1)}`,
    `tier ${tier}${chosen === 'auto' ? ' (auto)' : ''} · ${width}×${height} at ${ratio.toFixed(2)}, ${mpx.toFixed(2)} Mpx · ${slices} depth slice${slices === 1 ? '' : 's'}`,
    `${calls} draw calls · ${triangles >= 1e6 ? (triangles / 1e6).toFixed(2) + ' M' : (triangles / 1e3).toFixed(0) + ' k'} triangles a frame`,
  ];
}
