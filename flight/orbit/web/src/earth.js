// The Earth and its sky, drawn as one full-screen pass: each pixel's ray is intersected with the sphere
// exactly (no mesh, so it is as round at 3 m as at 3,000 km), coloured from Natural Earth's coastlines
// (data/land.js) and shaded through a single-scattering atmosphere. And the stars behind it. GPLv3.
//
// Painted by code: the coastlines are real, the land's colours and the clouds are this project's
// estimate (docs/provenance.md, 1h).

import * as THREE from 'three';
import { RE } from './frames.js';
import { paintMask } from './land.js';

const VERTEX = /* glsl */ `
  varying vec2 vNdc;
  void main() {
    vNdc = position.xy;
    gl_Position = vec4(position.xy, 1.0, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  precision highp float;
  uniform mat4 uInvProj;
  uniform mat4 uCamWorld;
  uniform vec3 uCamFwd;
  uniform vec3 uEarthC;      // the Earth's centre from the eye, m, three.js axes
  uniform float uAlt;        // the eye's height above the sphere, from doubles
  uniform vec3 uSun;
  uniform mat3 uToEcef;
  uniform sampler2D uLand;
  uniform float uTexel;      // m per texel of the mask at the equator
  uniform float uPixelAngle;
  uniform float uNear;
  uniform float uFar;
  uniform float uClouds;
  uniform float uGain;       // a camera's exposure for the Earth: lower above the air, where clouds are the brightest thing
  uniform int uDebug;
  uniform vec3 uSiteUp;      // the start point, Earth-fixed: the day is clear there, as a launch needs
  varying vec2 vNdc;

  const float RE = ${RE.toFixed(1)};
  const float RA = ${(RE + 100000).toFixed(1)};
  const float PI = 3.14159265;
  const vec3 BR = vec3(5.8e-6, 13.5e-6, 33.1e-6);
  const float BM = 21e-6;
  const float HR = 8000.0;
  const float HM = 1200.0;
  const float SUN = 22.0;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise(vec3 x) {
    vec3 i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p, int octaves) {
    float a = 0.5, s = 0.0;
    for (int i = 0; i < 6; i++) {
      if (i >= octaves) break;
      s += a * noise(p);
      p = p * 2.03 + vec3(17.0, 5.0, 11.0);
      a *= 0.5;
    }
    return s;
  }
  float box(float lat, float lon, vec4 b, float soft) {   // b: lat0, lat1, lon0, lon1
    return smoothstep(b.x - soft, b.x + soft, lat) * (1.0 - smoothstep(b.y - soft, b.y + soft, lat))
         * smoothstep(b.z - soft, b.z + soft, lon) * (1.0 - smoothstep(b.w - soft, b.w + soft, lon));
  }

  // Optical depth from p (from the Earth's centre) toward the Sun, Rayleigh and Mie; large in shadow.
  vec2 sunDepth(vec3 p) {
    float b = dot(p, uSun), pp = dot(p, p);
    float dE = b * b - (pp - RE * RE);
    if (b < 0.0 && dE > 0.0) return vec2(1e9);
    float tTop = -b + sqrt(max(b * b - (pp - RA * RA), 0.0));
    vec2 od = vec2(0.0);
    float ds = tTop / 4.0;
    for (int i = 0; i < 4; i++) {
      float h = length(p + uSun * (ds * (float(i) + 0.5))) - RE;
      od += vec2(exp(-h / HR), exp(-h / HM)) * ds;
    }
    return od;
  }
  vec3 extinction(vec2 od) { return exp(-(BR * od.x + BM * 1.1 * od.y)); }

  // Noise finer than a pixel is faded to its mean, so far ground does not shimmer into stripes.
  float detail(vec3 q, float size, float foot, int octaves) {
    return mix(fbm(q / size, octaves), 0.47, smoothstep(size * 0.15, size * 0.6, foot));
  }

  vec3 landColour(float lat, float lon, vec3 q, float foot) {
    float n1 = detail(q, 90000.0, foot, 4), n2 = detail(q + 31000.0, 7000.0, foot, 4), n3 = detail(q + 7000.0, 700.0, foot, 3);
    vec3 forest = vec3(0.035, 0.06, 0.028), grass = vec3(0.095, 0.105, 0.052), dry = vec3(0.19, 0.16, 0.10);
    vec3 desert = vec3(0.34, 0.27, 0.18), tundra = vec3(0.16, 0.15, 0.13), ice = vec3(0.78, 0.82, 0.88);
    float a = abs(lat);
    // wet near the equator and in the forests of the north; dry in the subtropics and in the boxes below
    float arid = 0.35 * smoothstep(12.0, 22.0, a) * (1.0 - smoothstep(31.0, 38.0, a));
    arid = max(arid, box(lat, lon, vec4(16.0, 31.0, -17.0, 33.0), 3.0));    // Sahara
    arid = max(arid, box(lat, lon, vec4(13.0, 31.0, 34.0, 60.0), 3.0));     // Arabia
    arid = max(arid, box(lat, lon, vec4(24.0, 38.0, 50.0, 72.0), 3.0) * 0.8);   // Iran, Thar
    arid = max(arid, box(lat, lon, vec4(36.0, 46.0, 75.0, 112.0), 3.0) * 0.85); // Taklamakan, Gobi
    arid = max(arid, box(lat, lon, vec4(-31.0, -19.0, 116.0, 141.0), 3.0)); // Australia's interior
    arid = max(arid, box(lat, lon, vec4(26.0, 38.0, -118.0, -104.0), 2.5) * 0.9); // the US south-west
    arid = max(arid, box(lat, lon, vec4(28.0, 42.0, -105.0, -98.5), 2.0) * 0.55); // the plains, in November
    arid = max(arid, box(lat, lon, vec4(-28.0, -17.0, 12.0, 25.0), 2.5) * 0.85); // Namib, Kalahari
    arid = max(arid, box(lat, lon, vec4(-30.0, -17.0, -72.0, -67.0), 1.5));  // Atacama
    arid = max(arid, box(lat, lon, vec4(-52.0, -38.0, -72.0, -64.0), 2.0) * 0.7); // Patagonia
    arid = clamp(arid + (n1 - 0.5) * 0.5, 0.0, 1.0);
    float boreal = smoothstep(48.0, 55.0, lat) * (1.0 - smoothstep(64.0, 70.0, lat));
    float tropic = 1.0 - smoothstep(8.0, 16.0, a);
    float woods = smoothstep(0.5, 0.62, detail(q + 5000.0, 2500.0, foot, 4));   // woods and fields, kilometres across
    vec3 c = mix(grass, forest, clamp(tropic + boreal * 0.8 + (n2 - 0.5) * 0.6 + woods * 0.7, 0.0, 1.0));
    c = mix(c, mix(dry, desert, smoothstep(0.55, 0.9, arid)), smoothstep(0.25, 0.7, arid));
    c = mix(c, tundra, smoothstep(62.0, 70.0, lat));
    float iced = max(max(1.0 - smoothstep(-64.0, -60.0, lat), smoothstep(73.0, 80.0, lat)),
                     box(lat, lon, vec4(60.5, 84.0, -73.0, -12.0), 2.0) * smoothstep(0.35, 0.5, n2 + 0.2));
    c = mix(c, ice, clamp(iced, 0.0, 1.0));
    return c * (0.7 + 0.6 * n2) * (0.8 + 0.4 * n3);
  }

  float cloudCover(float lat) {
    float a = abs(lat);
    return 0.50 - 0.13 * exp(-pow((lat - 6.0) / 7.0, 2.0)) + 0.10 * exp(-pow((a - 24.0) / 7.0, 2.0))
                - 0.09 * exp(-pow((a - 52.0) / 11.0, 2.0));
  }

  void main() {
    vec4 v = uInvProj * vec4(vNdc, 1.0, 1.0);
    vec3 d = normalize(mat3(uCamWorld) * (v.xyz / v.w));
    vec3 o = -uEarthC;
    float b = dot(o, d);
    float cE = uAlt * (2.0 * RE + uAlt);   // |o|^2 - RE^2, from doubles
    float discE = b * b - cE;
    float tEarth = -1.0;
    if (cE > 0.0 && b < 0.0 && discE > 0.0) tEarth = cE / (-b + sqrt(discE));
    float cA = (uAlt - (RA - RE)) * (RE + RA + uAlt);
    float discA = b * b - cA;

    vec3 inscatter = vec3(0.0), T = vec3(1.0);
    if (discA > 0.0) {
      float sq = sqrt(discA);
      float t0 = max(0.0, -b - sq), t1 = -b + sq;
      if (tEarth > 0.0) t1 = tEarth;
      if (t1 > t0) {
        const int N = 10;
        float L = t1 - t0;
        vec2 od = vec2(0.0);
        vec3 sumR = vec3(0.0), sumM = vec3(0.0);
        for (int i = 0; i < N; i++) {
          float s0 = float(i) / float(N), s1 = float(i + 1) / float(N);
          float t = t0 + L * (0.5 * (s0 * s0 + s1 * s1));
          float ds = L * (s1 * s1 - s0 * s0);
          vec3 p = o + d * t;
          float h = max(length(p) - RE, 0.0);
          vec2 dens = vec2(exp(-h / HR), exp(-h / HM));
          od += dens * ds * 0.5;
          vec3 att = extinction(od + sunDepth(p));
          od += dens * ds * 0.5;
          sumR += dens.x * ds * att;
          sumM += dens.y * ds * att;
        }
        float mu = dot(d, uSun), g = 0.76;
        float phR = 3.0 / (16.0 * PI) * (1.0 + mu * mu);
        float phM = 3.0 / (8.0 * PI) * ((1.0 - g * g) * (1.0 + mu * mu)) / ((2.0 + g * g) * pow(1.0 + g * g - 2.0 * g * mu, 1.5));
        inscatter = SUN * (1.15 * sumR * BR * phR + sumM * BM * phM);   // 1.15: the light scattered more than once, roughly
        T = extinction(od);
      }
    }

    vec3 colour;
    float alpha;
    if (tEarth > 0.0) {
      vec3 P = o + d * tEarth;
      vec3 n = normalize(P);
      vec3 e = uToEcef * n;
      float lat = asin(clamp(e.z, -1.0, 1.0)), lon = atan(e.y, e.x);
      vec2 uv = vec2(lon / (2.0 * PI) + 0.5, 0.5 - lat / PI);
      float foot = tEarth * uPixelAngle / max(abs(dot(n, d)), 0.12);
      float lod = log2(max(foot / uTexel, 1.0));
      float mask = textureLod(uLand, uv, lod).r;
      float shelf = textureLod(uLand, uv, lod + 3.0).r;
      vec3 q = e * RE;
      float coast = detail(q, 6000.0, foot, 4);
      float land = smoothstep(0.38, 0.62, mask + (coast - 0.5) * 0.3);
      float latD = degrees(lat), lonD = degrees(lon);
      vec3 water = mix(vec3(0.006, 0.022, 0.055), vec3(0.02, 0.085, 0.12), smoothstep(0.02, 0.6, shelf));
      vec3 albedo = mix(water, landColour(latD, lonD, q, foot), land);
      float ndl = dot(n, uSun);
      vec3 sunT = extinction(sunDepth(P + n * 2.0));
      float lit = smoothstep(-0.02, 0.06, ndl);
      vec3 sky = vec3(0.10, 0.16, 0.28) * smoothstep(-0.15, 0.25, ndl);
      vec3 ground = albedo * (SUN * sunT * max(ndl, 0.0) * lit / PI + sky);
      // the Sun's glint on water
      vec3 h = normalize(uSun - d);
      float fres = 0.02 + 0.98 * pow(1.0 - max(dot(-d, n), 0.0), 5.0);
      ground += (1.0 - land) * SUN * sunT * lit * pow(max(dot(n, h), 0.0), 400.0) * (1.5 + 6.0 * fres);
      // clouds, painted on the ground from above; none seen from the runway
      float cov = cloudCover(latD) + 0.3 * (1.0 - smoothstep(6.0e5, 1.6e6, acos(clamp(dot(e, uSiteUp), -1.0, 1.0)) * RE));
      float cl = fbm(e * 5.0 + vec3(3.1, 1.7, 0.2), 5) + 0.2 * (fbm(e * 40.0, 4) - 0.5);
      float cloud = smoothstep(cov + 0.06, cov + 0.22, cl) * uClouds * 0.9;
      vec3 cloudLit = vec3(0.62) * (SUN * sunT * max(ndl, 0.0) * lit / PI + sky * 1.5);
      ground = mix(ground, cloudLit, cloud * 0.85);
      colour = ground * T + inscatter;
      if (uDebug == 1) colour = albedo * 3.0;
      if (uDebug == 2) colour = inscatter;
      if (uDebug == 3) colour = vec3(mask, land, cloud);
      if (uDebug == 4) colour = ground;
      alpha = 0.0;
      float zv = max(tEarth * dot(d, uCamFwd), uNear);
      gl_FragDepth = clamp(((uFar + uNear) / (uFar - uNear) - 2.0 * uFar * uNear / ((uFar - uNear) * zv)) * 0.5 + 0.5, 0.0, 1.0);
    } else {
      float mu = dot(d, uSun);
      float disc = smoothstep(0.999986, 0.999990, mu);
      colour = inscatter + T * SUN * (disc * 60.0 + 0.04 * pow(max(mu, 0.0), 800.0));
      alpha = dot(T, vec3(0.333));
      gl_FragDepth = 1.0;
    }
    gl_FragColor = vec4(colour * uGain, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class Earth {
  constructor({ maskWidth = 4096, siteUp = [1, 0, 0] } = {}) {
    const mask = new THREE.CanvasTexture(paintMask(maskWidth));
    mask.flipY = false;
    mask.colorSpace = THREE.NoColorSpace;
    mask.wrapS = THREE.RepeatWrapping;
    mask.wrapT = THREE.ClampToEdgeWrapping;
    mask.minFilter = THREE.LinearMipmapLinearFilter;
    mask.generateMipmaps = true;
    this.uniforms = {
      uInvProj: { value: new THREE.Matrix4() },
      uCamWorld: { value: new THREE.Matrix4() },
      uCamFwd: { value: new THREE.Vector3() },
      uEarthC: { value: new THREE.Vector3() },
      uAlt: { value: 0 },
      uSun: { value: new THREE.Vector3(0, 1, 0) },
      uToEcef: { value: new THREE.Matrix3() },
      uLand: { value: mask },
      uTexel: { value: (2 * Math.PI * RE) / maskWidth },
      uPixelAngle: { value: 0.001 },
      uNear: { value: 1 },
      uFar: { value: 1e8 },
      uClouds: { value: 0 },
      uGain: { value: 1 },
      uDebug: { value: 0 },
      uSiteUp: { value: new THREE.Vector3(...siteUp) },
    };
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: true,
      depthTest: true,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.SrcAlphaFactor,
    });
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
  }

  // camera: placed at the origin and pointed; earthCentre: the Earth's centre from the eye, three.js
  // axes; alt: the eye's height, from doubles; sun: unit, three.js axes; toEcef: {x, y, z} columns.
  update(camera, viewportHeight, earthCentre, alt, sun, toEcef) {
    const u = this.uniforms;
    u.uInvProj.value.copy(camera.projectionMatrixInverse);
    u.uCamWorld.value.copy(camera.matrixWorld);
    camera.getWorldDirection(u.uCamFwd.value);
    u.uEarthC.value.set(earthCentre[0], earthCentre[1], earthCentre[2]);
    u.uAlt.value = alt;
    u.uSun.value.set(sun[0], sun[1], sun[2]);
    const m = toEcef;
    u.uToEcef.value.set(m.x[0], m.y[0], m.z[0], m.x[1], m.y[1], m.z[1], m.x[2], m.y[2], m.z[2]);
    u.uPixelAngle.value = (camera.fov * Math.PI) / 180 / viewportHeight;
    u.uNear.value = camera.near;
    u.uFar.value = camera.far;
    u.uClouds.value = Math.min(1, Math.max(0, (alt - 10000) / 50000));
    u.uGain.value = 1 - 0.45 * Math.min(1, Math.max(0, (alt - 15000) / 60000));
  }
}

// Stars: fixed to the sky, so turned with the inertial frame. Brightness falls with magnitude; a few
// are tinted. A seeded sequence: the same sky every time.
export class Stars {
  constructor(count = 4500, radius = 9e7) {
    let s = 0x2545f491;
    const r = () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9 >>> 0) / 4294967296);
    const pos = new Float32Array(count * 3), col = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const z = 2 * r() - 1, a = 2 * Math.PI * r(), q = Math.sqrt(1 - z * z);
      pos.set([q * Math.cos(a) * radius, q * Math.sin(a) * radius, z * radius], i * 3);
      const mag = Math.pow(r(), 3.5);
      const tint = r();
      const c = 0.25 + 1.6 * mag;
      col.set(tint < 0.12 ? [c, c * 0.8, c * 0.6] : tint < 0.25 ? [c * 0.8, c * 0.88, c] : [c, c, c], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.material = new THREE.PointsMaterial({
      size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 1, depthWrite: false,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.matrixAutoUpdate = false;
    this.points.renderOrder = 0;
  }

  // inertialToThree: the 3x3 that takes an inertial direction to three.js's axes, as {x, y, z} columns
  update(cols, visibility) {
    const m = this.points.matrix;
    m.set(cols.x[0], cols.y[0], cols.z[0], 0, cols.x[1], cols.y[1], cols.z[1], 0, cols.x[2], cols.y[2], cols.z[2], 0, 0, 0, 0, 1);
    this.points.matrixWorldNeedsUpdate = true;
    this.material.opacity = visibility;
    this.points.visible = visibility > 0.01;
  }
}
