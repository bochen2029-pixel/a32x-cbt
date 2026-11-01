// Measure the trainer where a user runs it: the page opened from file:// in headless Chrome.
//
//   cold start      navigation start to the first frame drawn after the trainer's first paint. Each
//                   run is a fresh browser on a fresh profile: nothing cached, nothing compiled.
//   scenario reset  a drill button: the session is thrown away, rebuilt, set up and repainted. The
//                   click handler's own time, and click to the frame that shows the new aircraft.
//   tick rate       simulated steps per wall second over a sustained run, against the 20 Hz grid,
//                   with the main thread's load and the frame gaps that would cost simulated time.
//
// The page is watched, not instrumented: the probes are injected here, so the numbers describe the
// app.js that ships. Rendering is software (--disable-gpu), as on a laptop without a graphics card.
// `npm run measure -- --help` lists the options.

import { writeFileSync } from 'node:fs';
import { arch, cpus, release, totalmem, version as osVersion } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { Browser, sleep } from './chrome.mjs';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The grid the trainer must hold: 50 ms steps. */
export const GRID_HZ = 20;

const TARGET = { coldMs: 1000, resetMs: 20 };

/**
 * Simulated seconds per wall second, from [wallMs, simSeconds] marks taken where the displayed
 * whole second changes. Only changes count: the value showing when watching began is not a mark,
 * because the display rounds half up and that first interval would be half a second short. Each
 * change is seen at most a frame late, so over a minute the error is a few hundredths of a percent.
 */
export function simRate(marks) {
  if (marks.length < 2) throw new Error('fewer than two whole-second marks: the clock did not run');
  const [t0, s0] = marks[0];
  const [t1, s1] = marks.at(-1);
  return (s1 - s0) / ((t1 - t0) / 1000);
}

/** Nearest-rank percentiles: P(p) is the smallest sample with at least p of the samples at or below it. */
export function summary(xs) {
  if (!xs.length) throw new Error('no samples');
  const s = [...xs].sort((a, b) => a - b);
  const at = (p) => s[Math.max(0, Math.ceil(p * s.length) - 1)];
  return { n: s.length, min: s[0], median: at(0.5), p95: at(0.95), p99: at(0.99), max: s.at(-1) };
}

// The trainer's first requestAnimationFrame comes straight after its first paint (src/app/main.ts),
// so the first call marks "painted", and the frame after the next one has drawn it.
const COLD_PROBE = `(() => {
  const raf = window.requestAnimationFrame.bind(window);
  const probe = (window.__cbtCold = {});
  let first = true;
  window.requestAnimationFrame = (cb) => {
    if (first) {
      first = false;
      probe.painted = performance.now();
      raf(() => raf(() => { probe.frame = performance.now(); }));
    }
    return raf(cb);
  };
})();`;

const COLD_RESULT = `window.__cbtCold?.frame !== undefined && ({
  painted: __cbtCold.painted,
  frame: __cbtCold.frame,
  origin: performance.timeOrigin,
  fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
  drills: document.querySelectorAll('#drills button').length,
  status: document.getElementById('status').textContent,
})`;

const RESET = (i) => `(async () => {
  await new Promise((r) => setTimeout(r, 0));
  const button = document.querySelectorAll('#drills button')[${i}];
  const t0 = performance.now();
  button.click();
  const t1 = performance.now();
  const status = document.getElementById('status').textContent;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  return { drill: button.textContent, handler: t1 - t0, frame: performance.now() - t0, status };
})()`;

const TICK_PROBE = `(() => {
  const probe = (window.__cbtTick = { marks: [], frames: [] });
  const status = document.getElementById('status');
  const second = () => / · (\\d+) s · /.exec(status.textContent)?.[1] ?? null;
  let shown = second(); // what shows now is where watching starts, not a change
  new MutationObserver(() => {
    const now = second();
    if (now !== null && now !== shown) {
      shown = now;
      probe.marks.push([performance.now(), Number(now)]);
    }
  }).observe(status, { childList: true, characterData: true, subtree: true });
  let last = null;
  const loop = (t) => {
    if (last !== null) probe.frames.push(t - last);
    last = t;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
})()`;

function healthy(status, drills) {
  if (/failed to load/.test(status)) throw new Error(`the page reports a load failure: ${status}`);
  if (!drills) throw new Error('the page shows no drills: nothing to measure');
}

/** A fresh browser on one page, with uncaught exceptions recorded: a number from a page that threw is no number. */
async function open(url, o) {
  const browser = await Browser.launch({ browser: o.browser, args: ['--disable-gpu'] });
  try {
    const page = await browser.page();
    const thrown = [];
    page.on('Runtime.exceptionThrown', (p) => thrown.push(p.exceptionDetails.exception?.description ?? p.exceptionDetails.text));
    await page.send('Runtime.enable');
    page.clean = () => {
      if (thrown.length) throw new Error(`the page threw while being measured: ${thrown[0]}`);
    };
    if (o.throttle > 1) await page.send('Emulation.setCPUThrottlingRate', { rate: o.throttle });
    return { browser, page };
  } catch (err) {
    await browser.close();
    throw err;
  }
}

