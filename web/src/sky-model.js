// The sky's arithmetic, without a browser or three.js, so the tests can read it: the core's sky readouts
// by name (orbit_sky.h), the flight's date, where and how large the Moon is drawn and how it is turned,
// how much of the Sun clears the Earth, the Moon's brightness with its phase, and the stars' packing.
// GPLv3.

import { RE, cross, dot, length, scale, sub } from './frames.js';

// orbit_sky.h's readouts, in its order: a test holds the two equal.
export const SKY = [
  'jd', 'gast', 'sunE', 'sunN', 'sunU', 'sunDist', 'moonE', 'moonN', 'moonU', 'moonDist',
  'moonPoleE', 'moonPoleN', 'moonPoleU', 'moonFaceE', 'moonFaceN', 'moonFaceU', 'moonPhase', 'moonLit', 'moonElong',
  'j2000Xe', 'j2000Xn', 'j2000Xu', 'j2000Ye', 'j2000Yn', 'j2000Yu', 'j2000Ze', 'j2000Zn', 'j2000Zu',
];

export const DEFAULT_EPOCH = 2461357.291666667;   // OC_SKY_DEFAULT_EPOCH: 2026-11-12 19:00:00 UTC
export const FIRST_JD = 2415020.5, LAST_JD = 2488069.5;   // 1900-01-01 and 2100-01-01, 0 h: what the core takes
export const MOON_RADIUS = 1737400;   // m, the IAU's mean radius
export const SUN_RADIUS = 695700000;  // m, the IAU's nominal radius
const UNIX_JD = 2440587.5;            // the Julian Date of 1970-01-01, 0 h UTC

// ---- the date ---------------------------------------------------------------------------------------

// A date and time of the Gregorian calendar, in UTC, from ?date=: 2026-12-24, 2026-12-24T03:00Z,
// 2026-12-24T03:00:30.5, 2026-12-24 21:00-06:00. With no zone it is UTC. The Julian Date, or null for
// anything else or a day that does not exist.
export function parseDate(text) {
  const m = /^\s*(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}(?:\.\d+)?))?)?\s*(Z|[+-]\d{2}:?\d{2})?\s*$/i.exec(String(text ?? ''));
  if (!m) return null;
  const [y, mo, d, h = 0, mi = 0] = m.slice(1, 6).map((v) => (v === undefined ? undefined : Number(v)));
  const s = m[6] === undefined ? 0 : Number(m[6]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s >= 61) return null;
  let ms = Date.UTC(y, mo - 1, d, h, mi, 0) + s * 1000;
  const back = new Date(Date.UTC(y, mo - 1, d));
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;   // 31 April
  const zone = m[7];
  if (zone && zone.toUpperCase() !== 'Z') {
    const z = /([+-])(\d{2}):?(\d{2})/.exec(zone);
    const minutes = Number(z[2]) * 60 + Number(z[3]);
    if (Number(z[2]) > 14 || Number(z[3]) > 59) return null;
    ms -= (z[1] === '+' ? 1 : -1) * minutes * 60000;
  }
  return ms / 86400000 + UNIX_JD;
}

// The Julian Date as 2026-11-12 19:00:00, UTC.
export function formatDate(jd) {
  const ms = Math.round((jd - UNIX_JD) * 86400000 / 1000) * 1000;
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}

// The epoch the page asks the core for: ?date= when it is given (null when it is not), refused loudly
// when it is not a date the core takes.
export function epochOf(search) {
  let asked = new URLSearchParams(search).get('date');
  if (asked === null) return null;
  asked = asked.replace(/(:\d{2}(?:\.\d+)?) (\d{2}:?\d{2})$/, '$1+$2');   // a zone's + arrives as a space
  const jd = parseDate(asked);
  if (jd === null) throw new Error(`?date=${asked} is not a date: write it as 2026-12-24T03:00Z (UTC unless a zone is given)`);
  if (!(jd >= FIRST_JD && jd <= LAST_JD)) throw new Error(`?date=${asked} is outside 1900 to 2100, where the sky's methods hold`);
  return jd;
}

// ---- the Moon -----------------------------------------------------------------------------------------

// The Moon's centre in the site frame (m): the readouts give it from the Earth's centre, which is RE
// below the start point.
export function moonCentre(sky) {
  return [sky.moonE * sky.moonDist, sky.moonN * sky.moonDist, sky.moonU * sky.moonDist - RE];
}

