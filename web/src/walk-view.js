// walk-view.js — a walk inside the ring, on the page. The walk's core (orbit_walk.h) runs on the same fixed steps
// as the flight's, which goes on underneath (docked, the craft rides with the ring), so the ring keeps turning
// and keeps its orbit. While walking this feature draws the whole frame, first person from the walker's eye:
// the real sky first (the flight's far scene, the ray-cast Earth and the stars, from where the eye is in the
// site frame), then the ring's inside over it in two passes, far and near. Keyboard, mouse, gamepad and touch.
// GPLv3.

import * as THREE from 'three';
import { DT } from './core.js';
import { FEATURES } from './features.js';
import { PLACE, WALK, WHERE, WalkCore } from './walk-core.js';
import {
  W, between, clamp, feltUp, outward, ringDirToSite, ringFrame, ringToSite, siteDirToRing, sunFor, viewAxes, walkLines, walkStatus,
} from './walk-math.js';
import { WalkWorld } from './walk-world.js';

const WARPS = [1, 2, 5, 10, 25, 50];
const TURN_RATE = 1.8;     // rad/s: the arrow keys and a gamepad's right stick at full
const MOUSE = 0.0022;      // rad per pixel, the mouse held
const DRAG = 0.005;        // rad per pixel, dragged
const LEAN = 0.25;         // how far the view leans toward the felt up: the inner ear's share (chosen)
const NEAR_SPLIT = 40;     // m: the interior's two passes meet here

export const HELP_WALK = [
  ['W S / ↑ ↓', 'walk forward / back'],
  ['A D', 'step left / right'],
  ['← →', 'turn'],
  ['drag, or click', 'look; a click holds the mouse, Esc lets go'],
  ['Shift', 'run'],
  ['Space', 'jump'],
  ['E, Enter', 'use: a lift, its call, the hatch to the craft'],
  ['F  G', 'drop a ball; throw one'],
  [', .', 'time slower / faster'],
  ['Backspace', 'back to the hatch'],
  ['H', 'this help'],
];

const CSS = `
  body.walking #fpm, body.walking #target, body.walking #throttle { display: none !important; }
  body.walking #buttons button { display: none; }
  body.walking #buttons button[data-cmd="walk"], body.walking #buttons button[data-cmd="slower"], body.walking #buttons button[data-cmd="faster"],
  body.walking #buttons button[data-cmd="help"], body.walking #buttons button[data-cmd="reset"] { display: block; }
  #walk-touch { display: none; position: absolute; right: var(--edge-r); bottom: var(--edge-b); grid-template-columns: repeat(2, 62px);
    gap: 10px; pointer-events: auto; }
  @media (pointer: coarse) { body.walking #walk-touch { display: grid; } }
  #walk-touch button { width: 62px; height: 62px; border-radius: 50%; font: 600 11px/1 var(--sans); letter-spacing: 0.06em; color: var(--ink);
    background: var(--glass); border: 1px solid var(--line); touch-action: none; -webkit-user-select: none; user-select: none; }
  #walk-touch button.on { border-color: var(--vector); color: var(--vector); }
  #walk-dot { display: none; position: absolute; left: 50%; top: 50%; width: 4px; height: 4px; margin: -2px 0 0 -2px; border-radius: 50%;
    background: rgba(232, 238, 244, 0.75); box-shadow: 0 0 2px #000; }
  body.walking #walk-dot { display: block; }
`;

// Where ?walk starts the walk, for a look and for the page's tests: ?walk (the hatch), ?walk=lift, ?walk=floor.
function urlPlace() {
  try {
    const q = new URLSearchParams(location.search);
    if (!q.has('walk')) return null;
    return { lift: PLACE.lift, floor: PLACE.floor }[q.get('walk')] ?? PLACE.hatch;
  } catch {
    return null;
  }
}

const v = {
  on: false, core: null, world: null, cam: null, warp: 1, debt: 0, look: { heading: 0, pitch: 0 },
  prev: null, cur: null, drag: null, was: {}, pads: [], usePulse: false, touchJump: false, touchRun: false, touchBall: false,
  hudNext: 0, sayUntil: 0, saved: null, lean: null, toEcef: null, sun: null, ballFrom: null, ballMark: null,
};

