// The flight director on the page (fd-hud.js): its phases are the header's, its cues lean the way a pilot
// must move, its ILS is the runway's geometry, and the crew's own approach to 17C flies down the middle of
// it. The last flies the WebAssembly build's core (flight/orbit/README.md); ORBIT_CORE names another. GPLv3.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire, register } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateAirport } from '../../../web/src/airport-layout.js';
import { localMetres, origin } from '../../../web/src/scene-math.js';
import KDFW from '../../../web/data/kdfw.json' with { type: 'json' };
import { AUTO, Core, START } from '../src/core.js';
import { FD_PH, ILS, SOFT, directionAt, fdCues, fdLabel, fdLines, fdShown, fmtBank, fmtHdg, ilsDeviation, ilsGeometry, ilsShown, wrap180 } from '../src/fd-hud.js';

const here = dirname(fileURLToPath(import.meta.url));
const header = readFileSync(join(here, '..', '..', 'core', 'orbit_fd.h'), 'utf8');
const built = resolve(process.env.ORBIT_CORE || join(here, '..', '..', 'build-wasm', 'orbit_core.js'));
const D2R = Math.PI / 180, FT = 0.3048;
const threePath = join(here, '..', '..', '..', 'web', 'node_modules', 'three', 'build', 'three.module.js');
const noThree = !existsSync(threePath) && `three.js is not at ${threePath}: npm ci in flight/web`;

