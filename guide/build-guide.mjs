#!/usr/bin/env node
// build-guide.mjs: the orbit sketch's guide as a PDF. It opens the built page in headless Chrome, flies it
// to each place the guide shows and takes a screenshot there, then prints guide.html, with those
// screenshots in it, to a PDF of Letter pages. Node built-ins and a Chromium-family browser, driven over
// the DevTools protocol by this repository's own driver (app/tools/chrome.mjs): no package to install.
// Nothing it writes is committed: the screenshots and the PDF go to out/, which git ignores. MIT.
//
//   node flight/orbit/guide/build-guide.mjs [--page flight/orbit/build-web/index.html] [--out flight/orbit/guide/out]
//        [--only name,name] [--skip-shots] [--skip-pdf] [--gpu] [--browser <path>] [--list]
//
// Build the page first (flight/orbit/README.md, "Build and test"). The page is drawn in software
// (SwiftShader) unless --gpu: slow, half a minute to a minute a screenshot and a quarter to half an hour
// for them all, by how busy the machine is, but the same picture on any machine. Each screenshot below is the page's own address and a few
// lines run in the page through window.orbitSketch, the handle it keeps for its tests: the flight stands
// still while the lines step the core to the place wanted, so a shot is the same each time it is taken,
// but for what the page's own clock moves (blinking lights, the time of the first frames). Every address
// carries res=fixed: the page otherwise draws fewer pixels while its frames come slowly, as they do in
// software, and the picture would be as big as the machine was fast. A shot of the tour waits for the
// tour's own clock, the page drawn small meanwhile so that frames come quickly.
// Exit 0 when made, 1 when something failed, 2 for a usage error.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { Browser } from '../tools/chrome.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..', '..');
export const PDF_NAME = 'Runway-to-Ring-guide.pdf';

// Software GL: SwiftShader through ANGLE, which every Chromium carries.
const SOFTWARE_GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
// A desktop window, drawn at twice its CSS pixels; and an iPhone 13's page, portrait, with touch.
const DESK = { width: 1280, height: 720, deviceScaleFactor: 2, mobile: false };
const PHONE = { width: 390, height: 664, deviceScaleFactor: 3, mobile: true, screenWidth: 390, screenHeight: 844 };
const SHOT_MS = 300_000;   // a screenshot in software GL takes 20 to 40 s; a deadline far past that
const LOAD_MS = 180_000;
const WAIT_MS = 900_000;   // the tour's stages wait on its own clock: a minute or two, drawn small
// What the page is drawn at while a shot waits for the page's own clock.
const SMALL = { width: 320, height: 180, deviceScaleFactor: 1, mobile: false };

