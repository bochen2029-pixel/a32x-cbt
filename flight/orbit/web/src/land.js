// The coastlines, from data/land.js: decoded, tested for a point, and painted into the globe's mask; and
// the towns, from data/places.js, painted into its night lights. No three.js here, so the tests can read
// it. GPLv3.

import { LAKES, LAND, SCALE } from '../data/land.js';
import { PLACES, SCALE as PLACES_SCALE, STEPS } from '../data/places.js';

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

// The towns, from data/places.js: [{ lon, lat, pop }], the largest first.
export function placesOf(set = PLACES) {
  const pts = decodePoints(set.points), pops = decodeBytes(set.pops), out = [];
  for (let i = 0; i < set.count; i++) out.push({ lon: pts[2 * i] / PLACES_SCALE, lat: pts[2 * i + 1] / PLACES_SCALE, pop: Math.pow(10, pops[i] / STEPS) });
  return out;
}

function decodeBytes(b64) {
  const bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// How far a town's light spreads, km, and how bright its middle is, for its population: a large city
// spreads wide and is brighter at its heart, but not in proportion to its people.
export function townLight(pop) {
  const radius = 2.4 + 2.1 * Math.sqrt(pop / 1e5);
  return { radius, peak: Math.pow(pop, 0.92) / (radius * radius) / 2.2e4 };
}

// The night lights, equirectangular like the mask: width by width / 2 bytes, 0 dark to 255 brightest.
// Each town a soft spot of its own size with a fainter, wider spread round it for its suburbs and
// roads; where a spot is smaller than a texel it is shared between the four texels round it.
export function paintLights(width, places = placesOf()) {
  const height = width / 2, acc = new Float32Array(width * height);
  const km = 40075 / width;   // a texel's width at the equator
  const splat = (x, y, v) => {
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    for (const [dx, dy, w] of [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy]]) {
      const yy = y0 + dy;
      if (yy < 0 || yy >= height) continue;
      acc[yy * width + (((x0 + dx) % width) + width) % width] += v * w;
    }
  };
  for (const p of places) {
    const { radius, peak } = townLight(p.pop);
    const cx = ((p.lon + 180) / 360) * width - 0.5, cy = ((90 - p.lat) / 180) * height - 0.5;
    const shrink = Math.max(0.05, Math.cos((p.lat * Math.PI) / 180));
    for (const [r, k] of [[radius, peak], [radius * 2.6, peak * 0.06]]) {
      const sy = r / km, sx = sy / shrink;
      if (sy < 0.7 && sx < 0.7) { splat(cx, cy, k * Math.PI * sx * sy); continue; }
      const ry = Math.ceil(sy * 2.2), rx = Math.ceil(sx * 2.2);
      for (let dy = -ry; dy <= ry; dy++) {
        const yy = Math.round(cy) + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -rx; dx <= rx; dx++) {
          const xx = Math.round(cx) + dx;
          const u = (xx - cx) / sx, v = (yy - cy) / sy, d2 = u * u + v * v;
          if (d2 > 5) continue;
          acc[yy * width + ((xx % width) + width) % width] += k * Math.exp(-d2);
        }
      }
    }
  }
  const out = new Uint8Array(width * height);
  for (let i = 0; i < acc.length; i++) out[i] = Math.round(255 * (1 - Math.exp(-acc[i] * 5)));
  return out;
}

// The land mask as bytes (one a texel, red only), for a texture of one channel: a quarter of the memory
// of the canvas it is painted on.
export function maskBytes(width) {
  const c = paintMask(width), height = width / 2;
  const rgba = c.getContext('2d').getImageData(0, 0, width, height).data, out = new Uint8Array(width * height);
  for (let i = 0; i < out.length; i++) out[i] = rgba[i * 4];
  c.width = c.height = 1;   // let the canvas's memory go
  return out;
}
