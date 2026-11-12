// Makes data/places.js, the towns the globe's night side is lit by, out of Natural Earth's 1:10m
// populated places (public domain; docs/provenance.md, 1h, Graphics). Each place keeps its point, in
// hundredths of a degree in a 16-bit integer as data/land.js keeps the coastlines, and its largest
// population (pop_max, the urban area's) as a byte on a log scale: 20 steps a decade, so a byte n is a
// population of 10^(n/20). Places with no population are dropped. GPLv3.
//
//   node tools/places.mjs <ne_10m_populated_places_simple.geojson>
//
// The GeoJSON file is read, never copied: only the points and the coded populations go into
// data/places.js.

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SCALE = 100;     // hundredths of a degree
const STEPS = 20;      // log-population steps a decade

const path = process.argv[2];
if (!path) {
  console.error('places.mjs needs <ne_10m_populated_places_simple.geojson>');
  process.exit(2);
}
const raw = readFileSync(path);
const json = JSON.parse(raw.toString('utf8'));
const places = [];
for (const f of json.features) {
  const g = f.geometry, pop = Number(f.properties && f.properties.pop_max);
  if (!g || g.type !== 'Point' || !(pop > 0)) continue;
  const [lon, lat] = g.coordinates;
  if (!(Math.abs(lon) <= 180 && Math.abs(lat) <= 90)) continue;
  places.push([Math.round(lon * SCALE), Math.round(lat * SCALE), Math.min(255, Math.max(0, Math.round(Math.log10(pop) * STEPS)))]);
}
places.sort((a, b) => b[2] - a[2]);   // the largest first
const points = new Int16Array(places.length * 2), pops = new Uint8Array(places.length);
places.forEach(([lon, lat, p], i) => { points[2 * i] = lon; points[2 * i + 1] = lat; pops[i] = p; });
const sha = createHash('sha256').update(raw).digest('hex');
writeFileSync(join(here, '..', 'data', 'places.js'),
  `// The towns the globe's night side is lit by: Natural Earth 1:10m populated places (public domain),\n` +
  `// coded by tools/places.mjs; docs/provenance.md, 1h, Graphics. points: [lon, lat] in hundredths of a\n` +
  `// degree, little-endian 16-bit integers, base64; pops: a byte each, the urban population as 10^(n/${STEPS}).\n` +
  `// Largest first. Generated: do not edit.\n` +
  `// ne_10m_populated_places_simple.geojson ${raw.length} bytes, SHA-256 ${sha}\n` +
  `export const SCALE = ${SCALE};\n` +
  `export const STEPS = ${STEPS};\n` +
  `export const PLACES = { count: ${places.length}, points: '${Buffer.from(points.buffer).toString('base64')}', pops: '${Buffer.from(pops.buffer).toString('base64')}' };\n`);
console.log(`places: ${places.length} of ${json.features.length}, the largest ${Math.round(10 ** (places[0][2] / STEPS)).toLocaleString('en')}`);
