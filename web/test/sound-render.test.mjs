// The sound, rendered: the instrument played on an OfflineAudioContext in a browser, as it plays in the page,
// and measured. Every cue plays without a fault, sounds, peaks under full scale and makes no NaN; over the
// deck in vacuum a camera outside hears nothing while the cockpit hears the structure; the hover's level
// follows the thrust; footsteps on paving are brighter than on grass. Needs Chromium through Playwright and
// the page's esbuild (flight/web, npm ci); without them it is skipped, and says so. GPLv3.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const find = (name, extra = []) => {
  for (const from of [here, ...extra]) {
    try { return createRequire(join(from, 'x.js')).resolve(name); } catch { /* not here */ }
  }
  return null;
};
// Playwright where node finds it, or installed globally beside node; esbuild from flight/web's own
const playwright = process.env.PLAYWRIGHT_MODULE || find('playwright', [join(dirname(process.execPath), '..', 'lib', 'node_modules')]);
const esbuild = find('esbuild', [join(here, '..', '..', '..', 'web')]);
let why = !playwright ? 'no Playwright: npm install it, or set PLAYWRIGHT_MODULE' : !esbuild ? 'no esbuild: npm ci in flight/web' : '';
let chromium = null;
if (!why) {
  try { chromium = require(playwright).chromium; if (!existsSync(chromium.executablePath())) why = 'Playwright has no Chromium: npx playwright install chromium'; } catch (e) { why = `Playwright would not load: ${e.message}`; }
}

// What the page runs, bundled for a blank page: the instrument, the mix, and a render that returns measures.
const ENTRY = `
import * as M from ${JSON.stringify(join(here, '..', 'src', 'sound-mix.js'))};
import * as S from ${JSON.stringify(join(here, '..', 'src', 'sound.js'))};
const FS = 48000;
window.render = async (seconds, over, play, outside = false) => {
  const ac = new OfflineAudioContext(2, Math.floor(seconds * FS), FS), e = new S.Engine(ac);
  const m = M.mix(Object.assign(M.newInputs(), { volume: 0.7, sampleRate: FS }, over), M.newMix());
  if (m.ring) e.roomFor(over.scene);
  e.apply(m, 0, true);
  if (play) play(e, S, M);
  const buf = await ac.startRendering(), l = buf.getChannelData(0), r = buf.getChannelData(1);
  let peak = 0, sum = 0, bad = 0;
  for (let i = 0; i < l.length; i++) {
    if (!Number.isFinite(l[i]) || !Number.isFinite(r[i])) bad++;
    else { peak = Math.max(peak, Math.abs(l[i]), Math.abs(r[i])); sum += l[i] * l[i] + r[i] * r[i]; }
  }
  // the share of the energy above 1.5 kHz, by a first difference (a highpass at about fs / 2 pi)
  let hi = 0;
  for (let i = 1; i < l.length; i++) { const d = l[i] - l[i - 1]; hi += d * d; }
  return { peak, rms: Math.sqrt(sum / (2 * l.length)), bad, bright: sum > 0 ? hi / sum : 0 };
};
window.S = S; window.M = M;
`;

const db = (v) => (v > 0 ? 20 * Math.log10(v) : -Infinity);

