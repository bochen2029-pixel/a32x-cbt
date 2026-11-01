// The sky, from physics rather than a palette: single scattering in a spherical atmosphere — Rayleigh,
// Mie and ozone — lit by the sun. Computed on the CPU into a small table whenever the sun, the haze or the
// eye's height changes. The sky dome, the haze over every surface, the sun's colour and the light from the
// sky all read that one table, so the ground meets the horizon in the same colour at every hour. GPLv3.
//
// The coefficients are the standard clear-sky values at 680, 550 and 440 nm (Bruneton 2017, Hillaire
// 2020); the code is ours.

import * as THREE from 'three';

const RG = 6360e3, RT = 6420e3;
const BETA_R = [5.802e-6, 13.558e-6, 33.1e-6];
// Mie: Bruneton's clear-sky scattering, with a single-scattering albedo of 0.98 rather than 0.9 — at the
// densities a hazy Texas evening needs, 0.9 turns the whole low sky olive
const BETA_M_S = 3.996e-6, BETA_M_E = 4.08e-6;
const BETA_O = [0.65e-6, 1.881e-6, 0.085e-6];
const HR = 8000, HM = 1200;
const SUN = [1.474, 1.8504, 1.91198];   // the solar irradiance at the top, at the three wavelengths
const G = 0.8;                           // Mie asymmetry
const MULTIPLE = 0.8;                    // Rayleigh's multiple scattering, as an isotropic glow, by eye
// Single scattering leaves a noon zenith a quarter as bright as sunlit grass and the horizon darker than
// the ground; a real sky is brighter than both. The gain stands in for the orders of scattering and the
// aerosol light this table leaves out.
const SKY_GAIN = 4.5;
export const SKY_W = 64, SKY_H = 64;
const T_H = 32, T_MU = 64;

// The haze as a meteorological visibility: Koschmieder's 3.912 / extinction, at 550 nm, near the ground.
export function mieScale(visibilityKm) {
  const ext = 3.912 / (visibilityKm * 1000);
  return Math.max(1, (ext - BETA_R[1]) / BETA_M_E);
}

function ozone(h) {
  return Math.max(0, 1 - Math.abs(h - 25000) / 15000);
}

// Distance along a ray from radius r with cosine mu to the top of the atmosphere, or to the ground (a
// negative answer means it misses the ground).
function toTop(r, mu) {
  const d = r * r * (mu * mu - 1) + RT * RT;
  return -r * mu + Math.sqrt(Math.max(0, d));
}
function toGround(r, mu) {
  const d = r * r * (mu * mu - 1) + RG * RG;
  return d < 0 || mu > 0 ? -1 : -r * mu - Math.sqrt(d);
}

export class Atmosphere {
  constructor() {
    this.mie = 1;
    this.transmittance = new Float32Array(T_H * T_MU * 3);
    this.table = new Uint16Array(SKY_W * SKY_H * 4);
    this.texture = new THREE.DataTexture(this.table, SKY_W, SKY_H, THREE.RGBAFormat, THREE.HalfFloatType);
    this.texture.magFilter = this.texture.minFilter = THREE.LinearFilter;
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.colorSpace = THREE.NoColorSpace;
    this.sunColour = new THREE.Color();      // irradiance from the sun at the eye, through the air
    this.skyIrradiance = new THREE.Color();  // from the whole sky, on a surface facing up
    this.zenith = new THREE.Color();
    this.key = '';
  }