// the flight home's readouts' names, from return-view.js, which takes 'three' as the page's build resolves it
let RET_OUT = [], RET_PH = {};
if (!noThree) {
  const url = pathToFileURL(threePath).href;
  register(`data:text/javascript,export async function resolve(s, c, next) { return s === 'three' ? { url: ${JSON.stringify(url)}, shortCircuit: true } : next(s, c); }`);
  ({ RET_OUT, RET_PH } = await import('../src/return-view.js'));
}
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} against ${b}, ${tol} allowed`);

test('the director\'s phases are the header\'s, in its order', () => {
  const body = header.slice(header.indexOf('OC_FD_PH_NONE = 0'), header.indexOf('OC_FD_PH_STOPPED') + 'OC_FD_PH_STOPPED'.length).replace(/\/\*[\s\S]*?\*\//g, '');
  const names = [...body.matchAll(/\bOC_FD_PH_([A-Z_]+)\b/g)].map((m) => m[1].toLowerCase()).filter((n, i, a) => a.indexOf(n) === i);
  assert.deepEqual(names, Object.keys(FD_PH));
  assert.deepEqual(Object.values(FD_PH), names.map((_, i) => i));
  assert.equal(fdLabel(FD_PH.climb), 'CLIMB');
  assert.equal(fdLabel(FD_PH.entry), 'ENTRY');
});

const craft = (o = {}) => ({
  auto: AUTO.off, fdValid: 1, fdPhase: FD_PH.climb, pitch: 20, roll: 0, hdg: 180, fdPitch: 20, fdBank: 0, fdHdg: 180, fdThrottle: 0.9, fdGear: 0,
  fdAlpha: 0, fdLiftBank: 0, airLaw: 1, onGround: 0, alt: 1000, crashed: 0, gear: 0, throttle: 0.9, ...o,
});

test('the bars lean the way to move: nose up above the symbol, bank right to its right; above the air the bar is the heading\'s', () => {
  const R = 80;
  const level = fdCues(craft(), R);
  assert.equal(level.pitch, -0);
  assert.equal(level.lateral, 0);
  // more nose up asked: the pitch bar above the symbol (screen y runs down), linear while small
  const up = fdCues(craft({ fdPitch: 21 }), R);
  assert.ok(up.pitch < 0, `a nose-up command puts the bar above: ${up.pitch}`);
  near(up.pitch, -(R * 1) / (1 + SOFT.pitch), 1e-12, 'one degree, on the soft scale');
  assert.ok(fdCues(craft({ fdPitch: 15 }), R).pitch > 0, 'nose down: below');
  // more bank right asked: the bank bar right of the symbol; left: left; across the wrap at 180 as well
  assert.ok(fdCues(craft({ fdBank: 30 }), R).lateral > 0, 'bank right: right');
  assert.ok(fdCues(craft({ fdBank: -30 }), R).lateral < 0, 'bank left: left');
  assert.ok(fdCues(craft({ roll: 179, fdBank: -179 }), R).lateral > 0, 'from 179 to -179 is 2 degrees more to the right');
  assert.equal(fdCues(craft({ fdBank: 30 }), R).lateralIs, 'bank');
  // a large error still shows its side, inside the display
  for (const e of [90, 300, 1e6]) assert.ok(-fdCues(craft({ fdPitch: 20 + e }), R).pitch < R, `${e} degrees inside the ball`);
  // above the air the stick turns the craft: the bar is the heading's error, right for a turn right
  const space = craft({ airLaw: 0, fdHdg: 190, fdBank: 0, roll: 0 });
  assert.equal(fdCues(space, R).lateralIs, 'heading');
  assert.ok(fdCues(space, R).lateral > 0, 'a heading to the right: right');
  assert.ok(fdCues(craft({ airLaw: 0, hdg: 5, fdHdg: 355 }), R).lateral < 0, 'from 005 to 355 is a turn left');
  near(fdCues(space, R).lateral, (R * 10) / (10 + SOFT.heading), 1e-12, 'ten degrees of heading');
  // on the ground the law is the air's
  assert.equal(fdCues(craft({ airLaw: 0, onGround: 1 }), R).lateralIs, 'bank');
  near(fdCues(craft({ fdBank: -25 }), R).cmdBank, -25 * D2R, 1e-15, 'the bank index');
  near(wrap180(350), -10, 1e-12, 'wrap');
});

test('the director is drawn while you fly, while the crew flies too when asked, never when off or quiet', () => {
  assert.equal(fdShown(craft(), 'hand'), true);
  assert.equal(fdShown(craft({ auto: AUTO.crew }), 'hand'), false);
  assert.equal(fdShown(craft({ auto: AUTO.crew }), 'always'), true);
  assert.equal(fdShown(craft({ auto: AUTO.return }), 'always'), true);
  assert.equal(fdShown(craft(), 'off'), false);
  assert.equal(fdShown(craft({ fdValid: 0 }), 'always'), false);
});

test('a pitch and a heading make the direction the core reckons them from: true north and the local up where the craft is', () => {
  const close = (a, b, what) => a.forEach((v, i) => near(v, b[i], 1e-12, `${what}[${i}]`));
  close(directionAt([0, 0, 0], 0, 0, START.lat), [0, 1, 0], 'north at the start');
  close(directionAt([0, 0, 0], 0, 90, START.lat), [1, 0, 0], 'east');
  close(directionAt([0, 0, 0], 90, 37, START.lat), [0, 0, 1], 'up');
  close(directionAt([0, 0, 0], 30, 180, START.lat), [0, -Math.cos(30 * D2R), Math.sin(30 * D2R)], 'south and up');
  // 2,000 km east the local up and north lean: the direction stays square to the local up at pitch 0, and
  // north lies in the plane of the pole and the up there
  const P = [2e6, 0, -2e6 * 2e6 / (2 * 6371000)];
  const up = (() => { const v = [P[0], P[1], P[2] + 6371000]; const n = Math.hypot(...v); return v.map((x) => x / n); })();
  const n = directionAt(P, 0, 0, START.lat), e = directionAt(P, 0, 90, START.lat);
  near(n[0] * up[0] + n[1] * up[1] + n[2] * up[2], 0, 1e-12, 'north level');
  near(e[0] * up[0] + e[1] * up[1] + e[2] * up[2], 0, 1e-12, 'east level');
  const la = START.lat * D2R, pole = [0, Math.cos(la), Math.sin(la)];
  const normal = [up[1] * pole[2] - up[2] * pole[1], up[2] * pole[0] - up[0] * pole[2], up[0] * pole[1] - up[1] * pole[0]];
  near(n[0] * normal[0] + n[1] * normal[1] + n[2] * normal[2], 0, 1e-12, 'north in the meridian');
  assert.ok(n[0] * pole[0] + n[1] * pole[1] + n[2] * pole[2] > 0, 'and toward the pole');
});

const airport = validateAirport(KDFW);
const g = ilsGeometry(airport, '17C', START);

test('the ILS is KDFW 17C\'s: its threshold the flight\'s start, its course the runway\'s heading, its far end 35C\'s', () => {
  near(g.threshold[0], 0, 1e-9, 'the threshold east of the start');
  near(g.threshold[1], 0, 1e-9, 'north of it');
  near(g.headingDeg, 180.3, 1e-12, 'the course');
  near(g.lengthM, 13400 * FT, 1e-9, 'the runway beyond the threshold');
  near(g.gpip, (50 * FT) / Math.tan(3 * D2R), 1e-9, 'the glide path meets the runway 291 m in');
  near(g.gpip * Math.tan(g.glideDeg * D2R), 50 * FT, 1e-9, 'and crosses the threshold at 50 ft');
  // the far end, where the data puts 35C: on the centreline, the runway's length down it
  const far = localMetres(origin(START.lat, START.lon), 32.87889862, -97.02619934);
  const d = [far.east - g.threshold[0], far.north - g.threshold[1]];
  const along = d[0] * g.course[0] + d[1] * g.course[1], right = d[0] * g.right[0] + d[1] * g.right[1];
  near(along, g.lengthM, 5, '35C down the course');
  near(right, 0, 5, '35C off the centreline');
  assert.throws(() => ilsGeometry(airport, '22X', START), /no runway end 22X/);
});

// A point d metres short of the threshold (before it, on the approach), r right of the centreline, its wheels h
// above the runway: where the core's readouts would put the craft (site frame, height above the sphere).
const at = (d, r, h) => {
  const along = -d;
  const P = [g.threshold[0] + g.course[0] * along + g.right[0] * r, g.threshold[1] + g.course[1] * along + g.right[1] * r, 0];
  return ilsDeviation(g, P, h + ILS.wheelsM);
};
const onPath = (d) => (d + g.gpip) * Math.tan(3 * D2R);

test('the ILS reads the runway\'s geometry: centred on the path, a dot 0.36 degrees, full scale 350 ft either side at the threshold', () => {
  for (const d of [500, 2000, 9000, 18000]) {
    const c = at(d, 0, onPath(d));
    near(c.loc.dots, 0, 1e-9, `the localizer ${d} m out`);
    near(c.gs.dots, 0, 1e-9, `the glide slope ${d} m out`);
    assert.ok(c.loc.valid && c.gs.valid, `received ${d} m out`);
    near(c.distance, d, 1e-6, 'the distance to the threshold');
  }
  // above and below the path, by its angle from where it meets the runway
  const d = 6000, x = d + g.gpip;
  near(at(d, 0, x * Math.tan(3.36 * D2R)).gs.dots, 1, 1e-9, 'a dot high');
  near(at(d, 0, x * Math.tan(3.72 * D2R)).gs.dots, 2, 1e-9, 'full scale high');
  near(at(d, 0, x * Math.tan(2.64 * D2R)).gs.dots, -1, 1e-9, 'a dot low');
  // either side of the course, by the angle from the antenna 1,000 ft past the far end
  near(at(0, 350 * FT, onPath(0)).loc.dots, 2, 1e-9, '350 ft right at the threshold: full scale');
  const dot = Math.atan2(350 * FT, g.loc) / 2;   // an angle: a dot is half full scale's angle, not half its distance
  near(at(0, -g.loc * Math.tan(dot), onPath(0)).loc.dots, -1, 1e-9, 'a dot left at the threshold');
  near(at(0, -175 * FT, onPath(0)).loc.dots, -1, 2e-4, '175 ft left, within the angle\'s curve');
  const far = at(15000, 0, onPath(15000));
  const wide = at(15000, Math.tan(Math.atan2(350 * FT, g.loc)) * (15000 + g.loc), onPath(15000));
  near(far.loc.dots, 0, 1e-12, 'on the course far out');
  near(wide.loc.dots, 2, 1e-9, 'the same angle far out is the same full scale: an angle, not a distance');
  // coverage: past the localizer's 18 NM, beyond its 35 degrees, behind its antenna; the glide slope past
  // its 10 NM, off its 8 degrees, and past where it meets the runway
  assert.equal(at(18 * 1852, 0, onPath(18 * 1852)).loc.valid, false, 'out of range');
  assert.equal(at(5000, (5000 + g.loc) * Math.tan(40 * D2R), 300).loc.valid, false, '40 degrees off, from the antenna');
  assert.equal(at(5000, (5000 + g.loc) * Math.tan(30 * D2R), 300).loc.valid, true, '30 degrees off: received');
  assert.equal(at(-6000, 0, 0).loc.valid, false, 'behind the antenna');
  assert.equal(at(12 * 1852, 0, onPath(12 * 1852)).gs.valid, false, 'the glide slope out of range at 12 NM');
  assert.equal(at(12 * 1852, 0, onPath(12 * 1852)).loc.valid, true, 'the localizer still in');
  assert.equal(at(3000, 3000 * Math.tan(10 * D2R), onPath(3000)).gs.valid, false, 'the glide slope 10 degrees off');
  assert.equal(at(-400, 0, 2).gs.valid, false, 'past where the path meets the runway');
  // shown flying toward the runway below 8 km, not flying away from it
  const toward = { hdg: 180.3, alt: 1000, crashed: 0, onGround: 0 };
  assert.equal(ilsShown(toward, at(9000, 0, onPath(9000)), g), true);
  assert.equal(ilsShown({ ...toward, hdg: 0.3 }, at(9000, 0, onPath(9000)), g), false, 'flying away');
  assert.equal(ilsShown({ ...toward, alt: 2.9, onGround: 1 }, at(0, 0, 0), g), false, 'on the runway at the threshold');
  assert.equal(ilsShown({ ...toward, alt: 300 }, at(-2000, 0, 300), g), false, 'climbing out over the runway');
});

test('the HUD says what the director asks, and where the craft is on the ILS', () => {
  const s = craft({ fdPitch: 28, fdBank: -30, fdHdg: 180.4, fdThrottle: 0.9 });
  const [fdLine] = fdLines(s, true, null);
  assert.match(fdLine, /^FD +CLIMB +pitch 28\.0° +bank L 30° +hdg 180° +thrust 90% +gear up/);
  const entry = craft({ fdPhase: FD_PH.entry, fdLiftBank: 62.4, fdAlpha: 40, fdPitch: 12, fdBank: 55 });
  assert.match(fdLines(entry, true, null)[0], /ENTRY +bank R 62° about the air, α 40\.0°/);
  const ils = at(5000, 30, onPath(5000) - 20);
  const lines = fdLines(s, false, ils);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^ILS {2}17C {2}LOC [0-9.]+ dot right {3}GS [0-9.]+ dot low {3}5\.00 km to the threshold/);
  assert.deepEqual(fdLines(s, false, null), []);
  assert.deepEqual([fmtBank(-0.2), fmtBank(0.49), fmtBank(-12.4), fmtBank(45)], ['0°', '0°', 'L 12°', 'R 45°']);
  assert.deepEqual([fmtHdg(0.3), fmtHdg(359.7), fmtHdg(-90), fmtHdg(450)], ['000', '000', '270', '090']);
  assert.match(fdLines(s, true, ils, '17C', true).join('\n'), /^FD CLIMB {2}P 28° B L 30° {2}THR 90%\nILS LOC/);
});

test('the crew flying home comes down the middle of the ILS, and the director reads out its approach',
  { skip: (!existsSync(built) && `no module at ${built}: build it first`) || noThree }, async (t) => {
    const core = new Core(await createRequire(import.meta.url)(built)());
    const r = core.addBlock('ret', '_oc_return_out', '_oc_return_out_len', RET_OUT);
    let s = core.reset(START);
    while (s.t < 800) s = core.step(500);
    core.auto(AUTO.return);
    while (r.phase < RET_PH.approach && s.t < 9000 && s.crashed === 0) s = core.step(500);
    assert.equal(r.phase, RET_PH.approach, 'on the approach');
    let samples = 0, worstLoc = 0, worstGs = 0, director = 0;
    while (r.phase === RET_PH.approach && s.crashed === 0) {
      s = core.step(25);
      const dev = ilsDeviation(g, [s.siteE, s.siteN, s.siteU], s.alt);
      // on final, 12 km to 1 km out: on the centreline, not on the turn onto it
      if (dev.along > -1000 || dev.along < -12000 || Math.abs(dev.right) > 300 || r.phase !== RET_PH.approach) continue;
      samples += 1;
      worstLoc = Math.max(worstLoc, Math.abs(dev.loc.dots));
      worstGs = Math.max(worstGs, Math.abs(dev.gs.dots));
      assert.ok(dev.loc.valid && dev.gs.valid && ilsShown(s, dev, g), `received ${-dev.along} m out`);
      director += s.fdValid === 1 && s.fdPhase === FD_PH.approach && s.fdGear === (dev.along > -9000 ? 1 : s.fdGear);
    }
    t.diagnostic(`${samples} samples on final, 12 km to 1 km out: the localizer within ${worstLoc.toFixed(4)} dot, the glide slope ${worstGs.toFixed(3)}`);
    assert.ok(samples > 100, `${samples} samples on final`);
    assert.ok(worstLoc < 0.05, `the localizer within ${worstLoc} dot`);
    assert.ok(worstGs < 0.1, `the glide slope within ${worstGs} dot`);
    assert.equal(director, samples, 'the director read out the approach all the way');
  });
