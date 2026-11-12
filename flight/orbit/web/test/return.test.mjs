// The flight home on the page (return-view.js): its readouts are the header's, its lines say what the
// crew is doing, and the core's block reads through the page's Core. return-view.js draws with three.js,
// which this test takes from flight/web's packages (npm ci there first). GPLv3.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire, register } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { AUTO, Core, PH } from '../src/core.js';

const here = dirname(fileURLToPath(import.meta.url));
const header = readFileSync(join(here, '..', '..', 'core', 'orbit_return.h'), 'utf8');
const threePath = join(here, '..', '..', '..', 'web', 'node_modules', 'three', 'build', 'three.module.js');
const built = resolve(process.env.ORBIT_CORE || join(here, '..', '..', 'build-wasm', 'orbit_core.js'));
const noThree = !existsSync(threePath) && `three.js is not at ${threePath}: npm ci in flight/web`;

// 'three', as the page's build resolves it
let view = {};
if (!noThree) {
  const url = pathToFileURL(threePath).href;
  register(`data:text/javascript,export async function resolve(s, c, next) { return s === 'three' ? { url: ${JSON.stringify(url)}, shortCircuit: true } : next(s, c); }`);
  view = await import('../src/return-view.js');
}

// orbit_return.h's names, in its order, the way core.test.mjs reads orbit_core.h's
function enumNames(first, last, prefix) {
  const body = header.slice(header.indexOf(first), header.indexOf(last)).replace(/\/\*[\s\S]*?\*\//g, '');
  return [...body.matchAll(/\b(OC_[A-Z_]+)\b/g)].map((m) => m[1]).filter((n, i, a) => a.indexOf(n) === i && n.startsWith(prefix));
}
const camel = (n, prefix) => n.slice(prefix.length).replace(/_DEG$/, '').toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase());
const define = (name) => Number(header.match(new RegExp(`#define ${name}\\s+([0-9.]+)`))[1]);

test('the readouts are the header\'s, in its order', { skip: noThree }, () => {
  const names = enumNames('OC_RET_PHASE = 0', 'OC_RET_COUNT', 'OC_RET_');
  assert.deepEqual(names.map((n) => camel(n, 'OC_RET_')), view.RET_OUT);
});

test('the phases, the events and the limits are the header\'s', { skip: noThree }, () => {
  const phases = enumNames('OC_RET_PH_NONE = 0', 'OC_RET_PH_STOPPED = 10', 'OC_RET_PH_').concat('OC_RET_PH_STOPPED');
  assert.deepEqual(phases.map((n) => camel(n, 'OC_RET_PH_')), Object.keys(view.RET_PH));
  assert.deepEqual(Object.values(view.RET_PH), phases.map((_, i) => i));
  const events = enumNames('OC_RET_EV_NONE = 0', 'OC_RET_EV_TOUCHDOWN = 6', 'OC_RET_EV_').concat('OC_RET_EV_TOUCHDOWN');
  assert.deepEqual(events.map((n) => camel(n, 'OC_RET_EV_')), Object.keys(view.RET_EV));
  assert.deepEqual(view.LIMITS, { heat: define('OC_RET_HEAT_LIMIT'), load: define('OC_RET_LOAD_LIMIT'), qbar: define('OC_RET_QBAR_LIMIT') });
});

test('waits read as a clock does, and the runway lies left or right', { skip: noThree }, () => {
  assert.equal(view.fmtWait(42.4), '42 s');
  assert.equal(view.fmtWait(754), '12:34');
  assert.equal(view.fmtWait(66200), '18 h 23 min');
  assert.equal(view.fmtWait(-1), '—');
  assert.equal(view.fmtSide(412000), '412.0 km left');
  assert.equal(view.fmtSide(-1500), '1.50 km right');
  assert.equal(view.fmtSide(10), 'dead ahead');
});

