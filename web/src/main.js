// The orbit sketch's page: the core stepped at its fixed 50 Hz, a round Earth, the Ring, the craft and
// KDFW drawn round them. Two passes: the far one (sky, Earth, stars, anything past 300 km) and, over
// it after the depth is cleared, the near one, so a centimetre at the wheels and the Earth's whole
// disc are both drawn with depth to spare. How much is drawn is a tier's (quality.js), and how the
// frame reaches the screen is the pipeline's (pipeline.js). GPLv3.

import * as THREE from 'three';
import { Airport } from '../../../web/src/airport.js';
import { findRunwayEnd, validateAirport } from '../../../web/src/airport-layout.js';
import { origin } from '../../../web/src/scene-math.js';
import KDFW from '../../../web/data/kdfw.json' with { type: 'json' };
import { AUTO, DT, HUB_PORT_M, PH, SAS, START, loadCore } from './core.js';
import { Craft } from './craft.js';
import { FEATURES } from './features.js';
import * as frames from './frames.js';
import { Earth, Stars } from './earth.js';
import {
  RE, add, bodyAxes, cross, dot, ecefToThree, heightOf, inSight, inertialToEcef, length, scale, siteAxes, sub, three, threeToEcef, unit,
} from './frames.js';
import { Hud } from './hud.js';
import { HELP, Input } from './input.js';
import { Pipeline } from './pipeline.js';
import { PROBE, SETTINGS, nextChoice, pixelRatioFor, probeVerdict, resolveTier } from './quality.js';
import { Ring } from './ring.js';
import { depthSlices, ringDepth } from './slices.js';
import { AIR_LAW_PA, inertialVelocity, keepAbove } from './view-math.js';

const NEAR = 3e5;                                   // m: nearer than this is drawn in the near pass
const EXPOSURE = 1.4;                               // for AgX: a sunlit grey card at middle grey
const WARPS = [0, 1, 2, 5, 10, 25, 50, 100];
const VIEWS = ['chase', 'cockpit', 'from the Ring'];

const statusEl = document.getElementById('status');
function fail(message) {
  statusEl.textContent = `Failed: ${message}`;
  statusEl.className = 'failed';
}
window.addEventListener('error', (e) => fail(e.message || String(e)));
window.addEventListener('unhandledrejection', (e) => fail(e.reason?.message || String(e.reason)));

// What the device says of itself, for the tier (quality.js, chooseTier). Read from a context of its
// own, made and let go before the page's, because the page's is made to suit the tier.
function deviceReport() {
  const report = {
    renderer: '', maxTextureSize: 0, width: window.screen?.width || window.innerWidth, height: window.screen?.height || window.innerHeight,
    touch: typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches,
    cores: navigator.hardwareConcurrency || 0, memory: navigator.deviceMemory || 0, halfFloat: false,
  };
  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) return report;
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  report.renderer = String((info && gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || '');
  report.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  report.halfFloat = Boolean(gl.getExtension('EXT_color_buffer_half_float') || gl.getExtension('EXT_color_buffer_float'));
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return report;
}

// The page's control remembers its choice; a host that forbids storage only forgets it.
const SAVED = 'runway-to-ring.graphics';
function savedChoice() { try { return window.localStorage.getItem(SAVED); } catch { return null; } }
function saveChoice(choice) {
  try {
    if (choice === 'auto') window.localStorage.removeItem(SAVED);
    else window.localStorage.setItem(SAVED, choice);
  } catch { /* nothing to remember it in */ }
}

function lights(scene) {
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  const sky = new THREE.HemisphereLight(0x8fb4e8, 0x4a4436, 0.6);
  scene.add(sun, sun.target, sky);
  return { sun, sky };
}

