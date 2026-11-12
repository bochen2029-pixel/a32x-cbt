// The Moon's face, painted by code (the repository ships no images): two equirectangular maps in the
// Moon's own coordinates (latitude down the rows from the north, east longitude across from -180), its
// brightness and its relief. From data/moon.js, the Gazetteer's: the maria, lacus, sinus and paludes
// where its outlines put them, and every named crater of 8 km and more at its centre and diameter. The
// rest is this project's: the tone of each plain, the highlands' mottling, the craters' shapes after
// Pike's measures of fresh lunar craters, how worn each is, and the rays of the young ones. No three.js
// here, so the tests can read it. GPLv3.

import { CRATERS, NAMED, PLAINS } from '../data/moon.js';
import { MOON_PACK } from './sky-model.js';

export const MOON_KM = 1737.4;
export const ALBEDO_SCALE = 0.4;   // an albedo map byte of 255 is a normal albedo of 0.4

const D2R = Math.PI / 180;

// The plains' normal albedo, against about 0.165 for the highlands: this project's reading of the full
// Moon's photographs (Tranquillitatis and Crisium darkest, Frigoris and Nubium lightest). Mare Australe is
// a field of small dark patches, so only part of its outline is dark; Serenitatis has a darker border.
const HIGHLANDS = 0.165;
const TONE = {
  'Oceanus Procellarum': 0.087, 'Mare Imbrium': 0.091, 'Mare Tranquillitatis': 0.076, 'Mare Serenitatis': 0.1, 'Mare Crisium': 0.08,
  'Mare Fecunditatis': 0.091, 'Mare Nectaris': 0.096, 'Mare Nubium': 0.103, 'Mare Frigoris': 0.113, 'Mare Humorum': 0.086, 'Mare Cognitum': 0.097,
  'Mare Insularum': 0.096, 'Mare Vaporum': 0.086, 'Mare Australe': 0.1, 'Mare Smythii': 0.09, 'Mare Marginis': 0.095, 'Mare Orientale': 0.092,
  'Mare Undarum': 0.092, 'Mare Anguis': 0.092, 'Mare Spumans': 0.092, 'Mare Humboldtianum': 0.095, 'Mare Moscoviense': 0.092, 'Mare Ingenii': 0.1,
  'Sinus Aestuum': 0.078, 'Sinus Medii': 0.101, 'Sinus Iridum': 0.093, 'Sinus Roris': 0.097, 'Palus Putredinis': 0.093, 'Palus Epidemiarum': 0.107,
};
const COVER = { 'Mare Australe': 0.45 };
const BORDER = { 'Mare Serenitatis': 0.8 };
// A cooler grey for the titanium-rich basalts (Tranquillitatis most), warmer for the rest: a hint.
const COOL = { 'Mare Tranquillitatis': 1, 'Mare Fecunditatis': 0.4, 'Mare Serenitatis': 0.3, 'Oceanus Procellarum': 0.4, 'Mare Imbrium': 0.25 };