// What the shots' lines may call, put into each page once it has loaded. freeze() stops the page's frames
// stepping the flight, or the walk, by holding their debt of time at nought: time stands still while the
// readouts and the status line read as they do at the warp shown. until() steps the core until a test of the
// readouts holds: s the flight's (core.s), d docking's, r the flight home's, k the deck's. look() sets the
// view and the chase camera's place; deckEye() places the chase camera by the deck's own axes (spinward,
// along the Ring's axis, toward it), since its up is the Earth's while the deck crew takes off. deckFacing()
// says how square the deck's up is to the Sun or to the Earth's up. caption() is the tour's caption's title.
const HELPER = `window.guide = {
  freeze() {
    const o = window.orbitSketch;
    const pin = (obj) => {
      if (!obj || obj.guidePinned) return;
      Object.defineProperty(obj, 'debt', { get: () => 0, set: () => {}, configurable: true });
      Object.defineProperty(obj, 'guidePinned', { value: true });
    };
    pin(o.state);
    if (o.ctx.walk) pin(o.ctx.walk.v);
  },
  until(test, chunk = 50, limit = 4e6) {
    const o = window.orbitSketch, c = o.core, f = new Function('s', 'd', 'r', 'k', 'return (' + test + ');');
    this.freeze();
    let n = 0;
    while (!f(c.s, c.dock || {}, c.ret || {}, c.deck || {})) {
      if (c.s.crashed > 0) throw new Error('the craft crashed waiting for ' + test);
      if (n >= limit) throw new Error('not reached in ' + limit + ' steps: ' + test);
      c.step(chunk);
      n += chunk;
    }
    return n;
  },
  look(view, az = 0, el = 0.2, dist = 70) {
    const o = window.orbitSketch;
    o.state.view = o.ctx.VIEWS.indexOf(view);
    Object.assign(o.ctx.input.look, { az, el, dist });
  },
  deckUp() {
    const s = window.orbitSketch.core.s;
    const P = [s.siteE, s.siteN, s.siteU], R = [s.ringE, s.ringN, s.ringU], ax = [s.ringAxE, s.ringAxN, s.ringAxU];
    const rel = P.map((x, i) => x - R[i]), along = rel[0] * ax[0] + rel[1] * ax[1] + rel[2] * ax[2];
    const out = rel.map((x, i) => x - along * ax[i]), n = Math.hypot(...out);
    return out.map((x) => -x / n);
  },
  deckFacing(what) {
    const s = window.orbitSketch.core.s, u = this.deckUp();
    const v = what === 'sun' ? [s.sunE, s.sunN, s.sunU] : [s.siteE, s.siteN, s.siteU + 6371000];
    return (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / Math.hypot(...v);
  },
  deckEye(spinward, axis, up, dist) {
    const o = window.orbitSketch;
    return new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => {
      const s = o.core.s, c = o.ctx;
      const sub = (a, b) => a.map((x, i) => x - b[i]), dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
      const scale = (a, k) => a.map((x) => x * k), add = (a, b) => a.map((x, i) => x + b[i]);
      const unit = (a) => scale(a, 1 / Math.hypot(...a));
      const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
      const ax = [s.ringAxE, s.ringAxN, s.ringAxU], upDeck = this.deckUp(), spin = unit(cross(ax, scale(upDeck, -1)));
      const b = unit(add(add(scale(spin, spinward), scale(ax, axis)), scale(upDeck, up)));
      let h = sub(c.axes.fwd, scale(c.up, dot(c.axes.fwd, c.up)));   // the chase camera's own heading (main.js)
      if (Math.hypot(...h) < 0.2 && o.state.heading) h = o.state.heading;
      h = unit(h);
      const dir = scale(unit(sub(b, scale(c.up, dot(b, c.up)))), -1);
      o.state.view = c.VIEWS.indexOf('chase');
      Object.assign(c.input.look, { az: Math.atan2(dot(dir, cross(h, c.up)), dot(dir, h)), el: Math.asin(dot(b, c.up)), dist });
      done(true);
    })));
  },
  step(n) { this.freeze(); window.orbitSketch.core.step(n); },
  quiet() { const e = document.getElementById('say'); if (e) e.textContent = ''; },
  help(shown) { const e = document.getElementById('help'); if (e) e.classList.toggle('shown', shown); },
  hud(shown) { for (const id of ['hud', 'status', 'tour-caption']) { const e = document.getElementById(id); if (e) e.style.visibility = shown ? '' : 'hidden'; } },
  readouts(shown) { const e = document.getElementById('readouts'); if (e) e.style.visibility = shown ? '' : 'hidden'; },
  caption() { const e = document.getElementById('tour-caption'); return (e && e.dataset.title) || ''; },
};`;

// The flight stands still from the start: what each session does first.
const FREEZE = 'guide.freeze(); guide.help(false);';
// At the hold point, 300 m off the hub's port, at one time for every tier, so the three are alike.
const AT_HOLD = "window.orbitSketch.command('approach'); guide.until('s.portRange < 5'); guide.until('s.t >= 1600');";

