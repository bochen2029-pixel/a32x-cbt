// The sky on the page (sky.js, sky-model.js, moon-face.js): the core's sky readouts by name, the date,
// and how the Moon is placed, turned and lit as seen from KDFW, held to JPL Horizons (DE441, queried
// 2026-11-12 for KDFW 17C's threshold, airless; the values copied here). Then the Moon's painted face
// against the Gazetteer's places, and the stars. The module is the WebAssembly build's
// (flight/orbit/README.md); ORBIT_CORE names another. GPLv3.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STARS } from '../data/stars.js';
import { Core } from '../src/core.js';
import { RE, cross, dot, inSight, length, scale, sub } from '../src/frames.js';
import { ALBEDO_SCALE, craterShape, paintMoon } from '../src/moon-face.js';
import {
  DEFAULT_EPOCH, MOON_PACK, SKY, STAR_PACK, azEl, bvOfClass, earthshine, epochOf, formatDate, grazingLight, moonAxes, moonCentre, moonMagnitude,
  moonSeen, onMoon, parseDate, phaseLaw, selenographic, starDir, starTint, sunClear,
} from '../src/sky-model.js';
import { CRATERS, NAMED, PLAINS } from '../data/moon.js';

const here = dirname(fileURLToPath(import.meta.url));
const header = readFileSync(join(here, '..', '..', 'core', 'orbit_sky.h'), 'utf8');
const built = resolve(process.env.ORBIT_CORE || join(here, '..', '..', 'build-wasm', 'orbit_core.js'));
const noCore = !existsSync(built) && `no module at ${built}: build it first`;
const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} against ${b} (within ${tol})`);
const unit = (v) => scale(v, 1 / length(v));
const KDFW = { lat: 32.91569901 };
const POLE = [0, Math.cos(KDFW.lat * D2R), Math.sin(KDFW.lat * D2R)];   // the Earth's axis in the site frame
const EYE = [0, 0, 0];   // the start point, on the core's sphere under Horizons' site (20 km from it on the real Earth: 0.003 deg)

async function skyAt(jd, steps = 0) {
  const core = new Core(await createRequire(import.meta.url)(built)());
  if (jd !== undefined) assert.equal(core.m._oc_sky_set_epoch(jd), 1, `the core took ${jd}`);
  core.reset();
  const k = core.addBlock('sky', '_oc_sky_out', '_oc_sky_out_len', SKY);
  if (steps) core.step(steps);
  return { core, k };
}

// The Moon seen from an eye: the phase angle there, the lit fraction, the point under the eye on the
// Moon's globe, and the position angle of its north pole from celestial north through east.
function moonFrom(k, eye) {
  const seen = moonSeen(k, eye, 8e7), a = moonAxes(k);
  const toEye = scale(seen.dir, -1);
  const toSun = unit(sub(scale([k.sunE, k.sunN, k.sunU], k.sunDist), scale([k.moonE, k.moonN, k.moonU], k.moonDist)));
  const alpha = Math.acos(dot(toEye, toSun)) * R2D;
  const sub0 = [dot(toEye, a.x), dot(toEye, a.y), dot(toEye, a.z)];
  const north = unit(sub(POLE, scale(seen.dir, dot(POLE, seen.dir)))), east = cross(north, seen.dir);
  return {
    seen, alpha, lit: (1 + Math.cos(alpha * D2R)) / 2,
    subLon: Math.atan2(sub0[1], sub0[0]) * R2D, subLat: Math.asin(sub0[2]) * R2D,
    pa: (Math.atan2(dot(a.z, east), dot(a.z, north)) * R2D + 360) % 360,
    north, east,
  };
}

test('the sky\'s readouts are orbit_sky.h\'s, in its order, and the default date is its', () => {
  const body = header.slice(header.indexOf('OC_SKY_JD = 0'), header.indexOf('OC_SKY_COUNT')).replace(/\/\*[\s\S]*?\*\//g, '');
  const names = [...body.matchAll(/\b(OC_SKY_[A-Z0-9_]+)\b/g)].map((m) => m[1]).filter((n, i, a) => a.indexOf(n) === i);
  const js = names.map((n) => n.slice(7).toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase()));
  assert.deepEqual(js, SKY);
  assert.equal(Number(header.match(/#define OC_SKY_DEFAULT_EPOCH\s+([0-9.]+)/)[1]), DEFAULT_EPOCH);
  assert.equal(formatDate(DEFAULT_EPOCH), '2026-11-12 19:00:00');
});

test('?date= is read as UTC, or in the zone written, and anything else stops the page with a reason', () => {
  near(parseDate('2026-12-24T03:00Z'), 2461398.625, 1e-9, 'Horizons\' JD of 2026-12-24 03:00 UTC');
  near(parseDate('2026-11-12T19:00:00'), DEFAULT_EPOCH, 1e-9, 'no zone: UTC');
  near(parseDate('2026-11-12 13:00-06:00'), DEFAULT_EPOCH, 1e-9, 'one in the afternoon in Dallas, CST');
  near(parseDate('2026-11-12T20:00+0100'), DEFAULT_EPOCH, 1e-9, 'a zone without a colon');
  near(parseDate('1969-07-20T20:17:40Z'), 2440423.345601852, 1e-9, 'the Eagle has landed');
  near(parseDate('2000-01-01T12:00:00.5Z') - 2451545.0, 0.5 / 86400, 1e-9, 'J2000.0 and half a second');
  near(parseDate('2024-04-08'), 2460408.5, 1e-9, 'a day alone is its midnight, UTC');
  for (const bad of ['', 'tomorrow', '2026-13-01', '2026-02-29', '2026-04-31T00:00Z', '2026-11-12T24:00Z', '2026-11-12T19:60Z', '12/11/2026', '2026-11-12T19:00+15:00']) {
    assert.equal(parseDate(bad), null, bad);
  }
  assert.equal(epochOf('?at=775'), null, 'no ?date=: the core\'s own');
  near(epochOf('?at=775&date=2026-12-24T03:00Z'), 2461398.625, 1e-9, 'with ?at=');
  near(epochOf('?date=2026-11-12T20:00+01:00'), DEFAULT_EPOCH, 1e-9, 'a zone\'s +, which a query reads as a space');
  assert.throws(() => epochOf('?date=soon'), /is not a date/);
  assert.throws(() => epochOf('?date=1850-01-01'), /outside 1900 to 2100/);
  assert.throws(() => epochOf('?date=2100-01-02'), /outside 1900 to 2100/);
  assert.equal(formatDate(parseDate('2026-12-24T03:00:59.6Z')), '2026-12-24 03:01:00', 'rounded to the second');
});

test('from KDFW at the default date, the Moon is placed, sized, lit and turned as Horizons has it', { skip: noCore }, async () => {
  // Horizons, KDFW 17C, 2026-11-12 19:00 UTC: Illu% 11.48064, S-T-O 140.3931, ObsSub-LON 0.791879, ObsSub-LAT 6.209537,
  // NP.ang 1.0379, Ang-diam 1779.866"; and at 20:00 UTC: 11.63187, 140.1220, 0.556859, 6.216518, 0.9032, 1781.711".
  const rows = [
    [0, 11.48064, 140.3931, 0.791879, 6.209537, 1.0379, 1779.866],
    [3600, 11.63187, 140.122, 0.556859, 6.216518, 0.9032, 1781.711],
  ];
  const { core, k } = await skyAt();
  for (const [t, illu, sto, lon, lat, pa, diam] of rows) {
    if (t) core.step(Math.round(t / 0.02));
    const m = moonFrom(k, EYE);
    near(m.lit * 100, illu, 0.06, `${t} s: lit %`);
    near(m.alpha, sto, 0.02, `${t} s: phase angle, deg`);
    near(m.subLon, lon, 0.06, `${t} s: the eye over the Moon's longitude (no physical libration here: 0.04 deg)`);
    near(m.subLat, lat, 0.06, `${t} s: and latitude`);
    near(m.pa, pa, 0.06, `${t} s: the Moon's north pole, deg east of celestial north`);
    near(2 * m.seen.radius * R2D * 3600, diam, 1.5, `${t} s: the Moon's width, arcsec`);
    near(m.seen.drawRadius / 8e7, Math.tan(m.seen.radius), 1e-6, `${t} s: drawn nearer, as wide`);
  }
});

