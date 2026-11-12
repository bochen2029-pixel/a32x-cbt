// map-math.js — the map's arithmetic, without a browser: the conic a position and a velocity give, Kepler's
// problem to carry a state forward, the ground under it with the Earth turning, and the frame that turns with
// the Ring's orbit, where a rendezvous is drawn. ECI as the core's (orbit_core.h): z along the pole, the
// Earth-fixed frame at t = 0, the Earth turning at WE about +z. Two-body only: no air, no thrust. GPLv3.

import { RE, WE, add, cross, dot, inertialToEcef, length, scale, siteAxes, sub, unit } from './frames.js';

export const MU = 3.986004418e14;   // m3/s2: the core's (internal.h)
const D2R = Math.PI / 180;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// ---- the conic --------------------------------------------------------------------------------------
// From a position and a velocity: the orbit's plane (nHat, along the angular momentum), its shape (e, p, a),
// its nearest and farthest radii, its tilt to the equator, and a basis in its plane: P toward the periapsis
// (toward the craft when the orbit is round) and Q a quarter-turn on, so that r = rad(nu) (cos nu P + sin nu Q).
export function elements(r, v, mu = MU) {
  const rm = length(r), v2 = dot(v, v), h = cross(r, v), hm = length(h);
  const energy = v2 / 2 - mu / rm;
  const ev = sub(scale(r, v2 / mu - 1 / rm), scale(v, dot(r, v) / mu));
  const e = length(ev), p = (hm * hm) / mu;
  const nHat = hm > 0 ? scale(h, 1 / hm) : [0, 0, 1];
  const P = e > 1e-8 ? scale(ev, 1 / e) : unit(r), Q = cross(nHat, P);
  const nu = Math.atan2(dot(r, Q), dot(r, P));
  const a = energy !== 0 ? -mu / (2 * energy) : Infinity;
  const elliptic = e < 1 && energy < 0;
  return {
    r: rm, h: hm, nHat, energy, ev, e, p, a, P, Q, nu,
    rp: p / (1 + e), ra: elliptic ? p / (1 - e) : Infinity,
    inc: Math.acos(clamp(hm > 0 ? h[2] / hm : 1, -1, 1)) / D2R,
    period: elliptic ? 2 * Math.PI * Math.sqrt((a * a * a) / mu) : Infinity,
    tApo: elliptic ? timeToApo(e, a, nu, mu) : NaN,
  };
}

// Seconds from true anomaly nu to the farthest point of an ellipse.
export function timeToApo(e, a, nu, mu = MU) {
  const E = 2 * Math.atan(Math.sqrt((1 - e) / (1 + e)) * Math.tan(nu / 2));
  const M = E - e * Math.sin(E), n = Math.sqrt(mu / (a * a * a));
  let t = (Math.PI - M) / n;
  const period = (2 * Math.PI) / n;
  t %= period;
  return t < 0 ? t + period : t;
}

// The point of the conic at true anomaly nu, or null where the conic does not reach (a hyperbola's far side).
export function conicPoint(el, nu) {
  const d = 1 + el.e * Math.cos(nu);
  if (d <= 1e-6) return null;
  const rad = el.p / d;
  return add(scale(el.P, rad * Math.cos(nu)), scale(el.Q, rad * Math.sin(nu)));
}

// ---- Kepler's problem -------------------------------------------------------------------------------
// The state dt seconds on (dt may be negative), by the universal variable, for any conic: Stumpff's
// functions, Newton on Kepler's equation, then the Lagrange coefficients (Curtis, Orbital Mechanics for
// Engineering Students, algorithms 3.3 and 3.4; the starting guess for a hyperbola is Vallado's).
export function stumpffC(z) {
  if (z > 1e-6) return (1 - Math.cos(Math.sqrt(z))) / z;
  if (z < -1e-6) return (Math.cosh(Math.sqrt(-z)) - 1) / -z;
  return 1 / 2 - z / 24 + (z * z) / 720;
}
export function stumpffS(z) {
  if (z > 1e-6) { const s = Math.sqrt(z); return (s - Math.sin(s)) / (s * s * s); }
  if (z < -1e-6) { const s = Math.sqrt(-z); return (Math.sinh(s) - s) / (s * s * s); }
  return 1 / 6 - z / 120 + (z * z) / 5040;
}

