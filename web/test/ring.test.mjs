// The Ring's plan: its shape is RING's, its port face is left clear for docking, its spokes run where
// the core says, its town stands on its floor, and a dearer tier draws more of it. GPLv3.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HUB_PORT_M } from '../src/core.js';
import { SETTINGS, TIERS } from '../src/quality.js';
import {
  CANAL, COLLAR, FOOT, HALF, INNER, MAST, PORT_CLEAR, QUAY, RADIATORS, RING, SQUARE, SQUARES, TILE, lights, radiators, spokeAngle,
  structure, town,
} from '../src/ring-plan.js';

const radius = (p) => Math.hypot(p[0], p[2]);
const all = (st) => Object.values(st).flat();

test('every member stands within the Ring\'s own shape', () => {
  for (const t of TIERS) {
    const st = structure(SETTINGS[t].ring);
    for (const m of all(st)) {
      for (const p of [m.a, m.b]) {
        const r = radius(p), y = p[1];
        const inBand = r >= RING.rim - 60 && r <= RING.hull + 10 && Math.abs(y) <= HALF + 12;
        const inSpokes = r >= RING.hub - 1 && r <= RING.rim + 1 && Math.abs(y) <= RING.spoke;
        const inHub = r <= COLLAR.r + 45 && y >= -HUB_PORT_M && y <= HUB_PORT_M;
        assert.ok(inBand || inSpokes || inHub, `${t}: a member's end at r ${r.toFixed(0)} m, y ${y.toFixed(0)} m`);
      }
    }
  }
});

test('the port\'s face is left clear for docking\'s markings', () => {
  const front = (p) => p[1] < -HUB_PORT_M + 5 && radius(p) < PORT_CLEAR + 8;
  for (const t of TIERS) {
    for (const m of all(structure(SETTINGS[t].ring))) assert.ok(!front(m.a) && !front(m.b), `${t}: a member before the port`);
    const L = lights(SETTINGS[t].ring);
    for (const l of L.spin) assert.ok(!front(l.p), `${t}: a light on the port's face at r ${radius(l.p).toFixed(1)} m`);
  }
  for (const r of radiators()) assert.ok(r.y0 > 0 && r.r0 > RING.hub, 'the radiators stand on the far side of the collar');
  assert.ok(MAST.y0 >= HUB_PORT_M, 'and the arrays\' mast on the far face');
});

test('each spoke runs from the collar to the rim, where core.js puts it', () => {
  for (const t of TIERS) {
    const st = structure(SETTINGS[t].ring);
    for (let k = 0; k < RING.spokes; k++) {
      const a = spokeAngle(k), dir = [Math.sin(a), 0, Math.cos(a)];
      const along = (p) => p[0] * dir[0] + p[2] * dir[2];
      const across = (p) => Math.abs(p[0] * dir[2] - p[2] * dir[0]);
      const mine = st.spokes.filter((m) => across(m.a) <= RING.spoke && across(m.b) <= RING.spoke && along(m.a) > 0 && along(m.b) > 0);
      const reach = mine.flatMap((m) => [along(m.a), along(m.b)]);
      assert.ok(mine.length > 0, `${t}: spoke ${k} is drawn`);
      assert.ok(Math.abs(Math.min(...reach) - COLLAR.r) < 1 && Math.abs(Math.max(...reach) - RING.rim) < 1, `${t}: spoke ${k} reaches ${Math.min(...reach).toFixed(0)} to ${Math.max(...reach).toFixed(0)} m`);
    }
  }
});

test('the lights are where the tier asks, every one on the Ring', () => {
  for (const t of TIERS) {
    const q = SETTINGS[t].ring, L = lights(q);
    assert.ok(L.spin.length >= 2 * q.lightRings * q.lights, `${t}: ${L.spin.length} lights`);
    for (const l of L.spin) {
      const r = radius(l.p);
      assert.ok(r <= RING.hull + 10 && Math.abs(l.p[1]) <= HALF + 10, `${t}: a light at r ${r.toFixed(0)}, y ${l.p[1].toFixed(0)}`);
      assert.ok(l.c.every((v) => v >= 0) && l.size > 0, 'with a colour and a size');
    }
    const red = L.spin.filter((l) => l.p[1] < -HALF && l.c[0] > 3 * l.c[1]).length, green = L.spin.filter((l) => l.p[1] > HALF && l.c[1] > 3 * l.c[0]).length;
    assert.ok(red > 0 && red === green, `${t}: the port side's rims red (${red}), the far side's green (${green})`);
    for (const l of L.still) assert.ok(l.p[1] > MAST.y0 && l.p[1] <= MAST.y1 + 10, 'the mast\'s lights on the mast');
  }
});

