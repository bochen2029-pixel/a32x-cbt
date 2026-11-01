// The flight deck from the left seat, at the eyepoint the flight model uses. A closed room in Airbus grey
// with its windows cut by the stencil buffer: the window shapes are drawn first into the stencil only,
// and the room's shell is drawn everywhere else, so the world shows through the windows and nowhere else
// and no seam can leak sky. Glareshield, FCU, six display units, pedestal, sidesticks. GPLv3.
//
// The display units' pictures here are placeholders drawn for the mockup, not P8's displays: in the
// product each tube's canvas is P8's renderer, fed from law state, and this module only hangs it.

import * as THREE from 'three';
import { reverserState } from './reverse.js';

const DEG = Math.PI / 180;

function shape2(points) {
  return new THREE.Shape(points.map(([a, b]) => new THREE.Vector2(a, b)));
}

// A flat polygon given by 3-D points (in order, roughly planar), as a mesh.
function polygon(pts) {
  const g = new THREE.BufferGeometry();
  const pos = [];
  for (let k = 1; k < pts.length - 1; ++k) pos.push(...pts[0], ...pts[k], ...pts[k + 1]);
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// A frame of thin bars around a window polygon, a little inside the room.
function frame(pts, width) {
  const geoms = [];
  for (let k = 0; k < pts.length; ++k) {
    const a = new THREE.Vector3(...pts[k]), b = new THREE.Vector3(...pts[(k + 1) % pts.length]);
    const len = a.distanceTo(b);
    const g = new THREE.BoxGeometry(len + width, width, width * 0.6);
    const m = new THREE.Matrix4().lookAt(a, b, new THREE.Vector3(0, 0, 1));
    g.rotateY(Math.PI / 2);
    g.applyMatrix4(m);
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    geoms.push(g);
  }
  return geoms;
}

export class Cockpit {
  constructor(hazeAmbient, A) {
    this.group = new THREE.Group();   // in structural metres, inside the airframe's structure group
    this.group.visible = false;
    const grey = new THREE.MeshLambertMaterial({ color: 0x6b7680 });
    const dark = new THREE.MeshLambertMaterial({ color: 0x2c3238 });
    const panel = new THREE.MeshLambertMaterial({ color: 0x4d5760 });
    const black = new THREE.MeshLambertMaterial({ color: 0x0c0e10 });
    for (const m of [grey, dark, panel, black]) hazeAmbient(m);
    this.materials = { grey, dark, panel, black };

    // the windows, captain's and first officer's: windshield, sliding window, rear side window
    const win = [];
    for (const s of [-1, 1]) {
      win.push([[1.64, s * 0.045, 0.99], [1.74, s * 1.12, 0.99], [2.12, s * 1.3, 1.74], [2.0, s * 0.045, 1.79]]);
      win.push([[2.17, s * 1.42, 1.0], [2.95, s * 1.52, 1.02], [2.95, s * 1.5, 1.63], [2.22, s * 1.4, 1.69]]);
      win.push([[3.02, s * 1.53, 1.04], [3.55, s * 1.56, 1.06], [3.55, s * 1.54, 1.5], [3.02, s * 1.52, 1.56]]);
    }
    this.portalMaterial = new THREE.MeshBasicMaterial({
      colorWrite: false, depthWrite: false, side: THREE.DoubleSide,
      stencilWrite: true, stencilRef: 1, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp,
    });
    for (const w of win) {
      const m = new THREE.Mesh(polygon(w), this.portalMaterial);
      m.renderOrder = -2000;
      this.group.add(m);
    }
    // the room: a box around the seats, drawn only where no window is
    const shell = new THREE.BoxGeometry(2.7, 3.3, 2.1);
    shell.translate(2.95, 0, 0.95);
    const shellMat = new THREE.MeshLambertMaterial({
      color: 0x5f6a74, side: THREE.BackSide,
      stencilWrite: true, stencilRef: 1, stencilFunc: THREE.NotEqualStencilFunc,
      stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp, stencilZPass: THREE.KeepStencilOp,
    });
    hazeAmbient(shellMat);
    this.lit = [grey, dark, panel, shellMat];
    const shellMesh = new THREE.Mesh(shell, shellMat);
    shellMesh.renderOrder = -1900;
    this.group.add(shellMesh);
    // the shell between the windows is their frame; only the centre post stands proud of it
    const frames = [new THREE.BoxGeometry(0.07, 0.09, 0.82).rotateY(-0.42).translate(1.83, 0, 1.38)];
    const post = new THREE.MeshLambertMaterial({ color: 0x2a3036 });
    hazeAmbient(post);
    this.lit.push(post);
    this.add(frames, post);

    // glareshield: a slab under the windshield, its lip toward the crew; the FCU in its middle
    const glare = [new THREE.BoxGeometry(0.3, 2.2, 0.05).translate(1.84, 0, 1.03)];
    glare.push(new THREE.BoxGeometry(0.04, 2.2, 0.1).translate(1.99, 0, 1.0));
    this.add(glare, dark);
    this.fcu = this.screen(1024, 96, [2.015, 0, 1.0], 0.9, 0.08, 8);
    // the main panel, leaning back toward the eye, and its six tubes in it
    const lean = 25;
    const mp = new THREE.BoxGeometry(0.03, 2.1, 0.46).rotateY(-lean * DEG).translate(1.975, 0, 0.74);
    this.add([mp], panel);
    const du = (y, z, x = 1.995, tilt = lean) => this.screen(512, 512, [x, y, z], 0.19, 0.19, tilt);
    const eye = A.eye;
    // The upper row, the PFDs, NDs and EWD in line, low enough that the glareshield's lip and the FCU hide none of
    // them from the EYEPOINT (2.54, -0.51, 1.27): at 0.85 m the lip cut off the EWD's N1 row and the PFDs' top.
    const row = 0.8;
    this.tubes = {
      pfd: du(eye[1] - 0.125, row),
      nd: du(eye[1] + 0.125, row),
      ewd: du(0, row),
      sd: du(0, 0.6, 2.13, 52),
      fopfd: du(-eye[1] + 0.125, row),
      fond: du(-eye[1] - 0.125, row),
    };
    // pedestal, side consoles, sidesticks, thrust levers
    const ped = new THREE.BoxGeometry(1.05, 0.5, 0.36).translate(2.75, 0, 0.32);
    const consoles = [-1, 1].map((s) => new THREE.BoxGeometry(1.0, 0.32, 0.62).translate(2.85, s * 1.22, 0.31));
    this.add([ped, ...consoles], panel);
    const sticks = [];
    for (const s of [-1, 1]) {
      sticks.push(new THREE.CylinderGeometry(0.022, 0.026, 0.17, 10).rotateX(Math.PI / 2).translate(2.6, s * 1.2, 0.7));
      sticks.push(new THREE.SphereGeometry(0.035, 10, 8).translate(2.6, s * 1.2, 0.79));
    }
    for (const s of [-1, 1]) sticks.push(new THREE.BoxGeometry(0.04, 0.03, 0.2).rotateY(-0.5).translate(2.55, s * 0.08, 0.6));
    this.add(sticks, black);
    // the overhead panel, sloping up and back
    const over = new THREE.BoxGeometry(1.1, 1.0, 0.04);
    over.rotateY(-18 * DEG).translate(2.75, 0, 1.86);
    this.add([over], panel);
    this.overhead = this.overheadTexture(over);
  }

  add(list, material) {
    const g = list.length === 1 ? list[0] : mergeAll(list);
    this.group.add(new THREE.Mesh(g, material));
  }

  // A tube: a canvas on a quad facing the crew, lit by itself. The quad's right is the crew's right
  // (+y), its top is up (+z), it faces aft (+x) toward the eye, then leans back by tilt degrees.
  screen(w, h, [x, y, z], width, height, tiltDeg) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0));
    const a = tiltDeg * DEG, n = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const q = new THREE.PlaneGeometry(width, height).applyMatrix4(basis).rotateY(-a).translate(x, y, z);
    this.group.add(new THREE.Mesh(q, new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })));
    const bezel = new THREE.BoxGeometry(0.02, width + 0.035, height + 0.035).rotateY(-a).translate(x - n.x * 0.011, y, z - n.z * 0.011);
    this.group.add(new THREE.Mesh(bezel, this.materials.black));
    return { canvas: c, g: c.getContext('2d'), tex };
  }

  // The flight deck's own lighting: a dim flood that keeps the panel readable at dusk and at night.
  flood(level) {
    for (const m of this.lit) m.emissive.copy(m.color).multiplyScalar(level * 3);
  }

  overheadTexture() {
    return null;
  }

  // One tube a frame, in turn: seven canvases redrawn and uploaded together are a spike a CPU rasteriser
  // feels; spread out, each still refreshes several times a second.
  drawOne(k, s, flight) {
    const order = [['pfd', pfd], ['nd', nd], ['ewd', ewd], ['sd', sd], ['fopfd', pfd], ['fond', nd]];
    if (k % 7 === 6) {
      fcu(this.fcu, flight);
      this.fcu.tex.needsUpdate = true;
      return;
    }
    const [name, paint] = order[k % 7];
    paint(this.tubes[name], s, flight);
    this.tubes[name].tex.needsUpdate = true;
  }

  // Every tube at once: when the deck first comes into view.
  draw(s, flight) {
    pfd(this.tubes.pfd, s, flight);
    pfd(this.tubes.fopfd, s, flight);
    nd(this.tubes.nd, s, flight);
    nd(this.tubes.fond, s, flight);
    ewd(this.tubes.ewd, s, flight);
    sd(this.tubes.sd, s);
    fcu(this.fcu, flight);
    for (const t of [...Object.values(this.tubes), this.fcu]) t.tex.needsUpdate = true;
  }
}

