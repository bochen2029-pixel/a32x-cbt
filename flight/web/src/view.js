// The out-the-window view, as a full-flight simulator's visual system drew it in the 1980s: flat-shaded
// polygons, light points that stay sharp at any range, a horizon in haze. The airport the flight is at
// — KDFW, the simulator's home — with its runways' paint and lights, its PAPIs and approach lights, its
// terminals and tower; dusk, night or day. three.js (MIT), bundled. GPLv3.

import * as THREE from 'three';
import KDFW from '../data/kdfw.json' with { type: 'json' };
import { Airport } from './airport.js';
import { airportFromRunway, findRunwayEnd, validateAirport } from './airport-layout.js';
import { eye, origin } from './scene-math.js';

const DEG = Math.PI / 180;

const TIMES = {
  dusk: { zenith: 0x10204a, horizon: 0xd88a5a, ground: 0x5a6a48, fog: 0x8a6a5a, sun: 0.7, ambient: 0.9, windows: 0.7, lights: 1.0 },
  night: { zenith: 0x02030a, horizon: 0x101828, ground: 0x0c100c, fog: 0x0a0e16, sun: 0.0, ambient: 0.12, windows: 1.0, lights: 1.0 },
  day: { zenith: 0x3a6ab0, horizon: 0xbcd0e0, ground: 0x4a5a38, fog: 0xb0c4d4, sun: 1.0, ambient: 0.7, windows: 0.0, lights: 0.6 },
};

const SKY_M = 35000;

// A deterministic pseudo-random sequence, so the scene is the same every time.
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9 >>> 0) / 4294967296);
}

// Whether WebGL here is drawn by the CPU (SwiftShader, or another software rasteriser): asked of a
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
  // software: WebGL is drawn by the CPU here (softwareRendering), so the airport goes without textures
  // and its lights with smaller halos.
  constructor(canvas, time = 'dusk', antialias = true, { software = false } = {}) {
    this.t = TIMES[time] || TIMES.dusk;
    this.software = software;
    const t = this.t;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias });
    this.renderer.setPixelRatio(Math.min(2, globalThis.devicePixelRatio || 1));
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(t.fog, 3000, 28000);
    // near at 2 m: the nearest ground the eye sees is 13 m away, and the depth buffer's precision at
    // range goes as the near plane
    this.camera = new THREE.PerspectiveCamera(45, 1, 2, 40000);
    this.camera.rotation.order = 'YXZ';

    this.scene.add(new THREE.HemisphereLight(t.horizon, t.ground, t.ambient));
    const sun = new THREE.DirectionalLight(0xffd0a0, t.sun);
    sun.position.set(-3, 1, 2);
    this.scene.add(sun);

    this.sky(t);
    this.ground(t);
    this.renderer.setClearColor(t.zenith);
  }

  // The sky, a dome that travels with the eye: it is always the same distance away, inside the far plane.
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

  // Fields of slightly different shades, flat shaded, 60 km across around the runway: what gives the eye
  // its speed and height. Under them, ground of one shade to the horizon.
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
  // the runway gives the whole airport, KDFW above all; a runway no file holds is drawn on its own.
  // Returns what was drawn, for the page to say.
  setRunway(rwy) {
    this.rwy = rwy;
    this.origin = origin(rwy.lat, rwy.lon);
    const airports = [validateAirport(KDFW)];
    const found = findRunwayEnd(airports, rwy.lat, rwy.lon, rwy.headingDeg);
    const data = found ? found.airport : airportFromRunway(rwy);
    this.airport = new Airport(data, this.origin, {
      software: this.software, gain: this.t.lights, windows: this.t.windows, pixelRatio: this.renderer.getPixelRatio(),
    });
    this.scene.add(this.airport.group);
    return found ? `${found.airport.icao} ${found.end}` : `runway ${data.runways[0].ends[0].id}`;
  }

  resize(width, height) {
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  // The camera where the pilot's eye is, the sky around it, the PAPI as that eye sees it and the
  // flashers at the flight's own time.
  update(lat, lon, radioHeightFt, pitchDeg, rollDeg, headingDeg, timeS = 0) {
    const e = eye(this.origin, lat, lon, radioHeightFt, pitchDeg, headingDeg);
    this.camera.position.set(e.x, e.y, e.z);
    this.camera.rotation.set(pitchDeg * DEG, -headingDeg * DEG, -rollDeg * DEG);
    this.skyDome.position.copy(this.camera.position);
    this.airport.update(e, timeS);
    return e;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  rendererName() {
    const gl = this.renderer.getContext();
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  }
}
