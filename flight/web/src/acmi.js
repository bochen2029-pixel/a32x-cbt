// The debrief view, after the ACMI of the 1990s and Tacview today: the flown path as a ribbon that keeps
// the wings' bank, coloured by the stabilised-approach bands the P7 gate judges; the ILS as a wire tunnel
// of one-dot boxes every half mile; drop lines to the ground; the world as a vector grid on black. It
// draws the flight's states as the page kept them, four a second. Tags on the tracks and an event log
// are still to come. GPLv3.

import * as THREE from 'three';

const NM = 1852;
export const BAND = { ok: 0, near: 1, out: 2 };
const BAND_COLOUR = [[0.25, 1.0, 0.45], [1.0, 0.72, 0.12], [1.0, 0.22, 0.16]];

export class Acmi {
  // runwayFrame: the primary runway's matrix (threshold at origin, landing -z); runway: its data;
  // others: [{ M, lengthM, widthM, displacedM }]; height(x, z): the ground
  constructor(runwayFrame, runway, others, height, landmarks) {
    this.group = new THREE.Group();
    this.wire = new THREE.Group();
    this.group.add(this.wire);
    this.max = 8000;
    this.count = 0;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(this.max * 2 * 3);
    this.col = new Float32Array(this.max * 2 * 3);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let k = 0; k < this.max - 1; ++k) idx.push(2 * k, 2 * k + 1, 2 * k + 2, 2 * k + 1, 2 * k + 3, 2 * k + 2);
    g.setIndex(idx);
    g.setDrawRange(0, 0);
    this.ribbon = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.42, depthWrite: false }));
    this.ribbon.frustumCulled = false;
    this.group.add(this.ribbon);
    const dg = new THREE.BufferGeometry();
    this.drops = new Float32Array(2000 * 2 * 3);
    dg.setAttribute('position', new THREE.BufferAttribute(this.drops, 3).setUsage(THREE.DynamicDrawUsage));
    dg.setDrawRange(0, 0);
    this.dropLines = new THREE.LineSegments(dg, new THREE.LineBasicMaterial({ color: 0x5a6a7a, transparent: true, opacity: 0.6 }));
    this.dropLines.frustumCulled = false;
    this.dropCount = 0;
    this.lastDrop = -1e9;
    this.wire.add(this.dropLines);
    this.height = height;
    this.tunnel(runwayFrame, runway);
    this.world(runwayFrame, runway, others, height, landmarks);
  }

  reset() {
    this.count = 0;
    this.dropCount = 0;
    this.lastDrop = -1e9;
    this.ribbon.geometry.setDrawRange(0, 0);
    this.dropLines.geometry.setDrawRange(0, 0);
  }

  // A sample of the flown path: the CG, the right wing's direction, the band status, the time.
  push(t, p, wing, band) {
    if (this.count >= this.max) return;
    const k = this.count++, c = BAND_COLOUR[band];
    for (const [j, s] of [[0, -5], [1, 5]]) {
      this.pos.set([p.x + wing.x * s, p.y + wing.y * s, p.z + wing.z * s], (2 * k + j) * 3);
      this.col.set(c, (2 * k + j) * 3);
    }
    const g = this.ribbon.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
    g.setDrawRange(0, Math.max(0, (this.count - 1) * 6));
    if (t - this.lastDrop >= 2 && this.dropCount < 2000) {
      this.lastDrop = t;
      this.drops.set([p.x, p.y, p.z, p.x, this.height(p.x, p.z), p.z], this.dropCount * 6);
      ++this.dropCount;
      this.dropLines.geometry.attributes.position.needsUpdate = true;
      this.dropLines.geometry.setDrawRange(0, this.dropCount * 2);
    }
  }

  // The ILS as flown on: a box one dot each way of the localizer and the glideslope every half mile out
  // to 10, and the glidepath's centre, computed as flight/harness/runway.cpp computes the beams.
  tunnel(M, r) {
    const tan = (d) => Math.tan(d * Math.PI / 180);
    const antenna = r.lengthM - r.displacedM + 300;
    const locDot = Math.atan(107 / antenna) * 180 / Math.PI / 2, gsDot = 0.24 * r.glideDeg / 2;
    const origin = r.tchFt * 0.3048 / tan(r.glideDeg);
    const pts = [], centre = [];
    for (let d = 0.5; d <= 10.01; d += 0.5) {
      const along = d * NM, z = along;   // before the threshold is +z in the runway frame
      const h = tan(r.glideDeg) * (along + origin);
      const hw = tan(locDot) * (along + antenna), hh = (tan(r.glideDeg + gsDot) - tan(r.glideDeg)) * (along + origin);
      const c = [[-hw, h - hh], [hw, h - hh], [hw, h + hh], [-hw, h + hh]];
      for (let k = 0; k < 4; ++k) pts.push(c[k][0], c[k][1], z, c[(k + 1) % 4][0], c[(k + 1) % 4][1], z);
      centre.push(0, h, z);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.applyMatrix4(M);
    this.group.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xff4cff, transparent: true, opacity: 0.75 })));
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.Float32BufferAttribute([...centre, 0, tan(r.glideDeg) * origin, 0, 0, 0, -origin], 3));
    cg.applyMatrix4(M);
    this.group.add(new THREE.Line(cg, new THREE.LineDashedMaterial({ color: 0xff9cff, dashSize: 80, gapSize: 60 })));
    this.group.children[this.group.children.length - 1].computeLineDistances();
  }

  // The world in vectors: a kilometre grid on the ground, every runway's outline and centreline, the
  // landmarks as uprights.
  world(M, r, others, height, landmarks) {
    const grid = [], half = 26000, step = 1000;
    for (let a = -half; a <= half; a += step) {
      for (let b = -half; b < half; b += step / 4) {
        grid.push(a, height(a, b) + 1, b, a, height(a, b + step / 4) + 1, b + step / 4);
        grid.push(b, height(b, a) + 1, a, b + step / 4, height(b + step / 4, a) + 1, a);
      }
    }
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(grid, 3));
    this.wire.add(new THREE.LineSegments(gg, new THREE.LineBasicMaterial({ color: 0x5c4630 })));
    const rw = [];
    for (const o of others) {
      const s = o.displacedM, e = -(o.lengthM - o.displacedM), w = o.widthM / 2;
      const local = [[-w, s], [w, s], [w, s], [w, e], [w, e], [-w, e], [-w, e], [-w, s], [0, s], [0, e]];
      const v = new THREE.Vector3();
      for (const [x, z] of local) {
        v.set(x, 0.5, z).applyMatrix4(o.M);
        rw.push(v.x, v.y, v.z);
      }
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(rw, 3));
    this.wire.add(new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xd8d8d8 })));
    const up = [];
    for (const l of landmarks) up.push(l.x, height(l.x, l.z), l.z, l.x, height(l.x, l.z) + l.h, l.z);
    const ug = new THREE.BufferGeometry();
    ug.setAttribute('position', new THREE.Float32BufferAttribute(up, 3));
    this.wire.add(new THREE.LineSegments(ug, new THREE.LineBasicMaterial({ color: 0x7fb2ff })));
  }
}

// The bands of the P7 gate (ROADMAP §4), judged between 1,000 ft and 50 ft above the threshold: inside,
// near an edge (three quarters of the band used), or out.
export function judge(s, vapp) {
  const h = s.thr_height_ft ?? s.ra_ft;
  if (!(h <= 1000 && h >= 50) || s.on_ground) return BAND.ok;
  const used = Math.max(
    Math.abs(s.loc_dots || 0) / 1,
    Math.abs(s.gs_dots || 0) / 1,
    Math.max(0, -(s.vs_fpm || 0)) / 1000,
    !Number.isFinite(vapp) ? 0 : (s.cas_kn - vapp) > 0 ? (s.cas_kn - vapp) / 10 : (vapp - s.cas_kn) / 5,
    Math.abs(s.roll_deg || 0) / 7,
  );
  return used > 1 ? BAND.out : used > 0.75 ? BAND.near : BAND.ok;
}