// Where the Moon is seen from the eye (site frame, doubles), and how it is drawn: at drawAt metres along
// the same line, with the radius that keeps its true angular size there.
export function moonSeen(sky, eye, drawAt) {
  const v = sub(moonCentre(sky), eye);
  const dist = length(v);
  return { dir: scale(v, 1 / dist), dist, radius: Math.asin(MOON_RADIUS / dist), drawRadius: (MOON_RADIUS * drawAt) / dist };
}

// The Moon's own axes in the site frame: x through the middle of its near side (0 N 0 E), y through
// 0 N 90 E, z through its north pole. Selenographic east is the IAU's: toward Mare Crisium, which an
// observer with the Moon's north up sees on the right.
export function moonAxes(sky) {
  const x = [sky.moonFaceE, sky.moonFaceN, sky.moonFaceU], z = [sky.moonPoleE, sky.moonPoleN, sky.moonPoleU];
  return { x, y: cross(z, x), z };
}

// A place on the Moon, latitude and east longitude in degrees, as a direction in its own axes.
export function selenographic(latDeg, lonDeg) {
  const la = (latDeg * Math.PI) / 180, lo = (lonDeg * Math.PI) / 180;
  return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
}

// The same place in the site frame.
export function onMoon(sky, latDeg, lonDeg) {
  const a = moonAxes(sky), p = selenographic(latDeg, lonDeg);
  return [0, 1, 2].map((i) => a.x[i] * p[0] + a.y[i] * p[1] + a.z[i] * p[2]);
}

// The Moon's brightness with its phase angle. Its surface is lit by Lommel and Seeliger's law for a
// dusty surface (cos i / (cos i + cos e): no darkening toward the limb, as the full Moon shows), whose
// whole disc fades with phase as LS(alpha) below. The real Moon fades faster: its magnitude grows by
// 0.026 a degree of phase and 4e-9 times its fourth power (Allen's Astrophysical Quantities), from the
// shadows its rough ground casts. phaseLaw is the ratio of the two, 1 at full, by which the law's
// brightness is scaled; held past 150 deg, where the magnitude law was not measured.
export function lsDisc(alpha) {   // the Lommel-Seeliger sphere's light at phase angle alpha, 1 at full
  const a = Math.min(Math.max(alpha, 1e-6), Math.PI - 1e-6);
  return 1 - Math.sin(a / 2) * Math.tan(a / 2) * Math.log(1 / Math.tan(a / 4));
}
export function moonMagnitude(alpha) {   // V(1, alpha) less V(1, 0)
  const a = (Math.abs(alpha) * 180) / Math.PI;
  return 0.026 * a + 4e-9 * a ** 4;
}
export function phaseLaw(alpha) {
  const a = Math.min(Math.abs(alpha), (150 * Math.PI) / 180);
  return Math.min(1, 10 ** (-0.4 * moonMagnitude(a)) / lsDisc(a));
}

// Earthshine: the light of the sunlit Earth on the Moon, for its brightness relative to sunlight: the
// Earth's disc seen from the Moon (its solid angle over pi), its albedo (0.3), and how much of it is lit
// (the Moon's phase from the Earth turned inside out).
export function earthshine(sky) {
  const omega = Math.PI * (RE / sky.moonDist) ** 2;
  return (0.3 * omega / Math.PI) * 0.5 * (1 - Math.cos(sky.moonPhase));
}

// ---- the Sun -----------------------------------------------------------------------------------------

// How the Sun stands from the eye (site frame): the part of its disc clear of the Earth (0 to 1, by the
// area of the disc above the limb), and the least height above the sphere of the line to it, which is
// how much air its light comes through (the eye's own height when the line rises from it).
export function sunClear(eye, sunDir, sunDist = 1.496e11) {
  const c = [eye[0], eye[1], eye[2] + RE], r = length(c);
  const toCentre = scale(c, -1 / r);
  const cosg = Math.min(1, Math.max(-1, dot(sunDir, toCentre)));
  const gamma = Math.acos(cosg), rho = Math.asin(Math.min(1, RE / r)), s = Math.asin(SUN_RADIUS / sunDist);
  const x = Math.min(1, Math.max(-1, (gamma - rho) / s));   // the limb across the disc, -1 to 1
  const clear = 0.5 + (x * Math.sqrt(1 - x * x) + Math.asin(x)) / Math.PI;   // a circle's area beyond a chord
  const height = cosg > 0 ? r * Math.sin(gamma) - RE : r - RE;
  return { clear, height, gamma, rho, radius: s };
}

