// The sketch's frames, without a browser. The core reports in the site frame: east, north and up at
// the start point, metres, fixed to the Earth. three.js draws as flight/web does: x east, y up, z south.
// Everything is drawn relative to the camera, whose place is kept here in doubles, so nothing near the
// eye loses precision to a large coordinate. GPLv3.

export const RE = 6371000;           // m, the core's sphere
export const WE = 7.2921159e-5;      // rad/s, the Earth's turn
const D2R = Math.PI / 180;

// A site vector [east, north, up] as three.js's [x, y, z].
export function three(v) { return [v[0], v[2], -v[1]]; }

export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const length = (a) => Math.sqrt(dot(a, a));
export const unit = (a) => { const n = length(a); return n > 0 ? scale(a, 1 / n) : [0, 0, 1]; };

// The body axes of a body -> site quaternion [w, x, y, z], in site coordinates: forward, right, down.
export function bodyAxes([w, x, y, z]) {
  return {
    fwd: [1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y)],
    right: [2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x)],
    down: [2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)],
  };
}

// The site's own axes in Earth-fixed coordinates (x toward 0 N 0 E, z the north pole).
export function siteAxes(latDeg, lonDeg) {
  const la = latDeg * D2R, lo = lonDeg * D2R;
  const up = [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
  const east = [-Math.sin(lo), Math.cos(lo), 0];
  return { east, north: cross(up, east), up };
}

// three.js's axes, in Earth-fixed coordinates: x is east, y up, z south. Columns of the matrix that
// takes a three.js direction to an Earth-fixed one.
export function threeToEcef(latDeg, lonDeg) {
  const { east, north, up } = siteAxes(latDeg, lonDeg);
  return { x: east, y: up, z: scale(north, -1) };
}

// An Earth-fixed direction at time t, from an inertial one: the Earth has turned WE t since the start.
export function inertialToEcef(v, t) {
  const c = Math.cos(WE * t), s = Math.sin(WE * t);
  return [c * v[0] + s * v[1], -s * v[0] + c * v[1], v[2]];
}

// An Earth-fixed direction in three.js's axes.
export function ecefToThree(v, latDeg, lonDeg) {
  const m = threeToEcef(latDeg, lonDeg);
  return [dot(m.x, v), dot(m.y, v), dot(m.z, v)];
}

// Latitude and longitude, degrees, of a site-frame point on or above the sphere.
export function latLonOf(p, latDeg, lonDeg) {
  const { east, north, up } = siteAxes(latDeg, lonDeg);
  const r = add(add(scale(east, p[0]), scale(north, p[1])), scale(up, p[2] + RE));
  return [Math.asin(r[2] / length(r)) / D2R, Math.atan2(r[1], r[0]) / D2R];
}

// Height of a site-frame point above the sphere.
export function heightOf(p) { return length([p[0], p[1], p[2] + RE]) - RE; }

// Whether the straight line from a to b clears the Earth (both site-frame points), with a margin.
export function inSight(a, b, margin = 50) {
  const o = [a[0], a[1], a[2] + RE], d = sub(b, a);
  const r = RE - margin;
  const A = dot(d, d), B = 2 * dot(o, d), C = dot(o, o) - r * r;
  const disc = B * B - 4 * A * C;
  if (A === 0 || disc <= 0) return true;
  const q = Math.sqrt(disc);
  const s1 = (-B - q) / (2 * A), s2 = (-B + q) / (2 * A);
  return !((s1 > 0 && s1 < 1) || (s2 > 0 && s2 < 1));
}
