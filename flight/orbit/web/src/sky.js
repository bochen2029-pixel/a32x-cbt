// sky.js — the Sun, the Moon and the stars where they are at the flight's date and time (orbit_sky.h,
// core/sky.cpp), drawn in the far pass. GPLv3.
//
// The date: 12 November 2026 at 19:00 UTC unless ?date= gives another (2026-12-24T03:00Z; UTC unless a
// zone is written), set in the core before the first frame; a date the core does not take stops the page
// and says why. The sky moves with the flight's clock from there.
//
// The Moon: a sphere drawn 80,000 km out along the line to it, at the size that keeps its true angular
// size (the far pass ends at 100,000 km), turned as the core says, its near side painted from the
// Gazetteer's maria and craters (moon-face.js) and lit by the Sun at its true phase, with the Earth's
// light on its night side. It is drawn after the stars and before the Earth and its sky, which hide it
// below the horizon and behind the Earth and blend the day's blue over it. N looks at it through a
// telescope. The Sun: from orbit, a glare round the disc the sky pass draws, dimmed and reddened where
// its light grazes the air, gone behind the Earth. The stars: Wikidata's to V 6.5 (data/stars.js) at
// their J2000.0 places, turned by the core's sidereal time, precession and nutation; they take the place
// of earth.js's made-up field.

import * as THREE from 'three';
import { STARS } from '../data/stars.js';
import { RE, add, dot, inSight, scale, sub, three, unit } from './frames.js';
import { ALBEDO_SCALE, paintMoon } from './moon-face.js';
import {
  SKY, STAR_PACK, azEl, earthshine, epochOf, formatDate, grazingLight, moonAxes, moonCentre, moonSeen, phaseLaw, starTint, sunClear,
} from './sky-model.js';

const MOON_AT = 8e7;          // m: where the Moon is drawn, inside the far pass
const STARS_AT = 9.5e7;       // m: the stars' sphere
const SUN_LIGHT = 22.0;       // the Sun's light on the scale earth.js draws the ground with
// The Moon is shown as an eye adapted to it sees it, with an exposure of its own and, on the low tier, no
// tone curve, so its face keeps its contrast: the full Moon's highlands at three quarters of white, its
// maria under half. On medium and high the frame is HDR, tone-mapped once by pipeline.js's AgX pass,
// which takes the Moon and the glare with it (toneMapped: false only counts when drawing to the canvas).
const MOON_EXPOSURE = 0.675;
const PHASE_EYE = 0.35;       // its fall with phase, taken at this power: an eye adapted to a crescent sees it brighter
const EARTHSHINE_LIFT = 250;  // earthshine, lifted from its true 1e-4 of sunlight so the night side shows, against a dark sky only
const RELIEF = 1.6;           // the relief map's slopes, steepened a little where the map is coarser than the ground
const TELESCOPE_FOV = 1.4;    // deg, the view through the telescope: the Moon a third of the height

