// fd-view.js — the flight director on the page (orbit_fd.h): the crew's guidance, flown by hand. While a
// person flies, the core runs the crew's guidance in the shadow and reads out what it would command; this
// draws it, airliner style, on the HUD's own canvas:
//   - a primary flight display: the attitude, a pitch bar and a bank bar to fly the aircraft symbol onto
//     (above the air the bar is the heading's), the bank scale with the director's bank on it (the entry's
//     bank command among them), the throttle with its cue, and the ILS's localizer and glide slope to KDFW
//     17C when they are received, from the runway's own geometry;
//   - in the view, chase or cockpit, a single cue where the director wants the nose, and the nose's own
//     mark, beside the velocity vector the HUD draws: fly the one onto the other;
//   - on an approach to 17C, the path to follow in the world: gates down the glide slope, a kilometre apart.
// 8 cycles it: shown while you fly (the default), shown while the crew flies too, off. The deck's own
// display and the docking reticle draw near the Ring, where the core's director says nothing, so two are
// never drawn at once. The numbers are fd-hud.js's. GPLv3.

import * as THREE from 'three';
import { validateAirport } from '../../../web/src/airport-layout.js';
import KDFW from '../../../web/data/kdfw.json' with { type: 'json' };
import { AUTO } from './core.js';
import {
  FD_MODES, FD_MODE_WORDS, FD_PH, directionAt, fdCues, fdLabel, fdLines, fdShown, fmtBank, fmtHdg, glidePathGates, ilsDeviation, ilsGeometry, ilsShown,
} from './fd-hud.js';
import { add, cross, scale, three } from './frames.js';

const D2R = Math.PI / 180;
const MAGENTA = '#ff6ad5', INK = 'rgba(236, 242, 248, 0.92)', FAINT = 'rgba(236, 242, 248, 0.35)', AMBER = '#ffb35c', CYAN = '#7cc7ff';
const SKY = 'rgba(38, 104, 168, 0.62)', GROUND = 'rgba(122, 82, 44, 0.62)', MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';
const SAVED = 'runway-to-ring.fd';
const PX_PER_DEG = 1 / 22;   // of R: the ball shows 22 degrees of pitch from its middle to its edge

function loadMode() { try { const m = window.localStorage.getItem(SAVED); return FD_MODES.includes(m) ? m : 'hand'; } catch { return 'hand'; } }
function saveMode(m) { try { window.localStorage.setItem(SAVED, m); } catch { /* nowhere to keep it */ } }

// ---- the primary flight display --------------------------------------------------------------------------