test('the Moon\'s near side faces the Earth, its north is up the sky\'s north, and the crescent is the side toward the Sun', { skip: noCore }, async () => {
  const { k } = await skyAt();
  const a = moonAxes(k), toEarth = scale([k.moonE, k.moonN, k.moonU], -1);
  assert.ok(Math.acos(dot(a.x, toEarth)) * R2D < 8.5, 'the middle of the near side within libration of the way to the Earth');
  near(length(cross(a.x, a.y)), 1, 1e-9, 'square');
  near(dot(cross(a.x, a.y), a.z), 1, 1e-9, 'right-handed: east is north x the near side');
  const m = moonFrom(k, EYE);
  // Mare Crisium (16.2 N 59.1 E) on the Moon's east: from the north of the Earth, with the Moon's north up, on the right,
  // which is the sky's west, toward the Sun; and in sunlight 3.6 days after new Moon. Grimaldi, on the west limb, is in the dark.
  const centre = m.seen.dir, offset = (lat, lon) => sub(onMoon(k, lat, lon), scale(centre, dot(onMoon(k, lat, lon), centre)));
  const crisium = offset(16.2, 59.1), grimaldi = offset(-5.4, -68.4);
  assert.ok(dot(crisium, m.east) < -0.5, `Crisium toward the sky's west: ${dot(crisium, m.east)}`);
  assert.ok(dot(grimaldi, m.east) > 0.5, `Grimaldi toward the sky's east: ${dot(grimaldi, m.east)}`);
  const toSun = unit(sub(scale([k.sunE, k.sunN, k.sunU], k.sunDist), scale([k.moonE, k.moonN, k.moonU], k.moonDist)));
  assert.ok(dot(onMoon(k, 16.2, 59.1), toSun) > 0.05, 'Crisium in sunlight');
  assert.ok(dot(onMoon(k, -5.4, -68.4), toSun) < -0.5, 'Grimaldi in the night');
  assert.ok(dot(onMoon(k, 34.7, -14.9), toSun) < 0, 'Imbrium in the night');
  // the Sun stands over the Moon's 141st meridian east, and never more than the Moon's 1.54 deg tilt from its equator
  const ss = [dot(toSun, a.x), dot(toSun, a.y), dot(toSun, a.z)];
  near(Math.atan2(ss[1], ss[0]) * R2D, 141, 2, 'the subsolar longitude, deg E');
  assert.ok(Math.abs(Math.asin(ss[2]) * R2D) < 1.6, `the subsolar latitude ${Math.asin(ss[2]) * R2D}`);
});