// The young craters: how bright, and their rays (how many, the longest in km). The rays' directions are
// a seeded draw, but for Tycho's long ray across Mare Nubium to Serenitatis, which passes Bessel.
const YOUNG = {
  Tycho: { a: 0.23, rays: 30, len: 1500, collar: 1 }, Copernicus: { a: 0.21, rays: 34, len: 650 }, Kepler: { a: 0.22, rays: 20, len: 320 },
  Aristarchus: { a: 0.32, rays: 12, len: 200 }, Proclus: { a: 0.26, rays: 14, len: 350, fan: [150, 270] }, Glushko: { a: 0.24, rays: 20, len: 600 },
  'Byrgius A': { a: 0.24, rays: 14, len: 400 }, 'Stevinus A': { a: 0.25, rays: 12, len: 380 }, 'Furnerius A': { a: 0.24, rays: 12, len: 380 },
  'Messier A': { a: 0.21, rays: 2, len: 130, fan: [255, 285] }, Anaxagoras: { a: 0.22, rays: 16, len: 400 }, Thales: { a: 0.22, rays: 14, len: 300 },
  Censorinus: { a: 0.27, rays: 6, len: 60 }, Dionysius: { a: 0.23, rays: 6, len: 80 }, Menelaus: { a: 0.21, rays: 6, len: 110 },
  Euler: { a: 0.2, rays: 8, len: 110 }, Lichtenberg: { a: 0.2, rays: 6, len: 120 }, 'Petavius B': { a: 0.22, rays: 10, len: 200 },
  Langrenus: { a: 0.2, rays: 8, len: 220 }, Theophilus: { a: 0.19 }, Bessel: { a: 0.2 }, Pytheas: { a: 0.2 }, Timocharis: { a: 0.19 },
  Manilius: { a: 0.2 }, Hell: { a: 0.2 }, 'Kepler A': { a: 0.2 }, Harpalus: { a: 0.2 }, Philolaus: { a: 0.19 }, 'Ross D': { a: 0.2 },
  'Mösting': { a: 0.2 },
};
// Dark floors: lava in old craters.
const DARK = { Plato: 0.078, Grimaldi: 0.072, Riccioli: 0.095, 'Crüger': 0.082, Billy: 0.082, Endymion: 0.09, 'Julius Caesar': 0.115, Boscovich: 0.112, Wargentin: 0.12 };

// A seeded sequence, the same on every machine.
export function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9) >>> 0) / 4294967296);
}

// Pike (1977), fresh lunar craters: depth and rim height from the diameter, km; simple below 15 km.
export function craterShape(d) {
  return d < 15 ? { depth: 0.196 * d ** 1.01, rim: 0.036 * d ** 1.014 } : { depth: 1.044 * d ** 0.301, rim: 0.236 * d ** 0.399 };
}

// The grid of a map: each row's latitude and each column's longitude, degrees.
function grid(w, h) {
  const lat = new Float64Array(h), cos = new Float64Array(h), lon = new Float64Array(w);
  for (let y = 0; y < h; y++) { lat[y] = 90 - ((y + 0.5) / h) * 180; cos[y] = Math.cos(lat[y] * D2R); }
  for (let x = 0; x < w; x++) lon[x] = ((x + 0.5) / w) * 360 - 180;
  return { lat, cos, lon };
}

// Value noise on a coarse grid, wrapped east to west: smooth mottling at a chosen scale.
function noiseField(w, h, cells, rand) {
  const cw = cells, ch = Math.max(2, Math.round(cells / 2)), gw = cw + 1;
  const g = new Float32Array(gw * (ch + 1));
  for (let i = 0; i < g.length; i++) g[i] = rand();
  for (let j = 0; j <= ch; j++) g[j * gw + cw] = g[j * gw];
  const ci = new Int32Array(w), cs = new Float64Array(w);
  for (let x = 0; x < w; x++) { const fx = ((x + 0.5) / w) * cw, i = Math.floor(fx), t = fx - i; ci[x] = i; cs[x] = t * t * (3 - 2 * t); }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = ((y + 0.5) / h) * ch, j = Math.min(ch - 1, Math.floor(fy)), ty = fy - j, sy = ty * ty * (3 - 2 * ty);
    const r0 = j * gw, r1 = r0 + gw, row = y * w;
    for (let x = 0; x < w; x++) {
      const i = ci[x], sx = cs[x];
      const a = g[r0 + i], b = g[r0 + i + 1], c = g[r1 + i], d = g[r1 + i + 1];
      out[row + x] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    }
  }
  return out;
}