export function kepler(r0, v0, dt, mu = MU) {
  if (dt === 0) return [r0.slice(), v0.slice()];
  const rm0 = length(r0), smu = Math.sqrt(mu), vr0 = dot(r0, v0) / rm0;
  const alpha = 2 / rm0 - dot(v0, v0) / mu;                 // 1 / a
  let t = dt;
  if (alpha > 1e-12) {                                      // an ellipse: whole turns change nothing
    const period = (2 * Math.PI) / (Math.sqrt(mu) * Math.pow(alpha, 1.5));
    t = dt - period * Math.round(dt / period);
  }
  let x;
  if (alpha > 1e-12) x = smu * alpha * t;
  else if (alpha < -1e-12) {
    const a = 1 / alpha, sg = Math.sign(t);
    x = sg * Math.sqrt(-a) * Math.log((-2 * mu * alpha * t) / (dot(r0, v0) + sg * Math.sqrt(-mu * a) * (1 - rm0 * alpha)));
    if (!Number.isFinite(x)) x = smu * Math.abs(alpha) * t;
  } else x = smu * t / rm0;
  for (let k = 0; k < 60; k++) {
    const z = alpha * x * x, C = stumpffC(z), S = stumpffS(z);
    const F = ((rm0 * vr0) / smu) * x * x * C + (1 - alpha * rm0) * x * x * x * S + rm0 * x - smu * t;
    const dF = ((rm0 * vr0) / smu) * x * (1 - alpha * x * x * S) + (1 - alpha * rm0) * x * x * C + rm0;
    const step = F / dF;
    x -= step;
    if (Math.abs(step) <= 1e-10 * Math.max(1, Math.abs(x))) break;
  }
  const z = alpha * x * x, C = stumpffC(z), S = stumpffS(z);
  const f = 1 - ((x * x) / rm0) * C, g = t - ((x * x * x) / smu) * S;
  const r = add(scale(r0, f), scale(v0, g)), rm = length(r);
  const fd = (smu / (rm * rm0)) * (alpha * x * x * x * S - x), gd = 1 - ((x * x) / rm) * C;
  return [r, add(scale(r0, fd), scale(v0, gd))];
}

// ---- frames ------------------------------------------------------------------------------------------
// v turned by angle about a unit axis (Rodrigues).
export function rotateAbout(v, axis, angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return add(add(scale(v, c), scale(cross(axis, v), s)), scale(axis, dot(axis, v) * (1 - c)));
}

// An Earth-fixed vector at time t, in ECI: the inverse of frames.js's inertialToEcef.
export function ecefToEci(v, t) {
  const c = Math.cos(WE * t), s = Math.sin(WE * t);
  return [c * v[0] - s * v[1], s * v[0] + c * v[1], v[2]];
}

// The site frame of a start point (east, north, up at it, fixed to the Earth, its origin on the sphere) into
// Earth-fixed coordinates: a point, or a direction.
export function siteFrame(latDeg, lonDeg) {
  const { east, north, up } = siteAxes(latDeg, lonDeg);
  const dir = (d) => add(add(scale(east, d[0]), scale(north, d[1])), scale(up, d[2]));
  return { dir, point: (p) => dir([p[0], p[1], p[2] + RE]) };
}

// Latitude and longitude, degrees, under an ECI point at time t.
export function subPoint(r, t) {
  const e = inertialToEcef(r, t);
  return [Math.asin(clamp(e[2] / length(e), -1, 1)) / D2R, Math.atan2(e[1], e[0]) / D2R];
}

// ---- the ground track ---------------------------------------------------------------------------------
// Where the craft will be over the ground, every `step` seconds for `span` seconds from (r0, v0) at time t0,
// as [lat, lon] in degrees, Kepler's orbit under an Earth that turns; it stops where the path meets the ground.
export function groundTrack(r0, v0, t0, span, step, mu = MU) {
  const out = [];
  for (let dt = 0; dt <= span + 1e-9; dt += step) {
    const [r] = kepler(r0, v0, dt, mu);
    if (length(r) < RE) break;
    out.push(subPoint(r, t0 + dt));
  }
  return out;
}

