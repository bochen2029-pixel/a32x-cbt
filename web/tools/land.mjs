// Makes data/land.js, the coastlines the globe is painted from, out of Natural Earth's 1:50m land and
// lakes (public domain; docs/provenance.md, 1h). Each ring is simplified (Douglas-Peucker, 0.03 deg,
// finer than the globe's texture), rings smaller than a few texels are dropped, and every point is kept
// as hundredths of a degree in a 16-bit integer. GPLv3.
//
//   node tools/land.mjs <ne_50m_land.geojson> <ne_50m_lakes.geojson>
//
// The GeoJSON files are read, never copied: only the simplified points go into data/land.js.

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const TOLERANCE = 0.03;   // degrees
const MIN_AREA = 0.02;    // square degrees: smaller islands and lakes are dropped
const SCALE = 100;        // points are stored in hundredths of a degree

function simplify(points, tol) {   // Douglas-Peucker, iterative
  if (points.length < 4) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = points[a], [bx, by] = points[b];
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
    let worst = -1, far = 0;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = points[i];
      const d = len > 0 ? Math.abs(dy * px - dx * py + bx * ay - by * ax) / len : Math.hypot(px - ax, py - ay);
      if (d > far) { far = d; worst = i; }
    }
    if (far > tol && worst > 0) {
      keep[worst] = 1;
      stack.push([a, worst], [worst, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

function area(points) {
  let s = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) s += (points[j][0] + points[i][0]) * (points[j][1] - points[i][1]);
  return Math.abs(s / 2);
}

function rings(path) {
  const raw = readFileSync(path);
  const json = JSON.parse(raw.toString('utf8'));
  const out = [];
  for (const f of json.features) {
    const g = f.geometry;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    for (const poly of polys) {
      for (const ring of poly) {
        if (area(ring) < MIN_AREA) continue;
        const s = simplify(ring, TOLERANCE);
        if (s.length >= 4) out.push(s);
      }
    }
  }
  return { out, sha: createHash('sha256').update(raw).digest('hex'), bytes: raw.length };
}

function pack(list) {
  const lengths = list.map((r) => r.length);
  const total = lengths.reduce((a, b) => a + b, 0);
  const pts = new Int16Array(total * 2);
  let k = 0;
  for (const r of list) for (const [lon, lat] of r) { pts[k++] = Math.round(lon * SCALE); pts[k++] = Math.round(lat * SCALE); }
  return { lengths, points: Buffer.from(pts.buffer).toString('base64'), total };
}

const [landPath, lakesPath] = process.argv.slice(2);
if (!landPath || !lakesPath) {
  console.error('land.mjs needs <ne_50m_land.geojson> <ne_50m_lakes.geojson>');
  process.exit(2);
}
const land = rings(landPath), lakes = rings(lakesPath);
const L = pack(land.out), K = pack(lakes.out);
writeFileSync(join(here, '..', 'data', 'land.js'),
  `// The globe's coastlines and lakes: Natural Earth 1:50m land and lakes (public domain), simplified and\n` +
  `// quantised by tools/land.mjs; docs/provenance.md, 1h. Points are [lon, lat] in hundredths of a degree,\n` +
  `// little-endian 16-bit integers, base64; rings[i] is how many points ring i has. Generated: do not edit.\n` +
  `// ne_50m_land.geojson ${land.bytes} bytes, SHA-256 ${land.sha}\n` +
  `// ne_50m_lakes.geojson ${lakes.bytes} bytes, SHA-256 ${lakes.sha}\n` +
  `export const SCALE = ${SCALE};\n` +
  `export const LAND = { rings: ${JSON.stringify(L.lengths)}, points: '${L.points}' };\n` +
  `export const LAKES = { rings: ${JSON.stringify(K.lengths)}, points: '${K.points}' };\n`);
console.log(`land: ${land.out.length} rings, ${L.total} points; lakes: ${lakes.out.length} rings, ${K.total} points`);
