// Light points: a few pixels across whatever the distance, brighter than white so that where the tier
// has a glow pass they bloom; pulled a little toward the eye so that one mounted on a surface is not
// lost in it; blinking where they are given a period. The Ring's thousands and the craft's few. GPLv3.

import * as THREE from 'three';

// uniforms: { uTime, uPixelRatio, uDaylight } shared objects ({ value }), so one update reaches all.
export function lightsMaterial(uniforms) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: uniforms.uTime, uPixelRatio: uniforms.uPixelRatio, uDaylight: uniforms.uDaylight },
    vertexShader: /* glsl */ `
      attribute vec3 colour;
      attribute float size;
      attribute vec3 blink;     // period s, phase, the share of it lit; period 0: steady
      attribute float night;    // 1: a window or a lamp, dimmer in the Sun
      uniform float uTime;
      uniform float uPixelRatio;
      uniform float uDaylight;
      varying vec3 vColour;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float d = max(length(mv.xyz), 0.5);
        mv.xyz *= 1.0 - min(0.5, (0.3 + 0.004 * d) / d);
        float on = blink.x > 0.0 ? step(fract(uTime / blink.x + blink.y), blink.z) : 1.0;
        vColour = colour * on * mix(1.0, mix(1.0, 0.25, uDaylight), night);
        gl_PointSize = max(1.0, size * clamp(pow(2000.0 / d, 0.35), 0.75, 3.0)) * uPixelRatio;
        gl_Position = projectionMatrix * mv;
        if (on < 0.5) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vColour;
      void main() {
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        float r2 = dot(p, p);
        if (r2 > 1.0) discard;
        gl_FragColor = vec4(vColour * exp(-r2 * 5.0), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}

// list: [{ p: [x, y, z], c: [r, g, b], size: px, blink: [period, phase, duty] | null, night: bool }]
export function lightPoints(list, material) {
  const n = list.length, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n);
  const blink = new Float32Array(n * 3), night = new Float32Array(n);
  list.forEach((l, i) => {
    pos.set(l.p, i * 3);
    col.set(l.c, i * 3);
    size[i] = l.size || 2;
    if (l.blink) blink.set(l.blink, i * 3);
    night[i] = l.night ? 1 : 0;
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('colour', new THREE.BufferAttribute(col, 3));
  g.setAttribute('size', new THREE.BufferAttribute(size, 1));
  g.setAttribute('blink', new THREE.BufferAttribute(blink, 3));
  g.setAttribute('night', new THREE.BufferAttribute(night, 1));
  const p = new THREE.Points(g, material);
  p.frustumCulled = false;
  p.renderOrder = 2;
  return p;
}
