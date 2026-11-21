// The built page played as a person plays it: keys, a mouse's clicks, a phone's taps, never orbitSketch's
// commands. Each check is a fault 2026-11-21's play-test found by playing, which the module tests could not
// see: a key that did two things, the tour started from orbit, the controls handed back on the way home to
// the wrong crew, the brakes no phone could let go, the flight's overlays frozen over the walk, the phone's
// buttons over each other. Build first (tools/build.mjs). Skipped without a built page or without Playwright
// and its Chromium.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const page = new URL('../../build-web/index.html', import.meta.url);
let chromium = null, devices = null;
try { ({ chromium, devices } = require('playwright')); } catch { /* not installed here */ }
const why = !existsSync(fileURLToPath(page)) ? 'no built page: run tools/build.mjs' : !chromium ? 'Playwright is not installed' : false;
const ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const WAIT = { timeout: 60000, polling: 50 };
const TAP = { timeout: 60000 };   // a tap waits for a page drawing in software

async function open(browser, query, options) {
  const context = await browser.newContext(options);
  const p = await context.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(page.href + query, { timeout: 240000 });
  await p.waitForFunction(() => window.orbitSketch || /^Failed/.test((document.querySelector('#status') || {}).textContent || ''), null, { timeout: 240000 });
  assert.ok(!/^Failed/.test(await p.$eval('#status', (e) => e.textContent)), `${query}: failed to start`);
  // a frame drawn, so the page's first command is taken by its frame loop
  await p.waitForFunction(() => window.orbitSketch.core.s.t > 0, null, WAIT);
  // all the page says, kept: a word on the screen lasts 3.5 s, less than a frame on a loaded machine in software
  await p.evaluate(() => {
    window.said = [];
    const say = document.querySelector('#say');
    new MutationObserver(() => { if (say.textContent) window.said.push(say.textContent); }).observe(say, { childList: true, characterData: true, subtree: true });
  });
  return { p, context, errors };
}

const auto = (p) => p.evaluate(() => Math.round(window.orbitSketch.core.s.auto));
const forget = (p) => p.evaluate(() => { window.said = []; });
// waits until the page has said something matching re since the last forget()
const heard = (p, re) => p.waitForFunction((src) => window.said.some((t) => new RegExp(src).test(t)), re.source, WAIT);

