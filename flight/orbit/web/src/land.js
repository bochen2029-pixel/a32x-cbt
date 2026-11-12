// The coastlines, from data/land.js: decoded, tested for a point, and painted into the globe's mask.
// No three.js here, so the tests can read it. GPLv3.

import { LAKES, LAND, SCALE } from '../data/land.js';

export function decodePoints(b64) {
  const bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

// The coastlines as rings of [lon, lat] degrees.
export function ringsOf(set) {
  const pts = decodePoints(set.points), out = [];
  let k = 0;
  for (const n of set.rings) {
    const ring = [];
    for (let i = 0; i < n; i++, k++) ring.push([pts[2 * k] / SCALE, pts[2 * k + 1] / SCALE]);
    out.push(ring);
  }
  return out;
}

// Whether a point is land: inside an odd number of land rings and no lake (even-odd, as painted).
export function isLand(latDeg, lonDeg, land = ringsOf(LAND), lakes = ringsOf(LAKES)) {
  const inside = (rings) => {
    let odd = false;
    for (const r of rings) {
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const [xi, yi] = r[i], [xj, yj] = r[j];
        if ((yi > latDeg) !== (yj > latDeg) && lonDeg < ((xj - xi) * (latDeg - yi)) / (yj - yi) + xi) odd = !odd;
      }
    }
    return odd;
  };
  return inside(land) && !inside(lakes);
}

// The land mask, equirectangular: white land, black water; lakes cut out.
export function paintMask(width) {
  const height = width / 2;
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, width, height);
  const fill = (set, colour) => {
    const pts = decodePoints(set.points);
    g.fillStyle = colour;
    g.beginPath();
    let k = 0;
    for (const n of set.rings) {
      for (let i = 0; i < n; i++, k++) {
        const x = ((pts[2 * k] / SCALE + 180) / 360) * width, y = ((90 - pts[2 * k + 1] / SCALE) / 180) * height;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.closePath();
    }
    g.fill('evenodd');
  };
  fill(LAND, '#fff');
  fill(LAKES, '#000');
  return c;
}