test('the flight home starts in orbit or on the way down, not on the runway or the climb', { skip: noThree }, () => {
  const s = { crashed: 0, peri: 500000, onGround: 0, vs: 0, alt: 500000 };
  const none = { phase: 0, stopped: 0 };
  assert.equal(view.canReturn(s, none).ok, true);
  assert.equal(view.canReturn({ ...s, peri: -6e6, onGround: 1, alt: 0 }, none).ok, false);
  assert.equal(view.canReturn({ ...s, peri: -3e6, vs: 900, alt: 40000 }, none).ok, false);
  assert.equal(view.canReturn({ ...s, peri: 60000, vs: -150, alt: 110000 }, none).ok, true);
  assert.equal(view.canReturn({ ...s, peri: -6e6, vs: -20, alt: 5000 }, { phase: view.RET_PH.terminal, stopped: 0 }).ok, true);
  assert.equal(view.canReturn({ ...s, crashed: 1 }, none).ok, false);
});

test('skipping ahead stops before the burn, or when there is nothing to wait for', { skip: noThree }, () => {
  const { RET_PH: P, RET_EV: E } = view;
  assert.equal(view.skipDone({ phase: P.wait, event: E.burn, tEvent: 5000 }, AUTO.return, AUTO), null);
  assert.equal(view.skipDone({ phase: P.depart, event: E.clear, tEvent: 300 }, AUTO.return, AUTO), null);
  assert.equal(view.skipDone({ phase: P.wait, event: E.burn, tEvent: 30 }, AUTO.return, AUTO), 'the burn is near');
  assert.equal(view.skipDone({ phase: P.wait, event: E.none, tEvent: -1 }, AUTO.return, AUTO), 'no pass in reach');
  assert.equal(view.skipDone({ phase: P.burn, event: E.burnEnd, tEvent: 10 }, AUTO.return, AUTO), 'past the wait');
  assert.equal(view.skipDone({ phase: P.wait, event: E.burn, tEvent: 5000 }, AUTO.off, AUTO), 'handed back');
});

const flight = (phase, more = {}) => ({
  phase, event: 0, tEvent: -1, range: 1234000, cross: 412000, togo: 1240000, bankCmd: -55, alphaCmd: 40, miss: 1200, reversals: 3, dv: 127.1,
  passes: 0, heat: 387000, heatPeak: 387000, heatLoad: 4.44e8, temp: 1683, glow: 0.9, load: 1.63, loadPeak: 1.68, qbarPeak: 9000, over: 0,
  glideDev: 12, touched: 0, tdSink: 0, tdAlong: 0, tdOff: 0, tdSpeed: 0, tdPitch: 0, tdT: 0, stopped: 0, stopAlong: 0, stopOff: 0, propUsed: 1120, ...more,
});
const air = { mach: 24.4, alt: 70000, tas: 7000 };

test('the status line says what the crew is doing, phase by phase', { skip: noThree }, () => {
  const { RET_PH: P, RET_EV: E } = view;
  assert.equal(view.returnStatus(flight(P.wait, { event: E.burn, tEvent: 3725 }), air).line, 'HOME · WAITING FOR THE PASS · the burn in 1 h 02 min');
  assert.match(view.returnStatus(flight(P.wait, { event: E.burn, tEvent: 3725 }), air).hint, /^R again: skip ahead/);
  assert.match(view.returnStatus(flight(P.wait, { event: E.burn, tEvent: 3725 }), air, { touch: true }).hint, /^RETURN again/);
  assert.equal(view.returnStatus(flight(P.wait, { event: E.burn, tEvent: 3725 }), air, { skipping: true }).line, 'HOME · SKIPPING AHEAD · the burn in 1 h 02 min');
  assert.match(view.returnStatus(flight(P.wait), air).line, /NO PASS WITHIN REACH/);
  assert.equal(view.returnStatus(flight(P.burn), air).line, 'HOME · DE-ORBIT BURN · 127 m/s, tail first');
  assert.equal(view.returnStatus(flight(P.coast, { tEvent: 1980 }), air).line, 'HOME · FALLING TO THE AIR · entry in 33:00');
  assert.equal(view.returnStatus(flight(P.entry), air).line, 'HOME · ENTRY · Mach 24 · 1240 km to go');
  assert.equal(view.returnStatus(flight(P.approach, { togo: 9500 }), air).line, 'HOME · APPROACH · 17C in 9.50 km');
  assert.equal(view.returnStatus(flight(P.stopped, { stopAlong: 2121 }), air).line, 'HOME · STOPPED ON 17C · 2.12 km past the threshold');
  assert.equal(view.returnStatus(flight(P.none), air), null);
});