// A box blur, run twice, wrapped east to west and widened across the rows as the parallels shorten, so
// it is round on the globe: r texels of a meridian.
function blur(f, w, h, r, cos) {
  const pad = new Float32Array(w * 3), out = new Float32Array(w * h), sum = new Float64Array(w);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < h; y++) {
      const rx = Math.min(w, Math.max(1, Math.round(r / Math.max(0.05, cos[y])))), n = 2 * rx + 1, row = y * w;
      pad.set(f.subarray(row, row + w), 0);
      pad.set(f.subarray(row, row + w), w);
      pad.set(f.subarray(row, row + w), 2 * w);
      let s = 0;
      for (let k = w - rx; k <= w + rx; k++) s += pad[k];
      for (let x = 0; x < w; x++) {
        out[row + x] = s / n;
        s += pad[w + x + rx + 1] - pad[w + x - rx];
      }
    }
    sum.fill(0);
    const n = 2 * r + 1, at = (y) => (y < 0 ? 0 : y >= h ? h - 1 : y) * w;
    for (let k = -r; k <= r; k++) { const row = at(k); for (let x = 0; x < w; x++) sum[x] += out[row + x]; }
    for (let y = 0; y < h; y++) {
      const row = y * w, add = at(y + r + 1), sub = at(y - r);
      for (let x = 0; x < w; x++) {
        f[row + x] = sum[x] / n;
        sum[x] += out[add + x] - out[sub + x];
      }
    }
  }
}

// Each texel inside a plain's rings (even-odd, at the texels' centres): put(index).
function fill(w, h, rings, lat, put) {
  let s = 90, nn = -90;
  for (const r of rings) for (const p of r) { s = Math.min(s, p[1]); nn = Math.max(nn, p[1]); }
  const y0 = Math.max(0, Math.floor(((90 - nn) / 180) * h)), y1 = Math.min(h - 1, Math.ceil(((90 - s) / 180) * h));
  const xs = [];
  for (let y = y0; y <= y1; y++) {
    xs.length = 0;
    for (const r of rings) {
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const [xi, yi] = r[i], [xj, yj] = r[j];
        if ((yi > lat[y]) !== (yj > lat[y])) xs.push(xi + ((lat[y] - yi) * (xj - xi)) / (yj - yi));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.ceil(((xs[k] + 180) / 360) * w - 0.5), x1 = Math.floor(((xs[k + 1] + 180) / 360) * w - 0.5);
      for (let x = x0; x <= x1; x++) put(y * w + (((x % w) + w) % w));
    }
  }
}

// A point along the great circle from a place, by azimuth (deg from north through east) and arc (deg).
function along(lat0, lon0, az, arc) {
  const p = lat0 * D2R, t = az * D2R, s = arc * D2R;
  const lat = Math.asin(Math.sin(p) * Math.cos(s) + Math.cos(p) * Math.sin(s) * Math.cos(t));
  const lon = lon0 * D2R + Math.atan2(Math.sin(t) * Math.sin(s) * Math.cos(p), Math.cos(s) - Math.sin(p) * Math.sin(lat));
  return [lat / D2R, ((((lon / D2R) + 180) % 360) + 360) % 360 - 180];
}

export function bearing(a, b) {   // from place a to place b, deg from north through east
  const [p1, l1] = [a[0] * D2R, a[1] * D2R], [p2, l2] = [b[0] * D2R, b[1] * D2R];
  const y = Math.sin(l2 - l1) * Math.cos(p2), x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(l2 - l1);
  return ((Math.atan2(y, x) / D2R) + 360) % 360;
}

// The texels within an angular radius (deg) of a place, as runs along rows: visit(y, x0, x1, dyDeg,
// lon0) for each row. Flat across the patch (the craters and the rays' steps are small), with the
// longitudes shortened by the row's latitude.
function rows(w, h, g, lat0, lon0, radius, visit) {
  const y0 = Math.max(0, Math.floor(((90 - lat0 - radius) / 180) * h)), y1 = Math.min(h - 1, Math.ceil(((90 - lat0 + radius) / 180) * h));
  for (let y = y0; y <= y1; y++) {
    const c = Math.max(g.cos[y], 1e-3), span = Math.min(180, radius / c + 360 / w);
    visit(y, Math.floor(((lon0 - span + 180) / 360) * w), Math.ceil(((lon0 + span + 180) / 360) * w), g.lat[y] - lat0, c);
  }
}

