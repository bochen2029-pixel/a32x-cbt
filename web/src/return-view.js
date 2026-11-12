// return-view.js — the flight home, on the page (orbit_return.h). RETURN hands the craft to the crew to
// fly home to KDFW 17C (letting go of the Ring's port first, if docked); RETURN again, while the craft
// waits in orbit for its pass, skips ahead to the de-orbit burn, as TO ORBIT skips the climb. The
// readouts say where the craft is on the way down and how hot it is; the entry looks like one: the air
// glowing round the nose and the belly as brightly as the core's heat flux says, and a glowing trail.
// Everything shown comes from the core's readouts; nothing here flies. GPLv3.

import * as THREE from 'three';
import { fmtDistance } from './hud.js';

// The readouts, orbit_return.h's OC_RET_* in its order (a test reads the header to hold the two equal).
export const RET_OUT = [
  'phase', 'event', 'tEvent', 'range', 'cross', 'togo', 'bankCmd', 'alphaCmd', 'miss', 'reversals', 'dv', 'passes',
  'heat', 'heatPeak', 'heatLoad', 'temp', 'glow', 'load', 'loadPeak', 'qbarPeak', 'over', 'glideDev',
  'touched', 'tdSink', 'tdAlong', 'tdOff', 'tdSpeed', 'tdPitch', 'tdT', 'stopped', 'stopAlong', 'stopOff', 'propUsed',
];
export const RET_PH = { none: 0, depart: 1, wait: 2, burn: 3, coast: 4, entry: 5, terminal: 6, approach: 7, flare: 8, rollout: 9, stopped: 10 };
export const RET_EV = { none: 0, clear: 1, burn: 2, burnEnd: 3, interface: 4, terminal: 5, touchdown: 6 };
export const LIMITS = { heat: 600000, load: 2.5, qbar: 20000 };   // OC_RET_HEAT_LIMIT, _LOAD_LIMIT, _QBAR_LIMIT
const SKIP_UNTIL = 60;   // s before the burn: the skip stops, so the turn's end and the burn are seen

// A wait, as a clock reads it: hours and minutes when long, minutes and seconds, seconds.
export function fmtWait(s) {
  if (!(s >= 0)) return '—';
  const t = Math.round(s), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60;
  if (h > 0) return `${h} h ${String(m).padStart(2, '0')} min`;
  if (m > 0) return `${m}:${String(sec).padStart(2, '0')}`;
  return `${sec} s`;
}

// Where the runway lies off the track (orbit_return.h: + to the left).
export function fmtSide(m) {
  if (Math.abs(m) < 50) return 'dead ahead';
  return `${fmtDistance(Math.abs(m))} ${m > 0 ? 'left' : 'right'}`;
}

// May the flight home start? From orbit, or taken back on the way down; not from the runway, nor on the
// climb to orbit.
export function canReturn(s, r) {
  if (s.crashed > 0) return { ok: false, why: 'The craft has crashed' };
  if (s.peri > 150000) return { ok: true };
  if (r.phase > RET_PH.none && !(s.onGround > 0.5 && r.stopped > 0)) return { ok: true };   // taken back on the way home
  if (s.onGround < 0.5 && s.vs < 0 && s.alt > 20000) return { ok: true };                    // falling from orbit already
  return { ok: false, why: 'The flight home starts in orbit' };
}

// Whether the skip ahead is done: the burn near, or the waiting over, or nothing to wait for.
export function skipDone(r, auto, AUTO) {
  if (auto !== AUTO.return) return 'handed back';
  const ph = Math.round(r.phase);
  if (ph !== RET_PH.wait && ph !== RET_PH.depart) return 'past the wait';
  if (ph === RET_PH.wait && Math.round(r.event) !== RET_EV.burn) return 'no pass in reach';
  if (ph === RET_PH.wait && r.tEvent < SKIP_UNTIL) return 'the burn is near';
  return null;
}

