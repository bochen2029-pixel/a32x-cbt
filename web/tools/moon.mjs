// Makes data/moon.js, what the Moon's face is painted from (src/moon-face.js), out of the Gazetteer of
// Planetary Nomenclature (IAU and USGS; public domain; docs/provenance.md, 1h, "The Sun and the Moon"):
// the outlines of the maria, lacus, sinus and paludes, and the centre and diameter of every named crater
// on the side the Earth sees. Outlines are simplified (Douglas-Peucker, 0.15 deg) and kept in tenths of a
// degree; craters in hundredths of a degree and tenths of a kilometre. GPLv3.
//
//   node tools/moon.mjs <MOON_nomenclature_center_pts.dbf> <pages folder>
//
// The .dbf is in the Gazetteer's shapefile of the Moon's named features, MOON_nomenclature_center_pts.zip
// (planetarynames.wr.usgs.gov, GIS Downloads). The folder holds the Gazetteer's page of each feature in
// OUTLINED below but Mare Frigoris and Mare Insularum (drawn here), saved as feature-<id>.html from
// planetarynames.wr.usgs.gov/Feature/<id>: the page carries the feature's outline as WKT. Both are read,
// never copied: only the packed numbers go into data/moon.js.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MOON_PACK } from '../src/sky-model.js';

const here = dirname(fileURLToPath(import.meta.url));
const TOLERANCE = 0.15;   // deg
const CRATER_MIN = 8;     // km: smaller is under two texels of the finest map
const NEAR_SIDE = 100;    // deg of longitude either side of the middle: what libration can turn toward the Earth

// The dark plains, by the Gazetteer's feature id, largest first: each painted over those before it.
const OUTLINED = [4395, 3665, 3678, 3691, 3673, 3684, 3686, 3674, 3671, 3680, 3677, 3683, 3670, 3689, 3681, 3685, 3694, 3693, 3664,
  3690, 3676, 3682, 3679, 3221, 3203, 3206, 3212, 3216, 3217, 3219, 3220, 3204, 4565, 4566, 5558, 5559, 5561, 5562, 5564, 5565, 5566,
  5567, 5569, 5571];

// Mare Frigoris: the Gazetteer's outline is only a box. Drawn here instead, within its extent (49.1 to
// 64.4 N, 43.1 W to 38.0 E), along the band it makes north of Imbrium and Serenitatis: this project's.
const FRIGORIS = [[-43, 52.5], [-36, 53.5], [-28, 54], [-20, 54.5], [-12, 55.5], [-4, 56.5], [4, 56], [12, 55], [20, 53.5], [28, 52.5],
  [34, 52], [38, 53.5], [36, 56], [28, 57.5], [18, 59], [8, 61], [-2, 62], [-14, 61.5], [-26, 60.5], [-36, 59], [-43, 57.5]];

// Mare Insularum: the Gazetteer's outline is a circle that leaves out Copernicus, which stands in the
// mare. Drawn here round the dark ground from Lansberg and Reinhold to Copernicus and on east to Sinus
// Aestuum, south of Montes Carpatus: this project's.
const INSULARUM = [[-39, 4], [-38, 10], [-34, 14.5], [-27, 15.5], [-21, 14.5], [-15, 13], [-11, 10], [-11, 6], [-14, 2.5], [-19, 0],
  [-26, -1], [-33, -0.5], [-37, 1]];

// Craters the painter treats by name (rays, bright or dark floors): their centres and diameters.
const NAMES = ['Tycho', 'Copernicus', 'Kepler', 'Aristarchus', 'Proclus', 'Glushko', 'Byrgius A', 'Stevinus A', 'Furnerius A', 'Messier A',
  'Anaxagoras', 'Thales', 'Censorinus', 'Dionysius', 'Menelaus', 'Euler', 'Lichtenberg', 'Petavius B', 'Plato', 'Grimaldi', 'Riccioli',
  'Crüger', 'Billy', 'Endymion', 'Julius Caesar', 'Boscovich', 'Wargentin', 'Langrenus', 'Theophilus', 'Bessel', 'Pytheas', 'Timocharis',
  'Manilius', 'Hell', 'Kepler A', 'Harpalus', 'Philolaus', 'Ross D', 'Mösting', 'Reiner Gamma'];

function readDbf(path) {
  const b = readFileSync(path);
  const n = b.readUInt32LE(4), headerLength = b.readUInt16LE(8), recordLength = b.readUInt16LE(10);
  const fields = [];
  for (let at = 32; b[at] !== 0x0d; at += 32) fields.push({ name: b.toString('latin1', at, at + 11).replace(/\0.*$/, ''), length: b[at + 16] });
  const rows = [];
  for (let i = 0; i < n; i++) {
    let at = headerLength + i * recordLength + 1;
    const row = {};
    for (const f of fields) { row[f.name] = b.toString('utf8', at, at + f.length).trim(); at += f.length; }
    rows.push(row);
  }
  return { rows, sha: createHash('sha256').update(b).digest('hex'), bytes: b.length };
}

const east = (lon) => { const x = Number(lon); return x > 180 ? x - 360 : x; };

function simplify(points, tol) {   // Douglas-Peucker, iterative; the ring's ends are kept
  if (points.length < 4) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, z] = stack.pop();
    const [ax, ay] = points[a], [bx, by] = points[z];
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
    let worst = -1, far = 0;
    for (let i = a + 1; i < z; i++) {
      const [px, py] = points[i];
      const d = len > 0 ? Math.abs(dy * px - dx * py + bx * ay - by * ax) / len : Math.hypot(px - ax, py - ay);
      if (d > far) { far = d; worst = i; }
    }
    if (far > tol && worst > 0) { keep[worst] = 1; stack.push([a, worst], [worst, z]); }
  }
  return points.filter((_, i) => keep[i]);
}