test('on a desktop, by keys and clicks: one key does one thing, the tour, the way home, the brakes, the walk', { skip: why, timeout: 300000 }, async () => {
  const browser = await chromium.launch({ args: ARGS });
  try {
    const { p, context, errors } = await open(browser, '?q=low&at=775', { viewport: { width: 640, height: 400 } });
    // a clicked button keeps no focus: Enter, the walk's key, does not press it again (VIEW changed the view twice)
    const view = await p.evaluate(() => window.orbitSketch.state.view);
    await p.click('#btn-view');
    await p.waitForFunction((v) => window.orbitSketch.state.view !== v, view, WAIT);
    assert.equal(await p.evaluate(() => document.activeElement && document.activeElement.tagName), 'BODY');
    await p.keyboard.press('Enter');
    await heard(p, /dock there first/);
    assert.equal(await p.evaluate(() => window.orbitSketch.state.view), (view + 1) % 3, 'Enter left the view alone');

    // the controls handed back on the way home go to the crew flying home, not to the crew to orbit
    await p.keyboard.press('r');
    await p.waitForFunction(() => Math.round(window.orbitSketch.core.s.auto) === 3, null, WAIT);
    await p.keyboard.press('.');
    await p.keyboard.press('.');
    await p.waitForFunction(() => window.orbitSketch.state.warp === 5, null, WAIT);
    await p.keyboard.press(' ');
    await p.waitForFunction(() => Math.round(window.orbitSketch.core.s.auto) === 0, null, WAIT);
    // the controls come to the pilot at one to one (a crew done on the deck handed them over at 100×)
    await p.waitForFunction(() => window.orbitSketch.state.warp === 1, null, WAIT);
    await forget(p);
    await p.keyboard.press(' ');
    await p.waitForFunction(() => Math.round(window.orbitSketch.core.s.auto) !== 0, null, WAIT);
    assert.equal(await auto(p), 3, 'the crew flying home has it again');
    await heard(p, /home to KDFW 17C from here/);

    // the tour, started in orbit, starts on the runway: its captions the runway's, time one to one
    await p.keyboard.press('0');
    await p.waitForFunction(() => window.orbitSketch.core.s.t < 30 && document.querySelector('#tour-caption').classList.contains('shown'), null, WAIT);
    await p.waitForFunction(() => window.orbitSketch.core.s.t > 0.5, null, WAIT);
    assert.match(await p.$eval('#tour-caption', (e) => e.textContent), /^KDFW, runway 17C/);
    assert.equal(await p.evaluate(() => window.orbitSketch.state.warp), 1);
    // a hand on the keys takes over, as the tour says any key does, and time goes back to one to one
    await p.evaluate(() => { window.orbitSketch.state.warp = 25; });   // as the tour leaves it on the way to the Ring
    await forget(p);
    await p.keyboard.down('w');
    await p.waitForFunction(() => !document.querySelector('#tour-caption').classList.contains('shown'), null, WAIT);
    await p.keyboard.up('w');
    assert.equal(await p.evaluate(() => window.orbitSketch.state.warp), 1);
    await heard(p, /^The tour is over: the crew flies on/);

    // handed the craft parked, the pilot is told of the brakes, and B lets them go, and says so
    await p.keyboard.press(' ');
    await p.waitForFunction(() => document.querySelector('#hint').textContent === 'B: let the brakes go', null, WAIT);
    assert.match(await p.$eval('#readouts', (e) => e.textContent), /gear DOWN {3}BRAKES/);
    await forget(p);
    await p.keyboard.press('b');
    await heard(p, /^Brakes off$/);
    await p.waitForFunction(() => !/BRAKES/.test(document.querySelector('#readouts').textContent), null, WAIT);

    // while walking, the flight's overlays drawn before it (the flight director's display, here) are not on the screen
    await p.waitForFunction(() => window.orbitSketch.ctx.input.hands && document.querySelector('#fd-display').width > 0, null, WAIT);
    await p.evaluate(() => window.orbitSketch.ctx.walk.start(0));
    await p.waitForFunction(() => document.body.classList.contains('walking'), null, WAIT);
    for (const id of ['fd-display', 'dock-reticle', 'deck-approach', 'map', 'fpm', 'target']) {
      assert.equal(await p.$eval(`#${id}`, (e) => getComputedStyle(e).display), 'none', `#${id} while walking`);
    }
    // a flight's key while walking says why it waits, rather than nothing
    await forget(p);
    await p.keyboard.press('v');
    await heard(p, /^Aboard the Ring: the flight's keys wait/);
    await p.evaluate(() => window.orbitSketch.ctx.walk.stop(null));

    // a start again puts the telescope away, and the camera back behind the craft
    await forget(p);
    await p.keyboard.press('v');
    await p.keyboard.press('f');
    await heard(p, /telescope|below the horizon/);
    await p.keyboard.press('Backspace');
    await heard(p, /^Back on 17C$/);
    assert.equal(await p.evaluate(() => window.orbitSketch.ctx.camera.fov), 60, 'the telescope is away');
    assert.equal(await p.evaluate(() => window.orbitSketch.state.view), 0, 'the chase view');
    assert.deepEqual(errors, []);
    await context.close();
  } finally {
    await browser.close();
  }
});

test('on a phone, by taps: MORE closes, the help is the buttons\' and on top, the walk\'s buttons clear of the page\'s', { skip: why, timeout: 300000 }, async () => {
  const browser = await chromium.launch({ args: ARGS });
  try {
    const phone = { ...devices['iPhone 13'], deviceScaleFactor: 1 };   // its layout and its touch, a third of its pixels to draw in software
    const { p, context, errors } = await open(browser, '?q=low', phone);
    // MAP, a feature's button, closes MORE as the page's own buttons do; MORE was left open over the map
    await p.tap('#btn-more', TAP);
    await p.waitForFunction(() => document.querySelector('#buttons').classList.contains('open'), null, WAIT);
    await p.tap('#btn-map', TAP);
    await p.waitForFunction(() => document.querySelector('#map').style.display === 'block', null, WAIT);
    assert.equal(await p.$eval('#buttons', (e) => e.classList.contains('open')), false, 'MORE closed');
    // HELP over the map: the help is the touch screen's, and above the map, which hid it
    await p.tap('#btn-more', TAP);
    await p.tap('#btn-help', TAP);
    await p.waitForFunction(() => document.querySelector('#help').classList.contains('shown'), null, WAIT);
    assert.match(await p.$eval('#help', (e) => e.textContent), /the stick/);
    assert.doesNotMatch(await p.$eval('#help', (e) => e.textContent), /Shift Ctrl/);
    const top = await p.evaluate(() => {
      const r = document.querySelector('#help').getBoundingClientRect();
      const e = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 60));
      return e && e.closest('#help') ? 'help' : e ? e.id || e.tagName : null;
    });
    assert.equal(top, 'help', 'the help is on top of the map');
    await p.tap('#help', TAP);   // a tap puts it away
    await p.waitForFunction(() => !document.querySelector('#help').classList.contains('shown'), null, WAIT);
    const map = await p.$eval('#map', (e) => { const r = e.getBoundingClientRect(); return { x: r.right - 19, y: r.top + 18 }; });
    await p.touchscreen.tap(map.x, map.y);   // the map's own close button
    await p.waitForFunction(() => document.querySelector('#map').style.display === 'none', null, WAIT);

    // the brakes: a phone's pilot handed the craft parked can let them go (no B key; no button before)
    await p.tap('#btn-crew', TAP);
    await p.waitForFunction(() => /MORE, BRAKES/.test(document.querySelector('#hint').textContent), null, WAIT);
    await p.tap('#btn-more', TAP);
    await p.tap('#btn-brake', TAP);
    await p.waitForFunction(() => window.orbitSketch.ctx.input.hands.brake === 0, null, WAIT);

    // walking: the walk's four round buttons clear of the page's, and a tap on JUMP, shorter than a frame, jumps
    await p.evaluate(() => window.orbitSketch.ctx.walk.start(2));
    await p.waitForFunction(() => document.body.classList.contains('walking') && getComputedStyle(document.querySelector('#walk-touch')).display === 'grid', null, WAIT);
    const overlaps = await p.evaluate(() => {
      const shown = (e) => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0;
      const page = [...document.querySelectorAll('#buttons button')].filter(shown).map((e) => [e.textContent, e.getBoundingClientRect()]);
      const walk = [...document.querySelectorAll('#walk-touch button')].map((e) => [e.textContent, e.getBoundingClientRect()]);
      const stick = document.querySelector('#stick').getBoundingClientRect();
      const hit = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      const out = [];
      for (const [n, r] of page) {
        for (const [m, q] of walk) if (hit(r, q)) out.push(`${n} over ${m}`);
        if (hit(r, stick)) out.push(`${n} over the stick`);
        if (r.left < 0 || r.right > innerWidth || r.top < 0 || r.bottom > innerHeight) out.push(`${n} off the screen`);
      }
      return { out, page: page.map(([n]) => n) };
    });
    assert.deepEqual(overlaps.out, []);
    assert.deepEqual(overlaps.page.sort(), ['HELP', 'RESTART', 'TIME +', 'TIME −'].sort(), 'the page\'s USE is the walk\'s USE here');
    await p.waitForFunction(() => window.orbitSketch.ctx.walk.v.core.o.ground > 0.5, null, WAIT);
    await p.tap('#walk-touch button:nth-child(1)', TAP);
    await p.waitForFunction(() => window.orbitSketch.ctx.walk.v.core.o.ground < 0.5, null, WAIT);
    await p.evaluate(() => window.orbitSketch.ctx.walk.stop(null));

    // turned on its side, MORE's every button is on the screen: RESTART and LESS fell off its foot
    await p.setViewportSize({ width: 750, height: 342 });
    await p.tap('#btn-more', TAP);
    await p.waitForFunction(() => document.querySelector('#buttons').classList.contains('open'), null, WAIT);
    const off = await p.evaluate(() => [...document.querySelectorAll('#buttons button')]
      .filter((e) => getComputedStyle(e).display !== 'none')
      .filter((e) => { const r = e.getBoundingClientRect(); return r.top < 0 || r.bottom > innerHeight || r.left < 0 || r.right > innerWidth; })
      .map((e) => e.textContent));
    assert.deepEqual(off, []);
    assert.deepEqual(errors, []);
    await context.close();
  } finally {
    await browser.close();
  }
});
