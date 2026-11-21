// The walk on the page: its names and numbers are the header's, its frames are the ring's, the Sun it lights
// the band with is the one a ray traced through the band finds, the plan it paints is the one the walker walks
// in, and the core it drives, through the page's own wrapper, keeps the physics the core's tests state. The
// module is the WebAssembly build's (flight/orbit/README.md); ORBIT_CORE names another. MIT.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Core, RING } from '../src/core.js';
import { cross, dot, length, sub } from '../src/frames.js';
import { BALL, BOX, LIFT, PLACE, USE, WALK, WALK_OUT, WHERE, WalkCore } from '../src/walk-core.js';
import {
  DECK_LEN, DECK_MID, HALF, bulkheadAhead, RF, RIM_R, SEALED, S_RIM, STREET, W, WALK_TIERS, between, bearingName, decked, feltUp, floorPlace, fromDeck, outward,
  ringDirToSite, ringFrame, ringToSite, siteDirToRing, skyWindow, spinward, sunFor, sunReach, sunReachMarched, surfaceAt, turnAboutAxis, viewAxes,
  walkLines, walkLinesNarrow, walkStatus,
} from '../src/walk-math.js';
import { DECK, DECK_A, DECK_HALF, DECK_WALL, bulkheads } from '../src/ring-plan.js';
import { SETTINGS, TIERS } from '../src/quality.js';