// The shots, in sessions: one page load each, its shots taken in order. A shot's `run` is page-side
// JavaScript, or a list of it with { wait: <a page-side test> } between, waited for with the page drawn
// small; `frames` is how many of the page's frames to let pass before the picture.
export const SESSIONS = [
  {
    query: 'q=medium&res=fixed', shots: [
      { name: 'ui', about: 'the page as it opens: on 17C, the help shown', run: "guide.freeze(); guide.help(true); guide.look('chase', 0, 0.2, 70);" },
    ],
  },
  {
    query: 'q=medium&res=fixed&at=38', shots: [
      { name: 'takeoff', about: 'rotation on 17C at 38 s', run: `${FREEZE} guide.look('chase', 0.55, 0.12, 62);` },
    ],
  },
  {
    query: 'q=medium&res=fixed&at=110', shots: [
      { name: 'climb', about: 'through Mach 1 at 10 km, 110 s', run: `${FREEZE} guide.look('chase', 0.35, 0.18, 70);` },
    ],
  },
  {
    query: 'q=medium&res=fixed&at=330', shots: [
      { name: 'ascent', about: 'above the air, 124 km, 330 s', run: `${FREEZE} guide.look('chase', 0.25, 0.22, 75);` },
    ],
  },
  {
    query: 'q=medium&res=fixed&at=775', shots: [
      { name: 'orbit', about: 'in orbit, the Ring 25 km ahead', run: `${FREEZE} guide.look('chase', 0, 0.2, 70);` },
      { name: 'cover', about: 'the same, the readouts hidden', run: "guide.hud(false); guide.look('chase', 0.12, 0.14, 56);" },
      { name: 'moon', about: 'the Moon through the telescope (F), the readouts hidden', run: "guide.look('chase', 0, 0.2, 70); window.orbitSketch.command('moon'); guide.quiet();" },
      { name: 'map-ring', about: 'the map (N)', run: "guide.hud(true); window.orbitSketch.command('moon'); window.orbitSketch.command('map'); guide.quiet();", frames: 4 },
      { name: 'map-ground', about: 'the map, the next view: the ground track (shift-N)', keys: ['N'], frames: 4 },
      { name: 'hub', about: 'at the hold point, 300 m off the hub\'s port', run: `window.orbitSketch.command('map'); ${AT_HOLD} guide.look('chase', 0, 0.2, 70); guide.quiet();` },
      { name: 'reticle', about: 'the cockpit view closing on the port, the docking reticle', run: "window.orbitSketch.command('dock'); guide.until('d.phase >= 3 && d.range < 25', 5); guide.look('cockpit'); guide.quiet();" },
      { name: 'docked', about: 'docked at the hub, turning with the Ring', run: "guide.until('d.phase === 5', 25); guide.step(500); guide.look('chase', 0, -0.4, 160); guide.quiet();" },
    ],
  },
  {
    query: 'q=low&res=fixed&at=775', shots: [
      { name: 'tier-low', about: 'the hold point at low', run: `${FREEZE} ${AT_HOLD} guide.look('chase', 0, 0.2, 70); guide.quiet();` },
    ],
  },
  {
    query: 'q=high&res=fixed&at=775', shots: [
      { name: 'tier-high', about: 'the hold point at high', run: `${FREEZE} ${AT_HOLD} guide.look('chase', 0, 0.2, 70); guide.quiet();` },
    ],
  },
  {
    // the crew's landing from orbit by way of the hold point, on pad 1; at rest there when the Sun is on the
    // deck; the take-off when the deck's up is near the Earth's, the chase camera's up while the crew takes off
    query: 'q=medium&res=fixed&at=775', shots: [
      { name: 'deck-final', about: 'the deck landing\'s final burn, down through the roof\'s gap', run: `${FREEZE} window.orbitSketch.command('deck'); guide.until('k.phase >= 4', 250); guide.until('k.height < 260', 10); guide.look('chase', 0, 0.32, 90); guide.quiet();` },
      { name: 'deck-pad', about: 'at rest on the pad, the Sun on the deck', run: `guide.until('k.phase === 7 && s.auto === 0', 10); guide.until("guide.deckFacing('sun') > 0.5", 25); guide.look('chase', 0.1, 0.22, 150); guide.quiet();` },
      { name: 'deck-takeoff', about: 'the take-off, climbing out from the pad, the readouts hidden', run: `guide.until("guide.deckFacing('earth') < 0", 25); guide.until("guide.deckFacing('earth') > 0.79", 25);
        window.orbitSketch.command('takeoff'); guide.until('k.phase === 9 && k.height > 130', 10); guide.readouts(false); guide.quiet();
        return guide.deckEye(0.5, 0.5, 0.6, 140);` },
    ],
  },
  {
    query: 'q=medium&res=fixed&at=775', shots: [
      { name: 'entry', about: 'entry, the heat near its peak', run: `${FREEZE} window.orbitSketch.command('return'); guide.until('r.phase >= 5 && r.heat > 330000', 50); guide.look('chase', 0, 0.2, 70); guide.quiet();` },
      { name: 'final', about: 'on final for 17C', run: "guide.until('r.phase >= 7 && s.alt < 450', 10); guide.look('chase', 0, 0.12, 70); guide.quiet();" },
      { name: 'stopped', about: 'stopped on 17C', run: "guide.until('r.phase === 10', 50); guide.step(100); guide.look('chase', 2.4, 0.25, 80); guide.quiet();" },
    ],
  },
  {
    // the crew's flight home taken over on final, 8.6 km out on the glide slope, the hands as main.js hands them over
    query: 'q=medium&res=fixed&at=775', shots: [
      { name: 'fd', about: 'the flight director on final, the pilot flying, from the cockpit', run: `${FREEZE} window.orbitSketch.command('return'); guide.until('r.phase >= 7 && s.alt < 470', 10);
        o.command('crew'); o.core.controls(o.ctx.input.hands); guide.step(5); guide.look('cockpit'); guide.quiet();` },
    ],
  },
  {
    // on the canal's promenade, 400 m spinward along the floor and 33 m off the Ring's plane, 72 s on
    query: 'q=medium&res=fixed&walk=floor', shots: [
      { name: 'walk-floor', about: 'on the floor, 5 km from the axis, looking spinward', run: `${FREEZE} const w = o.ctx.walk.v;
        w.core.put(400, -33); o.core.step(3600); w.core.step(3600);
        w.prev = { ...w.core.o }; w.cur = { ...w.core.o }; w.look = { heading: 0.12, pitch: 0.14 }; guide.quiet();` },
    ],
  },
  {
    // in lift 1's car, ridden down to 120 m over the floor
    query: 'q=medium&res=fixed&walk=lift', shots: [
      { name: 'walk-lift', about: 'in a lift near the floor', run: `${FREEZE} const w = o.ctx.walk.v;
        const at = (use) => w.core.controls({ fwd: 0, right: 0, heading: w.core.o.heading, pitch: 0, run: 0, jump: 0, use });
        at(1); w.core.step(1); o.core.step(1); at(0);
        for (let i = 0; i < 400 && w.core.o.liftR < 4880; i++) { w.core.step(100); o.core.step(100); }
        w.prev = { ...w.core.o }; w.cur = { ...w.core.o }; w.look = { heading: 0.35, pitch: -0.3 }; guide.quiet();` },
    ],
  },
  {
    query: 'q=medium&res=fixed', shots: [
      { name: 'tour', about: 'the tour\'s first caption', run: `${FREEZE} window.orbitSketch.command('tour'); guide.quiet();`, frames: 4 },
    ],
  },
  {
    // The tour from its start, the flight stepped through what it waits for (orbit, docked), its own clock run
    // through the rest (8 s in orbit, 4 docked, 9 in the lobby, 15 on the floor), to its deck stage: let go of
    // the port, the crew lands. The picture is of the coast, 30 s in, weightless while the pad comes round.
    query: 'q=medium&res=fixed&at=775', shots: [
      {
        name: 'tour-deck', about: 'the tour\'s deck stage: the coast before the final burn, with its caption', frames: 4, run: [
          `${FREEZE} window.orbitSketch.command('tour');`,
          { wait: "guide.caption() === 'KDFW, runway 17C'" },
          "guide.until('s.phase >= 6', 250);",
          { wait: "guide.caption() === 'To the Ring'" },
          "guide.until('d.phase === 5', 25);",
          { wait: "guide.caption() === 'The flight deck'" },
          "guide.until('k.phase === 3', 10); guide.step(1500); guide.quiet();",
        ],
      },
    ],
  },
  {
    query: 'q=low&res=fixed&at=775', device: PHONE, shots: [
      { name: 'phone', about: 'a phone, portrait: the stick, the throttle, the buttons used most', run: `${FREEZE} guide.quiet();` },
    ],
  },
];