test('over a month the Sun stays within the Moon\'s tilt of its equator, and the near side keeps to the Earth', { skip: noCore }, async () => {
  for (let day = 0; day < 30; day += 1.5) {
    const { k } = await skyAt(DEFAULT_EPOCH + day);
    const a = moonAxes(k), toSun = unit(sub(scale([k.sunE, k.sunN, k.sunU], k.sunDist), scale([k.moonE, k.moonN, k.moonU], k.moonDist)));
    assert.ok(Math.abs(Math.asin(dot(toSun, a.z)) * R2D) < 1.6, `day ${day}: the Sun ${Math.asin(dot(toSun, a.z)) * R2D} deg from the Moon's equator`);
    const lib = Math.acos(dot(a.x, scale([k.moonE, k.moonN, k.moonU], -1))) * R2D;
    assert.ok(lib < 10.5, `day ${day}: libration ${lib} deg`);
  }
});

test('the full Moon of 24 December over Dallas, as Horizons has it from KDFW', { skip: noCore }, async () => {
  // 2026-12-24 03:00 UTC: Illu% 99.88259, S-T-O 3.9296, ObsSub-LON 0.379, ObsSub-LAT -4.745496, NP.ang 0.7578, Ang-diam 2034.520"
  const { k } = await skyAt(parseDate('2026-12-24T03:00Z'));
  const m = moonFrom(k, EYE);
  near(m.lit * 100, 99.88259, 0.03, 'lit %');
  near(m.alpha, 3.9296, 0.03, 'phase angle');
  near(m.subLon, 0.379, 0.06, 'the eye over longitude');
  near(m.subLat, -4.745496, 0.06, 'and latitude');
  near(((m.pa + 180) % 360) - 180, 0.7578, 0.06, 'north pole position angle');
  near(2 * m.seen.radius * R2D * 3600, 2034.52, 1.5, 'width, arcsec');
  const at = azEl(m.seen.dir, [0, 0, 1], POLE);
  near(at.az, 82.522292, 0.015, 'azimuth');
  near(at.el, 43.542506, 0.015, 'elevation');
});

