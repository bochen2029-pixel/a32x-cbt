// Docking on the page: its names and numbers are orbit_dock.h's, DOCK does what makes sense from where
// the craft is and says why when it does nothing, the HUD and status lines say what the readouts say,
// the reticle's layout follows the errors, and the page's block reads the core's docking. GPLv3.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire, register } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { AUTO, Core, PH, SAS } from '../src/core.js';
import {
  DOCK, DOCK_OUT, DPH, HIT, PART, REFUSED, VERDICT, contactText, dockCommand, docked, dockedText, dockLines, dockStatus, engagedText, fmtNear, fmtOff, fmtSigned,
  fmtWay, hitText, onDeckBusiness, portHoldMakesSense, reticle, RIDING_M, ridingDeck, verdictText,
} from '../src/dock-hud.js';

const here = dirname(fileURLToPath(import.meta.url));
const header = readFileSync(join(here, '..', '..', 'core', 'orbit_dock.h'), 'utf8');
const coreHeader = readFileSync(join(here, '..', '..', 'core', 'orbit_core.h'), 'utf8');
const built = resolve(process.env.ORBIT_CORE || join(here, '..', '..', 'build-wasm', 'orbit_core.js'));

const camel = (n) => n.toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase());
const define = (name) => Number(header.match(new RegExp(`#define ${name}\\s+([0-9.]+)`))[1]);
function enumOf(prefix) {
  const out = {};
  for (const m of header.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(new RegExp(`\\bOC_DOCK_${prefix}_([A-Z_]+)\\s*=\\s*(\\d+)`, 'g'))) out[camel(m[1])] = Number(m[2]);
  return out;
}

// In orbit near the Ring, the crew flying, nothing touched: the readouts a test starts from.
const S = { auto: AUTO.crew, phase: PH.orbit, sas: SAS.hold, crashed: 0, peri: 499700, ringRange: 24600, portRange: 24300, vrelE: 0.2, vrelN: 0.1, vrelU: 0 };
const D = Object.fromEntries(DOCK_OUT.map((n) => [n, 0]));
const near = { ...D, range: 42.3, gap: 42.2, closing: 1.0, offY: 0.02, offZ: -0.01, rateY: 0, rateZ: 0.001, angle: 0.1, roll: 0.4, rollRate: 0.012 };