// The maps. width texels round the Moon (2048 for a large screen, 1024 for a phone); the albedo map is
// RGB (normal albedo over ALBEDO_SCALE, linear) and the relief map's red and green are the ground's slope
// east and north (127.5 is level, 0 and 255 a slope of one in one).
export function paintMoon(width = 2048) {
  const w = width, h = width / 2, n = w * h;
  const g = grid(w, h);
  const rand = seeded(0x4d6f6f6e);
  const km = (2 * Math.PI * MOON_KM) / w;   // km per texel along a meridian (and the equator)
  const plains = MOON_PACK.plains(PLAINS), craters = MOON_PACK.craters(CRATERS);

  // the highlands: mottled at two scales, the southern uplands a little brighter, as round Tycho
  const albedo = new Float32Array(n), cool = new Float32Array(n), height = new Float32Array(n);
  const n2 = noiseField(w, h, 96, rand), n3 = noiseField(w, h, 384, rand);
  for (let y = 0; y < h; y++) {
    const k = HIGHLANDS * (1 + 0.06 * Math.max(0, Math.min(1, (-g.lat[y] - 20) / 30)));
    for (let x = 0, i = y * w; x < w; x++, i++) albedo[i] = k * (0.88 + 0.16 * n2[i] + 0.1 * n3[i]);
  }

  // the plains: each filled, its tone kept where it lies, the edges softened over about 25 km
  const cover = new Float32Array(n), tone = new Float32Array(n), border = new Float32Array(n);
  for (const p of plains) {
    const t = TONE[p.name] ?? 0.098, c = COVER[p.name] ?? 1, k = COOL[p.name] ?? 0, b = BORDER[p.name] ?? 0;
    fill(w, h, p.rings, g.lat, (i) => {
      const patch = c >= 1 ? 1 : n2[i] > 1 - c ? 1 : n3[i] > 0.8 ? 0.7 : 0;
      cover[i] = patch;
      tone[i] = t * patch;
      cool[i] = k * patch;
      border[i] = b > 0 ? 1 : 0;
    });
  }
  const r = Math.max(1, Math.round(12 / km));
  blur(cover, w, h, r, g.cos);
  blur(tone, w, h, r, g.cos);
  blur(cool, w, h, r, g.cos);
  if (Object.keys(BORDER).length) {   // a wide blur of the bordered plains: under 1 near their edges
    blur(border, w, h, Math.max(1, Math.round(45 / km)), g.cos);
  }
  for (let i = 0; i < n; i++) {
    if (cover[i] < 1e-4) continue;
    let t = (tone[i] / cover[i]) * (0.9 + 0.17 * n2[i] + 0.08 * n3[i]);
    if (border[i] > 0.02 && border[i] < 0.97) t *= 1 - 0.13 * Math.sin(((border[i] - 0.02) / 0.95) * Math.PI) * Math.min(1, cover[i]);
    const m = Math.min(1, cover[i]);
    albedo[i] += (t - albedo[i]) * m;
    cool[i] = (cool[i] / cover[i]) * m;
  }

  // the craters: the Gazetteer's, largest first, then a seeded scatter of small ones; each newer one
  // overprints what is under it
  const young = new Map(), dark = new Map(), key = (la, lo) => `${Math.round(la * 100)},${Math.round(lo * 100)}`;
  for (const [name, v] of Object.entries(YOUNG)) if (NAMED[name]) young.set(key(NAMED[name][0], NAMED[name][1]), v);
  for (const [name, a] of Object.entries(DARK)) if (NAMED[name]) dark.set(key(NAMED[name][0], NAMED[name][1]), a);
  const list = [];
  for (let i = 0; i < craters.length; i += 3) list.push([craters[i], craters[i + 1], craters[i + 2], 0]);
  const listed = new Set(list.map((c) => key(c[0], c[1])));
  for (const name of [...Object.keys(YOUNG), ...Object.keys(DARK)]) {   // the named ones under 8 km too
    const c = NAMED[name];
    if (c && !listed.has(key(c[0], c[1]))) list.push([c[0], c[1], c[2], 0]);
  }
  const extra = Math.round(7000 * (w / 2048));
  for (let i = 0; i < extra; i++) {
    const lat = Math.asin(2 * rand() - 1) / D2R, lon = rand() * 360 - 180, d = Math.min(22, 4 / (1 - 0.8 * rand()));
    list.push([lat, lon, d, 1]);
  }
  list.sort((a, b) => b[2] - a[2]);
  for (const [lat0, lon0, d, scattered] of list) {
    const yc = Math.min(h - 1, Math.max(0, Math.floor(((90 - lat0) / 180) * h))), xc = Math.min(w - 1, Math.max(0, Math.floor(((lon0 + 180) / 360) * w)));
    if (scattered && cover[yc * w + xc] > 0.5 && rand() < 0.75) continue;   // the plains are younger: fewer craters show on them
    const k = key(lat0, lon0), y = scattered ? undefined : young.get(k), floor = scattered ? undefined : dark.get(k);
    const wear = y ? 1 : 0.25 + 0.65 * rand() ** 1.5;
    const shape = craterShape(d), depth = shape.depth * wear, rim = shape.rim * wear;
    const flat = d < 15 ? 2 : d < 60 ? 4 : 6, peak = d > 25 && d < 160 ? 0.35 * depth : 0;
    const R = ((d / 2) / MOON_KM) / D2R, extent = R * (y ? 3.2 : 3), inv = 1 / R;
    const bright = y ? y.a : wear > 0.8 && d < 25 ? HIGHLANDS * 1.22 : 0;
    const haloWidth = y ? (y.collar ? 0.35 : 0.8) : 0.3, haloK = y ? 1 : 0.55;
    rows(w, h, g, lat0, lon0, extent, (yy, x0, x1, dy, c) => {
      const row = yy * w;
      for (let xx = x0; xx <= x1; xx++) {
        const x = ((xx % w) + w) % w;
        let dl = g.lon[x] - lon0;
        if (dl > 180) dl -= 360; else if (dl < -180) dl += 360;
        const ex = dl * c, dist = Math.sqrt(ex * ex + dy * dy);
        if (dist > extent) continue;
        const i = row + x, q = dist * inv;
        if (q < 1) {
          const q2 = q * q, qf = flat === 2 ? q2 : flat === 4 ? q2 * q2 : q2 * q2 * q2;
          let p = -depth + (depth + rim) * qf;
          if (peak > 0 && q < 0.4) p += peak * Math.exp(-(q / 0.13) * (q / 0.13));
          const keep = q < 0.85 ? 0 : (q - 0.85) / 0.15;   // the cavity is new ground
          height[i] = height[i] * keep + p;
          if (floor !== undefined && q < 0.9) albedo[i] += (floor - albedo[i]) * Math.min(1, (0.9 - q) / 0.2);
        } else if (q < 3) {
          const f = 1 - (q - 1) / 2;
          height[i] += (rim / (q * q * q)) * f * f;
        }
        if (bright > 0) {   // a fresh crater is bright inside and out, fading over its ejecta
          const e = q < 1 ? 0 : (q - 1) / haloWidth;
          albedo[i] += (bright - albedo[i]) * Math.exp(-e * e) * haloK;
          if (y && y.collar && q > 1.15 && q < 2.6) albedo[i] *= 1 - 0.09 * Math.sin(((q - 1.15) / 1.45) * Math.PI);
        }
      }
    });
  }

  // the rays: bright streaks along great circles from the young craters, rising past the ejecta, then
  // fading and widening outward
  const ray = new Float32Array(n);
  for (const [name, y] of Object.entries(YOUNG)) {
    if (!y.rays || !NAMED[name]) continue;
    const [lat0, lon0, d] = NAMED[name];
    const R = d / 2, rr = seeded(Math.round(lat0 * 1000 + lon0 * 7 + 13));
    for (let k = 0; k < y.rays; k++) {
      let az = y.fan ? y.fan[0] + rr() * (y.fan[1] - y.fan[0]) : rr() * 360;
      let len = y.len * (0.3 + 0.7 * rr() ** 0.7);
      if (name === 'Tycho' && k === 0) { az = bearing([lat0, lon0], NAMED.Bessel); len = 2100; }
      const w0 = R * (0.35 + 0.55 * rr()) + 4, strength = 0.4 + 0.6 * rr(), bend = (rr() - 0.5) * 6;
      for (let s = R * 1.5; s < len; ) {
        const width = w0 * (1 + 1.2 * (s / len));
        const rise = Math.min(1, (s - R * 1.5) / (R * 1.5));
        const fade = strength * rise * (1 - s / len) ** 1.4 * 0.75;
        const [la, lo] = along(lat0, lon0, az + bend * (s / len) ** 2, s / MOON_KM / D2R);
        const ext = ((width * 2.2) / MOON_KM) / D2R, inv = 1 / (((width) / MOON_KM) / D2R);
        rows(w, h, g, la, lo, ext, (yy, x0, x1, dy, c) => {
          const row = yy * w;
          for (let xx = x0; xx <= x1; xx++) {
            const x = ((xx % w) + w) % w;
            let dl = g.lon[x] - lo;
            if (dl > 180) dl -= 360; else if (dl < -180) dl += 360;
            const ex = dl * c * inv, ey = dy * inv, q = ex * ex + ey * ey;
            if (q < 4.84) ray[row + x] += fade * Math.exp(-q);
          }
        });
        s += Math.max(km * 0.8, width * 0.9);
      }
    }
  }
  for (let i = 0; i < n; i++) if (ray[i] > 1e-4) albedo[i] += (0.235 - albedo[i]) * (1 - Math.exp(-ray[i]));

  // Reiner Gamma, the bright swirl in Procellarum; the Aristarchus plateau's dark ash
  const swirl = NAMED['Reiner Gamma'];
  rows(w, h, g, swirl[0], swirl[1], 2.5, (yy, x0, x1, dy, c) => {
    for (let xx = x0; xx <= x1; xx++) {
      const x = ((xx % w) + w) % w, u = (g.lon[x] - swirl[1]) * c;
      const a = (u * 0.8 + dy * 0.6) / 1.1, b = (-u * 0.6 + dy * 0.8) / 0.4;
      albedo[yy * w + x] += (0.16 - albedo[yy * w + x]) * Math.exp(-(a * a + b * b)) * 0.85;
    }
  });
  rows(w, h, g, 26.5, -51, 4, (yy, x0, x1, dy, c) => {
    for (let xx = x0; xx <= x1; xx++) {
      const x = ((xx % w) + w) % w, u = (g.lon[x] + 51) * c, q = (u * u + dy * dy) / 6.8;
      albedo[yy * w + x] += (0.074 - albedo[yy * w + x]) * Math.exp(-q * q) * 0.8;
    }
  });

  // out: the albedo map, warm grey with the plains cooler, and the slopes
  const albedoMap = new Uint8Array(n * 4), reliefMap = new Uint8Array(n * 4);
  const s = 255 / ALBEDO_SCALE;
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const a = albedo[i] * s, c = cool[i] * 0.035;
    albedoMap[j] = Math.min(255, a * (1 - c) + 0.5);
    albedoMap[j + 1] = Math.min(255, a * 0.965 + 0.5);
    albedoMap[j + 2] = Math.min(255, a * (0.9 + 1.9 * c) + 0.5);
    albedoMap[j + 3] = 255;
  }
  for (let y = 0; y < h; y++) {
    const dx = 2 * km * Math.max(0.02, g.cos[y]), up = Math.max(0, y - 1), down = Math.min(h - 1, y + 1), dn = (down - up) * km;
    for (let x = 0; x < w; x++) {
      const i = y * w + x, j = i * 4;
      const se = (height[y * w + (x + 1) % w] - height[y * w + (x - 1 + w) % w]) / dx;
      const sn = (height[up * w + x] - height[down * w + x]) / dn;
      reliefMap[j] = 127.5 + 127.5 * Math.max(-1, Math.min(1, se));
      reliefMap[j + 1] = 127.5 + 127.5 * Math.max(-1, Math.min(1, sn));
      reliefMap[j + 2] = 128;
      reliefMap[j + 3] = 255;
    }
  }
  return {
    width: w, height: h, albedo: albedoMap, relief: reliefMap, heights: height,
    albedoAt: (latDeg, lonDeg) => albedo[Math.min(h - 1, Math.max(0, Math.floor(((90 - latDeg) / 180) * h))) * w + Math.min(w - 1, Math.max(0, Math.floor(((lonDeg + 180) / 360) * w)))],
  };
}
