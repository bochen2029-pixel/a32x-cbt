// The airport as data and as laid out: KDFW's runways where OurAirports puts them, paint and lights where
// the FAA's book does, the PAPI on the flight core's glide, and nothing built on a runway. GPLv3.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  airportFromRunway, COLOURS, FAA, findRunwayEnd, GLIDE, GROUND_CELL_M, layoutBuildings, layoutRunway, papiShowsWhite, ringArea,
  runwayExtent, runwayFrame, subdivide, toWorld, validateAirport,
} from '../src/airport-layout.js';
import { localMetres, origin } from '../src/scene-math.js';

const DEG = Math.PI / 180;
const FT = 0.3048;
const raw = JSON.parse(readFileSync(fileURLToPath(new URL('../data/kdfw.json', import.meta.url)), 'utf8'));
const kdfw = validateAirport(raw);
const runway = (id) => kdfw.runways.find((r) => r.ends.some((e) => e.id === id));

// The flight core's KDFW 17C (runway.cpp): its landing threshold, where the view's origin goes.
const at17C = origin(32.91569901, -97.02600098);

test('KDFW has seven runways and fourteen ends, and lands on 17C, 17L, 18R and 13R in south flow', () => {
  assert.equal(kdfw.runways.length, 7);
  assert.equal(kdfw.runways.flatMap((r) => r.ends).length, 14);
  assert.deepEqual([...kdfw.arrivals].sort(), ['13R', '17C', '17L', '18R']);
});

test('each runway is as long as its ends are apart, and points the way its ends do', () => {
  for (const r of kdfw.runways) {
    const [a, b] = r.ends;
    const o = origin(a.lat, a.lon);
    const p = localMetres(o, b.lat, b.lon);
    const apart = Math.hypot(p.east, p.north);
    assert.ok(Math.abs(apart - r.lengthM) / r.lengthM < 0.01, `${a.id}: ends ${apart.toFixed(0)} m apart, length ${r.lengthM.toFixed(0)} m`);
    const bearing = (Math.atan2(p.east, p.north) / DEG + 360) % 360;
    const off = Math.abs(((bearing - a.headingDeg + 540) % 360) - 180);
    assert.ok(off < 0.5, `${a.id}: heading ${a.headingDeg}, the other end bears ${bearing.toFixed(2)}`);
    assert.ok(Math.abs(((b.headingDeg - a.headingDeg + 360) % 360) - 180) < 0.5, `${a.id}/${b.id} are reciprocal`);
  }
});

test('a bad row is refused, by name, and nothing is drawn from it', () => {
  const copy = () => JSON.parse(JSON.stringify(raw));
  const broken = [
    [(a) => delete a.runways[2].ends[0].lat, /runways\[2\]\.ends\[0\]\.lat: not a number/],
    [(a) => (a.runways[0].ends[1].headingDeg = 400), /headingDeg: 400 is outside/],
    [(a) => (a.runways[1].ends[0].id = '17C'), /17C appears twice/],
    [(a) => a.arrivals.push('09'), /arrivals: 09 is no runway end here/],
    [(a) => (a.runways[3].ends[0].id = '17X'), /not a runway designator/],
    [(a) => (a.runways[4].lengthFt = 'long'), /runways\[4\]\.lengthFt: not a number/],
  ];
  for (const [spoil, message] of broken) {
    const a = copy();
    spoil(a);
    assert.throws(() => validateAirport(a), message);
  }
});

test('the flight at KDFW 17C finds KDFW, and the airport is laid around its threshold', () => {
  const found = findRunwayEnd([kdfw], at17C.lat, at17C.lon, 180.3);
  assert.equal(found.airport.icao, 'KDFW');
  assert.equal(found.end, '17C');
  const f = runwayFrame(at17C, runway('17C'));
  assert.ok(Math.hypot(f.x, f.z) < 0.01 && f.headingDeg === 180.3, '17C threshold at the origin');
  const far = toWorld(f, 0, 0, runwayExtent(runway('17C')).thresholds[1]);
  assert.ok(Math.abs(far.z - 13400 * FT) < 15 && Math.abs(far.x) < 25, `35C threshold ${far.z.toFixed(0)} m south`);
  assert.equal(findRunwayEnd([kdfw], 47.4822, 8.5361, 137), null, 'LSZH 14 is not at KDFW');
  assert.equal(findRunwayEnd([kdfw], at17C.lat, at17C.lon, 0.3), null, 'nor is a landing the wrong way on 17C');
});

test('a runway frame turns with its heading: before LSZH 14 is northwest, its right southwest', () => {
  const f = { x: 0, z: 0, headingDeg: 137 };
  const p = toWorld(f, 0, 0, 1000);  // 1 km before the threshold, up the approach
  assert.ok(Math.abs(p.x + 1000 * Math.sin(137 * DEG)) < 1e-9 && Math.abs(-p.z + 1000 * Math.cos(137 * DEG)) < 1e-9);
  assert.ok(p.x < 0 && p.z < 0, 'west and north of the threshold');
  const right = toWorld(f, 100, 0, 0);
  assert.ok(right.x < 0 && right.z > 0, 'right of a runway heading 137 is toward 227: southwest');
});

