// Haze over every surface, and the earth's curve under it. three's own fog is one colour, added after tone
// mapping; this is the sky's colour in each direction, mixed in linear light before tone mapping, through
// the same air the sky was computed for, thicker low down. GPLv3.

import * as THREE from 'three';
import { SKY_GLSL } from './atmosphere.js';

// One set of uniforms for every hazed material, so a change of hour or visibility reaches all of them.
export function hazeUniforms(atmosphere) {
  return {
    uSky: { value: atmosphere.texture },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uBetaR: { value: new THREE.Vector3(5.802e-6, 13.558e-6, 33.1e-6) },
    uBetaM: { value: 4.44e-6 },
    uFieldElev: { value: 171 },
    uCurve: { value: 1 },
    uSkyIrr: { value: new THREE.Color(0.3, 0.35, 0.45) },
    uGroundIrr: { value: new THREE.Color(0.05, 0.05, 0.04) },
  };
}

// Light from the sky and from the ground below, for materials that take no environment map: the same
// irradiance the table integrates, so a Lambert face and the sky above it agree. scale < 1 for a room.
const AMBIENT_GLSL = /* glsl */ `
  vec3 upView = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
  irradiance += mix(uGroundIrr, uSkyIrr, 0.5 + 0.5 * dot(normal, upView)) * uAmbientScale;
`;

export function ambient(material, uniforms, scale = 1) {
  const own = { uAmbientScale: { value: scale } };
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (previous && previous !== THREE.Material.prototype.onBeforeCompile) previous(shader, renderer);
    shader.uniforms.uSkyIrr = uniforms.uSkyIrr;
    shader.uniforms.uGroundIrr = uniforms.uGroundIrr;
    shader.uniforms.uAmbientScale = own.uAmbientScale;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uSkyIrr;\nuniform vec3 uGroundIrr;\nuniform float uAmbientScale;')
      .replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>\n${AMBIENT_GLSL}`);
  };
  const key = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => `${key()}amb${scale}`;
  return material;
}

// The optical depth of air between two heights over a distance, for a density falling off with scale
// height H: exact for a straight ray through an exponential atmosphere over a flat earth.
export const HAZE_GLSL = /* glsl */ `
  ${SKY_GLSL}
  uniform vec3 uBetaR;
  uniform float uBetaM;
  uniform float uFieldElev;
  float hazeColumn(float a, float b, float H) {
    float ea = exp(-a / H), eb = exp(-b / H);
    return abs(b - a) < 1.0 ? ea : H * (ea - eb) / (b - a);
  }
  vec3 hazeTransmittance(vec3 worldPos) {
    float d = distance(worldPos, cameraPosition);
    float a = cameraPosition.y + uFieldElev, b = worldPos.y + uFieldElev;
    return exp(-d * (uBetaR * hazeColumn(a, b, 8000.0) + vec3(uBetaM * hazeColumn(a, b, 1200.0))));
  }
  vec3 hazed(vec3 colour, vec3 worldPos) {
    vec3 T = hazeTransmittance(worldPos);
    vec4 s = texture2D(uSky, skyUV(normalize(worldPos - cameraPosition)));
    vec3 air = s.rgb / max(1.0 - s.a, 0.03);
    return colour * T + air * (1.0 - T);
  }
`;

// The earth falls away from the eye by d^2 / 2R, R stretched by 7/6 for the standard atmosphere's
// refraction: applied to everything fixed to the ground, it puts the horizon where it is and sinks the
// foot of a skyline 26 km away by 45 m, as it is.
export const CURVE_GLSL = /* glsl */ `
  uniform float uCurve;
  vec4 curved(vec4 world) {
    vec2 f = world.xz - cameraPosition.xz;
    world.y -= uCurve * dot(f, f) / 14865667.0;
    return world;
  }
`;

// Patches a three.js material: world position out of the vertex shader (curved if asked), haze in the
// fragment shader just before tone mapping. The material's own lighting is untouched.
export function haze(material, uniforms, { curve = true } = {}) {
  material.fog = false;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vHazeWorld;\n${CURVE_GLSL}`)
      .replace('#include <project_vertex>', /* glsl */ `
        vec4 hazeWorld = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          hazeWorld = instanceMatrix * hazeWorld;
        #endif
        hazeWorld = modelMatrix * hazeWorld;
        ${curve ? 'hazeWorld = curved(hazeWorld);' : ''}
        vHazeWorld = hazeWorld.xyz;
        vec4 mvPosition = viewMatrix * hazeWorld;
        gl_Position = projectionMatrix * mvPosition;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vHazeWorld;\n${HAZE_GLSL}`)
      .replace('#include <tonemapping_fragment>', 'gl_FragColor.rgb = hazed(gl_FragColor.rgb, vHazeWorld);\n#include <tonemapping_fragment>');
  };
  material.customProgramCacheKey = () => `haze${curve ? 'c' : ''}`;
  if (material.isMeshLambertMaterial) ambient(material, uniforms);
  return material;
}