async function coldStart(url, o, info) {
  const samples = [];
  for (let i = 0; i < o.runs; i++) {
    const { browser, page } = await open(url, o);
    try {
      info.browser = browser.version.product;
      await page.send('Page.addScriptToEvaluateOnNewDocument', { source: COLD_PROBE });
      await page.goto(url);
      const r = await page.until(COLD_RESULT);
      healthy(r.status, r.drills);
      await sleep(100); // long enough for a frame loop that died on its first frame to have thrown
      page.clean();
      samples.push({ ...r, spawnToFrame: r.origin + r.frame - browser.spawnedAt });
    } finally {
      await browser.close();
    }
  }
  return samples;
}

async function resets(url, o) {
  const { browser, page } = await open(url, o);
  try {
    await page.goto(url);
    await page.until(`document.getElementById('status').textContent.length > 0`);
    const n = await page.evaluate(`document.querySelectorAll('#drills button').length`);
    const samples = [];
    for (let round = 0; round < o.resets; round++) {
      for (let i = 0; i < n; i++) {
        const r = await page.evaluate(RESET(i));
        healthy(r.status, n);
        if (!/ · 0 s · /.test(r.status)) throw new Error(`"${r.drill}" did not restart the clock: ${r.status}`);
        samples.push(r);
      }
    }
    page.clean();
    return samples;
  } finally {
    await browser.close();
  }
}

function metrics(r) {
  return Object.fromEntries(r.metrics.map((m) => [m.name, m.value]));
}

/** Heap and DOM size after a full collection, so nodes waiting for the collector do not read as a leak. */
async function settled(page) {
  await page.send('HeapProfiler.collectGarbage');
  const m = metrics(await page.send('Performance.getMetrics'));
  return { heapMB: m.JSHeapUsedSize / 2 ** 20, nodes: m.Nodes };
}

async function sustained(url, o) {
  const { browser, page } = await open(url, o);
  try {
    await page.goto(url);
    await page.until(`document.getElementById('status').textContent.length > 0`);
    const drill = await page.evaluate(`(() => {
      const b = [...document.querySelectorAll('#drills button')].find((x) => x.textContent === ${JSON.stringify(o.drill)});
      if (!b) return null;
      b.click();
      return b.textContent;
    })()`);
    if (!drill) throw new Error(`no drill called "${o.drill}"`);
    const visibility = await page.evaluate('document.visibilityState');
    if (visibility !== 'visible') throw new Error(`the page is ${visibility}: its frames would be throttled`);

    await page.evaluate(TICK_PROBE);
    await page.send('Performance.enable');
    await sleep(2_000); // the drill's setup and the first frames settle before the window opens

    const before = await settled(page); // collected outside the window, so it costs the window nothing
    const m0 = metrics(await page.send('Performance.getMetrics'));
    const w0 = await page.evaluate('({ marks: __cbtTick.marks.length, frames: __cbtTick.frames.length })');
    await sleep(o.seconds * 1000);
    const m1 = metrics(await page.send('Performance.getMetrics'));
    const w1 = await page.evaluate(`({
      marks: __cbtTick.marks.slice(${w0.marks}),
      frames: __cbtTick.frames.slice(${w0.frames}),
      status: document.getElementById('status').textContent,
    })`);
    const after = await settled(page);
    healthy(w1.status, 1);
    page.clean();

    const wall = m1.Timestamp - m0.Timestamp;
    const share = (name) => (m1[name] - m0[name]) / wall;
    const rate = simRate(w1.marks);
    return {
      drill,
      windowSec: wall,
      simRate: rate,
      stepsPerSec: rate * GRID_HZ,
      marks: w1.marks.length,
      frames: summary(w1.frames),
      gapsOver50: w1.frames.filter((f) => f > 50).length,
      gapsOver250: w1.frames.filter((f) => f > 250).length,
      busy: share('TaskDuration'),
      script: share('ScriptDuration'),
      style: share('RecalcStyleDuration'),
      layout: share('LayoutDuration'),
      msPerStep: ((m1.TaskDuration - m0.TaskDuration) * 1000) / (rate * GRID_HZ * wall),
      heapMB: [before.heapMB, after.heapMB],
      nodes: [before.nodes, after.nodes],
    };
  } finally {
    await browser.close();
  }
}

const ms = (x) => `${x.toFixed(1)} ms`;
const pass = (ok) => (ok ? 'within' : 'OVER');