test('threshold stripes go by width: 16 on 17R, 200 ft wide; 12 on 17C, 150 ft', () => {
  const m = FAA.marking;
  const stripesAt = (id) => layoutRunway(runway(id), kdfw.arrivals).rects.filter((r) => r.kind === 'white' &&
    Math.abs(r.x1 - r.x0 - m.stripeWidth) < 1e-9 && Math.abs(r.z1 - r.z0 - m.stripeLength) < 1e-9 && r.z1 <= 0 && r.z0 > -60).length;
  assert.equal(stripesAt('17R'), 16);
  assert.equal(stripesAt('17C'), 12);
});

test('landing on 17C the centreline turns red and white at 3,000 ft to go and red at 1,000 ft', () => {
  const rw = runway('17C');
  const { end } = runwayExtent(rw);
  const centre = layoutRunway(rw, kdfw.arrivals).lights.filter((l) => l.x === 0.3);
  const seen = (lo, hi) => new Set(centre.filter((l) => l.z - end >= lo && l.z - end < hi).map((l) => l.colour.join()));
  assert.deepEqual([...seen(0, 300)], [COLOURS.red.join()], 'the last 1,000 ft: red');
  assert.deepEqual([...seen(320, 900)].sort(), [COLOURS.red.join(), COLOURS.white.join()].sort(), '3,000 to 1,000 ft: both');
  assert.deepEqual([...seen(930, 3500)], [COLOURS.white.join()], 'before: white');
  const edge = layoutRunway(rw, kdfw.arrivals).lights.filter((l) => Math.abs(l.x) === rw.widthM / 2 + 1.5);
  assert.ok(edge.filter((l) => l.z - end < 600).every((l) => l.colour === COLOURS.yellow), 'edge lights yellow over the last 2,000 ft');
});

test('approach lights and a PAPI on the arrival ends only: 17C has them, 17R has none', () => {
  const ahead = (id) => layoutRunway(runway(id), kdfw.arrivals).lights.filter((l) => l.z > 1);
  const als = ahead('17C');
  assert.ok(als.length > 150 && Math.max(...als.map((l) => l.z)) > 700, `${als.length} approach lights out to 2,400 ft`);
  assert.equal(ahead('17R').length, 0);
  assert.equal(layoutRunway(runway('17R'), kdfw.arrivals).papi.length, 0);
});

test('the PAPI stands left of 17C where the glide meets the runway, and reads the glide', () => {
  const rw = runway('17C');
  const lamps = layoutRunway(rw, kdfw.arrivals).papi;
  assert.equal(lamps.length, 8, 'four units, two lamps each');
  const touch = (GLIDE.tchFt * FT) / Math.tan(GLIDE.deg * DEG);
  assert.ok(lamps.every((l) => Math.abs(l.z + touch) < 1e-9 && l.x < -rw.widthM / 2), 'abeam the glide\'s touchdown, on the left');
  const f = runwayFrame(at17C, rw);
  const world = lamps.map((l) => ({ ...toWorld(f, l.x, l.y, l.z), angle: l.angle, unit: l.unit }));
  const eyeAt = (deg) => {  // 2 km up the approach on the centreline, at deg above the glide's touchdown point
    const p = toWorld(f, 0, 0, 2000);
    return { x: p.x, z: p.z, y: (2000 + touch) * Math.tan(deg * DEG) };
  };
  const units = (deg) => [0, 1, 2, 3].map((u) => world.filter((l) => l.unit === u).every((l) => papiShowsWhite(eyeAt(deg), l)));
  assert.deepEqual(units(3.0), [false, false, true, true], 'on the glide: red inside, white outside');
  assert.deepEqual(units(2.2), [false, false, false, false], 'low: all red');
  assert.deepEqual(units(3.8), [true, true, true, true], 'high: all white');
});

