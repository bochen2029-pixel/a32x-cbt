// The flight deck on the page: its names and numbers are orbit_deck.h's, LAND DECK does what makes sense
// from where the craft is and says why when it does nothing, the HUD and status lines say what the readouts
// say, the approach display's layout follows the deviations the right way round, and the page's block reads
// the core's deck through a whole landing. GPLv3.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUTO, Core, PH, SAS } from '../src/core.js';
import { DOCK_OUT } from '../src/dock-hud.js';
import {
  DECK, DECK_NO, DECK_OUT, DECK_PH, DECK_V, LOC_FULL_M, GS_FULL_M, WITHIN_M, approachLayout, deckCommand, deckHoldMakesSense, deckLines, deckStatus, engagedText,
  padName, touchdownText, verdictText,
} from '../src/deck-hud.js';

const here = dirname(fileURLToPath(import.meta.url));
const header = readFileSync(join(here, '..', '..', 'core', 'orbit_deck.h'), 'utf8');
const coreHeader = readFileSync(join(here, '..', '..', 'core', 'orbit_core.h'), 'utf8');
const built = resolve(process.env.ORBIT_CORE || join(here, '..', '..', 'build-wasm', 'orbit_core.js'));

const camel = (n) => n.toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase());
const define = (name) => Number(header.match(new RegExp(`#define ${name}\\s+([0-9.]+)`))[1]);
function enumOf(prefix) {
  const out = {};
  for (const m of header.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(new RegExp(`\\bOC_DECK_${prefix}_([A-Z_]+)\\s*=\\s*(\\d+)`, 'g'))) out[camel(m[1])] = Number(m[2]);
  return out;
}

// Near the Ring, the crew flying, nothing touched: the readouts a test starts from.
const S = {
  auto: AUTO.crew, phase: PH.orbit, sas: SAS.hold, crashed: 0, peri: 499700, ringRange: 24600, portRange: 24300, vrelE: 0.2, vrelN: 0.1, vrelU: 0, prop: 4388,
  throttle: 0, gear: 1,
};
const D = Object.fromEntries(DECK_OUT.map((n) => [n, 0]));
D.pad = -1;
const glide = { ...D, phase: DECK_PH.glide, pad: 1, s: 3210, c: -84, height: 400.4, along: -154.2, across: 3.1, vertical: -0.1, apparentG: 0.26, nozzle: 33.6, loc: 2.3, gs: -1.1,
  fdAlong: -150.8, fdAcross: 4.0, fdVertical: 0.2, propUsed: 612 };