// The status line while the crew flies home, and what the pilot can do next.
export function returnStatus(r, s, { touch = false, skipping = false } = {}) {
  const ph = Math.round(r.phase);
  const k = touch
    ? { skip: 'RETURN again: skip ahead to the burn', take: 'CREW: take the controls', reset: 'RESTART' }
    : { skip: 'R again: skip ahead to the burn', take: 'Space: take the controls', reset: 'Backspace: start again' };
  const togo = fmtDistance(r.togo);
  switch (ph) {
    case RET_PH.depart:
      return { line: `HOME · LEAVING THE RING · clear in ${fmtWait(r.tEvent)}`, hint: skipping ? 'skipping ahead…' : `${k.skip} · ${k.take}` };
    case RET_PH.wait:
      if (Math.round(r.event) !== RET_EV.burn) return { line: 'HOME · NO PASS WITHIN REACH YET · the crew looks again every 10 min', hint: k.take };
      if (skipping) return { line: `HOME · SKIPPING AHEAD · the burn in ${fmtWait(r.tEvent)}`, hint: 'R again: stop skipping' };
      return { line: `HOME · WAITING FOR THE PASS · the burn in ${fmtWait(r.tEvent)}`, hint: `${k.skip} · ${k.take}` };
    case RET_PH.burn:
      return { line: `HOME · DE-ORBIT BURN · ${r.dv.toFixed(0)} m/s, tail first`, hint: k.take };
    case RET_PH.coast:
      return { line: `HOME · FALLING TO THE AIR · entry in ${fmtWait(r.tEvent)}`, hint: k.take };
    case RET_PH.entry:
      return { line: `HOME · ENTRY · Mach ${s.mach.toFixed(0)} · ${togo} to go`, hint: k.take };
    case RET_PH.terminal:
      return { line: `HOME · TERMINAL AREA · ${togo} to go, ${fmtDistance(s.alt)} up`, hint: k.take };
    case RET_PH.approach:
      return { line: `HOME · APPROACH · 17C in ${togo}`, hint: k.take };
    case RET_PH.flare:
      return { line: 'HOME · FLARE', hint: '' };
    case RET_PH.rollout:
      return { line: `HOME · ROLLOUT · ${s.tas.toFixed(0)} m/s`, hint: '' };
    case RET_PH.stopped:
      return { line: `HOME · STOPPED ON 17C · ${fmtDistance(r.stopAlong)} past the threshold`, hint: k.reset };
    default:
      return null;
  }
}

// The readouts' lines for the flight home: where the runway is, the heat and the load, the guidance; the
// landing's numbers once down. narrow: a phone's width.
export function returnHud(r, s, narrow = false) {
  const ph = Math.round(r.phase), lines = [];
  const flying = ph > RET_PH.none;
  if (!flying && !(r.touched > 0)) return lines;
  const kw = (w) => `${(w / 1000).toFixed(0)} kW/m²`;
  if (flying && ph < RET_PH.rollout) {
    const where = ph <= RET_PH.coast ? `runway ${fmtSide(r.cross)} of the pass` : ph >= RET_PH.approach ? `${Math.abs(r.cross).toFixed(1)} m off the line` : `runway ${fmtSide(r.cross)}`;
    if (narrow) lines.push(`HOME ${fmtDistance(r.range)}  ${where}`);
    else lines.push(`HOME ${fmtDistance(r.range).padStart(9)} to KDFW 17C   ${where}   path to go ${fmtDistance(r.togo)}`);
  }
  if (r.heatPeak > 1000 || r.loadPeak > 0.05) {
    const over = r.heat > LIMITS.heat * 0.85 ? ' !' : '';
    if (narrow) lines.push(`HEAT ${kw(r.heat)}${over} ${r.temp.toFixed(0)} K  ${r.load.toFixed(1)} g`);
    else lines.push(`HEAT ${kw(r.heat)}${over} (peak ${kw(r.heatPeak)})   ${(r.heatLoad / 1e6).toFixed(0)} MJ/m²   skin ${r.temp.toFixed(0)} K   LOAD ${r.load.toFixed(2)} g (peak ${r.loadPeak.toFixed(2)})`);
  }
  if (!narrow && (ph === RET_PH.coast || ph === RET_PH.entry)) {
    const miss = r.miss >= 0 ? `+${fmtDistance(r.miss)}` : `−${fmtDistance(-r.miss)}`;
    lines.push(`GUIDE bank ${r.bankCmd >= 0 ? 'R' : 'L'} ${Math.abs(r.bankCmd).toFixed(0)}°   α ${r.alphaCmd.toFixed(0)}°   ${Math.round(r.reversals)} reversals   gate ${miss}`);
  }
  if (!narrow && (ph === RET_PH.wait || ph === RET_PH.depart) && Math.round(r.event) === RET_EV.burn) {
    lines.push(`PLAN de-orbit ${r.dv.toFixed(0)} m/s in ${fmtWait(r.tEvent)}   ${Math.round(r.passes)} passes let go`);
  }
  if (ph === RET_PH.approach || ph === RET_PH.flare) {
    const dev = r.glideDev;
    lines.push(`GLIDE ${Math.abs(dev).toFixed(0)} m ${dev >= 0 ? 'above' : 'below'} the 3° path`);
  }
  if (r.touched > 0) {
    const off = `${Math.abs(r.tdOff).toFixed(1)} m ${r.tdOff >= 0 ? 'right' : 'left'}`;
    if (narrow) lines.push(`DOWN ${r.tdAlong.toFixed(0)} m, ${off}, ${r.tdSink.toFixed(1)} m/s`);
    else lines.push(`DOWN ${r.tdAlong.toFixed(0)} m past the threshold, ${off} of the line, sinking ${r.tdSink.toFixed(2)} m/s${r.stopped > 0 ? `   stopped at ${fmtDistance(r.stopAlong)}` : ''}`);
  }
  return lines;
}