test('from orbit the Earth hides the Moon, and the Sun, when it stands between', { skip: noCore }, async () => {
  const { core, k } = await skyAt();
  const at = (t) => { core.step(Math.round((t - core.s.t) / 0.02)); return [core.s.siteE, core.s.siteN, core.s.siteU]; };
  // seen from the crew's orbit the Moon sets behind the Earth near 3242 s into the flight, the Sun near 2203 s
  const sun = () => [k.sunE, k.sunN, k.sunU];
  assert.equal(sunClear(at(2150), sun(), k.sunDist).clear, 1, 'the Sun clear at 2150 s');
  // part of its disc clears the limb as it sets: a moment where it is half cut
  let half = null;
  for (let t = 2190; t < 2215 && half === null; t += 0.2) {
    const c = sunClear(at(t), sun(), k.sunDist).clear;
    if (c > 0.3 && c < 0.7) half = t;
  }
  assert.ok(half !== null, 'the Sun half set, between 2190 and 2215 s');
  assert.equal(sunClear(at(2260), sun(), k.sunDist).clear, 0, 'the Sun behind the Earth at 2260 s');
  assert.ok(inSight(at(3200), moonCentre(k), 0), 'the Moon in sight at 3200 s');
  assert.ok(!inSight(at(3300), moonCentre(k), 0), 'the Moon behind the Earth at 3300 s');
});

test('the Sun\'s light through the air: little lost from orbit, most of the blue lost along the horizon', () => {
  const high = grazingLight(80000), low = grazingLight(0), mid = grazingLight(15000);
  assert.ok(high.every((c) => c > 0.99), `${high}`);
  assert.ok(low[2] < 1e-6 && low[0] > low[2], `${low}`);
  assert.ok(mid[0] > mid[1] && mid[1] > mid[2], `reddened: ${mid}`);
  const overhead = sunClear([0, 0, 2], [0, 0, 1]);
  assert.equal(overhead.clear, 1);
  near(overhead.height, 2, 1e-6, 'the light comes straight down to the eye');
  assert.equal(sunClear([0, 0, 2], [0, 0, -1]).clear, 0, 'the Sun under the ground');
});

test('the Moon\'s light with its phase: Lommel and Seeliger\'s disc, and the real Moon\'s steeper fall', () => {
  near(phaseLaw(0), 1, 1e-6, 'full');
  near(moonMagnitude(90 * D2R), 2.34 + 0.2624, 1e-3, 'at quarter, 2.6 magnitudes under full');
  let last = 2;
  for (let a = 0; a <= 170; a += 10) {
    const g = phaseLaw(a * D2R);
    assert.ok(g <= last + 1e-9 && g > 0, `${a} deg: ${g}`);
    last = g;
  }
  assert.ok(phaseLaw(140 * D2R) < 0.2, 'a crescent much fainter than the law alone would light it');
  near(earthshine({ moonDist: 384400e3, moonPhase: Math.PI }), 0.3 * (6371 / 384400) ** 2, 1e-9, 'a new Moon under a full Earth');
  assert.equal(earthshine({ moonDist: 384400e3, moonPhase: 0 }), 0, 'a full Moon under a new Earth');
});

