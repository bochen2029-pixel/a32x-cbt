// The Earth and its sky, drawn as one full-screen pass: each pixel's ray is intersected with the sphere
// exactly (no mesh, so it is as round at 3 m as at 3,000 km), coloured from Natural Earth's coastlines
// (data/land.js) and towns (data/places.js), and shaded through a single-scattering atmosphere. And the
// stars behind it. GPLv3.
//
// The Sun lights the ground, the clouds and the air with the irradiance three.js's own Sun has for the
// craft and the Ring, so a white cloud and the craft's white paint are as bright as each other, as they
// are in photographs from orbit. The air: Rayleigh and Mie scattering, ozone's absorption (the blue
// band over an orbital sunset), the Earth's shadow in it. The ground: land by latitude and a few deserts,
// fields near enough to see, a made-up relief shaded by the Sun; the sea's colour, its reflection of the
// sky and the Sun's glint on it by the slopes of its waves (Cox and Munk); a cloud layer 3 km up that
// throws its shadow; the towns' lights on the night side; the airglow's green line at the night limb.
// What it costs is the tier's, by defines (quality.js, earth). Painted by code: the coastlines and the
// towns are real, the land's colours, the relief and the clouds are this project's estimate
// (docs/provenance.md, 1h).

import * as THREE from 'three';
import { RE } from './frames.js';
import { maskBytes, paintLights } from './land.js';

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
  uniform sampler2D uCities;
  uniform float uTexel;      // m per texel of the mask at the equator
  uniform float uCityTexel;  // and of the night lights
  uniform float uPixelAngle;
  uniform float uNear;
  uniform float uFar;
  uniform float uClouds;
  uniform float uGain;       // a camera's exposure for the Earth
  uniform float uSunE;       // the Sun's irradiance, as three.js's Sun lights the craft
  uniform float uCityGain;
  uniform int uDebug;
  uniform vec3 uSiteUp;      // the start point, Earth-fixed: the day is clear there, as a launch needs
  varying vec2 vNdc;

  const float RE = ${RE.toFixed(1)};
  const float RA = ${(RE + 100000).toFixed(1)};
  const float RC = ${(RE + 3000).toFixed(1)};     // the cloud layer
  const float PI = 3.14159265;
  const vec3 BR = vec3(5.8e-6, 13.5e-6, 33.1e-6);
  const float BM = 21e-6;
  const vec3 BO = vec3(0.65e-6, 1.881e-6, 0.085e-6);   // ozone's absorption at its densest
  const float HR = 8000.0;
  const float HM = 1200.0;

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

  // Densities at height h: Rayleigh, Mie, ozone (a layer from 10 to 40 km, densest at 25).
  vec3 density(float h) {
    #if OZONE
      return vec3(exp(-h / HR), exp(-h / HM), max(0.0, 1.0 - abs(h - 25000.0) / 15000.0));
    #else
      return vec3(exp(-h / HR), exp(-h / HM), 0.0);
    #endif
  }
  // Optical depth from p (from the Earth's centre) toward the Sun; large in the Earth's shadow.
  vec3 sunDepth(vec3 p) {
    float b = dot(p, uSun), pp = dot(p, p);
    float dE = b * b - (pp - RE * RE);
    if (b < 0.0 && dE > 0.0) return vec3(1e9);
    float tTop = -b + sqrt(max(b * b - (pp - RA * RA), 0.0));
    vec3 od = vec3(0.0);
    float ds = tTop / float(SUN_STEPS);
    for (int i = 0; i < SUN_STEPS; i++) od += density(length(p + uSun * (ds * (float(i) + 0.5))) - RE) * ds;
    return od;
  }
  vec3 extinction(vec3 od) { return exp(-(BR * od.x + BM * 1.1 * od.y + BO * od.z)); }

  // Noise finer than a pixel is faded to its mean, so far ground does not shimmer into stripes.
  float detail(vec3 q, float size, float foot, int octaves) {
    return mix(fbm(q / size, octaves), 0.47, smoothstep(size * 0.15, size * 0.6, foot));
  }

  vec3 landColour(float lat, float lon, vec3 q, float foot) {
    float n1 = detail(q, 90000.0, foot, OCTAVES), n2 = detail(q + 31000.0, 7000.0, foot, OCTAVES), n3 = detail(q + 7000.0, 700.0, foot, max(2, OCTAVES - 1));
    vec3 forest = vec3(0.03, 0.055, 0.025), grass = vec3(0.085, 0.1, 0.045), dry = vec3(0.17, 0.15, 0.095);
    vec3 desert = vec3(0.36, 0.28, 0.18), red = vec3(0.34, 0.2, 0.11), tundra = vec3(0.15, 0.14, 0.12), ice = vec3(0.78, 0.82, 0.88);
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
    float woods = smoothstep(0.5, 0.62, detail(q + 5000.0, 2500.0, foot, OCTAVES));   // woods and fields, kilometres across
    vec3 c = mix(grass, forest, clamp(tropic + boreal * 0.8 + (n2 - 0.5) * 0.6 + woods * 0.7, 0.0, 1.0));
    vec3 sand = mix(desert, red, smoothstep(0.55, 0.8, n2) * (box(lat, lon, vec4(-31.0, -19.0, 116.0, 141.0), 3.0) + 0.4));
    c = mix(c, mix(dry, sand, smoothstep(0.55, 0.9, arid)), smoothstep(0.25, 0.7, arid));
    c = mix(c, tundra, smoothstep(62.0, 70.0, lat));
    float iced = max(max(1.0 - smoothstep(-64.0, -60.0, lat), smoothstep(73.0, 80.0, lat)),
                     box(lat, lon, vec4(60.5, 84.0, -73.0, -12.0), 2.0) * smoothstep(0.35, 0.5, n2 + 0.2));
    // fields, near enough to tell apart: a patchwork a few hundred metres to a field, faded out when a
    // pixel covers several of them
    vec3 cell = floor(q / 640.0);
    float field = hash(cell * 1.31 + 0.5);
    vec3 crop = mix(vec3(0.75, 0.82, 0.62), vec3(1.25, 1.12, 0.95), field) * (0.85 + 0.3 * hash(cell + 7.0));
    c *= mix(crop, vec3(1.0), clamp(smoothstep(80.0, 300.0, foot) + iced + smoothstep(0.6, 0.9, arid), 0.0, 1.0));
    c = mix(c, ice, clamp(iced, 0.0, 1.0));
    c *= (0.7 + 0.6 * n2) * (0.8 + 0.4 * n3);
    // round KDFW the country is the airfield's grass, olive in November, so where the field's own
    // drawing ends the ground goes on as it was
    float near = 1.0 - smoothstep(20000.0, 90000.0, acos(clamp(dot(normalize(q), uSiteUp), -1.0, 1.0)) * RE);
    return mix(c, vec3(0.19, 0.2, 0.085) * (0.85 + 0.3 * n3) * mix(crop, vec3(1.0), smoothstep(80.0, 300.0, foot)), near);
  }

  float cloudCover(float lat) {
    float a = abs(lat);
    return 0.50 - 0.13 * exp(-pow((lat - 6.0) / 7.0, 2.0)) + 0.10 * exp(-pow((a - 24.0) / 7.0, 2.0))
                - 0.09 * exp(-pow((a - 52.0) / 11.0, 2.0));
  }

  // The clouds at Earth-fixed direction e: how much of the pixel they cover, and how thick they are.
  // Their shapes: noise, swirled by noise, on a cover that follows the latitude's weather; clear round
  // the start, where the launch waits for a clear day.
  vec2 clouds(vec3 e, float foot) {
    float lat = degrees(asin(clamp(e.z, -1.0, 1.0)));
    float cov = cloudCover(lat) + 0.3 * (1.0 - smoothstep(6.0e5, 1.6e6, acos(clamp(dot(e, uSiteUp), -1.0, 1.0)) * RE));
    vec3 w = e * 5.0 + vec3(3.1, 1.7, 0.2);
    w += 0.35 * vec3(noise(e * 9.0 + 4.0), noise(e * 9.0 + 9.0), noise(e * 9.0 + 13.0)) - 0.175;
    float cl = fbm(w, OCTAVES) + 0.22 * (fbm(e * 40.0, max(2, OCTAVES - 1)) - 0.5);
    float cover = smoothstep(cov + 0.04, cov + 0.24, cl);
    return vec2(cover, clamp((cl - cov) * 3.0, 0.0, 1.0));
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
    float SUN = uSunE;

    vec3 inscatter = vec3(0.0), T = vec3(1.0);
    if (discA > 0.0) {
      float sq = sqrt(discA);
      float t0 = max(0.0, -b - sq), t1 = -b + sq;
      if (tEarth > 0.0) t1 = tEarth;
      if (t1 > t0) {
        float L = t1 - t0;
        vec3 od = vec3(0.0);
        vec3 sumR = vec3(0.0), sumM = vec3(0.0);
        // the samples packed toward where the air is: near the eye from low down, near the ground when
        // looking down from above most of it (air.js holds the same two lines to a fine reference)
        bool deep = tEarth > 0.0 && uAlt > HR;
        // from above most of the air, a ray along the limb that misses the ground is densest at its lowest
        // point, tc: the chord split there, each half packed toward it (air.js's 'limb')
        float tc = -b;
        bool limb = tEarth <= 0.0 && uAlt > HR && tc > t0 && tc < t1;
        for (int i = 0; i < VIEW_STEPS; i++) {
          float t, ds;
          if (limb) {
            bool first = i < VIEW_STEPS / 2;
            float m = float(first ? VIEW_STEPS / 2 : VIEW_STEPS - VIEW_STEPS / 2), k = float(first ? i : i - VIEW_STEPS / 2);
            float s0 = k / m, s1 = (k + 1.0) / m, A = first ? t0 : tc, Lh = first ? tc - t0 : t1 - tc;
            float a0 = first ? 1.0 - (1.0 - s0) * (1.0 - s0) : s0 * s0, a1 = first ? 1.0 - (1.0 - s1) * (1.0 - s1) : s1 * s1;
            t = A + Lh * 0.5 * (a0 + a1);
            ds = Lh * (a1 - a0);
          } else {
            float s0 = float(i) / float(VIEW_STEPS), s1 = float(i + 1) / float(VIEW_STEPS);
            float a0 = deep ? 1.0 - (1.0 - s0) * (1.0 - s0) : s0 * s0, a1 = deep ? 1.0 - (1.0 - s1) * (1.0 - s1) : s1 * s1;
            t = t0 + L * 0.5 * (a0 + a1);
            ds = L * (a1 - a0);
          }
          vec3 p = o + d * t;
          vec3 dens = density(max(length(p) - RE, 0.0));
          od += dens * ds * 0.5;
          vec3 att = extinction(od + sunDepth(p));
          od += dens * ds * 0.5;
          sumR += dens.x * ds * att;
          sumM += dens.y * ds * att;
        }
        float mu = dot(d, uSun), g = 0.76;
        float phR = 3.0 / (16.0 * PI) * (1.0 + mu * mu);
        float phM = 3.0 / (8.0 * PI) * ((1.0 - g * g) * (1.0 + mu * mu)) / ((2.0 + g * g) * pow(1.0 + g * g - 2.0 * g * mu, 1.5));
        inscatter = SUN * (1.7 * sumR * BR * phR + 1.2 * sumM * BM * phM);   // 1.7, 1.2: the light scattered more than once, roughly
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
      float coast = detail(q, 6000.0, foot, OCTAVES);
      float land = smoothstep(0.38, 0.62, mask + (coast - 0.5) * 0.3);
      float latD = degrees(lat), lonD = degrees(lon);
      vec3 sunE = uToEcef * uSun;
      float ndl = dot(n, uSun);
      vec3 nl = n;
      #if RELIEF
        // a made-up relief: ridges a few tens of km across, higher in the world's great ranges, as a slope
        // that turns the Sun's light; strongest near the terminator, where the shadows are long
        float ranges = box(latD, lonD, vec4(25.0, 45.0, 65.0, 105.0), 4.0) + box(latD, lonD, vec4(-50.0, 10.0, -80.0, -64.0), 3.0)
                     + box(latD, lonD, vec4(30.0, 62.0, -125.0, -104.0), 4.0) + box(latD, lonD, vec4(42.0, 48.0, 5.0, 16.0), 2.0) * 0.7
                     + box(latD, lonD, vec4(36.0, 42.0, 38.0, 50.0), 3.0) * 0.6;
        float relief = land * (0.25 + 0.75 * clamp(ranges, 0.0, 1.0)) * (1.0 - smoothstep(4000.0, 20000.0, foot));
        if (relief > 0.01) {
          float hs = 9000.0;
          vec3 tx = normalize(cross(e, vec3(0.0, 0.0, 1.0)) + vec3(1e-5)), ty = cross(e, tx);
          float h0 = fbm(q / 40000.0, 3);
          float hx = fbm((q + tx * hs) / 40000.0, 3), hy = fbm((q + ty * hs) / 40000.0, 3);
          vec3 slope = ((hx - h0) * tx + (hy - h0) * ty) * 2.2 * relief;
          nl = normalize(e - slope);
          ndl = dot(nl, sunE);
        }
      #endif
      vec3 albedo = mix(mix(vec3(0.004, 0.017, 0.04), vec3(0.012, 0.055, 0.075), smoothstep(0.02, 0.6, shelf)), landColour(latD, lonD, q, foot), land);
      vec3 sunT = extinction(sunDepth(P + n * 2.0));
      float lit = smoothstep(-0.02, 0.06, dot(n, uSun));
      // the sky's own light on the ground: blue by day, a dim violet through the twilight after sunset
      vec3 skyL = SUN * (vec3(0.035, 0.06, 0.12) * smoothstep(-0.1, 0.35, dot(n, uSun)) + vec3(0.006, 0.005, 0.012) * smoothstep(-0.2, 0.0, dot(n, uSun)));
      vec3 ground = albedo * (SUN * sunT * max(ndl, 0.0) * lit / PI + skyL);
      // the sea: the sky in it, more of it toward the horizon, and the Sun's glint off its waves' slopes
      float cv = max(dot(-d, n), 0.02);
      float fres = 0.02 + 0.98 * pow(1.0 - cv, 5.0);
      vec3 h = normalize(uSun - d);
      float ch = max(dot(n, h), 1e-3), t2 = (1.0 - ch * ch) / (ch * ch);
      const float S2 = 0.014;   // the waves' slopes' variance: a light breeze
      float fsun = 0.02 + 0.98 * pow(1.0 - max(dot(h, uSun), 0.0), 5.0);
      float glint = fsun * exp(-t2 / S2) / (4.0 * PI * S2 * cv * ch * ch * ch * ch);
      #if GLITTER
        // close enough to see the waves, the glint breaks into the facets that catch the Sun
        float facet = noise(q / 18.0 + vec3(0.0, 0.0, uSiteUp.x));
        glint *= mix(1.0, 4.0 * smoothstep(0.62, 0.8, facet), 1.0 - smoothstep(20.0, 160.0, foot));
      #endif
      vec3 sea = (1.0 - land) * (skyL * fres * 6.0 + SUN * sunT * lit * glint);
      ground += sea;
      // clouds: a layer 3 km up, seen from above it (from below, the day is clear)
      float cloud = 0.0;
      if (uClouds > 0.0) {
        float cc = dot(o, o) - RC * RC, bc = dot(o, d), dc = bc * bc - cc;
        vec3 pc = P;
        if (cc > 0.0 && dc > 0.0) pc = o + d * max(0.0, -bc - sqrt(dc));
        vec3 ec = uToEcef * normalize(pc);
        vec2 cl = clouds(ec, foot);
        cloud = cl.x * uClouds * 0.92;
        #if CLOUD_SHADOWS
          // their shadow on the ground, cast along the Sun's rays from the layer
          vec3 es = normalize(e + sunE * (3000.0 / RE) / max(dot(n, uSun), 0.15));
          ground *= 1.0 - 0.7 * clouds(es, foot).x * uClouds * lit;
          // and on themselves: the side away from the Sun of a thick cloud is greyer
          vec3 et = normalize(ec + (sunE - ec * dot(sunE, ec)) * (6000.0 / RE));
          float self = clamp(clouds(et, foot).y - cl.y, 0.0, 1.0);
        #else
          float self = 0.0;
        #endif
        float thick = mix(0.55, 0.82, cl.y) * (1.0 - 0.45 * self);
        vec3 cloudLit = vec3(thick) * (SUN * sunT * max(dot(n, uSun), 0.0) * lit / PI + skyL * 1.6);
        ground = mix(ground, cloudLit, cloud);
      }
      // the towns' lights, out of the Sun; a speckle of streets where a pixel is smaller than a town
      float night = smoothstep(0.06, -0.1, dot(n, uSun));
      if (night > 0.0) {
        float clod = log2(max(foot / uCityTexel, 1.0));
        float town = textureLod(uCities, uv, clod).r;
        if (town > 0.0) {
          float streets = mix(0.35 + 1.3 * smoothstep(0.42, 0.7, noise(q / 1600.0)), 1.0, smoothstep(1500.0, 6000.0, foot));
          vec3 tint = mix(vec3(1.0, 0.62, 0.3), vec3(1.0, 0.86, 0.66), noise(q / 9000.0));
          ground += uCityGain * tint * town * town * streets * night * (1.0 - 0.85 * cloud);
        }
      }
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
      // the Sun's disc, darker toward its limb, and a little glare round it
      float r = sqrt(max(0.0, 1.0 - mu * mu)) / 0.00465;
      float disc = (1.0 - smoothstep(0.9, 1.05, r)) * (0.6 + 0.4 * sqrt(max(0.0, 1.0 - min(r, 1.0) * min(r, 1.0))));
      colour = inscatter + T * SUN * (disc * 1800.0 * step(0.0, mu) + 0.04 * pow(max(mu, 0.0), 800.0));
      // the airglow: a thin green shell 95 km up, seen edge-on at the limb, plain on the night side
      float tc = max(-b, 0.0);
      float hc = length(o + d * tc) - RE;
      vec3 pt = o + d * tc;
      colour += vec3(0.08, 0.32, 0.12) * 0.035 * exp(-pow((hc - 95000.0) / 6000.0, 2.0)) * smoothstep(0.05, -0.25, dot(normalize(pt), uSun));
      alpha = dot(T, vec3(0.333));
      gl_FragDepth = 1.0;
    }
    gl_FragColor = vec4(colour * uGain, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const DEFAULT = { mask: 4096, cities: 4096, viewSteps: 10, sunSteps: 4, octaves: 5, cloudShadows: 1, relief: true, ozone: true, glitter: true };

export class Earth {
  // maskWidth: the land mask's width, texels (the tier's earth.mask, where quality is given);
  // siteUp: the start point, Earth-fixed; quality: a tier's settings (quality.js).
  constructor({ maskWidth = 4096, siteUp = [1, 0, 0], quality = null } = {}) {
    this.uniforms = {
      uInvProj: { value: new THREE.Matrix4() },
      uCamWorld: { value: new THREE.Matrix4() },
      uCamFwd: { value: new THREE.Vector3() },
      uEarthC: { value: new THREE.Vector3() },
      uAlt: { value: 0 },
      uSun: { value: new THREE.Vector3(0, 1, 0) },
      uToEcef: { value: new THREE.Matrix3() },
      uLand: { value: null },
      uCities: { value: null },
      uTexel: { value: 1 },
      uCityTexel: { value: 1 },
      uPixelAngle: { value: 0.001 },
      uNear: { value: 1 },
      uFar: { value: 1e8 },
      uClouds: { value: 0 },
      uGain: { value: 1 },
      uSunE: { value: 3.2 },
      uCityGain: { value: 0.09 },
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
      // the alpha it writes is the sky's transmittance, for the colour's blending only: what is drawn keeps
      // the alpha it had, opaque, so the page behind the canvas never shows through the ground
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
    });
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    // whatever camera draws it (the view's, or the six of the reflected sky's cube) sets its own rays
    this.viewportHeight = 1;
    this.mesh.onBeforeRender = (renderer, scene, camera) => {
      const target = renderer.getRenderTarget();
      this.setCamera(camera, target && target.isWebGLCubeRenderTarget ? target.height : this.viewportHeight);
    };
    this.setQuality(quality || { earth: { ...DEFAULT, mask: maskWidth } });
  }

  // The tier: the textures' sizes and the shader's costs. Textures are painted again only where their
  // size changes.
  setQuality(quality) {
    const q = { ...DEFAULT, ...(quality.earth || quality) };
    if (this.maskWidth !== q.mask) {
      this.uniforms.uLand.value?.dispose();
      const tex = new THREE.DataTexture(maskBytes(q.mask), q.mask, q.mask / 2, THREE.RedFormat, THREE.UnsignedByteType);
      Object.assign(tex, { wrapS: THREE.RepeatWrapping, wrapT: THREE.ClampToEdgeWrapping, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true });
      tex.needsUpdate = true;
      this.uniforms.uLand.value = tex;
      this.uniforms.uTexel.value = (2 * Math.PI * RE) / q.mask;
      this.maskWidth = q.mask;
    }
    if (this.citiesWidth !== q.cities) {
      this.uniforms.uCities.value?.dispose();
      const tex = new THREE.DataTexture(paintLights(q.cities), q.cities, q.cities / 2, THREE.RedFormat, THREE.UnsignedByteType);
      Object.assign(tex, { wrapS: THREE.RepeatWrapping, wrapT: THREE.ClampToEdgeWrapping, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true });
      tex.needsUpdate = true;
      this.uniforms.uCities.value = tex;
      this.uniforms.uCityTexel.value = (2 * Math.PI * RE) / q.cities;
      this.citiesWidth = q.cities;
    }
    this.material.defines = {
      VIEW_STEPS: q.viewSteps, SUN_STEPS: q.sunSteps, OCTAVES: q.octaves, CLOUD_SHADOWS: q.cloudShadows ? 1 : 0,
      RELIEF: q.relief ? 1 : 0, OZONE: q.ozone ? 1 : 0, GLITTER: q.glitter ? 1 : 0,
    };
    this.material.needsUpdate = true;
    this.quality = q;
  }

  // The camera's part of the uniforms: its rays, its depth range, how wide a pixel is.
  setCamera(camera, viewportHeight) {
    const u = this.uniforms;
    u.uInvProj.value.copy(camera.projectionMatrixInverse);
    u.uCamWorld.value.copy(camera.matrixWorld);
    camera.getWorldDirection(u.uCamFwd.value);
    u.uPixelAngle.value = (camera.fov * Math.PI) / 180 / viewportHeight;
    u.uNear.value = camera.near;
    u.uFar.value = camera.far;
  }

  // camera: placed at the origin and pointed; earthCentre: the Earth's centre from the eye, three.js
  // axes; alt: the eye's height, from doubles; sun: unit, three.js axes; toEcef: {x, y, z} columns.
  update(camera, viewportHeight, earthCentre, alt, sun, toEcef) {
    const u = this.uniforms;
    this.viewportHeight = viewportHeight;
    this.setCamera(camera, viewportHeight);
    u.uEarthC.value.set(earthCentre[0], earthCentre[1], earthCentre[2]);
    u.uAlt.value = alt;
    u.uSun.value.set(sun[0], sun[1], sun[2]);
    const m = toEcef;
    u.uToEcef.value.set(m.x[0], m.y[0], m.z[0], m.x[1], m.y[1], m.z[1], m.x[2], m.y[2], m.z[2]);
    u.uClouds.value = Math.min(1, Math.max(0, (alt - 3200) / 800));   // the layer is 3 km up: seen from above it only
    u.uGain.value = 1;
  }

  // Bytes the textures hold, for the page's report (with their mipmaps, a third more).
  bytes() {
    return Math.round(((this.maskWidth * this.maskWidth) / 2 + (this.citiesWidth * this.citiesWidth) / 2) * (4 / 3));
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

  dispose() {
    this.points.geometry.dispose();
    this.material.dispose();
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
