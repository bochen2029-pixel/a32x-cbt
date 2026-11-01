// The ground around the airport: North Texas prairie and suburb, lakes, the Trinity, and at night the
// metroplex as a sea of street lights with the freeways drawn through it. Generated from dfw-region.json
// and a seed, so the page fetches nothing and the scene is the same every time. Flat over the airfield
// and 3 km round it, because the flight model's ground is flat there: the view must never draw a hill the aircraft
// would fly through. GPLv3.
//
// Frame: x east, y up, z south, metres, from the view's origin; y = 0 is the runway's elevation.

import * as THREE from 'three';
import { xz } from './scene-math.js';
import { haze } from './haze.js';
import { COLOURS, subdivide } from './airport-layout.js';
import { LightSet } from './lights.js';

export function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9 >>> 0) / 4294967296);
}

export function hash2(i, j) {
  let h = Math.imul(i, 374761393) + Math.imul(j, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function noise(x, y) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash2(i, j), b = hash2(i + 1, j), c = hash2(i, j + 1), d = hash2(i + 1, j + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, octaves = 5) {
  let s = 0, amp = 0.5, f = 1;
  for (let k = 0; k < octaves; ++k) {
    s += amp * noise(x * f, y * f);
    f *= 2.03;
    amp *= 0.5;
  }
  return s;
}

function distToPolyline(x, z, line) {
  let best = Infinity;
  for (let k = 0; k < line.length - 1; ++k) {
    const [ax, az] = line[k], [bx, bz] = line[k + 1];
    const dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - ax - t * dx, z - az - t * dz));
  }
  return best;
}

export class Terrain {
  // o: the view's origin; region: REGION; airportBox: [x0, z0, x1, z1] kept clear of town lights
  // grid: vertices along a side; lightShare: the share of the towns' lights drawn (the floor tier halves)
  constructor(uniforms, o, region, airportBox, { grid = 220, lightShare = 1 } = {}) {
    this.uniforms = uniforms;
    this.extent = 70000;
    this.grid = grid;
    this.lightShare = lightShare;
    // lake levels a few metres under the field (Grapevine 535 ft, Lewisville 522 ft, against 562 ft)
    this.lakes = region.lakes.map((l) => ({ ...l, pts: l.line.map(([la, lo]) => xz(o, la, lo)), level: l.w < 100 ? -5 : -9 }));
    this.towns = region.towns.map(([la, lo, rKm, density]) => {
      const [x, z] = xz(o, la, lo);
      return { x, z, r: rKm * 1000, density };
    });
    this.freeways = region.freeways.map((f) => f.map(([la, lo]) => xz(o, la, lo)));
    this.airportBox = airportBox;
    this.group = new THREE.Group();
    this.ground();
    this.water();
    this.lights = this.cityLights();
  }

  // How built-up a point is, 0 to 1: the towns' light, falling off from their centres.
  urban(x, z) {
    let u = 0;
    for (const t of this.towns) {
      const d2 = ((x - t.x) ** 2 + (z - t.z) ** 2) / (t.r * t.r);
      if (d2 < 4) u = Math.max(u, t.density * Math.exp(-d2 * 1.3));
    }
    return u * (0.75 + 0.5 * fbm(x / 3000 + 3, z / 3000 - 1, 3));
  }

  lakeAt(x, z) {
    let best = null;
    for (const l of this.lakes) {
      const d = distToPolyline(x, z, l.pts) / l.w;
      if (d < 2.2 && (!best || d < best.d)) best = { d, lake: l };
    }
    return best;
  }

  // Height above the runway: low rolling prairie, the creeks and lakes cut into it, flat at the field.
  height(x, z) {
    const [bx0, bz0, bx1, bz1] = this.airportBox;
    const r = Math.hypot(Math.max(bx0 - x, 0, x - bx1), Math.max(bz0 - z, 0, z - bz1));
    const ramp = Math.min(1, Math.max(0, (r - 3000) / 9000));
    let h = (fbm(x / 7000 + 5.1, z / 7000 - 2.3, 4) - 0.5) * 70 + (fbm(x / 1800, z / 1800, 3) - 0.5) * 16;
    h *= ramp;
    const lake = this.lakeAt(x, z);
    // the bed meets the water at d = 1, the shore the land's texture paints: the water fills its lake
    if (lake) h = Math.min(h, lake.lake.level - 4 + lake.d * lake.d * 4);
    return h;
  }

