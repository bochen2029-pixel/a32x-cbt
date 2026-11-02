// An airport, drawn: what airport-layout.js lays out, made into meshes and light points. Paint is
// geometry, not texture, so a stripe is as sharp at 8 km as at 80 m; every surface of one kind is one
// draw call, every light one more. Adapted from the visuals study's KDFW mockup (fbw-desktop,
// 2026-11-01). GPLv3.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  COLOURS, GROUND_CELL_M, layoutBuildings, layoutRunway, papiShowsWhite, runwayExtent, runwayFrame, subdivide, Y,
} from './airport-layout.js';
import { LightSet, lightMaterial } from './lights.js';

const DEG = Math.PI / 180;

// A flat rectangle on the ground, in cells no longer than GROUND_CELL_M, so that a curved earth bends it
// rather than buries it.
function quad(x0, z0, x1, z1, y) {
  const w = Math.abs(x1 - x0), l = Math.abs(z1 - z0);
  const cells = (d) => Math.max(1, Math.ceil(d / GROUND_CELL_M));
  const g = new THREE.PlaneGeometry(w, l, cells(w), cells(l)).rotateX(-Math.PI / 2);
  return g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
}

// A deterministic pseudo-random sequence, so the scene is the same every time.
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9 >>> 0) / 4294967296);
}

function canvasTexture(w, h, paint, repeat = null) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  paint(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

// Whether a point lies inside a ring of [x, z] points (even-odd).
function inside(points, x, z) {
  let odd = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, zi] = points[i], [xj, zj] = points[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) odd = !odd;
  }
  return odd;
}

export class Airport {
  // airport: validated (airport-layout.js); o: the view's origin. software: drawn by the CPU, so flat
  // colours instead of textures and smaller halos. gain: the lights' brightness for the time of day;
  // windows: how lit the buildings are.
  constructor(airport, o, { software = false, gain = 1, windows = 0.7, pixelRatio = 1 } = {}) {
    this.group = new THREE.Group();
    this.lists = { asphalt: [], taxiway: [], apron: [], shoulder: [], rubber: [], white: [], yellow: [], dark: [], concrete: [], glass: [] };
    this.lights = new LightSet();
    this.papiSet = new LightSet();
    this.papiLamps = [];
    this.designators = [];
    this.software = software;
    this.extent = [Infinity, Infinity, -Infinity, -Infinity];
    for (const rw of airport.runways) this.runway(airport, rw, o);
    this.buildings(airport, o, windows);
    this.flush();
    this.material = lightMaterial({ halo: software ? 1.6 : 3, gain, pixelRatio });
    this.group.add(this.lights.build(this.material));
    this.papiPoints = this.papiSet.build(this.material, { dynamic: true });
    this.group.add(this.papiPoints);
  }

  runway(airport, rw, o) {
    const f = runwayFrame(o, rw);
    const M = new THREE.Matrix4().makeRotationY(-f.headingDeg * DEG).setPosition(f.x, 0, f.z);
    const rot = new THREE.Matrix3().setFromMatrix4(M);
    const lay = layoutRunway(rw, airport.arrivals, airport.taxiwaySide[rw.ends[0].id] || 1);
    for (const r of lay.rects) this.lists[r.kind].push(quad(r.x0, r.z0, r.x1, r.z1, r.y).applyMatrix4(M));
    for (const b of lay.boxes) this.lists.dark.push(new THREE.BoxGeometry(b.w, b.h, b.d).translate(b.cx, b.cy, b.cz).applyMatrix4(M));
    const world = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(M);
    const turn = (axis) => (axis ? new THREE.Vector3(...axis).applyMatrix3(rot).toArray() : null);
    for (const l of lay.lights) {
      const p = world(l.x, l.y, l.z);
      this.lights.add(p.x, p.y, p.z, l.colour, { back: l.back, axis: turn(l.axis), beam: l.beam, size: l.size, flash: l.flash });
    }
    for (const l of lay.papi) {
      const p = world(l.x, l.y, l.z);
      this.papiLamps.push({ x: p.x, y: p.y, z: p.z, angle: l.angle, end: l.end, unit: l.unit });
      this.papiSet.add(p.x, p.y, p.z, COLOURS.red, { axis: turn(l.axis), beam: [0.85, 0.3], size: 2.9 });
    }
    for (const d of lay.designators) this.designators.push({ ...d, M });
    const { start, end } = runwayExtent(rw);
    for (const z of [start, end]) {
      for (const x of [-700, 700]) {
        const p = world(x, 0, z + Math.sign(z - (start + end) / 2) * 1100);
        this.extent = [Math.min(this.extent[0], p.x), Math.min(this.extent[1], p.z), Math.max(this.extent[2], p.x), Math.max(this.extent[3], p.z)];
      }
    }
  }

