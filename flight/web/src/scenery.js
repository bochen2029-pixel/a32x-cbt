// The GPU tier's world round the airport the view draws (view.js): one atmosphere for the sky, the haze
// on every surface and the sun's own light (atmosphere.js, haze.js), at any solar hour of 1 November; the
// country round DFW and Dallas's skyline (terrain.js, city.js), or plain prairie at another airport. The
// floor tier draws none of it. From the visuals study's mockup (fbw-desktop, 2026-11-01). GPLv3.

import * as THREE from 'three';
import { Atmosphere, SKY_GLSL } from './atmosphere.js';
import { City } from './city.js';
import { haze, hazeUniforms } from './haze.js';
import { hazedLightMaterial } from './lights.js';
import { sunAt } from './scene-math.js';
import { Terrain } from './terrain.js';

const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// The hours the page's time= names, solar, on 1 November at DFW, where the sun sets at 17:19.
export const HOURS = { dawn: 6.95, day: 13.0, golden: 16.75, dusk: 17.32, night: 18.7 };

export class Scenery {
  constructor(renderer, scene, { hour = HOURS.dusk, visibilityKm = 70, latDeg = 32.9, pixelRatio = 1 } = {}) {
    this.renderer = renderer;
    this.scene = scene;
    this.hour = hour;
    this.visibilityKm = visibilityKm;
    this.latDeg = latDeg;
    this.atmosphere = new Atmosphere();
    const u = this.u = hazeUniforms(this.atmosphere);
    // The world stays flat, as the flight model's ground and P7's airport are: the earth's curve waits
    // until the airport's long quads are cut short enough to follow it (a 4 km runway sags under it).
    u.uCurve.value = 0;
    u.uTime = { value: 0 };
    u.uPixelRatio = { value: pixelRatio };
    u.uLightGain = { value: 1 };
    u.uHalo = { value: 3 };
    this.night = { value: 0 };
    this.lights = hazedLightMaterial(u, { curve: false });
    this.points = [];
    this.sun = new THREE.DirectionalLight(0xffffff, 1);
    scene.add(this.sun, this.sun.target);
    this.sky();
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.key = '';
    this.elevation = 0;
    this.exposure = 1;
  }

