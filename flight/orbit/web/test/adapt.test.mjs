// Holding the frame rate (adapt.js): the drawing buffer's size from the frame times, with made-up devices
// whose frames take a time in proportion to the pixels drawn and show at the display's next refresh, as a
// browser's frames do. It settles under the target, does not oscillate, comes back up when the load
// drops, keeps out of the way of a fast machine and of one whose time goes elsewhere; and the tiers
// step down and up. MIT.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Governor, LAW, RUNG, RUNGS, Resolution, STEPS, TARGET, TierSteps, rungScale, windowMs } from '../src/adapt.js';

// A device: its GPU takes gpu ms for a frame at the tier's full size, in proportion to the pixels, and
// fixed ms whatever the size; its processor cpu ms; the two work side by side, and a frame shows at the
// first refresh (every vsync ms) after both are done. noise: a share of jitter, from a seeded sequence.
function device({ gpu, fixed = 0, cpu = 2, vsync = 1000 / 60, noise = 0.05, seed = 7 }) {
  let s = seed;
  const rand = () => ((s = (Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9) >>> 0) / 4294967296);
  return (rung, load = 1) => {
    const g = (fixed + gpu * load * Math.pow(RUNG, rung)) * (1 + noise * (rand() - 0.5));
    const work = Math.max(g, cpu * (1 + noise * (rand() - 0.5)));
    return { ms: Math.max(1, Math.ceil(work / vsync - 1e-9)) * vsync, gpuMs: g };
  };
}

// Runs a controller for seconds of frames; load(t) scales the device's GPU time. Returns the rungs at
// each frame with their times, and the changes.
function run(ctl, dev, seconds, { load = () => 1, gpu = false, t0 = 0 } = {}) {
  const frames = [], changes = [];
  let t = t0;
  while (t < t0 + seconds * 1000) {
    const f = dev(ctl.rung, load(t));
    const c = ctl.push(f.ms, gpu ? f.gpuMs : null);
    if (c) changes.push({ t, ...c });
    frames.push({ t, ms: f.ms, rung: ctl.rung });
    t += f.ms;
  }
  return { frames, changes, t };
}

const share = (frames, test) => frames.filter(test).reduce((a, f) => a + f.ms, 0) / frames.reduce((a, f) => a + f.ms, 0);

test('the ladder: each rung 0.8 of the pixels of the one above, down to a quarter', () => {
  assert.equal(rungScale(0), 1);
  for (let k = 1; k < RUNGS; k++) assert.ok(Math.abs((rungScale(k) / rungScale(k - 1)) ** 2 - RUNG) < 1e-12);
  const floor = rungScale(RUNGS - 1) ** 2;
  assert.ok(floor > 0.2 && floor < 0.3, `${floor} of the pixels at the bottom`);
});

test('a window\'s time leaves out its slowest eighth and its spikes, so one long frame moves nothing', () => {
  assert.equal(windowMs([]), 0);
  assert.ok(Math.abs(windowMs(Array(30).fill(16.7)) - 16.7) < 1e-9);
  assert.ok(Math.abs(windowMs([...Array(29).fill(16.7), 900]) - 16.7) < 1e-9, 'a shader compiling');
  assert.ok(Math.abs(windowMs([16.7, 33.3, 16.7, 33.3, 16.7, 33.3, 16.7, 33.3]) - (16.7 * 4 + 33.3 * 3) / 7) < 1e-9, 'every other refresh missed counts');
  assert.equal(windowMs([NaN, -1, 20]), 20);
});

test('a fast machine stays at the tier\'s own size, and nothing changes in five minutes', () => {
  for (const vsync of [1000 / 60, 1000 / 120, 1000 / 144]) {
    const ctl = new Resolution();
    const r = run(ctl, device({ gpu: 9, vsync }), 300);
    assert.equal(r.changes.length, 0, `${(1000 / vsync).toFixed(0)} Hz: ${JSON.stringify(r.changes.slice(0, 3))}`);
    assert.equal(ctl.rung, 0);
  }
  // nor with a hitch now and then: a long frame every ten seconds
  const ctl = new Resolution(), dev = device({ gpu: 9 });
  let t = 0, changes = 0, n = 0;
  while (t < 300000) {
    const f = ++n % 600 === 0 ? { ms: 700 } : dev(ctl.rung);
    if (ctl.push(f.ms)) changes++;
    t += f.ms;
  }
  assert.equal(changes, 0);
  // nor with a start whose first frames wait for the shaders to compile
  const start = new Resolution();
  const compiles = [800, 450, 600, 120, 300, 90, 60, 250, 40, 30];
  for (const ms of compiles) assert.equal(start.push(ms), null);
  assert.equal(run(start, device({ gpu: 9 }), 60).changes.length, 0);
});

