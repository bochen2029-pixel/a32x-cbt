// The Earth's air as its shader (earth.js) samples it, without a browser, so the tests can hold the
// shader's quadrature to a fine reference of the same model. GPLv3.
//
// Along a view ray the air is sampled at points packed toward where it is densest. Looking up or along
// from low down, that is near the eye; looking down from above most of the air (higher than a scale
// height, the ray ending on the ground), it is near the ground, at the far end. Packed the first way
// from 500 km, the bottom 19 km of a nadir path got one sample and the haze (Mie, 1.2 km scale height)
// came out at 0.007 of its value. The shader writes the same two lines as viewSpan.

export const RE = 6371000, RA = RE + 100000;
export const HR = 8000, HM = 1200;

// The ith of n spans of a view ray from t0 to t0 + L: its middle and its length, m.
export function viewSpan(i, n, t0, L, deep) {
  const s0 = i / n, s1 = (i + 1) / n;
  const a0 = deep ? 1 - (1 - s0) * (1 - s0) : s0 * s0, a1 = deep ? 1 - (1 - s1) * (1 - s1) : s1 * s1;
  return { t: t0 + L * 0.5 * (a0 + a1), ds: L * (a1 - a0) };
}

// Rayleigh's and Mie's optical depths (in units of their sea-level densities times metres) along a ray
// from a point at height alt, its direction's cosine from the local vertical mu (1 up, -1 down), to the
// top of the air or to the ground, in n samples placed as the shader places them (or, where `nearEye`,
// all packed near the eye, as they were); n = 0: a fine reference of the same model.
export function opticalDepth(alt, mu, n, nearEye = false) {
  const o = [0, RE + alt], d = [Math.sqrt(Math.max(0, 1 - mu * mu)), mu];
  const b = o[0] * d[0] + o[1] * d[1];
  const cE = alt * (2 * RE + alt), discE = b * b - cE;
  const tEarth = b < 0 && discE > 0 ? cE / (-b + Math.sqrt(discE)) : -1;
  const discA = b * b - ((RE + alt) ** 2 - RA * RA);
  if (discA <= 0) return { rayleigh: 0, mie: 0, ground: false };
  const t0 = Math.max(0, -b - Math.sqrt(discA));
  const t1 = tEarth > 0 ? tEarth : -b + Math.sqrt(discA);
  const L = t1 - t0, deep = !nearEye && tEarth > 0 && alt > HR;
  const steps = n || 20000;
  let rayleigh = 0, mie = 0;
  for (let i = 0; i < steps; i++) {
    const { t, ds } = n ? viewSpan(i, n, t0, L, deep) : { t: t0 + L * (i + 0.5) / steps, ds: L / steps };
    const h = Math.max(0, Math.hypot(o[0] + d[0] * t, o[1] + d[1] * t) - RE);
    rayleigh += Math.exp(-h / HR) * ds;
    mie += Math.exp(-h / HM) * ds;
  }
  return { rayleigh, mie, ground: tEarth > 0 };
}
