// Makes data/stars.js, the stars the sky is drawn with, out of Wikidata (CC0; docs/provenance.md, 1h,
// "The Sun and the Moon"): every item with a V magnitude under 6.5 and a place (J2000.0). Clusters,
// nebulae, galaxies, novae, supernovae, planets and entries with no spectral class are left out; entries
// less than 0.02 deg apart, a star and its system, are one star, the brighter; a variable keeps the middle
// of its magnitudes. Each star keeps its place, its V magnitude and a B-V colour read from its spectral
// class. GPLv3.
//
//   node tools/stars.mjs <slice.csv> [<slice.csv> ...]
//
// Each CSV is the answer of Wikidata's query service (query.wikidata.org, "Accept: text/csv") to the
// query below, for a slice of magnitudes LO <= V < HI written as decimals (the service's range index
// finds nothing for a bound written as an integer), small enough to finish inside its 60 s:
// -30.0 1.0 2.0 3.0 3.5 4.0 4.25 4.5 4.75 5.0 5.15 5.3 5.45 5.6 5.75 5.9 6.05 6.2 6.35 6.5.
//
//   SELECT ?s (SAMPLE(?ra) AS ?ra1) (SAMPLE(?dec) AS ?dec1)
//          (GROUP_CONCAT(DISTINCT STR(?mag); separator=" ") AS ?mags) (SAMPLE(?sp) AS ?sp1)
//          (GROUP_CONCAT(DISTINCT STRAFTER(STR(?inst), "entity/"); separator=" ") AS ?classes) WHERE {
//     ?st ps:P1215 ?mag . hint:Prior hint:rangeSafe true . FILTER(?mag >= LO && ?mag < HI)
//     ?st pq:P1227 wd:Q4892529 .                       # apparent magnitude, in the V band
//     ?s p:P1215 ?st . ?s wdt:P6257 ?ra ; wdt:P6258 ?dec .   # right ascension, declination (J2000)
//     OPTIONAL { ?s wdt:P215 ?sp . } OPTIONAL { ?s wdt:P31 ?inst . }   # spectral class; instance of
//   } GROUP BY ?s
//
// The CSVs are read, never copied: only the packed numbers go into data/stars.js.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bvOfClass, STAR_PACK } from '../src/sky-model.js';

const here = dirname(fileURLToPath(import.meta.url));
const LIMIT = 6.5;          // V: about what an eye sees from a dark site, and from orbit
const SAME_STAR = 0.02;     // deg: closer than this, one point of light

// What is not a star, by Wikidata's classes (instance of): left out.
const NOT_STARS = new Set([
  'Q11282', 'Q46587', 'Q9262', 'Q854857', 'Q190438', 'Q44559', 'Q3272595', 'Q318', 'Q204107', 'Q1491746', 'Q22247', 'Q121750',
  'Q11276', 'Q1319599', 'Q3901935', 'Q3504248', 'Q190397', 'Q12046080', 'Q6458', 'Q4366498', 'Q11387', 'Q30014', 'Q203958',
  'Q168845', 'Q736194', 'Q650001', 'Q3937', 'Q207436', 'Q582000', 'Q6440', 'Q1059564', 'Q2488',
]);
// H II region, active galactic nucleus, asterism, diffuse nebula, dwarf galaxy, exoplanet, flocculent spiral galaxy, galaxy,
// galaxy cluster, galaxy group, gamma-ray burst, gas giant, globular cluster, ice giant, inferior planet, inner planet,
// irregular galaxy, moving group, nova, recurrent nova, open cluster, outer planet, reflection nebula, star cluster, stellar
// association, super star cluster, supernova, supernova remnant, type Ia supernova, stellar kinematics, cataclysmic
// variable, spiral galaxy.

function parseCsv(text) {   // RFC 4180, enough for the service's answers
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.length > 1);
}