test('a slow machine comes down quickly, settles under the target, and stays there', () => {
  for (const gpu of [24, 30, 45, 60]) {
    const ctl = new Resolution();
    const r = run(ctl, device({ gpu }), 330);
    const first = r.changes[0];
    assert.ok(first && first.t < LAW.warmMs + 1500 && first.kind === 'down', `${gpu} ms: the first step down at ${first && first.t} ms`);
    // the rung where the frames come on target, the lowest such: where it should settle
    const want = [...Array(RUNGS).keys()].find((k) => gpu * RUNG ** k <= TARGET.desktop * 0.98);
    const settled = r.frames.filter((f) => f.t > 30000);
    const at = share(settled, (f) => f.rung === want);
    assert.ok(at > 0.97, `${gpu} ms: at rung ${want} ${(at * 100).toFixed(1)} % of the time after the first half minute`);
    const late = share(settled, (f) => f.ms > TARGET.desktop * 1.5);
    assert.ok(late < 0.015, `${gpu} ms: ${(late * 100).toFixed(1)} % of the time in frames slower than the target`);
  }
  // one that no rung brings to the target rests at the floor
  const ctl = new Resolution();
  run(ctl, device({ gpu: 90 }), 60);
  assert.equal(ctl.rung, RUNGS - 1);
});

test('it does not oscillate: the tries above the settled rung fail ever more rarely, cost a few frames, and it never goes below it', () => {
  const ctl = new Resolution();
  const r = run(ctl, device({ gpu: 30 }), 600);
  const settled = r.changes.filter((c) => c.t > 10000);
  const tries = settled.filter((c) => c.kind === 'up');
  for (const c of settled) assert.ok(c.rung >= 2 && c.rung <= 3, `rung ${c.rung} at ${c.t} ms`);
  const gaps = tries.slice(1).map((c, i) => c.t - tries[i].t);
  for (let i = 1; i < gaps.length; i++) assert.ok(gaps[i] >= gaps[i - 1] * 0.95 || gaps[i] > LAW.probeMaxMs * 0.9, `gaps ${gaps.map((g) => (g / 1000).toFixed(1)).join(', ')} s`);
  assert.ok(gaps.at(-1) > LAW.probeMaxMs * 0.9, 'the gap grows to its longest');
  assert.ok(tries.length <= 600000 / LAW.probeMaxMs + 6, `${tries.length} tries in ten minutes`);
  const late = share(r.frames.filter((f) => f.t > 10000), (f) => f.ms > TARGET.desktop * 1.5);
  assert.ok(late < 0.01, `${(late * 100).toFixed(2)} % of the time in the tries' slow frames`);
});

test('it recovers when the load drops, and comes down again when it returns', () => {
  const ctl = new Resolution();
  const dev = device({ gpu: 9 });
  const load = (t) => (t < 60000 ? 4 : t < 120000 ? 1 : 4);
  const r = run(ctl, dev, 180, { load });
  const at = (t) => r.frames.findLast((f) => f.t <= t).rung;
  assert.ok(at(59000) >= 3, `under four times the load: rung ${at(59000)}`);
  // without the GPU's time, by trying: the rung that failed last waits its longest, the rest a moment each
  const back = r.frames.find((f) => f.t > 60000 && f.rung === 0);
  const within = LAW.probeMaxMs + RUNGS * LAW.probeMs + 2000;
  assert.ok(back && back.t < 60000 + within, `back at full size ${back ? ((back.t - 60000) / 1000).toFixed(1) : 'never'} s after the load dropped`);
  assert.ok(at(119000) === 0);
  const down = r.frames.find((f) => f.t > 120000 && f.rung >= 3);
  assert.ok(down && down.t < 122000, 'and down again within two seconds of its return');
  assert.ok(r.frames.find((f) => f.rung > 0).t > LAW.warmMs, 'nothing in the first two seconds, while the shaders compile');
});

