// The out-the-window view, in two tiers on one composition. The floor, wherever a CPU draws every pixel
// (WARP, SwiftShader) or tier=low: the 1980s full-flight-sim view P7 built — flat-shaded polygons, light
// points sharp at any range, a horizon in haze — exactly as it was, so the software budget cannot
// regress. The GPU tier, wherever a GPU draws: the same airport seen through one atmosphere at any solar
// hour of 1 November, the country round DFW and Dallas's skyline (scenery.js). Both tiers: the A320
// outside (airliner.js), its flight deck inside (cockpit.js), ten cameras, and the debrief (acmi.js).
// three.js (MIT), bundled. GPLv3.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import A320 from '../data/a320.json' with { type: 'json' };
import SKYLINE from '../data/dallas-skyline.json' with { type: 'json' };
import REGION from '../data/dfw-region.json' with { type: 'json' };
import KDFW from '../data/kdfw.json' with { type: 'json' };
import { Acmi, bandOf } from './acmi.js';
import { Airliner, structuralMatrix } from './airliner.js';
import { Airport } from './airport.js';
import { airportFromRunway, findRunwayEnd, runwayFrame, validateAirport } from './airport-layout.js';
import { Cockpit } from './cockpit.js';
import { ambient, haze } from './haze.js';
import { hazedLightMaterial, lightMaterial } from './lights.js';
import { NOSE_HFOV_DEG, nosePoint, papiSeen, vfov } from './nose.js';
import { eye, heightFt, origin, xz } from './scene-math.js';
import { HOURS, Scenery } from './scenery.js';
import { sampleState } from './timeline.js';
import { EDGE_DEG, linesShown, showVectors, vectorize } from './vectors.js';
import { validateAirframe, validateRegion, validateSkyline } from './world-data.js';

const DEG = Math.PI / 180;
const FT = 0.3048;
const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const TIMES = {
  dusk: { zenith: 0x10204a, horizon: 0xd88a5a, ground: 0x5a6a48, fog: 0x8a6a5a, sun: 0.7, ambient: 0.9, windows: 0.7, lights: 1.0 },
  night: { zenith: 0x02030a, horizon: 0x101828, ground: 0x0c100c, fog: 0x0a0e16, sun: 0.0, ambient: 0.12, windows: 1.0, lights: 1.0 },
  day: { zenith: 0x3a6ab0, horizon: 0xbcd0e0, ground: 0x4a5a38, fog: 0xb0c4d4, sun: 1.0, ambient: 0.7, windows: 0.0, lights: 0.6 },
};

const SKY_M = 35000;

// The cameras, on keys 1 to 9 and 0 in this order; V steps through them. The pilot's eye, the one the
// overlay is drawn for, comes first.
export const CAMERAS = ['eye', 'cockpit', 'chase', 'orbit', 'tower', 'flyby', 'cabin', 'skyline', 'side', 'satellite', 'nose'];
export const VIEW_KEYS = ['1-9 0  cameras, V the next, N the nose', '[ ]  the hour, back / on (GPU)', 'K  debrief: drag the bar at its foot, , . a second (< > ten), Space plays; click a moment', 'L  the flown path',
  'mouse  drag: look round the deck (2), swing round (4); wheel: zoom; double click: back'];

// A deterministic pseudo-random sequence, so the scene is the same every time.
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9 >>> 0) / 4294967296);
}

// Whether WebGL here is drawn by the CPU (SwiftShader, WARP, or another software rasteriser): asked of a
// scratch canvas, before the view's own context is made, because a canvas gets one context for good.
export function softwareRendering() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    const info = gl && gl.getExtension('WEBGL_debug_renderer_info');
    const name = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : '';
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return /swiftshader|llvmpipe|software|basic render/i.test(name);
  } catch {
    return false;
  }
}

