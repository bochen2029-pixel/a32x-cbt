// The Ring: its superstructure only, nothing furnished. A band 5 km in radius and 1 km wide that spins
// once in 142 s for one g at the floor; a roof 300 m above the floor; six spokes to a hub on the axis,
// whose port faces the way the crew arrives. Textures painted by code. GPLv3.

import * as THREE from 'three';
import { HUB_PORT_M, RING } from './core.js';

export { RING };

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9 >>> 0) / 4294967296);
}

function canvasTexture(w, h, paint, repeat) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  paint(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 4;
  return t;
}

// The floor, seen through the roof: parkland, a canal down the middle, blocks of town. Unfurnished: a
// pattern, not a plan.
function paintFloor(g, w, h) {
  const r = rng(7);
  g.fillStyle = '#42603a';
  g.fillRect(0, 0, w, h);
  for (let k = 0; k < 900; k++) {   // fields and woods
    g.fillStyle = r() < 0.5 ? '#38552f' : '#506b3c';
    g.fillRect(r() * w, r() * h, 20 + r() * 90, 10 + r() * 50);
  }
  for (let x = 0; x < w; x += 64 + Math.floor(r() * 120)) {   // districts
    if (r() < 0.45) continue;
    const bw = 40 + r() * 160, y0 = r() * h * 0.7;
    for (let bx = x; bx < x + bw; bx += 9) {
      for (let by = y0; by < y0 + h * 0.3; by += 9) {
        const v = 120 + Math.floor(r() * 90);
        g.fillStyle = `rgb(${v},${v},${v + 6})`;
        g.fillRect(bx, by, 7, 7);
      }
    }
  }
  g.fillStyle = '#2b5a73';   // the canal
  g.fillRect(0, h * 0.47, w, h * 0.06);
  g.fillStyle = '#c9c4b4';   // the edges: walls' feet
  g.fillRect(0, 0, w, 6);
  g.fillRect(0, h - 6, w, 6);
}