test('the readouts: where the runway is, the heat and the load, the guidance, the landing', { skip: noThree }, () => {
  const { RET_PH: P } = view;
  const entry = view.returnHud(flight(P.entry), air);
  assert.match(entry[0], /^HOME .*1234 km to KDFW 17C .*runway 412.0 km left/);
  assert.match(entry[1], /^HEAT 387 kW\/m² \(peak 387 kW\/m²\) .*444 MJ\/m² .*skin 1683 K .*LOAD 1\.63 g \(peak 1\.68\)/);
  assert.match(entry[2], /^GUIDE bank L 55° .*α 40° .*3 reversals .*gate \+1\.20 km/);
  const landed = view.returnHud(flight(P.stopped, { touched: 1, tdAlong: 432, tdOff: -0.07, tdSink: 0.74, stopped: 1, stopAlong: 2121 }), air);
  assert.match(landed.at(-1), /^DOWN 432 m past the threshold, 0\.1 m left of the line, sinking 0\.74 m\/s\s+stopped at 2\.12 km/);
  assert.deepEqual(view.returnHud(flight(P.none, { heatPeak: 0, loadPeak: 0 }), air), []);
  const phone = [flight(P.entry), flight(P.approach), flight(P.stopped, { touched: 1, tdAlong: 432, tdOff: -0.07, tdSink: 0.74, stopped: 1, stopAlong: 2121 })];
  for (const r of phone) for (const line of view.returnHud(r, air, true)) assert.ok(line.length <= 30, `a phone's line: ${line}`);
});

test('the air glows brighter and whiter with the heat', { skip: noThree }, () => {
  let last = view.plasma(0);
  assert.equal(last.strength, 0);
  for (let g = 0.1; g <= 1.0001; g += 0.1) {
    const c = view.plasma(g);
    assert.ok(c.strength > last.strength && c.g > last.g && c.b >= last.b, `at ${g}`);
    last = c;
  }
  assert.deepEqual(view.plasma(7), view.plasma(1));
});

test('the trail keeps where the craft glowed, fading, and forgets a restart', { skip: noThree }, () => {
  const log = new view.TrailLog({ max: 10, every: 0.5, life: 20 });
  log.add(0, [0, 0, 0], 0);                         // not glowing: nothing
  assert.equal(log.points.length, 0);
  for (let t = 0; t <= 10; t += 0.1) log.add(t, [t * 7000, 0, 70000], 0.8);
  assert.equal(log.points.length, 10, 'at most max, one each half second');
  const live = log.live(10);
  assert.ok(live[0].age < live.at(-1).age && live[0].light > live.at(-1).light, 'newest first, brightest');
  assert.equal(log.live(40).length, 0, 'all faded');
  log.add(5, [0, 0, 0], 0.8);                       // time went back: a new flight
  assert.equal(log.points.length, 1);
});

test('the core\'s block reads through the page, and RETURN\'s plan shows in it', { skip: noThree || (!existsSync(built) && `no module at ${built}: build it first`) }, async () => {
  const core = new Core(await createRequire(import.meta.url)(built)());
  const r = core.addBlock('ret', '_oc_return_out', '_oc_return_out_len', view.RET_OUT);
  let s = core.reset();
  assert.equal(r.phase, view.RET_PH.none);
  while (s.phase !== PH.orbit && s.t < 1500) s = core.step(250);
  core.auto(AUTO.return);
  s = core.step(1);
  assert.equal(r.phase, view.RET_PH.wait);
  assert.equal(r.event, view.RET_EV.burn);
  assert.ok(r.tEvent > 0 && r.dv > 80 && r.dv < 200, `the burn in ${r.tEvent} s, ${r.dv} m/s`);
  assert.match(view.returnStatus(r, s).line, /^HOME · WAITING FOR THE PASS · the burn in/);
});