// The sunlight left after it grazes the air at that least height: the globe's own Rayleigh air
// (earth.js: 5.8, 13.5, 33.1 per 1e6 m at the ground, 8 km scale height) along a line through a
// spherical atmosphere, whose air mass is sqrt(2 pi R / H) times the vertical at the line's lowest
// point. Red, green, blue.
const BR = [5.8e-6, 13.5e-6, 33.1e-6], HR = 8000;
export function grazingLight(height) {
  const path = Math.sqrt(2 * Math.PI * RE * HR) * Math.exp(-Math.max(0, height) / HR);
  return BR.map((b) => Math.exp(-b * path));
}

// ---- the stars ----------------------------------------------------------------------------------------

// A spectral class (as Wikidata writes it: K5III, A0mA1 Va+DA2, M1-M2Ia-Iab, kA2hA5mA7V) to a B-V colour
// index: the textbook's pattern along the main sequence, giants of K and M a little redder. For a tint,
// not for photometry; 0.6 when the class says nothing.
const BV = { O: [-0.32, -0.3], B: [-0.3, -0.02], A: [0.0, 0.27], F: [0.3, 0.55], G: [0.58, 0.78], K: [0.81, 1.38], M: [1.4, 1.8] };
export function bvOfClass(sp) {
  const s = String(sp || '').replace(/^(sd|d|g|k|h|m|e)(?=[OBAFGKM])/, '');
  const m = /([OBAFGKMCSNRWD])(\d+(?:\.\d+)?)?/.exec(s);
  if (!m) return 0.6;
  const c = m[1], sub = m[2] === undefined ? 5 : Math.min(9.9, Number(m[2]));
  if (c === 'C' || c === 'S' || c === 'N' || c === 'R') return 2.2;
  if (c === 'W') return -0.25;
  if (c === 'D') return 0.0;
  const [a, b] = BV[c];
  let bv = a + ((b - a) * sub) / 10;
  if ((c === 'K' || c === 'M') && /I/.test(s.slice(m.index + m[0].length))) bv += 0.15;   // giants
  return bv;
}

// The packing of data/stars.js: 6 bytes a star. Written by tools/stars.mjs, read by the page.
const fromB64 = (b64) => {
  const bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
};
const toB64 = (bytes) => (typeof Buffer !== 'undefined' ? Buffer.from(bytes).toString('base64') : btoa(String.fromCharCode(...bytes)));
export const STAR_PACK = {
  pack(stars) {
    const b = new DataView(new ArrayBuffer(stars.length * 6));
    stars.forEach((s, i) => {
      b.setUint16(i * 6, Math.round((s.ra / 360) * 65536) % 65536, true);
      b.setInt16(i * 6 + 2, Math.round((s.dec / 90) * 32767), true);
      b.setUint8(i * 6 + 4, Math.max(0, Math.min(255, Math.round((s.v + 2) * 20))));
      b.setInt8(i * 6 + 5, Math.max(-127, Math.min(127, Math.round(s.bv * 50))));
    });
    return toB64(new Uint8Array(b.buffer));
  },
  // -> { ra, dec (radians, J2000.0), v, bv }, Float32Arrays
  unpack(set) {
    const bytes = fromB64(set.data), b = new DataView(bytes.buffer);
    const n = bytes.length / 6;
    if (n !== set.count) throw new Error(`the stars' data holds ${n} stars, not ${set.count}`);
    const ra = new Float32Array(n), dec = new Float32Array(n), v = new Float32Array(n), bv = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      ra[i] = (b.getUint16(i * 6, true) / 65536) * 2 * Math.PI;
      dec[i] = (b.getInt16(i * 6 + 2, true) / 32767) * (Math.PI / 2);
      v[i] = b.getUint8(i * 6 + 4) / 20 - 2;
      bv[i] = b.getInt8(i * 6 + 5) / 50;
    }
    return { ra, dec, v, bv, count: n };
  },
};