  // What the FAA's airport diagram draws, raised: the central terminal ramps, the terminals' footprints
  // at their heights with window lights along their faces and sodium masts over their ramps, the towers
  // each a shaft and a cab with its beacon; and the terminal spine between the ramps, lit.
  buildings(airport, o, windows) {
    const b = layoutBuildings(airport, o), L = this.lists, r = rng(1974);
    const window = COLOURS.white.map((v) => v * 0.5 * windows), sodium = COLOURS.sodium.map((v) => v * Math.max(0.3, windows));
    const shape = (points) => new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, -z)));
    if (b.spine) {
      L.asphalt.push(quad(b.spine.x0 - 16, b.spine.z0, b.spine.x0 + 16, b.spine.z1, Y.asphalt));
      for (let z = b.spine.z0; z < b.spine.z1; z += 45) for (const s of [-1, 1]) this.lights.add(b.spine.x0 + s * 20, 12, z, sodium, { size: 1.6 });
    }
    for (const ramp of b.ramps) {  // the ramps' triangles cut as the quads' cells are (subdivide)
      const flat = new THREE.ShapeGeometry(shape(ramp)).rotateX(-Math.PI / 2).translate(0, Y.asphalt - 0.02, 0).toNonIndexed();
      const cut = new THREE.BufferGeometry();
      cut.setAttribute('position', new THREE.BufferAttribute(subdivide(flat.attributes.position.array), 3));
      L.apron.push(cut);
    }
    for (const t of b.terminals) {
      L.concrete.push(new THREE.ExtrudeGeometry(shape(t.points), { depth: t.height, bevelEnabled: false }).rotateX(-Math.PI / 2));
      // along each face, outward: windows every 40 m, a mast every 160 m, 70 m out over the ramp
      let walked = 0;
      for (let i = 0; i < t.points.length; ++i) {
        const [x0, z0] = t.points[i], [x1, z1] = t.points[(i + 1) % t.points.length];
        const len = Math.hypot(x1 - x0, z1 - z0);
        if (len < 1e-6) continue;
        let nx = (z1 - z0) / len, nz = -(x1 - x0) / len;
        const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
        if (inside(t.points, mx + nx * 3, mz + nz * 3)) {
          nx = -nx;
          nz = -nz;
        }
        for (let s = (40 - (walked % 40)) % 40; s < len; s += 40) {
          const px = x0 + ((x1 - x0) * s) / len, pz = z0 + ((z1 - z0) * s) / len;
          if (r() < 0.8) this.lights.add(px + nx, t.height * 0.55, pz + nz, window, { size: 1.3 });
          if (Math.round((walked + s) / 40) % 4 === 0 && !inside(t.points, px + nx * 70, pz + nz * 70)) {
            this.lights.add(px + nx * 70, 25, pz + nz * 70, sodium, { size: 2.4 });
          }
        }
        walked += len;
      }
    }
    for (const { x, z, height: h } of b.towers) {
      L.concrete.push(new THREE.CylinderGeometry(5, 7, h, 12).translate(x, h / 2, z));
      L.glass.push(new THREE.CylinderGeometry(10, 7.5, 7, 12).translate(x, h + 3.5, z));
      L.concrete.push(new THREE.CylinderGeometry(11, 11, 1.2, 12).translate(x, h + 7.6, z));
      this.lights.add(x, h + 9.5, z, COLOURS.red, { size: 2.2, flash: [1.6, 0.2, 0.5] });
      this.lights.add(x + 1, h + 9.5, z, COLOURS.whiteHot, { size: 2.8, flash: [2.4, 0, 0.08] });
      this.lights.add(x + 1, h + 9.5, z, COLOURS.green, { size: 2.8, flash: [2.4, 1.2, 0.08] });
    }
  }

  // A material laid on the one below it by polygon offset: the depth buffer cannot part centimetres of
  // height at kilometres of range, so each layer is pulled toward the eye by its rank.
  layer(material, rank) {
    if (rank) {
      material.polygonOffset = true;
      material.polygonOffsetFactor = -rank;
      material.polygonOffsetUnits = -rank * 2;
    }
    return material;
  }

  // Everything of one kind merged into one mesh; then the designators, each a texture of its own.
  flush() {
    const L = this.lists, soft = this.software;
    const merged = (list) => mergeGeometries(list.map((g) => {
      const n = g.index ? g.toNonIndexed() : g;
      for (const name of Object.keys(n.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') n.deleteAttribute(name);
      if (!n.attributes.uv) n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
      if (!n.attributes.normal) n.computeVertexNormals();
      return n;
    }));
    // world-space UVs for the pavement, so a slab keeps its size whatever the quad
    const worldUV = (g, scale) => {
      const p = g.attributes.position, uv = new Float32Array(p.count * 2);
      for (let k = 0; k < p.count; ++k) {
        uv[k * 2] = p.getX(k) / scale;
        uv[k * 2 + 1] = p.getZ(k) / scale;
      }
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      return g;
    };
    const speckle = (g, w, h, base, n, seed) => {
      const r = rng(seed);
      g.fillStyle = base;
      g.fillRect(0, 0, w, h);
      for (let k = 0; k < n; ++k) {
        const v = Math.floor((r() - 0.5) * 60);
        g.fillStyle = `rgba(${128 + v},${128 + v},${128 + v},0.09)`;
        g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
      }
    };
    const lambert = (props, rank) => this.layer(new THREE.MeshLambertMaterial(props), rank);
    const add = (geometry, material) => {
      if (geometry) this.group.add(new THREE.Mesh(geometry, material));
    };
    // the grass of the airfield, mown and in November gone olive, a shade lighter than the country round
    const [x0, z0, x1, z1] = this.extent;
    const grass = soft ? lambert({ color: 0x6f7550 }, 1) : lambert({ map: canvasTexture(256, 256, (g, w, h) => {
      speckle(g, w, h, '#7b7f52', 4000, 3);
      for (let k = 0; k < 8; ++k) {
        g.fillStyle = k % 2 ? 'rgba(255,255,230,0.022)' : 'rgba(0,30,0,0.022)';
        g.fillRect(0, (k * h) / 8, w, h / 8);
      }
    }) }, 1);
    if (grass.map) {
      grass.map.wrapS = grass.map.wrapT = THREE.RepeatWrapping;
    }
    add(worldUV(quad(x0, z0, x1, z1, Y.grass), 100), grass);
    // concrete in slabs, as DFW's runways are; flat grey where the CPU draws every pixel
    const concrete = soft ? null : canvasTexture(512, 512, (g, w, h) => {
      speckle(g, w, h, '#8a8a84', 26000, 7);
      g.strokeStyle = 'rgba(40,40,40,0.28)';
      for (let k = 0; k <= 8; ++k) {
        g.beginPath(); g.moveTo(0, (k * h) / 8); g.lineTo(w, (k * h) / 8); g.stroke();
        g.beginPath(); g.moveTo((k * w) / 8, 0); g.lineTo((k * w) / 8, h); g.stroke();
      }
    });
    if (concrete) concrete.wrapS = concrete.wrapT = THREE.RepeatWrapping;
    const pavement = (shade) => lambert(concrete ? { map: concrete, color: shade } : { color: shade }, 3);
    add(L.asphalt.length && worldUV(merged(L.asphalt), 60), pavement(soft ? 0x8a8a84 : 0xffffff));
    add(L.taxiway.length && worldUV(merged(L.taxiway), 60), pavement(soft ? 0x7c7c76 : 0xe4e4e0));
    add(L.apron.length && worldUV(merged(L.apron), 60), this.layer(pavement(soft ? 0x84847e : 0xf0f0ec), 2));  // under the taxiways
    add(L.shoulder.length && merged(L.shoulder), lambert({ color: 0x6b6d64 }, 2));
    add(L.rubber.length && merged(L.rubber), lambert({ color: 0x1a1a1a, transparent: true, opacity: 0.35, depthWrite: false }, 4));
    add(L.white.length && merged(L.white), lambert({ color: 0xe2e0d8 }, 6));
    add(L.yellow.length && merged(L.yellow), lambert({ color: 0xd8a400 }, 6));
    add(L.dark.length && merged(L.dark), lambert({ color: 0x45453f }, 0));
    add(L.concrete.length && merged(L.concrete), lambert({ color: 0xcfcac0 }, 0));
    add(L.glass.length && merged(L.glass), lambert({ color: 0x24384a }, 0));
    for (const d of this.designators) {
      const tex = canvasTexture(256, 512, (g, w, h) => {
        g.clearRect(0, 0, w, h);
        g.fillStyle = '#ffffff';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        const number = d.text.replace(/[A-Z]/g, ''), letter = d.text.replace(/[0-9]/g, '');
        g.font = `bold ${h * 0.46}px "Arial Narrow", "Roboto Condensed", Arial, sans-serif`;
        g.save(); g.scale(0.62, 1); g.fillText(number, w / 2 / 0.62, h * 0.26); g.restore();
        if (letter) {
          g.save(); g.scale(0.62, 1); g.fillText(letter, w / 2 / 0.62, h * 0.76); g.restore();
        }
      });
      const q = new THREE.PlaneGeometry(10, d.len * 2.1).rotateX(-Math.PI / 2).rotateY(d.turn);
      q.translate(0, Y.paint, d.z + (d.turn ? 1 : -1) * d.len);
      q.applyMatrix4(d.M);
      add(q, lambert({ map: tex, transparent: true, depthWrite: false }, 6));
    }
  }

  // Each frame: the PAPI as the eye sees it, the flashers' time.
  update(eye, timeS) {
    const c = this.papiPoints.geometry.attributes.colour;
    this.papiLamps.forEach((l, k) => {
      const white = papiShowsWhite(eye, l);
      c.setXYZ(k, 1.0, white ? 0.96 : 0.07, white ? 0.88 : 0.05);
    });
    c.needsUpdate = true;
    this.material.uniforms.uTime.value = timeS;
  }
}
