// An A320 to look at from outside: a low-polygon model, smoothly shaded, in a house livery painted by
// code. Built in JSBSim's structural frame from a320.json, so the gear stands on the points the
// flight model's gear stands on and every moving surface — slats, flaps, ailerons, spoilers, elevator,
// stabiliser, rudder, gear, fans — is set from the flight core's own state slots. GPLv3.

import * as THREE from 'three';
import { doorAngle } from './reverse.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COLOURS } from './airport-layout.js';
import { LightSet } from './lights.js';

const DEG = Math.PI / 180;

// Structural metres (x aft, y right, z up) to the model's frame (x right, y up, z aft), about the CG.
export function structuralMatrix(cg) {
  const axes = new THREE.Matrix4().set(0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1);
  return axes.multiply(new THREE.Matrix4().makeTranslation(-cg[0], -cg[1], -cg[2]));
}

// A monotone cubic through the fuselage's stations, so the nose rounds without bulging past its points.
function monotone(xs, ys) {
  const n = xs.length, d = new Array(n - 1), m = new Array(n);
  for (let k = 0; k < n - 1; ++k) d[k] = (ys[k + 1] - ys[k]) / (xs[k + 1] - xs[k]);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let k = 1; k < n - 1; ++k) m[k] = d[k - 1] * d[k] <= 0 ? 0 : (3 * (d[k - 1] + d[k])) / (2 / d[k - 1] * 0 + (d[k - 1] + 2 * d[k]) / d[k - 1] + (2 * d[k - 1] + d[k]) / d[k]);
  return (x) => {
    let k = 0;
    while (k < n - 2 && x > xs[k + 1]) ++k;
    const h = xs[k + 1] - xs[k], t = Math.max(0, Math.min(1, (x - xs[k]) / h));
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[k] + (t3 - 2 * t2 + t) * h * m[k] + (-2 * t3 + 3 * t2) * ys[k + 1] + (t3 - t2) * h * m[k + 1];
  };
}

function profile(stations) {
  const xs = stations.map((s) => s[0]);
  const crown = monotone(xs, stations.map((s) => s[1]));
  const keel = monotone(xs, stations.map((s) => s[2]));
  const half = monotone(xs, stations.map((s) => s[3]));
  return (x) => {
    const c = crown(x), k = keel(x);
    return { waist: (c + k) / 2, hz: Math.max(1e-3, (c - k) / 2), hw: Math.max(0, half(x)) };
  };
}

