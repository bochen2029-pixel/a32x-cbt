// The orbit sketch's page: the core stepped at its fixed 50 Hz, a round Earth, the Ring, the craft and
// KDFW drawn round them. Two passes: the far one (sky, Earth, stars, anything past 300 km) and, over
// it after the depth is cleared, the near one, so a centimetre at the wheels and the Earth's whole
// disc are both drawn with depth to spare. GPLv3.

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
import { Ring } from './ring.js';

const NEAR = 3e5;                                   // m: nearer than this is drawn in the near pass
const WARPS = [0, 1, 2, 5, 10, 25, 50, 100];
const VIEWS = ['chase', 'cockpit', 'from the Ring'];

const statusEl = document.getElementById('status');
function fail(message) {
  statusEl.textContent = `Failed: ${message}`;
  statusEl.className = 'failed';
}
window.addEventListener('error', (e) => fail(e.message || String(e)));
window.addEventListener('unhandledrejection', (e) => fail(e.reason?.message || String(e.reason)));

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
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  if (!renderer.capabilities.isWebGL2) throw new Error('this page needs WebGL 2');
  const phone = Math.min(window.innerWidth, window.innerHeight) < 600;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, phone ? 2 : 1.5));
  renderer.autoClear = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.8;

  const far = new THREE.Scene(), near = new THREE.Scene();
  const farLights = lights(far), nearLights = lights(near);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.5, NEAR * 1.2);
  const earth = new Earth({ maskWidth: phone ? 2048 : 4096, siteUp: siteAxes(START.lat, START.lon).up });
  const stars = new Stars();
  far.add(stars.points, earth.mesh);
  const craft = new Craft(), ring = new Ring();
  near.add(craft.group);
  const o = origin(START.lat, START.lon);
  const found = findRunwayEnd([validateAirport(KDFW)], START.lat, START.lon, START.hdg);
  if (!found) throw new Error('KDFW 17C is not in kdfw.json');
  const airport = new Airport(found.airport, o, { gain: 1, windows: 0.5, pixelRatio: renderer.getPixelRatio() });
  near.add(airport.group);
  const toEcef = threeToEcef(START.lat, START.lon);

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
  };
  for (const f of FEATURES) if (f.init) f.init(ctx);


  const resize = () => {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

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
    const eye = add(P, scale(back, look.dist));
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

    const craftRel = rel(P);
    craft.update(craftRel, three(axes.fwd), three(scale(axes.down, -1)), three(axes.right), s, now / 1000);
    craft.group.visible = VIEWS[state.view] !== 'cockpit';
    (length(craftRel) < NEAR ? near : far).add(craft.group);
    const R = [s.ringE, s.ringN, s.ringU];
    const ringRel = rel(R);
    ring.update(ringRel, three([s.ringAxE, s.ringAxN, s.ringAxU]), three([s.ringRefE, s.ringRefN, s.ringRefU]), now / 1000);
    (length(ringRel) < NEAR ? near : far).add(ring.group);
    ring.group.visible = inSight(cam, R, -10000);
    airport.group.position.set(...rel([0, 0, 0]));
    airport.group.visible = length(cam) < NEAR && inSight(cam, [0, 0, 0]);
    airport.update({ x: cam[0], y: cam[2], z: -cam[1] }, s.t);

    // the Sun, the sky's light, the Earth's
    const alt = heightOf(cam);
    const sunSite = [s.sunE, s.sunN, s.sunU], sun = three(sunSite);
    const camUp = unit(add(cam, [0, 0, RE]));
    const sunUp = dot(sunSite, camUp);
    const thin = Math.min(1, Math.max(0, (alt - 20000) / 60000));            // 0 in the air, 1 above it
    const shadowed = !inSight(add(P, scale(sunSite, 2e7)), P, 0);             // the craft in the Earth's shadow
    const daylight = Math.min(1, Math.max(0, sunUp * 5 + 0.3));
    const sunLight = shadowed ? 0 : 3.2 * (thin + (1 - thin) * Math.min(1, Math.max(0, sunUp * 3 + 0.1)));
    const sunTint = new THREE.Color().setRGB(1, 0.88 + 0.12 * Math.min(1, sunUp * 4 + thin), 0.75 + 0.25 * Math.min(1, sunUp * 3 + thin));
    for (const L of [farLights, nearLights]) {
      L.sun.position.set(sun[0] * 1000, sun[1] * 1000, sun[2] * 1000);
      L.sun.target.position.set(0, 0, 0);
      L.sun.intensity = sunLight;
      L.sun.color.copy(sunTint);
      L.sky.intensity = 0.15 + 0.55 * (1 - thin) * daylight;
      L.sky.color.setRGB(0.55 + 0.4 * thin, 0.7 + 0.2 * thin, 0.95);
      L.sky.groundColor.setRGB(0.3, 0.32, 0.36).multiplyScalar(0.4 + 0.6 * Math.max(0, dot(sunSite, up)));
      L.sky.position.set(...three(up));
    }

    // the stars: fixed in the sky, which turns over the site
    const t = s.t;
    stars.update({
      x: ecefToThree(inertialToEcef([1, 0, 0], t), START.lat, START.lon),
      y: ecefToThree(inertialToEcef([0, 1, 0], t), START.lat, START.lon),
      z: ecefToThree(inertialToEcef([0, 0, 1], t), START.lat, START.lon),
    }, Math.max(thin, Math.min(1, Math.max(0, -sunUp * 6 - 0.3))));

    Object.assign(ctx, { cam, rel, axes, P, up, alt, sunSite });
    for (const f of FEATURES) if (f.update) f.update(ctx);

    renderer.clear();
    camera.near = 1e4;
    camera.far = 1e8;
    camera.updateProjectionMatrix();
    earth.update(camera, renderer.domElement.height, rel([0, 0, -RE]), alt, sun, toEcef);
    renderer.render(far, camera);
    renderer.clearDepth();
    camera.near = VIEWS[state.view] === 'cockpit' ? 0.2 : 0.5;
    camera.far = NEAR * 1.2;
    camera.updateProjectionMatrix();
    renderer.render(near, camera);

    // where the craft is going (through the air, or relative to the Ring when it is near) and the Ring
    let vel;
    if (s.ringRange < 2e5) vel = [s.vrelE, s.vrelN, s.vrelU];
    else {
      const a = (s.alpha * Math.PI) / 180, b = (s.beta * Math.PI) / 180;
      vel = add(add(scale(axes.fwd, Math.cos(a) * Math.cos(b)), scale(axes.right, Math.sin(b))), scale(axes.down, Math.sin(a) * Math.cos(b)));
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

  window.orbitSketch = { core, renderer, earth, ring, craft, state, ctx, command: (c) => command(c, performance.now()) };   // for tests
  statusEl.textContent = core.note || '';
  requestAnimationFrame(frame);
}

main().catch((e) => fail(e.message || String(e)));