// A track as runs that never cross the 180th meridian: an equirectangular map draws each run as one line.
export function splitTrack(track) {
  const runs = [];
  let run = [];
  for (let k = 0; k < track.length; k++) {
    if (run.length && Math.abs(track[k][1] - run[run.length - 1][1]) > 180) { runs.push(run); run = []; }
    run.push(track[k]);
  }
  if (run.length) runs.push(run);
  return runs;
}

// ---- the Ring ----------------------------------------------------------------------------------------
// The Ring's orbit is round. Its place comes in the readouts (site frame); its velocity follows from the
// readouts' relative velocity, which the core gives in the frame turning with the Ring's orbit:
// vrel = v - vRing - n nHat x (r - rRing) = v - n nHat x r, n = sqrt(MU / R^3). So nHat x r = (v - vrel) / n,
// and nHat, square to that and to the Ring's own radius, is fixed. s: the readouts; (r, v): the craft's ECI
// state; frame: siteFrame of the start point.
export function ringState(s, t, r, v, frame, mu = MU) {
  const rr = ecefToEci(frame.point([s.ringE, s.ringN, s.ringU]), t);
  const R = length(rr), n = Math.sqrt(mu / (R * R * R));
  const vrel = ecefToEci(frame.dir([s.vrelE, s.vrelN, s.vrelU]), t);
  const w = scale(sub(v, vrel), 1 / n);
  let nHat = unit(cross(rr, w));
  if (dot(cross(nHat, r), w) < 0) nHat = scale(nHat, -1);
  return {
    r: rr, v: scale(cross(nHat, rr), n), nHat, n, R,
    axis: ecefToEci(frame.dir([s.ringAxE, s.ringAxN, s.ringAxU]), t),
  };
}

// The frame that turns with the Ring's orbit, at its place rr: radial (up), along the track (ahead), and
// across it (the orbit's normal). A point in it: [ahead, up, across] of the Ring.
export function hillAxes(rr, nHat) {
  const up = unit(rr);
  return { up, ahead: cross(nHat, up), across: nHat };
}
export function toHill(d, ax) { return [dot(d, ax.ahead), dot(d, ax.up), dot(d, ax.across)]; }

// The craft's path seen from the Ring, in the frame turning with its orbit: [ahead, up, across, dt] every
// `step` seconds for `span`, both carried by Kepler (the Ring round its circle), until the craft's path meets
// the ground. The rendezvous's own picture.
export function relativePath(r, v, ring, span, step, mu = MU) {
  const out = [];
  for (let dt = 0; dt <= span + 1e-9; dt += step) {
    const [rc] = kepler(r, v, dt, mu);
    if (length(rc) < RE) break;                             // the path meets the ground
    const rr = rotateAbout(ring.r, ring.nHat, ring.n * dt);
    out.push([...toHill(sub(rc, rr), hillAxes(rr, ring.nHat)), dt]);
  }
  return out;
}

// The nearest the path comes to the Ring: { range, dt }, between samples by the parabola through the least.
export function closest(path) {
  let k = 0, best = Infinity;
  for (let i = 0; i < path.length; i++) {
    const d = Math.hypot(path[i][0], path[i][1], path[i][2]);
    if (d < best) { best = d; k = i; }
  }
  if (k === 0 || k === path.length - 1) return { range: best, dt: path[k] ? path[k][3] : NaN };
  const f = (i) => Math.hypot(path[i][0], path[i][1], path[i][2]);
  const y0 = f(k - 1), y1 = f(k), y2 = f(k + 1), den = y0 - 2 * y1 + y2;
  const off = den > 0 ? clamp((0.5 * (y0 - y2)) / den, -1, 1) : 0, h = path[k + 1][3] - path[k][3];
  return { range: Math.max(0, y1 - 0.25 * (y0 - y2) * off), dt: path[k][3] + off * h };
}

// How far round its orbit the Ring is ahead of the craft, degrees, -180..180, in the Ring's plane.
export function phaseAhead(r, ring) {
  const ax = hillAxes(r, ring.nHat);
  return Math.atan2(dot(ring.r, ax.ahead), dot(ring.r, ax.up)) / D2R;
}