test('the terminals and towers stand where the FAA airport diagram draws them: A, C, E east, B, D west', () => {
  const b = layoutBuildings(kdfw, at17C);
  assert.deepEqual(b.terminals.map((t) => t.name), ['A', 'B', 'C', 'D', 'E']);
  assert.deepEqual(b.towers.map((t) => t.name), ['East', 'Center', 'West']);
  const t = Object.fromEntries(b.terminals.map((x) => [x.name, x]));
  const xOf = (id) => runwayFrame(at17C, runway(id)).x;  // a north-south runway's line, east is +x
  for (const x of b.terminals) {
    assert.ok(x.centre[0] < xOf('17R') && x.centre[0] > xOf('18L'), `${x.name} between 17R and 18L`);
    const area = ringArea(x.points);
    assert.ok(area > 40000 && area < 90000, `${x.name}: a footprint of ${area.toFixed(0)} m2`);
  }
  const spineX = (b.spine.x0 + b.spine.x1) / 2;
  for (const n of ['A', 'C', 'E']) assert.ok(t[n].centre[0] > spineX, `${n} east of the spine`);
  for (const n of ['B', 'D']) assert.ok(t[n].centre[0] < spineX, `${n} west of it`);
  assert.ok(t.A.centre[1] < t.C.centre[1] && t.C.centre[1] < t.E.centre[1], 'A, C, E from north to south');
  assert.ok(t.B.centre[1] < t.D.centre[1], 'B north of D');
  const tw = Object.fromEntries(b.towers.map((x) => [x.name, x]));
  assert.ok(tw.West.x < xOf('18R') && tw.East.x > xOf('17C') && tw.East.x < xOf('17L'), 'the West tower beyond 18R, the East between 17C and 17L');
  assert.ok(Math.abs(tw.Center.x - spineX) < 120, 'the Center tower on the spine');
  assert.throws(() => validateAirport({ ...raw, terminals: [{ name: 'X', heightM: 10, outline: [[32.9, -97.04], [32.91, -97.04]] }] }),
                /terminals\[0\]\.outline: a footprint takes three points or more/);
});

test('nothing is built within 60 m of a runway or its parallel taxiway', () => {
  const b = layoutBuildings(kdfw, at17C);
  const things = [...b.terminals.flatMap((x) => x.points.map(([px, pz]) => ({ x: px, z: pz, what: `terminal ${x.name}` }))),
                  ...b.towers.map((x) => ({ x: x.x, z: x.z, what: `the ${x.name} tower` }))];
  for (const rw of kdfw.runways) {
    const f = runwayFrame(at17C, rw), { start, end, half } = runwayExtent(rw);
    const side = kdfw.taxiwaySide[rw.ends[0].id] || 1;
    const h = f.headingDeg * DEG;
    for (const p of things) {
      const dx = p.x - f.x, dz = p.z - f.z;
      const lx = dx * Math.cos(h) + dz * Math.sin(h), lz = -dx * Math.sin(h) + dz * Math.cos(h);  // in the runway's frame
      const alongOut = Math.max(0, lz - start, end - lz);
      for (const [cx, w, which] of [[0, half, ''], [side * FAA.taxiway.offset, FAA.taxiway.width / 2, '\'s taxiway']]) {
        const gap = Math.hypot(Math.max(0, Math.abs(lx - cx) - w), alongOut);
        assert.ok(gap > 60, `${p.what} is ${gap.toFixed(0)} m from ${rw.ends[0].id}${which}`);
      }
    }
  }
});

test('a runway no airport file holds becomes an airport of one: LSZH 14 from the flight core', () => {
  const a = airportFromRunway({ lat: 47.482085, lon: 8.536049, headingDeg: 137, lengthM: 3150, widthM: 60, displacedM: 150 });
  assert.deepEqual(a.runways[0].ends.map((e) => e.id), ['14', '32']);
  assert.deepEqual([...a.arrivals], ['14']);
  const f = runwayFrame(origin(47.482085, 8.536049), a.runways[0]);
  assert.ok(Math.hypot(f.x, f.z) < 0.05, 'its landing threshold at the origin');
  assert.ok(Math.abs(runwayExtent(a.runways[0]).start - 150) < 1e-6, 'its displaced 150 m before it');
});

test('the ground is cut into pieces no longer than 150 m, so a curved earth bends it: a ramp-sized sliver', () => {
  // a triangle 2.3 km long and 40 m wide at its widest, as an earcut ramp gives, on the ground at y = 0.4
  const t = [0, 0.4, 0, 2300, 0.4, -40, 1100, 0.4, 25];
  const out = subdivide(t);
  const area = (p, i) => {  // signed, by the y component of the normal: + turns one way, - the other
    const ux = p[i + 3] - p[i], uz = p[i + 5] - p[i + 2], vx = p[i + 6] - p[i], vz = p[i + 8] - p[i + 2];
    return (uz * vx - ux * vz) / 2;
  };
  let total = 0, longest = 0;
  for (let i = 0; i < out.length; i += 9) {
    for (const [a, b] of [[0, 3], [3, 6], [6, 0]]) {
      longest = Math.max(longest, Math.hypot(out[i + a] - out[i + b], out[i + a + 2] - out[i + b + 2]));
    }
    assert.ok(Math.sign(area(out, i)) === Math.sign(area(t, 0)), 'each piece turns the way the triangle did');
    assert.ok([1, 4, 7].every((k) => Math.abs(out[i + k] - 0.4) < 1e-6), 'and stays on its plane');
    total += area(out, i);
  }
  assert.ok(longest <= GROUND_CELL_M, `no edge longer than ${GROUND_CELL_M} m: ${longest.toFixed(1)} m`);
  assert.ok(Math.abs(total - area(t, 0)) < 1, `the same area: ${total.toFixed(0)} and ${area(t, 0).toFixed(0)} m2`);
  assert.equal(subdivide([0, 0, 0, 100, 0, 0, 0, 0, 100]).length, 9, 'a triangle short enough is kept as it is');
});