// The page's outlines: every WKT string on it, as rings of [lon, lat], each ring's longitudes carried
// to the side of the feature's centre (the Gazetteer writes them from 0 to 360 and past it).
function outlinesOf(html, centreLon) {
  const out = [];
  for (const m of html.matchAll(/(MULTI)?(POLYGON|LINESTRING)\s*\(([\s\S]*?)\)\s*\)\s*\)?\s*</g)) {
    const rings = [];
    for (const r of m[0].matchAll(/\(([-0-9.e, ]+)\)/g)) {
      const pts = r[1].split(',').map((p) => p.trim().split(/\s+/).map(Number)).filter((p) => p.length === 2 && p.every(Number.isFinite));
      if (pts.length < 4) continue;
      rings.push(pts.map(([lon, lat]) => [lon - 360 * Math.round((lon - centreLon) / 360), lat]));
    }
    if (rings.length) out.push(rings);
  }
  return out;
}

function box(rings) {
  let s = 90, n = -90, w = 999, e = -999;
  for (const r of rings) for (const [lon, lat] of r) { s = Math.min(s, lat); n = Math.max(n, lat); w = Math.min(w, lon); e = Math.max(e, lon); }
  return { s, n, w, e };
}

const [dbfPath, pages] = process.argv.slice(2);
if (!dbfPath || !pages) {
  console.error('moon.mjs needs <MOON_nomenclature_center_pts.dbf> <folder of feature-<id>.html pages>');
  process.exit(2);
}
const dbf = readDbf(dbfPath);
const byId = new Map(dbf.rows.map((r) => [Number(r.link.split('/').pop()), r]));
const byName = new Map(dbf.rows.map((r) => [r.name, r]));
const sources = [`${dbfPath.split('/').pop()} ${dbf.bytes} bytes, SHA-256 ${dbf.sha}`];

const plains = [];
for (const id of OUTLINED) {
  const rec = byId.get(id);
  if (!rec) throw new Error(`feature ${id} is not in ${dbfPath}`);
  const lon0 = east(rec.center_lon), want = { s: Number(rec.min_lat), n: Number(rec.max_lat) };
  let rings;
  if (rec.name === 'Mare Frigoris') rings = [FRIGORIS];
  else if (rec.name === 'Mare Insularum') rings = [INSULARUM];
  else {
    const raw = readFileSync(join(pages, `feature-${id}.html`));
    sources.push(`feature-${id}.html ${raw.length} bytes, SHA-256 ${createHash('sha256').update(raw).digest('hex')}`);
    // the outline whose extent in latitude is the record's: a page may carry an older one too
    const found = outlinesOf(raw.toString('utf8'), lon0).map((r) => ({ r, b: box(r) }))
      .sort((a, b) => (Math.abs(a.b.s - want.s) + Math.abs(a.b.n - want.n)) - (Math.abs(b.b.s - want.s) + Math.abs(b.b.n - want.n)))[0];
    if (!found || Math.abs(found.b.s - want.s) + Math.abs(found.b.n - want.n) > 1.5) throw new Error(`${rec.name}: no outline on its page matches its extent`);
    rings = found.r;
  }
  const kept = rings.map((r) => simplify(r, TOLERANCE)).filter((r) => r.length >= 4);
  plains.push({ name: rec.name, id, rings: kept });
}

const craters = dbf.rows
  .filter((r) => (r.type === 'Crater, craters' || r.type === 'Satellite Feature') && Number(r.diameter) >= CRATER_MIN && Math.abs(east(r.center_lon)) <= NEAR_SIDE)
  .map((r) => [Number(r.center_lat), east(r.center_lon), Number(r.diameter)])
  .sort((a, b) => b[2] - a[2] || a[0] - b[0] || a[1] - b[1]);

const named = {};
for (const n of NAMES) {
  const r = byName.get(n);
  if (!r) throw new Error(`no feature named ${n} in ${dbfPath}`);
  named[n] = [Number(Number(r.center_lat).toFixed(2)), Number(east(r.center_lon).toFixed(2)), Number(Number(r.diameter).toFixed(1))];
}

const packed = MOON_PACK.pack(plains, craters);
writeFileSync(join(here, '..', 'data', 'moon.js'),
  '// The Moon\'s maria and craters: the Gazetteer of Planetary Nomenclature (IAU WGPSN and USGS Astrogeology;\n' +
  '// public domain), packed by tools/moon.mjs; docs/provenance.md, 1h, "The Sun and the Moon". Outlines are\n' +
  '// [lon, lat] in tenths of a degree, east longitude, little-endian 16-bit integers, base64, rings[i] points\n' +
  '// each; those of Mare Frigoris and Mare Insularum are this project\'s, where the Gazetteer gives a box and a\n' +
  '// circle. Craters are [lat, lon] in hundredths of a degree and the diameter in tenths of a km, largest\n' +
  `// first: those of ${CRATER_MIN} km and more within ${NEAR_SIDE} deg of the near side's middle. Generated: do not edit.\n` +
  sources.map((s) => `// ${s}\n`).join('') +
  `export const PLAINS = ${JSON.stringify(packed.plains)};\n` +
  `export const CRATERS = { count: ${craters.length}, data: '${packed.craters}' };\n` +
  `export const NAMED = ${JSON.stringify(named)};\n`);
console.log(`moon: ${plains.length} plains, ${packed.points} outline points; ${craters.length} craters of ${CRATER_MIN} km and more; ${NAMES.length} named`);