// The air's glow, from the core's 0..1 (OC_RET_GLOW): a dull red when it starts, orange, then a hot
// pinkish white.
export function plasma(glow) {
  const g = Math.min(1, Math.max(0, glow || 0));
  return { r: 1.0, g: 0.28 + 0.42 * g, b: 0.14 + 0.4 * g * g, strength: g };
}

// The trail: where the craft has been while the air glowed round it, in the site frame, a point every
// `every` seconds, each fading over `life` seconds. Time going back (a restart) clears it.
export class TrailLog {
  constructor({ max = 200, every = 0.5, life = 80 } = {}) {
    Object.assign(this, { max, every, life });
    this.points = [];
    this.last = -Infinity;
  }

  add(t, p, glow) {
    if (t < this.last) this.clear();
    if (!(glow > 0.02) || t - this.last < this.every) return;
    this.points.push({ t, p: [p[0], p[1], p[2]], glow });
    if (this.points.length > this.max) this.points.shift();
    this.last = t;
  }

  // the points still glowing at time t, newest first, each with its brightness
  live(t) {
    const out = [];
    for (let i = this.points.length - 1; i >= 0; i--) {
      const q = this.points[i], age = t - q.t;
      if (age < 0 || age > this.life) continue;
      out.push({ p: q.p, age, light: q.glow * (1 - age / this.life) ** 1.5 });
    }
    return out;
  }

  clear() { this.points = []; this.last = -Infinity; }
}

// ---- drawing ------------------------------------------------------------------------------------

// A glowing layer of hot air: brightest on the side the air comes from (uFlow, downstream, in the
// layer's own axes), soft at its edges, with a hotter core where it is seen face on.
const SHELL_VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vV;
varying vec3 vP;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  vP = position;
  gl_Position = projectionMatrix * mv;
}`;
const SHELL_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uStrength;
uniform float uCore;
uniform vec3 uFlow;
uniform float uAlong;
varying vec3 vN;
varying vec3 vV;
varying vec3 vP;
void main() {
  float f = abs(dot(normalize(vN), normalize(vV)));
  float windward = length(uFlow) > 0.5 ? clamp(-dot(normalize(vP + vec3(1e-6)), uFlow), 0.0, 1.0) : 1.0;
  float along = mix(1.0, clamp(1.0 + vP.y, 0.0, 1.0), uAlong);   // the wake: fading downstream
  float glow = 0.5 * pow(1.0 - f, 1.5) + uCore * f * f;
  gl_FragColor = vec4(uColor * uStrength * glow * (0.08 + windward * windward) * along, 1.0);
}`;

// The trail: a ribbon turned to face the eye, its brightness in a vertex colour (additive).
const RIBBON_VERT = /* glsl */ `
attribute float light;
varying float vLight;
varying float vAcross;
attribute float across;
void main() {
  vLight = light;
  vAcross = across;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const RIBBON_FRAG = /* glsl */ `