function report(r) {
  const out = [];
  const p = (s = '') => out.push(s);
  p(`A32X CBT measured ${r.at}`);
  p(`machine  ${r.machine.cpu} · ${r.machine.threads} logical CPUs · ${r.machine.memGB} GB · ${r.machine.os}`);
  p(`browser  ${r.browser}, headless, software rendering, CPU throttle ${r.options.throttle}x`);
  p(`page     ${r.url}`);
  p();
  const c = r.cold;
  p(`cold start, ${c.frame.n} fresh browsers           median     max`);
  p(`  navigation -> first frame            ${ms(c.frame.median).padStart(10)} ${ms(c.frame.max).padStart(10)}   ${pass(c.frame.max < TARGET.coldMs)} ${TARGET.coldMs} ms`);
  p(`  navigation -> trainer painted        ${ms(c.painted.median).padStart(10)} ${ms(c.painted.max).padStart(10)}`);
  p(`  browser spawn -> first frame         ${ms(c.spawn.median).padStart(10)} ${ms(c.spawn.max).padStart(10)}   Chrome's own start, new profile`);
  p();
  p(`scenario reset, ${r.options.resets} per drill               median     max   click->frame`);
  for (const [drill, s] of Object.entries(r.reset)) {
    p(`  ${drill.padEnd(34)} ${ms(s.handler.median).padStart(10)} ${ms(s.handler.max).padStart(10)} ${ms(s.frame.median).padStart(10)}   ${pass(s.handler.max < TARGET.resetMs)} ${TARGET.resetMs} ms`);
  }
  p();
  const t = r.tick;
  p(`tick rate, ${t.windowSec.toFixed(1)} s on "${t.drill}"`);
  p(`  steps per wall second                ${t.stepsPerSec.toFixed(3)}   against ${GRID_HZ} (${t.marks} whole-second marks)`);
  p(`  frame interval                       median ${ms(t.frames.median)}, p99 ${ms(t.frames.p99)}, max ${ms(t.frames.max)}, n ${t.frames.n}`);
  p(`  gaps > 50 ms (a step late)           ${t.gapsOver50}`);
  p(`  gaps > 250 ms (simulated time lost)  ${t.gapsOver250}`);
  const pc = (x) => `${(x * 100).toFixed(2)} %`;
  p(`  main thread busy                     ${pc(t.busy)}: script ${pc(t.script)}, style ${pc(t.style)}, layout ${pc(t.layout)}, other ${pc(t.busy - t.script - t.style - t.layout)}`);
  p(`  main-thread time per step            ${t.msPerStep.toFixed(3)} ms of the 50 ms step`);
  p(`  JS heap; DOM nodes, after a GC       ${t.heapMB[0].toFixed(2)} -> ${t.heapMB[1].toFixed(2)} MB; ${t.nodes[0]} -> ${t.nodes[1]}`);
  return out.join('\n');
}

const HELP = `npm run measure -- [options]

  --page <file>       page to open from file://        (default web/index.html)
  --runs <n>          cold starts, one fresh browser each  (default 10)
  --resets <n>        resets of every drill                (default 20)
  --seconds <n>       sustained tick-rate window           (default 60)
  --drill <label>     drill for the tick-rate window       (default "Packs fail in cruise")
  --throttle <n>      CPU slowdown via DevTools emulation  (default 1: none)
  --browser <b>       chrome, edge, or a path              (default: $CHROME, else Chrome)
  --json <file>       also write every sample as JSON`;

async function main() {
  const { values: v } = parseArgs({
    options: {
      page: { type: 'string', default: join(APP, 'web', 'index.html') },
      runs: { type: 'string', default: '10' },
      resets: { type: 'string', default: '20' },
      seconds: { type: 'string', default: '60' },
      drill: { type: 'string', default: 'Packs fail in cruise' },
      throttle: { type: 'string', default: '1' },
      browser: { type: 'string' },
      json: { type: 'string' },
      help: { type: 'boolean', default: false },
    },
  });
  if (v.help) return console.log(HELP);

  const o = {
    runs: Number(v.runs),
    resets: Number(v.resets),
    seconds: Number(v.seconds),
    throttle: Number(v.throttle),
    drill: v.drill,
    browser: v.browser,
  };
  for (const k of ['runs', 'resets', 'seconds', 'throttle']) {
    if (!Number.isFinite(o[k]) || o[k] < 1) throw new Error(`--${k} must be a number of at least 1`);
  }
  const url = pathToFileURL(resolve(v.page)).href;
  const info = {};

  const cold = await coldStart(url, o, info);
  const reset = await resets(url, o);
  const tick = await sustained(url, o);

  const byDrill = {};
  for (const s of reset) (byDrill[s.drill] ??= []).push(s);
  const r = {
    at: new Date().toISOString(),
    machine: {
      cpu: cpus()[0]?.model.trim() ?? 'unknown',
      threads: cpus().length,
      memGB: Math.round(totalmem() / 2 ** 30),
      os: `${osVersion()} ${release()} (${arch()})`,
      node: process.version,
    },
    browser: info.browser,
    url,
    options: o,
    cold: {
      frame: summary(cold.map((s) => s.frame)),
      painted: summary(cold.map((s) => s.painted)),
      spawn: summary(cold.map((s) => s.spawnToFrame)),
    },
    reset: Object.fromEntries(
      Object.entries(byDrill).map(([d, ss]) => [d, { handler: summary(ss.map((s) => s.handler)), frame: summary(ss.map((s) => s.frame)) }]),
    ),
    tick,
  };

  console.log(report(r));
  if (v.json) writeFileSync(v.json, JSON.stringify({ ...r, samples: { cold, reset } }, null, 2));
}

const invoked = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href.toLowerCase();
if (invoked === import.meta.url.toLowerCase()) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  });
}