function say(ctx, text) {
  ctx.say(text);
  v.sayUntil = performance.now() + 3500;
}

function canWalk(ctx) {
  return (ctx.core.dock && ctx.core.dock.docked > 0.5) || urlPlace() !== null;
}

function start(ctx, place) {
  if (!v.core) v.core = new WalkCore(ctx.core.m);
  if (!v.world) {
    v.world = new WalkWorld(v.core.boxes());
    v.cam = new THREE.PerspectiveCamera(60, 1, 0.05, NEAR_SPLIT);
    v.toEcef = ctx.frames.threeToEcef(ctx.START.lat, ctx.START.lon);
  }
  const o = v.core.reset(place);
  v.look = { heading: o.heading, pitch: o.pitch };
  v.prev = { ...o };
  v.cur = { ...o };
  Object.assign(v, { on: true, debt: 0, warp: 1, lean: null, ballFrom: null, ballMark: null });
  v.world.markAt(null);
  if (!v.saved) {
    const help = document.getElementById('help'), button = document.querySelector('#buttons button[data-cmd="walk"]');
    v.saved = { look: { ...ctx.input.look }, fov: ctx.camera.fov, help: help ? help.innerHTML : '', label: button ? button.textContent : '' };
    if (help) help.innerHTML = HELP_WALK.map(([k, t]) => `<div><b>${k}</b><span>${t}</span></div>`).join('');
    if (button) button.textContent = 'USE';
  }
  document.body.classList.add('walking');
  const words = { [PLACE.hatch]: 'Aboard the Ring: the hub\'s lobby, at three hundredths of a g. The lifts are ahead.', [PLACE.lift]: 'In lift 1\'s car, at the hub. E: ride down.', [PLACE.floor]: 'On the floor, at one g, by lift 1.' };
  say(ctx, words[place]);
}

function stop(ctx, text) {
  v.on = false;
  document.body.classList.remove('walking');
  if (document.pointerLockElement) document.exitPointerLock();
  if (v.saved) {
    Object.assign(ctx.input.look, v.saved.look, { dragging: false });
    ctx.camera.fov = v.saved.fov;
    ctx.camera.updateProjectionMatrix();
    const help = document.getElementById('help'), button = document.querySelector('#buttons button[data-cmd="walk"]');
    if (help) help.innerHTML = v.saved.help;
    if (button) button.textContent = v.saved.label;
    v.saved = null;
  }
  if (text) say(ctx, text);
}

// ---- the hands --------------------------------------------------------------------------------

function bindPointer(canvas) {
  canvas.addEventListener('pointerdown', (e) => {
    if (!v.on) return;
    v.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0, mouse: e.pointerType === 'mouse' };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!v.on) return;
    if (document.pointerLockElement === canvas) {
      v.look.heading += e.movementX * MOUSE;
      v.look.pitch -= e.movementY * MOUSE;
    } else if (v.drag && v.drag.id === e.pointerId) {
      const dx = e.clientX - v.drag.x, dy = e.clientY - v.drag.y;
      v.look.heading += dx * DRAG;
      v.look.pitch -= dy * DRAG;
      v.drag.x = e.clientX;
      v.drag.y = e.clientY;
      v.drag.moved += Math.abs(dx) + Math.abs(dy);
    }
    v.look.pitch = clamp(v.look.pitch, -1.45, 1.45);
  });
  const up = (e) => {
    if (!v.on || !v.drag || v.drag.id !== e.pointerId) return;
    if (v.drag.mouse && v.drag.moved < 4 && canvas.requestPointerLock) {
      try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch { /* a frame may refuse it: dragging still looks */ }
    }
    v.drag = null;
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
}

