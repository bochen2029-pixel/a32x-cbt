// The out-the-window view, as a full-flight simulator's visual system drew it in the 1980s: flat-shaded
// polygons, light points that stay sharp at any range, a horizon in haze. The runway the flight core
// names, where it is, with its lights and a PAPI; a few buildings; dusk, night or day. three.js (MIT),
// bundled. GPLv3.

import * as THREE from 'three';
import { eye, origin, papiBoxes, papiWhite } from './scene-math.js';

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

function points(positions, colors, size) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const m = new THREE.PointsMaterial({ size, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false });
  return new THREE.Points(g, m);
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
  constructor(canvas, time = 'dusk', antialias = true) {
    this.t = TIMES[time] || TIMES.dusk;
    const t = this.t;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias });
    this.renderer.setPixelRatio(Math.min(2, globalThis.devicePixelRatio || 1));
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(t.fog, 3000, 28000);
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.5, 40000);
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

  // The runway the flight names (scene-math.js, runwayFromState): the world's origin at its landing
  // threshold, the pavement, paint, lights and buildings built in the runway's own frame and turned to its
  // heading, the PAPI where the glide meets it.
  setRunway(rwy) {
    this.rwy = rwy;
    this.origin = origin(rwy.lat, rwy.lon);
    const group = new THREE.Group();
    this.pavement(group, rwy);
    this.lights(group, rwy);
    this.buildings(group, rwy);
    group.rotation.y = -rwy.headingDeg * DEG;
    this.scene.add(group);

    this.papiAt = papiBoxes(rwy);
    this.papi = points(this.papiAt.flatMap((b) => [b.x, b.y, b.z]), new Array(12).fill(1), 5);
    this.scene.add(this.papi);
  }

  // The pavement, from the start of its displaced part to the far end, and its paint: threshold bars and
  // line, centreline dashes, the aiming point 400 m in.
  pavement(group, { lengthM: length, widthM: width, displacedM: displaced }) {
    const asphalt = new THREE.Mesh(new THREE.PlaneGeometry(width, length + displaced).rotateX(-Math.PI / 2),
                                   new THREE.MeshLambertMaterial({ color: 0x3c3c40 }));
    asphalt.position.set(0, 0, (displaced - length) / 2);
    group.add(asphalt);
    const paint = [];
    const box = (x, z, w, l) => paint.push({ x, z, w, l });
    box(0, -1, width - 2, 1.8);  // the threshold line
    for (let k = 0; k < 8; ++k) {  // threshold bars, either side of the centreline
      const x = 3 + k * 2.4;
      box(x, -30, 1.8, 30);
      box(-x, -30, 1.8, 30);
    }
    for (let z = -80; z > -length + 80; z -= 50) box(0, z, 0.9, 30);  // centreline dashes
    box(9, -400, 9, 45);
    box(-9, -400, 9, 45);
    const geoms = paint.map(({ x, z, w, l }) => new THREE.PlaneGeometry(w, l).rotateX(-Math.PI / 2).translate(x, 0.02, z));
    group.add(new THREE.Mesh(mergeGeometries(geoms), new THREE.MeshLambertMaterial({ color: 0xd8d8d0 })));
  }

  lights(group, { lengthM: length, widthM: width, displacedM: displaced }) {
    const t = this.t;
    const pos = [], col = [];
    const add = (x, y, z, c) => {
      pos.push(x, y, z);
      col.push(c.r * t.lights, c.g * t.lights, c.b * t.lights);
    };
    const white = new THREE.Color(1, 0.95, 0.8), green = new THREE.Color(0.2, 1, 0.3), red = new THREE.Color(1, 0.15, 0.1);
    for (let z = displaced; z >= -length; z -= 60) {  // edge lights
      add(-width / 2 - 1, 0.4, z, white);
      add(width / 2 + 1, 0.4, z, white);
    }
    for (let z = -15; z > -length; z -= 15) add(0, 0.1, z, z < -length + 900 ? red : white);  // centreline
    for (let x = -width / 2; x <= width / 2; x += 3) {
      add(x, 0.3, 0, green);         // threshold
      add(x, 0.3, -length, red);     // runway end
    }
    for (let d = 30; d <= 900; d += 30) {  // approach lights: a line, and a crossbar at 300 m
      add(0, 0.5 + d * 0.01, d, white);
      if (d === 300) for (let x = -15; x <= 15; x += 3) add(x, 3.5, d, white);
    }
    group.add(points(pos, col, 3));
  }

  // A terminal, a tower, hangars and a few others, right of the runway: generic, not the airport's own.
  buildings(group) {
    const t = this.t;
    const r = rng(1983);
    const geoms = [], windows = [], windowColours = [];
    const lit = new THREE.Color(1, 0.85, 0.5).multiplyScalar(t.windows);
    const place = (x, z, w, d, h) => {
      geoms.push(new THREE.BoxGeometry(w, h, d).translate(x, h / 2, z));
      for (let k = 0; k < Math.max(2, Math.floor(w / 8)); ++k) {
        if (r() < 0.6) {
          windows.push(x - w / 2 + (k + 0.5) * (w / Math.max(2, Math.floor(w / 8))), h * (0.3 + 0.5 * r()), z - d / 2 - 0.2);
          windowColours.push(lit.r, lit.g, lit.b);
        }
      }
    };
    place(260, -900, 160, 40, 14);   // terminal
    place(230, -1150, 12, 12, 34);   // tower
    for (let k = 0; k < 4; ++k) place(300 + k * 70, -1500 - k * 30, 55, 50, 18 + 6 * r());  // hangars
    for (let k = 0; k < 6; ++k) place(520 + r() * 300, -600 - r() * 1600, 20 + r() * 30, 20 + r() * 30, 8 + r() * 20);
    group.add(new THREE.Mesh(mergeGeometries(geoms), new THREE.MeshLambertMaterial({ color: 0x8a8580, flatShading: true })));
    if (t.windows > 0) group.add(points(windows, windowColours, 2));
  }

  resize(width, height) {
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  // The camera where the pilot's eye is, the sky around it, and the PAPI as that eye sees it.
  update(lat, lon, radioHeightFt, pitchDeg, rollDeg, headingDeg) {
    const e = eye(this.origin, lat, lon, radioHeightFt, pitchDeg, headingDeg);
    this.camera.position.set(e.x, e.y, e.z);
    this.camera.rotation.set(pitchDeg * DEG, -headingDeg * DEG, -rollDeg * DEG);
    this.skyDome.position.copy(this.camera.position);
    const white = papiWhite(e, this.papiAt);
    const c = this.papi.geometry.attributes.color;
    white.forEach((w, k) => c.setXYZ(k, 1, w ? 1 : 0.12, w ? 0.95 : 0.1));
    c.needsUpdate = true;
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

// Geometries of the same attributes as one, so a hundred boxes of paint are one draw call.
function mergeGeometries(list) {
  const nonIndexed = list.map((g) => (g.index ? g.toNonIndexed() : g));
  const names = Object.keys(nonIndexed[0].attributes);
  const merged = new THREE.BufferGeometry();
  for (const name of names) {
    const size = nonIndexed[0].attributes[name].itemSize;
    const total = nonIndexed.reduce((n, g) => n + g.attributes[name].array.length, 0);
    const array = new Float32Array(total);
    let at = 0;
    for (const g of nonIndexed) {
      array.set(g.attributes[name].array, at);
      at += g.attributes[name].array.length;
    }
    merged.setAttribute(name, new THREE.BufferAttribute(array, size));
  }
  return merged;
}