// A star's colour from B-V, as a tint for the eye: blue-white to orange, paler than a spectrum's.
const TINTS = [[-0.4, [0.66, 0.75, 1.0]], [0.0, [0.84, 0.89, 1.0]], [0.4, [1.0, 0.98, 0.95]], [0.8, [1.0, 0.92, 0.8]],
  [1.2, [1.0, 0.84, 0.66]], [1.7, [1.0, 0.75, 0.52]], [2.4, [1.0, 0.66, 0.42]]];
export function starTint(bv) {
  if (bv <= TINTS[0][0]) return TINTS[0][1].slice();
  for (let i = 1; i < TINTS.length; i++) {
    if (bv <= TINTS[i][0]) {
      const [a, ca] = TINTS[i - 1], [b, cb] = TINTS[i], f = (bv - a) / (b - a);
      return ca.map((c, k) => c + (cb[k] - c) * f);
    }
  }
  return TINTS[TINTS.length - 1][1].slice();
}

// A direction among the stars (right ascension and declination, J2000.0, radians) in the site frame
// now: through the axes of J2000.0 the core gives.
export function starDir(sky, ra, dec) {
  const c = Math.cos(dec), p = [c * Math.cos(ra), c * Math.sin(ra), Math.sin(dec)];
  return [
    sky.j2000Xe * p[0] + sky.j2000Ye * p[1] + sky.j2000Ze * p[2],
    sky.j2000Xn * p[0] + sky.j2000Yn * p[1] + sky.j2000Zn * p[2],
    sky.j2000Xu * p[0] + sky.j2000Yu * p[1] + sky.j2000Zu * p[2],
  ];
}

// Azimuth (from north through east) and elevation of a site direction, in degrees, seen from a point
// whose up is given; pole is the Earth's axis in the site frame, [0, cos lat, sin lat] at the start.
export function azEl(dir, up, pole) {
  const east0 = cross(pole, up);
  const east = length(east0) > 1e-9 ? scale(east0, 1 / length(east0)) : [1, 0, 0];
  const north = cross(up, east);
  const el = Math.asin(Math.max(-1, Math.min(1, dot(dir, up))));
  const az = Math.atan2(dot(dir, east), dot(dir, north));
  return { az: ((az * 180) / Math.PI + 360) % 360, el: (el * 180) / Math.PI };
}

// The packing of data/moon.js: outlines as [lon, lat] in tenths of a degree, craters as [lat, lon] in
// hundredths of a degree and the diameter in tenths of a km; 16-bit integers. Written by tools/moon.mjs.
export const MOON_PACK = {
  pack(plains, craters) {
    let points = 0;
    const out = plains.map((p) => {
      const n = p.rings.reduce((a, r) => a + r.length, 0);
      points += n;
      const a = new Int16Array(n * 2);
      let k = 0;
      for (const r of p.rings) for (const [lon, lat] of r) { a[k++] = Math.round(lon * 10); a[k++] = Math.round(lat * 10); }
      return { name: p.name, rings: p.rings.map((r) => r.length), points: toB64(new Uint8Array(a.buffer)) };
    });
    const c = new Int16Array(craters.length * 3);
    craters.forEach(([lat, lon, d], i) => { c[i * 3] = Math.round(lat * 100); c[i * 3 + 1] = Math.round(lon * 100); c[i * 3 + 2] = Math.round(d * 10); });
    return { plains: out, craters: toB64(new Uint8Array(c.buffer)), points };
  },
  // -> [{ name, rings: [[[lon, lat], ...], ...] }]
  plains(list) {
    return list.map((p) => {
      const b = fromB64(p.points), a = new Int16Array(b.buffer, 0, b.length / 2);
      const rings = [];
      let k = 0;
      for (const n of p.rings) {
        const r = [];
        for (let i = 0; i < n; i++, k += 2) r.push([a[k] / 10, a[k + 1] / 10]);
        rings.push(r);
      }
      return { name: p.name, rings };
    });
  },
  // -> Float32Array of [lat, lon, diameter km] triples
  craters(set) {
    const b = fromB64(set.data), a = new Int16Array(b.buffer, 0, b.length / 2);
    if (a.length !== set.count * 3) throw new Error(`the Moon's data holds ${a.length / 3} craters, not ${set.count}`);
    const out = new Float32Array(a.length);
    for (let i = 0; i < a.length; i += 3) { out[i] = a[i] / 100; out[i + 1] = a[i + 1] / 100; out[i + 2] = a[i + 2] / 10; }
    return out;
  },
};