const here = dirname(fileURLToPath(import.meta.url));
const header = readFileSync(join(here, '..', '..', 'core', 'orbit_walk.h'), 'utf8');
const built = resolve(process.env.ORBIT_CORE || join(here, '..', '..', 'build-wasm', 'orbit_core.js'));
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} against ${b}`);
const camel = (n) => n.toLowerCase().replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());

test('the walk\'s readouts are the header\'s, in its order', () => {
  const body = header.slice(header.indexOf('OC_WALK_T = 0'), header.indexOf('OC_WALK_COUNT')).replace(/\/\*[\s\S]*?\*\//g, '');
  const names = [...body.matchAll(/\bOC_WALK_([A-Z0-9_]+)\b/g)].map((m) => camel(m[1]));
  assert.deepEqual(names, WALK_OUT);
});

test('the walk\'s numbers and names for things are the header\'s', () => {
  const defs = Object.fromEntries([...header.matchAll(/#define OC_WALK_([A-Z0-9_]+?)(?:_M)?\s+([0-9.]+)/g)].map((m) => [camel(m[1]), Number(m[2])]));
  assert.deepEqual(WALK, defs);
  const value = (name) => Number(header.match(new RegExp(`\\b${name}\\s*=\\s*([0-9]+)`))?.[1] ?? NaN);
  const holds = (prefix, js, names) => names.forEach((n, i) => {
    assert.equal(value(`${prefix}${n}`), i, `${prefix}${n}`);
    assert.equal(Object.values(js)[i], i, `${prefix}${n} on the page`);
  });
  holds('OC_WALK_AT_', PLACE, ['HATCH', 'LIFT', 'FLOOR']);
  assert.deepEqual([value('OC_WALK_IN_HUB'), value('OC_WALK_IN_LIFT'), value('OC_WALK_ON_FLOOR')], [WHERE.hub, WHERE.lift, WHERE.floor]);
  holds('OC_LIFT_', LIFT, ['AT_HUB', 'DOWN', 'AT_FLOOR', 'UP']);
  holds('OC_USE_', USE, ['NOTHING', 'HATCH', 'CALL', 'RIDE']);
  holds('OC_BALL_', BALL, ['NONE', 'FLYING', 'RESTING']);
  holds('OC_BOX_', BOX, ['BLOCK', 'PARAPET', 'PYLON', 'SHAFT', 'BULKHEAD', 'LOCK']);
});

// A ring frame from readouts as the flight core gives them: some centre, an axis and a ref square to it.
function readouts(seed = 3) {
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1;
  const axis = [r(), r(), r()], an = length(axis);
  const ax = axis.map((x) => x / an);
  let ref = cross(ax, [r(), r(), r()]);
  ref = ref.map((x) => x / length(ref));
  return { ringE: 1e5 * r(), ringN: 2e6 * r(), ringU: 5e5, ringAxE: ax[0], ringAxN: ax[1], ringAxU: ax[2], ringRefE: ref[0], ringRefN: ref[1], ringRefU: ref[2] };
}

test('the ring\'s frame: x along ref, y along the axis, z = x cross y, there and back', () => {
  for (let k = 1; k < 20; k++) {
    const F = ringFrame(readouts(k));
    for (const [a, b] of [[F.x, F.y], [F.y, F.z], [F.z, F.x]]) near(dot(a, b), 0, 1e-12, 'square');
    const z = cross(F.x, F.y);
    for (let i = 0; i < 3; i++) near(F.z[i], z[i], 1e-12, 'right-handed');
    const p = [1234.5, -321, 4999], back = siteDirToRing(F, sub(ringToSite(F, p), F.centre));
    for (let i = 0; i < 3; i++) near(back[i], p[i], 1e-7, 'there and back');
    const v = siteDirToRing(F, ringDirToSite(F, [0.3, -0.4, 0.5]));
    near(v[0], 0.3, 1e-12, 'a direction');
  }
});

test('the walker\'s view: heading 0 is spinward, pi/2 along the axis; facing spinward the axis is to the right', () => {
  for (const th of [0, 0.7, 2.5, -2]) {
    const level = viewAxes(th, 0, 0);
    for (let i = 0; i < 3; i++) near(level.fwd[i], spinward(th)[i], 1e-12, 'spinward');
    for (let i = 0; i < 3; i++) near(level.up[i], -outward(th)[i], 1e-12, 'up is toward the axis');
    near(level.right[1], 1, 1e-12, 'the axis to the right hand');
    const along = viewAxes(th, Math.PI / 2, 0.4);
    near(along.fwd[1], Math.cos(0.4), 1e-12, 'along the axis, raised');
    near(length(along.fwd), 1, 1e-12, 'unit');
    near(dot(along.fwd, along.up), 0, 1e-12, 'square');
  }
  // what the body feels as up: against the felt gravity
  const up = feltUp({ upTheta: 0, feltS: 0, feltC: 0, feltH: -9.81 });
  near(up[2], -1, 1e-12, 'standing: up is toward the axis, -z at angle 0');
  const leaning = feltUp({ upTheta: 0, feltS: -1.5, feltC: 0, feltH: -3.9 });
  assert.ok(leaning[0] > 0.3, 'pushed antispinward, the felt up leans spinward');
});

test('the Sun\'s reach, worked out from the band\'s shape and found again by a ray marched through it', () => {
  let seed = 11, agree = 0, lit = 0, n = 0;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 400; k++) {
    const th = 2 * Math.PI * r(), c = (r() * 2 - 1) * (HALF - 5), h = 0.2 + r() * 250, R = RF - h;
    const off = Math.abs(fromDeck(th * RF));
    if (off > DECK_LEN - 1 && off < SEALED + 1) continue;   // in a bulkhead, where nothing is lit
    const p = [R * Math.sin(th), c, R * Math.cos(th)];
    const d = [r() * 2 - 1, r() * 2 - 1, r() * 2 - 1], dn = length(d);
    const u = d.map((x) => x / dn);
    const analytic = sunReach(p, u), marched = sunReachMarched(p, u, 0.25);
    if (analytic > 0.02 && analytic < 0.98) continue;   // in the soft edge the two are not meant to agree
    n++;
    if ((analytic > 0.5) === (marched > 0.5)) agree++;
    if (analytic > 0.5) lit++;
  }
  assert.equal(agree, n, `${n - agree} of ${n} points disagree`);
  assert.ok(lit > n * 0.1 && lit < n * 0.6, `${lit} of ${n} lit`);
});

test('the flight deck\'s bulkheads shade the town beside them: worked out, and found again by a marched ray', () => {
  let seed = 5, shaded = 0;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 3000; k++) {
    const side = r() < 0.5 ? -1 : 1, s = DECK_MID + side * (SEALED + 1 + r() * 120), c = (r() * 2 - 1) * (HALF - 20), h = 0.5 + r() * 40;
    const th = s / RF, R = RF - h, p = [R * Math.sin(th), c, R * Math.cos(th)];
    const d = [r() * 2 - 1, r() * 2 - 1, r() * 2 - 1], n = Math.hypot(...d), u = d.map((x) => x / n);
    if (!bulkheadAhead(p, u, 1e5)) continue;
    const analytic = sunReach(p, u), marched = sunReachMarched(p, u, 0.25);
    if (analytic > 0.02 && analytic < 0.98) continue;
    assert.equal(analytic > 0.5, marched > 0.5, `beside a bulkhead at s ${s.toFixed(1)}, c ${c.toFixed(1)}, h ${h.toFixed(1)}`);
    if (analytic === 0) shaded++;
  }
  assert.ok(shaded > 100, `${shaded} rays a bulkhead stood in`);
});

test('the Sun 23.7 degrees out of the ring\'s plane lights the middle of the band about a third of each turn', () => {
  const e = (23.7 * Math.PI) / 180, p = [0, 0, RF - 1.7];
  let on = 0;
  const N = 3600;
  for (let i = 0; i < N; i++) {
    const a = (2 * Math.PI * i) / N, d = [Math.cos(e) * Math.sin(a), -Math.sin(e), Math.cos(e) * Math.cos(a)];
    if (sunReach(p, d) > 0.5) on++;
  }
  near(on / N, 0.36, 0.03, 'the part of a turn the Sun shines in, on the band\'s middle');
  // beside the wall on the Sun's side it never does: that wall is 380 m tall
  let wall = 0;
  for (let i = 0; i < N; i++) {
    const a = (2 * Math.PI * i) / N, d = [Math.cos(e) * Math.sin(a), -Math.sin(e), Math.cos(e) * Math.cos(a)];
    if (sunReach([0, -420, RF - 1.7], d) > 0.5) wall++;
  }
  assert.equal(wall, 0, 'under the -c wall');
  // the reach turns with the ring: what shines in now set a turn later as it does now
  const d0 = [Math.cos(e) * Math.sin(1), -Math.sin(e), Math.cos(e) * Math.cos(1)];
  near(sunReach(p, turnAboutAxis(d0, -2 * Math.PI)), sunReach(p, d0), 1e-9, 'once round');
});

test('the drawing between two steps goes the short way round', () => {
  const a = { eyeX: 0, eyeY: 1, eyeZ: 2, upTheta: 2 * Math.PI - 0.01, carR0: 150, carR1: 150, carR2: 150, carR3: 150, carR4: 150, carR5: 150, ballX: 0, ballY: 0, ballZ: 0 };
  const b = { ...a, eyeX: 1, upTheta: 0.01, carR0: 160 };
  const m = between(a, b, 0.5);
  near(m.eyeX, 0.5, 1e-12, 'half way');
  near(Math.abs(m.upTheta % (2 * Math.PI)), 0, 1e-9, 'across 0, not the long way');
  near(m.carR0, 155, 1e-12, 'a car');
});

test('words for where the walker is and what the Sun does', () => {
  assert.equal(bearingName(0), 'spinward');
  assert.equal(bearingName(-Math.PI / 2), 'the −c wall');
  assert.equal(bearingName(Math.PI), 'antispinward');
  assert.match(floorPlace(300, 37), /^300 m spinward of spoke 1, c \+37 m on the canal's promenade$/);
  assert.match(floorPlace(S_RIM - 50, -5), /spoke 1's plaza, c −5 m over the canal/);
  assert.match(floorPlace(S_RIM / 6 + 2000, 200), /2\.00 km spinward of spoke 2/);
  const o = {
    t: 61, where: WHERE.floor, spoke: 0, s: 300, c: 37, r: RF - 1, upTheta: 0.06, g: 1.0004, ground: 1, feltS: 0, feltC: 0, feltH: -9.81,
    centrifugal: 9.8105, speed: 1.4, vs: 1.4, vc: 0, vh: 0, corS: 0, corC: 0, corH: -0.124, lift: LIFT.atFloor, liftR: RF, liftV: 0, use: USE.nothing,
    aboard: 0, jumps: 1, jumpRise: 1, jumpT: 0.9028, jumpDs: 0.05334, ball: BALL.resting, ballFalls: 1, ballT: 0.6387, ballDs: -0.03773, eyeX: 0, eyeY: 37, eyeZ: RF - 1.7,
  };
  assert.equal(walkStatus(o).line, 'WALK · THE FLOOR · 1.00 g');
  const lines = walkLines(o, 1, null).join('\n');
  assert.match(lines, /CORIOLIS 0\.124 m\/s² down: heavier by 1\.3 %/);
  assert.match(lines, /JUMP .* came down 53 mm spinward/);
  assert.match(lines, /BALL .* came down 38 mm antispinward of straight below/);
  const ride = { ...o, where: WHERE.lift, lift: LIFT.down, liftR: 2640, g: 0.55, corH: 0, corS: -1.5, liftV: 16.93, use: USE.nothing };
  assert.equal(walkStatus(ride).line, 'WALK · LIFT 1 · DOWN · 2.64 km from the axis · 0.55 g');
  assert.match(walkStatus(ride).hint, /^holding the rail/);
  assert.match(walkLines(ride, 1, null).join('\n'), /CORIOLIS 1\.500 m\/s² antispinward/);
  assert.equal(walkStatus({ ...o, where: WHERE.hub, g: 0.0298, use: USE.hatch }).hint, 'E: go back aboard the craft');
  assert.equal(walkStatus({ ...o, where: WHERE.lift, lift: LIFT.atHub, use: USE.ride }, 1, true).hint, 'USE: ride down to the floor');
  const sun = sunFor({ ...o, upTheta: 0, eyeX: 0, eyeY: 0, eyeZ: RF - 1.7 }, [0, -0.4, -0.9165]);
  assert.ok(sun.el > 1 && sun.reach > 0.5, 'high over the band and shining in');
  assert.match(walkLines(o, 1, sun).join('\n'), /SUN .* up, toward .*: shining in · sets in \d+ s/);
  // on a phone: what was just tried (the jump, the ball, the lift) is kept, where the first five lines alone
  // left it off the screen (2026-11-21's play-test); six lines, the spaces closed up
  const narrow = walkLinesNarrow(walkLines(o, 1, sun));
  assert.ok(narrow.length <= 6);
  assert.match(narrow[0], /^WALK T\+01:01 TIME 1× /);
  assert.ok(narrow.some((l) => /^JUMP .* came down 53 mm spinward/.test(l)), narrow.join('\n'));
  assert.ok(narrow.some((l) => /^BALL .* came down 38 mm antispinward/.test(l)), narrow.join('\n'));
  assert.ok(walkLinesNarrow(walkLines(ride, 1, null)).some((l) => /^LIFT 1: going down/.test(l)));
  assert.deepEqual(walkLinesNarrow(walkLines({ ...o, jumps: 0, ballFalls: 0 }, 1, null)).map((l) => l.split(' ')[0]), ['WALK', 'PLACE', 'WEIGHT', 'SPEED', 'CORIOLIS']);
});

test('the plan the page paints is the one the walker walks in', { skip: !existsSync(built) && `no module at ${built}: build it first` }, async () => {
  const core = new Core(await createRequire(import.meta.url)(built)());
  const walk = new WalkCore(core.m);
  walk.reset(PLACE.floor);
  const boxes = walk.boxes();
  const free = (s, c) => !boxes.some((b) => b.zone === WHERE.floor && Math.abs((((s - b.s) % S_RIM) + 1.5 * S_RIM) % S_RIM - S_RIM / 2) < b.half + WALK.radius
    && c > b.c0 - WALK.radius && c < b.c1 + WALK.radius);
  let checked = 0;
  for (let i = 0; i < 2000; i++) {
    const s = (i * 15.7) % S_RIM, c = ((i * 7.3) % 58) - 29;   // across the canal
    if (!free(s, c)) continue;
    checked++;
    const closed = ['water', 'flightdeck', 'bulkhead'].includes(surfaceAt(s, c));
    assert.equal(walk.put(s, c), !closed, `at s ${s.toFixed(1)}, c ${c.toFixed(1)} the page paints ${surfaceAt(s, c)}`);
  }
  assert.ok(checked > 1000, `${checked} places checked`);
  // the parapets stand along the painted banks and across the canal at the painted decks' edges
  for (const b of boxes.filter((x) => x.kind === BOX.parapet)) {
    if (b.c1 - b.c0 > 1) {   // across the canal: at the edge of a deck
      for (const side of [-1, 1]) {
        const edge = b.s + side * b.half;
        assert.notEqual(decked(edge - side * 0.5), decked(edge + side * 0.5), `a parapet across the canal at ${edge.toFixed(1)}`);
      }
    } else assert.ok(Math.abs(Math.min(Math.abs(b.c0), Math.abs(b.c1)) - WALK.canal) < 1e-9, 'a parapet along a bank');
  }
  assert.equal(STREET, S_RIM / WALK.streets);
});

test('the core through the page\'s wrapper: weight, a jump, the lift, and the same walk twice', { skip: !existsSync(built) && `no module at ${built}: build it first` }, async () => {
  const make = createRequire(import.meta.url)(built);
  const hashes = [];
  for (let run = 0; run < 2; run++) {
    const walk = new WalkCore(new Core(await make()).m);
    let o = walk.reset(PLACE.floor);
    near(o.g, 1, 0.005, 'one g on the floor');
    assert.equal(o.where, WHERE.floor);
    assert.ok(walk.put(300, 37));
    walk.controls({ fwd: 0, right: 0, heading: 0, pitch: 0, run: false, jump: true, use: false });
    walk.controls({ fwd: 0, right: 0, heading: 0, pitch: 0, run: false, jump: false, use: false });
    while (walk.o.jumps === 0) walk.step(1);
    near(walk.o.jumpDs, 0.05334, 0.0001, 'a 1 m jump comes down spinward');
    near(walk.o.jumpT, 0.9028, 0.0001, 'its time');
    // the lift: up from the floor, holding the rail
    o = walk.reset(PLACE.lift);
    walk.controls({ fwd: 0, right: 0, heading: 0, pitch: 0, run: false, jump: false, use: true });
    walk.controls({ fwd: 0, right: 0, heading: 0, pitch: 0, run: false, jump: false, use: false });
    let steps = 0, most = 0;
    while (walk.o.lift !== LIFT.atFloor && steps < 30000) {
      walk.step(10);
      steps += 10;
      if (walk.o.lift === LIFT.down) {
        most = Math.max(most, Math.abs(walk.o.feltS));
        near(-walk.o.feltH, W * W * walk.o.r - walk.o.liftA, 1e-6, 'the floor pushes omega^2 r less the car\'s acceleration');
      }
    }
    near(steps * 0.02, 334.3, 0.3, 'down in');
    near(most, WALK.liftPush, 0.01, 'pushed sideways at 2 omega v');
    assert.equal(walk.o.where, WHERE.lift);
    hashes.push(walk.hash());
  }
  assert.equal(hashes[0], hashes[1], 'the same walk twice');
});

test('the walk\'s bulkheads are where the page draws the flight deck\'s, and the town keeps off the deck', { skip: !existsSync(built) && `no module at ${built}: build it first` }, async () => {
  const walk = new WalkCore(new Core(await createRequire(import.meta.url)(built)()).m);
  walk.reset(PLACE.floor);
  const boxes = walk.boxes(), mine = boxes.filter((b) => b.kind === BOX.bulkhead).sort((a, b) => a.s - b.s);
  const drawn = bulkheads().sort((a, b) => a.a - b.a);
  assert.equal(mine.length, 2);
  mine.forEach((b, i) => {
    const k = drawn[i];
    near(b.s / RF, k.a, 1e-12, 'its middle, as an angle');
    near((b.s - k.side * b.half) / RF, k.face, 1e-12, 'its face toward the deck');
    near(2 * b.half, DECK.bulkhead, 1e-9, 'its thickness');
    near(b.h1, RF - k.r0, 1e-9, 'its top, at the roof, as in the core and on the page');
    assert.ok(b.c0 <= -k.y && b.c1 >= k.y, 'across the band');
  });
  near(DECK_MID, DECK_A * RF, 1e-9, 'the deck\'s middle');
  near(DECK_LEN / RF, DECK_HALF, 1e-12, 'its half-length');
  near((SEALED - DECK_LEN) / RF, DECK_WALL, 1e-12, 'the bulkheads\' thickness');
  for (const b of boxes) {
    if (b.zone !== WHERE.floor || b.kind === BOX.bulkhead) continue;
    assert.ok(Math.abs(fromDeck(b.s)) - b.half > SEALED - 1e-9, `a ${b.kind === BOX.lock ? 'lock gate' : 'thing'} of the town on the deck, at ${b.s.toFixed(1)}`);
  }
  assert.equal(boxes.filter((b) => b.kind === BOX.lock).length, 2, 'a lock gate where the canal meets each bulkhead');
  assert.equal(surfaceAt(DECK_MID, 0), 'flightdeck');
  assert.equal(surfaceAt(DECK_MID + DECK_LEN + 10, 37), 'bulkhead');
  assert.match(floorPlace(DECK_MID - SEALED - 6, 37), /6 m from the flight deck's bulkhead$/);
});

test('the sky is drawn only where it can be seen: from the floor, out over the rim walls', () => {
  const eye = [0, 37, RF - 1.7], level = viewAxes(0, 0, 0);
  const down = viewAxes(0, 0, -1.2), up = viewAxes(0, Math.PI / 2, 1.2);
  const axes = (a) => ({ fwd: a.fwd, up: a.up, right: a.right });
  assert.equal(skyWindow(eye, axes(down), 60, 16 / 9), null, 'looking down at the floor: no sky');
  const high = skyWindow(eye, axes(up), 60, 16 / 9);
  assert.ok(high && high.y1 - high.y0 > 0.3, 'looking up toward the +c wall\'s top: sky');
  const ahead = skyWindow(eye, axes(level), 60, 16 / 9);
  assert.ok(!ahead || ahead.y0 > 0.4, 'looking along the floor, the sky only in the top of the picture');
  // a ray the window leaves out does not get out: every grid ray between its cells, traced, is blocked
  const fine = 64, ty = Math.tan(Math.PI / 6), tx = ty * 16 / 9;
  for (const a of [level, up, viewAxes(0.3, 0.4, 0.6)]) {
    const win = skyWindow(eye, axes(a), 60, 16 / 9);
    for (let i = 0; i <= fine; i++) {
      for (let j = 0; j <= fine; j++) {
        const x = i / fine, y = j / fine;
        if (win && x >= win.x0 && x <= win.x1 && y >= win.y0 && y <= win.y1) continue;
        const d = [0, 1, 2].map((k) => a.fwd[k] + a.right[k] * (2 * x - 1) * tx + a.up[k] * (2 * y - 1) * ty);
        const n = Math.hypot(...d);
        assert.equal(sunReach(eye, d.map((v) => v / n)), 0, `sky left out at ${x.toFixed(2)}, ${y.toFixed(2)}`);
      }
    }
  }
});

test('every graphics tier asks the walk for something, and no more of it at a lower tier', () => {
  assert.deepEqual(Object.keys(WALK_TIERS).sort(), [...TIERS].sort());
  for (let i = 1; i < TIERS.length; i++) {
    const lo = WALK_TIERS[TIERS[i - 1]], hi = WALK_TIERS[TIERS[i]];
    assert.ok(hi.detail >= lo.detail && hi.smallFar >= lo.smallFar, `${TIERS[i]} draws no less than ${TIERS[i - 1]}`);
    assert.equal(SETTINGS[TIERS[i]].name, TIERS[i]);
  }
  assert.equal(WALK_TIERS.low.detail, 0, 'low: the cheaper shading');
});

test('the ring\'s shape the walk is drawn in is the core\'s', () => {
  near(RIM_R, RING.rim, 0, 'the rim walls');
  near((W * W * RF) / 9.80665, 1, 0.005, 'one g at the floor, to half a per cent');
});
