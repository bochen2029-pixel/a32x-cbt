// The spaceplane's shape: its size, its wheels where the core's contact points are and lowest of all,
// its skin wound outward, its lights on the right sides, and its plume as the air says. GPLv3.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BELL, BELLY, ENGINES, FIN, GEAR, GROUND, LENGTH, NOSE, SPAN, TAIL, finRoot, halfSpan, loft, navLights, plume, section, surfaces,
  thrusterQuads,
} from '../src/craft-shape.js';

test('34 m from the nose to the bells\' mouths, 18 m across', () => {
  assert.ok(Math.abs(LENGTH - 34) < 0.5, `${LENGTH} m`);
  const L = loft(48, 40);
  let zmax = 0, xmin = Infinity, xmax = -Infinity;
  for (let i = 0; i < L.positions.length; i += 3) {
    zmax = Math.max(zmax, Math.abs(L.positions[i + 2]));
    xmin = Math.min(xmin, L.positions[i]);
    xmax = Math.max(xmax, L.positions[i]);
  }
  assert.ok(Math.abs(2 * zmax - SPAN) < 0.1, `span ${(2 * zmax).toFixed(2)} m`);
  assert.equal(xmin, TAIL);
  assert.equal(xmax, NOSE);
});

test('the wheels touch where the core\'s contact points are, and nothing else reaches as low', () => {
  // orbit_core.cpp's contacts, body frame x forward, y right, z down: (10, 0, 3), (-3, -3.5, 3), (-3, 3.5, 3)
  const core = [[10, 0, 3], [-3, -3.5, 3], [-3, 3.5, 3]];
  assert.equal(GEAR.length, core.length);
  GEAR.forEach((g, i) => {
    assert.deepEqual([g.x, g.z, -GROUND], core[i]);
    assert.ok(surfaces(g.x, g.z).bottom > GROUND + 1.5, 'and the leg has room above the wheel');
  });
  const L = loft(64, 48);
  for (let i = 1; i < L.positions.length; i += 3) assert.ok(L.positions[i] > GROUND + 1.5, 'the belly clears the runway by a metre and a half');
  for (const e of ENGINES) assert.ok(e.y - BELL.exit > GROUND + 0.8, 'and so do the bells');
  assert.ok(finRoot() > BELLY, 'the fins stand on top');
});

test('the skin is closed at its edges and wound outward', () => {
  const L = loft(40, 32);
  const P = (k) => [L.positions[3 * k], L.positions[3 * k + 1], L.positions[3 * k + 2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  let up = 0, down = 0;
  for (let t = 0; t < L.indices.length; t += 3) {
    const [a, b, c] = [P(L.indices[t]), P(L.indices[t + 1]), P(L.indices[t + 2])];
    const n = cross(sub(b, a), sub(c, a));
    const onTop = L.top[L.indices[t]] && L.top[L.indices[t + 1]] && L.top[L.indices[t + 2]];
    const onBelly = !L.top[L.indices[t]] && !L.top[L.indices[t + 1]] && !L.top[L.indices[t + 2]];
    if (onTop && Math.abs(a[2]) < 1 && n[1] !== 0) up += n[1] > 0 ? 1 : -1;
    if (onBelly && Math.abs(a[2]) < 1 && n[1] !== 0) down += n[1] < 0 ? 1 : -1;
  }
  assert.ok(up > 0 && down > 0, `the top faces up (${up}), the belly down (${down})`);
  for (const x of [8, 0, -8, -15]) {
    const s = halfSpan(x), e = surfaces(x, s);
    assert.ok(Math.abs(e.top - e.bottom) < 1e-6, `closed at the leading edge at x ${x}`);
    const c = surfaces(x, 0);
    assert.ok(c.top - c.bottom > 2.2, `the fuselage ${(c.top - c.bottom).toFixed(2)} m deep at x ${x}`);
  }
  const s = section(0);
  assert.ok(s.w > 2 && s.top > 1 && s.bottom > 0.5, 'and its section as the first mock-up gave it');
});

test('red to the left, green to the right, white aft', () => {
  const [left, right, ...rest] = navLights();
  assert.ok(left.p[2] < -SPAN / 2 + 1 && left.c[0] > 5 * left.c[1], 'red on the left wingtip');
  assert.ok(right.p[2] > SPAN / 2 - 1 && right.c[1] > 5 * right.c[0], 'green on the right');
  assert.ok(rest.some((l) => l.blink && l.c[0] === l.c[1] && l.c[1] === l.c[2]), 'a white strobe');
  for (const t of thrusterQuads()) assert.ok(Math.abs(t.z) > 1 && Math.sign(t.z) === t.side, 'the small thrusters on the flanks');
  assert.ok(FIN.cant > 0.2, 'the fins canted out');
});

test('the plume: shock diamonds in the air, gone above it, a wider glow in vacuum', () => {
  const air = plume(1, 0), space = plume(1, 1), idle = plume(0, 0);
  assert.equal(air.diamonds, 1);
  assert.equal(space.diamonds, 0);
  assert.equal(idle.diamonds, 0);
  assert.ok(space.radius > 4 * air.radius && space.spacing > air.spacing, 'the exhaust opens out as the pressure round it falls');
  assert.ok(air.length > 30 && idle.length < air.length, `${air.length.toFixed(0)} m at full thrust`);
});