test('the Moon\'s face: the maria dark where the Gazetteer puts them, the highlands bright, the young craters brighter still', () => {
  const t0 = performance.now();
  const f = paintMoon(512);
  const ms = performance.now() - t0;
  assert.equal(f.width, 512);
  assert.equal(f.albedo.length, 512 * 256 * 4);
  assert.equal(f.relief.length, 512 * 256 * 4);
  for (const [name, lat, lon] of [['Mare Crisium', 16.2, 59.1], ['Mare Tranquillitatis', 8.4, 30.8], ['Mare Serenitatis', 27.3, 18.4],
    ['Mare Imbrium', 34.7, -14.9], ['Mare Nubium', -20.6, -17.3], ['Mare Fecunditatis', -7.8, 53.7], ['Mare Humorum', -24.5, -38.6],
    ['Mare Nectaris', -15.2, 34.6], ['Oceanus Procellarum', 20, -57], ['Mare Frigoris', 57, 0]]) {
    assert.ok(f.albedoAt(lat, lon) < 0.12, `${name}: ${f.albedoAt(lat, lon)}`);
  }
  for (const [name, lat, lon] of [['south of Sinus Medii', -25, 5], ['round Maginus', -50, -6], ['between Nectaris and the limb', -30, 50], ['the far side', 0, 180]]) {
    assert.ok(f.albedoAt(lat, lon) > 0.14, `${name}: ${f.albedoAt(lat, lon)}`);
  }
  assert.ok(f.albedoAt(...NAMED.Aristarchus) > 0.2, 'Aristarchus, the brightest spot');
  assert.ok(f.albedoAt(...NAMED.Tycho) > 0.17 && f.albedoAt(...NAMED.Copernicus) > 0.15, 'Tycho and Copernicus');
  assert.ok(f.albedoAt(...NAMED.Plato) < 0.1 && f.albedoAt(...NAMED.Grimaldi) < 0.1, 'Plato\'s and Grimaldi\'s dark floors');
  // the map: dark plains cover about a sixth of the whole globe and a third of the near side
  let dark = 0, nearDark = 0, nearAll = 0;
  for (let y = 0; y < 256; y++) {
    const lat = 90 - ((y + 0.5) / 256) * 180, wgt = Math.cos(lat * D2R);
    for (let x = 0; x < 512; x++) {
      const lon = ((x + 0.5) / 512) * 360 - 180, a = (f.albedo[(y * 512 + x) * 4 + 1] / 255) * ALBEDO_SCALE;
      const v = selenographic(lat, lon)[0];
      if (a < 0.12) dark += wgt;
      if (v > 0) { nearAll += wgt * v; if (a < 0.12) nearDark += wgt * v; }
    }
  }
  const total = (512 * 256 * 2) / Math.PI;
  assert.ok(dark / total > 0.12 && dark / total < 0.22, `the maria cover ${((dark / total) * 100).toFixed(1)}% of the globe`);
  assert.ok(nearDark / nearAll > 0.25 && nearDark / nearAll < 0.45, `and ${((nearDark / nearAll) * 100).toFixed(1)}% of the near side's disc`);
  // the relief: craters are bowls with rims, as deep as Pike measured
  const h = (lat, lon) => f.heights[Math.floor(((90 - lat) / 180) * 256) * 512 + Math.floor(((lon + 180) / 360) * 512)];
  assert.ok(h(...NAMED.Tycho) < -2, `Tycho's floor ${h(...NAMED.Tycho)} km`);
  near(craterShape(85).depth, 1.044 * 85 ** 0.301, 1e-9, 'a complex crater');
  near(craterShape(10).depth, 1.96 * 1.0233, 0.01, 'a simple one: a fifth of its width');
  assert.ok(ms < 3000, `painted in ${ms.toFixed(0)} ms`);
});

test('the Moon\'s face is painted the same every time', () => {
  const a = paintMoon(256), b = paintMoon(256);
  assert.deepEqual(a.albedo, b.albedo);
  assert.deepEqual(a.relief, b.relief);
});

test('the Moon\'s data: the Gazetteer\'s plains and craters, unpacked', () => {
  const plains = MOON_PACK.plains(PLAINS), craters = MOON_PACK.craters(CRATERS);
  assert.equal(plains.length, 44);
  assert.ok(craters.length / 3 > 4000, `${craters.length / 3} craters`);
  const imbrium = plains.find((p) => p.name === 'Mare Imbrium');
  const xs = imbrium.rings.flat().map((p) => p[0]), ys = imbrium.rings.flat().map((p) => p[1]);
  near(Math.min(...ys), 15.23, 0.3, 'Imbrium\'s south edge');
  near(Math.max(...ys), 51.46, 0.3, 'its north');
  near(Math.min(...xs), -38.36, 0.3, 'its west');
  near(Math.max(...xs), 8.56, 0.3, 'its east');
  assert.deepEqual(NAMED.Tycho, [-43.3, -11.22, 85.3]);
  assert.deepEqual(NAMED.Copernicus, [9.62, -20.08, 96.1]);
  for (let i = 3; i < craters.length; i += 3) assert.ok(craters[i + 2] <= craters[i - 1], 'largest first');
});