test('the docking readouts are orbit_dock.h\'s, in its order', () => {
  const body = header.slice(header.indexOf('OC_DOCK_DOCKED = 0'), header.indexOf('OC_DOCK_COUNT')).replace(/\/\*[\s\S]*?\*\//g, '');
  const names = [...body.matchAll(/\b(OC_DOCK_[A-Z_]+)\b/g)].map((m) => m[1]).filter((n, i, a) => a.indexOf(n) === i);
  assert.deepEqual(names.map((n) => camel(n.slice(8).replace(/_(DEG|DPS)$/, ''))), DOCK_OUT);
});

test('the docking\'s numbers and names are the headers\'', () => {
  assert.deepEqual(DOCK, {
    probe: define('OC_DOCK_PROBE_M'), tolOffset: define('OC_DOCK_TOL_OFFSET_M'), vMin: define('OC_DOCK_V_MIN'), vMax: define('OC_DOCK_V_MAX'),
    tolSlide: define('OC_DOCK_TOL_SLIDE'), tolAngle: define('OC_DOCK_TOL_ANGLE_DEG'), tolRoll: define('OC_DOCK_TOL_ROLL_DEG'),
    tolRollRate: define('OC_DOCK_TOL_ROLL_RATE_DPS'), stroke: define('OC_DOCK_STROKE_M'), drawS: define('OC_DOCK_DRAW_S'),
    separation: define('OC_DOCK_SEPARATION'), engageM: define('OC_DOCK_ENGAGE_M'), engageSpeed: define('OC_DOCK_ENGAGE_SPEED'),
  });
  assert.deepEqual(DPH, enumOf('PH'));
  assert.deepEqual(VERDICT, enumOf('V'));
  assert.deepEqual(HIT, enumOf('HIT'));
  assert.deepEqual(PART, enumOf('PART'));
  assert.deepEqual(REFUSED, enumOf('NO'));
  assert.equal(Number(coreHeader.match(/OC_SAS_PORT = (\d+)/)[1]), SAS.port);
  assert.equal(Number(coreHeader.match(/OC_AUTO_DOCK = (\d+)/)[1]), AUTO.dock);
});

test('numbers near the port, with their signs', () => {
  assert.equal(fmtSigned(0.0213, 2), '+0.02');
  assert.equal(fmtSigned(-0.004, 2), '+0.00');
  assert.equal(fmtSigned(-2.54, 2), '-2.54');
  assert.equal(fmtNear(4.567), '4.57 m');
  assert.equal(fmtNear(42.26), '42.3 m');
  assert.equal(fmtNear(282), '282 m');
  assert.equal(fmtNear(2400), '2.40 km');
  assert.equal(fmtOff(-595.15), '-595');
  assert.equal(fmtOff(42.26), '+42.3');
  assert.equal(fmtOff(0.004), '+0.00');
  assert.equal(fmtWay(1), 'closing 1.00 m/s');
  assert.equal(fmtWay(-0.664), 'opening 0.66 m/s');
});

test('DOCK starts the crew where it makes sense, and says why where it does not', () => {
  assert.equal(dockCommand(S, D).action, 'engage');
  const no = (s, d, words) => {
    const c = dockCommand(s, d);
    assert.equal(c.action, 'none');
    assert.match(c.say, words);
  };
  no({ ...S, peri: -6e6, phase: PH.hold }, D, /starts in orbit/);
  no({ ...S, ringRange: 80000 }, D, /80\.0 km away/);
  // the approach has the same 50 km (oc_auto): it is not offered as the way nearer
  assert.doesNotMatch(dockCommand({ ...S, ringRange: 80000 }, D).say, /approach comes nearer/);
  no({ ...S, vrelE: 60, vrelN: 30 }, D, /Passing the Ring at 67 m\/s/);
  no({ ...S, crashed: 1 }, D, /Crashed/);
  no({ ...S, auto: AUTO.dock }, { ...D, phase: DPH.close }, /docking: closing/);
  no(S, { ...D, docked: 1, phase: DPH.captured }, /latches are drawing/);
  const off = dockCommand(S, { ...D, docked: 1, phase: DPH.docked });
  assert.equal(off.action, 'undock');
  assert.match(off.say, /0\.15 m\/s/);
});

test('docked, a command with nothing to do says what there is to do instead', () => {
  assert.ok(docked({ ...D, docked: 1, phase: DPH.captured }));
  assert.ok(!docked(D));
  assert.equal(dockedText({ ...D, docked: 1, phase: DPH.captured }), 'Captured: the latches are drawing the craft in');
  assert.equal(dockedText({ ...D, docked: 1, phase: DPH.docked }), 'Docked: the craft is the hub\'s, and no one flies it. Enter: go aboard · P: let go · R: the crew flies home');
  assert.match(dockedText({ ...D, docked: 1, phase: DPH.docked }, true), /WALK: go aboard/);
});

// dock-view.js draws with three.js: from flight/web's packages, as the page's build resolves 'three' (return.test.mjs)
const threePath = join(here, '..', '..', '..', 'web', 'node_modules', 'three', 'build', 'three.module.js');
const noThree = !existsSync(threePath) && `three.js is not at ${threePath}: npm ci in flight/web`;

test('docked, CREW, TO ORBIT and APPROACH change nothing and say why; HOLD goes from the port\'s on to the deck\'s', { skip: noThree }, async () => {
  const url = pathToFileURL(threePath).href;
  register(`data:text/javascript,export async function resolve(s, c, next) { return s === 'three' ? { url: ${JSON.stringify(url)}, shortCircuit: true } : next(s, c); }`);
  const { dock } = await import('../src/dock-view.js');
  const said = [];
  const core = {
    s: { ...S, auto: AUTO.off, sas: SAS.port }, read() { return this.s; }, auto(m) { this.s.auto = m; }, sas(m) { this.s.sas = m; }, deck: {}, dock: { docked: 1 },
  };
  const ctx = { core, say: (t) => said.push(t), input: { hands: {} } };
  Object.assign(dock, { d: { ...D, docked: 1, phase: DPH.docked }, touch: false });
  // CREW used to hand a docked craft to the crew, and CREW again dropped the port's hold that letting go turns by
  for (const c of ['crew', 'orbit', 'approach']) assert.equal(dock.command(c, ctx), true, c);
  assert.equal(core.s.auto, AUTO.off);
  assert.equal(core.s.sas, SAS.port);
  assert.match(said[0], /^Docked: the craft is the hub's, and no one flies it\. Enter: go aboard/);
  // let go and near the Ring, HOLD goes on to the deck's hold (deck-view.js takes it), as the keys 1 to 6 go
  Object.assign(dock, { d: D });
  core.dock = { docked: 0 };
  assert.equal(dock.command('sas-next', { ...ctx, core: Object.assign(core, { s: { ...core.s, ringRange: 900 } }) }), false);
  assert.equal(dock.command('sas-next', { ...ctx, core: Object.assign(core, { s: { ...core.s, ringRange: 30000 } }) }), true);   // far: round to attitude
  assert.equal(core.s.sas, SAS.hold);
});

test('riding with the deck, TO ORBIT\'s crew would let go of it: on a pad, or gliding along it, not passing the hub', () => {
  const deckDef = { onDeck: 0 };
  assert.ok(ridingDeck({ ...S, auto: AUTO.off, sas: SAS.deck }, { onDeck: 1 }));   // on a pad: O there crashed into a rim wall
  const glide = { ...S, auto: AUTO.deck, ringRange: 4600, vrelE: 180, vrelN: 30 };
  assert.ok(ridingDeck(glide, deckDef));
  assert.ok(!ridingDeck({ ...glide, vrelE: 1, vrelN: 0 }, deckDef));              // at rest by the Ring: the crew can take it
  assert.ok(!ridingDeck({ ...glide, auto: AUTO.crew }, deckDef));                  // a fast pass, but not the deck's business
  assert.ok(!ridingDeck({ ...glide, ringRange: 24600 }, deckDef));
  assert.ok(!ridingDeck(S, null));
  assert.equal(RIDING_M, 9000);
});

test('once asked, the page says what the crew does first, or why the core refused', () => {
  assert.equal(engagedText({ ...S, auto: AUTO.dock }, { ...D, phase: DPH.transfer }), 'The crew docks at the hub: first to the hold point, 24.3 km away');
  assert.equal(engagedText({ ...S, auto: AUTO.dock }, { ...D, phase: DPH.align }), 'The crew docks at the hub: lining up on the port');
  assert.equal(engagedText(S, { ...D, refused: REFUSED.fast }), 'Docking refused: passing the Ring faster than 50 m/s');
});

test('the hold on the port is for docking: in orbit, near the Ring', () => {
  assert.ok(portHoldMakesSense(S));
  assert.ok(!portHoldMakesSense({ ...S, ringRange: 60000 }));
  assert.ok(!portHoldMakesSense({ ...S, peri: 20000 }));
});

test('a contact and a crash, in words: the verdict and the number that decided it', () => {
  assert.equal(contactText({ ...D, verdict: VERDICT.captured, cSpeed: 0.1 }), 'Captured at 0.10 m/s: the latches draw the craft in');
  assert.equal(contactText({ ...D, verdict: VERDICT.fast, cSpeed: 1.5 }), 'No capture: too fast: 1.50 m/s, the latches take 0.30 at most');
  assert.equal(verdictText({ ...D, verdict: VERDICT.offset, cOffset: 1.002 }), 'off the centre: 1.00 m, the drogue takes 0.30');
  assert.equal(verdictText({ ...D, verdict: VERDICT.roll, cRoll: -154.3 }), 'the key 154.3° out of phase, 2° at most');
  assert.equal(verdictText({ ...D, verdict: VERDICT.slow, cSpeed: 0.0147 }), 'too slow: 0.015 m/s, the latches need 0.03');
  assert.equal(hitText({ ...D, hit: HIT.roof, hitPart: PART.rightWing }), 'the right wing hit the roof');
  assert.equal(hitText({ ...D, hit: HIT.port, hitPart: PART.probe, cSpeed: 5 }), 'the probe struck the port at 5.0 m/s, past its stroke');
});

test('the status line follows the docking: the crew\'s phases, captured, docked, the port hold, a crash on the Ring', () => {
  assert.equal(dockStatus(S, D), null);
  const crew = { ...S, auto: AUTO.dock };
  assert.equal(dockStatus(crew, { ...D, phase: DPH.transfer }).line, 'DOCKING · 24.3 km to the hold point');
  assert.equal(dockStatus(crew, { ...near, phase: DPH.align }).line, 'DOCKING · LINING UP · key +0.4°, spin +0.01°/s');
  assert.equal(dockStatus(crew, { ...near, phase: DPH.close }).line, 'DOCKING · CLOSING · 42.2 m, closing 1.00 m/s');
  assert.match(dockStatus(crew, { ...near, phase: DPH.close }).hint, /^Space/);
  assert.equal(dockStatus(S, { ...D, docked: 1, phase: DPH.captured }).line, 'CAPTURED · the latches draw the craft in');
  const docked = dockStatus({ ...S, auto: AUTO.off }, { ...D, docked: 1, phase: DPH.docked }, true);
  assert.equal(docked.line, 'DOCKED AT THE HUB · turning with the Ring');
  // docked, the way aboard comes first: the walk was named nowhere on the screen (2026-11-21's play-test)
  assert.equal(docked.hint, 'WALK: go aboard · DOCK: let go · RETURN: fly home');
  assert.equal(dockStatus({ ...S, auto: AUTO.off }, { ...D, docked: 1, phase: DPH.docked }).hint, 'Enter: go aboard · P: let go · R: the crew flies home');
  assert.equal(dockStatus({ ...S, auto: AUTO.off, sas: SAS.port }, near).line, 'HAND · ON THE PORT · 42.2 m, closing 1.00 m/s');
  assert.equal(dockStatus({ ...S, auto: AUTO.off, sas: SAS.port }, { ...near, gap: 1.3, closing: -0.66 }).line, 'HAND · ON THE PORT · 1.30 m, opening 0.66 m/s');
  assert.equal(dockStatus({ ...S, auto: AUTO.off, sas: SAS.port }, { ...near, range: 9000 }), null);
  assert.equal(dockStatus({ ...S, crashed: 1 }, { ...D, hit: HIT.spoke, hitPart: PART.tail }).line, 'CRASHED · the tail hit a spoke');
  assert.equal(dockStatus({ ...S, crashed: 1 }, D), null);   // a crash elsewhere is the flight's to say
});

test('the HUD\'s docking lines: only near the port or while docking, with the numbers a docking pilot flies', () => {
  assert.deepEqual(dockLines(S, { ...D, range: 24000 }), []);
  // past the hub on the way to the deck, the crew's landing or the deck hold: the deck's lines, not these
  assert.deepEqual(dockLines({ ...S, auto: AUTO.deck }, near), []);
  assert.deepEqual(dockLines({ ...S, auto: AUTO.off, sas: SAS.deck }, near), []);
  assert.ok(onDeckBusiness({ ...S, auto: AUTO.deck }) && !onDeckBusiness({ ...S, auto: AUTO.off, sas: SAS.port }));
  const lines = dockLines(S, near);
  assert.equal(lines.length, 3);
  assert.match(lines[0], /^DOCK {16}port 42\.3 m {3}closing 1\.00 m\/s$/);
  assert.match(dockLines(S, { ...near, phase: DPH.close })[0], /^DOCK CLOSING {8}port 42\.3 m/);
  assert.match(lines[1], /right \+0\.02 {2}down -0\.01 m/);
  assert.match(lines[2], /nose 0\.1° off the axis {3}key \+0\.4° {3}spin \+0\.01°\/s/);
  const bounced = dockLines(S, { ...near, cT: 1100, verdict: VERDICT.fast, cSpeed: 1.5 });
  assert.equal(bounced.length, 4);
  assert.match(bounced[3], /last contact: too fast: 1\.50 m\/s/);
  assert.deepEqual(dockLines(S, { ...near, docked: 1, phase: DPH.docked, cT: 1100, verdict: VERDICT.captured, cSpeed: 0.1 }), ['DOCK DOCKED at the hub, captured at 0.10 m/s']);
  assert.equal(dockLines(S, near, true).length, 3);
  assert.ok(dockLines(S, near, true).every((l) => l.length <= 40), 'a phone\'s lines are short');
  assert.deepEqual(dockLines({ ...S, crashed: 1 }, near), []);
  // far out on the way to the hold point, the range and the closing only; the offsets matter on the axis
  assert.deepEqual(dockLines({ ...S, auto: AUTO.dock }, { ...D, range: 24600, closing: 1.01, offY: -595.15, phase: DPH.transfer }), ['DOCK TO HOLD POINT  port 24.6 km   closing 1.01 m/s']);
  assert.equal(dockLines({ ...S, auto: AUTO.dock }, { ...near, range: 900, phase: DPH.transfer }).length, 3);
});

test('the reticle: lined up, everything on the crosshair; each error moves its own mark, the craft\'s way up', () => {
  const R = 100, close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
  const lined = reticle({ ...D, gap: 2, closing: 0.1 }, R);
  assert.ok(close(lined.port[0], 0) && close(lined.port[1], 0) && close(lined.axis[0], 0) && close(lined.axis[1], 0));
  assert.ok(close(lined.key[0], 0) && close(lined.key[1], -1), 'the key up when in phase');
  assert.deepEqual(lined.ok, { offset: true, angle: true, roll: true, rollRate: true, closing: true });
  // the head a metre right of the port: the port's cross half way out to the left
  const right = reticle({ ...D, offY: 1 }, R);
  assert.ok(close(right.port[0], -R / 2) && close(right.port[1], 0));
  assert.equal(right.ok.offset, false);
  // the craft rolled a quarter turn right wing down: the key lies to the left, and the port's right is the craft's up
  const rolled = reticle({ ...D, offY: 1, roll: 90 }, R);
  assert.ok(close(rolled.key[0], -1) && close(rolled.key[1], 0, 1e-12));
  assert.ok(close(rolled.port[0], 0, 1e-9) && close(rolled.port[1], R / 2), `${rolled.port}`);
  // the port's axis above the nose and to its right: its ring above and right of the crosshair
  const pitched = reticle({ ...D, pitch: 5, yaw: 5, angle: 7.07 }, R);
  assert.ok(close(pitched.axis[0], R / 2) && close(pitched.axis[1], -R / 2));
  assert.equal(pitched.ok.angle, false);
  // the craft not turning while the port does: the port is seen to turn clockwise
  const still = reticle({ ...D, rollRate: -2.54 }, R);
  assert.ok(still.spin > 1 && !still.ok.rollRate);
  // the capture's window close to the face, not far from it
  assert.equal(reticle({ ...D, gap: 2, closing: 0.5 }, R).ok.closing, false);
  assert.equal(reticle({ ...D, gap: 50, closing: 1.0 }, R).ok.closing, true);
  assert.ok(close(lined.capture, (R * 0.3) / 1.3));
});

test('the page\'s block reads the core\'s docking: DOCK in orbit docks, and DOCK docked lets go', { skip: !existsSync(built) && `no module at ${built}: build it first` }, async () => {
  const core = new Core(await createRequire(import.meta.url)(built)());
  let s = core.reset();
  const d = core.addBlock('dock', '_oc_dock_out', '_oc_dock_out_len', DOCK_OUT);
  while (s.phase !== PH.orbit && s.t < 1500 && !s.crashed) s = core.step(250);
  assert.equal(s.phase, PH.orbit);
  assert.equal(dockCommand(s, d).action, 'engage');
  core.auto(AUTO.dock);
  s = core.read();
  assert.match(engagedText(s, d), /first to the hold point/);
  const t0 = s.t;
  while (d.phase !== DPH.docked && s.t - t0 < 1500 && !s.crashed) s = core.step(250);
  assert.equal(d.phase, DPH.docked, `phase ${d.phase} after ${(s.t - t0).toFixed(0)} s`);
  assert.equal(d.verdict, VERDICT.captured);
  assert.ok(Math.abs(d.cSpeed - 0.1) < 0.01, `${d.cSpeed}`);
  assert.ok(d.range < 1e-6 && Math.abs(d.rollRate) < 1e-9, `docked: ${d.range} m, ${d.rollRate} deg/s`);
  const centred = reticle(d, 100);
  assert.ok(Math.hypot(...centred.port) < 1e-3 && Math.hypot(...centred.axis) < 1e-3);
  const off = dockCommand(s, d);
  assert.equal(off.action, 'undock');
  core.m._oc_undock();
  s = core.step(500);
  assert.equal(d.docked, 0);
  assert.ok(d.closing < -0.14 && d.closing > -0.2 && d.gap > 1.4, `opening at ${-d.closing} m/s, ${d.gap} m off`);
  assert.equal(s.sas, SAS.port);
  assert.equal(dockStatus(s, d).line.slice(0, 19), 'HAND · ON THE PORT ');
});
