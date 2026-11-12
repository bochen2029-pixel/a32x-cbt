#!/usr/bin/env node
// build-guide.mjs: the orbit sketch's guide as a PDF. It opens the built page in headless Chrome, flies it
// to each place the guide shows and takes a screenshot there, then prints guide.html, with those
// screenshots in it, to a PDF of Letter pages. Node built-ins and a Chromium-family browser, driven over
// the DevTools protocol by this repository's own driver (app/tools/chrome.mjs): no package to install.
// Nothing it writes is committed: the screenshots and the PDF go to out/, which git ignores. GPLv3.
//
//   node flight/orbit/guide/build-guide.mjs [--page flight/orbit/build-web/index.html] [--out flight/orbit/guide/out]
//        [--only name,name] [--skip-shots] [--skip-pdf] [--gpu] [--browser <path>] [--list]
//
// Build the page first (flight/orbit/README.md, "Build and test"). The page is drawn in software
// (SwiftShader) unless --gpu: slow, half a minute to a minute a screenshot and a quarter to half an hour
// for them all, by how busy the machine is, but the same picture on any machine. Each screenshot below is the page's own address and a few
// lines run in the page through window.orbitSketch, the handle it keeps for its tests: the flight stands
// still (time warp 0) while the lines step the core to the place wanted, so a shot is the same each time
// it is taken, but for what the page's own clock moves (blinking lights, the time of the first frames).
// Exit 0 when made, 1 when something failed, 2 for a usage error.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { Browser } from '../../../app/tools/chrome.mjs';

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

// What the shots' lines may call, put into each page once it has loaded. until() steps the core, the
// flight otherwise standing still, until a test of the readouts holds: s the flight's (core.s), d
// docking's, r the flight home's, k the deck's. look() sets the view and the chase camera's place.
const HELPER = `window.guide = {
  until(test, chunk = 50, limit = 4e6) {
    const o = window.orbitSketch, c = o.core, f = new Function('s', 'd', 'r', 'k', 'return (' + test + ');');
    o.state.warp = 0;
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
  step(n) { window.orbitSketch.state.warp = 0; window.orbitSketch.core.step(n); },
  quiet() { const e = document.getElementById('say'); if (e) e.textContent = ''; },
  help(shown) { const e = document.getElementById('help'); if (e) e.classList.toggle('shown', shown); },
  hud(shown) { for (const id of ['hud', 'status', 'tour-caption']) { const e = document.getElementById(id); if (e) e.style.visibility = shown ? '' : 'hidden'; } },
};`;

// The flight stands still from the start: what each session does first.
const FREEZE = 'window.orbitSketch.state.warp = 0; guide.help(false);';
// At the hold point, 300 m off the hub's port, at one time for every tier, so the three are alike.
const AT_HOLD = "window.orbitSketch.command('approach'); guide.until('s.portRange < 5'); guide.until('s.t >= 1600');";