test('the stars: Wikidata\'s to V 6.5, the brightest where they are, coloured by class', () => {
  const s = STAR_PACK.unpack(STARS);
  assert.ok(s.count > 8000 && s.count < 9500, `${s.count} stars`);
  near(s.ra[0] * R2D, 101.287, 0.01, 'Sirius first, its right ascension');
  near(s.dec[0] * R2D, -16.716, 0.01, 'and declination');
  near(s.v[0], -1.46, 0.05, 'and magnitude');
  for (let i = 1; i < s.count; i++) assert.ok(s.v[i] >= s.v[i - 1], 'brightest first');
  const find = (ra, dec) => { for (let i = 0; i < s.count; i++) if (Math.abs(s.ra[i] * R2D - ra) < 0.05 && Math.abs(s.dec[i] * R2D - dec) < 0.05) return i; return -1; };
  const betelgeuse = find(88.793, 7.407), rigel = find(78.634, -8.202), polaris = find(37.95, 89.264);
  assert.ok(betelgeuse >= 0 && rigel >= 0 && polaris >= 0, 'Betelgeuse, Rigel and Polaris are there');
  assert.ok(s.bv[betelgeuse] > 1.3 && s.bv[rigel] < 0.1, 'Betelgeuse red, Rigel blue-white');
  near(s.v[polaris], 2.0, 0.1, 'Polaris');
  const t = starTint(s.bv[betelgeuse]), u = starTint(s.bv[rigel]);
  assert.ok(t[0] > t[2] && u[2] > u[0], 'their tints');
  near(bvOfClass('G2V'), 0.63, 0.05, 'the Sun\'s class');
  assert.ok(bvOfClass('M1-M2Ia-Iab') > 1.4 && bvOfClass('B8Ia') < 0 && bvOfClass('') === 0.6, 'and others');
  // the counts climb about threefold a magnitude, as the sky's do
  const per = [0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < s.count; i++) if (s.v[i] >= 0 && s.v[i] < 7) per[Math.floor(s.v[i])]++;
  for (let m = 2; m < 5; m++) assert.ok(per[m + 1] > 2 * per[m] && per[m + 1] < 5 * per[m], `V ${m}: ${per[m]}, V ${m + 1}: ${per[m + 1]}`);
});

test('the stars turn with the sky: Polaris over the north point, Sirius below the horizon at one in the afternoon in November', { skip: noCore }, async () => {
  const { k } = await skyAt();
  const polaris = azEl(starDir(k, 37.954 * D2R, 89.264 * D2R), [0, 0, 1], POLE);
  near(polaris.el, KDFW.lat, 0.7, 'Polaris\'s elevation, the latitude');
  near(((polaris.az + 180) % 360) - 180, 0, 1.0, 'and its azimuth');
  // Sirius, from its J2000.0 place and Horizons' local sidereal time at KDFW (15.9930546 h), allowing 0.4 deg for 27
  // years of precession
  const ra = 101.287 * D2R, dec = -16.716 * D2R, ha = (15.9930546285 * 15) * D2R - ra, la = KDFW.lat * D2R;
  const el = Math.asin(Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(ha)) * R2D;
  near(azEl(starDir(k, ra, dec), [0, 0, 1], POLE).el, el, 0.4, 'Sirius\'s elevation');
  // half a sidereal day later the sky has turned half round the pole: a star at v is at 2 (v.p) p - v
  const before = starDir(k, ra, dec), later = (await skyAt(DEFAULT_EPOCH + 86164.0905 / 2 / 86400)).k;
  const turned = sub(scale(POLE, 2 * dot(before, POLE)), before), after = starDir(later, ra, dec);
  assert.ok(length(sub(after, turned)) < 1e-3, `half a turn about the pole: ${length(sub(after, turned))}`);
});