test('the deck\'s readouts are orbit_deck.h\'s, in its order', () => {
  const body = header.slice(header.indexOf('OC_DECK_PHASE = 0'), header.indexOf('OC_DECK_COUNT')).replace(/\/\*[\s\S]*?\*\//g, '');
  const names = [...body.matchAll(/\b(OC_DECK_[A-Z_]+)\b/g)].map((m) => m[1]).filter((n, i, a) => a.indexOf(n) === i);
  assert.deepEqual(names.map((n) => camel(n.slice(8).replace(/_(DEG|M)$/, ''))), DECK_OUT);
});

test('the deck\'s numbers and names are the headers\'', () => {
  assert.deepEqual(DECK, {
    swivel: define('OC_DECK_SWIVEL_DPS'), glide: define('OC_DECK_GLIDE_M'), hover: define('OC_DECK_HOVER_M'), side: define('OC_DECK_SIDE_M'),
    tolSink: define('OC_DECK_TOL_SINK'), tolDrift: define('OC_DECK_TOL_DRIFT'), tolOff: define('OC_DECK_TOL_OFF_M'), tolTilt: define('OC_DECK_TOL_TILT_DEG'),
    crashSink: define('OC_DECK_CRASH_SINK'), crashDrift: define('OC_DECK_CRASH_DRIFT'), crashTilt: define('OC_DECK_CRASH_TILT_DEG'), propMin: define('OC_DECK_PROP_MIN'),
  });
  assert.deepEqual(DECK_PH, enumOf('PH'));
  assert.deepEqual(DECK_V, enumOf('V'));
  assert.deepEqual(DECK_NO, enumOf('NO'));
  assert.equal(Number(coreHeader.match(/OC_AUTO_DECK = (\d+)/)[1]), AUTO.deck);
  assert.equal(Number(coreHeader.match(/OC_SAS_DECK = (\d+)/)[1]), SAS.deck);
});

test('LAND DECK starts the crew where it makes sense, and says why where it does not', () => {
  assert.equal(deckCommand(S, D, null).action, 'engage');
  const no = (s, d, words, dock = null) => {
    const c = deckCommand(s, d, dock);
    assert.equal(c.action, 'none');
    assert.match(c.say, words);
  };
  no({ ...S, peri: -6e6, phase: PH.hold, ringRange: 7e6 }, D, /starts in orbit/);
  no({ ...S, ringRange: 80000 }, D, /80\.0 km away/);
  no({ ...S, vrelE: 60, vrelN: 30 }, D, /Passing the Ring at 67 m\/s/);
  no({ ...S, crashed: 1 }, D, /Crashed/);
  no({ ...S, prop: 1200 }, D, /1200 kg of propellant: a deck landing wants 2,000/);
  no({ ...S, auto: AUTO.deck }, { ...D, phase: DECK_PH.glide }, /landing: on the glide/);
  no(S, { ...D, onDeck: 1 }, /On the deck already/);
  no(S, D, /let go first/, Object.fromEntries(DOCK_OUT.map((n) => [n, n === 'docked' ? 1 : 0])));
  // riding with the Ring, its own orbit low and the deck's speed past the Ring's centre: the crew still lands
  assert.equal(deckCommand({ ...S, peri: -300000, ringRange: 4990, vrelE: 221 }, D, null).action, 'engage');
});

test('once asked, the page says what the crew does first, or why the core refused', () => {
  assert.equal(engagedText({ ...S, auto: AUTO.deck }, { ...D, phase: DECK_PH.transfer, pad: -1 }), 'The crew lands on the deck: first to the hold point, 24.3 km away');
  assert.equal(engagedText({ ...S, auto: AUTO.deck }, { ...D, phase: DECK_PH.depart, pad: 0 }), 'The crew lands on pad 1: out into the Ring, then the glide along the deck');
  assert.equal(engagedText({ ...S, auto: AUTO.deck }, { ...D, phase: DECK_PH.hover, pad: 2 }), 'The crew lands on pad 3: over to it and down');
  assert.equal(engagedText(S, { ...D, refused: DECK_NO.landed }), 'Deck landing refused: on the deck already');
  assert.equal(engagedText(S, { ...D, refused: DECK_NO.prop }), 'Deck landing refused: under 2,000 kg of propellant');
});

test('the deck hold is for flying over the deck: within the Ring\'s reach', () => {
  assert.ok(deckHoldMakesSense({ ...S, ringRange: 4800 }, null));
  assert.ok(!deckHoldMakesSense({ ...S, ringRange: WITHIN_M + 1 }, null));
  assert.ok(!deckHoldMakesSense({ ...S, ringRange: 4800, crashed: 1 }, null));
});

test('a touchdown in words: the verdict and the number that decided it', () => {
  const td = { ...D, tdT: 2000, tdPad: 1, tdSink: 0.278, tdDrift: 0.002, tdOff: 0.01, tdTilt: 0.03 };
  assert.equal(verdictText({ ...td, tdVerdict: DECK_V.landed }), 'landed on pad 2 at 0.28 m/s, 0.0 m from its centre');
  assert.equal(touchdownText({ ...td, tdVerdict: DECK_V.landed }), 'Touchdown: landed on pad 2 at 0.28 m/s, 0.0 m from its centre');
  assert.equal(verdictText({ ...td, tdVerdict: DECK_V.firm, tdSink: 1.43 }), 'a firm touchdown on pad 2: 1.43 m/s, 0.5 is good');
  assert.equal(verdictText({ ...td, tdVerdict: DECK_V.crashed, tdSink: 11.2 }), 'down at 11.2 m/s: the legs take 3');
  assert.equal(verdictText({ ...td, tdVerdict: DECK_V.crashed, tdDrift: 5.3 }), '5.3 m/s across the deck at the touch: the gear takes 2');
  assert.equal(verdictText({ ...td, tdVerdict: DECK_V.offPad, tdOff: 191.8 }), 'down 192 m from pad 2\'s centre, 5 is good');
  assert.equal(padName(-1), 'no pad');
});

test('the status line follows the landing: the crew\'s phases, the deck hold, on the deck', () => {
  assert.equal(deckStatus(S, D), null);
  const crew = { ...S, auto: AUTO.deck };
  assert.equal(deckStatus(crew, { ...D, phase: DECK_PH.transfer }).line, 'DECK · 24.3 km to the hold point');
  assert.equal(deckStatus(crew, glide).line, 'DECK · GLIDE · pad 2 3.21 km · 154 m/s against the deck · swivel 34°');
  assert.match(deckStatus(crew, glide).hint, /^Space/);
  assert.equal(deckStatus(crew, { ...glide, phase: DECK_PH.hover, height: 20.04 }).line, 'DECK · HOVER over pad 2 · 20.0 m');
  assert.equal(deckStatus(crew, { ...glide, phase: DECK_PH.descend, height: 7.5, vertical: -0.92 }).line, 'DECK · DESCENDING onto pad 2 · 4.5 m · 0.92 m/s');
  const landed = deckStatus({ ...S, auto: AUTO.off, sas: SAS.deck, ringRange: 4990 }, { ...glide, phase: DECK_PH.landed, onDeck: 1, tdVerdict: DECK_V.landed, tdPad: 1, tdSink: 0.28, tdOff: 0 });
  assert.equal(landed.line, 'ON THE DECK · landed on pad 2 at 0.28 m/s, 0.0 m from its centre');
  const hold = deckStatus({ ...S, auto: AUTO.off, sas: SAS.deck, ringRange: 4970 }, { ...glide, phase: DECK_PH.none, height: 31.2, along: 3, across: 4, vertical: -1.5 });
  assert.equal(hold.line, 'HAND · DECK HOLD · 31.2 m over the floor · 5.0 m/s · -1.5 m/s');
  assert.equal(deckStatus({ ...S, auto: AUTO.off, sas: SAS.deck, ringRange: 4970 }, { ...glide, phase: DECK_PH.none, height: 31.2, along: 3, across: 4 }, true).line,
    'DECK HOLD · 31.2 m · 5.0 m/s');
  assert.equal(deckStatus({ ...S, auto: AUTO.off, sas: SAS.deck, ringRange: 40000 }, D), null);
  assert.equal(deckStatus({ ...S, crashed: 1 }, { ...D, onDeck: 1 }), null);   // a crash is docking's to say
});

test('the HUD\'s deck lines: only while the deck matters, with the numbers an approach is flown by', () => {
  assert.deepEqual(deckLines(S, D), []);
  const crew = { ...S, auto: AUTO.deck };
  const lines = deckLines(crew, glide);
  assert.equal(lines.length, 4);
  assert.match(lines[0], /^DECK GLIDE {10}pad 2 {2}3\.21 km along the deck {3}400 m over the floor$/);
  assert.match(lines[1], /against the deck -154\.2 along {2}\+3\.1 across {2}-0\.1 up {2}m\/s {3}0\.26 g {3}swivel 34°/);
  assert.match(lines[2], /ILS localizer \+2\.3 m {2}glide path -1\.1 m {3}FD -150\.8 \+4\.0 \+0\.2 m\/s/);
  assert.match(lines[3], /propellant for the landing 612 kg/);
  assert.deepEqual(deckLines(crew, { ...glide, phase: DECK_PH.transfer }), ['DECK TO HOLD POINT  pad 2  3.21 km along the deck   400 m over the floor']);
  assert.ok(deckLines(crew, glide, true).every((l) => l.length <= 40), 'a phone\'s lines are short');
  assert.deepEqual(deckLines({ ...S, crashed: 1 }, glide), []);
});

test('the approach display: the needles point to the path, the plan shows the pad and the velocities nose up', () => {
  const R = 100, close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
  const on = approachLayout({ ...glide, loc: 0, gs: 0, s: 0, c: 0, along: 0, across: 0, fdAlong: 0, fdAcross: 0, heading: 0 }, R);
  assert.ok(close(on.needles.loc, 0) && close(on.needles.gs, 0) && on.needles.ok);
  assert.ok(close(on.plan.pad[0], 0) && close(on.plan.pad[1], 0) && close(on.plan.velocity[0], 0));
  // right of the course (toward +axis, the right wing's side nose spinward): the course is to the left
  const right = approachLayout({ ...glide, loc: LOC_FULL_M / 2, gs: 0, heading: 0 }, R);
  assert.ok(close(right.needles.loc, -R / 2));
  // nose turned round, antispinward: the same offset is on the left wing's side
  assert.ok(close(approachLayout({ ...glide, loc: LOC_FULL_M / 2, gs: 0, heading: 180 }, R).needles.loc, R / 2, 1e-9));
  // above the path: the path is below
  assert.ok(close(approachLayout({ ...glide, loc: 0, gs: GS_FULL_M, heading: 0 }, R).needles.gs, R));
  assert.ok(close(approachLayout({ ...glide, loc: 0, gs: 4 * GS_FULL_M, heading: 0 }, R).needles.gs, R), 'pinned at the stop');
  // the pad 60 m behind the craft (the craft spinward of it, its nose spinward): straight down the plan, half way out
  const behind = approachLayout({ ...D, pad: 1, s: 60, c: 0, heading: 0 }, R);
  assert.ok(close(behind.plan.pad[0], 0, 1e-9) && close(behind.plan.pad[1], R / 2));
  // moving antispinward against the deck at 10 m/s, and across toward +axis: the velocity down and to the right
  const moving = approachLayout({ ...D, along: -10, across: 0, fdAlong: 0, fdAcross: 10, heading: 0 }, R);
  assert.ok(close(moving.plan.velocity[0], 0, 1e-9) && close(moving.plan.velocity[1], R / 2));
  assert.ok(close(moving.plan.director[0], R / 2) && close(moving.plan.director[1], 0, 1e-9));
});

test('the page\'s block reads the core\'s deck: LAND DECK in orbit lands, and the pilot has it on the deck', { skip: !existsSync(built) && `no module at ${built}: build it first` }, async () => {
  const core = new Core(await createRequire(import.meta.url)(built)());
  let s = core.reset();
  const d = core.addBlock('deck', '_oc_deck_out', '_oc_deck_out_len', DECK_OUT);
  core.addBlock('dock', '_oc_dock_out', '_oc_dock_out_len', DOCK_OUT);
  while (s.phase !== PH.orbit && s.t < 1500 && !s.crashed) s = core.step(250);
  assert.equal(s.phase, PH.orbit);
  assert.equal(deckCommand(s, d, core.dock).action, 'engage');
  core.auto(AUTO.deck);
  s = core.read();
  assert.match(engagedText(s, d), /first to the hold point/);
  const t0 = s.t;
  let glided = false, lowest = 90;
  while (!(d.phase === DECK_PH.landed && s.auto === AUTO.off) && s.t - t0 < 2400 && !s.crashed) {
    s = core.step(50);
    if (d.phase === DECK_PH.glide) { glided = true; lowest = Math.min(lowest, d.nozzle); }
  }
  assert.equal(s.crashed, 0);
  assert.ok(glided && lowest < 15, `the glide, its swivel as low as ${lowest}`);
  assert.equal(d.phase, DECK_PH.landed, `phase ${d.phase} after ${(s.t - t0).toFixed(0)} s`);
  assert.equal(d.tdVerdict, DECK_V.landed);
  assert.ok(d.tdSink <= DECK.tolSink && d.tdDrift <= DECK.tolDrift && d.tdOff <= DECK.tolOff && d.tdTilt <= DECK.tolTilt, `${d.tdSink} ${d.tdDrift} ${d.tdOff} ${d.tdTilt}`);
  assert.equal(s.sas, SAS.deck);
  assert.ok(Math.abs(s.g - 1) < 0.01 && d.apparentG > 0.99, `${s.g} g felt on the deck, ${d.apparentG} apparent`);
  assert.match(deckStatus(s, d).line, /^ON THE DECK · landed on pad \d at 0\.\d\d m\/s/);
  assert.equal(deckCommand(s, d, core.dock).action, 'none');
  // and the pilot lifts off with the throttle open
  core.controls({ pitch: 0, roll: 0, yaw: 0, throttle: 1, tx: 0, ty: 0, tz: 0, gear: true, brake: 0 });
  s = core.step(500);
  assert.ok(d.onDeck === 0 && d.height > 20, `${d.height} m up`);
});