  // Transmittance from a height up a direction, through the whole atmosphere: a small table per haze.
  buildTransmittance() {
    const out = this.transmittance, steps = 40;
    for (let i = 0; i < T_H; ++i) {
      const h = ((i / (T_H - 1)) ** 2) * (RT - RG);
      const r = RG + h;
      for (let j = 0; j < T_MU; ++j) {
        const mu = -0.25 + 1.25 * (j / (T_MU - 1));
        let tR = 0, tM = 0, tO = 0;
        if (toGround(r, mu) < 0) {
          const len = toTop(r, mu), ds = len / steps;
          for (let s = 0; s < steps; ++s) {
            const t = (s + 0.5) * ds;
            const hh = Math.sqrt(r * r + t * t + 2 * r * t * mu) - RG;
            tR += Math.exp(-hh / HR) * ds;
            tM += Math.exp(-hh / HM) * ds;
            tO += ozone(hh) * ds;
          }
          for (let c = 0; c < 3; ++c) {
            out[(i * T_MU + j) * 3 + c] = Math.exp(-(BETA_R[c] * tR + BETA_M_E * this.mie * tM + BETA_O[c] * tO));
          }
        } else {
          for (let c = 0; c < 3; ++c) out[(i * T_MU + j) * 3 + c] = 0;
        }
      }
    }
  }

  sunTransmittance(h, mu, into) {
    const fi = Math.sqrt(Math.max(0, Math.min(1, h / (RT - RG)))) * (T_H - 1);
    const fj = ((mu + 0.25) / 1.25) * (T_MU - 1);
    if (fj < 0) return into.fill(0);
    const i0 = Math.min(T_H - 2, Math.floor(fi)), j0 = Math.min(T_MU - 2, Math.floor(fj));
    const a = fi - i0, b = Math.min(1, fj - j0);
    const t = this.transmittance;
    for (let c = 0; c < 3; ++c) {
      const v00 = t[(i0 * T_MU + j0) * 3 + c], v01 = t[(i0 * T_MU + j0 + 1) * 3 + c];
      const v10 = t[((i0 + 1) * T_MU + j0) * 3 + c], v11 = t[((i0 + 1) * T_MU + j0 + 1) * 3 + c];
      into[c] = (v00 * (1 - b) + v01 * b) * (1 - a) + (v10 * (1 - b) + v11 * b) * a;
    }
    return into;
  }