function bindTouch() {
  const hud = document.getElementById('hud');
  if (!hud || document.getElementById('walk-touch')) return;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const dot = document.createElement('div');
  dot.id = 'walk-dot';
  hud.appendChild(dot);
  const box = document.createElement('div');
  box.id = 'walk-touch';
  const button = (label, down, upFn) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('pointerdown', (e) => { e.stopPropagation(); down(b); });
    if (upFn) for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, () => upFn(b));
    box.appendChild(b);
    return b;
  };
  button('JUMP', () => { v.touchJump = true; }, () => { v.touchJump = false; });
  button('USE', () => { v.usePulse = true; });
  button('RUN', (b) => { v.touchRun = !v.touchRun; b.classList.toggle('on', v.touchRun); });
  button('BALL', () => { v.touchBall = true; });
  hud.appendChild(box);
}

// What the walker means to do this frame: from the keys, a gamepad, the screen's stick and buttons.
function hands(ctx, dt) {
  const held = ctx.input.held, on = (...keys) => keys.some((k) => held.has(k));
  let fwd = (on('w', 'ArrowUp') ? 1 : 0) - (on('s', 'ArrowDown') ? 1 : 0);
  let right = (on('d') ? 1 : 0) - (on('a') ? 1 : 0);
  let turn = (on('ArrowRight') ? 1 : 0) - (on('ArrowLeft') ? 1 : 0), tilt = 0;
  let run = on('Shift') || v.touchRun, jump = on(' ') || v.touchJump, use = on('e') || v.usePulse;
  let drop = false, toss = false;
  const edge = (key, now) => { const was = v.was[key]; v.was[key] = now; return now && !was; };
  if (edge('f', on('f'))) drop = true;
  if (edge('g', on('g'))) toss = true;
  if (v.touchBall) { drop = true; v.touchBall = false; }
  v.usePulse = false;
  const t = ctx.input.touch;
  if (t && t.active) { fwd -= t.pitch; right += t.roll; }
  let pads = [];
  try { pads = navigator.getGamepads ? navigator.getGamepads() : []; } catch { pads = []; }
  for (const pad of pads) {
    if (!pad || pad.mapping !== 'standard') continue;
    const dz = (x) => (Math.abs(x) < 0.15 ? 0 : x);
    right += dz(pad.axes[0]);
    fwd -= dz(pad.axes[1]);
    turn += dz(pad.axes[2]);
    tilt -= dz(pad.axes[3]);
    const b = (i) => !!pad.buttons[i]?.pressed;
    jump = jump || b(0);
    run = run || b(1) || b(10);
    use = use || b(2);
    if (edge(`pad${pad.index}y`, b(3))) toss = true;
  }
  v.look.heading += turn * TURN_RATE * dt;
  v.look.pitch = clamp(v.look.pitch + tilt * TURN_RATE * 0.7 * dt, -1.45, 1.45);
  v.look.heading -= Math.round(v.look.heading / (2 * Math.PI)) * 2 * Math.PI;
  return { fwd: clamp(fwd, -1, 1), right: clamp(right, -1, 1), heading: v.look.heading, pitch: v.look.pitch, run, jump, use, drop, toss };
}

// ---- the frame --------------------------------------------------------------------------------