test('a phone aims at 30 frames a second', () => {
  const ctl = new Resolution({ target: TARGET.phone });
  const r = run(ctl, device({ gpu: 45 }), 120);
  const settled = r.frames.filter((f) => f.t > 20000);
  assert.ok(share(settled, (f) => f.ms <= TARGET.phone + 0.5) > 0.95);
  assert.ok(share(settled, (f) => f.rung === 2) > 0.95, 'at the rung where 45 ms comes under 33');
  const fast = new Resolution({ target: TARGET.phone });
  assert.equal(run(fast, device({ gpu: 25 }), 120).changes.length, 0, '25 ms is fast enough for a phone');
});

test('where the time goes elsewhere, fewer pixels would not help: the picture keeps its size', () => {
  // a slow processor, and a browser that holds the page to 30 frames a second to save power
  for (const [name, dev] of [['the processor', device({ gpu: 8, cpu: 40 })], ['a 30 Hz cap', device({ gpu: 8, vsync: 1000 / 30 })]]) {
    const ctl = new Resolution();
    const r = run(ctl, dev, 300);
    const full = share(r.frames, (f) => f.rung === 0);
    assert.ok(full > 0.95, `${name}: at full size ${(full * 100).toFixed(1)} % of the time`);
    const downs = r.changes.filter((c) => c.kind === 'down');
    assert.ok(downs.length <= 8, `${name}: ${downs.length} tries down in five minutes`);
    assert.ok(r.changes.filter((c) => c.kind === 'undo').length === downs.length, 'each undone');
  }
  // with the GPU's time measured it does not even try
  const ctl = new Resolution();
  assert.equal(run(ctl, device({ gpu: 8, cpu: 40 }), 60, { gpu: true }).changes.length, 0);
});

test('with the GPU\'s own time it steps up as soon as the rung above fits, with no tries that fail', () => {
  const ctl = new Resolution();
  const load = (t) => (t < 30000 ? 3 : 1);
  const r = run(ctl, device({ gpu: 9 }), 60, { load, gpu: true });
  assert.equal(r.changes.filter((c) => c.kind === 'back').length, 0);
  const back = r.frames.find((f) => f.t > 30000 && f.rung === 0);
  assert.ok(back && back.t < 30000 + 6000, `back at full size ${back ? ((back.t - 30000) / 1000).toFixed(1) : 'never'} s after`);
});

test('the same frames give the same changes, and the rung stays between the cap and the floor', () => {
  const a = run(new Resolution(), device({ gpu: 40, noise: 0.3, seed: 3 }), 120).changes;
  const b = run(new Resolution(), device({ gpu: 40, noise: 0.3, seed: 3 }), 120).changes;
  assert.deepEqual(a, b);
  const ctl = new Resolution();
  const r = run(ctl, device({ gpu: 400 }), 60);
  assert.equal(Math.max(...r.frames.map((f) => f.rung)), RUNGS - 1, 'a hopeless device rests at the floor');
  assert.ok(r.frames.every((f) => f.rung >= 0 && f.rung < RUNGS));
});

// ---- the tiers ----

function govern(gov, dev, seconds, { tierCost = { low: 1, medium: 2.2, high: 3 }, gpu = false } = {}) {
  const events = [];
  let t = 0;
  while (t < seconds * 1000) {
    const f = dev(gov.rung, tierCost[gov.tiers.tier]);
    const out = gov.frame(f.ms, { gpuMs: gpu ? f.gpuMs : null });
    if (out && (out.tier || out.offer)) events.push({ t, ...out });
    t += f.ms;
  }
  return events;
}

test('auto: a tier down when half the pixels are not enough, and never back up to it', () => {
  const gov = new Governor({ tier: 'high', auto: true });
  const events = govern(gov, device({ gpu: 30 }), 300);   // high costs 90 ms a frame here, medium 66, low 30
  assert.deepEqual(events.map((e) => e.tier), ['medium', 'low'], JSON.stringify(events));
  assert.ok(events[0].t < 12000, `the first step down at ${(events[0].t / 1000).toFixed(1)} s`);
  assert.equal(gov.tiers.tier, 'low');
  assert.ok(gov.rung >= 1 && gov.rung <= 3, `low at rung ${gov.rung}`);
});