uniform vec3 uColor;
varying float vLight;
varying float vAcross;
void main() {
  float edge = 1.0 - vAcross * vAcross;
  gl_FragColor = vec4(uColor * vLight * edge, 1.0);
}`;

function shell(core) {
  return new THREE.ShaderMaterial({
    vertexShader: SHELL_VERT,
    fragmentShader: SHELL_FRAG,
    uniforms: { uColor: { value: new THREE.Color(1, 0.5, 0.3) }, uStrength: { value: 0 }, uCore: { value: core }, uFlow: { value: new THREE.Vector3(-1, 0, 0) }, uAlong: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

class Plasma {
  constructor(craftGroup, near) {
    this.group = new THREE.Group();
    // The layer of hot air under the belly and round the nose (the craft's frame: x forward, y up, z
    // right), and a short wake along the air's flow behind the craft.
    this.belly = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), shell(0.35));
    this.belly.scale.set(17.5, 2.6, 10.5);
    this.belly.position.set(-1.5, -1.5, 0);
    this.nose = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), shell(1.2));
    this.nose.scale.set(3.6, 2.6, 3.4);
    this.nose.position.set(14.2, -0.8, 0);
    this.wake = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 32, 1, true).translate(0, -0.5, 0), shell(0.1));
    this.group.add(this.belly, this.nose, this.wake);
    this.light = new THREE.PointLight(0xff8a50, 0, 80, 2);
    this.light.position.set(6, -7, 0);
    this.group.add(this.light);
    this.group.visible = false;
    craftGroup.add(this.group);

    const n = 200;
    this.n = n;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('light', new THREE.BufferAttribute(new Float32Array(n * 2), 1).setUsage(THREE.DynamicDrawUsage));
    const across = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { across[2 * i] = -1; across[2 * i + 1] = 1; }
    geo.setAttribute('across', new THREE.BufferAttribute(across, 1));
    const index = [];
    for (let i = 0; i < n - 1; i++) { const a = 2 * i; index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    geo.setIndex(index);
    this.ribbon = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      vertexShader: RIBBON_VERT,
      fragmentShader: RIBBON_FRAG,
      uniforms: { uColor: { value: new THREE.Color(1, 0.55, 0.32) } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    }));
    this.ribbon.frustumCulled = false;
    this.ribbon.visible = false;
    near.add(this.ribbon);
    this.log = new TrailLog({ max: n - 1 });
  }

  // r: the return's readouts; s: the core's; ctx: the frame's (cam, rel, P).
  update(r, s, ctx) {
    const c = plasma(r.glow);
    const on = c.strength > 0.01;
    this.group.visible = on;
    if (on) {
      const col = new THREE.Color(c.r, c.g, c.b);
      const flicker = 1 + 0.05 * Math.sin(ctx.now * 0.031) * Math.sin(ctx.now * 0.017);
      for (const m of [this.belly, this.nose, this.wake]) m.material.uniforms.uColor.value.copy(col);
      this.belly.material.uniforms.uStrength.value = 3.2 * c.strength * flicker;
      this.nose.material.uniforms.uStrength.value = 4.5 * c.strength * flicker;
      this.wake.material.uniforms.uStrength.value = 1.4 * c.strength;
      this.light.color.copy(col);
      this.light.intensity = 9000 * c.strength;
      // the wake streams away from the craft along the air's flow past it, in the craft's frame
      const a = (s.alpha * Math.PI) / 180, b = (s.beta * Math.PI) / 180;
      const flow = new THREE.Vector3(-Math.cos(a) * Math.cos(b), Math.sin(a) * Math.cos(b), -Math.sin(b)).normalize();
      for (const m of [this.belly, this.nose]) m.material.uniforms.uFlow.value.copy(flow);
      this.wake.material.uniforms.uFlow.value.set(0, 0, 0);   // the wake: no windward side, a fade along it
      this.wake.material.uniforms.uAlong.value = 1;
      this.wake.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), flow);
      const len = 40 + 220 * c.strength;
      this.wake.scale.set(10 + 10 * c.strength, len, 10 + 10 * c.strength);
      this.wake.position.copy(flow.clone().multiplyScalar(4));
    }
    this.log.add(s.t, ctx.P, r.glow);
    this.trail(s.t, ctx);
  }

  // The ribbon from the craft back along the points still glowing, facing the eye.
  trail(t, ctx) {
    const pts = this.log.live(t);
    if (pts.length < 1) { this.ribbon.visible = false; return; }
    const head = { p: ctx.P, age: 0, light: pts[0].light };
    const all = [head, ...pts].slice(0, this.n);
    const pos = this.ribbon.geometry.attributes.position.array, light = this.ribbon.geometry.attributes.light.array;
    const m = all.length;
    for (let i = 0; i < this.n; i++) {
      const q = all[Math.min(i, m - 1)];
      const rel = ctx.rel(q.p);   // three.js axes, from the eye
      const nb = all[Math.min(i + 1, m - 1)], pb = all[Math.min(Math.max(i - 1, 0), m - 1)];
      const d = new THREE.Vector3(...ctx.rel(nb.p)).sub(new THREE.Vector3(...ctx.rel(pb.p)));
      const eye = new THREE.Vector3(...rel);
      const side = d.cross(eye).normalize();
      const width = (3 + 0.9 * q.age) * (i === 0 ? 0.5 : 1);
      const dist = eye.length();
      const fadeNear = Math.min(1, Math.max(0, (dist - 40) / 400));   // nothing glaring through the eye
      const lit = i < m ? 0.6 * q.light * fadeNear : 0;
      for (let k = 0; k < 2; k++) {
        const sgn = k === 0 ? -1 : 1, o = (2 * i + k) * 3;
        pos[o] = rel[0] + side.x * width * sgn;
        pos[o + 1] = rel[1] + side.y * width * sgn;
        pos[o + 2] = rel[2] + side.z * width * sgn;
        light[2 * i + k] = lit;
      }
    }
    this.ribbon.geometry.attributes.position.needsUpdate = true;
    this.ribbon.geometry.attributes.light.needsUpdate = true;
    this.ribbon.visible = true;
  }
}

// ---- the feature (features.js) ------------------------------------------------------------------

const AT_DOCK = 0;   // orbit_dock.h: OC_DOCK_DOCKED, the first of the docking's readouts

function docked(core) {
  if (core.dock && typeof core.dock.docked === 'number') return core.dock.docked > 0.5;
  const m = core.m;
  if (typeof m._oc_dock_out !== 'function') return false;
  return m.HEAPF64[m._oc_dock_out() / 8 + AT_DOCK] > 0.5;
}

export const ret = {
  name: 'ret',
  skipping: false,

  init(ctx) {
    this.r = ctx.core.addBlock('ret', '_oc_return_out', '_oc_return_out_len', RET_OUT);
    this.plasma = new Plasma(ctx.craft.group, ctx.near);
    this.touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  },

  command(c, ctx) {
    const s = ctx.core.s, r = this.r, auto = Math.round(s.auto);
    const waiting = auto === ctx.AUTO.return && (Math.round(r.phase) === RET_PH.wait || Math.round(r.phase) === RET_PH.depart);
    if (c === 'orbit' && waiting) c = 'return';   // TO ORBIT, in orbit flying home: the same skip ahead
    if (c !== 'return') return false;
    if (waiting) {
      if (this.skipping) { this.skipping = false; ctx.say('Stopped skipping'); return true; }
      if (skipDone(r, auto, ctx.AUTO) === 'no pass in reach') { ctx.say('No pass within reach yet: nothing to skip to'); return true; }
      this.skipping = true;
      ctx.say('Skipping ahead to the de-orbit burn…');
      return true;
    }
    if (auto === ctx.AUTO.return) { ctx.say('The crew is flying home: Space takes the controls'); return true; }
    const may = canReturn(s, r);
    if (!may.ok) { ctx.say(may.why); return true; }
    let words = 'The crew flies home to KDFW 17C';
    if (docked(ctx.core)) {
      ctx.core.m._oc_undock();
      words = 'Undocking: the crew backs away from the Ring, then flies home';
    }
    ctx.core.auto(ctx.AUTO.return);
    ctx.core.read();
    const ph = Math.round(r.phase);
    if (ph === RET_PH.wait && Math.round(r.event) === RET_EV.burn) words += `: the burn in ${fmtWait(r.tEvent)}`;
    if (ph === RET_PH.wait && Math.round(r.event) !== RET_EV.burn) words = 'No pass within reach from this orbit yet: the crew waits and looks again';
    ctx.say(words);
    this.skipping = false;
    return true;
  },

  update(ctx) {
    const core = ctx.core, r = this.r;
    if (this.skipping) {
      // Step the core fast, within a few milliseconds a frame, until the burn is near.
      const until = performance.now() + 14;
      let why = skipDone(r, Math.round(core.s.auto), ctx.AUTO);
      while (!why && performance.now() < until) {
        core.step(500);
        why = skipDone(r, Math.round(core.s.auto), ctx.AUTO);
      }
      if (why) {
        this.skipping = false;
        ctx.state.warp = 1;
        ctx.state.debt = 0;
        if (why === 'the burn is near') ctx.say(`The de-orbit burn in ${fmtWait(r.tEvent)}`);
        else if (why === 'no pass in reach') ctx.say('No pass within reach yet');
      }
    }
    this.plasma.update(r, core.s, ctx);
  },

  hud(ctx) {
    const narrow = typeof window !== 'undefined' && window.innerWidth < 560;
    return returnHud(this.r, ctx.core.s, narrow);
  },

  status(ctx) {
    if (Math.round(ctx.core.s.auto) !== ctx.AUTO.return) return null;
    return returnStatus(this.r, ctx.core.s, { touch: this.touch, skipping: this.skipping });
  },
};
