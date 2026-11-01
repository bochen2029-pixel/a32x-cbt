// Light points, as a calligraphic visual system drew them: a sharp core that stays a point at any range,
// a little halo, directional where the fitting is. What a light shows is decided on the GPU each frame
// from the eye: which side of a bidirectional fitting it is on, whether it is inside the beam, the flash
// of a strobe or of the approach's sequenced flashers. Thousands of them are one draw call. Adapted from
// the visuals study's KDFW mockup (fbw-desktop, 2026-11-01). GPLv3.

import * as THREE from 'three';
import { CURVE_GLSL, HAZE_GLSL } from './haze.js';

// A fitting: where it is, what colour it shows in front of its axis and behind it (null: nothing), how
// wide its beam is, its size in pixels, and how it flashes ([period s, phase s, on fraction]).
export class LightSet {
  constructor() {
    this.p = []; this.c = []; this.b = []; this.a = []; this.beam = []; this.size = []; this.flash = [];
  }

  add(x, y, z, colour, { back = null, axis = null, beam = [0.94, 0.5], size = 2.2, flash = null } = {}) {
    const front = colour || [0, 0, 0], bk = back || [0, 0, 0], ax = axis || [0, 0, 0], f = flash || [0, 0, 0];
    this.p.push(x, y, z);
    this.c.push(front[0], front[1], front[2]);
    this.b.push(bk[0], bk[1], bk[2]);
    this.a.push(ax[0], ax[1], ax[2]);
    this.beam.push(beam[0], beam[1]);
    this.size.push(size);
    this.flash.push(f[0], f[1], f[2]);
    return this;
  }

  get count() {
    return this.size.length;
  }

  // dynamic: the front colours are rewritten each frame (a PAPI's, which turn red and white with the eye)
  build(material, { dynamic = false } = {}) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    const colour = new THREE.Float32BufferAttribute(this.c, 3);
    if (dynamic) colour.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('colour', colour);
    g.setAttribute('colourBack', new THREE.Float32BufferAttribute(this.b, 3));
    g.setAttribute('axis', new THREE.Float32BufferAttribute(this.a, 3));
    g.setAttribute('beam', new THREE.Float32BufferAttribute(this.beam, 2));
    g.setAttribute('size', new THREE.Float32BufferAttribute(this.size, 1));
    g.setAttribute('flash', new THREE.Float32BufferAttribute(this.flash, 3));
    const points = new THREE.Points(g, material);
    points.frustumCulled = false;
    return points;
  }
}