  // The sky dome: the atmosphere's table in each direction, the ground's light below the horizon seen
  // through the air, the sun's disc and a little glare; dithered so a dusk gradient never bands. The
  // same dome, without the sun, is what the environment map is baked from.
  sky() {
    const u = this.u;
    this.skyU = { uSky: u.uSky, uSunDir: u.uSunDir, uGroundRad: { value: new THREE.Color() }, uSunRad: { value: new THREE.Color() }, uGlare: { value: new THREE.Color() } };
    const make = (env) => new THREE.ShaderMaterial({
      uniforms: { ...this.skyU, uEnv: { value: env } },
      vertexShader: 'varying vec3 vDir;\nvoid main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */ `
        #include <common>
        #include <dithering_pars_fragment>
        varying vec3 vDir;
        uniform vec3 uGroundRad, uSunRad, uGlare;
        uniform float uEnv;
        ${SKY_GLSL}
        void main() {
          vec3 d = normalize(vDir);
          vec4 s = texture2D(uSky, skyUV(d));
          vec3 col = s.rgb;
          if (d.y < 0.0) col += uGroundRad * s.a;
          if (uEnv < 0.5) {
            float c = dot(d, uSunDir);
            col += uSunRad * smoothstep(0.999984, 0.999992, c);
            col += uGlare * (pow(max(c, 0.0), 2600.0) * 0.5 + pow(max(c, 0.0), 160.0) * 0.025);
          }
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <dithering_fragment>
        }`,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      // dithered on the screen only: in the environment map its ±0.2 % noise (red and blue against green)
      // outweighs a night sky a hundred times over, and the water's mirror showed it as magenta and green
      dithering: !env,
    });
    this.skyMesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), make(0));
    this.skyMesh.renderOrder = -1000;
    this.skyMesh.frustumCulled = false;
    this.scene.add(this.skyMesh);
    this.envScene = new THREE.Scene();
    this.envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), make(1)));
    // the stars: a few thousand points fixed to the sky, out as the sun goes down
    const n = 2600, pos = [], b = [];
    let s = 12345;
    const rnd = () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9 >>> 0) / 4294967296);
    for (let k = 0; k < n; ++k) {
      const zz = rnd() * 2 - 1, a = rnd() * Math.PI * 2, rr = Math.sqrt(1 - zz * zz);
      pos.push(Math.cos(a) * rr * 900, zz * 900, Math.sin(a) * rr * 900);
      b.push(rnd() ** 7 * 1.6 + 0.08);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('bright', new THREE.Float32BufferAttribute(b, 1));
    this.starU = { uStars: { value: 0 }, uPixelRatio: u.uPixelRatio };
    const stars = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: this.starU,
      vertexShader: 'attribute float bright; uniform float uStars, uPixelRatio; varying float vB;\nvoid main() { vec3 d = normalize(position); vB = bright * uStars * smoothstep(-0.01, 0.25, d.y); gl_PointSize = (1.0 + bright) * uPixelRatio; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying float vB;\nvoid main() { vec2 p = gl_PointCoord * 2.0 - 1.0; float r2 = dot(p, p); if (r2 > 1.0) discard; gl_FragColor = vec4(vec3(0.85, 0.9, 1.0) * vB * exp(-r2 * 3.0), 1.0); }',
      blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false,
    }));
    stars.renderOrder = -999;
    stars.frustumCulled = false;
    this.skyMesh.add(stars);
  }

  // P7's airport seen through the same air: the haze on its surfaces, its fittings in the hazed light
  // material. Its own update keeps setting the flashers' time, now on the uniform every light shares.
  dress(airport, fieldElevM) {
    this.u.uFieldElev.value = fieldElevM;
    airport.group.traverse((o) => {
      if (o.isPoints) o.material = this.lights;
      else if (o.isMesh && o.material && !o.material.isShaderMaterial) haze(o.material, this.u, { curve: false });
    });
    airport.material.uniforms.uTime = this.u.uTime;
  }

  // The country round the airport: DFW's own lakes, towns, freeways and skyline where the data is given,
  // plain prairie elsewhere. box: the airfield's extent, [x0, z0, x1, z1], kept flat and dark.
  region(o, box, region, skyline) {
    this.terrain = new Terrain(this.u, o, region || { lakes: [], towns: [], freeways: [] }, box);
    this.scene.add(this.terrain.group);
    const sets = [this.terrain.lights];
    if (skyline) {
      this.city = new City(o, this.u, this.night, (x, z) => this.terrain.height(x, z)).build(skyline.landmarks, skyline.clusters);
      this.scene.add(this.city.group);
      sets.push(this.city.lights);
    }
    for (const set of sets) {
      const p = set.build(this.lights);
      this.points.push(p);
      this.scene.add(p);
    }
  }

  setHour(h) {
    this.hour = ((h % 24) + 24) % 24;
    this.key = '';
  }

  // The sky, the sun and everything lit by them, from one atmosphere, whenever the hour, the haze or the
  // eye's height has moved enough to matter; the dome travels with the eye.
  update(eyePosition, timeS) {
    const u = this.u, sun = sunAt(this.hour, this.latDeg);
    this.skyMesh.position.copy(eyePosition);
    u.uTime.value = timeS;
    u.uSunDir.value.set(...sun.dir);
    this.sun.position.set(...sun.dir).multiplyScalar(1000);
    this.elevation = sun.elevation;
    if (!this.atmosphere.update(sun.elevation, eyePosition.y + u.uFieldElev.value, this.visibilityKm) && this.key) return false;
    this.key = this.atmosphere.key;
    const A = this.atmosphere, ext = A.extinction();
    u.uBetaR.value.copy(ext.rayleigh);
    u.uBetaM.value = ext.mie;
    const sinE = Math.max(0, Math.sin(sun.elevation * Math.PI / 180));
    const above = smooth(-1.2, 0.8, sun.elevation);
    this.sun.color.copy(A.sunColour);
    this.sun.intensity = above;
    u.uSkyIrr.value.copy(A.skyIrradiance);
    const ground = A.sunColour.clone().multiplyScalar(sinE * above).add(A.skyIrradiance).multiplyScalar(0.14);
    u.uGroundIrr.value.copy(ground);
    this.skyU.uGroundRad.value.copy(ground).multiplyScalar(1 / Math.PI);
    this.skyU.uSunRad.value.copy(A.sunColour).multiplyScalar(2500 * above);
    this.skyU.uGlare.value.copy(A.sunColour).multiplyScalar(above);
    // exposure from the light falling on the ground, as a camera's meter would set it
    const E = lum(A.sunColour) * sinE * above + lum(A.skyIrradiance);
    this.exposure = Math.max(1.5, Math.min(600, 1.1 / (E / Math.PI + 2e-6)));
    this.renderer.toneMappingExposure = this.exposure;
    u.uLightGain.value = 0.32 + 1.55 * (1 - smooth(-8, 5, sun.elevation));
    this.night.value = 1 - smooth(-6, 4, sun.elevation);
    this.starU.uStars.value = 1 - smooth(-14, -6, sun.elevation);
    const rt = this.pmrem.fromScene(this.envScene, 0, 0.1, 1000);
    if (this.envRT) this.envRT.dispose();
    this.envRT = rt;
    this.scene.environment = rt.texture;
    return true;
  }
}