function mergeAll(list) {
  const nonIndexed = list.map((g) => (g.index ? g.toNonIndexed() : g));
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal']) {
    const total = nonIndexed.reduce((n, x) => n + x.attributes[name].array.length, 0);
    const arr = new Float32Array(total);
    let at = 0;
    for (const x of nonIndexed) {
      arr.set(x.attributes[name].array, at);
      at += x.attributes[name].array.length;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, 3));
  }
  return out;
}

// ---- the placeholder pictures ----------------------------------------------------------------------

const GREEN = '#3cf06a', CYAN = '#2fd6ff', AMBER = '#ffaa22', MAGENTA = '#ff5cff', WHITE = '#f0f0f0', YELLOW = '#ffe14a';

function text(g, s, x, y, colour, size = 22, align = 'center') {
  g.fillStyle = colour;
  g.font = `${size}px "Consolas", "Cascadia Mono", monospace`;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillText(s, x, y);
}

function pfd({ g }, s, f) {
  const W = 512;
  g.fillStyle = '#000';
  g.fillRect(0, 0, W, W);
  const cx = 250, cy = 250, ppd = 7.5;
  g.save();
  g.beginPath();
  g.roundRect(150, 120, 200, 260, 60);
  g.clip();
  g.translate(cx, cy);
  g.rotate(-(s.roll_deg || 0) * DEG);
  const p = (s.pitch_deg || 0) * ppd;
  g.fillStyle = '#2f86d8';
  g.fillRect(-400, -800 + p, 800, 800);
  g.fillStyle = '#8b5a2b';
  g.fillRect(-400, p, 800, 800);
  g.strokeStyle = WHITE;
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(-400, p); g.lineTo(400, p); g.stroke();
  for (let a = -30; a <= 30; a += 2.5) {
    if (!a) continue;
    const y = p - a * ppd, w = a % 10 === 0 ? 50 : a % 5 === 0 ? 26 : 12;
    g.beginPath(); g.moveTo(-w, y); g.lineTo(w, y); g.stroke();
    if (a % 10 === 0) { text(g, `${Math.abs(a)}`, -w - 18, y, WHITE, 16); text(g, `${Math.abs(a)}`, w + 18, y, WHITE, 16); }
  }
  g.restore();
  // the aircraft symbol and the roll index
  g.fillStyle = '#000';
  g.strokeStyle = YELLOW;
  g.lineWidth = 4;
  for (const sgn of [-1, 1]) { g.beginPath(); g.moveTo(cx + sgn * 30, cy); g.lineTo(cx + sgn * 80, cy); g.lineTo(cx + sgn * 80, cy + 10); g.stroke(); }
  g.strokeRect(cx - 4, cy - 4, 8, 8);
  g.strokeStyle = WHITE;
  g.lineWidth = 2;
  g.beginPath(); g.arc(cx, cy, 120, -Math.PI / 2 - 0.8, -Math.PI / 2 + 0.8); g.stroke();
  g.fillStyle = YELLOW;
  g.beginPath(); g.moveTo(cx, cy - 122); g.lineTo(cx - 9, cy - 108); g.lineTo(cx + 9, cy - 108); g.fill();
  // speed tape
  g.fillStyle = '#3c3f44';
  g.fillRect(40, 120, 72, 260);
  const cas = s.cas_kn || 0;
  g.save();
  g.beginPath(); g.rect(40, 120, 72, 260); g.clip();
  for (let v = Math.floor((cas - 50) / 10) * 10; v < cas + 50; v += 10) {
    const y = cy - (v - cas) * 4.2;
    g.strokeStyle = WHITE; g.beginPath(); g.moveTo(98, y); g.lineTo(112, y); g.stroke();
    if (v % 20 === 0 && v >= 30) text(g, `${v}`, 72, y, WHITE, 22);
  }
  if (f.vapp) {   // the speed bug only where a Vapp is known
    g.fillStyle = MAGENTA;
    const yv = cy - (f.vapp - cas) * 4.2;
    g.beginPath(); g.moveTo(112, yv); g.lineTo(124, yv - 8); g.lineTo(124, yv + 8); g.fill();
  }
  g.restore();
  g.strokeStyle = YELLOW; g.lineWidth = 4;
  g.beginPath(); g.moveTo(30, cy); g.lineTo(118, cy); g.stroke();
  // altitude tape and its window
  const alt = s.alt_ft || 0;
  g.fillStyle = '#3c3f44';
  g.fillRect(390, 120, 60, 260);
  g.save();
  g.beginPath(); g.rect(390, 120, 60, 260); g.clip();
  for (let a = Math.floor((alt - 600) / 100) * 100; a < alt + 600; a += 100) {
    const y = cy - (a - alt) * 0.42;
    g.strokeStyle = WHITE; g.lineWidth = 2; g.beginPath(); g.moveTo(390, y); g.lineTo(400, y); g.stroke();
    if (a % 500 === 0) text(g, `${Math.round(a / 100)}`.padStart(3, '0'), 425, y, WHITE, 20);
  }
  g.restore();
  g.fillStyle = '#000'; g.strokeStyle = YELLOW; g.lineWidth = 3;
  g.fillRect(392, cy - 20, 70, 40); g.strokeRect(392, cy - 20, 70, 40);
  text(g, `${Math.round(alt / 20) * 20}`.padStart(5, ' '), 428, cy, GREEN, 24);
  // vertical speed
  const vs = s.vs_fpm || 0;
  g.strokeStyle = GREEN; g.lineWidth = 3;
  g.beginPath(); g.moveTo(500, cy); g.lineTo(470, cy - Math.max(-120, Math.min(120, vs / 20))); g.stroke();
  if (Math.abs(vs) > 200) text(g, `${Math.round(Math.abs(vs) / 100)}`, 492, cy + (vs < 0 ? 140 : -140), GREEN, 18);
  // heading tape
  const hdg = s.heading_deg || 0;
  g.fillStyle = '#3c3f44'; g.fillRect(150, 420, 200, 40);
  g.save(); g.beginPath(); g.rect(150, 420, 200, 40); g.clip();
  for (let h = Math.floor(hdg / 5) * 5 - 20; h <= hdg + 20; h += 5) {
    const x = cx - (hdg - h) * 9;
    g.strokeStyle = WHITE; g.lineWidth = 2; g.beginPath(); g.moveTo(x, 420); g.lineTo(x, h % 10 ? 428 : 434); g.stroke();
    if (h % 10 === 0) text(g, `${((Math.round(h / 10) % 36) + 36) % 36}`, x, 446, WHITE, 18);
  }
  g.restore();
  g.strokeStyle = YELLOW; g.beginPath(); g.moveTo(cx, 414); g.lineTo(cx, 440); g.stroke();
  // ILS deviation, radio height, the flight mode annunciator
  if (s.loc_valid !== 0) {
    g.fillStyle = MAGENTA;
    const lx = cx + Math.max(-2, Math.min(2, s.loc_dots || 0)) * 32, gy = cy - Math.max(-2, Math.min(2, s.gs_dots || 0)) * 32;
    g.beginPath(); g.moveTo(lx, 392); g.lineTo(lx - 9, 400); g.lineTo(lx, 408); g.lineTo(lx + 9, 400); g.fill();
    g.beginPath(); g.moveTo(370, gy - 9); g.lineTo(378, gy); g.lineTo(370, gy + 9); g.lineTo(362, gy); g.fill();
  }
  const ra = s.ra_ft || 0;
  if (ra < 2500) text(g, `${Math.max(0, Math.round(ra / (ra < 50 ? 1 : ra < 200 ? 5 : 10)) * (ra < 50 ? 1 : ra < 200 ? 5 : 10))}`, cx, 360, ra < 200 ? AMBER : GREEN, 26);
  g.strokeStyle = '#555'; g.lineWidth = 2;
  for (const x of [100, 200, 300, 400]) { g.beginPath(); g.moveTo(x, 8); g.lineTo(x, 80); g.stroke(); }
  for (const [x, a, b] of [[50, f.fma[0], ''], [150, f.fma[1], ''], [250, f.fma[2], ''], [350, f.fma[3], ''], [456, '', '']]) {
    text(g, a, x, 24, GREEN, 20);
    if (b) text(g, b, x, 50, WHITE, 18);
  }
}