  // The table: radiance in RGB, and in A the transmittance to the end of that ray, so a surface's haze is
  // the sky's own in-scattered light divided by the share the air took.
  update(sunElevationDeg, eyeHeightM, visibilityKm) {
    const key = `${sunElevationDeg.toFixed(2)}|${Math.round(eyeHeightM / 250)}|${visibilityKm.toFixed(1)}`;
    if (key === this.key) return false;
    const mie = mieScale(visibilityKm);
    if (mie !== this.mie || !this.key) {
      this.mie = mie;
      this.buildTransmittance();
    }
    this.key = key;
    const hc = Math.max(1, eyeHeightM), rc = RG + hc;
    const se = sunElevationDeg * Math.PI / 180;
    const sun = [Math.cos(se), Math.sin(se), 0];  // in the table's frame: x toward the sun's azimuth
    const ts = new Float64Array(3), tsUp = new Float64Array(3), tc = new Float64Array(3), sky = new Float64Array(3);
    const steps = 28;
    let irr = [0, 0, 0], zen = [0, 0, 0];
    for (let iy = 0; iy < SKY_H; ++iy) {
      const v = (iy + 0.5) / SKY_H, k = 2 * v - 1;
      const el = Math.sign(k) * k * k * Math.PI / 2;
      const cosEl = Math.cos(el), sinEl = Math.sin(el);
      for (let ix = 0; ix < SKY_W; ++ix) {
        const phi = ((ix + 0.5) / SKY_W) * Math.PI;
        const d = [cosEl * Math.cos(phi), sinEl, cosEl * Math.sin(phi)];
        const nu = d[0] * sun[0] + d[1] * sun[1];
        const pR = (3 / (16 * Math.PI)) * (1 + nu * nu);
        const pM = (3 / (8 * Math.PI)) * ((1 - G * G) * (1 + nu * nu)) / ((2 + G * G) * Math.pow(1 + G * G - 2 * G * nu, 1.5));
        const mu = sinEl;
        const ground = toGround(rc, mu);
        const len = ground > 0 ? ground : toTop(rc, mu);
        sky.fill(0);
        let oR = 0, oM = 0, oO = 0, prev = 0;
        for (let s = 1; s <= steps; ++s) {
          const t = len * (s / steps) ** 2, ds = t - prev, tm = (t + prev) / 2;
          prev = t;
          const r = Math.sqrt(rc * rc + tm * tm + 2 * rc * tm * mu);
          const h = r - RG;
          const dR = Math.exp(-h / HR), dM = Math.exp(-h / HM) * this.mie, dO = ozone(h);
          oR += dR * ds; oM += dM * ds; oO += dO * ds;
          // the sun's angle at the sample, on a round earth
          const px = d[0] * tm, py = rc + d[1] * tm, pz = d[2] * tm;
          const muS = (px * sun[0] + py * sun[1] + pz * sun[2]) / r;
          this.sunTransmittance(h, muS, ts);
          // light scattered more than once, as an isotropic glow from the air above that the sun still
          // reaches: the share single scattering leaves out, which is most of a twilight sky
          this.sunTransmittance(h + 6000, muS, tsUp);
          for (let c = 0; c < 3; ++c) {
            tc[c] = Math.exp(-(BETA_R[c] * oR + BETA_M_E * oM + BETA_O[c] * oO));   // oM carries the haze already
            const scatter = BETA_R[c] * dR * pR + BETA_M_S * dM * pM;
            const multiple = MULTIPLE * BETA_R[c] * dR * (0.5 * ts[c] + 0.5 * tsUp[c]) / (4 * Math.PI);
            sky[c] += tc[c] * (ts[c] * scatter + multiple) * ds * SUN[c] * SKY_GAIN;
          }
        }
        const night = 1 - Math.min(1, Math.max(0, (sunElevationDeg + 18) / 12));
        const o = (iy * SKY_W + ix) * 4;
        const airglow = [0.000035, 0.00005, 0.00011];
        // the solid angle this texel stands for, both halves of the sky: the rows crowd the horizon
        const dEl = (2 * Math.PI * Math.abs(k)) / SKY_H, dOmega = 2 * (Math.PI / SKY_W) * cosEl * dEl;
        for (let c = 0; c < 3; ++c) {
          const value = sky[c] + airglow[c] * (0.3 + 0.7 * night) * (1 - 0.6 * Math.max(0, sinEl));
          this.table[o + c] = THREE.DataUtils.toHalfFloat(value);
          if (sinEl > 0) irr[c] += value * sinEl * dOmega;
          if (iy === SKY_H - 1) zen[c] += value / SKY_W;
        }
        this.table[o + 3] = THREE.DataUtils.toHalfFloat(tc[1]);
      }
    }
    // irr is the irradiance on a level surface from the whole sky: radiance x cos x solid angle
    this.skyIrradiance.setRGB(irr[0], irr[1], irr[2]);
    this.zenith.setRGB(zen[0], zen[1], zen[2]);
    this.sunTransmittance(hc, Math.sin(se), ts);
    this.sunColour.setRGB(SUN[0] * ts[0], SUN[1] * ts[1], SUN[2] * ts[2]);
    this.texture.needsUpdate = true;
    return true;
  }

  // Extinction coefficients at sea level for the haze over surfaces: Rayleigh per channel, and Mie.
  extinction() {
    return { rayleigh: new THREE.Vector3(...BETA_R), mie: BETA_M_E * this.mie };
  }
}

// The GLSL every hazed material and the sky share: the table's coordinates for a direction.
export const SKY_GLSL = /* glsl */ `
  uniform sampler2D uSky;
  uniform vec3 uSunDir;
  vec2 skyUV(vec3 d) {
    float el = asin(clamp(d.y, -1.0, 1.0));
    vec2 hs = uSunDir.xz;
    float hl = length(hs);
    hs = hl > 1e-4 ? hs / hl : vec2(1.0, 0.0);
    vec2 hd = d.xz;
    float dl = length(hd);
    hd = dl > 1e-4 ? hd / dl : hs;
    float phi = acos(clamp(dot(hd, hs), -1.0, 1.0));
    float k = sqrt(abs(el) / 1.5707963);
    return vec2(phi / 3.1415926, 0.5 + 0.5 * sign(el) * k);
  }
`;