const MOON_VERTEX = /* glsl */ `
  varying vec3 vBody;
  void main() {
    vBody = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const MOON_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform sampler2D uAlbedo;
  uniform sampler2D uSlopes;
  uniform vec3 uSun;       // toward the Sun, the Moon's own axes (x the near side's middle, y east, z north)
  uniform vec3 uEye;       // toward the eye
  uniform vec3 uEarth;     // toward the Earth's centre
  uniform float uLight;    // sunlight's radiance on a surface of albedo 1 at the phase drawn
  uniform float uShine;    // earthshine's
  uniform float uRelief;
  varying vec3 vBody;
  const float PI = 3.14159265;
  void main() {
    vec3 p = normalize(vBody);
    float lat = asin(clamp(p.z, -1.0, 1.0)), lon = atan(p.y, p.x);
    vec2 uv = vec2(lon / (2.0 * PI) + 0.5, 0.5 - lat / PI);
    vec3 albedo = texture2D(uAlbedo, uv).rgb * ${ALBEDO_SCALE.toFixed(2)};
    vec2 slope = (texture2D(uSlopes, uv).rg * 255.0 - 127.5) / 127.5 * uRelief;
    vec3 east = vec3(-sin(lon), cos(lon), 0.0), north = vec3(-sin(lat) * cos(lon), -sin(lat) * sin(lon), cos(lat));
    vec3 n = normalize(p - slope.x * east - slope.y * north);
    // Lommel and Seeliger: cos i / (cos i + cos e), the incidence on the ground's own slope; no light
    // a little past the smooth globe's terminator, where peaks would still catch it
    float mu0 = max(dot(n, uSun), 0.0), mu = max(dot(p, uEye), 0.02);
    float lit = 2.0 * mu0 / (mu0 + mu) * smoothstep(-0.05, 0.01, dot(p, uSun));
    float shine = max(dot(p, uEarth), 0.0);
    vec3 colour = albedo * (uLight * lit + uShine * shine);   // display values: its own exposure, no tone curve
    gl_FragColor = vec4(min(colour, vec3(1.0)), 1.0);
    #include <colorspace_fragment>
  }
`;

const GLARE_VERTEX = /* glsl */ `
  varying vec2 vNdc;
  void main() {
    vNdc = position.xy;
    gl_Position = vec4(position.xy, 1.0, 1.0);
  }
`;

// The Sun's glare, over the far pass: what a lens and an eye make of a disc a hundred thousand times
// brighter than anything else in view. A core a little wider than the disc, a glow and a halo that fall
// off over a few degrees, a faint veil, four faint spikes and two ghosts along the line through the
// view's middle. Display values, added after the tone curve on the low tier (on medium and high the AgX pass takes them too).
const GLARE_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform mat4 uInvProj;
  uniform mat4 uCamWorld;
  uniform vec3 uSunDir;     // three.js axes
  uniform vec3 uTint;
  uniform float uStrength;
  uniform vec2 uSunNdc;     // where the Sun is on the screen; spikes and ghosts only when it is
  uniform float uOnScreen;
  uniform float uAspect;
  varying vec2 vNdc;
  void main() {
    vec4 v = uInvProj * vec4(vNdc, 1.0, 1.0);
    vec3 d = normalize(mat3(uCamWorld) * (v.xyz / v.w));
    float th = 2.0 * asin(clamp(0.5 * length(d - uSunDir), 0.0, 1.0));   // rad from the Sun's centre
    float core = smoothstep(0.0072, 0.0042, th);
    float glow = 0.75 * exp(-th / 0.009) + 0.3 / (1.0 + (th / 0.028) * (th / 0.028)) + 0.04 * exp(-th / 0.22);
    vec2 off = (vNdc - uSunNdc) * vec2(uAspect, 1.0);
    float ang = atan(off.y, off.x + 1e-6);
    float spikes = uOnScreen * pow(abs(cos(2.0 * ang + 0.35)), 60.0) * 0.22 * exp(-th / 0.05);
    float ghosts = 0.0;
    vec3 ghostTint = vec3(0.0);
    if (uOnScreen > 0.0) {
      vec2 g1 = (vNdc + uSunNdc * 0.45) * vec2(uAspect, 1.0), g2 = (vNdc + uSunNdc * 1.15) * vec2(uAspect, 1.0);
      float a1 = smoothstep(0.075, 0.06, length(g1)) * 0.035, a2 = smoothstep(0.16, 0.1, length(g2)) * 0.022;
      ghostTint = vec3(0.55, 0.9, 0.7) * a1 + vec3(0.75, 0.6, 1.0) * a2;
    }
    vec3 colour = uTint * uStrength * (core * 1.6 + glow + spikes) + uStrength * uOnScreen * ghostTint;
    gl_FragColor = vec4(colour, 1.0);
  }