  // One grid, dense at the centre and sparse at the edge (x = R (0.12 t + 0.88 t^3)): no cracks between
  // levels of detail, 60 m cells near the field, 1.7 km at the edge.
  ground() {
    const n = this.grid, R = this.extent;
    const spread = (t) => R * (0.12 * t + 0.88 * t * t * t);
    const pos = new Float32Array((n + 1) * (n + 1) * 3), uv = new Float32Array((n + 1) * (n + 1) * 2);
    for (let j = 0; j <= n; ++j) {
      for (let i = 0; i <= n; ++i) {
        const x = spread(i / n * 2 - 1), z = spread(j / n * 2 - 1);
        const k = j * (n + 1) + i;
        pos[k * 3] = x; pos[k * 3 + 1] = this.height(x, z); pos[k * 3 + 2] = z;
        uv[k * 2] = x / (2 * R) + 0.5; uv[k * 2 + 1] = 0.5 - z / (2 * R);
      }
    }
    const index = [];
    for (let j = 0; j < n; ++j) {
      for (let i = 0; i < n; ++i) {
        const a = j * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1;
        index.push(a, c, b, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(index);
    g.computeVertexNormals();
    this.texture = this.landCover(R);
    const m = haze(new THREE.MeshLambertMaterial({ map: this.texture }), this.uniforms);
    this.groundMesh = new THREE.Mesh(g, m);
    this.groundMesh.renderOrder = -10;
    this.group.add(this.groundMesh);
  }

  // Each lake a ribbon along its line at its own level, sky-reflecting where the ground dips under it.
  water() {
    const geoms = [];
    for (const l of this.lakes) {
      const pts = l.pts, left = [], right = [];
      for (let k = 0; k < pts.length; ++k) {
        const [x, z] = pts[k];
        const [px, pz] = pts[Math.max(0, k - 1)], [nx, nz] = pts[Math.min(pts.length - 1, k + 1)];
        const dx = nx - px, dz = nz - pz, len = Math.hypot(dx, dz);
        const w = l.w * 1.6;
        left.push([x - (dz / len) * w, z + (dx / len) * w]);
        right.push([x + (dz / len) * w, z - (dx / len) * w]);
      }
      const shape = new THREE.Shape([...left, ...right.reverse()].map(([x, z]) => new THREE.Vector2(x, -z)));
      const g = new THREE.ShapeGeometry(shape, 1).rotateX(-Math.PI / 2);
      g.translate(0, l.level, 0);
      geoms.push(g.toNonIndexed());
    }
    const merged = new THREE.BufferGeometry();
    const total = geoms.reduce((n, g) => n + g.attributes.position.array.length, 0);
    const arr = new Float32Array(total);
    let at = 0;
    for (const g of geoms) {
      arr.set(g.attributes.position.array, at);
      at += g.attributes.position.array.length;
    }
    // cut so no edge is longer than 500 m: the earth's curve is applied a vertex at a time, and a lake's
    // triangles kilometres long would float metres over its shores (500 m: under 5 mm)
    merged.setAttribute('position', new THREE.Float32BufferAttribute(subdivide(arr, 500), 3));
    merged.computeVertexNormals();
    const m = haze(new THREE.MeshStandardMaterial({ color: 0x0e1f2a, roughness: 0.06, metalness: 0.0 }), this.uniforms);
    this.waterMesh = new THREE.Mesh(merged, m);
    this.waterMesh.renderOrder = -9;
    this.group.add(this.waterMesh);
  }

  // The metroplex at night: street lights on a grid in every built-up square kilometre, thicker where
  // the town is denser; the freeways as unbroken orange lines; nothing over water or on the airfield.
  cityLights() {
    const r = rng(8304), set = new LightSet(), cell = 600, half = 46000;
    const [bx0, bz0, bx1, bz1] = this.airportBox;
    const clear = (x, z) => !(x > bx0 && x < bx1 && z > bz0 && z < bz1) && !(this.lakeAt(x, z)?.d < 1.15);
    for (let cz = -half; cz < half; cz += cell) {
      for (let cx = -half; cx < half; cx += cell) {
        const u = this.urban(cx + cell / 2, cz + cell / 2);
        if (u < 0.08 || r() > Math.min(1, u * 1.6)) continue;
        const streets = u > 0.6 ? 3 : u > 0.3 ? 2 : 1;
        for (let s = 0; s < streets; ++s) {
          const off = ((s + 0.5) / streets) * cell;
          for (let t = 0; t < cell; t += 105) {
            for (const [x, z] of [[cx + t, cz + off], [cx + off, cz + t]]) {
              if (r() > (0.35 + u * 0.6) * this.lightShare || !clear(x, z)) continue;
              const c = r() < 0.72 ? COLOURS.sodium : r() < 0.7 ? COLOURS.white : COLOURS.whiteHot;
              set.add(x + (r() - 0.5) * 20, this.height(x, z) + 7, z + (r() - 0.5) * 20, c.map((v) => v * (0.3 + 0.35 * r())), { size: 1.05 + r() * 0.4 });
            }
          }
        }
      }
    }
    for (const f of this.freeways) {
      for (let k = 0; k < f.length - 1; ++k) {
        const [ax, az] = f[k], [bx, bz] = f[k + 1], len = Math.hypot(bx - ax, bz - az);
        for (let s = 0; s < len; s += 55) {
          const x = ax + ((bx - ax) * s) / len, z = az + ((bz - az) * s) / len;
          if (!clear(x, z) || Math.abs(x) > half || Math.abs(z) > half) continue;
          for (const side of [-1, 1]) {
            const ox = (-(bz - az) / len) * 14 * side, oz = ((bx - ax) / len) * 14 * side;
            set.add(x + ox, this.height(x, z) + 11, z + oz, COLOURS.sodium.map((v) => v * 0.62), { size: 1.3 });
          }
        }
      }
    }
    return set;
  }

  // The land seen from the air, painted once into a canvas: prairie and pasture in quarter sections,
  // creeks lined with trees, suburbs as a grey grid of streets, the freeways, the lakes. 2048 px over
  // 140 km is 68 m a pixel; the airfield's own surfaces carry the detail close in.
  landCover(R) {
    const size = 2048, c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const toPx = (x, z) => [(x / (2 * R) + 0.5) * size, (z / (2 * R) + 0.5) * size];
    const m = size / (2 * R);
    const hex = (h) => {
      const n = parseInt(h, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    };
    const prairie = ['8f8a5c', '9a9466', '7d7a4f', '6f7a45', '86804f', '8c7651', '737a48', 'a09a6c', '7b8450'].map(hex);
    const suburb = hex('7d8075'), street = hex('5b5d58'), core = hex('8c8b86'), tree = hex('3f4a2d');
    // the town and creek fields are smooth: computed on a coarse grid, sampled between its points
    const cn = 513, U = new Float32Array(cn * cn), C = new Float32Array(cn * cn);
    for (let j = 0; j < cn; ++j) {
      for (let i = 0; i < cn; ++i) {
        const wx = (i / (cn - 1) - 0.5) * 2 * R, wz = (j / (cn - 1) - 0.5) * 2 * R;
        U[j * cn + i] = this.urban(wx, wz);
        C[j * cn + i] = Math.abs(fbm(wx / 6000 + 9, wz / 6000 + 4, 3) - 0.5);
      }
    }
    const sample = (A, x, y) => {
      const fx = (x / size) * (cn - 1), fy = (y / size) * (cn - 1);
      const i = Math.min(cn - 2, Math.floor(fx)), j = Math.min(cn - 2, Math.floor(fy)), a = fx - i, b = fy - j;
      return (A[j * cn + i] * (1 - a) + A[j * cn + i + 1] * a) * (1 - b) + (A[(j + 1) * cn + i] * (1 - a) + A[(j + 1) * cn + i + 1] * a) * b;
    };
    const img = g.createImageData(size, size), px = img.data;
    for (let y = 0; y < size; ++y) {
      for (let x = 0; x < size; ++x) {
        const wx = (x / size - 0.5) * 2 * R, wz = (y / size - 0.5) * 2 * R;
        // the land survey's grid: half-mile fields, square to north
        const fu = Math.floor(wx / 805), fv = Math.floor(wz / 805);
        const field = prairie[Math.floor(hash2(fu, fv) * prairie.length)];
        let col = field;
        const shade = 0.9 + 0.2 * hash2(fu * 7 + 1, fv * 3 + 5);
        let k = shade;
        const u = sample(U, x, y);
        if (u > 0.12) {
          // suburb: blocks of roofs and gardens on a street grid
          const sx = ((wx % 210) + 210) % 210, sz = ((wz % 210) + 210) % 210;
          const isStreet = sx < 26 || sz < 26;
          const mix = Math.min(1, (u - 0.12) * 2.2);
          const base = u > 0.8 ? core : suburb;
          const t = isStreet ? street : base;
          col = [field[0] + (t[0] - field[0]) * mix, field[1] + (t[1] - field[1]) * mix, field[2] + (t[2] - field[2]) * mix];
          k = 0.92 + 0.16 * hash2(Math.floor(wx / 70), Math.floor(wz / 70));
        }
        // trees along the creeks: a low-frequency ridge of noise
        if (sample(C, x, y) < 0.025 && u < 0.5) col = tree;
        const o = (y * size + x) * 4;
        px[o] = col[0] * k; px[o + 1] = col[1] * k; px[o + 2] = col[2] * k; px[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    // freeways
    g.strokeStyle = 'rgba(88,88,86,0.9)';
    g.lineWidth = 1.4;
    for (const f of this.freeways) {
      g.beginPath();
      f.forEach(([x, z], k) => (k ? g.lineTo : g.moveTo).call(g, ...toPx(x, z)));
      g.stroke();
    }
    // the lakes and the river
    g.strokeStyle = '#2a3c48';
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const l of this.lakes) {
      g.lineWidth = Math.max(1, l.w * 2 * m);
      g.beginPath();
      l.pts.forEach(([x, z], k) => (k ? g.lineTo : g.moveTo).call(g, ...toPx(x, z)));
      g.stroke();
    }
    // the airfield: mown grass over the whole box
    const [x0, z0, x1, z1] = this.airportBox;
    const [px0, pz0] = toPx(x0, z0), [px1, pz1] = toPx(x1, z1);
    g.fillStyle = '#76844c';
    g.fillRect(px0, pz0, px1 - px0, pz1 - pz0);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }
}
