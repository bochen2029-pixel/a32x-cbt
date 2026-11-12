// The spaceplane, mocked up: a delta lifting body 34 m long and 18 m across, the core's sixty tonnes.
// White above, black tiles below; two bells for the one fictional drive. Built in its own frame: x
// forward, y up, z to the right wing; the gear's wheels touch where the core's contact points are
// (orbit_core.cpp, GEAR). GPLv3.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const NOSE = 16, TAIL = -16;

// half-width, height above and below the centreline, and the centreline's drop, at x
export function section(x) {
  const s = (x - TAIL) / (NOSE - TAIL);
  if (s > 0.74) {
    const f = Math.max(0, (1 - s) / 0.26);
    return { w: 2.75 * Math.pow(f, 0.55), top: 1.75 * Math.pow(f, 0.62), bottom: 1.0 * Math.pow(f, 0.5), drop: 0.35 * (1 - f) };
  }
  const k = (0.74 - Math.max(s, 0.12)) / 0.62;
  const hump = Math.exp(-Math.pow((s - 0.66) / 0.06, 2)) * 0.32;
  const tail = s < 0.12 ? (0.12 - s) / 0.12 : 0;
  return { w: 2.75 + 0.35 * k - 0.25 * tail, top: 1.75 + hump - 0.35 * tail, bottom: 1.0 + 0.1 * k, drop: 0 };
}

function fuselage() {
  const stations = 40, around = 32, pos = [], index = [];
  for (let i = 0; i <= stations; i++) {
    const x = TAIL + ((NOSE - TAIL) * i) / stations;
    const c = section(x);
    for (let j = 0; j < around; j++) {
      const a = (j / around) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      const z = c.w * Math.sign(ca) * Math.pow(Math.abs(ca), 0.75);
      const y = -c.drop + (sa > 0 ? c.top : c.bottom) * Math.sign(sa) * Math.pow(Math.abs(sa), 0.8);
      pos.push(x, y, z);
    }
  }
  for (let i = 0; i < stations; i++) {
    for (let j = 0; j < around; j++) {
      const a = i * around + j, b = i * around + ((j + 1) % around), c = a + around, d = b + around;
      index.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g.toNonIndexed();
}

function slab(points, depth, bevel) {
  const shape = new THREE.Shape(points.map(([a, b]) => new THREE.Vector2(a, b)));
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2 });
}

// Colour by facing: tiles where the surface looks down, white elsewhere, a grey band between.
function paint(g, belly = -0.25) {
  const n = g.attributes.normal, col = new Float32Array(n.count * 3);
  for (let k = 0; k < n.count; k++) {
    const t = THREE.MathUtils.smoothstep(n.getY(k), belly - 0.12, belly + 0.12);
    const v = 0.06 + t * 0.84;
    col.set([v, v, v * 1.02], k * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function strip(g) {
  const n = g.index ? g.toNonIndexed() : g;
  for (const name of Object.keys(n.attributes)) if (!['position', 'normal', 'color'].includes(name)) n.deleteAttribute(name);
  return n;
}

export class Craft {
  constructor() {
    this.group = new THREE.Group();
    const wing = slab([[8, 0], [-12.6, 9.0], [-15.4, 9.0], [-15.4, -9.0], [-12.6, -9.0]], 0.42, 0.14)
      .rotateX(Math.PI / 2).translate(0, -0.35, 0);
    const fins = [-1, 1].map((side) => slab([[-8.0, 0], [-13.6, 4.4], [-15.6, 4.4], [-15.4, 0]], 0.3, 0.08)
      .translate(0, 0, -0.15).rotateX(side * 0.38).translate(0, 1.0, side * 2.3));
    const body = mergeGeometries([fuselage(), wing, ...fins].map((g) => paint(strip(g))));
    const skin = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.15 });
    this.body = new THREE.Mesh(body, skin);
    this.group.add(this.body);

    const glass = new THREE.MeshStandardMaterial({ color: 0x0b1118, roughness: 0.15, metalness: 0.6 });
    const windows = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 2.3), glass);
    windows.position.set(10.6, 1.38, 0);
    windows.rotation.z = -0.32;
    this.group.add(windows);

    const metal = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.35, metalness: 0.85 });
    const base = new THREE.Mesh(new THREE.CircleGeometry(1, 32).rotateY(-Math.PI / 2).scale(1, 1.4, 2.6).translate(TAIL - 0.01, 0.1, 0), metal);
    this.group.add(base);
    this.plumes = [];
    for (const z of [-1.3, 1.3]) {
      const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.2, 1.8, 24, 1, true).rotateZ(-Math.PI / 2), metal);
      bell.position.set(TAIL - 0.9, 0.15, z);
      bell.material.side = THREE.DoubleSide;
      this.group.add(bell);
      const plume = new THREE.Group();
      const outer = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 24, 1, true).rotateZ(Math.PI / 2).translate(-0.5, 0, 0),
        new THREE.MeshBasicMaterial({ color: 0x7fb2ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      const inner = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1, 16, 1, true).rotateZ(Math.PI / 2).translate(-0.5, 0, 0),
        new THREE.MeshBasicMaterial({ color: 0xe8f1ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      plume.add(outer, inner);
      plume.position.set(TAIL - 1.8, 0.15, z);
      this.group.add(plume);
      this.plumes.push(plume);
    }

    // gear: the core's contacts are body (10, 0, 3) and (-3, +-3.5, 3), x forward, z down
    this.gear = new THREE.Group();
    const strutM = new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.4, metalness: 0.7 });
    const tyre = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });
    for (const [x, z, r] of [[10, 0, 0.45], [-3, -3.5, 0.55], [-3, 3.5, 0.55]]) {
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 2.2), strutM);
      strut.position.set(x, -3 + r + 1.1, z);
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.4, 18).rotateX(Math.PI / 2), tyre);
      wheel.position.set(x, -3 + r, z);
      this.gear.add(strut, wheel);
    }
    this.group.add(this.gear);
  }

  // rel: the CG from the eye, three.js axes; fwd, up, right: the body's axes, three.js axes;
  // s: the core's readouts; t: seconds, for the flicker.
  update(rel, fwd, up, right, s, t) {
    this.group.position.set(rel[0], rel[1], rel[2]);
    const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(...fwd), new THREE.Vector3(...up), new THREE.Vector3(...right));
    this.group.quaternion.setFromRotationMatrix(m);
    this.gear.visible = s.gear > 0.5;
    const thrust = s.throttle;
    const vacuum = Math.min(1, s.alt / 60000);
    for (const [k, p] of this.plumes.entries()) {
      p.visible = thrust > 0.01;
      const flicker = 1 + 0.06 * Math.sin(t * 61 + k * 2.1) + 0.04 * Math.sin(t * 23 + k);
      // in the air a long, tight flame; above it a short glow that spreads and fades
      const length = (6 + 30 * thrust) * (1 - vacuum * 0.55) * flicker;
      const width = (0.9 + 0.3 * thrust) * (1 + vacuum * 0.9);
      p.scale.set(length, width, width);
      p.children[0].material.opacity = 0.35 * thrust * (1 - 0.6 * vacuum);
      p.children[1].material.opacity = 0.8 * thrust * (1 - 0.45 * vacuum);
    }
  }
}
