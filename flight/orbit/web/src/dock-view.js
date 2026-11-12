// dock-view.js — docking at the hub, on the page. DOCK (P) starts the crew's docking where it makes sense
// and says why where it does not, and lets go of the port when docked; 5 holds a hand-flying pilot on
// the port (OC_SAS_PORT). It adds the docking's lines to the HUD and the status line, a docking reticle
// over the cockpit view, the markings on the hub's port, which turn with the Ring, and the probe on the
// craft's nose. The docking itself is the core's (core/dock.cpp, orbit_dock.h); the words and the
// reticle's layout are dock-hud.js's. GPLv3.

import * as THREE from 'three';
import { AUTO, HUB_PORT_M, SAS } from './core.js';
import { add, scale } from './frames.js';
import {
  DOCK, DOCK_OUT, DPH, contactText, dockCommand, dockLines, dockStatus, engagedText, fmtNear, fmtSigned, fmtWay, hitText, portHoldMakesSense, reticle,
} from './dock-hud.js';

const PLATE_R = 18;         // m: the target plate round the port, on the hub's face
const PROUD = 0.6;          // m: how far the plate stands off the face; the drogue's cone is that deep
const MOUTH_R = 0.7;        // m: the drogue's mouth, on the plate; its socket, at the face, takes the probe's head
const SOCKET_R = 0.12;

// The target on the hub's face, painted in its own plane: x along the Ring's ref (the key), the other
// axis along ref x axis. A bullseye round the drogue, the alignment cross, the key as a broad orange bar
// with an arrowhead, and ticks every 15 degrees that show the turn.
function paintTarget(g, n) {
  const c = n / 2, m = c / PLATE_R;   // pixels a metre
  const disc = (r, fill) => { g.beginPath(); g.arc(c, c, r * m, 0, Math.PI * 2); g.fillStyle = fill; g.fill(); };
  const ring = (r, w) => { g.beginPath(); g.arc(c, c, r * m, 0, Math.PI * 2); g.lineWidth = w * m; g.stroke(); };
  g.clearRect(0, 0, n, n);
  disc(PLATE_R, '#d6dadf');
  disc(PLATE_R - 0.6, '#c3c8ce');
  g.strokeStyle = '#1d2228';
  for (const r of [3, 7.5, 12]) ring(r, 0.28);
  g.fillStyle = '#1d2228';
  for (const a of [Math.PI / 2, Math.PI, -Math.PI / 2]) {   // the cross's three plain arms
    g.save(); g.translate(c, c); g.rotate(a); g.fillRect(1.1 * m, -0.22 * m, 14.6 * m, 0.44 * m); g.restore();
  }
  g.fillStyle = '#ff7a1a';   // the key, toward +x
  g.fillRect(c + 1.1 * m, c - 0.8 * m, 11.4 * m, 1.6 * m);
  g.beginPath(); g.moveTo(c + 12.5 * m, c - 2.2 * m); g.lineTo(c + 16.6 * m, c); g.lineTo(c + 12.5 * m, c + 2.2 * m); g.closePath(); g.fill();
  g.strokeStyle = '#1d2228';
  g.lineWidth = 0.3 * m;
  for (let k = 0; k < 24; k++) {   // the ticks round the edge: their turn shows the spin
    const a = (k / 24) * Math.PI * 2, r0 = k % 6 === 0 ? 14.6 : 15.6;
    g.beginPath(); g.moveTo(c + Math.cos(a) * r0 * m, c + Math.sin(a) * r0 * m); g.lineTo(c + Math.cos(a) * 17.2 * m, c + Math.sin(a) * 17.2 * m); g.stroke();
  }
  disc(MOUTH_R + 0.35, '#1d2228');
}

// The hub's port: the plate and the drogue, in the Ring's turning frame (x the ref, y the axis), its face
// at y = -HUB_PORT_M. The core's capture is at the face, where the drogue's socket is.
function portMarks() {
  const group = new THREE.Group();
  const face = -HUB_PORT_M;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1024;
  paintTarget(canvas.getContext('2d'), 1024);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  // floodlit: seen on the night side too
  const paint = new THREE.MeshStandardMaterial({
    map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.35, roughness: 0.6, metalness: 0.1,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8,
  });
  const plate = new THREE.Mesh(new THREE.RingGeometry(MOUTH_R, PLATE_R, 96, 1).rotateX(Math.PI / 2), paint);   // facing -y, its x the key, open at the drogue
  plate.position.y = face - PROUD;
  const metal = new THREE.MeshStandardMaterial({ color: 0x8f969e, roughness: 0.5, metalness: 0.6 });
  const edge = new THREE.Mesh(new THREE.CylinderGeometry(PLATE_R, PLATE_R, PROUD, 96, 1, true), metal);
  edge.position.y = face - PROUD / 2;
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 0.4, metalness: 0.7, side: THREE.DoubleSide });
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(SOCKET_R, MOUTH_R, PROUD, 40, 1, true), dark);   // the mouth toward the craft
  cone.position.y = face - PROUD / 2;
  const socket = new THREE.Mesh(new THREE.CircleGeometry(SOCKET_R, 24).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x050608 }));
  socket.position.y = face - 0.002;
  const lip = new THREE.Mesh(new THREE.TorusGeometry(MOUTH_R, 0.05, 8, 48).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x9fe8ff }));
  lip.position.y = face - PROUD - 0.01;
  group.add(plate, edge, cone, socket, lip);
  // lights at the cross's ends: the key's orange, the others white
  for (const [x, z, colour] of [[PLATE_R - 0.4, 0, 0xff8a2a], [-(PLATE_R - 0.4), 0, 0xffffff], [0, PLATE_R - 0.4, 0xffffff], [0, -(PLATE_R - 0.4), 0xffffff]]) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 8), new THREE.MeshBasicMaterial({ color: colour }));
    lamp.position.set(x, face - PROUD - 0.2, z);
    group.add(lamp);
  }
  return group;
}

