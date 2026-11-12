// The page's core: its readouts are the header's, and the module it loads flies the crew to the Ring.
// The module is the WebAssembly build's (flight/orbit/README.md); ORBIT_CORE names another. GPLv3.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUTO, Core, DT, HUB_PORT_M, OUT, PH, RING, STANDOFF_M } from '../src/core.js';

const here = dirname(fileURLToPath(import.meta.url));
const header = readFileSync(join(here, '..', '..', 'core', 'orbit_core.h'), 'utf8');
const built = resolve(process.env.ORBIT_CORE || join(here, '..', '..', 'build-wasm', 'orbit_core.js'));
const plainBuilt = join(dirname(built), 'orbit_core_plain.js');

test('the readouts are the header\'s, in its order', () => {
  const body = header.slice(header.indexOf('OC_T = 0'), header.indexOf('OC_COUNT')).replace(/\/\*[\s\S]*?\*\//g, '');
  const names = [...body.matchAll(/\b(OC_[A-Z_]+)\b/g)].map((m) => m[1]).filter((n, i, a) => a.indexOf(n) === i);
  const js = names.map((n) => n.slice(3).replace(/_DEG$/, '').toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase()));
  assert.deepEqual(js, OUT);
});

test('the page\'s constants are the header\'s', () => {
  const num = (name) => Number(header.match(new RegExp(`${name}\\s*=?\\s*([0-9.]+)`))[1]);
  assert.equal(num('OC_DT'), DT);
  assert.equal(num('OC_HUB_PORT_M'), HUB_PORT_M);
  assert.equal(num('OC_STANDOFF_M'), STANDOFF_M);
  assert.equal(num('OC_AUTO_APPROACH'), AUTO.approach);
  assert.equal(num('OC_PH_ORBIT'), PH.orbit);
});

for (const [name, path, factory] of [['WebAssembly', built, 'createOrbitCore'], ['plain JavaScript', plainBuilt, 'createOrbitCoreJs']]) {
  test(`the core as ${name} flies the crew to the Ring, and again the same`, { skip: !existsSync(path) && `no module at ${path}: build it first` }, async () => {
    const make = createRequire(import.meta.url)(path);
    assert.equal(typeof make, 'function', factory);
    const hashes = [];
    for (let run = 0; run < 2; run++) {
      const core = new Core(await make());
      let s = core.reset();
      while (s.phase !== PH.orbit && s.t < 1500 && !s.crashed) s = core.step(250);
      assert.equal(s.phase, PH.orbit, 'reached orbit');
      assert.ok(Math.abs(s.apo - 500000) < 5000 && Math.abs(s.peri - 500000) < 5000, `${s.apo} x ${s.peri}`);
      assert.ok(s.ringRange > 20000 && s.ringRange < 30000, `the Ring at ${s.ringRange} m`);
      hashes.push(core.hash());
    }
    assert.equal(hashes[0], hashes[1], 'the same flight twice');
  });
}

test('the ring\'s shape is the header\'s', () => {
  const def = (name) => Number(header.match(new RegExp(`#define ${name}\\s+([0-9.]+)`))[1]);
  assert.deepEqual(RING, {
    spin: def('OC_RING_SPIN'), floor: def('OC_RING_FLOOR_M'), width: def('OC_RING_WIDTH_M'), hull: def('OC_RING_HULL_M'),
    roof: def('OC_RING_ROOF_M'), rim: def('OC_RING_RIM_M'), spokes: def('OC_RING_SPOKES'), spoke: def('OC_RING_SPOKE_M'),
    hub: def('OC_HUB_RADIUS_M'), port: def('OC_HUB_PORT_M'),
    deck: {
      angle: def('OC_DECK_ANGLE_DEG'), arc: def('OC_DECK_ARC_M'), bulkhead: def('OC_DECK_BULKHEAD_M'), pads: def('OC_DECK_PADS'),
      padSpacing: def('OC_DECK_PAD_SPACING_M'), padRadius: def('OC_DECK_PAD_RADIUS_M'),
    },
  });
  // the deck's pads fit inside its open sector, clear of the bulkheads, and the sector clear of the spokes
  const d = RING.deck, half = d.arc / 2;
  assert.ok(((d.pads - 1) / 2) * d.padSpacing + d.padRadius < half - 100, 'the end pads 100 m clear of the bulkheads');
  const step = 360 / RING.spokes, spokeHalf = ((RING.spoke / 2) / RING.rim) * (180 / Math.PI);
  const sectorHalf = (half / RING.floor) * (180 / Math.PI);
  const nearest = Math.min(...Array.from({ length: RING.spokes + 1 }, (_, k) => Math.abs(d.angle - k * step)));
  assert.ok(nearest > sectorHalf + spokeHalf + 5, `the sector ${nearest.toFixed(1)} deg from a spoke`);
});