export const SHOT_NAMES = SESSIONS.flatMap((s) => s.shots.map((x) => x.name));

// Let the page draw `n` frames and the GPU finish them, so the next picture is of the scene as it now stands.
const settle = (n) => `new Promise((done) => {
  let left = ${n};
  const tick = () => {
    if (--left > 0) { requestAnimationFrame(tick); return; }
    try { window.orbitSketch.renderer.getContext().finish(); } catch (e) { /* no context to wait on */ }
    done(true);
  };
  requestAnimationFrame(tick);
})`;

// Poll an expression until it is truthy. Each call may wait long: in software GL a frame's shaders can
// hold the page's thread for tens of seconds while they compile.
async function waitFor(page, expression, deadlineMs) {
  const end = Date.now() + deadlineMs;
  for (;;) {
    const v = await page.evaluate(expression, deadlineMs);
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out after ${deadlineMs} ms waiting for: ${expression}`);
    await new Promise((done) => setTimeout(done, 250));
  }
}

async function open(page, url, device) {
  await page.send('Emulation.setDeviceMetricsOverride', device, LOAD_MS);
  await page.send('Emulation.setTouchEmulationEnabled', { enabled: Boolean(device.mobile), maxTouchPoints: device.mobile ? 5 : 1 }, LOAD_MS);
  await page.goto(url, LOAD_MS);
  await waitFor(page, "Boolean(window.orbitSketch) || document.getElementById('status')?.className === 'failed'", LOAD_MS);
  const failed = await page.evaluate("document.getElementById('status')?.className === 'failed' ? document.getElementById('status').textContent : ''", LOAD_MS);
  if (failed) throw new Error(`the page failed to start: ${failed}`);
  await page.evaluate(HELPER, LOAD_MS);
}

// Wait for a test in the page that only the page's own clock can bring about (the tour's stages wait on it),
// the page drawn small meanwhile: in software GL a full-size frame takes seconds, and the tour's clock moves
// at most a quarter of a second a frame. Then the page is drawn at its size again.
async function waitSmall(page, expression, device) {
  await page.send('Emulation.setDeviceMetricsOverride', SMALL, LOAD_MS);
  try {
    await waitFor(page, expression, WAIT_MS);
  } finally {
    await page.send('Emulation.setDeviceMetricsOverride', device, LOAD_MS);
  }
}

async function key(page, k) {
  // a key as the page's own listeners see it: shift-N is the map's next view
  const shift = k.length === 1 && k !== k.toLowerCase();
  const base = { key: k, code: `Key${k.toUpperCase()}`, modifiers: shift ? 8 : 0, text: k, windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0) };
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base }, LOAD_MS);
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base }, LOAD_MS);
}

/** Take the screenshots into <out>/shots. Returns the names taken. */
export async function takeShots({ pagePath, out, only = null, gpu = false, browserPath, log = console.log }) {
  const dir = join(out, 'shots');
  mkdirSync(dir, { recursive: true });
  const want = (name) => !only || only.includes(name);
  const taken = [];
  const browser = await Browser.launch({ browser: browserPath, args: gpu ? [] : SOFTWARE_GL });
  try {
    log(`browser: ${browser.version.product} (${gpu ? 'its own GL' : 'software GL'})`);
    const page = await browser.page();
    const errors = [];
    await page.send('Runtime.enable');
    page.on('Runtime.exceptionThrown', (e) => errors.push(e.exceptionDetails?.exception?.description ?? e.exceptionDetails?.text));
    for (const session of SESSIONS) {
      if (!session.shots.some((x) => want(x.name))) continue;
      const url = `${pathToFileURL(pagePath).href}?${session.query}`;
      const device = session.device ?? DESK;
      await open(page, url, device);
      for (const shot of session.shots) {
        const started = Date.now();
        for (const step of [].concat(shot.run ?? [])) {
          if (typeof step === 'string') await page.evaluate(`(() => { const o = window.orbitSketch; ${step} })()`, LOAD_MS);
          else await waitSmall(page, step.wait, device);
        }
        for (const k of shot.keys ?? []) await key(page, k);
        if (!want(shot.name)) continue;
        await page.evaluate(settle(shot.frames ?? 3), SHOT_MS);
        const { data } = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 88 }, SHOT_MS);
        writeFileSync(join(dir, `${shot.name}.jpg`), Buffer.from(data, 'base64'));
        const where = await page.evaluate(`(() => {
          const o = window.orbitSketch, s = o.core.s, line = document.getElementById('statusline'), cap = document.getElementById('tour-caption');
          return 't ' + s.t.toFixed(1) + ' s, ' + (s.alt / 1000).toFixed(1) + ' km, ' + o.quality.tier + ': ' + (line ? line.textContent : '')
            + (cap && cap.classList.contains('shown') ? ' | the tour: ' + cap.textContent : '');
        })()`, SHOT_MS);
        log(`  ${shot.name}: ${where} (${((Date.now() - started) / 1000).toFixed(0)} s)`);
        taken.push(shot.name);
      }
    }
    if (errors.length) throw new Error(`the page threw:\n  ${[...new Set(errors)].join('\n  ')}`);
  } finally {
    await browser.close();
  }
  return taken;
}

/** Count a PDF's pages: its page objects. */
export function pdfPages(bytes) {
  return (bytes.toString('latin1').match(/\/Type\s*\/Page(?![a-zA-Z])/g) || []).length;
}

/**
 * Print guide.html to <out>/Runway-to-Ring-guide.pdf, with the screenshots from <out>/shots. Refuses a page
 * whose text runs past its bottom, and a figure whose screenshot is missing. Returns { path, pages }.
 */
export async function printGuide({ out, browserPath, log = console.log }) {
  const shots = join(out, 'shots');
  const browser = await Browser.launch({ browser: browserPath });
  try {
    const page = await browser.page();
    await page.send('Emulation.setDeviceMetricsOverride', { width: 816, height: 1056, deviceScaleFactor: 1, mobile: false });
    await page.goto(`${pathToFileURL(join(here, 'guide.html')).href}?shots=${encodeURIComponent(pathToFileURL(shots).href)}`, LOAD_MS);
    await waitFor(page, "document.body.dataset.ready === '1'", LOAD_MS);
    const faults = JSON.parse(await page.evaluate('JSON.stringify(window.guideFaults())', LOAD_MS));
    if (faults.length) throw new Error(`the guide is not fit to print:\n  ${faults.join('\n  ')}`);
    const r = await page.send('Page.printToPDF', {
      printBackground: true, preferCSSPageSize: true, generateTaggedPDF: true, generateDocumentOutline: true,
      marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0,
    }, SHOT_MS);
    const bytes = Buffer.from(r.data, 'base64');
    const path = join(out, PDF_NAME);
    writeFileSync(path, bytes);
    const pages = pdfPages(bytes);
    const expected = await page.evaluate("document.querySelectorAll('.page').length", LOAD_MS);
    if (pages !== expected) throw new Error(`the PDF has ${pages} pages where the guide lays out ${expected}`);
    log(`wrote ${path}: ${pages} pages, ${(bytes.length / 1e6).toFixed(1)} MB`);
    return { path, pages };
  } finally {
    await browser.close();
  }
}

async function main() {
  let args;
  try {
    ({ values: args } = parseArgs({
      options: {
        page: { type: 'string' }, out: { type: 'string' }, only: { type: 'string' }, browser: { type: 'string' },
        'skip-shots': { type: 'boolean', default: false }, 'skip-pdf': { type: 'boolean', default: false },
        gpu: { type: 'boolean', default: false }, list: { type: 'boolean', default: false }, help: { type: 'boolean', default: false },
      },
    }));
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
  if (args.help) {
    console.log('node flight/orbit/guide/build-guide.mjs [--page <index.html>] [--out <folder>] [--only a,b] [--skip-shots] [--skip-pdf] [--gpu] [--browser <path>] [--list]');
    return;
  }
  if (args.list) {
    for (const s of SESSIONS) for (const x of s.shots) console.log(`${x.name.padEnd(16)} ?${s.query}${s.device ? ' (a phone)' : ''}: ${x.about}`);
    return;
  }
  const pagePath = resolve(args.page ?? join(root, 'flight/orbit/build-web/index.html'));
  const out = resolve(args.out ?? join(here, 'out'));
  const only = args.only ? args.only.split(',').map((x) => x.trim()).filter(Boolean) : null;
  const unknown = (only ?? []).filter((x) => !SHOT_NAMES.includes(x));
  if (unknown.length) {
    console.error(`no shot named ${unknown.join(', ')}; --list names them`);
    process.exit(2);
  }
  try {
    if (!args['skip-shots']) {
      if (!existsSync(pagePath)) throw new Error(`no page at ${pagePath}: build it first (flight/orbit/README.md, "Build and test")`);
      const started = Date.now();
      console.log(`screenshots from ${pagePath}`);
      const taken = await takeShots({ pagePath, out, only, gpu: args.gpu, browserPath: args.browser });
      console.log(`${taken.length} screenshots in ${join(out, 'shots')}, ${((Date.now() - started) / 60000).toFixed(1)} min`);
    }
    if (!args['skip-pdf']) await printGuide({ out, browserPath: args.browser });
  } catch (e) {
    console.error(`failed: ${e.message}`);
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