// The craft's docking adapter, in its drawing's frame (x forward, y up, z right): a fairing on the nose,
// a boom, and the probe's head, whose tip is the core's OC_DOCK_PROBE_M ahead of the centre of mass.
function probe() {
  const group = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0xc8ccd2, roughness: 0.35, metalness: 0.7 });
  const along = (g, x) => g.rotateZ(-Math.PI / 2).translate(x, 0, 0);   // a cylinder's y onto x
  group.add(new THREE.Mesh(along(new THREE.CylinderGeometry(0.24, 0.62, 1.8, 24), 15.5), metal));
  group.add(new THREE.Mesh(along(new THREE.CylinderGeometry(0.07, 0.09, 1.45, 12), DOCK.probe - 0.875), metal));
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12).translate(DOCK.probe - 0.15, 0, 0),
    new THREE.MeshStandardMaterial({ color: 0xffd28a, roughness: 0.3, metalness: 0.8 }));
  group.add(head);
  return group;
}

// The reticle, drawn on the HUD's own canvas from dock-hud.js's layout, centred at cx, cy with radius R.
const GREEN = '#6fe08a', AMBER = '#ffb35c', INK = 'rgba(232, 238, 244, 0.85)', FAINT = 'rgba(232, 238, 244, 0.28)', CYAN = '#7cc7ff';

function drawReticle(g, cx, cy, R, d) {
  const L = reticle(d, R);
  const line = (x0, y0, x1, y1) => { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); };
  const circle = (x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke(); };
  g.save();
  g.translate(cx, cy);
  g.shadowColor = 'rgba(0, 0, 0, 0.7)';
  g.shadowBlur = 3;
  // the scale: its edge, and 1 m and 10 m off the axis
  g.lineWidth = 1;
  g.strokeStyle = FAINT;
  circle(0, 0, R);
  g.setLineDash([3, 5]);
  circle(0, 0, R / 2);
  circle(0, 0, (R * 10) / 11);
  g.setLineDash([]);
  // the crosshair: the craft's docking axis
  g.strokeStyle = INK;
  g.lineWidth = 1.5;
  const gap = Math.max(10, L.capture + 6);
  line(-R, 0, -gap, 0); line(gap, 0, R, 0); line(0, -R, 0, -gap); line(0, gap, 0, R);
  // the drogue's tolerance
  g.strokeStyle = L.ok.offset ? GREEN : AMBER;
  g.setLineDash([4, 3]);
  circle(0, 0, L.capture);
  g.setLineDash([]);
  // the port's alignment cross, turned with its key; the key's end coloured by the roll error
  const [px, py] = L.port, [kx, ky] = L.key, arm = R * 0.3;
  g.strokeStyle = CYAN;
  g.lineWidth = 2.5;
  line(px - kx * arm, py - ky * arm, px + kx * arm * 0.8, py + ky * arm * 0.8);
  line(px + ky * arm, py - kx * arm, px - ky * arm, py + kx * arm);
  g.fillStyle = L.ok.roll ? GREEN : AMBER;
  const tx = px + kx * arm, ty = py + ky * arm, w = 7;
  g.beginPath(); g.moveTo(tx + kx * w, ty + ky * w); g.lineTo(tx - ky * w - kx * w, ty + kx * w - ky * w); g.lineTo(tx + ky * w - kx * w, ty - kx * w - ky * w); g.closePath(); g.fill();
  // where the port's axis points
  g.strokeStyle = L.ok.angle ? GREEN : AMBER;
  g.lineWidth = 2;
  circle(L.axis[0], L.axis[1], 8);
  line(L.axis[0] - 3, L.axis[1], L.axis[0] + 3, L.axis[1]);
  // the port's turn against the craft: an arc from the top, as long as the error, the way the port is seen to turn
  if (Math.abs(L.spin) > 0.005) {
    g.strokeStyle = L.ok.rollRate ? GREEN : AMBER;
    g.lineWidth = 4;
    g.beginPath(); g.arc(0, 0, R + 9, -Math.PI / 2, -Math.PI / 2 + L.spin, L.spin < 0); g.stroke();
  }
  // the numbers, on the HUD's glass, each row amber while one of its errors is outside the capture's tolerance
  const rows = [
    [`${fmtNear(d.range)}   ${fmtWay(d.closing)}`, L.ok.closing],
    [`off ${L.offset.toFixed(2)} m   axis ${d.angle.toFixed(1)}°`, L.ok.offset && L.ok.angle],
    [`key ${fmtSigned(d.roll, 1)}°   spin ${fmtSigned(d.rollRate, 2)}°/s`, L.ok.roll && L.ok.rollRate],
  ];
  g.font = '600 13px ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';
  const wide = Math.max(...rows.map(([t]) => g.measureText(t).width)) + 18, top = R + 16;
  g.shadowBlur = 0;
  g.fillStyle = 'rgba(6, 10, 16, 0.6)';
  g.fillRect(-wide / 2, top, wide, rows.length * 18 + 10);
  g.textAlign = 'center';
  g.textBaseline = 'top';
  rows.forEach(([t, ok], i) => { g.fillStyle = ok ? INK : AMBER; g.fillText(t, 0, top + 6 + i * 18); });
  g.restore();
}