// halo: the sprite's width in cores — 3 on a GPU, less where every pixel is the CPU's. visibilityM: the
// range over which a light dims to a third in the haze. gain: how bright the lights are against the sky.
export function lightMaterial({ halo = 3, visibilityM = 30000, gain = 1, pixelRatio = 1 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uPixelRatio: { value: pixelRatio }, uLightGain: { value: gain }, uHalo: { value: halo },
      uVisibility: { value: visibilityM },
    },
    vertexShader: /* glsl */ `
      attribute vec3 colour;
      attribute vec3 colourBack;
      attribute vec3 axis;
      attribute vec2 beam;
      attribute float size;
      attribute vec3 flash;
      uniform float uTime;
      uniform float uPixelRatio;
      uniform float uLightGain;
      uniform float uHalo;
      uniform float uVisibility;
      varying vec3 vColour;
      varying float vCore;
      varying float vSprite;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vec3 toEye = cameraPosition - w.xyz;
        float d = max(length(toEye), 0.5);
        vec3 e = toEye / d;
        vec3 c = colour;
        float k = 1.0;
        if (dot(axis, axis) > 0.0) {
          vec3 ax = normalize(mat3(modelMatrix) * axis);
          float ca = dot(e, ax);
          c = ca >= 0.0 ? colour : colourBack;
          k = smoothstep(beam.y, beam.x, abs(ca));
        }
        if (flash.x > 0.0) {
          float ph = fract((uTime - flash.y) / flash.x);
          k *= ph < flash.z ? 1.0 : 0.0;
        }
        vColour = c * k * exp(-d / uVisibility) * uLightGain;
        // the core's diameter in pixels: larger near, never under a pixel and a half, so a light stays a
        // sharp point at any range; the sprite carries the halo round it
        vCore = max(size * clamp(pow(900.0 / d, 0.35), 0.6, 2.4), 1.5) * uPixelRatio;
        vSprite = max(vCore * uHalo, 3.0);
        gl_PointSize = vSprite;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vColour;
      varying float vCore;
      varying float vSprite;
      void main() {
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        float r2 = dot(p, p);
        if (r2 > 1.0 || dot(vColour, vColour) < 1e-6) discard;
        float r = sqrt(r2) * vSprite * 0.5;   // pixels from the light's centre
        float core = exp(-1.5 * r * r / (0.25 * vCore * vCore)) * 1.6;
        float halo = exp(-2.5 * r2) * 0.22;
        vec3 col = vColour * (core + halo);
        gl_FragColor = vec4(col / (1.0 + col * 0.15), 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
}

// The GPU tier's material for the same fittings (view.js): each light dimmed by the atmosphere's own
// transmittance (haze.js) rather than a fixed visibility, a PAPI lamp's colour chosen by the eye's
// angle where the fitting carries one, and the logarithmic depth the GPU tier draws with.
export function hazedLightMaterial(uniforms, { curve = true } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...uniforms,
      uTime: uniforms.uTime || { value: 0 },
      uPixelRatio: uniforms.uPixelRatio || { value: 1 },
      uLightGain: uniforms.uLightGain || { value: 1 },
      uHalo: uniforms.uHalo || { value: 3 },
    },
    vertexShader: /* glsl */ `
      #include <common>
      attribute vec3 colour;
      attribute vec3 colourBack;
      attribute vec3 axis;
      attribute vec2 beam;
      attribute float size;
      attribute vec3 flash;
      attribute float papi;
      uniform float uTime;
      uniform float uPixelRatio;
      uniform float uLightGain;
      uniform float uHalo;
      varying vec3 vColour;
      varying float vCore;
      ${CURVE_GLSL}
      ${HAZE_GLSL}
      #include <logdepthbuf_pars_vertex>
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        ${curve ? 'w = curved(w);' : ''}
        vec3 toEye = cameraPosition - w.xyz;
        float d = max(length(toEye), 0.5);
        vec3 e = toEye / d;
        vec3 c = colour;
        float k = 1.0;
        if (dot(axis, axis) > 0.0) {
          vec3 ax = normalize(mat3(modelMatrix) * axis);
          float ca = dot(e, ax);
          c = ca >= 0.0 ? colour : colourBack;
          k = smoothstep(beam.y, beam.x, abs(ca));
        }
        if (papi > 0.0) {
          float elev = degrees(asin(clamp(e.y, -1.0, 1.0)));
          c = mix(vec3(1.0, 0.07, 0.05), vec3(1.0, 0.96, 0.88), smoothstep(papi - 0.04, papi + 0.04, elev));
        }
        if (flash.x > 0.0) {
          float ph = fract((uTime - flash.y) / flash.x);
          k *= ph < flash.z ? 1.0 : 0.0;
        }
        vec3 T = hazeTransmittance(w.xyz);
        vColour = c * k * T * uLightGain;
        float px = size * uPixelRatio * clamp(pow(900.0 / d, 0.35), 0.6, 2.4);
        vCore = px;
        // the sprite carries the halo too: three cores wide, or less where every pixel is the CPU's
        gl_PointSize = max(px * uHalo, 1.0);
        vec4 mv = viewMatrix * w;
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      varying vec3 vColour;
      varying float vCore;
      uniform float uHalo;
      #include <logdepthbuf_pars_fragment>
      void main() {
        #include <logdepthbuf_fragment>
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        float r2 = dot(p, p);
        if (r2 > 1.0 || dot(vColour, vColour) < 1e-6) discard;
        float k = uHalo * uHalo;   // the core the same size in pixels whatever the sprite's
        float core = exp(-r2 * k * 3.33) * 1.6;
        float halo = exp(-r2 * k * 0.55) * 0.22;
        vec3 col = vColour * (core + halo);
        gl_FragColor = vec4(col / (1.0 + col * 0.15), 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
}

// Colours of the fittings, as a viewer sees them (sRGB-ish, not tone mapped: lights are what they are).