test('auto: where fewer pixels do not help, a tier down only if the GPU\'s own time shows it busy', () => {
  // a GPU whose time is the tier's fixed costs (shadows, reflections, geometry), not the pixels'
  const busy = (rung, cost) => ({ ms: Math.ceil((28 * cost) / (1000 / 60) - 1e-9) * (1000 / 60), gpuMs: 28 * cost });
  const gov = new Governor({ tier: 'medium', auto: true });
  let t = 0;
  const events = [];
  const cost = { low: 0.5, medium: 1, high: 1.5 };
  while (t < 60000) {
    const f = busy(gov.rung, cost[gov.tiers.tier]);
    const out = gov.frame(f.ms, { gpuMs: f.gpuMs });
    if (out && out.tier) events.push(out.tier);
    t += f.ms;
  }
  assert.deepEqual(events, ['low']);
  // a browser holding the page to 30 frames a second, no GPU time to tell: the tier is kept
  const capped = new Governor({ tier: 'medium', auto: true });
  assert.deepEqual(govern(capped, device({ gpu: 8, vsync: 1000 / 30 }), 120), []);
  assert.equal(capped.tiers.tier, 'medium');
});

test('auto: a minute with room offers the tier above on trial; slow there, it goes back and does not try again', () => {
  const gov = new Governor({ tier: 'low', auto: true });
  // low at 10 ms is fast; medium, at 2.2 times, is too slow for the full size
  const events = govern(gov, device({ gpu: 10 }), 400, { tierCost: { low: 1, medium: 3, high: 4 } });
  assert.deepEqual(events.map((e) => e.tier), ['medium', 'low'], JSON.stringify(events));
  assert.ok(events[0].t >= STEPS.roomMs && events[0].t < STEPS.roomMs + STEPS.warmMs + 2000, `tried at ${(events[0].t / 1000).toFixed(1)} s`);
  assert.ok(events[1].t - events[0].t < STEPS.warmMs + STEPS.trialMs, 'given up within the trial');
  assert.equal(gov.tiers.tier, 'low');
});

test('auto: room for the tier above, and it holds there: it stays', () => {
  const gov = new Governor({ tier: 'low', auto: true });
  const events = govern(gov, device({ gpu: 4 }), 200, { tierCost: { low: 1, medium: 2, high: 3 } });
  assert.deepEqual(events.map((e) => e.tier), ['medium', 'high']);
  assert.equal(gov.tiers.tier, 'high');
  assert.equal(gov.rung, 0);
});

test('chosen by hand, the tier stays; the page offers the one above only where the GPU\'s time shows room', () => {
  const slow = new Governor({ tier: 'high', auto: false });
  assert.deepEqual(govern(slow, device({ gpu: 30 }), 120), [], 'slow: fewer pixels, the tier kept');
  assert.ok(slow.rung > 0);
  const quiet = new Governor({ tier: 'low', auto: false });
  assert.deepEqual(govern(quiet, device({ gpu: 4 }), 120), [], 'no GPU time: nothing to go by on a 60 Hz display');
  const told = new Governor({ tier: 'low', auto: false });
  const events = govern(told, device({ gpu: 4 }), 200, { gpu: true });
  assert.deepEqual(events.map((e) => e.offer), ['medium'], 'once');
});

test('frames that are not the drawing\'s count for nothing, and a fixed picture never changes', () => {
  const gov = new Governor({ tier: 'medium', auto: true });
  for (let i = 0; i < 200; i++) assert.equal(gov.frame(250, { count: false }), null);
  assert.equal(gov.rung, 0);
  const fixed = new Governor({ tier: 'medium', auto: true, fixed: true });
  assert.deepEqual(govern(fixed, device({ gpu: 60 }), 60), []);
  assert.equal(fixed.scale, 1);
});

test('the tier steps keep their own record: a tier given up on is not tried, by trial or offer', () => {
  const steps = new TierSteps({ tier: 'medium', auto: true });
  steps.failed.add('high');
  let t = 0;
  for (; t < 200000; t += 500) assert.equal(steps.judge({ t, ms: 16.7, slow: false, rung: 0, gpu: null, target: TARGET.desktop }), null);
});