function draw(ctx, o, f) {
  const renderer = ctx.renderer, canvas = renderer.domElement, aspect = canvas.width / Math.max(1, canvas.height);
  const s = ctx.core.s, F = ringFrame(s);
  // the ring has turned on since the drawn moment: turn its frame back to it
  const back = -W * DT * (1 - f), axis = F.y;
  const turn = (x) => { const c = Math.cos(back), sn = Math.sin(back), d = ctx.frames.dot(axis, x), cr = ctx.frames.cross(axis, x); return [0, 1, 2].map((i) => x[i] * c + cr[i] * sn + axis[i] * d * (1 - c)); };
  F.x = turn(F.x);
  F.z = ctx.frames.cross(F.x, F.y);
  // the view: the look's axes, leaning a little toward the felt up
  const ax = viewAxes(o.upTheta, v.look.heading, v.look.pitch);
  const up0 = outward(o.upTheta).map((x) => -x), felt = feltUp(o);
  const want = [0, 1, 2].map((i) => up0[i] + LEAN * (felt[i] - up0[i]));
  v.lean = v.lean ? v.lean.map((x, i) => x + (want[i] - x) * Math.min(1, ctx.dt * 4)) : want;
  const lean = [0, 1, 2].map((i) => ax.up[i] + (v.lean[i] - up0[i]));
  const eye = [o.eyeX, o.eyeY, o.eyeZ];
  const fov = Math.min(100, Math.max(60, (2 * Math.atan(Math.tan((37.5 * Math.PI) / 180) / aspect) * 180) / Math.PI));
  // the light: the Sun in the ring's frame, and whether the Earth hides it
  const fr = ctx.frames, eyeSite = ringToSite(F, eye), sunSite = [s.sunE, s.sunN, s.sunU];
  const sun = siteDirToRing(F, sunSite);
  v.sun = sun;
  const lit = fr.inSight(fr.add(eyeSite, fr.scale(sunSite, 2e7)), eyeSite, 0);
  const L = v.world.light;
  L.uSun.value.set(...sun);
  L.uSunLight.value.set(...(lit ? [1.75, 1.65, 1.5] : [0, 0, 0]));
  L.uHaze.value.set(...(lit ? [0.34, 0.38, 0.44] : [0.2, 0.22, 0.26]));
  v.world.update(o, ctx.dt);

  const where = Math.round(o.where), enclosed = where === WHERE.hub || (where === WHERE.lift && o.liftR < WALK.lobby + 1);
  renderer.clear();
  // the sky, from the eye's place in the site frame
  const camera = ctx.camera, rel = (p) => fr.three(fr.sub(p, eyeSite));
  if (!enclosed) {
    camera.position.set(0, 0, 0);
    camera.up.set(...fr.three(ringDirToSite(F, lean)));
    camera.lookAt(new THREE.Vector3(...fr.three(ringDirToSite(F, ax.fwd))));
    camera.fov = fov;
    camera.near = 1e4;
    camera.far = 1e8;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    const alt = fr.heightOf(eyeSite), t = s.t, ll = [ctx.START.lat, ctx.START.lon];
    ctx.stars.update({
      x: fr.ecefToThree(fr.inertialToEcef([1, 0, 0], t), ...ll),
      y: fr.ecefToThree(fr.inertialToEcef([0, 1, 0], t), ...ll),
      z: fr.ecefToThree(fr.inertialToEcef([0, 0, 1], t), ...ll),
    }, 1);
    // what the other features keep in the sky (the Sun and the Moon) is placed for this eye
    const P = [s.siteE, s.siteN, s.siteU];
    Object.assign(ctx, { cam: eyeSite, rel, up: fr.unit(fr.add(eyeSite, [0, 0, fr.RE])), alt, sunSite, P, axes: fr.bodyAxes([s.qw, s.qx, s.qy, s.qz]) });
    for (const feature of FEATURES) if (feature !== walk && feature.update) feature.update(ctx);
    ctx.earth.update(camera, canvas.height, rel([0, 0, -fr.RE]), alt, fr.three(sunSite), v.toEcef);
    const hidden = [ctx.ring.group, ctx.craft.group].filter((g) => g.visible);
    for (const g of hidden) g.visible = false;
    renderer.render(ctx.far, camera);
    for (const g of hidden) g.visible = true;
  }
  // the ring's inside: far, then near
  const cam = v.cam;
  cam.position.set(...eye);
  cam.up.set(...lean);
  cam.lookAt(eye[0] + ax.fwd[0], eye[1] + ax.fwd[1], eye[2] + ax.fwd[2]);
  cam.fov = fov;
  cam.aspect = aspect;
  renderer.clearDepth();
  cam.near = NEAR_SPLIT;
  cam.far = 16000;
  cam.updateProjectionMatrix();
  renderer.render(v.world.scene, cam);
  renderer.clearDepth();
  cam.near = 0.05;
  cam.far = NEAR_SPLIT + 0.5;
  cam.updateProjectionMatrix();
  renderer.render(v.world.scene, cam);
}