`;

const STAR_VERTEX = /* glsl */ `
  attribute float aMag;
  attribute vec3 aTint;
  uniform float uPixel;
  uniform float uSeen;
  varying vec3 vColour;
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    // brightness as the eye ranks it, about the square root of the light (a display value), and the
    // brightest a little larger: V 6 faint, V 2 bright, Sirius a small blaze
    float light = pow(10.0, -0.4 * (aMag - 1.5));
    float size = 1.4 + max(0.0, 2.0 - 0.55 * aMag);
    gl_PointSize = size * uPixel;
    vColour = aTint * clamp(0.95 * pow(light, 0.45), 0.14, 1.0) * uSeen;
  }
`;

const STAR_FRAGMENT = /* glsl */ `
  varying vec3 vColour;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float a = exp(-dot(c, c) * 12.0);
    gl_FragColor = vec4(vColour * a, 1.0);
  }
`;

const D2R = Math.PI / 180;
const clamp01 = (v) => Math.min(1, Math.max(0, v));

function basis(m, x, y, z, s, at) {   // a Matrix4 from three.js columns, a scale and a place
  m.set(x[0] * s, y[0] * s, z[0] * s, at[0], x[1] * s, y[1] * s, z[1] * s, at[1], x[2] * s, y[2] * s, z[2] * s, at[2], 0, 0, 0, 1);
}

function inAxes(v, a) { return [dot(v, a.x), dot(v, a.y), dot(v, a.z)]; }

export const sky = {
  name: 'sky',
  telescope: false,

  init(ctx) {
    const m = ctx.core.m;
    if (typeof m._oc_sky_out !== 'function') throw new Error('the flight core has no sky (oc_sky_out): rebuild it');
    const jd = epochOf(typeof location === 'undefined' ? '' : location.search);
    if (jd !== null) {
      if (m._oc_sky_set_epoch(jd) !== 1) throw new Error(`the flight core refused the date ${formatDate(jd)} UTC`);
      m._oc_step(0);   // the readouts again, for the date
    }
    this.k = ctx.core.addBlock('sky', '_oc_sky_out', '_oc_sky_out_len', SKY);

    // the Moon
    const phone = Math.min(window.innerWidth, window.innerHeight) < 600;
    const face = paintMoon(phone || ctx.renderer.capabilities.maxTextureSize < 4096 ? 1024 : 2048);
    const map = (data) => {
      const t = new THREE.DataTexture(data, face.width, face.height, THREE.RGBAFormat, THREE.UnsignedByteType);
      t.colorSpace = THREE.NoColorSpace;
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.ClampToEdgeWrapping;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.generateMipmaps = true;
      t.anisotropy = Math.min(4, ctx.renderer.capabilities.getMaxAnisotropy());
      t.needsUpdate = true;
      return t;
    };
    this.moonUniforms = {
      uAlbedo: { value: map(face.albedo) }, uSlopes: { value: map(face.relief) },
      uSun: { value: new THREE.Vector3(1, 0, 0) }, uEye: { value: new THREE.Vector3(1, 0, 0) }, uEarth: { value: new THREE.Vector3(1, 0, 0) },
      uLight: { value: 1 }, uShine: { value: 0 }, uRelief: { value: RELIEF },
    };
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 48), new THREE.ShaderMaterial({
      vertexShader: MOON_VERTEX, fragmentShader: MOON_FRAGMENT, uniforms: this.moonUniforms,
      transparent: true, depthWrite: false, depthTest: true, blending: THREE.NormalBlending, toneMapped: false,
    }));
    this.moon.matrixAutoUpdate = false;
    this.moon.frustumCulled = false;
    this.moon.renderOrder = 2;   // after the stars, before the Earth and its sky (10)

    // the Sun's glare
    this.glareUniforms = {
      uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uTint: { value: new THREE.Color(1, 1, 1) }, uStrength: { value: 0 }, uSunNdc: { value: new THREE.Vector2() }, uOnScreen: { value: 0 },
      uAspect: { value: 1 },
    };
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.glare = new THREE.Mesh(tri, new THREE.ShaderMaterial({
      vertexShader: GLARE_VERTEX, fragmentShader: GLARE_FRAGMENT, uniforms: this.glareUniforms,
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, toneMapped: false,
    }));
    this.glare.frustumCulled = false;
    this.glare.renderOrder = 20;   // over the Earth and its sky

    // the stars, in place of earth.js's made-up field
    const st = STAR_PACK.unpack(STARS);
    const pos = new Float32Array(st.count * 3), tint = new Float32Array(st.count * 3);
    for (let i = 0; i < st.count; i++) {
      const c = Math.cos(st.dec[i]);
      pos.set([c * Math.cos(st.ra[i]) * STARS_AT, c * Math.sin(st.ra[i]) * STARS_AT, Math.sin(st.dec[i]) * STARS_AT], i * 3);
      tint.set(starTint(st.bv[i]), i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aMag', new THREE.BufferAttribute(st.v, 1));
    g.setAttribute('aTint', new THREE.BufferAttribute(tint, 3));
    this.starUniforms = { uPixel: { value: ctx.renderer.getPixelRatio() }, uSeen: { value: 1 } };
    this.stars = new THREE.Points(g, new THREE.ShaderMaterial({
      vertexShader: STAR_VERTEX, fragmentShader: STAR_FRAGMENT, uniforms: this.starUniforms,
      transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending,
    }));
    this.stars.matrixAutoUpdate = false;
    this.stars.frustumCulled = false;
    this.stars.renderOrder = 0;
    if (ctx.stars && ctx.stars.points) ctx.stars.points.removeFromParent();
    ctx.far.add(this.stars, this.moon, this.glare);
    this.pole = [0, Math.cos(ctx.START.lat * D2R), Math.sin(ctx.START.lat * D2R)];   // the Earth's axis, site frame
    this.fov = ctx.camera.fov;
  },

  command(c, ctx) {
    if (c !== 'moon') return false;
    if (ctx.walk && ctx.walk.v.on) return false;   // walking, F drops a ball: the walk's key, not the telescope's
    this.telescope = !this.telescope;
    if (this.telescope) {
      const k = this.k, clear = inSight(ctx.cam || [0, 0, 0], moonCentre(k), 0);
      ctx.say(clear ? `The Moon, ${(k.moonLit * 100).toFixed(0)}% lit, through a telescope` : 'The Moon is below the horizon');
    } else ctx.say('The telescope away');
    return true;
  },

  update(ctx) {
    const k = this.k, cam = ctx.cam, camera = ctx.camera;
    const up = unit(add(cam, [0, 0, RE]));
    const sunSite = [k.sunE, k.sunN, k.sunU];
    const thin = clamp01((ctx.alt - 20000) / 60000);

    // the Moon: where it is from the eye, at the drawn distance, turned and lit
    const seen = moonSeen(k, cam, MOON_AT), axes = moonAxes(k);
    const moonDir = [k.moonE, k.moonN, k.moonU];
    const toSun = unit(sub(scale(sunSite, k.sunDist), scale(moonDir, k.moonDist)));   // from the Moon, both from the Earth's centre
    const toEye = scale(seen.dir, -1), toEarth = scale(moonDir, -1);
    basis(this.moon.matrix, three(axes.x), three(axes.y), three(axes.z), seen.drawRadius, three(scale(seen.dir, MOON_AT)));
    this.moon.matrixWorldNeedsUpdate = true;
    const u = this.moonUniforms;
    u.uSun.value.set(...inAxes(toSun, axes));
    u.uEye.value.set(...inAxes(toEye, axes));
    u.uEarth.value.set(...inAxes(toEarth, axes));
    const alpha = Math.acos(Math.max(-1, Math.min(1, dot(toSun, toEye))));   // the phase angle at this eye
    // as an eye sees it: adapted to the Moon, not to the bright Earth a camera is exposed for above the
    // air; and the night side's earthshine only against a dark sky, as the stars
    const dark = Math.max(thin, clamp01(-dot(sunSite, up) * 6 - 0.3));
    u.uLight.value = (SUN_LIGHT / Math.PI) * phaseLaw(alpha) ** PHASE_EYE * MOON_EXPOSURE;
    u.uShine.value = (SUN_LIGHT / Math.PI) * earthshine(k) * EARTHSHINE_LIFT * dark * MOON_EXPOSURE;
    this.seen = { moon: seen, alpha, up };

    // the stars: their J2000.0 axes from the core, faded by day as earth.js's were
    const X = three([k.j2000Xe, k.j2000Xn, k.j2000Xu]), Y = three([k.j2000Ye, k.j2000Yn, k.j2000Yu]), Z = three([k.j2000Ze, k.j2000Zn, k.j2000Zu]);
    basis(this.stars.matrix, X, Y, Z, 1, [0, 0, 0]);
    this.stars.matrixWorldNeedsUpdate = true;
    this.starUniforms.uSeen.value = dark;
    this.starUniforms.uPixel.value = ctx.renderer.getPixelRatio();
    this.stars.visible = dark > 0.01;
    if (ctx.stars && ctx.stars.points && ctx.stars.points.parent) ctx.stars.points.removeFromParent();

    // the telescope: the view turned to the Moon and narrowed, the craft out of the way
    if (this.telescope) {
      camera.up.set(...three(up));
      camera.lookAt(new THREE.Vector3(...three(seen.dir)));
      camera.fov = TELESCOPE_FOV;
      camera.updateMatrixWorld();
      if (ctx.craft) ctx.craft.group.visible = false;
    } else if (camera.fov !== this.fov) camera.fov = this.fov;
    camera.updateProjectionMatrix();

    // the Sun's glare: how much of its disc clears the Earth, how much air its light grazes, how high
    const sc = sunClear(cam, sunSite, k.sunDist);
    const air = grazingLight(sc.height);
    const space = clamp01((ctx.alt - 15000) / 45000);
    const strength = sc.clear * air[1] * space;
    const g = this.glareUniforms;
    this.glare.visible = strength > 0.002;
    if (this.glare.visible) {
      const sun = three(sunSite);
      g.uSunDir.value.set(...sun);
      const top = Math.max(air[0], air[1], air[2]);
      g.uTint.value.setRGB(air[0] / top, (air[1] / top) * 0.97, (air[2] / top) * 0.92);
      g.uStrength.value = strength;
      camera.updateMatrixWorld();
      g.uInvProj.value.copy(camera.projectionMatrixInverse);
      g.uCamWorld.value.copy(camera.matrixWorld);
      const p = new THREE.Vector3(...sun).applyMatrix4(camera.matrixWorldInverse);
      const ndc = new THREE.Vector3(...sun).multiplyScalar(1e6).project(camera);
      const on = p.z < 0 && Math.abs(ndc.x) < 1.3 && Math.abs(ndc.y) < 1.3;
      g.uOnScreen.value = on ? 1 : 0;
      g.uSunNdc.value.set(on ? ndc.x : 0, on ? ndc.y : 0);
      g.uAspect.value = camera.aspect;
    }
  },

  hud(ctx) {
    const k = this.k;
    if (!k || !this.seen) return [];
    const sun = azEl([k.sunE, k.sunN, k.sunU], this.seen.up, this.pole), moon = azEl(this.seen.moon.dir, this.seen.up, this.pole);
    const waxing = k.moonElong < Math.PI ? 'waxing' : 'waning';
    return [
      `UTC ${formatDate(k.jd)}`,
      `SUN ${sun.el >= 0 ? '+' : '−'}${Math.abs(sun.el).toFixed(0)}°  MOON ${moon.el >= 0 ? '+' : '−'}${Math.abs(moon.el).toFixed(0)}° ${(k.moonLit * 100).toFixed(0)}% ${waxing}`,
    ];
  },
};