async function main() {
  const core = await loadCore();
  let s = core.reset(START);
  // ?at=<seconds>: start that far into the crew's flight (for a quick look, and for the page's tests)
  const at = Number(new URLSearchParams(location.search).get('at'));
  if (at > 0) while (s.t < at && s.crashed === 0) s = core.step(Math.max(1, Math.min(500, Math.round((at - s.t) / DT))));
  const canvas = document.getElementById('view');
  const params = new URLSearchParams(location.search);
  const report = deviceReport();
  // the tier: quality.settings is what everything below is built from; scale is the probe's
  const quality = { ...resolveTier({ query: params.get('q'), saved: savedChoice(), report }), scale: 1, probes: 0, frames: [], seen: 0 };
  quality.settings = SETTINGS[quality.tier];
  // The canvas's own multisampling is fixed here, once: it is what smooths edges at low, and above low
  // the scene is drawn into a multisampled target instead, so a page that starts above low and is
  // turned down draws low without it until it is loaded again.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !quality.settings.hdr, powerPreference: 'high-performance' });
  if (!renderer.capabilities.isWebGL2) throw new Error('this page needs WebGL 2');
  const phone = Math.min(window.innerWidth, window.innerHeight) < 600;
  renderer.autoClear = false;
  renderer.toneMapping = { aces: THREE.ACESFilmicToneMapping, neutral: THREE.NeutralToneMapping, agx: THREE.AgXToneMapping }[params.get('tm')] || THREE.AgXToneMapping;
  renderer.toneMappingExposure = Number(params.get('ex')) || EXPOSURE;
  renderer.shadowMap.enabled = true;   // only the Sun casts, and only where the tier says (setQuality)
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const pipeline = new Pipeline(renderer);
  pipeline.setQuality(quality.settings);

  // three scenes: far (past 300 km, the Earth and the stars), near, and mid: the Ring alone, when it lies
  // at depths of its own (slices.js)
  const far = new THREE.Scene(), near = new THREE.Scene(), mid = new THREE.Scene();
  near.fog = new THREE.FogExp2(0x000000, 0);
  const farLights = lights(far), nearLights = lights(near), midLights = lights(mid);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.5, NEAR * 1.2);
  const earth = new Earth({ siteUp: siteAxes(START.lat, START.lon).up, quality: quality.settings });
  let stars = new Stars(quality.settings.stars);
  far.add(stars.points, earth.mesh);
  const craft = new Craft(quality.settings), ring = new Ring(quality.settings);
  near.add(craft.group);
  const o = origin(START.lat, START.lon);
  const found = findRunwayEnd([validateAirport(KDFW)], START.lat, START.lon, START.hdg);
  if (!found) throw new Error('KDFW 17C is not in kdfw.json');
  const airport = new Airport(found.airport, o, { gain: 1, windows: 0.5, pixelRatio: 1 });
  airport.group.traverse((m) => { if (m.isMesh) m.receiveShadow = true; });
  near.add(airport.group);
  const toEcef = threeToEcef(START.lat, START.lon);

  // The reflected sky, where the tier has it: the far scene (the Earth, its air, the stars) drawn into a
  // small cube every few frames and prefiltered for rough and smooth reflection alike (three's PMREM).
  // The craft's metal and glass and the Ring's take their reflections, and the Earth's light from below,
  // from it.
  let env = null;
  function setEnv(settings) {
    if (env) { env.target.dispose(); env.out?.dispose(); env.pmrem.dispose(); env = null; }
    ring.setEnvMap(null);
    if (craft.setEnvMap) craft.setEnvMap(null);
    if (!settings.envMap || !pipeline.canFloat) return;
    const target = new THREE.WebGLCubeRenderTarget(settings.envMap, { type: THREE.HalfFloatType });
    env = { target, camera: new THREE.CubeCamera(1e4, 1e8, target), pmrem: new THREE.PMREMGenerator(renderer), out: null, every: settings.envEvery, n: 0 };
  }
  function updateEnv() {
    if (!env || (env.out && ++env.n % env.every !== 0)) return;
    const autoClear = renderer.autoClear;
    renderer.autoClear = true;
    env.camera.update(renderer, far);
    renderer.autoClear = autoClear;
    const first = !env.out;
    env.out = env.pmrem.fromCubemap(env.target.texture, env.out);
    if (first) {
      ring.setEnvMap(env.out.texture, 1);
      if (craft.setEnvMap) craft.setEnvMap(env.out.texture, 1);
    }
  }
  // The Sun's shadow, where the tier has it: a map round the craft, cast on itself, on the field and on
  // the hub when it is there.
  function setShadows(settings) {
    const L = nearLights.sun;
    L.castShadow = settings.shadowMap > 0;
    if (L.shadow.map) { L.shadow.map.dispose(); L.shadow.map = null; }
    L.shadow.mapSize.set(settings.shadowMap || 512, settings.shadowMap || 512);
    Object.assign(L.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 200, far: 1000 });
    L.shadow.camera.updateProjectionMatrix();
    L.shadow.bias = -0.0004;
    L.shadow.normalBias = 0.04;
    L.shadow.radius = 2;
  }

  const input = new Input(canvas);
  const hud = new Hud(document.getElementById('hud'));
  input.bindTouch(document.getElementById('stick'), document.getElementById('knob'), document.getElementById('throttle'),
    document.getElementById('throttle-fill'), document.querySelectorAll('#buttons button'));
  const help = document.getElementById('help');
  help.innerHTML = HELP.map(([k, v]) => `<div><b>${k}</b><span>${v}</span></div>`).join('');
  if (!phone) help.classList.add('shown');
  const sayEl = document.getElementById('say');
  let sayUntil = 0;
  const say = (text, now) => { sayEl.textContent = text; sayUntil = now + 3500; };
  const state = { warp: 1, view: 0, skipping: false, debt: 0, last: performance.now(), heading: null };
  // What the features see (features.js): fixed parts here, the frame's own filled in each frame.
  const ctx = {
    frames, core, get s() { return s; }, renderer, camera, near, far, craft, ring, airport, earth, stars, input, hud,
    state, START, DT, AUTO, PH, SAS, RE, NEAR, VIEWS, say: (text) => say(text, performance.now()),
    cam: null, rel: null, axes: null, P: null, up: null, alt: 0, sunSite: null, now: 0, dt: 0,
    // the graphics tier's settings (quality.js): a feature that draws may scale itself by them, and
    // where quality.bloom is over zero the bright things glow by themselves
    get quality() { return quality.settings; }, pipeline,
  };
  for (const f of FEATURES) if (f.init) f.init(ctx);


  const resize = () => {
    const w = window.innerWidth, h = window.innerHeight;
    const ratio = pixelRatioFor(quality.settings, w, h, window.devicePixelRatio || 1, quality.scale);
    renderer.setPixelRatio(ratio);
    renderer.setSize(w, h, false);
    pipeline.setSize(renderer.domElement.width, renderer.domElement.height);
    airport.material.uniforms.uPixelRatio.value = ratio;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  // The tier, set: by the address or the saved choice at the start, by the control (F, or GFX), or by
  // the probe below. Everything that depends on it is rebuilt in place, the flight untouched.
  const gfx = document.getElementById('btn-quality');
  const showQuality = () => { if (gfx) gfx.innerHTML = `GFX ${quality.settings.label}${quality.choice === 'auto' ? '<small> · AUTO</small>' : ''}`; };
  function setQuality(tier, choice, why) {
    const was = quality.settings;
    Object.assign(quality, { tier, choice, why, settings: SETTINGS[tier] });
    const q = quality.settings;
    pipeline.setQuality(q);
    if (was !== q) {
      ring.setQuality(q);
      if (craft.setQuality) craft.setQuality(q);
      if (earth.setQuality) earth.setQuality(q);
      far.remove(stars.points);
      stars.dispose();
      stars = new Stars(q.stars);
      far.add(stars.points);
      ctx.stars = stars;
    }
    setEnv(q);
    setShadows(q);
    resize();
    showQuality();
  }
  setEnv(quality.settings);
  setShadows(quality.settings);
  showQuality();
  // Left to itself the page times its first frames and steps down when they come slowly.
  function probe(dtMs) {
    if (quality.choice !== 'auto' || quality.probes >= 3 || state.skipping) return;
    if (++quality.seen <= PROBE.skip) return;
    quality.frames.push(dtMs);
    if (quality.frames.length < PROBE.frames) return;
    const v = probeVerdict(quality.tier, quality.frames, quality.scale);
    quality.probes = v.slow ? quality.probes + 1 : 3;
    quality.frames = [];
    quality.seen = 0;
    if (!v.slow) return;
    quality.scale = v.scale;
    setQuality(v.tier, 'auto', `${quality.why}; ${v.medianMs.toFixed(0)} ms a frame`);
    say(`Graphics: ${quality.settings.label.toLowerCase()}${v.scale < 1 ? ', fewer pixels' : ''} (frames came slowly)`, performance.now());
  }

  const handOver = () => {
    const h = input.hands;
    h.throttle = s.throttle;
    h.gear = s.gear > 0.5;
    h.brake = s.onGround > 0.5 && s.tas < 1 ? 1 : 0;
    core.auto(AUTO.off);
    core.sas(SAS.hold);
  };

  function command(c, now) {
    for (const f of FEATURES) if (f.command && f.command(c, ctx)) { s = core.read(); return; }
    const auto = Math.round(s.auto);
    switch (c) {
      case 'crew':
        if (auto === AUTO.off) { core.auto(AUTO.crew); say('The crew has it', now); }
        else { handOver(); say('Your controls', now); }
        break;
      case 'approach':
        if (s.peri > 150000 && s.ringRange < 500000) { core.auto(AUTO.approach); say('The crew flies the approach to the hub', now); }
        else say('The approach starts in orbit, near the Ring', now);
        break;
      case 'orbit':
        if (s.phase < PH.orbit || auto !== AUTO.crew) {
          if (auto !== AUTO.crew) core.auto(AUTO.crew);
          state.skipping = true;
          say('Skipping ahead to orbit…', now);
        }
        break;
      case 'gear': input.hands.gear = !input.hands.gear; break;
      case 'brake': input.hands.brake = input.hands.brake > 0 ? 0 : 1; break;
      case 'view': state.view = (state.view + 1) % VIEWS.length; input.look.az = 0; break;
      case 'help': help.classList.toggle('shown'); break;
      case 'quality': {
        const choice = nextChoice(quality.choice);
        saveChoice(choice);
        const next = resolveTier({ saved: choice, report });
        Object.assign(quality, { scale: 1, probes: 0, frames: [], seen: 0 });
        setQuality(next.tier, next.choice, next.why);
        say(`Graphics: ${quality.settings.label.toLowerCase()}${choice === 'auto' ? ` (auto: ${next.why})` : ''}${pipeline.note ? `; ${pipeline.note}` : ''}`, now);
        break;
      }
      case 'full': input.hands.throttle = 1; break;
      case 'cut': input.hands.throttle = 0; break;
      case 'slower': state.warp = WARPS[Math.max(0, WARPS.indexOf(state.warp) - 1)]; break;
      case 'faster': state.warp = WARPS[Math.min(WARPS.length - 1, WARPS.indexOf(state.warp) + 1)]; break;
      case 'sas-next': core.sas((Math.round(s.sas) + 1) % 4); say(`Hold: ${['attitude', 'prograde', 'retrograde', 'the Ring'][Math.round(core.s.sas)]}`, now); break;
      case 'reset':
        s = core.reset(START);
        Object.assign(input.hands, { throttle: 0, gear: true, brake: 1 });
        Object.assign(state, { warp: 1, skipping: false, debt: 0 });
        say('Back on 17C', now);
        break;
      default:
        if (c.startsWith('sas')) {
          core.sas(Number(c.slice(3)));
          say(`Hold: ${['attitude', 'prograde', 'retrograde', 'the Ring'][Number(c.slice(3))]}`, now);
        }
    }
    s = core.read();
  }

  // The camera: where it is (site frame, doubles), what it looks at, which way is up.
  function cameraPose(s, axes, P, up) {
    const look = input.look;
    if (VIEWS[state.view] === 'cockpit') {
      const bodyUp = scale(axes.down, -1);
      const eye = add(add(P, scale(axes.fwd, 11.6)), scale(bodyUp, 1.85));
      const ahead = add(axes.fwd, scale(bodyUp, -0.12));
      const yawed = add(scale(ahead, Math.cos(look.az)), scale(axes.right, -Math.sin(look.az)));
      return { eye, target: add(eye, yawed), up: bodyUp };
    }
    if (VIEWS[state.view] === 'from the Ring') {
      const R = [s.ringE, s.ringN, s.ringU], axis = [s.ringAxE, s.ringAxN, s.ringAxU];
      const eye = sub(R, scale(axis, HUB_PORT_M + 120));
      return { eye, target: P, up: unit(add(eye, [0, 0, RE])) };
    }
    // chase: behind the nose's heading, above, turned by the drag
    let h = sub(axes.fwd, scale(up, dot(axes.fwd, up)));
    if (length(h) < 0.2 && state.heading) h = state.heading;
    h = unit(h);
    state.heading = h;
    const side = cross(h, up);
    const dir = add(scale(h, Math.cos(look.az)), scale(side, Math.sin(look.az)));
    const back = add(scale(dir, -Math.cos(look.el)), scale(up, Math.sin(look.el)));
    const eye = keepAbove(add(P, scale(back, look.dist)), up);   // never under the ground, however the drag swings it
    return { eye, target: add(P, scale(up, 2.5)), up };
  }

  function screenOf(rel) {   // a point from the eye, three.js axes -> CSS pixels, or null behind
    const v = new THREE.Vector3(rel[0], rel[1], rel[2]);
    const ahead = v.clone().applyQuaternion(camera.quaternion.clone().invert());
    if (ahead.z > -1) return null;
    v.project(camera);
    if (Math.abs(v.x) > 1.2 || Math.abs(v.y) > 1.2) return null;
    return [((v.x + 1) / 2) * window.innerWidth, ((1 - v.y) / 2) * window.innerHeight];
  }

  function frame(now) {
    const dt = Math.min(0.25, (now - state.last) / 1000);
    probe(now - state.last);
    state.last = now;
    for (const c of input.poll(dt)) command(c, now);
    ctx.now = now;
    ctx.dt = dt;
    const owner = FEATURES.find((f) => f.owns && f.owns(ctx));
    if (owner) {   // a feature that draws the whole frame itself
      owner.frame(ctx, dt);
      s = core.s;
      requestAnimationFrame(frame);
      return;
    }
    core.controls(input.hands);

    if (state.skipping) {
      s = core.step(1500);
      if (s.phase >= PH.orbit || s.crashed > 0 || s.auto !== AUTO.crew) {
        state.skipping = false;
        state.warp = 1;
        state.debt = 0;
      }
    } else {
      state.debt += dt * state.warp;
      let n = Math.floor(state.debt / DT);
      const cap = Math.max(5, Math.ceil((state.warp * 0.1) / DT));   // past this the debt is dropped, not run
      if (n > cap) { n = cap; state.debt = 0; } else state.debt -= n * DT;
      s = core.step(n);
    }

    const P = [s.siteE, s.siteN, s.siteU];
    const up = unit(add(P, [0, 0, RE]));
    const axes = bodyAxes([s.qw, s.qx, s.qy, s.qz]);
    const pose = cameraPose(s, axes, P, up);
    const cam = pose.eye;
    const rel = (p) => three(sub(p, cam));

    // the camera sits at the origin of what is drawn; everything else is placed from it
    camera.position.set(0, 0, 0);
    camera.up.set(...three(pose.up));
    camera.lookAt(new THREE.Vector3(...rel(pose.target)));
    camera.updateMatrixWorld();

    const alt = heightOf(cam);
    const sunSite = [s.sunE, s.sunN, s.sunU], sun = three(sunSite);
    const shadowed = !inSight(add(P, scale(sunSite, 2e7)), P, 0);             // the craft in the Earth's shadow

    const craftRel = rel(P);
    craft.update(craftRel, three(axes.fwd), three(scale(axes.down, -1)), three(axes.right), s, now / 1000, renderer.getPixelRatio(), three(up));
    craft.group.visible = VIEWS[state.view] !== 'cockpit';
    const craftNear = length(craftRel) < NEAR;
    (craftNear ? near : far).add(craft.group);
    const R = [s.ringE, s.ringN, s.ringU];
    const ringRel = rel(R), ringAxis = three([s.ringAxE, s.ringAxN, s.ringAxU]);
    ring.update(ringRel, ringAxis, three([s.ringRefE, s.ringRefN, s.ringRefU]), now / 1000, sun, shadowed ? 0 : 1, renderer.getPixelRatio());
    const ringNear = length(ringRel) < NEAR;
    (ringNear ? near : far).add(ring.group);
    ring.group.visible = inSight(cam, R, -10000);
    airport.group.position.set(...rel([0, 0, 0]));
    // the field, drawn without the air in front of it, gives way to the Earth's own ground well above it
    airport.group.visible = length(cam) < NEAR && heightOf(cam) < 15000 && inSight(cam, [0, 0, 0]);
    airport.update({ x: cam[0], y: cam[2], z: -cam[1] }, s.t);

    // the near slices: the Ring in one of its own where nothing near shares its depths
    const baseNear = VIEWS[state.view] === 'cockpit' ? 0.2 : 0.5;
    let slices = [{ scene: near, near: baseNear, far: NEAR * 1.2 }];
    if (ringNear && ring.group.visible) {
      const c = scale(ringRel, -1), ay = dot(c, ringAxis);
      const depth = ringDepth(ay, length(sub(c, scale(ringAxis, ay))), length(ringRel));
      let stuff = null;
      const span = (lo, hi) => { stuff = stuff ? { min: Math.min(stuff.min, lo), max: Math.max(stuff.max, hi) } : { min: lo, max: hi }; };
      if (craft.group.visible && craftNear) span(Math.max(0, length(craftRel) - 30), length(craftRel) + 30);
      if (airport.group.visible) span(0, NEAR);
      const plan = depthSlices(depth, stuff, { base: baseNear, far: NEAR * 1.2 });
      if (plan.some((p) => p.scene === 'ring')) mid.add(ring.group);
      slices = plan.map((p) => ({ ...p, scene: p.scene === 'ring' ? mid : near }));
    }
    state.slices = slices.length;

    // the Sun, the sky's light, the Earth's
    const camUp = unit(add(cam, [0, 0, RE]));
    const sunUp = dot(sunSite, camUp);
    const thin = Math.min(1, Math.max(0, (alt - 20000) / 60000));            // 0 in the air, 1 above it
    const daylight = Math.min(1, Math.max(0, sunUp * 5 + 0.3));
    const sunLight = shadowed ? 0 : 3.2 * (thin + (1 - thin) * Math.min(1, Math.max(0, sunUp * 3 + 0.1)));
    const sunTint = new THREE.Color().setRGB(1, 0.88 + 0.12 * Math.min(1, sunUp * 4 + thin), 0.75 + 0.25 * Math.min(1, sunUp * 3 + thin));
    for (const L of [farLights, nearLights, midLights]) {
      // the light's direction is all the lighting reads; its place is where the shadow is looked at from
      L.sun.target.position.set(...craftRel);
      L.sun.position.set(craftRel[0] + sun[0] * 600, craftRel[1] + sun[1] * 600, craftRel[2] + sun[2] * 600);
      L.sun.intensity = sunLight;
      L.sun.color.copy(sunTint);
      L.sky.intensity = 0.15 + 0.55 * (1 - thin) * daylight;
      L.sky.color.setRGB(0.55 + 0.4 * thin, 0.7 + 0.2 * thin, 0.95);
      L.sky.groundColor.setRGB(0.3, 0.32, 0.36).multiplyScalar(0.4 + 0.6 * Math.max(0, dot(sunSite, up)));
      L.sky.position.set(...three(up));
    }

    // the near things' haze: the air between the eye and the field, thinning with height
    near.fog.density = 4.5e-5 * Math.exp(-alt / 8000);
    near.fog.color.setRGB(0.1, 0.125, 0.16).multiplyScalar(0.3 + 0.7 * daylight);

    // the stars: fixed in the sky, which turns over the site
    const t = s.t;
    stars.update({
      x: ecefToThree(inertialToEcef([1, 0, 0], t), START.lat, START.lon),
      y: ecefToThree(inertialToEcef([0, 1, 0], t), START.lat, START.lon),
      z: ecefToThree(inertialToEcef([0, 0, 1], t), START.lat, START.lon),
    }, Math.max(thin, Math.min(1, Math.max(0, -sunUp * 6 - 0.3))));

    Object.assign(ctx, { cam, rel, axes, P, up, alt, sunSite });
    for (const f of FEATURES) if (f.update) f.update(ctx);

    camera.near = 1e4;
    camera.far = 1e8;
    camera.updateProjectionMatrix();
    earth.update(camera, renderer.domElement.height, rel([0, 0, -RE]), alt, sun, toEcef);
    updateEnv();
    pipeline.render(() => {
      camera.near = 1e4;
      camera.far = 1e8;
      camera.updateProjectionMatrix();
      renderer.render(far, camera);
      for (const slice of slices) {
        renderer.clearDepth();
        camera.near = slice.near;
        camera.far = slice.far;
        camera.updateProjectionMatrix();
        renderer.render(slice.scene, camera);
      }
    });

    // where the craft is going (through the air, or relative to the Ring when it is near) and the Ring
    let vel;
    if (s.ringRange < 2e5) vel = [s.vrelE, s.vrelN, s.vrelU];
    else {
      const a = (s.alpha * Math.PI) / 180, b = (s.beta * Math.PI) / 180;
      vel = add(add(scale(axes.fwd, Math.cos(a) * Math.cos(b)), scale(axes.right, Math.sin(b))), scale(axes.down, Math.sin(a) * Math.cos(b)));
      // above the air the marker shows the velocity in space, prograde as the PROGRADE hold flies it
      if (s.qbar < AIR_LAW_PA) vel = inertialVelocity(scale(vel, s.tas), P, START.lat);
    }
    const moving = length(vel) > 0.5 && (s.tas > 5 || s.ringRange < 2e5);
    hud.draw(s, { warp: state.skipping ? 'MAX' : state.warp, view: VIEWS[state.view] }, {
      velocity: moving ? screenOf(scale(three(unit(vel)), 1e4)) : null,
      ring: screenOf(ringRel),
    }, now, {
      extra: FEATURES.flatMap((f) => (f.hud ? f.hud(ctx) : [])),
      status: FEATURES.map((f) => (f.status ? f.status(ctx) : null)).find(Boolean) || null,
    });
    if (now > sayUntil) sayEl.textContent = '';
    requestAnimationFrame(frame);
  }

  window.orbitSketch = { core, renderer, earth, ring, craft, state, ctx, quality, pipeline, command: (c) => command(c, performance.now()) };   // for tests
  statusEl.textContent = core.note || '';
  requestAnimationFrame(frame);
}

main().catch((e) => fail(e.message || String(e)));