function nd({ g }, s, f) {
  const W = 512, cx = 256, cy = 420;
  g.fillStyle = '#000';
  g.fillRect(0, 0, W, W);
  const hdg = s.heading_deg || 0, trk = s.track_deg ?? hdg;
  g.strokeStyle = WHITE; g.lineWidth = 2;
  g.beginPath(); g.arc(cx, cy, 330, -Math.PI / 2 - 0.85, -Math.PI / 2 + 0.85); g.stroke();
  for (let a = -50; a <= 50; a += 5) {
    const h = Math.round(hdg / 5) * 5 + a, ang = (h - hdg) * DEG - Math.PI / 2;
    const r0 = 330, r1 = h % 10 ? 320 : 312;
    if (Math.abs(h - hdg) > 50) continue;
    g.beginPath(); g.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0); g.lineTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1); g.stroke();
    if (h % 30 === 0) text(g, `${((h / 10) % 36 + 36) % 36}`, cx + Math.cos(ang) * 296, cy + Math.sin(ang) * 296, WHITE, 18);
  }
  g.setLineDash([6, 8]);
  g.strokeStyle = '#ffffff';
  g.beginPath(); g.arc(cx, cy, 165, -Math.PI / 2 - 0.85, -Math.PI / 2 + 0.85); g.stroke();
  g.setLineDash([]);
  // the ILS course and the runway ahead
  const crs = (f.course - hdg) * DEG - Math.PI / 2;
  g.strokeStyle = MAGENTA; g.lineWidth = 3;
  g.beginPath(); g.moveTo(cx + Math.cos(crs) * 60, cy + Math.sin(crs) * 60); g.lineTo(cx + Math.cos(crs) * 320, cy + Math.sin(crs) * 320); g.stroke();
  const d = Math.max(0, f.distanceNm || 0), rx = cx + Math.cos(crs) * (d / 10) * 330, ry = cy + Math.sin(crs) * (d / 10) * 330;
  g.strokeStyle = WHITE; g.lineWidth = 2;
  g.save(); g.translate(rx, ry); g.rotate(crs + Math.PI / 2); g.strokeRect(-3, -18, 6, 18); g.restore();
  g.fillStyle = GREEN;
  const ta = (trk - hdg) * DEG - Math.PI / 2;
  g.beginPath(); g.moveTo(cx + Math.cos(ta) * 336, cy + Math.sin(ta) * 336 - 6); g.lineTo(cx + Math.cos(ta) * 336 + 6, cy + Math.sin(ta) * 336); g.lineTo(cx + Math.cos(ta) * 336, cy + Math.sin(ta) * 336 + 6); g.lineTo(cx + Math.cos(ta) * 336 - 6, cy + Math.sin(ta) * 336); g.fill();
  g.strokeStyle = YELLOW; g.lineWidth = 4;
  g.beginPath(); g.moveTo(cx, cy - 22); g.lineTo(cx, cy + 22); g.moveTo(cx - 24, cy - 6); g.lineTo(cx + 24, cy - 6); g.moveTo(cx - 9, cy + 18); g.lineTo(cx + 9, cy + 18); g.stroke();
  text(g, `GS${Math.round(s.gs_kn || 0)}  TAS${Math.round(s.tas_kn || s.gs_kn || 0)}`, 14, 24, WHITE, 20, 'left');
  text(g, f.ils || '', 498, 24, MAGENTA, 20, 'right');
  text(g, `CRS${String(Math.round(f.course)).padStart(3, '0')}°`, 498, 50, MAGENTA, 18, 'right');
  text(g, `${d.toFixed(1)} NM`, 498, 76, WHITE, 18, 'right');
  g.strokeStyle = YELLOW; g.lineWidth = 2;
  g.beginPath(); g.moveTo(cx, 82); g.lineTo(cx - 10, 66); g.lineTo(cx + 10, 66); g.closePath(); g.stroke();
}