test('the instrument, rendered: every cue, the deck in vacuum, the hover\'s thrust, the footsteps', { skip: why || false, timeout: 180000 }, async () => {
  const { build } = require(esbuild);
  const bundle = await build({ stdin: { contents: ENTRY, resolveDir: here, loader: 'js' }, bundle: true, format: 'iife', write: false, logLevel: 'silent' });
  const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setContent('<!doctype html><title>sound</title>');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    // every cue, alone in a quiet scene: plays, sounds, peaks under full scale, no NaN
    const results = await page.evaluate(async () => {
      const out = {};
      for (const name of Object.keys(window.S.CUES)) {
        const ring = ['step', 'land', 'ball', 'door', 'brake', 'hatch', 'bubble'].includes(name);
        const over = ring ? { scene: 1 } : name === 'nwave' ? { outside: 1, heard: 0, thr: 0, onGround: 0 } : { thr: 0, onGround: 1 };
        // silence the scene's own sound, so what is measured is the cue's
        const quiet = async (play) => window.render(2.5, over, (e, S, M) => {
          const m = M.mix(Object.assign(M.newInputs(), { volume: 0.7, sampleRate: 48000 }, over), M.newMix());
          for (const k of ['fans', 'elec', 'room', 'airy', 'city', 'canal', 'draught', 'rush', 'lift']) m[k] = 0;
          e.apply(m, 0, true);
          play(e, S);
        });
        out[name] = await quiet((e, S) => S.CUES[name](e, 0.3, {}));
      }
      return out;
    });
    for (const [name, r] of Object.entries(results)) {
      assert.equal(r.bad, 0, `${name}: NaN`);
      assert.ok(r.peak < 1, `${name}: peak ${db(r.peak).toFixed(1)} dBFS`);
      assert.ok(r.peak > 1e-4, `${name}: silent (${db(r.peak).toFixed(1)} dBFS)`);
    }
    // over the deck: in vacuum the camera outside hears nothing, the cockpit hears the swivelled drive
    const deck = await page.evaluate(async () => {
      const hover = { thr: 0.78, nozzle: 90, nozzleRate: 8, posts: 0.4, liftJet: 0.3, rho: 0, onGround: 0, gear: 1, qbar: 0, tas: 0 };
      const pad = (e) => { e.pad(0.6, 1, 2); e.puff(0.8, 1, -1); e.swivelStop(1, 1); };
      return {
        outside: await window.render(2, { ...hover, outside: 1, heard: 1, delay: 0.2, path: 70, range: 70 }, pad),
        cockpit: await window.render(2, hover, pad),
        half: await window.render(3, { ...hover, thr: 0.5, nozzleRate: 0, posts: 0, liftJet: 0 }, (e, S, M) => quietDeck(e, M, 0.5)),
        full: await window.render(3, { ...hover, thr: 1, nozzleRate: 0, posts: 0, liftJet: 0 }, (e, S, M) => quietDeck(e, M, 1)),
      };
      // the thrum alone: everything else the structure carries held at nothing
      function quietDeck(e, M, thr) {
        const m = M.mix(Object.assign(M.newInputs(), { volume: 0.7, sampleRate: 48000, thr, nozzle: 90, rho: 0, onGround: 0 }), M.newMix());
        for (const k of ['vib', 'hum', 'shear', 'kick', 'duct', 'whine', 'posts', 'actuator', 'fans', 'elec', 'rcs']) m[k] = 0;
        e.apply(m, 0, true);
      }
    });
    assert.equal(deck.outside.peak, 0, `outside, in vacuum: ${db(deck.outside.peak)} dBFS`);
    assert.ok(deck.cockpit.rms > 1e-3 && deck.cockpit.peak < 1, `the cockpit: ${db(deck.cockpit.rms).toFixed(1)} dBFS`);
    const rise = db(deck.full.rms) - db(deck.half.rms);
    assert.ok(Math.abs(rise - 20 * Math.log10(2 ** 0.8)) < 0.6, `the thrum from half thrust to full: ${rise.toFixed(2)} dB, the thrust's 0.8 power says ${(20 * Math.log10(2 ** 0.8)).toFixed(2)}`);
    // footsteps: paving rings brighter than grass, both under full scale
    const steps = await page.evaluate(async () => {
      const go = (surface) => window.render(1.5, { scene: 1 }, (e, S, M) => {
        const m = M.mix(Object.assign(M.newInputs(), { volume: 0.7, sampleRate: 48000, scene: 1 }), M.newMix());
        for (const k of ['room', 'airy', 'city', 'canal', 'draught', 'rush', 'lift']) m[k] = 0;
        e.apply(m, 0, true);
        for (let k = 0; k < 3; k++) e.step(0.2 + 0.4 * k, surface, 1, 1);
      });
      return { paving: await go('paving'), grass: await go('grass') };
    });
    assert.ok(steps.paving.bright > 1.5 * steps.grass.bright, `paving ${steps.paving.bright.toFixed(4)}, grass ${steps.grass.bright.toFixed(4)}`);
    assert.ok(steps.paving.peak > steps.grass.peak, 'and harder');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