// The shots, in sessions: one page load each, its shots taken in order. A shot's `run` is page-side
// JavaScript; `frames` is how many of the page's frames to let pass before the picture.
export const SESSIONS = [
  {
    query: 'q=medium', shots: [
      { name: 'ui', about: 'the page as it opens: on 17C, the help shown', run: "window.orbitSketch.state.warp = 0; guide.help(true); guide.look('chase', 0, 0.2, 70);" },
    ],
  },
  {
    query: 'q=medium&at=38', shots: [
      { name: 'takeoff', about: 'rotation on 17C at 38 s', run: `${FREEZE} guide.look('chase', 0.55, 0.12, 62);` },
    ],
  },
  {
    query: 'q=medium&at=110', shots: [
      { name: 'climb', about: 'through Mach 1 at 10 km, 110 s', run: `${FREEZE} guide.look('chase', 0.35, 0.18, 70);` },
    ],
  },
  {
    query: 'q=medium&at=330', shots: [
      { name: 'ascent', about: 'above the air, 124 km, 330 s', run: `${FREEZE} guide.look('chase', 0.25, 0.22, 75);` },
    ],
  },
  {
    query: 'q=medium&at=775', shots: [
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
    query: 'q=low&at=775', shots: [
      { name: 'tier-low', about: 'the hold point at low', run: `${FREEZE} ${AT_HOLD} guide.look('chase', 0, 0.2, 70); guide.quiet();` },
    ],
  },
  {
    query: 'q=high&at=775', shots: [
      { name: 'tier-high', about: 'the hold point at high', run: `${FREEZE} ${AT_HOLD} guide.look('chase', 0, 0.2, 70); guide.quiet();` },
    ],
  },
  {
    query: 'q=medium&at=775', shots: [
      { name: 'deck-glide', about: 'the glide along the deck', run: `${FREEZE} window.orbitSketch.command('deck'); guide.until('k.phase >= 4', 250); guide.until('k.s <= 3500', 25); guide.look('chase', 0, 0.2, 70); guide.quiet();` },
      { name: 'deck-hover', about: 'the hover over pad 2', run: "guide.until('k.phase >= 5', 10); guide.step(150); guide.look('chase', 1.3, 0.35, 120); guide.quiet();" },
      { name: 'deck-pad', about: 'at rest on the pad', run: "guide.until('k.phase === 7 && s.auto === 0', 10); guide.step(100); guide.look('chase', 2.6, 0.5, 400); guide.quiet();" },
    ],
  },
  {
    query: 'q=medium&at=775', shots: [
      { name: 'entry', about: 'entry, the heat near its peak', run: `${FREEZE} window.orbitSketch.command('return'); guide.until('r.phase >= 5 && r.heat > 330000', 50); guide.look('chase', 0, 0.2, 70); guide.quiet();` },
      { name: 'final', about: 'on final for 17C', run: "guide.until('r.phase >= 7 && s.alt < 450', 10); guide.look('chase', 0, 0.12, 70); guide.quiet();" },
      { name: 'stopped', about: 'stopped on 17C', run: "guide.until('r.phase === 10', 50); guide.step(100); guide.look('chase', 2.4, 0.25, 80); guide.quiet();" },
    ],
  },
  {
    // on the canal's promenade, 400 m spinward along the floor and 33 m off the Ring's plane, 72 s on
    query: 'q=medium&walk=floor', shots: [
      { name: 'walk-floor', about: 'on the floor, 5 km from the axis, looking spinward', run: `guide.help(false); const w = o.ctx.walk.v; w.warp = 0;
        w.core.put(400, -33); o.core.step(3600); w.core.step(3600);
        w.prev = { ...w.core.o }; w.cur = { ...w.core.o }; w.look = { heading: 0.12, pitch: 0.14 }; guide.quiet();` },
    ],
  },
  {
    // in lift 1's car, ridden down to 120 m over the floor
    query: 'q=medium&walk=lift', shots: [
      { name: 'walk-lift', about: 'in a lift near the floor', run: `guide.help(false); const w = o.ctx.walk.v; w.warp = 0;
        const at = (use) => w.core.controls({ fwd: 0, right: 0, heading: w.core.o.heading, pitch: 0, run: 0, jump: 0, use });
        at(1); w.core.step(1); o.core.step(1); at(0);
        for (let i = 0; i < 400 && w.core.o.liftR < 4880; i++) { w.core.step(100); o.core.step(100); }
        w.prev = { ...w.core.o }; w.cur = { ...w.core.o }; w.look = { heading: 0.35, pitch: -0.3 }; guide.quiet();` },
    ],
  },
  {
    query: 'q=medium', shots: [
      { name: 'tour', about: 'the tour\'s first caption', run: "guide.help(false); window.orbitSketch.command('tour'); guide.quiet();", frames: 4 },
    ],
  },
  {
    query: 'q=low&at=775', device: PHONE, shots: [
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
        if (shot.run) await page.evaluate(`(() => { const o = window.orbitSketch; ${shot.run} })()`, LOAD_MS);
        for (const k of shot.keys ?? []) await key(page, k);
        if (!want(shot.name)) continue;
        await page.evaluate(settle(shot.frames ?? 3), SHOT_MS);
        const { data } = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 88 }, SHOT_MS);
        writeFileSync(join(dir, `${shot.name}.jpg`), Buffer.from(data, 'base64'));
        const where = await page.evaluate(`(() => {
          const o = window.orbitSketch, s = o.core.s, line = document.getElementById('statusline');
          return 't ' + s.t.toFixed(1) + ' s, ' + (s.alt / 1000).toFixed(1) + ' km, ' + o.quality.tier + ': ' + (line ? line.textContent : '');
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