test('a dearer tier draws more', () => {
  const count = (t) => all(structure(SETTINGS[t].ring)).length;
  const counts = TIERS.map(count);
  assert.ok(counts[0] < counts[1] && counts[1] < counts[2], `members ${counts.join(', ')}`);
  const lit = TIERS.map((t) => lights(SETTINGS[t].ring).spin.length);
  assert.ok(lit[0] < lit[1] && lit[1] < lit[2], `lights ${lit.join(', ')}`);
});

test('the town stands on the floor, off the canal and the squares, no two buildings in one place', () => {
  const { buildings, blocks } = town();
  assert.ok(buildings.length > 400 && blocks.length > buildings.length / 4, `${buildings.length} buildings in ${blocks.length} blocks`);
  for (const b of buildings) {
    assert.ok(b.u0 >= 0 && b.u1 <= TILE && b.u1 > b.u0 && b.v1 > b.v0, 'inside one repeat');
    const near = Math.min(Math.abs(b.v0), Math.abs(b.v1)), far = Math.max(Math.abs(b.v0), Math.abs(b.v1));
    assert.ok(near >= QUAY && far <= FOOT && Math.sign(b.v0) === Math.sign(b.v1), `between the quay and the wall's foot: ${b.v0.toFixed(0)} to ${b.v1.toFixed(0)}`);
    for (const s of [...SQUARES, TILE]) assert.ok(b.u1 <= s - SQUARE + 1 || b.u0 >= s + SQUARE - 1 || s === TILE && b.u1 <= TILE - SQUARE + 1, `clear of the square at ${s.toFixed(0)}`);
    assert.ok(b.h >= 8 && b.h <= 90, `${b.h.toFixed(0)} m tall`);
  }
  const sorted = [...buildings].sort((a, b) => a.u0 - b.u0);
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length && sorted[j].u0 < sorted[i].u1; j++) {
      const a = sorted[i], b = sorted[j];
      assert.ok(a.v1 <= b.v0 || b.v1 <= a.v0, 'two buildings overlap');
    }
  }
  assert.ok(CANAL < QUAY && FOOT < INNER, 'the canal inside its quays, the town inside the walls');
  assert.deepEqual(town(), town(), 'the same town every time');
});

test('the radiators and the solar mast keep to the hub', () => {
  for (const r of radiators()) assert.ok(r.r1 === RADIATORS.r1 && r.r1 < RING.rim / 4 && r.y1 <= HUB_PORT_M, 'the radiators on the hub');
  assert.ok(MAST.y1 - MAST.y0 > 300, 'the mast long enough to hold the arrays clear');
});

test('the flight deck: open between spokes 0 and 1, sealed by its bulkheads, the town clear of it', async () => {
  const { DECK, DECK_A, DECK_HALF, DECK_WALL, bulkheads, onDeck, standing, fromDeck } = await import('../src/ring-plan.js');
  assert.ok(Math.abs(DECK_A - (spokeAngle(0) + spokeAngle(1)) / 2) < 1e-9, 'midway between spokes 0 and 1');
  assert.ok(Math.abs(DECK_HALF * RING.floor * 2 - DECK.arc) < 1e-6, `${DECK.arc} m of floor`);
  for (let k = 0; k < RING.spokes; k++) assert.ok(!onDeck(spokeAngle(k)), `spoke ${k} clear of it`);
  const [a, b] = bulkheads();
  for (const w of [a, b]) {
    assert.ok(Math.abs(Math.abs(fromDeck(w.face)) - DECK_HALF) < 1e-9, 'each faces the deck at its end');
    assert.ok(Math.abs(Math.abs(fromDeck(w.a)) - (DECK_HALF + DECK_WALL / 2)) < 1e-9, `${DECK.bulkhead} m thick, outside it`);
    assert.ok(w.r1 === RING.floor && w.r0 <= RING.roof && w.y >= INNER, 'from the floor to the roof, wall to wall');
  }
  for (const s of standing()) for (const u of [s.u0, s.u1]) assert.ok(!onDeck(u / RING.floor), 'no building on the deck or its bulkheads');
  assert.ok(standing().length > 3 * town().buildings.length, 'the rest of the town stands');
  // the deck's floor along its centreline, where the pads go, carries none of this module's lights
  for (const t of TIERS) {
    for (const l of lights(SETTINGS[t].ring).spin) {
      const off = Math.abs(fromDeck(Math.atan2(l.p[0], l.p[2]))) * RING.floor;
      if (off < DECK.arc / 2 - 10 && radius(l.p) > RING.floor - 20) assert.ok(Math.abs(l.p[1]) > DECK.padRadius + 60, `a light at y ${l.p[1].toFixed(0)} on the deck`);
    }
  }
});