function line(g, x0, y0, x1, y1) { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
function tri(g, x, y, ang, size, fill) {   // a triangle at x, y pointing along ang (radians from up, clockwise)
  const s = Math.sin(ang), c = -Math.cos(ang);
  g.beginPath();
  g.moveTo(x + s * size, y + c * size);
  g.lineTo(x - c * size * 0.7, y + s * size * 0.7);
  g.lineTo(x + c * size * 0.7, y - s * size * 0.7);
  g.closePath();
  if (fill) g.fill(); else g.stroke();
}

// The attitude ball, centred at cx, cy, R to its edge; the director's bars, its bank index; the ILS's scales.
function drawPfd(g, cx, cy, R, s, cue, ils, opts) {
  g.save();
  g.font = `600 11px ${MONO}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  // the panel behind it all
  const w = R * 2 + 150, top = cy - R - 30, h = R * 2 + (ils ? 86 : 62);
  g.fillStyle = 'rgba(5, 8, 13, 0.62)';
  g.strokeStyle = 'rgba(170, 200, 230, 0.26)';
  g.lineWidth = 1;
  g.beginPath(); g.roundRect(cx - R - 22, top, w, h, 8); g.fill(); g.stroke();
  // the ball: sky and ground about a horizon tilted by the bank and moved by the pitch
  const ppd = R * PX_PER_DEG, roll = s.roll * D2R;
  g.save();
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.clip();
  g.translate(cx, cy);
  g.rotate(-roll);
  const hy = s.pitch * ppd;   // the horizon, below the middle by the pitch
  g.fillStyle = SKY; g.fillRect(-2 * R, -4 * R + hy, 4 * R, 4 * R);
  g.fillStyle = GROUND; g.fillRect(-2 * R, hy, 4 * R, 4 * R);
  g.strokeStyle = INK; g.lineWidth = 1.5; line(g, -2 * R, hy, 2 * R, hy);
  g.lineWidth = 1;
  g.fillStyle = INK;
  for (let p = -90; p <= 90; p += 5) {   // the pitch ladder: every 5, numbered every 10
    if (p === 0) continue;
    const y = hy - p * ppd;
    if (Math.abs(y) > R * 1.3) continue;
    const half = p % 10 === 0 ? R * 0.28 : R * 0.13;
    g.strokeStyle = p > 0 ? INK : FAINT;
    line(g, -half, y, half, y);
    if (p % 10 === 0) { g.fillText(String(Math.abs(p)), -half - 12, y); g.fillText(String(Math.abs(p)), half + 12, y); }
  }
  g.restore();
  // the bank scale, fixed, and its pointers: the craft's (white, with the sky) and the director's (magenta)
  g.strokeStyle = INK; g.lineWidth = 1.5;
  for (const a of [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]) {
    const t = (a * D2R) - Math.PI / 2, long = a % 30 === 0 ? 10 : 6;
    line(g, cx + Math.cos(t) * R, cy + Math.sin(t) * R, cx + Math.cos(t) * (R + long), cy + Math.sin(t) * (R + long));
  }
  const pointer = (bank, colour, outside) => {
    const t = -bank - Math.PI / 2, r = outside ? R + 15 : R - 9;
    g.fillStyle = colour;
    tri(g, cx + Math.cos(t) * r, cy + Math.sin(t) * r, -bank + (outside ? Math.PI : 0), 7, true);
  };
  if (cue) pointer(cue.cmdBank, MAGENTA, true);
  pointer(roll, INK, false);
  // the director's bars, then the aircraft symbol over them
  if (cue) {
    g.save();
    g.beginPath(); g.arc(cx, cy, R - 2, 0, Math.PI * 2); g.clip();
    g.strokeStyle = 'rgba(0, 0, 0, 0.55)'; g.lineWidth = 6;
    line(g, cx - R * 0.62, cy + cue.pitch, cx + R * 0.62, cy + cue.pitch);
    line(g, cx + cue.lateral, cy - R * 0.62, cx + cue.lateral, cy + R * 0.62);
    g.strokeStyle = MAGENTA; g.lineWidth = 3;
    line(g, cx - R * 0.62, cy + cue.pitch, cx + R * 0.62, cy + cue.pitch);
    if (cue.lateralIs === 'heading') g.setLineDash([7, 4]);   // above the air: turn, do not bank
    line(g, cx + cue.lateral, cy - R * 0.62, cx + cue.lateral, cy + R * 0.62);
    g.setLineDash([]);
    g.restore();
  }
  g.fillStyle = '#ffd23f'; g.strokeStyle = 'rgba(0, 0, 0, 0.8)'; g.lineWidth = 1.5;
  for (const sx of [-1, 1]) { g.beginPath(); g.rect(cx + sx * R * 0.18 - (sx > 0 ? 0 : R * 0.3), cy - 2.5, R * 0.3, 5); g.fill(); g.stroke(); }
  g.beginPath(); g.rect(cx - 3, cy - 3, 6, 6); g.fill(); g.stroke();
  // the ILS: the localizer below, the glide slope at the right; a diamond where the course and the path are
  if (ils) {
    const dot = R * 0.32;
    const scaleRow = (horizontal, at, dots, valid) => {
      g.strokeStyle = FAINT; g.lineWidth = 1.2;
      for (const k of [-2, -1, 1, 2]) {
        const x = horizontal ? cx + k * dot : at, y = horizontal ? at : cy + k * dot;
        g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.stroke();
      }
      g.strokeStyle = INK; g.lineWidth = 2;
      if (horizontal) line(g, cx, at - 7, cx, at + 7); else line(g, at - 7, cy, at + 7, cy);
      if (!valid) return;
      const off = -Math.max(-2.3, Math.min(2.3, dots)) * dot;   // the course or the path that way from the craft
      const x = horizontal ? cx + off : at, y = horizontal ? at : cy + off;
      g.fillStyle = Math.abs(dots) < 0.5 ? '#6fe08a' : MAGENTA; g.strokeStyle = 'rgba(0, 0, 0, 0.7)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, y - 7); g.lineTo(x + 6, y); g.lineTo(x, y + 7); g.lineTo(x - 6, y); g.closePath(); g.fill(); g.stroke();
    };
    scaleRow(true, cy + R + 16, ils.loc.dots, ils.loc.valid);
    scaleRow(false, cx + R + 18, ils.gs.dots, ils.gs.valid);
  }
  // the throttle: its scale, the hand's setting, the engine's thrust, the director's cue
  const tx = cx + R + 48, tTop = cy - R * 0.9, tBot = cy + R * 0.9, ty = (v) => tBot - (tBot - tTop) * v;
  g.fillStyle = 'rgba(124, 199, 255, 0.22)'; g.fillRect(tx - 7, ty(s.throttle), 14, tBot - ty(s.throttle));
  g.strokeStyle = FAINT; g.lineWidth = 1; g.strokeRect(tx - 7, tTop, 14, tBot - tTop);
  g.strokeStyle = CYAN; g.lineWidth = 3; line(g, tx - 9, ty(opts.hand), tx + 9, ty(opts.hand));
  if (cue) { g.fillStyle = MAGENTA; tri(g, tx - 15, ty(cue.throttle), Math.PI / 2, 7, true); }
  g.fillStyle = INK; g.fillText('THR', tx, tBot + 12);
  // the words: what the director follows, and on the way home its bank about the air and its angle of attack
  g.textAlign = 'left';
  const below = cy + R + (ils ? 38 : 16);
  g.fillStyle = cue ? MAGENTA : FAINT;
  g.fillText(cue ? `FD · ${fdLabel(s.fdPhase)}` : 'FD', cx - R - 12, top + 13);
  g.fillStyle = INK;
  g.textAlign = 'right';
  if (ils) g.fillText(`ILS ${opts.ilsId}${ils.loc.valid ? ` · ${(ils.distance / 1000).toFixed(1)} km` : ''}`, cx + R + 118, top + 13);
  g.textAlign = 'left';
  if (cue && opts.air) g.fillText(`BANK ${fmtBank(s.fdLiftBank)}  α ${s.fdAlpha.toFixed(0)}°`, cx - R - 12, below + 8);
  else if (cue) g.fillText(`P ${s.fdPitch.toFixed(0)}°  B ${fmtBank(s.fdBank)}${cue.lateralIs === 'heading' ? `  HDG ${fmtHdg(s.fdHdg)}` : ''}`, cx - R - 12, below + 8);
  if (cue && s.fdGear > 0.5 !== s.gear > 0.5) { g.fillStyle = AMBER; g.textAlign = 'right'; g.fillText(`GEAR ${s.fdGear > 0.5 ? 'DOWN' : 'UP'}`, cx + R + 118, below + 8); }
  g.restore();
}

// ---- the cue in the view ----------------------------------------------------------------------------------

// A point at infinity along dir (site frame), on the screen: CSS pixels, or null behind or far off it.
function onScreen(camera, dir, w, h) {
  const v = new THREE.Vector3(...three(scale(dir, 1e4)));
  const ahead = v.clone().applyQuaternion(camera.quaternion.clone().invert());
  if (ahead.z > -1) return null;
  v.project(camera);
  if (Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05) return null;
  return [((v.x + 1) / 2) * w, ((1 - v.y) / 2) * h];
}

// The wings' slope on the screen, for a nose along fwd with its right wing along right.
function wingsAngle(camera, fwd, right, w, h) {
  const a = onScreen(camera, fwd, w, h), b = onScreen(camera, add(fwd, scale(right, 0.02)), w, h);
  return a && b ? Math.atan2(b[1] - a[1], b[0] - a[0]) : 0;
}

function drawViewCue(g, at, angle, colour, kind) {
  g.save();
  g.translate(at[0], at[1]);
  g.rotate(angle);
  g.strokeStyle = 'rgba(0, 0, 0, 0.6)'; g.lineWidth = 5;
  const draw = () => {
    if (kind === 'cue') {   // the director: a ring with wings
      g.beginPath(); g.arc(0, 0, 10, 0, Math.PI * 2); g.stroke();
      line(g, -34, 0, -10, 0); line(g, 10, 0, 34, 0);
    } else {   // the nose: a W, the waterline mark
      g.beginPath(); g.moveTo(-26, 0); g.lineTo(-13, 0); g.lineTo(-6.5, 9); g.lineTo(0, 0); g.lineTo(6.5, 9); g.lineTo(13, 0); g.lineTo(26, 0); g.stroke();
    }
  };
  draw();
  g.strokeStyle = colour; g.lineWidth = 2.5; draw();
  g.restore();
}

// ---- the path in the world ----------------------------------------------------------------------------

// The glide path's gates (fd-hud.js), as lines in the site frame's three.js axes from the start point: the
// mesh is placed from the eye each frame. Magenta, as the director's cues are; the distance shrinks them, so
// the path reads as a tunnel down to the runway.
function gatesMesh(gates) {
  const pos = [];
  for (const gate of gates) {
    for (let k = 0; k < 4; k++) for (const c of [gate.corners[k], gate.corners[(k + 1) % 4]]) pos.push(...three(c));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xff6ad5, transparent: true, opacity: 0.9, depthWrite: false, fog: false }));
  lines.frustumCulled = false;
  lines.visible = false;
  lines.name = 'glide path';
  return lines;
}

// ---- the feature (features.js) -------------------------------------------------------------------------

export const fd = {
  name: 'fd',
  mode: 'hand',

  init(ctx) {
    this.mode = loadMode();
    this.geometry = ilsGeometry(validateAirport(KDFW), '17C', ctx.START);
    const hud = document.getElementById('hud');
    if (!hud) throw new Error('the page has no #hud for the flight director');
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'fd-display';
    this.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
    hud.prepend(this.canvas);
    this.g = this.canvas.getContext('2d');
    this.drawn = false;
    this.touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    this.gates = gatesMesh(glidePathGates(this.geometry));
    ctx.near.add(this.gates);
    this.sync(ctx);
  },

  // The core computes the director only while it is wanted (oc_fd), and starts with it on at every reset.
  sync(ctx) {
    const want = this.mode !== 'off' ? 1 : 0;
    if ((ctx.core.s.fdOn > 0.5 ? 1 : 0) !== want && typeof ctx.core.m._oc_fd === 'function') { ctx.core.m._oc_fd(want); ctx.core.read(); }
  },

  command(c, ctx) {
    if (c !== 'fd') return false;
    this.mode = FD_MODES[(FD_MODES.indexOf(this.mode) + 1) % FD_MODES.length];
    saveMode(this.mode);
    this.sync(ctx);
    ctx.say(FD_MODE_WORDS[this.mode]);
    return true;
  },

  update(ctx) {
    this.sync(ctx);
    const s = ctx.s;
    const shown = fdShown(s, this.mode);
    const dev = ilsDeviation(this.geometry, ctx.P, s.alt);
    const flying = Math.round(s.auto) === AUTO.off || (Math.round(s.auto) === AUTO.return && s.alt < 8000) || this.mode === 'always';
    const ils = this.mode !== 'off' && flying && ilsShown(s, dev, this.geometry) ? dev : null;
    this.state = { shown, ils };
    // the path in the world, placed from the eye like the field (main.js)
    this.gates.visible = !!ils;
    if (ils) this.gates.position.set(...ctx.rel([0, 0, 0]));
    const w = window.innerWidth, h = window.innerHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (!shown && !ils) {
      if (this.drawn) { this.g.setTransform(1, 0, 0, 1, 0, 0); this.g.clearRect(0, 0, this.canvas.width, this.canvas.height); this.drawn = false; }
      return;
    }
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
    const g = this.g;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const narrow = w < 560 || this.touch;
    const R = narrow ? 52 : Math.max(62, Math.min(92, Math.min(w, h) * 0.1));
    // on a desk, at the foot of the screen, clear of the readouts; on a phone, above the stick and the throttle
    const readouts = document.getElementById('readouts')?.getBoundingClientRect();
    let cx = w / 2, cy = h - R - (ils ? 70 : 46);
    if (narrow) cy = h - R - 236;
    else if (readouts && readouts.width > 0 && readouts.right + R + 40 > cx - R - 22) cx = Math.min(w - R - 150, readouts.right + R + 46);
    const cue = shown ? fdCues(s, R) : null;
    const phase = Math.round(s.fdPhase);
    drawPfd(g, cx, cy, R, s, cue, ils, { hand: ctx.input.hands.throttle, ilsId: this.geometry.id, air: phase >= FD_PH.coast && phase <= FD_PH.flare });
    // in the view: where the director wants the nose, and the nose
    if (shown && ctx.VIEWS[ctx.state.view] !== 'from the Ring') {
      const want = directionAt(ctx.P, s.fdPitch, s.fdHdg, ctx.START.lat);
      const at = onScreen(ctx.camera, want, w, h), nose = onScreen(ctx.camera, ctx.axes.fwd, w, h);
      if (nose) drawViewCue(g, nose, wingsAngle(ctx.camera, ctx.axes.fwd, ctx.axes.right, w, h), INK, 'nose');
      if (at) {
        // the director's wings, banked as it asks: the right wing level, square to the nose, turned down about
        // the nose by the bank (the craft's top, unbanked, is the level wing crossed with the nose)
        const level = directionAt(ctx.P, 0, s.fdHdg + 90, ctx.START.lat), top = cross(level, want), b = s.fdBank * D2R;
        const right = [0, 1, 2].map((i) => level[i] * Math.cos(b) - top[i] * Math.sin(b));
        drawViewCue(g, at, wingsAngle(ctx.camera, want, right, w, h), MAGENTA, 'cue');
      }
    }
    this.drawn = true;
  },

  hud(ctx) {
    const st = this.state || { shown: false, ils: null };
    return fdLines(ctx.s, st.shown, st.ils, this.geometry ? this.geometry.id : '17C', window.innerWidth < 560);
  },
};
