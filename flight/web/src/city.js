// Dallas's skyline from dallas-skyline.json: the towers a crew picks out on a night approach to
// 17C, each with what marks it after dark — Reunion Tower's ball of 259 lights, the green outline of Bank
// of America Plaza, Renaissance Tower's crosses, the red Pegasus — and the rest of downtown, Uptown, Las
// Colinas and Fort Worth as towers of lit windows. Low polygon; the windows are one shared texture whose
// lit panes glow as the sun goes down. GPLv3.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { xz } from './scene-math.js';
import { haze } from './haze.js';
import { COLOURS } from './airport-layout.js';
import { LightSet } from './lights.js';
import { rng } from './terrain.js';

const WIN = { w: 32, h: 128 };   // metres of facade the window texture covers

function facadeTextures() {
  const W = 256, H = 1024, r = rng(214);
  const day = document.createElement('canvas'), night = document.createElement('canvas');
  day.width = night.width = W;
  day.height = night.height = H;
  const d = day.getContext('2d'), n = night.getContext('2d');
  d.fillStyle = '#3c4a58';
  d.fillRect(0, 0, W, H);
  n.fillStyle = '#000';
  n.fillRect(0, 0, W, H);
  const floors = 32, cols = 20, fw = W / cols, fh = H / floors;
  for (let f = 0; f < floors; ++f) {
    for (let c = 0; c < cols; ++c) {
      const shade = 70 + Math.floor(r() * 40);
      d.fillStyle = `rgb(${shade - 20},${shade},${shade + 18})`;
      d.fillRect(c * fw + 1, f * fh + 6, fw - 2, fh - 9);
      if (r() < 0.42) {
        const warm = r() < 0.7;
        n.fillStyle = warm ? `rgba(255,${200 + Math.floor(r() * 40)},${130 + Math.floor(r() * 50)},${0.55 + r() * 0.45})` : `rgba(200,225,255,${0.5 + r() * 0.4})`;
        n.fillRect(c * fw + 1, f * fh + 6, fw - 2, fh - 9);
      }
    }
  }
  const make = (c, srgb) => {
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    return t;
  };
  return { day: make(day, true), night: make(night, true) };
}