function gauge(g, x, y, r, value, max, label, digits) {
  g.strokeStyle = WHITE; g.lineWidth = 3;
  const a0 = Math.PI * 0.8, a1 = Math.PI * 2.05;
  g.beginPath(); g.arc(x, y, r, a0, a1); g.stroke();
  g.strokeStyle = '#ff3030';
  g.beginPath(); g.arc(x, y, r, a1 - 0.12, a1); g.stroke();
  const a = a0 + (a1 - a0) * Math.min(1, value / max);
  g.strokeStyle = GREEN; g.lineWidth = 4;
  g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); g.stroke();
  g.strokeStyle = '#777'; g.lineWidth = 2;
  g.strokeRect(x + 6, y + 8, 78, 32);
  text(g, digits, x + 45, y + 24, GREEN, 24);
  text(g, label, x, y + 62, CYAN, 16);
}

function ewd({ g }, s, f) {
  g.fillStyle = '#000';
  g.fillRect(0, 0, 512, 512);
  for (const [k, x] of [[1, 120], [2, 360]]) {
    const n1 = s[`n1_${k}`] || 0;
    gauge(g, x, 100, 70, n1, 104, 'N1 %', n1.toFixed(1));
    // REV in the N1 dial, boxed: amber while the reverser moves, green once it is deployed
    const rev = reverserState(s[`reverser_${k}`]);
    if (rev !== 'stowed') {
      const colour = rev === 'deployed' ? GREEN : AMBER;
      g.strokeStyle = colour; g.lineWidth = 2;
      g.strokeRect(x - 66, 110, 56, 28);
      text(g, 'REV', x - 38, 124, colour, 20);
    }
    gauge(g, x, 240, 52, 0, 1000, 'EGT °C', '---');
  }
  text(g, 'FOB :  ---', 256, 330, GREEN, 22);
  const flap = s.flap_deg || 0;
  text(g, 'S', 330, 300, CYAN, 18);
  text(g, 'F', 470, 300, CYAN, 18);
  text(g, flap > 39 ? 'FULL' : flap > 15 ? '3' : flap > 5 ? '2' : flap > 0.5 ? '1' : '', 400, 330, CYAN, 22);
  g.strokeStyle = '#666'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(20, 370); g.lineTo(492, 370); g.stroke();
  const memo = f.memo || [];
  memo.forEach(([line, colour], k) => text(g, line, 30, 395 + k * 24, colour === 'c' ? CYAN : colour === 'a' ? AMBER : GREEN, 19, 'left'));
}