export class View {
  // software: WebGL is drawn by the CPU here (softwareRendering). tier: 'low' (the floor) or 'high' (the
  // GPU tier); unset, the floor where the CPU draws. hour: the GPU tier's solar hour; unset, time's.
  // flying: the airframe the core flies, 'a320' or '737'; the drawn model is an A320's either way.
  constructor(canvas, time = 'dusk', antialias = true, { software = false, tier = null, hour = null, flying = 'a320' } = {}) {
    this.flying = flying;
    this.floor = (tier || (software ? 'low' : 'high')) === 'low';
    this.t = TIMES[time] || TIMES.dusk;
    this.software = software;
    const t = this.t;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias, stencil: true, logarithmicDepthBuffer: !this.floor });
    this.renderer.setPixelRatio(Math.min(2, globalThis.devicePixelRatio || 1));
    this.renderer.info.autoReset = false;   // the shadow is a second pass; render() counts both
    this.scene = new THREE.Scene();
    // near at 2 m in the eye: the nearest ground it sees is 13 m away, and without logarithmic depth the
    // depth buffer's precision at range goes as the near plane
    this.camera = new THREE.PerspectiveCamera(45, 1, 2, this.floor ? 40000 : 170000);
    this.camera.rotation.order = 'YXZ';
    if (this.floor) {
      this.fog = new THREE.Fog(t.fog, 3000, 28000);
      this.scene.fog = this.fog;
      this.scene.add(new THREE.HemisphereLight(t.horizon, t.ground, t.ambient));
      const sun = new THREE.DirectionalLight(0xffd0a0, t.sun);
      sun.position.set(-3, 1, 2);
      this.scene.add(sun);
      this.sky(t);
      this.ground(t);
      this.renderer.setClearColor(t.zenith);
    } else {
      // Khronos PBR Neutral: keeps a dusk's hue where AgX greys it, and sodium stays orange
      this.renderer.toneMapping = THREE.NeutralToneMapping;
      this.scenery = new Scenery(this.renderer, this.scene, { hour: hour ?? HOURS[time] ?? HOURS.dusk, pixelRatio: this.renderer.getPixelRatio() });
    }
    this.airframe = validateAirframe(A320);
    this.structural = structuralMatrix(this.airframe.cg);
    this.cgNow = this.airframe.cg.slice();   // the CG the drawn structure hangs from (update)
    this.nose = new THREE.Vector3(...nosePoint(this.airframe.fuselage));   // the nose camera's place, the structure's metres
    this.mode = 'eye';
    this.look = { yaw: 0, pitch: -10 };
    this.orbit = { yaw: 2.4, pitch: 0.14, dist: 80 };
    this.zoom = 1;
    this.history = [];       // the flight as it went, four samples a second, for the debrief
    this.lastSample = -1e9;
    this.debriefOn = false;
    this.trailOn = false;
    this.lastTubes = -1;
  }

  // The floor's sky, a dome that travels with the eye: it is always the same distance away, inside the
  // far plane.
  sky(t) {
    const g = new THREE.SphereGeometry(SKY_M, 32, 16);
    const zenith = new THREE.Color(t.zenith), horizon = new THREE.Color(t.horizon);
    const colors = [];
    const p = g.attributes.position;
    for (let i = 0; i < p.count; ++i) {
      const up = Math.max(0, p.getY(i) / SKY_M);
      const c = horizon.clone().lerp(zenith, Math.pow(up, 0.45));
      colors.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    this.skyDome = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    this.scene.add(this.skyDome);
  }

  // The floor's ground: fields of slightly different shades, flat shaded, 60 km across around the runway,
  // what gives the eye its speed and height; under them, ground of one shade to the horizon.
  ground(t) {
    const base = new THREE.Mesh(new THREE.PlaneGeometry(200000, 200000).rotateX(-Math.PI / 2),
                                new THREE.MeshLambertMaterial({ color: new THREE.Color(t.ground).multiplyScalar(0.9) }));
    base.position.y = -0.2;
    this.scene.add(base);
    const g = new THREE.PlaneGeometry(60000, 60000, 120, 120).toNonIndexed();
    g.rotateX(-Math.PI / 2);
    const shade = new THREE.Color(t.ground), r = rng(47008);
    const colors = [];
    for (let f = 0; f < g.attributes.position.count / 6; ++f) {
      const c = shade.clone().offsetHSL((r() - 0.5) * 0.04, (r() - 0.5) * 0.1, (r() - 0.5) * 0.06);
      for (let v = 0; v < 6; ++v) colors.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    mesh.position.y = -0.05;
    this.scene.add(mesh);
  }

  // The airport the flight is at, drawn around the runway the flight core names (scene-math.js,
  // runwayFromState): the world's origin at that runway's landing threshold. An airport file that holds
  // the runway gives the whole airport, KDFW above all; a runway no file holds is drawn on its own. On
  // the GPU tier, the country round it too. Returns what was drawn, for the page to say.
  setRunway(rwy) {
    this.rwy = rwy;
    this.origin = origin(rwy.lat, rwy.lon);
    const found = findRunwayEnd([validateAirport(KDFW)], rwy.lat, rwy.lon, rwy.headingDeg);
    const data = found ? found.airport : airportFromRunway(rwy);
    this.landingEnd = found ? found.end : data.runways[0].ends[0].id;   // the end flown to: its PAPI (papiAt)
    this.airport = new Airport(data, this.origin, {
      software: this.software, gain: this.t.lights, windows: this.floor ? this.t.windows : 0.8, pixelRatio: this.renderer.getPixelRatio(),
    });
    this.scene.add(this.airport.group);
    const dfw = data.icao === 'KDFW';
    const skyline = dfw ? validateSkyline(SKYLINE) : null;
    if (this.scenery) {
      this.scenery.dress(this.airport, data.elevationM);
      this.scenery.region(this.origin, this.airfield(data), dfw ? validateRegion(REGION) : null, skyline);
      this.height = (x, z) => this.scenery.terrain.height(x, z);
    } else {
      this.height = () => 0;
    }
    this.landmarks = (skyline ? skyline.landmarks : []).map((b) => {
      const [x, z] = xz(this.origin, b.lat, b.lon);
      return { x, z, h: b.h, name: b.name };
    });
    // the tower camera stands in the tower nearest the flight's runway
    const towers = data.towers.map((t) => {
      const [x, z] = xz(this.origin, t.lat, t.lon);
      return new THREE.Vector3(x, t.heightM + 4, z);
    }).sort((a, b) => a.length() - b.length());
    this.tower = towers[0] || new THREE.Vector3(300, 40, -900);
    this.tubes = {
      fma: ['', '', '', ''], vapp: 0, course: rwy.headingDeg, distanceNm: 0, memo: [], ils: found ? `ILS ${found.end}` : '',
      fcuSpeed: '---', fcuHeading: '---', fcuAlt: '-----', fcuVs: '----',
    };
    // the aircraft's place and attitude, kept whether or not it is drawn: the cameras and the debrief's
    // record follow it
    this.body = new THREE.Object3D();
    this.body.rotation.order = 'YXZ';
    this.debriefOf = [rwy, data];
    // The GPU tier builds the A320, its deck and the debrief now. The floor builds them when a camera or
    // the debrief first needs them: in the pilot's eye nothing of them shows, and a machine drawing in
    // software should not pay at the start, in work and in garbage to collect, for what it may not use.
    if (!this.floor) this.build();
    this.unprimed = true;   // the first update warms what is drawn (warm)
    return found ? `${found.airport.icao} ${found.end}` : `runway ${data.runways[0].ends[0].id}`;
  }

  // The A320, its flight deck and the debrief, built once; true when built just now, and then primed
  // (compiled and sent, the GPU waited for) at the next update, a single pause.
  build() {
    if (this.airliner) return false;
    this.world = this.scene.children.filter((o) => !o.isLight);
    this.airliner3d();
    this.debrief(...this.debriefOf);
    this.unprimed = true;
    return true;
  }

  // The airfield's extent in the world, [x0, z0, x1, z1]: kept flat, and clear of the towns' lights.
  airfield(data) {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const rw of data.runways) {
      for (const e of rw.ends) {
        const [x, z] = xz(this.origin, e.lat, e.lon);
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
      }
    }
    return [x0 - 700, z0 - 1100, x1 + 700, z1 + 1100];
  }

  // The A320 the flight flies, outside and in; hidden in the pilot's eye, where nothing of it shows.
  airliner3d() {
    const A = this.airframe, u = this.scenery?.u;
    this.airliner = new Airliner(A);
    // still outlines for the debrief's playhead (setHead), taken posed at rest, the gear down and then up
    this.airliner.update({ gear_pos: 1 }, 0);
    this.outline = this.airliner.staticGeometry();
    this.airliner.update({ gear_pos: 0 }, 0);
    this.outlineUp = this.airliner.staticGeometry();
    this.airliner.update({ gear_pos: 1 }, 0);
    this.cockpit = new Cockpit((m) => (u ? ambient(m, u, 0.45) : m), A);
    this.airliner.structure.add(this.cockpit.group);
    if (u) {
      this.airliner.lights.points.material = hazedLightMaterial(u, { curve: false });
      const done = new Set();
      this.airliner.root.traverse((o) => {
        if (o.isMesh && o.material.isMeshStandardMaterial && !done.has(o.material)) {
          done.add(o.material);
          haze(o.material, u, { curve: false });
        }
      });
      this.shadows();
    } else {
      this.navLights = lightMaterial({ halo: 1.6, gain: this.t.lights, pixelRatio: this.renderer.getPixelRatio() });
      this.airliner.lights.points.material = this.navLights;
      this.cockpit.flood(0.03);
    }
    this.airliner.root.rotation.order = 'YXZ';
    this.airliner.root.visible = false;
    this.scene.add(this.airliner.root);
  }

  // The sun's shadow of the aircraft on the field, projected flat as 1990s simulators drew it: every part
  // pressed onto the ground along the sun's direction, each pixel darkened once (the stencil).
  shadows() {
    this.shadowScene = new THREE.Scene();
    this.shadowU = { uSun: { value: new THREE.Vector3(0, 1, 0) }, uGround: { value: 0 }, uOpacity: { value: 0.5 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.shadowU,
      vertexShader: /* glsl */ `
        #include <common>
        uniform vec3 uSun;
        uniform float uGround;
        #include <logdepthbuf_pars_vertex>
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          w.xyz -= uSun * ((w.y - uGround) / max(uSun.y, 0.06));
          w.y = uGround + 0.2;
          gl_Position = projectionMatrix * viewMatrix * w;
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: /* glsl */ `
        #include <common>
        uniform float uOpacity;
        #include <logdepthbuf_pars_fragment>
        void main() {
          #include <logdepthbuf_fragment>
          gl_FragColor = vec4(0.0, 0.0, 0.0, uOpacity);
        }`,
      transparent: true, depthWrite: false,
      stencilWrite: true, stencilRef: 2, stencilFunc: THREE.NotEqualStencilFunc, stencilZPass: THREE.ReplaceStencilOp,
    });
    this.proxies = [];
    this.airliner.root.traverse((o) => {
      if (!o.isMesh || this.cockpit.group.getObjectById(o.id)) return;
      const p = new THREE.Mesh(o.geometry, mat);
      p.matrixAutoUpdate = false;
      p.matrixWorldAutoUpdate = false;
      p.frustumCulled = false;
      this.shadowScene.add(p);
      this.proxies.push([o, p]);
    });
  }

  // The debrief: every runway's outline, the flight's ILS as a tunnel, the flown path coloured by the
  // gate's bands, the aircraft in vectors, on black.
  debrief(rwy, data) {
    const frame = (f) => new THREE.Matrix4().makeRotationY(-f.headingDeg * DEG).setPosition(f.x, 0, f.z);
    const others = data.runways.map((rw) => ({ M: frame(runwayFrame(this.origin, rw)), lengthM: rw.lengthM, widthM: rw.widthM, displacedM: rw.ends[0].displacedM }));
    // the world's origin is the flight's own landing threshold, its landing direction the heading
    const flight = new THREE.Matrix4().makeRotationY(-rwy.headingDeg * DEG);
    this.acmi = new Acmi(flight, rwy, others, this.height, this.landmarks);
    this.acmi.group.visible = false;
    this.acmi.wire.visible = false;
    this.scene.add(this.acmi.group);
    // the aircraft in vectors, carried by its parts so that the gear, the flaps, the surfaces and the doors move in
    // the debrief as they fly (vectors.js), with the fuselage's own lines, which its smooth body cannot give the
    // edges (airliner.js, fuselageWire)
    this.vectors = vectorize(this.airliner.root, new THREE.LineBasicMaterial({ color: 0xf2f2f2 }), {
      skip: (o) => Boolean(this.cockpit.group.getObjectById(o.id)),
      extra: [[this.airliner.fuselage, this.airliner.fuselageWire()]],
    });
    // the aircraft where the debrief's playhead holds it (setHead): a still outline in the playhead's colour, its
    // gear as it was then
    this.ghost = new THREE.Group();
    const cyan = new THREE.LineBasicMaterial({ color: 0x4fd8ff });
    const still = (outline) => {
      const edges = new THREE.EdgesGeometry(outline, EDGE_DEG);
      edges.applyMatrix4(this.structural.clone().invert());   // into the structure's metres
      const l = new THREE.LineSegments(mergeGeometries([edges, this.airliner.fuselageWire()]), cyan);
      l.matrixAutoUpdate = false;
      l.matrix.copy(this.structural);
      this.ghost.add(l);
      return l;
    };
    this.ghostDown = still(this.outline);
    this.ghostUp = still(this.outlineUp);
    this.ghost.visible = false;
    this.scene.add(this.ghost);
  }

  // The flight's log (events.js) as tags on the flown path, each where the aircraft was at that moment;
  // a log that starts again, as a restarted flight's does, clears them. The floor tier tags once it has
  // built the debrief.
  tags(events) {
    if (!this.acmi) return;
    this.tagged ||= 0;
    if (events.length < this.tagged) {
      this.acmi.clearTags();
      this.tagged = 0;
    }
    for (; this.tagged < events.length; ++this.tagged) {
      const e = events[this.tagged];
      if (!e.tag || !Number.isFinite(e.lat)) continue;
      const [x, z] = xz(this.origin, e.lat, e.lon);
      this.acmi.tag(x, (this.cgHeight ?? this.airframe.cgHeightM) + e.raFt * FT, z, e.tag, e.kind);
    }
  }

  // The debrief's playhead (timeline.js): the aircraft drawn in vectors where a sample of the flight puts it, and
  // the cameras centred there; null, the flight as it goes.
  setHead(sample) {
    this.focus = null;
    if (!this.ghost) return;
    this.ghost.visible = Boolean(sample) && this.debriefOn;
    if (!this.ghost.visible) return;
    this.ghost.position.fromArray(sample.p);
    this.ghost.quaternion.fromArray(sample.q);
    const down = !(sample.s?.gear_pos < 0.5);   // a sample older than the gear's slot: down
    this.ghostDown.visible = down;
    this.ghostUp.visible = !down;
    this.ghost.updateMatrixWorld(true);
    this.focus = { position: this.ghost.position, quaternion: this.ghost.quaternion, heading: sample.s?.heading_deg };
  }

  // How many of the debrief's vector lines are drawn now, of all (vectors.js): a retracted gear's are not.
  vectorsShown() {
    return this.vectors ? linesShown(this.vectors) : { shown: 0, total: 0 };
  }

  setDebrief(on) {
    this.build();
    this.debriefOn = on;
    for (const o of this.world) o.visible = !on;
    // the aircraft in vectors: its parts' lines on and their paint off, its lights off (vectors.js)
    showVectors(this.vectors, on);
    this.airliner.lights.points.visible = !on;
    if (on && this.mode === 'cockpit') this.cockpit.group.visible = false;
    this.acmi.wire.visible = on;
    this.acmi.group.visible = on || this.trailOn;
    if (this.floor) {
      this.scene.fog = on ? null : this.fog;
      this.renderer.setClearColor(on ? 0x000000 : this.t.zenith);
    }
    if (on) {
      this.replayTrail();
      if (this.mode === 'eye' || this.mode === 'cockpit') this.setCamera('orbit');
    }
  }

  setTrail(on) {
    this.build();
    this.trailOn = on;
    this.acmi.group.visible = on || this.debriefOn;
    if (on) this.replayTrail();
  }

  // The kept samples into the debrief's path, the most recent that fit, leaving room to grow.
  replayTrail() {
    this.acmi.reset();
    for (let k = Math.max(0, this.history.length - (this.acmi.max - 2000)); k < this.history.length; ++k) this.trace(this.history[k]);
  }

  trace(e) {
    if (this.acmi.count >= this.acmi.max) return this.replayTrail();
    this.acmi.push(e.t, new THREE.Vector3().fromArray(e.p), new THREE.Vector3().fromArray(e.w), e.band);
  }

  // A sample of the flight every quarter second: where the CG was, which way the right wing pointed, the
  // gate's band, the attitude, and what the debrief's timeline reads out (timeline.js). A clock that runs back (a restart) starts the record again.
  record(s) {
    if (s.t_s < this.lastSample) {
      this.history.length = 0;
      this.lastSample = -1e9;
      this.acmi?.reset();
    }
    if (s.t_s - this.lastSample < 0.25) return;
    this.lastSample = s.t_s;
    const root = this.body;
    const q = root.quaternion;
    const e = { t: s.t_s, p: root.position.toArray(), w: new THREE.Vector3(1, 0, 0).applyQuaternion(q).toArray(), band: bandOf(s),
      q: [q.x, q.y, q.z, q.w], s: sampleState(s) };
    this.history.push(e);
    if (this.history.length > 60000) this.history.splice(0, 10000);   // four hours
    if (this.debriefOn || this.trailOn) this.trace(e);
  }

  setCamera(mode) {
    if (!CAMERAS.includes(mode)) return;
    this.mode = mode === 'skyline' && !this.landmarks.length ? 'chase' : mode;
    this.chasePos = null;
    this.flyby = null;
    if (this.mode !== 'eye' && this.mode !== 'nose') this.build();   // neither sees the aircraft
    if (!this.airliner) return;
    this.cockpit.group.visible = this.mode === 'cockpit' && !this.debriefOn;   // its paint would cover the vectors
    this.airliner.fuselage.visible = this.mode !== 'cockpit';
    this.lastTubes = -1;
  }

  nextCamera() {
    this.setCamera(CAMERAS[(CAMERAS.indexOf(this.mode) + 1) % CAMERAS.length]);
  }

  // The GPU tier's hour, moved by dh: the sky and its light follow at the next frame.
  moveHour(dh) {
    if (this.scenery) this.scenery.setHour(this.scenery.hour + dh);
  }

  // The overlay is drawn for the pilot's eye only: its symbols are conformal to that view.
  get overlayShown() {
    return this.mode === 'eye' && !this.debriefOn;
  }

  describe() {
    const h = this.scenery?.hour;
    const hour = h === undefined ? '' : ` · ${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')} solar`;
    const deck = this.mode === 'cockpit' && this.foreignDeck ? ' · an A320\'s deck, its eye' : '';
    return `${this.floor ? 'floor' : 'GPU'} tier · ${this.mode}${deck}${this.debriefOn ? ' · debrief' : ''}${hour}`;
  }

  resize(width, height) {
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  // The state, once a frame: the airframe where the state puts it and its surfaces, the camera, the
  // sky, the PAPI as the camera sees it, the flashers at the flight's own time, the flight's record.
  update(s, dt = 0) {
    const body = this.body, root = this.airliner?.root;
    this.lastT = s.t_s;   // the flight's time the view was last brought to (capture)
    const [x, z] = xz(this.origin, s.lat_deg, s.lon_deg);
    // the CG over the ground as the core has it for the airframe flying (cg_height_m), so the wheels
    // touch where the true height (heightFt) is zero; the drawn A320's own where a core does not say
    const own = this.flying !== '737';   // the drawn airframe is the one flying
    const cgHeight = own && Number.isFinite(s.cg_height_m) ? s.cg_height_m : this.airframe.cgHeightM;
    body.position.set(x, cgHeight + Math.max(0, heightFt(s)) * FT, z);
    this.cgHeight = cgHeight;
    body.rotation.set(s.pitch_deg * DEG, -s.heading_deg * DEG, -s.roll_deg * DEG);
    body.updateMatrixWorld();
    if (root) {
      // The drawn A320 hangs from the CG the core flies, loaded with its fuel and payload, not the file's
      // empty one: the core gives its eye about that CG in body axes, the file the eye in the structure,
      // and the difference is the CG. So the deck's eyepoint is the core's eye, and the wheels stand
      // where cg_height_m puts them. A 737 flying keeps the drawn A320's own.
      const e = this.airframe.eye;
      const cg = own && Number.isFinite(s.eye_fwd_m) ? [e[0] + s.eye_fwd_m, e[1] - s.eye_right_m, e[2] - s.eye_up_m] : this.airframe.cg;
      if (Math.abs(cg[0] - this.cgNow[0]) + Math.abs(cg[1] - this.cgNow[1]) + Math.abs(cg[2] - this.cgNow[2]) > 1e-3) {
        this.cgNow = cg;
        this.structural = structuralMatrix(cg);
        this.airliner.structure.matrix.copy(this.structural);
        for (const g of [this.ghostDown, this.ghostUp]) g?.matrix.copy(this.structural);
      }
      root.position.copy(body.position);
      root.quaternion.copy(body.quaternion);
      root.updateMatrixWorld(true);
      root.visible = (this.mode !== 'eye' && this.mode !== 'nose') || this.debriefOn;
      if (root.visible) this.airliner.update(s, dt);
    }
    this.placeCamera(s, dt);
    if (this.vr) this.vrFollow();
    const cam = this.camera.position;
    this.record(s);
    if (this.scenery) {
      if (this.scenery.update(cam, s.t_s)) this.relight();
    } else {
      this.skyDome.position.copy(cam);
      if (this.navLights) this.navLights.uniforms.uTime.value = s.t_s;
    }
    this.airport.update(cam, s.t_s);
    if (this.mode === 'cockpit') {
      this.tubes.distanceNm = Math.max(0, s.thr_along_m ?? 0) / 1852;   // runway.cpp: + before the threshold
      this.tubes.vapp = Number.isFinite(s.vapp_kn) ? s.vapp_kn : 0;    // the speed the gate holds the pilot to
      if (this.lastTubes < 0) this.cockpit.draw(s, this.tubes);
      else this.cockpit.drawOne(this.lastTubes, s, this.tubes);
      ++this.lastTubes;
    }
    if (this.unprimed) {
      this.unprimed = false;
      this.warm();
    }
    this.shadowOn = false;
    if (this.proxies && root.visible && !this.debriefOn && this.mode !== 'cockpit') {
      const opacity = 0.55 * smooth(2, 12, this.scenery.elevation) * (1 - Math.min(1, heightFt(s) / 1200));
      this.shadowOn = opacity > 0.01 && Math.hypot(x, z) < 12000;
      if (this.shadowOn) {
        this.shadowU.uOpacity.value = opacity;
        this.shadowU.uSun.value.copy(this.scenery.u.uSunDir.value);
        for (const [o, p] of this.proxies) {
          let v = o.visible;
          for (let a = o.parent; v && a; a = a.parent) v = a.visible;
          p.visible = v;
          p.matrixWorld.copy(o.matrixWorld);
        }
      }
    }
    return cam;
  }

  // What the scenery's light sets on the aircraft and its deck, once that light has changed (scenery.update).
  relight() {
    const lit = 0.25 + 0.75 * smooth(-6, 2, this.scenery.elevation);
    for (const m of this.airliner.materials) m.envMapIntensity = lit;
    this.cockpit.flood(0.35 / this.scenery.exposure);
  }

  // The nose camera's place and boresight about an aircraft at P turned by Q (the body's, or the debrief's playhead's),
  // into pos and quat: the nose point (nose.js) hung as the structure is, looking along the fuselage.
  nosePose(P, Q, pos = new THREE.Vector3(), quat = new THREE.Quaternion()) {
    pos.copy(this.nose).applyMatrix4(this.structural).applyQuaternion(Q).add(P);
    quat.copy(Q);
    return { pos, quat };
  }

  // The scene's parts that follow the eye, brought to an eye at p at the flight's time t: the sky and the light it
  // gives (the GPU tier's), the PAPI as p sees them, the flashers.
  toEye(p, t) {
    if (this.scenery) {
      if (this.scenery.update(p, t)) this.relight();
    } else {
      this.skyDome.position.copy(p);
    }
    this.airport.update(p, t);
  }

  // The light points' pixel-ratio uniforms: every one a material of the scene's has (lights.js).
  pixelRatioUniforms() {
    const found = new Set();
    this.scene.traverse((o) => {
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m?.uniforms?.uPixelRatio) found.add(m.uniforms.uPixelRatio);
    });
    return [...found];
  }

  // The world from the live aircraft's nose camera at this stop, width by height pixels and hfovDeg across, as an
  // image's data URL (flightDebug.frame): the screen's own scene, colours and exposure, without the aircraft or the
  // overlay, rendered into the page's canvas resized for the moment and put back as it was in the same task, so no
  // frame of it is ever shown; its light points sized as at a pixel ratio of one, so that a frame is the same on any
  // screen. Nothing of the flight moves.
  capture({ width, height, hfovDeg = NOSE_HFOV_DEG, type = 'image/jpeg', quality = 0.85 }) {
    if (this.vr) throw new Error('frame: not while the page is in VR, whose canvas the headset holds');
    const r = this.renderer, cam = (this.frameCam ||= new THREE.PerspectiveCamera());
    this.nosePose(this.body.position, this.body.quaternion, cam.position, cam.quaternion);
    cam.aspect = width / height;
    cam.fov = vfov(hfovDeg, cam.aspect);
    cam.near = this.floor ? 1 : 0.3;
    cam.far = this.camera.far;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    const t = this.lastT, root = this.airliner?.root, rootShown = root?.visible;
    const ratios = this.pixelRatioUniforms(), was = ratios.map((u) => u.value);
    const size = r.getSize(new THREE.Vector2()), ratio = r.getPixelRatio();
    try {
      this.toEye(cam.position, t);
      if (root) root.visible = false;
      for (const u of ratios) u.value = 1;
      r.setPixelRatio(1);
      r.setSize(width, height, false);
      r.render(this.scene, cam);
      return r.domElement.toDataURL(type, quality);
    } finally {
      r.setPixelRatio(ratio);
      r.setSize(size.x, size.y, false);
      ratios.forEach((u, k) => {
        u.value = was[k];
      });
      if (root) root.visible = rootShown;
      this.toEye(this.camera.position, t);
      this.render();   // the screen as it was
    }
  }

  // The landing runway's PAPI as seen from p (nose.js, papiSeen): for grading what a camera sees, never for flying.
  papiAt(p) {
    return this.airport ? papiSeen(this.airport.papiLamps, this.landingEnd, p) : null;
  }

  placeCamera(s, dt) {
    // centred on the aircraft; in the debrief, where its playhead holds it (setHead)
    const cam = this.camera, root = this.body, f = this.debriefOn ? this.focus : null;
    const P = f ? f.position : root.position, Q = f ? f.quaternion : root.quaternion;
    const hdg = (f && Number.isFinite(f.heading) ? f.heading : s.heading_deg) * DEG;
    const fwd = new THREE.Vector3(Math.sin(hdg), 0, -Math.cos(hdg)), right = new THREE.Vector3(Math.cos(hdg), 0, Math.sin(hdg));
    const clear = (v) => Math.max(v.y, this.height(v.x, v.z) + 2);
    let fov = 45, near = this.floor ? 1 : 0.3;
    switch (this.mode) {
      case 'eye': {
        const e = eye(this.origin, s);
        cam.position.set(e.x, e.y, e.z);
        cam.rotation.set(s.pitch_deg * DEG, -s.heading_deg * DEG, -s.roll_deg * DEG);
        near = 2;
        break;
      }
      case 'nose': {
        // in the nose, boresighted along the fuselage: the world ahead as an enhanced-vision camera sees it, no
        // overlay (nose.js), NOSE_HFOV_DEG across whatever the window's shape
        this.nosePose(P, Q, cam.position, cam.quaternion);
        fov = vfov(NOSE_HFOV_DEG, cam.aspect);
        break;
      }
      case 'cockpit': {
        // the left seat: the flying airframe's own eye from the core, the one the pilot's eye uses, where
        // the drawn deck is that airframe's; else (a 737 flying under the drawn A320) the deck's own eye,
        // so the seat stays in the deck. Drag to turn the head.
        this.foreignDeck = this.flying === '737';
        cam.position.fromArray(this.airframe.eye).applyMatrix4(this.structural).applyMatrix4(root.matrixWorld);
        const head = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.look.pitch * DEG, this.look.yaw * DEG, 0, 'YXZ'));
        cam.quaternion.copy(Q).multiply(head);
        fov = 64 / this.zoom;
        near = this.floor ? 0.1 : 0.05;
        break;
      }
      case 'chase': {
        const want = P.clone().addScaledVector(fwd, -62).add(new THREE.Vector3(0, 14, 0));
        if (!this.chasePos) this.chasePos = want.clone();
        this.chasePos.lerp(want, 1 - Math.exp(-dt * 2.5));
        cam.position.copy(this.chasePos);
        cam.position.y = clear(cam.position);
        cam.lookAt(P.clone().addScaledVector(fwd, 25));
        fov = 50 / this.zoom;
        break;
      }
      case 'orbit': {
        const o = this.orbit;
        cam.position.set(P.x + Math.sin(o.yaw) * Math.cos(o.pitch) * o.dist, P.y + Math.sin(o.pitch) * o.dist, P.z + Math.cos(o.yaw) * Math.cos(o.pitch) * o.dist);
        cam.position.y = clear(cam.position);
        cam.lookAt(P);
        fov = 45 / this.zoom;
        break;
      }
      case 'tower': {
        cam.position.copy(this.tower);
        cam.lookAt(P);
        fov = Math.max(1.2, Math.min(55, (2 * Math.atan(38 / cam.position.distanceTo(P))) / DEG)) / this.zoom;
        break;
      }
      case 'flyby': {
        const passed = this.flyby && this.flyby.clone().sub(P).dot(fwd) < -40;
        if (!this.flyby || passed || this.flyby.distanceTo(P) > 3000) {
          this.flyby = P.clone().addScaledVector(fwd, Math.max(20, (s.gs_kn || 0) * 0.5144) * 6).addScaledVector(right, 70).add(new THREE.Vector3(0, -8, 0));
          this.flyby.y = clear(this.flyby) + 0.5;
        }
        cam.position.copy(this.flyby);
        cam.lookAt(P);
        fov = 38 / this.zoom;
        break;
      }
      case 'cabin': {
        // a window seat behind the left wing, looking out and forward along it
        cam.position.set(23.2, -1.7, 0.5).applyMatrix4(this.structural).applyMatrix4(root.matrixWorld);
        // a camera's lookAt turns its -z to the target: here left, down and forward in the model's frame
        const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), new THREE.Vector3(-0.8, -0.28, -0.55), new THREE.Vector3(0, 1, 0));
        cam.quaternion.copy(Q).multiply(new THREE.Quaternion().setFromRotationMatrix(m));
        fov = 62 / this.zoom;
        near = this.floor ? 0.3 : 0.1;
        break;
      }
      case 'skyline': {
        // the aircraft between the camera and Reunion Tower, on a long lens
        const t = this.landmarks[0];
        const toCity = new THREE.Vector3(t.x - P.x, 0, t.z - P.z).normalize();
        cam.position.copy(P).addScaledVector(toCity, -300).add(new THREE.Vector3(0, 25, 0));
        cam.position.y = clear(cam.position);
        cam.lookAt(P.clone().addScaledVector(toCity, 2000).add(new THREE.Vector3(0, 40, 0)));
        fov = 16 / this.zoom;
        break;
      }
      case 'side':
        cam.position.copy(P).addScaledVector(right, -260 / this.zoom);
        cam.position.y = clear(cam.position);
        cam.lookAt(P);
        fov = 30;
        break;
      case 'satellite':
        cam.position.set(P.x, P.y + 2600 / this.zoom, P.z + 1);
        cam.lookAt(P);
        fov = 40;
        break;
      default:
        break;
    }
    if (cam.fov !== fov || cam.near !== near) {
      cam.fov = fov;
      cam.near = near;
      cam.updateProjectionMatrix();
    }
  }

  // Everything compiled and sent to the GPU once, before the flight's clock starts, so the first frames
  // do not cost the flight its first steps: 4 were dropped at t = 0 when the first frame paid for it.
  warm() {
    const hidden = (this.airliner ? [this.airliner.root, this.cockpit.group, this.acmi.group, this.acmi.wire, ...this.vectors.lines] : []).filter((o) => !o.visible);
    for (const o of hidden) o.visible = true;
    this.renderer.compile(this.scene, this.camera);
    if (this.shadowScene) this.renderer.compile(this.shadowScene, this.camera);
    this.render();
    for (const o of hidden) o.visible = false;
    this.render();
    // the renders above are only queued: wait for the GPU (or SwiftShader's threads) to finish them, or
    // the clock's second frame still pays for them
    this.renderer.getContext().finish();
  }

  // VR entered (vr.js): a dolly where the page's camera stands, turned as it is, and in it the headset's camera, whose
  // pose about the dolly three.js sets from the headset each frame (WebXRManager.updateCamera: each eye's world, the
  // dolly's times the head's); the flight deck's left seat to start in. space: the reference space ('local', seated).
  async vrBegin(session, space) {
    const r = this.renderer;
    if (!this.vrRig) {
      this.vrRig = new THREE.Group();
      this.vrCam = new THREE.PerspectiveCamera();
      this.vrRig.add(this.vrCam);
      this.scene.add(this.vrRig);
    }
    this.vrWas = this.mode;
    this.setCamera('cockpit');
    r.xr.enabled = true;
    r.xr.setReferenceSpaceType(space);
    await r.xr.setSession(session);
    this.vr = true;
    this.vrFollow();
  }

  // VR left: the page's own camera again, the one it had before.
  vrEnd() {
    this.vr = false;
    this.renderer.xr.enabled = false;
    this.setCamera(this.vrWas || 'eye');
  }

  // Each frame in VR: the dolly brought to where the page's camera now stands, and its clipping the camera's (5 cm in
  // the flight deck), so that the number keys move the headset's place as they move the camera.
  vrFollow() {
    this.vrRig.position.copy(this.camera.position);
    this.vrRig.quaternion.copy(this.camera.quaternion);
    this.vrRig.updateMatrixWorld(true);
    this.vrCam.near = this.camera.near;
    this.vrCam.far = this.camera.far;
  }

  render() {
    const r = this.renderer;
    r.info.reset();
    // in VR, the headset's camera about the page's (vrFollow), each eye from its own place; no shadow pass
    if (this.vr) {
      r.render(this.scene, this.vrCam);
      return;
    }
    r.render(this.scene, this.camera);
    if (this.shadowOn) {
      r.autoClear = false;
      r.render(this.shadowScene, this.camera);
      r.autoClear = true;
    }
  }

  rendererName() {
    const gl = this.renderer.getContext();
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  }
}