function paintHull(g, w, h) {
  const r = rng(11);
  g.fillStyle = '#9ea3a8';
  g.fillRect(0, 0, w, h);
  for (let k = 0; k < 400; k++) {
    const v = 140 + Math.floor(r() * 40);
    g.fillStyle = `rgb(${v},${v + 2},${v + 5})`;
    g.fillRect(Math.floor(r() * 16) * (w / 16), Math.floor(r() * 4) * (h / 4), w / 16, h / 4);
  }
  g.strokeStyle = 'rgba(40,44,50,0.8)';
  g.lineWidth = 2;
  for (let x = 0; x <= w; x += w / 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  for (let y = 0; y <= h; y += h / 4) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
}

function paintRoof(g, w, h) {
  g.clearRect(0, 0, w, h);
  g.strokeStyle = 'rgba(210,225,240,0.9)';
  g.lineWidth = 3;
  for (let x = 0; x <= w; x += w / 8) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  for (let y = 0; y <= h; y += h / 4) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
}

export class Ring {
  constructor() {
    const R = RING, half = R.width / 2, seg = 512;
    this.group = new THREE.Group();
    this.spin = new THREE.Group();   // everything that turns with the Ring
    this.group.add(this.spin);
    const metal = new THREE.MeshStandardMaterial({
      map: canvasTexture(1024, 256, paintHull, [96, 2]), roughness: 0.7, metalness: 0.15,
    });
    const plain = new THREE.MeshStandardMaterial({ color: 0xa3a8ae, roughness: 0.7, metalness: 0.1 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 0.75, metalness: 0.1 });

    // the hull, outside the floor
    this.spin.add(new THREE.Mesh(new THREE.CylinderGeometry(R.hull, R.hull, R.width, seg, 1, true), metal));
    // the floor, seen from inside
    const floor = new THREE.MeshStandardMaterial({
      map: canvasTexture(2048, 512, paintFloor, [8, 1]), side: THREE.BackSide, roughness: 0.9, metalness: 0,
    });
    this.spin.add(new THREE.Mesh(new THREE.CylinderGeometry(R.floor, R.floor, R.width - 2, seg, 1, true), floor));
    // the rim walls, from the hull to above the roof
    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.RingGeometry(R.rim, R.hull, seg, 1), plain);
      wall.rotation.x = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      wall.position.y = side * half;
      this.spin.add(wall);
      const inner = new THREE.Mesh(new THREE.CylinderGeometry(R.rim, R.rim, 60, seg, 1, true), plain);
      inner.position.y = side * (half - 30);
      this.spin.add(inner);
    }
    // the roof: glazing on a lattice, 300 m over the floor
    const glass = new THREE.MeshStandardMaterial({
      color: 0x9fc4e6, transparent: true, opacity: 0.16, roughness: 0.1, metalness: 0.2, side: THREE.DoubleSide, depthWrite: false,
    });
    this.spin.add(new THREE.Mesh(new THREE.CylinderGeometry(R.roof, R.roof, R.width - 60, seg, 1, true), glass));
    const lattice = new THREE.MeshBasicMaterial({
      map: canvasTexture(512, 256, paintRoof, [160, 2]), transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false,
    });
    this.spin.add(new THREE.Mesh(new THREE.CylinderGeometry(R.roof - 2, R.roof - 2, R.width - 60, seg, 1, true), lattice));
    // spokes, hub to rim, in the middle plane
    const spokeLength = R.rim - R.hub;
    for (let k = 0; k < R.spokes; k++) {
      const a = (k / R.spokes) * Math.PI * 2;
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(70, 70, spokeLength), plain);
      spoke.position.set(Math.sin(a) * (R.hub + spokeLength / 2), 0, Math.cos(a) * (R.hub + spokeLength / 2));
      spoke.rotation.y = a;
      this.spin.add(spoke);
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, spokeLength, 12), dark);   // the lift tube
      tube.rotation.x = Math.PI / 2;
      tube.position.copy(spoke.position).add(new THREE.Vector3(0, 48, 0));
      tube.rotation.order = 'YXZ';
      tube.rotation.y = a;
      this.spin.add(tube);
    }
    // the hub, on the axis: the port at -axis, where the crew arrives
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(R.hub, R.hub, HUB_PORT_M * 2, 64), plain);
    this.spin.add(hub);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(R.hub + 25, R.hub + 25, 90, 64), dark);
    this.spin.add(collar);
    const port = new THREE.Mesh(new THREE.TorusGeometry(45, 6, 12, 48), new THREE.MeshBasicMaterial({ color: 0x9fe8ff }));
    port.rotation.x = Math.PI / 2;
    port.position.y = -HUB_PORT_M - 1;
    this.spin.add(port);
    const mouth = new THREE.Mesh(new THREE.CircleGeometry(39, 32), new THREE.MeshBasicMaterial({ color: 0x050608 }));
    mouth.rotation.x = Math.PI / 2;
    mouth.position.y = -HUB_PORT_M - 0.5;
    this.spin.add(mouth);

    // lights: rims and hub, so the Ring is seen on the night side too
    const pos = [], col = [];
    for (let k = 0; k < 160; k++) {
      const a = (k / 160) * Math.PI * 2;
      for (const side of [-1, 1]) {
        pos.push(Math.sin(a) * (R.hull + 5), side * (half + 5), Math.cos(a) * (R.hull + 5));
        col.push(...(side < 0 ? [1, 0.25, 0.2] : [0.3, 1, 0.45]));
      }
    }
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      pos.push(Math.sin(a) * 60, -HUB_PORT_M - 2, Math.cos(a) * 60);
      col.push(1, 1, 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    this.lights = new THREE.Points(g, new THREE.PointsMaterial({ size: 3, sizeAttenuation: false, vertexColors: true, transparent: true }));
    this.spin.add(this.lights);
  }

  // rel: the Ring's centre from the eye, three.js axes; axis and ref: unit, three.js axes, ref turning
  // with the Ring; t: seconds, for the lights.
  update(rel, axis, ref, t) {
    const y = new THREE.Vector3(axis[0], axis[1], axis[2]);
    const x = new THREE.Vector3(ref[0], ref[1], ref[2]);
    const z = new THREE.Vector3().crossVectors(x, y);
    this.group.position.set(rel[0], rel[1], rel[2]);
    this.group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    this.lights.material.opacity = 0.55 + 0.45 * Math.max(0, Math.sin(t * 2.2));
  }
}