function hud(ctx, o, now) {
  if (now < v.hudNext) return;
  v.hudNext = now + 100;
  const h = ctx.hud, touch = h.touch;
  const st = walkStatus(o, v.warp, touch);
  h.top.textContent = st.line;
  h.hint.textContent = st.hint;
  const lines = walkLines(o, v.warp, v.sun && Math.round(o.where) !== WHERE.hub ? sunFor(o, v.sun) : null);
  h.lines.textContent = (window.innerWidth < 560 ? lines.slice(0, 5).map((l) => l.replace(/ {2,}/g, ' ')) : lines).join('\n');
  h.place(h.fpm, null);
  h.place(h.tgt, null);
}

export const walk = {
  name: 'walk',

  init(ctx) {
    bindTouch();
    bindPointer(ctx.renderer.domElement);
    ctx.walk = { v, start: (place) => start(ctx, place), stop: (text) => stop(ctx, text) };   // for the page's tests
    const place = urlPlace();
    if (place !== null) start(ctx, place);
  },

  command(c, ctx) {
    if (!v.on) {
      if (c !== 'walk') return false;
      if (canWalk(ctx)) start(ctx, PLACE.hatch);
      else say(ctx, 'The walk starts at the hub: dock there first');
      return true;
    }
    switch (c) {
      case 'walk': v.usePulse = true; break;
      case 'slower': v.warp = WARPS[Math.max(0, WARPS.indexOf(v.warp) - 1)]; say(ctx, `Time ${v.warp}×`); break;
      case 'faster': v.warp = WARPS[Math.min(WARPS.length - 1, WARPS.indexOf(v.warp) + 1)]; say(ctx, `Time ${v.warp}×`); break;
      case 'reset': v.core.reset(PLACE.hatch); v.prev = { ...v.core.o }; v.cur = { ...v.core.o }; v.look = { heading: v.core.o.heading, pitch: 0 }; say(ctx, 'Back at the hatch'); break;
      case 'help': return false;   // the page shows the help, which is the walk's while walking
      default: break;              // the flight's commands wait until the walk is over
    }
    return true;
  },

  owns() { return v.on; },

  frame(ctx, dt) {
    const now = performance.now(), wc = v.core;
    const c = hands(ctx, dt);
    wc.controls(c);
    if (c.drop || c.toss) {
      wc.ball(1.5, c.toss ? 9 : 0);
      if (Math.round(wc.o.where) !== WHERE.lift) {
        // straight below where it was let go, on the floor it fell toward
        const p = [wc.o.ballX, wc.o.ballY, wc.o.ballZ], th = Math.atan2(p[0], p[2]), R = Math.round(wc.o.where) === WHERE.hub ? WALK.lobby : 5000;
        v.ballMark = c.toss ? null : [R * Math.sin(th) - 0.001 * Math.sin(th), p[1], R * Math.cos(th) - 0.001 * Math.cos(th)];
        v.world.markAt(v.ballMark, outward(th).map((x) => -x));
      }
    }
    // the steps: both cores, the same number, so the ring turns as the walker walks
    v.debt += dt * v.warp;
    let n = Math.floor(v.debt / DT);
    const cap = Math.max(5, Math.ceil((v.warp * 0.1) / DT));   // past this the debt is dropped, not run
    if (n > cap) { n = cap; v.debt = 0; } else v.debt -= n * DT;
    if (n > 0) {
      const before = { ...wc.o };
      const o = wc.step(n);
      ctx.core.step(n);
      v.prev = n > 1 ? between(before, o, (n - 1) / n) : before;
      v.cur = { ...o };
    }
    if (wc.o.aboard > 0.5) {
      stop(ctx, 'Back aboard the craft');
      return;
    }
    const drawn = between(v.prev, v.cur, Math.min(1, v.debt / DT));
    draw(ctx, drawn, Math.min(1, v.debt / DT));
    hud(ctx, wc.o, now);
    if (v.sayUntil && now > v.sayUntil) {
      const el = document.getElementById('say');
      if (el) el.textContent = '';
      v.sayUntil = 0;
    }
  },
};