// The fuselage as two halves, left and right, each unrolled onto its own half of the livery: x along
// the texture, crown to keel down it.
function fuselage(prof, length, detail = 1) {
  const n = (k, lo) => Math.max(lo, Math.round(k * detail));
  const xs = [];
  for (let k = 0, m = n(22, 8); k <= m; ++k) xs.push(6 * (1 - Math.cos((k / m) * Math.PI / 2)));   // dense at the nose
  for (let k = 1, m = n(6, 2); k <= m; ++k) xs.push(6 + k * (18 / m));
  for (let k = 1, m = n(16, 6); k <= m; ++k) xs.push(24 + (length - 24) * (k / m));
  const nh = n(16, 6), pos = [], nor = [], uv = [], idx = [];
  const P = (x, a, s) => {
    const p = prof(x);
    return [x, s * p.hw * Math.sin(a), p.waist + p.hz * Math.cos(a)];
  };
  for (const side of [-1, 1]) {
    const base = pos.length / 3;
    for (let i = 0; i < xs.length; ++i) {
      for (let j = 0; j <= nh; ++j) {
        const a = (j / nh) * Math.PI, x = xs[i];
        const p = P(x, a, side);
        pos.push(...p);
        const e = 0.01;
        const dx = P(x + e, a, side).map((v, k) => (v - P(x - e, a, side)[k]) / (2 * e));
        const pr = prof(x);
        const da = [0, side * pr.hw * Math.cos(a), -pr.hz * Math.sin(a)];
        let n = new THREE.Vector3().crossVectors(new THREE.Vector3(...dx), new THREE.Vector3(...da)).multiplyScalar(side);
        if (n.lengthSq() < 1e-8 || x < 1e-3) n.set(-1, 0, 0);
        n.normalize();
        nor.push(n.x, n.y, n.z);
        uv.push(x / length, (side < 0 ? 0 : 0.5) + 0.5 * (j / nh));
      }
    }
    for (let i = 0; i < xs.length - 1; ++i) {
      for (let j = 0; j < nh; ++j) {
        const a = base + i * (nh + 1) + j, b = a + nh + 1, c = a + 1, d = b + 1;
        if (side > 0) idx.push(a, b, c, b, d, c);
        else idx.push(a, c, b, b, c, d);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// A wing, tailplane, fin or sharklet: airfoil sections lofted between stations. Each station has a
// leading edge, a chord, a twist, a thickness and the direction its thickness points (up for a wing,
// sideways for a fin). range is the share of chord to build, so a flap or an aileron is the same
// surface cut where its hinge is.
function airfoil(s, t, camber) {
  const yt = 5 * t * (0.2969 * Math.sqrt(s) - 0.126 * s - 0.3516 * s * s + 0.2843 * s ** 3 - 0.1036 * s ** 4);
  const p = 0.42, yc = camber * (s < p ? (2 * p * s - s * s) / (p * p) : ((1 - 2 * p) + 2 * p * s - s * s) / ((1 - p) ** 2));
  return [yc + yt, yc - yt];
}

function liftingSurface(stations, range = [0, 1], { n = 10, capTip = false, upperOnly = false } = {}) {
  const [c0, c1] = range;
  const loops = [], uv = [];
  stations.forEach((st, si) => {
    const tw = (st.twist || 0) * DEG;
    const up = new THREE.Vector3(...st.up).normalize();
    const fwd = new THREE.Vector3(1, 0, 0);
    const chordDir = fwd.clone().multiplyScalar(Math.cos(tw)).addScaledVector(up, -Math.sin(tw));
    const upDir = up.clone().multiplyScalar(Math.cos(tw)).addScaledVector(fwd, Math.sin(tw));
    const le = new THREE.Vector3(...st.le);
    const pts = [];
    const at = (s, k) => {
      const [u, l] = airfoil(s, st.t, st.camber || 0);
      return le.clone().addScaledVector(chordDir, s * st.chord).addScaledVector(upDir, (k ? u : l) * st.chord);
    };
    const ss = [];
    for (let k = 0; k <= n; ++k) ss.push(c0 + (c1 - c0) * (1 - Math.cos((k / n) * Math.PI)) / 2);
    for (let k = n; k >= 0; --k) {
      pts.push(at(ss[k], 1));
      uv.push(ss[k], si / (stations.length - 1));
    }
    if (!upperOnly) {
      for (let k = 0; k <= n; ++k) {
        pts.push(at(ss[k], 0));
        uv.push(ss[k], si / (stations.length - 1));
      }
    }
    loops.push(pts);
  });
  const m = loops[0].length, pos = [], idx = [];
  for (const loop of loops) for (const p of loop) pos.push(p.x, p.y, p.z);
  const closed = !upperOnly;
  for (let s = 0; s < loops.length - 1; ++s) {
    for (let k = 0; k < (closed ? m : m - 1); ++k) {
      const a = s * m + k, b = s * m + ((k + 1) % m), c = (s + 1) * m + k, d = (s + 1) * m + ((k + 1) % m);
      idx.push(a, c, b, b, c, d);
    }
  }
  const uvs = [...uv];
  if (capTip) {
    const last = loops[loops.length - 1], centre = new THREE.Vector3();
    last.forEach((p) => centre.add(p));
    centre.divideScalar(last.length);
    const ci = pos.length / 3;
    pos.push(centre.x, centre.y, centre.z);
    uvs.push(0.5, 1);
    const off = (loops.length - 1) * m;
    for (let k = 0; k < m; ++k) idx.push(off + k, off + ((k + 1) % m), ci);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  // face the first upper face along the first station's up; if it points in, every face does
  const p0 = loops[0][Math.floor(n / 2)], p1 = loops[0][Math.floor(n / 2) + 1], p2 = loops[1][Math.floor(n / 2)];
  const fn = new THREE.Vector3().crossVectors(p2.clone().sub(p0), p1.clone().sub(p0));
  if (fn.dot(new THREE.Vector3(...stations[0].up)) < 0) {
    const ix = g.index.array;
    for (let k = 0; k < ix.length; k += 3) [ix[k + 1], ix[k + 2]] = [ix[k + 2], ix[k + 1]];
  }
  g.computeVertexNormals();
  return g;
}

function mirrorY(g) {
  const m = g.clone();
  m.scale(1, -1, 1);
  const ix = m.index.array;
  for (let k = 0; k < ix.length; k += 3) [ix[k + 1], ix[k + 2]] = [ix[k + 2], ix[k + 1]];
  m.computeVertexNormals();
  return m;
}

// A part that turns about a hinge: its geometry is moved so the hinge's midpoint is its origin, and it
// hangs in a group placed there, which the update turns about the hinge's own axis.
function hinged(geometry, material, a, b) {
  const pivot = a.clone().add(b).multiplyScalar(0.5);
  geometry.translate(-pivot.x, -pivot.y, -pivot.z);
  const group = new THREE.Group();
  group.position.copy(pivot);
  group.add(new THREE.Mesh(geometry, material));
  group.userData = { pivot: pivot.clone(), axis: b.clone().sub(a).normalize() };
  return group;
}

function turn(group, angle, slide = null) {
  group.quaternion.setFromAxisAngle(group.userData.axis, angle);
  group.position.copy(group.userData.pivot);
  if (slide) group.position.add(slide);
}

// The livery, painted on a canvas: 2048 along the fuselage, the left side above the right. Text on the
// right side is drawn mirrored so it reads nose to tail from both sides.
function livery(prof, length, LIVERY) {
  const W = 2048, H = 512, c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const col = (x) => (x / length) * W;
  const row = (x, z, half) => {
    const p = prof(x);
    const a = Math.acos(Math.max(-1, Math.min(1, (z - p.waist) / p.hz)));
    return half * 256 + (a / Math.PI) * 256;
  };
  for (const half of [0, 1]) {
    const y0 = half * 256;
    g.fillStyle = LIVERY.base;
    g.fillRect(0, y0, W, 256);
    // the belly, below a line that sweeps up into the tail
    g.fillStyle = LIVERY.belly;
    g.beginPath();
    g.moveTo(0, y0 + 256);
    for (let x = 0; x <= length; x += 0.25) {
      const z = x < 25 ? -0.62 : -0.62 + (x - 25) * 0.11;
      g.lineTo(col(x), Math.min(y0 + 255, row(Math.max(1.2, x), z, half)));
    }
    g.lineTo(W, y0 + 256);
    g.fill();
    // the cheatlines, navy over teal, from behind the cockpit to the tail
    for (const [z0, z1, colour] of [[-0.18, -0.42, LIVERY.line1], [-0.47, -0.55, LIVERY.line2]]) {
      g.fillStyle = colour;
      g.beginPath();
      const xs = [];
      for (let x = 4.2; x <= length - 0.6; x += 0.25) xs.push(x);
      const lift = (x) => (x < 24 ? 0 : (x - 24) * 0.115);
      xs.forEach((x, k) => (k ? g.lineTo : g.moveTo).call(g, col(x), row(x, z0 + lift(x), half)));
      [...xs].reverse().forEach((x) => g.lineTo(col(x), row(x, z1 + lift(x), half)));
      g.fill();
    }
    // cabin windows
    g.fillStyle = '#1b1f26';
    for (let x = 7.25; x < 27.4; x += 0.533) {
      if ((x > 13.25 && x < 15.0) || x > 27.0) continue;
      const r0 = row(x, 0.62, half), r1 = row(x, 0.29, half), cx = col(x);
      g.beginPath();
      g.roundRect(cx - 6, r0, 12, r1 - r0, 5);
      g.fill();
    }
    // doors and exits, as outlines
    g.strokeStyle = 'rgba(70,76,84,0.9)';
    g.lineWidth = 2;
    for (const [xa, xb, za, zb] of [[5.62, 6.43, 1.35, -0.55], [27.85, 28.62, 1.3, -0.5], [13.45, 13.98, 0.85, 0.0], [14.35, 14.88, 0.85, 0.0]]) {
      g.beginPath();
      g.roundRect(col(xa), row((xa + xb) / 2, za, half), col(xb) - col(xa), row((xa + xb) / 2, zb, half) - row((xa + xb) / 2, za, half), 6);
      g.stroke();
    }
    // The flight deck's six windows as photographs of the A320 show them: one level band, top and bottom
    // edges horizontal, thin posts between. The windshield is laid out as seen head on — two panes either
    // side of a 9 cm centre post — and the side windows as seen from the side, leaning back like the
    // windshield. Every edge is cut into short pieces and each point found on the skin, so a straight
    // edge in its view stays straight on the curved nose.
    const onSkinFromFront = (y, z) => {
      let lo = 0.2, hi = 5;
      for (let k = 0; k < 40; ++k) {
        const m = (lo + hi) / 2, p = prof(m);
        if ((y / p.hw) ** 2 + ((z - p.waist) / p.hz) ** 2 > 1) lo = m;
        else hi = m;
      }
      const x = (lo + hi) / 2, p = prof(x);
      return [x, Math.atan2(y / p.hw, (z - p.waist) / p.hz)];
    };
    const onSkinFromSide = (x, z) => {
      const p = prof(x);
      return [x, Math.acos(Math.max(-1, Math.min(1, (z - p.waist) / p.hz)))];
    };
    const zLow = 1.0, zHigh = 1.48;
    const panes = [
      [onSkinFromFront, [[0.047, zLow], [0.97, zLow], [0.84, zHigh], [0.047, zHigh]]],
      [onSkinFromSide, [[2.5, zLow], [3.08, zLow], [3.12, zHigh], [2.68, zHigh]]],
      [onSkinFromSide, [[3.18, zLow], [3.6, zLow], [3.63, zHigh], [3.23, zHigh]]],
    ];
    g.fillStyle = '#0b0f14';
    g.strokeStyle = '#59606a';
    g.lineWidth = 1.5;
    g.lineJoin = 'round';
    for (const [toSkin, corners] of panes) {
      g.beginPath();
      corners.forEach(([u0, v0], k) => {
        const [u1, v1] = corners[(k + 1) % corners.length];
        for (let s = 0; s < 12; ++s) {
          const [x, a] = toSkin(u0 + ((u1 - u0) * s) / 12, v0 + ((v1 - v0) * s) / 12);
          (k + s ? g.lineTo : g.moveTo).call(g, col(x), half * 256 + (a / Math.PI) * 256);
        }
      });
      g.closePath();
      g.fill();
      g.stroke();
    }
    // the radome's seam, the arc under the windshield
    g.strokeStyle = 'rgba(120,126,134,0.8)';
    g.lineWidth = 1;
    g.beginPath();
    for (let s = 0; s <= 40; ++s) {
      const a = 0.04 + (s / 40) * 2.2, x = 1.86 + 0.18 * (a / 2.2) ** 2;
      (s ? g.lineTo : g.moveTo).call(g, col(x), half * 256 + (a / Math.PI) * 256);
    }
    g.stroke();
    // the title, ahead of the wing above the windows
    g.save();
    g.fillStyle = LIVERY.titleColour;
    g.font = 'bold 70px "Arial Black", "Segoe UI", Arial, sans-serif';
    g.textBaseline = 'middle';
    const tx = col(8.0), ty = row(8, 1.25, half);
    g.translate(tx + 120, ty);
    if (half === 1) g.scale(-1, 1);
    g.scale(1, 0.75);
    g.textAlign = 'center';
    g.fillText(LIVERY.title, 0, 0);
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.flipY = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function finLivery(LIVERY) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = LIVERY.tail;
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = LIVERY.tailMark;
  g.beginPath();   // a chevron rising aft
  g.moveTo(40, 30); g.lineTo(150, 160); g.lineTo(40, 230); g.lineTo(80, 230); g.lineTo(190, 160); g.lineTo(80, 30);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Airliner {
  // detail scales every count of segments: 1 for the aircraft flown, less for the ones parked
  constructor(A, { detail = 1 } = {}) {
    this.A = A;
    this.detail = detail;
    const n = (k, lo) => Math.max(lo, Math.round(k * detail));
    this.n = n;
    this.root = new THREE.Group();          // at the CG, turned by the attitude
    this.structure = new THREE.Group();     // structural metres inside it
    this.structure.matrixAutoUpdate = false;
    this.structure.matrix.copy(structuralMatrix(A.cg));
    this.root.add(this.structure);
    this.parts = {};
    this.wheelTurn = 0;
    const prof = profile(A.fuselage);
    this.prof = prof;
    const paint = new THREE.MeshStandardMaterial({ map: livery(prof, A.length, A.livery), roughness: 0.34, metalness: 0.0 });
    const white = new THREE.MeshStandardMaterial({ color: 0xe9ebee, roughness: 0.4, metalness: 0.0 });
    const grey = new THREE.MeshStandardMaterial({ color: 0xb9bec4, roughness: 0.45, metalness: 0.05 });
    const metal = new THREE.MeshStandardMaterial({ color: 0xd8dade, roughness: 0.22, metalness: 0.9 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x30343a, roughness: 0.55, metalness: 0.4 });
    const cowl = new THREE.MeshStandardMaterial({ color: A.livery.cowl, roughness: 0.32, metalness: 0.05 });
    const tyre = new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.9 });
    const strut = new THREE.MeshStandardMaterial({ color: 0x9a9fa6, roughness: 0.35, metalness: 0.7 });
    const fin = new THREE.MeshStandardMaterial({ map: finLivery(A.livery), roughness: 0.34 });
    fin.userData.flat = 0x14284b;
    paint.userData.flat = 0xeef0f2;
    this.materials = [paint, white, grey, metal, dark, cowl, tyre, strut, fin];
    const S = this.structure;
    this.fuselage = new THREE.Mesh(fuselage(prof, A.length, detail), paint);
    S.add(this.fuselage);
    // the tail cone's end, and the wing-to-body fairing under the centre section
    const cone = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 6).translate(A.length, 0, 1.05), dark);
    S.add(cone);
    const fairing = new THREE.SphereGeometry(1, 28, 14);
    fairing.scale(5.6, 2.02, 0.95).translate(16.6, 0, -1.55);
    S.add(new THREE.Mesh(fairing, grey));

    this.wings(white, metal, grey);
    this.tail(white, fin);
    this.engines(cowl, metal, dark, white);
    this.gear(strut, tyre, metal, dark);
    this.lights = this.navLights();
    S.add(this.lights.points);
    this.root.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
  }

  wing(side, white, metal) {
    const w = this.A.wing, tanLE = Math.tan(w.sweepLE * DEG), tanD = Math.tan(w.dihedral * DEG);
    const station = (y, extra = {}) => {
      const x = w.rootLE + (y - w.rootY) * tanLE;
      const te = y <= w.kinkY ? w.rootLE + w.rootChord : null;
      const kinkLE = w.rootLE + (w.kinkY - w.rootY) * tanLE, kinkChord = w.rootLE + w.rootChord - kinkLE;
      const chord = te !== null ? te - x : kinkChord + (w.tipChord - kinkChord) * ((y - w.kinkY) / (w.tipY - w.kinkY));
      const f = (y - w.rootY) / (w.tipY - w.rootY);
      const t = y <= w.kinkY ? w.thickness[0] + (w.thickness[1] - w.thickness[0]) * ((y - w.rootY) / (w.kinkY - w.rootY))
                             : w.thickness[1] + (w.thickness[2] - w.thickness[1]) * ((y - w.kinkY) / (w.tipY - w.kinkY));
      return { le: [x, y * side, w.rootZ + (y - w.rootY) * tanD], chord, twist: 1.5 + (w.washout - 1.5) * f, t, camber: 0.022, up: [0, 0, 1], ...extra };
    };
    const span = (y0, y1, k) => Array.from({ length: k + 1 }, (_, i) => station(y0 + ((y1 - y0) * i) / k));
    const parts = { box: [], slats: [], flaps: [], ailerons: [], spoilers: [] };
    const strips = [
      { y: [w.rootY, w.kinkY], split: 0.7, te: 'flap' },
      { y: [w.kinkY, 12.4], split: 0.72, te: 'flap' },
      { y: [12.4, 16.3], split: w.chordHinge + 0.02, te: 'aileron' },
      { y: [16.3, w.tipY], split: 1, te: null },
    ];
    const slatFrom = 2.6;
    for (const s of strips) {
      const st = span(s.y[0], s.y[1], 2);
      const lo = s.y[0] >= slatFrom ? 0.12 : 0;
      parts.box.push(liftingSurface(st, [lo, s.split], { n: this.n(9, 4) }));
      if (lo > 0 && s.y[1] <= 16.9) parts.slats.push({ g: liftingSurface(st, [0, lo], { n: this.n(5, 2) }), st });
      if (s.te) parts[s.te === 'flap' ? 'flaps' : 'ailerons'].push({ g: liftingSurface(st, [s.split, 1], { n: this.n(5, 2) }), st, split: s.split });
    }
    // the five spoiler panels, thin plates on the upper surface ahead of the flaps
    w.spoilers.forEach(([f0, f1]) => {
      const y0 = w.rootY + 1 + (w.kinkY + 6 - w.rootY - 1) * f0, y1 = w.rootY + 1 + (w.kinkY + 6 - w.rootY - 1) * f1;
      const st = [station(y0), station(y1)].map((x) => ({ ...x, t: x.t * 1.02 }));
      parts.spoilers.push({ g: liftingSurface(st, [0.56, 0.7], { n: 3, upperOnly: true }), st });
    });
    // the sharklet: up and slightly out from the tip, the thickness turning from up to sideways
    const tip = station(w.tipY), sk = w.sharklet;
    const skSt = [
      { le: tip.le, chord: tip.chord * 0.97, t: 0.1, camber: 0.01, up: [0, 0, 1] },
      { le: [tip.le[0] + 0.45, tip.le[1] + side * 0.42, tip.le[2] + 0.42], chord: sk.chordRoot * 0.85, t: 0.09, camber: 0.0, up: [0, -side * 0.7, 0.7] },
      { le: [tip.le[0] + 1.55, tip.le[1] + side * 0.62, tip.le[2] + sk.height], chord: sk.chordTip, t: 0.08, camber: 0, up: [0, -side, 0.12] },
    ];
    parts.box.push(liftingSurface(skSt, [0, 1], { n: this.n(8, 3), capTip: true }));
    const box = new THREE.Mesh(this.merge(parts.box), white);
    this.structure.add(box);
    // movable parts in hinged groups
    const hingeAt = (st, frac, depth = 0.5) => st.map((s) => {
      const [u, l] = airfoil(frac, s.t, s.camber);
      return new THREE.Vector3(s.le[0] + frac * s.chord, s.le[1], s.le[2] + ((u + l) / 2) * s.chord + (u - l) * s.chord * (depth - 0.5));
    });
    const out = { slats: [], flaps: [], ailerons: [], spoilers: [] };
    for (const p of parts.slats) {
      const [a, , b] = hingeAt(p.st, 0.12, 0.2);
      out.slats.push(this.add(hinged(p.g, metal, side > 0 ? a : b, side > 0 ? b : a)));
    }
    for (const p of parts.flaps) {
      const [a, , b] = hingeAt(p.st, p.split, 0.15);
      out.flaps.push(this.add(hinged(p.g, white, side > 0 ? a : b, side > 0 ? b : a)));
    }
    for (const p of parts.ailerons) {
      const [a, , b] = hingeAt(p.st, p.split, 0.5);
      out.ailerons.push(this.add(hinged(p.g, white, side > 0 ? a : b, side > 0 ? b : a)));
    }
    for (const p of parts.spoilers) {
      const [a, b] = hingeAt(p.st, 0.56, 1.0);
      const grp = this.add(hinged(p.g, white, side > 0 ? a : b, side > 0 ? b : a));
      grp.visible = false;
      out.spoilers.push(grp);
    }
    return out;
  }

  add(o) {
    this.structure.add(o);
    return o;
  }

  merge(list) {
    const nonIndexed = list.map((g) => g.toNonIndexed());
    const g = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'uv']) {
      const size = nonIndexed[0].attributes[name].itemSize;
      const total = nonIndexed.reduce((n, x) => n + x.attributes[name].array.length, 0);
      const arr = new Float32Array(total);
      let at = 0;
      for (const x of nonIndexed) {
        arr.set(x.attributes[name].array, at);
        at += x.attributes[name].array.length;
      }
      g.setAttribute(name, new THREE.BufferAttribute(arr, size));
    }
    return g;
  }

  wings(white, metal) {
    this.right = this.wing(1, white, metal);
    this.left = this.wing(-1, white, metal);
  }

  tail(white, finMaterial) {
    const h = this.A.tailplane, f = this.A.fin;
    // the stabiliser turns as a whole about its pivot; the elevators turn on it
    this.ths = new THREE.Group();
    const pivotX = h.rootLE + h.rootChord * h.pivot;
    this.ths.position.set(pivotX, 0, h.z);
    this.structure.add(this.ths);
    this.elevators = [];
    for (const side of [1, -1]) {
      const tan = Math.tan(h.sweepLE * DEG), tanD = Math.tan(h.dihedral * DEG);
      const st = [0, 0.5, 1].map((k) => {
        const y = h.rootY + (h.tipY - h.rootY) * k;
        return { le: [h.rootLE + (y - h.rootY) * tan - pivotX, y * side, (y - h.rootY) * tanD], chord: h.rootChord + (h.tipChord - h.rootChord) * k, t: 0.1, up: [0, 0, 1] };
      });
      this.ths.add(new THREE.Mesh(liftingSurface(st, [0, h.hinge], { n: this.n(8, 3), capTip: true }), white));
      const a = new THREE.Vector3(st[0].le[0] + st[0].chord * h.hinge, st[0].le[1], st[0].le[2]);
      const b = new THREE.Vector3(st[2].le[0] + st[2].chord * h.hinge, st[2].le[1], st[2].le[2]);
      const grp = hinged(liftingSurface(st, [h.hinge, 1], { n: 5, capTip: true }), white, side > 0 ? a : b, side > 0 ? b : a);
      this.ths.add(grp);
      this.elevators.push(grp);
    }
    const tan = Math.tan(f.sweepLE * DEG);
    const st = [0, 0.5, 1].map((k) => {
      const z = f.rootZ + (f.tipZ - f.rootZ) * k;
      return { le: [f.rootLE + (z - f.rootZ) * tan, 0, z], chord: f.rootChord + (f.tipChord - f.rootChord) * k, t: 0.1, up: [0, 1, 0] };
    });
    this.structure.add(new THREE.Mesh(liftingSurface(st, [0, f.hinge], { n: this.n(8, 3), capTip: true }), finMaterial));
    const a = new THREE.Vector3(st[0].le[0] + st[0].chord * f.hinge, 0, st[0].le[2]);
    const b = new THREE.Vector3(st[2].le[0] + st[2].chord * f.hinge, 0, st[2].le[2]);
    this.rudder = this.add(hinged(liftingSurface(st, [f.hinge, 1], { n: 5, capTip: true }), finMaterial, a, b));
    // the dorsal fillet blending the fin into the fuselage
    const fillet = liftingSurface([
      { le: [24.8, 0, 1.95], chord: 4.2, t: 0.06, up: [0, 1, 0] },
      { le: [28.4, 0, 2.6], chord: 1.4, t: 0.12, up: [0, 1, 0] },
    ], [0, 1], { n: 6 });
    this.structure.add(new THREE.Mesh(fillet, finMaterial));
  }

  // CFM56 nacelles: a polished lip, a painted fan cowl, a dark core and plug; the fan face with its
  // spinner, which turns at N1; the pylon over it.
  engines(cowlMat, metal, dark, white) {
    const A = this.A, n = A.nacelle;
    this.fans = [];
    this.reverserDoors = {};
    // the reversers' doors are the cowl's paint; the opening under each is the duct's dark, drawn just proud of the
    // cowl (polygon offset) so that it shows where a door has swung out
    const doorMat = cowlMat.clone();
    doorMat.side = THREE.DoubleSide;
    const holeMat = new THREE.MeshStandardMaterial({ color: 0x14171b, roughness: 0.9, metalness: 0.1, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    this.materials.push(doorMat, holeMat);
    const lathe = (pts, segs = this.n(28, 10)) => new THREE.LatheGeometry(pts.map(([r, x]) => new THREE.Vector2(r, x)), segs).rotateZ(-Math.PI / 2);
    for (const side of [1, -1]) {
      const g = new THREE.Group();
      g.position.set(n.lip, A.engine[1] * side, A.engine[2]);
      const lip = lathe([[0.84, 0.32], [0.86, 0.06], [0.93, 0.0], [1.0, 0.05], [1.03, 0.16]]);
      const body = lathe([[1.03, 0.16], [1.06, 0.6], [1.055, 1.7], [0.98, 2.7], [0.87, 3.35], [0.8, 3.58], [0.74, 3.6]]);
      const core = lathe([[0.74, 3.6], [0.62, 3.55], [0.6, 3.9], [0.53, 4.35], [0.43, 4.75], [0.33, 4.8], [0.2, 5.05], [0.06, 5.3], [0.0, 5.34]]);
      g.add(new THREE.Mesh(lip, metal), new THREE.Mesh(body, cowlMat), new THREE.Mesh(core, dark));
      // the inside of the inlet, and the fan face with a spinner carrying its swirl
      const inner = lathe([[0.84, 0.32], [0.85, 0.55]]);
      g.add(new THREE.Mesh(inner, new THREE.MeshStandardMaterial({ color: 0x8a9096, metalness: 0.6, roughness: 0.4, side: THREE.BackSide })));
      const fan = new THREE.Group();
      fan.position.set(0.55, 0, 0);
      const blades = document.createElement('canvas');
      blades.width = blades.height = 256;
      const bg = blades.getContext('2d');
      bg.fillStyle = '#1b1d20';
      bg.fillRect(0, 0, 256, 256);
      bg.strokeStyle = '#4a4f56';
      bg.lineWidth = 5;
      for (let k = 0; k < 36; ++k) {
        const a = (k / 36) * Math.PI * 2;
        bg.beginPath();
        bg.moveTo(128 + Math.cos(a) * 30, 128 + Math.sin(a) * 30);
        bg.quadraticCurveTo(128 + Math.cos(a + 0.18) * 80, 128 + Math.sin(a + 0.18) * 80, 128 + Math.cos(a + 0.12) * 127, 128 + Math.sin(a + 0.12) * 127);
        bg.stroke();
      }
      const bladeTex = new THREE.CanvasTexture(blades);
      bladeTex.colorSpace = THREE.SRGBColorSpace;
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.85, 36).rotateY(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: bladeTex, metalness: 0.5, roughness: 0.5 }));
      fan.add(disc);
      const swirl = document.createElement('canvas');
      swirl.width = 128;
      swirl.height = 64;
      const sg = swirl.getContext('2d');
      sg.fillStyle = '#2a2d31';
      sg.fillRect(0, 0, 128, 64);
      sg.strokeStyle = '#f4f4f4';
      sg.lineWidth = 7;
      sg.beginPath();
      sg.moveTo(0, 64);
      sg.bezierCurveTo(40, 40, 70, 20, 128, 0);
      sg.stroke();
      const swirlTex = new THREE.CanvasTexture(swirl);
      swirlTex.colorSpace = THREE.SRGBColorSpace;
      const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.27, 0.5, 20).rotateZ(Math.PI / 2).translate(-0.25, 0, 0), new THREE.MeshStandardMaterial({ map: swirlTex, roughness: 0.3, metalness: 0.3 }));
      fan.add(spinner);
      g.add(fan);
      // engine 1 is the left one: JSBSim's structural frame has y out of the right wing
      const engine = side > 0 ? 2 : 1;
      this.fans.push({ fan, engine });
      this.reverserDoors[engine] = this.reverser(g, doorMat, holeMat);
      this.structure.add(g);
      // the pylon: a slab from the cowl's top up and back under the wing
      const pylon = liftingSurface([
        { le: [n.lip + 0.7, A.engine[1] * side, A.engine[2] + 1.0], chord: 3.4, t: 0.09, up: [0, 1, 0] },
        { le: [n.lip + 2.4, A.engine[1] * side, A.engine[2] + 1.45], chord: 4.2, t: 0.07, up: [0, 1, 0] },
      ], [0, 1], { n: 5 });
      this.structure.add(new THREE.Mesh(pylon, white));
    }
  }

  // One engine's thrust reverser, the CFM56-5's: four doors in the fan cowl's aft half, two either side, clear of
  // the pylon and the lower bifurcation. Each is a patch of the cowl (whose radius tapers there, 1.055 m at 1.7 m to
  // 0.98 m at 2.7 m behind the lip) pivoting about its middle, so that its forward edge swings out and its aft edge
  // into the fan stream (doorAngle, reverse.js). Doors and openings are shown only while the reverser is out.
  reverser(g, doorMat, holeMat) {
    const x0 = 1.75, x1 = 2.65, xh = (x0 + x1) / 2, half = 32 * DEG, N = 8;
    const radius = (x) => 1.055 - 0.075 * (x - 1.7);
    // a patch of the cowl centred on its top (+z), lifted off it, its vertices relative to origin
    const patch = (lift, origin) => {
      const pos = [], idx = [];
      for (const x of [x0, x1]) {
        for (let j = 0; j <= N; ++j) {
          const a = -half + (2 * half * j) / N, rr = radius(x) + lift;
          pos.push(x - origin[0], rr * Math.sin(a) - origin[1], rr * Math.cos(a) - origin[2]);
        }
      }
      for (let j = 0; j < N; ++j) idx.push(j, N + 1 + j, j + 1, j + 1, N + 1 + j, N + 2 + j);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      return geo;
    };
    const doors = [];
    for (const at of [50, 130, 230, 310]) {   // degrees round the nacelle from its top
      const frame = new THREE.Group();
      frame.rotation.x = at * DEG;
      const hinge = new THREE.Group();
      const pivot = [xh, 0, radius(xh) + 0.012];
      hinge.position.set(...pivot);
      hinge.add(new THREE.Mesh(patch(0.012, pivot), doorMat));
      frame.add(new THREE.Mesh(patch(0.004, [0, 0, 0]), holeMat), hinge);
      frame.visible = false;
      g.add(frame);
      doors.push({ frame, hinge });
    }
    return doors;
  }

  // The gear: twin wheels on each leg; the mains swing in under the body, the nose forward into its bay.
  gear(strut, tyre, metal, dark) {
    const A = this.A, w = A.wheels;
    const wheelPair = (r, track, width) => {
      const g = new THREE.Group();
      for (const s of [-1, 1]) {
        const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r, width, this.n(22, 8)), tyre);
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, width + 0.02, this.n(14, 6)), metal);
        const wheel = new THREE.Group();
        wheel.add(t, hub);
        wheel.position.y = s * track;
        g.add(wheel);
      }
      return g;
    };
    this.mains = [];
    for (const side of [1, -1]) {
      const pivot = new THREE.Vector3(A.mainGear[0] - 0.45, A.mainGear[1] * side, -1.3);
      const axle = new THREE.Vector3(A.mainGear[0], A.mainGear[1] * side, A.mainGear[2] + w.main);
      const leg = new THREE.Group();
      leg.position.copy(pivot);
      const len = pivot.distanceTo(axle);
      const oleo = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.11, len, 10), strut);
      const dir = axle.clone().sub(pivot);
      oleo.position.copy(dir.clone().multiplyScalar(0.5));
      oleo.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
      leg.add(oleo);
      const wheels = wheelPair(w.main, w.mainTrack, 0.42);
      wheels.position.copy(dir);
      leg.add(wheels);
      const door = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.04, 1.3), dark.clone());
      door.material.color.set(0xd5d8dc);
      door.position.set(0, side * 0.2, -0.8);
      leg.add(door);
      this.structure.add(leg);
      this.mains.push({ leg, wheels, side });
    }
    const pivot = new THREE.Vector3(A.noseGear[0] - 0.25, 0, -1.6);
    const axle = new THREE.Vector3(A.noseGear[0], 0, A.noseGear[2] + w.nose);
    const leg = new THREE.Group();
    leg.position.copy(pivot);
    const dir = axle.clone().sub(pivot);
    const oleo = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.09, dir.length(), 10), strut);
    oleo.position.copy(dir.clone().multiplyScalar(0.5));
    oleo.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    leg.add(oleo);
    const wheels = wheelPair(w.nose, w.noseTrack + 0.07, 0.24);
    wheels.position.copy(dir);
    leg.add(wheels);
    this.structure.add(leg);
    this.nose = { leg, wheels };
  }

  navLights() {
    const A = this.A, set = new LightSet(), tip = A.wing.tipY + 0.05;
    const tipX = A.wing.rootLE + (A.wing.tipY - A.wing.rootY) * Math.tan(A.wing.sweepLE * DEG) + 0.4;
    const tipZ = A.wing.rootZ + (A.wing.tipY - A.wing.rootY) * Math.tan(A.wing.dihedral * DEG) + 0.1;
    set.add(tipX, -tip, tipZ, COLOURS.red, { size: 2.4 });
    set.add(tipX, tip, tipZ, COLOURS.green, { size: 2.4 });
    set.add(A.length + 0.05, 0, 1.0, COLOURS.white, { size: 2.0 });
    for (const [x, y, z] of [[tipX + 0.5, -tip, tipZ], [tipX + 0.5, tip, tipZ], [A.length - 0.2, 0, 1.25]]) {
      set.add(x, y, z, COLOURS.strobe, { size: 4.5, flash: [1.05, 0.0, 0.035] });
      set.add(x, y, z, COLOURS.strobe, { size: 4.5, flash: [1.05, 0.13, 0.035] });
    }
    set.add(16.0, 0, 2.12, COLOURS.red, { size: 2.8, flash: [1.0, 0.0, 0.14] });
    set.add(18.8, 0, -2.2, COLOURS.red, { size: 2.8, flash: [1.0, 0.5, 0.14] });
    for (const s of [-1, 1]) set.add(13.6, s * 3.3, -1.75, COLOURS.whiteHot, { axis: [-1, 0, -0.12], beam: [0.96, 0.75], size: 6.5 });
    set.add(A.noseGear[0] - 0.4, 0, -2.4, COLOURS.whiteHot, { axis: [-1, 0, -0.2], beam: [0.95, 0.7], size: 4.5 });
    const points = set.build(null);
    return { set, points };
  }

  // Every visible part merged into one geometry in the model's frame, coloured per vertex by its
  // material: for the aircraft parked at the gates (instanced) and the debrief's vector outline.
  staticGeometry() {
    this.root.updateMatrixWorld(true);
    const inv = this.root.matrixWorld.clone().invert(), parts = [];
    this.root.traverse((o) => {
      if (!o.isMesh) return;
      let v = o.visible;
      for (let a = o.parent; v && a; a = a.parent) v = a.visible;
      if (!v) return;
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
      if (!g.attributes.normal) g.computeVertexNormals();
      const c = new THREE.Color(o.material.userData.flat ?? o.material.color.getHex());
      const col = new Float32Array(g.attributes.position.count * 3);
      for (let k = 0; k < col.length; k += 3) col.set([c.r, c.g, c.b], k);
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      parts.push(g);
    });
    return mergeGeometries(parts);
  }

  // The state from the flight core, as the page receives it: surfaces in degrees, gear 0..1, N1 in %.
  update(s, dt) {
    const flap = s.flap_deg || 0;
    const slat = flap > 0.5 ? Math.min(27, 18 + flap * 0.3) : 0;
    for (const [wing, side] of [[this.right, 1], [this.left, -1]]) {
      for (const g of wing.slats) turn(g, -slat * DEG * 0.7, new THREE.Vector3(-0.32 * slat / 27, 0, -0.18 * slat / 27));
      for (const g of wing.flaps) turn(g, flap * DEG, new THREE.Vector3(0.9 * Math.min(1, flap / 20), 0, -0.25 * Math.min(1, flap / 20)));
      const ail = side > 0 ? s.aileron_r_deg : s.aileron_l_deg;
      for (const g of wing.ailerons) turn(g, (ail || 0) * DEG);
      const sp = (side > 0 ? s.spoiler_r_deg : s.spoiler_l_deg) || 0;
      for (const g of wing.spoilers) {
        g.visible = sp > 0.5;
        turn(g, -sp * DEG);
      }
    }
    this.ths.rotation.y = -(s.ths_deg || 0) * DEG;
    for (const g of this.elevators) turn(g, (s.elevator_deg || 0) * DEG);
    turn(this.rudder, -(s.rudder_deg || 0) * DEG);
    const down = s.gear_pos === undefined ? 1 : s.gear_pos;
    for (const m of this.mains) {
      m.leg.rotation.x = -m.side * (1 - down) * 88 * DEG;
      m.leg.visible = down > 0.02;
    }
    this.nose.leg.rotation.y = (1 - down) * 98 * DEG;
    this.nose.leg.visible = down > 0.02;
    // the wheels turn with the ground speed; the fans with N1 (CFM56-5: 5,000 rpm at 100 %)
    this.wheelTurn += ((s.gs_kn || 0) * 0.5144 * dt) / this.A.wheels.main;
    for (const m of this.mains) for (const w of m.wheels.children) w.rotation.y = this.wheelTurn;
    for (const w of this.nose.wheels.children) w.rotation.y = this.wheelTurn * (this.A.wheels.main / this.A.wheels.nose);
    this.fans.forEach(({ fan, engine }) => {
      const n1 = s[`n1_${engine}`] || 0;
      fan.rotation.x += (n1 / 100) * (5000 / 60) * 2 * Math.PI * dt * 0.15;
    });
    // the reversers' doors, out by doorAngle; a forward edge rises from the cowl as the door turns about its hinge
    for (const [engine, doors] of Object.entries(this.reverserDoors)) {
      const a = doorAngle(s[`reverser_${engine}`]);
      for (const d of doors) {
        d.frame.visible = a > 0;
        d.hinge.rotation.y = a;
      }
    }
  }
}