const paths = process.argv.slice(2);
if (!paths.length) {
  console.error('stars.mjs needs the query\'s CSV answers: node tools/stars.mjs <slice.csv> [...]');
  process.exit(2);
}
const items = new Map();
const sources = [];
for (const path of paths) {
  const raw = readFileSync(path);
  sources.push(`${path.split('/').pop()} ${raw.length} bytes, SHA-256 ${createHash('sha256').update(raw).digest('hex')}`);
  const [head, ...rows] = parseCsv(raw.toString('utf8'));
  const col = (name) => { const i = head.indexOf(name); if (i < 0) throw new Error(`${path}: no column ${name}`); return i; };
  const [cs, cra, cdec, cmag, csp, ccl] = ['s', 'ra1', 'dec1', 'mags', 'sp1', 'classes'].map(col);
  for (const r of rows) {
    const id = r[cs].split('/').pop();
    const mags = r[cmag].split(' ').map(Number).filter(Number.isFinite);
    const it = items.get(id) || { id, ra: Number(r[cra]), dec: Number(r[cdec]), mags: [], sp: r[csp], classes: new Set() };
    it.mags.push(...mags);
    for (const c of r[ccl].split(' ')) if (c) it.classes.add(c);
    items.set(id, it);
  }
}

const median = (a) => { const s = [...new Set(a)].sort((x, y) => x - y); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
let dropped = 0;
const stars = [];
for (const it of items.values()) {
  // not a star, or no spectral class: every real star this bright has one, and the few without are
  // clusters, duplicates or errors (one 'variable star' of V 0.13 where the sky has none)
  if ([...it.classes].some((c) => NOT_STARS.has(c)) || !it.sp.trim() || !Number.isFinite(it.ra) || !Number.isFinite(it.dec) || Math.abs(it.dec) > 90) { dropped++; continue; }
  const v = median(it.mags);
  if (!(v < LIMIT)) continue;
  stars.push({ id: it.id, ra: ((it.ra % 360) + 360) % 360, dec: it.dec, v, bv: bvOfClass(it.sp) });
}
stars.sort((a, b) => a.v - b.v);

// One point of light for entries nearer than SAME_STAR: the brightest, which for a system is its whole light.
const D2R = Math.PI / 180, cosSame = Math.cos(SAME_STAR * D2R);
const unitOf = (s) => [Math.cos(s.dec * D2R) * Math.cos(s.ra * D2R), Math.cos(s.dec * D2R) * Math.sin(s.ra * D2R), Math.sin(s.dec * D2R)];
const cells = new Map(), kept = [];
const cellOf = (s) => `${Math.floor(s.dec)}`;
for (const s of stars) {
  const u = unitOf(s);
  let twin = false;
  for (const d of [-1, 0, 1]) {
    for (const o of cells.get(`${Math.floor(s.dec) + d}`) || []) {
      if (u[0] * o.u[0] + u[1] * o.u[1] + u[2] * o.u[2] > cosSame) { twin = true; break; }
    }
    if (twin) break;
  }
  if (twin) continue;
  const list = cells.get(cellOf(s)) || [];
  list.push({ u });
  cells.set(cellOf(s), list);
  kept.push(s);
}

const packed = STAR_PACK.pack(kept);
writeFileSync(join(here, '..', 'data', 'stars.js'),
  '// The stars to V 6.5: Wikidata (CC0), packed by tools/stars.mjs; docs/provenance.md, 1h, "The Sun and the\n' +
  '// Moon". Each star is 6 bytes, little-endian: right ascension (J2000.0) as a 16-bit fraction of a turn,\n' +
  '// declination as a signed 16-bit fraction of 90 deg, V magnitude as (V + 2) x 20 in a byte, B-V from the\n' +
  '// spectral class as a signed byte of fiftieths; brightest first; base64. Generated: do not edit.\n' +
  sources.map((s) => `// ${s}\n`).join('') +
  `export const STARS = { count: ${kept.length}, data: '${packed}' };\n`);
console.log(`stars: ${kept.length} kept to V ${LIMIT} (${items.size} items read, ${dropped} not stars or with no class, ${stars.length - kept.length} merged into a brighter neighbour)`);