// A prism of any footprint, its sides given window coordinates in metres, a roof on top.
function prism(footprint, h, y0 = 0) {
  const pos = [], uv = [];
  let run = 0;
  for (let k = 0; k < footprint.length; ++k) {
    const [ax, az] = footprint[k], [bx, bz] = footprint[(k + 1) % footprint.length];
    const len = Math.hypot(bx - ax, bz - az);
    const u0 = run / WIN.w, u1 = (run + len) / WIN.w, v0 = y0 / WIN.h, v1 = (y0 + h) / WIN.h;
    pos.push(ax, y0, az, bx, y0, bz, bx, y0 + h, bz, ax, y0, az, bx, y0 + h, bz, ax, y0 + h, az);
    uv.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
    run += len;
  }
  for (let k = 1; k < footprint.length - 1; ++k) {
    for (const [x, z] of [footprint[0], footprint[k + 1], footprint[k]]) {
      pos.push(x, y0 + h, z);
      uv.push(0, 0);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

const rect = (cx, cz, w, d) => [[cx - w / 2, cz - d / 2], [cx + w / 2, cz - d / 2], [cx + w / 2, cz + d / 2], [cx - w / 2, cz + d / 2]];
const octagon = (cx, cz, w, cut) => {
  const a = w / 2, b = a - cut;
  return [[cx - b, cz - a], [cx + b, cz - a], [cx + a, cz - b], [cx + a, cz + b], [cx + b, cz + a], [cx - b, cz + a], [cx - a, cz + b], [cx - a, cz - b]];
};

export class City {
  constructor(o, uniforms, nightGain, groundHeight) {
    this.group = new THREE.Group();
    this.lights = new LightSet();
    this.o = o;
    this.uniforms = uniforms;
    this.nightGain = nightGain;
    this.ground = groundHeight;
    this.towers = [];       // window-textured geometry
    this.plain = [];        // concrete and metal
    this.dark = [];
    this.tex = facadeTextures();
  }

  build(skyline, clusters) {
    for (const b of skyline) this.landmark(b);
    const r = rng(77);
    for (const c of clusters) {
      const [cx, cz] = xz(this.o, c.lat, c.lon);
      for (let k = 0; k < c.n; ++k) {
        const a = r() * Math.PI * 2, d = Math.sqrt(r()) * c.r;
        const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
        const h = c.hMin + (c.hMax - c.hMin) * r() ** 1.6, w = 26 + r() * 22, dd = 22 + r() * 20;
        const y0 = this.ground(x, z);
        this.towers.push(prism(rect(x, z, w, dd), h, 0).translate(0, y0, 0));
        if (h > 120) this.lights.add(x, y0 + h + 2, z, COLOURS.red, { size: 1.8, flash: [1.5, r(), 0.45] });
        if (r() < 0.3) this.crownLights(x, y0 + h, z, w, dd, r() < 0.5 ? [0.5, 0.75, 1.0] : COLOURS.white);
      }
    }
    this.flush();
    return this;
  }

  crownLights(x, y, z, w, d, colour) {
    const corners = rect(x, z, w, d);
    for (let k = 0; k < 4; ++k) {
      const [ax, az] = corners[k], [bx, bz] = corners[(k + 1) % 4], len = Math.hypot(bx - ax, bz - az);
      for (let s = 0; s <= len; s += 4) this.lights.add(ax + ((bx - ax) * s) / len, y + 0.5, az + ((bz - az) * s) / len, colour.map((v) => v * 0.8), { size: 1.25 });
    }
  }

  // Points every few metres along a line: the way an outline of neon or argon reads at night.
  line(a, b, colour, step = 3.5, size = 1.35) {
    const len = a.distanceTo(b);
    for (let s = 0; s <= len; s += step) {
      const p = a.clone().lerp(b, s / len);
      this.lights.add(p.x, p.y, p.z, colour, { size });
    }
  }

  landmark(b) {
    const [x, z] = xz(this.o, b.lat, b.lon), y0 = this.ground(x, z);
    const V = (px, py, pz) => new THREE.Vector3(px, y0 + py, pz);
    switch (b.kind) {
      case 'reunion': return this.reunion(x, y0, z);
      case 'outline': {
        const fp = octagon(x, z, b.w, b.w * 0.18);
        this.towers.push(prism(fp, b.h - 12).translate(0, y0, 0));
        this.plain.push(prism(octagon(x, z, b.w * 0.6, b.w * 0.1), 12, b.h - 12).translate(0, y0, 0));
        for (const [px, pz] of fp) this.line(V(px, 0, pz), V(px, b.h - 12, pz), b.colour, 3.2, 1.3);
        for (let k = 0; k < fp.length; ++k) this.line(V(...[fp[k][0], b.h - 12, fp[k][1]]), V(fp[(k + 1) % fp.length][0], b.h - 12, fp[(k + 1) % fp.length][1]), b.colour, 2.8, 1.3);
        this.lights.add(x, y0 + b.h + 1, z, COLOURS.red, { size: 2, flash: [1.5, 0, 0.5] });
        return;
      }
      case 'cross': {
        this.towers.push(prism(rect(x, z, b.w, b.d), b.roof).translate(0, y0, 0));
        for (const s of [-1, 1]) this.dark.push(new THREE.CylinderGeometry(0.6, 1.2, b.h - b.roof, 6).translate(x + s * 8, y0 + b.roof + (b.h - b.roof) / 2, z));
        // the crosses: an X of white lights on each face, three tall
        for (const [ax, az, bx, bz] of [[x - b.w / 2, z - b.d / 2 - 0.5, x + b.w / 2, z - b.d / 2 - 0.5], [x + b.w / 2, z + b.d / 2 + 0.5, x - b.w / 2, z + b.d / 2 + 0.5],
          [x - b.w / 2 - 0.5, z + b.d / 2, x - b.w / 2 - 0.5, z - b.d / 2], [x + b.w / 2 + 0.5, z - b.d / 2, x + b.w / 2 + 0.5, z + b.d / 2]]) {
          const span = Math.hypot(bx - ax, bz - az);
          for (let k = 0; k < 3; ++k) {
            const ya = b.roof * (0.35 + k * 0.2), yb = ya + span * 0.9;
            this.line(V(ax, ya, az), V(bx, yb, bz), b.colour, 3.4, 1.25);
            this.line(V(ax, yb, az), V(bx, ya, bz), b.colour, 3.4, 1.25);
          }
        }
        for (const s of [-1, 1]) this.lights.add(x + s * 8, y0 + b.h + 0.5, z, COLOURS.red, { size: 1.8, flash: [1.5, 0.3, 0.5] });
        return;
      }
      case 'gable': {
        this.towers.push(prism(rect(x, z, b.w, b.d), b.h - 36).translate(0, y0, 0));
        const g = new THREE.CylinderGeometry(0, b.w * 0.7, 36, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 0.72).translate(x, y0 + b.h - 18, z);
        this.plain.push(g);
        this.line(V(x - b.w / 2, b.h - 36, z), V(x, b.h, z), COLOURS.white, 3, 1.2);
        this.line(V(x + b.w / 2, b.h - 36, z), V(x, b.h, z), COLOURS.white, 3, 1.2);
        return;
      }
      case 'keyhole': {
        this.towers.push(prism(rect(x, z, b.w, b.d), b.h - 42).translate(0, y0, 0));
        for (const s of [-1, 1]) this.towers.push(prism(rect(x + s * (b.w / 4 + 3), z, b.w / 2 - 6, b.d), 42, b.h - 42).translate(0, y0, 0));
        this.plain.push(prism(rect(x, z, b.w, b.d), 4, b.h - 4).translate(0, y0, 0));
        return;
      }
      case 'prism': {
        // Fountain Place: a square that rises into sloped planes, a different peak on every side
        const a = b.w / 2;
        const g = new THREE.BufferGeometry();
        const base = [[x - a, z - a], [x + a, z - a], [x + a, z + a], [x - a, z + a]];
        const tops = [b.h * 0.62, b.h * 0.78, b.h, b.h * 0.7];
        const apex = [x + a * 0.55, y0 + b.h, z + a * 0.55];
        const pos = [], uv = [];
        for (let k = 0; k < 4; ++k) {
          const [ax, az] = base[k], [bx, bz] = base[(k + 1) % 4];
          pos.push(ax, y0, az, bx, y0, bz, bx, y0 + tops[(k + 1) % 4], bz, ax, y0, az, bx, y0 + tops[(k + 1) % 4], bz, ax, y0 + tops[k], az);
          uv.push(0, 0, b.w / WIN.w, 0, b.w / WIN.w, tops[(k + 1) % 4] / WIN.h, 0, 0, b.w / WIN.w, tops[(k + 1) % 4] / WIN.h, 0, tops[k] / WIN.h);
          pos.push(ax, y0 + tops[k], az, bx, y0 + tops[(k + 1) % 4], bz, ...apex);
          uv.push(0, 0, 0, 0, 0, 0);
        }
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        g.computeVertexNormals();
        this.towers.push(g);
        for (let k = 0; k < 4; ++k) this.line(V(base[k][0], tops[k], base[k][1]), new THREE.Vector3(...apex), b.colour, 3.2, 1.25);
        return;
      }
      case 'crown': {
        this.towers.push(prism(rect(x, z, b.w, b.d), b.h - 20).translate(0, y0, 0));
        this.plain.push(prism(rect(x, z, b.w * 0.7, b.d * 0.7), 20, b.h - 20).translate(0, y0, 0));
        this.crownLights(x, y0 + b.h - 20, z, b.w, b.d, [0.55, 0.8, 1.0]);
        return;
      }
      case 'pegasus': {
        this.towers.push(prism(rect(x, z, b.w, b.d), b.h).translate(0, y0, 0));
        this.dark.push(new THREE.BoxGeometry(2, 14, 2).translate(x, y0 + b.h + 7, z));
        // the flying red horse, a few strokes of neon, on both faces of its sign
        const horse = [[-6, 0], [-3, 2], [1, 2], [4, 4], [6, 6], [5, 3], [7, 1], [4, 0], [3, -3], [1, -1], [-2, -1], [-4, -3], [-6, 0]];
        const wing = [[-1, 2], [-3, 7], [0, 5], [2, 9], [3, 4]];
        for (const shape of [horse, wing]) {
          for (let k = 0; k < shape.length - 1; ++k) {
            const [ax, ay] = shape[k], [bx, by] = shape[k + 1];
            this.line(V(x + ax, b.h + 16 + ay, z - 1.2), V(x + bx, b.h + 16 + by, z - 1.2), COLOURS.red, 1.0, 1.15);
          }
        }
        return;
      }
      case 'omni': {
        this.towers.push(prism(rect(x, z, b.w, b.d), b.h).translate(0, y0, 0));
        // its facade of coloured lights: bands of colour across the north face
        const bands = [[1.0, 0.25, 0.35], [1.0, 0.6, 0.15], [0.3, 0.6, 1.0], [0.6, 0.3, 1.0]];
        for (let fy = 6; fy < b.h; fy += 4) {
          const c = bands[Math.floor(fy / 24) % bands.length];
          for (let fx = -b.w / 2 + 2; fx < b.w / 2; fx += 4) this.lights.add(x + fx, y0 + fy, z - b.d / 2 - 0.5, c.map((v) => v * 0.7), { size: 1.1 });
        }
        return;
      }
      default:
        this.towers.push(prism(rect(x, z, b.w, b.d), b.h).translate(0, y0, 0));
        if (b.h > 150) this.lights.add(x, y0 + b.h + 1, z, COLOURS.red, { size: 1.8, flash: [1.5, 0.7, 0.5] });
    }
  }

  // Reunion Tower: four concrete shafts and, 150 m up, a geodesic ball of aluminium struts with a light
  // at each of its 259 joints; floors of windows inside the ball's lower half.
  reunion(x, y0, z) {
    const R = 18, cy = y0 + 152;
    this.plain.push(new THREE.CylinderGeometry(4.2, 4.6, 150, 14).translate(x, y0 + 75, z));
    for (let k = 0; k < 3; ++k) {
      const a = (k / 3) * Math.PI * 2 + 0.3;
      this.plain.push(new THREE.CylinderGeometry(3.0, 3.3, 142, 12).translate(x + Math.cos(a) * 7.5, y0 + 71, z + Math.sin(a) * 7.5));
    }
    this.plain.push(new THREE.CylinderGeometry(14.5, 14.5, 12, 24).translate(x, cy - 5, z));
    this.towers.push(new THREE.CylinderGeometry(15, 15, 10, 24, 1, true).translate(x, cy - 4, z));
    const ball = new THREE.IcosahedronGeometry(R, 3).translate(x, cy, z);
    this.ballGeometry = ball;
    this.ballCentre = new THREE.Vector3(x, cy, z);
    this.dark.push(new THREE.CylinderGeometry(0.5, 0.8, 6, 6).translate(x, cy + R + 3, z));
    // 259 lights on a Fibonacci lattice, as evenly spread as the dome's joints are
    const n = 259, golden = Math.PI * (3 - Math.sqrt(5));
    for (let k = 0; k < n; ++k) {
      const yy = 1 - (k / (n - 1)) * 1.7;
      if (yy < -0.75) continue;
      const rr = Math.sqrt(1 - yy * yy), th = k * golden;
      this.lights.add(x + Math.cos(th) * rr * (R + 0.4), cy + yy * (R + 0.4), z + Math.sin(th) * rr * (R + 0.4), [1.0, 0.97, 0.9], { size: 1.35 });
    }
    this.lights.add(x, cy + R + 6.5, z, COLOURS.red, { size: 2, flash: [1.5, 0.1, 0.5] });
  }

  flush() {
    const merged = (list) => mergeGeometries(list.map((g) => {
      const n = g.index ? g.toNonIndexed() : g;
      for (const name of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(name)) n.deleteAttribute(name);
      if (!n.attributes.uv) n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
      if (!n.attributes.normal) n.computeVertexNormals();
      return n;
    }));
    const night = this.nightGain;
    const facade = haze(new THREE.MeshLambertMaterial({ map: this.tex.day, emissiveMap: this.tex.night, emissive: 0xffffff, emissiveIntensity: 1 }), this.uniforms);
    const compile = facade.onBeforeCompile;
    facade.onBeforeCompile = (shader) => {
      compile(shader);
      shader.uniforms.uNight = night;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uNight;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= 0.0028 * uNight;');
    };
    facade.customProgramCacheKey = () => 'facade';
    this.group.add(new THREE.Mesh(merged(this.towers), facade));
    this.group.add(new THREE.Mesh(merged(this.plain), haze(new THREE.MeshLambertMaterial({ color: 0xc9c4ba }), this.uniforms)));
    this.group.add(new THREE.Mesh(merged(this.dark), haze(new THREE.MeshLambertMaterial({ color: 0x3a3e44 }), this.uniforms)));
    if (this.ballGeometry) {
      const glassy = haze(new THREE.MeshStandardMaterial({ color: 0x2a3138, metalness: 0.8, roughness: 0.3, flatShading: true }), this.uniforms);
      this.group.add(new THREE.Mesh(this.ballGeometry, glassy));
      const edges = new THREE.EdgesGeometry(this.ballGeometry, 1);
      this.group.add(new THREE.LineSegments(edges, haze(new THREE.LineBasicMaterial({ color: 0xb8c0c8 }), this.uniforms)));
    }
  }
}