function sd({ g }, s) {
  g.fillStyle = '#000';
  g.fillRect(0, 0, 512, 512);
  text(g, 'WHEEL', 256, 30, WHITE, 24);
  const down = (s.gear_pos ?? 1) > 0.99;
  for (const [x, y] of [[256, 150], [130, 300], [382, 300]]) {
    g.fillStyle = down ? GREEN : s.gear_pos > 0.01 ? '#ff3030' : '#222';
    g.beginPath(); g.moveTo(x - 22, y - 16); g.lineTo(x + 22, y - 16); g.lineTo(x, y + 18); g.fill();
    g.beginPath(); g.moveTo(x - 50, y - 16); g.lineTo(x - 6, y - 16); g.lineTo(x - 28, y + 18); g.fill();
  }
  text(g, 'SPLRS', 256, 410, WHITE, 18);
  for (let k = 0; k < 5; ++k) {
    const up = (s.spoiler_l_deg || 0) > 5;
    g.fillStyle = up ? GREEN : '#333';
    g.fillRect(150 + k * 18, up ? 430 : 440, 12, up ? 20 : 4);
    g.fillRect(272 + k * 18, up ? 430 : 440, 12, up ? 20 : 4);
  }
  text(g, 'TAT ---   SAT ---', 256, 490, GREEN, 18);
}

function fcu({ g, canvas }, f) {
  g.fillStyle = '#20252a';
  g.fillRect(0, 0, canvas.width, canvas.height);
  const field = (x, label, value) => {
    g.fillStyle = '#05070a';
    g.fillRect(x, 26, 150, 52);
    text(g, label, x + 75, 14, WHITE, 16);
    text(g, value, x + 75, 53, '#ff9a2a', 40);
  };
  field(80, 'SPD', f.fcuSpeed);
  field(300, 'HDG', f.fcuHeading);
  field(560, 'ALT', f.fcuAlt);
  field(800, 'V/S', f.fcuVs);
}