export const dock = {
  name: 'dock',

  init(ctx) {
    this.d = ctx.core.addBlock('dock', '_oc_dock_out', '_oc_dock_out_len', DOCK_OUT);
    this.seen = { cT: this.d.cT, hit: this.d.hit };
    this.touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    ctx.ring.spin.add(portMarks());
    ctx.craft.group.add(probe());
    const hud = document.getElementById('hud');
    if (!hud) throw new Error('the page has no #hud for the docking reticle');
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'dock-reticle';
    this.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
    hud.prepend(this.canvas);
    this.g = this.canvas.getContext('2d');
    this.drawn = false;
  },

  command(c, ctx) {
    const s = ctx.core.read(), d = this.d;
    if (c === 'dock') {
      const act = dockCommand(s, d);
      if (act.action === 'undock') {   // the pilot has it now, as when taking it from the crew: the hands start where the craft is
        ctx.core.m._oc_undock();
        Object.assign(ctx.input.hands, { throttle: 0, gear: s.gear > 0.5, brake: 0 });
      }
      if (act.action !== 'engage') { ctx.say(act.say); return true; }
      ctx.core.auto(AUTO.dock);
      ctx.core.read();
      ctx.say(engagedText(ctx.core.s, d));
      return true;
    }
    if (c === 'sas4' || (c === 'sas-next' && Math.round(s.sas) === SAS.target && portHoldMakesSense(s))) {
      if (!portHoldMakesSense(s)) { ctx.say('The hold on the port is for docking: in orbit, within 50 km of the Ring'); return true; }
      ctx.core.sas(SAS.port);
      ctx.say('Hold: on the hub\'s port, turning with it');
      return true;
    }
    if (c === 'sas-next' && Math.round(s.sas) === SAS.port) {
      ctx.core.sas(SAS.hold);
      ctx.say('Hold: attitude');
      return true;
    }
    return false;
  },

  update(ctx) {
    const s = ctx.s, d = this.d;
    if (d.cT !== this.seen.cT) { if (d.cT > 0) ctx.say(contactText(d)); this.seen.cT = d.cT; }
    if (d.hit !== this.seen.hit) { if (d.hit > 0) ctx.say(`Crashed: ${hitText(d)}`); this.seen.hit = d.hit; }
    const phase = Math.round(d.phase);
    const show = ctx.VIEWS[ctx.state.view] === 'cockpit' && s.crashed === 0 && (d.range < 2000 || phase === DPH.align || phase === DPH.close);
    const w = window.innerWidth, h = window.innerHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (!show) {
      if (this.drawn) { this.g.setTransform(1, 0, 0, 1, 0, 0); this.g.clearRect(0, 0, this.canvas.width, this.canvas.height); this.drawn = false; }
      return;
    }
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.g.clearRect(0, 0, w, h);
    // centred where the docking axis meets the port's face, as seen from the eye: lined up, the crosshair
    // lies on the drogue, though the eye is above the probe and behind it; off the screen, at its middle
    const aim = new THREE.Vector3(...ctx.rel(add(ctx.P, scale(ctx.axes.fwd, DOCK.probe + Math.max(0, d.gap)))));
    const ahead = aim.clone().applyQuaternion(ctx.camera.quaternion.clone().invert());
    aim.project(ctx.camera);
    const onScreen = ahead.z < -1 && Math.abs(aim.x) < 0.75 && Math.abs(aim.y) < 0.75;
    const cx = onScreen ? ((aim.x + 1) / 2) * w : w / 2, cy = onScreen ? ((1 - aim.y) / 2) * h : h * 0.45;
    drawReticle(this.g, cx, cy, Math.max(70, Math.min(170, Math.min(w, h) * 0.2)), d);
    this.drawn = true;
  },

  hud(ctx) { return dockLines(ctx.s, this.d, window.innerWidth < 560); },

  status(ctx) { return dockStatus(ctx.s, this.d, this.touch); },
};
