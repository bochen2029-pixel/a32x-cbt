// The spaceplane's shape, as plain numbers: a blended delta lifting body 34 m long and 18 m across, in
// its own frame (x forward, y up, z to the right wing). The body and the wing are one surface: a flat
// belly, and over it a thickness that is the fuselage's near the middle and a thin wing's out to the
// leading edge, which is rounded. craft.js makes it into meshes; the tests read it. No three.js here.
// GPLv3.

export const NOSE = 16, TAIL = -16;             // m, the body's ends; the bells reach 2 m past the tail
export const SPAN = 18;                          // m, wingtip to wingtip
export const BELLY = -1.0;                       // m, the flat underside, below the centreline

// The gear's wheels touch where the core's contact points are (orbit_core.cpp, GEAR): body (10, 0, 3)
// and (-3, +-3.5, 3) with x forward and z down; here x forward, y up, z right.
export const GEAR = [
  { x: 10, z: 0, wheel: 0.45 },
  { x: -3, z: -3.5, wheel: 0.55 },
  { x: -3, z: 3.5, wheel: 0.55 },
];
export const GROUND = -3;                         // m: where the wheels touch, below the centre of mass

export const ENGINES = [{ y: 0.05, z: -1.35 }, { y: 0.05, z: 1.35 }];
export const BELL = { throat: 0.42, exit: 1.08, length: 2.0, at: TAIL - 0.3 };   // m; at: the throat's x
export const LENGTH = NOSE - (BELL.at - BELL.length);   // m, nose to the bells' mouths: 34.3

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// The fuselage's half-width at x.
export function fuselageWidth(x) {
  if (x >= NOSE) return 0;
  if (x > 7) return 2.7 * Math.pow((NOSE - x) / (NOSE - 7), 0.5);
  return 2.7 - 0.25 * smooth(-10, TAIL, x);
}

// The leading edge: the half-span at x, the fuselage's or the wing's, whichever is wider, blended so
// the strake runs smoothly into the wing.
export function halfSpan(x) {
  const f = fuselageWidth(x);
  if (x >= 9) return f;
  const wing = x > -12.6 ? 2.7 + ((9 - x) / 21.6) * (SPAN / 2 - 2.7) : SPAN / 2 - 0.4 * Math.pow(smooth(-12.6, TAIL, x), 2);
  const k = 0.7;   // a smooth maximum's width, m
  const h = Math.min(1, Math.max(0, 0.5 + 0.5 * (wing - f) / k));
  return wing * h + f * (1 - h) + k * h * (1 - h);
}

// Where the leading edge is at half-span |z| (the inverse of halfSpan over the wing), for the chord.
function leadingEdgeX(az) {
  let lo = TAIL, hi = NOSE;
  for (let i = 0; i < 30; i++) {   // halfSpan falls as x rises over the wing and nose
    const mid = (lo + hi) / 2;
    if (halfSpan(mid) > az) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// An airfoil's thickness along its chord (xi 0 at the leading edge, 1 at the trailing), peak 1.
function airfoil(xi) {
  const x = Math.min(1, Math.max(0, xi));
  const t = 2.969 * Math.sqrt(x) - 1.26 * x - 3.516 * x * x + 2.843 * x * x * x - 1.036 * x * x * x * x;
  return t / 0.6;
}

// The fuselage's depth at x: belly to top, with the cockpit's hump.
export function fuselageDepth(x) {
  const s = (x - TAIL) / (NOSE - TAIL);
  const nose = x > 7 ? Math.pow(Math.max(0, (NOSE - x) / (NOSE - 7)), 0.62) : 1;
  const hump = 0.38 * Math.exp(-Math.pow((x - 9.2) / 2.6, 2));
  const tail = 1 - 0.18 * smooth(-9, TAIL, x);
  return x >= NOSE || s < 0 ? 0 : (2.75 * nose + hump * (x > 7 ? Math.min(1, nose * 1.6) : 1)) * tail;
}

// The underside and the top at (x, z): { bottom, top } in m, y up.
export function surfaces(x, z) {
  const s = halfSpan(x), az = Math.min(Math.abs(z), s);
  const f = fuselageWidth(x);
  const noseLift = x > 9 ? 0.72 * Math.pow((x - 9) / (NOSE - 9), 2) : 0;
  const out = s > 0 ? smooth(0.55 * Math.max(f, 1e-3), s, az) : 0;
  const bottom = BELLY + noseLift + 0.32 * out + 0.18 * Math.pow(Math.max(0, (az - 6) / 3), 2);
  // the fuselage's thickness: a rounded top over the flat belly, closing at its chines
  const fz = f > 0 ? Math.min(1, az / f) : 1;
  const body = fuselageDepth(x) * Math.pow(Math.max(0, 1 - Math.pow(fz, 2.3)), 0.45);
  // the wing's: an airfoil along the local chord, thin at the tips, zero at the leading edge
  const le = leadingEdgeX(az);
  const chord = Math.max(0.5, le - TAIL);
  const tmax = 0.62 - 0.4 * smooth(2.7, SPAN / 2, az);
  const edge = Math.sqrt(Math.max(0, 1 - az / Math.max(s, 1e-3)));
  const wing = tmax * airfoil((le - x) / chord) * Math.min(1, edge * 4);
  // a smooth maximum of the two, so the wing grows out of the body without a crease
  const k = 0.35, h = Math.min(1, Math.max(0, 0.5 + 0.5 * (body - wing) / k));
  const depth = Math.max(0, body * h + wing * (1 - h) + k * h * (1 - h) * (body > 0.01 && wing > 0.01 ? 1 : 0));
  return { bottom, top: bottom + depth * Math.min(1, edge * 3) };
}

// The fuselage's section at x, as the sketch's first mock-up gave it (other parts may shape things round
// the body by it): half-width, height above and depth below the centreline, and the centreline's drop.
export function section(x) {
  const h = surfaces(x, 0);
  return { w: fuselageWidth(x), top: Math.max(0, h.top), bottom: Math.max(0, -h.bottom), drop: 0 };
}

// The skin as a grid: `stations` along x (more toward the nose), `across` points over each section's
// top and as many over its bottom, closing at the leading edges. Returns plain arrays: positions
// (x, y, z), uvs (u along x, v across the span, both 0 to 1 over the planform), indices (triangles
// wound outward), and which vertices are on the top (1) or the belly (0).
export function loft(stations = 48, across = 40) {
  const xs = [];
  for (let i = 0; i <= stations; i++) {
    const t = i / stations;
    xs.push(TAIL + (NOSE - TAIL) * (1 - Math.pow(1 - t, 1.35)));   // finer toward the nose
  }
  const ring = 2 * across;   // per station: top from +s to -s, then bottom from -s to +s
  const pos = [], uv = [], top = [], idx = [];
  for (const x of xs) {
    const s = Math.max(halfSpan(x), 1e-4);
    for (let j = 0; j < ring; j++) {
      const onTop = j < across;
      const k = onTop ? j : j - across;
      const u = k / across;                                         // 0 to 1 across the section
      const zf = Math.sin(Math.PI * (u - 0.5));                     // denser at the edges
      const z = (onTop ? -zf : zf) * s;
      const h = surfaces(x, z);
      pos.push(x, onTop ? h.top : h.bottom, z);
      uv.push((x - TAIL) / (NOSE - TAIL), z / SPAN + 0.5);
      top.push(onTop ? 1 : 0);
    }
  }
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < ring; j++) {
      const a = i * ring + j, b = i * ring + ((j + 1) % ring), c = a + ring, d = b + ring;
      idx.push(a, c, b, b, c, d);
    }
  }
  return { positions: pos, uvs: uv, top, indices: idx, stations: xs.length, ring };
}

// The base at the tail: the section at TAIL, as a fan of triangles facing aft.
export function base(across = 40) {
  const s = halfSpan(TAIL + 1e-3);
  const pts = [];
  for (let j = 0; j <= across; j++) {
    const z = Math.sin(Math.PI * (j / across - 0.5)) * s;
    const h = surfaces(TAIL + 1e-3, z);
    pts.push([z, h.bottom, h.top]);
  }
  return pts;   // [z, bottom, top] across the base
}

// The fins: two, canted out 22 degrees, on the upper body's flanks. Outline in the fin's own plane
// (x along the body, y up its span), root at its foot.
export const FIN = {
  outline: [[-7.2, 0], [-12.9, 4.6], [-15.3, 4.6], [-15.9, 0]],
  thickness: 0.32, cant: 0.38, z: 2.05,
};
export function finRoot() { return surfaces(-11.5, FIN.z).top - 0.12; }

// The cockpit's windows: panes on the nose's top, each [x0, x1, z0, z1] in m, between their frames.
export const WINDOWS = [
  [10.25, 11.55, -1.32, -0.06], [10.25, 11.55, 0.06, 1.32],                  // the two forward panes
  [9.0, 10.12, -1.62, -0.72], [9.0, 10.12, -0.62, -0.06],                    // left: two more
  [9.0, 10.12, 0.06, 0.62], [9.0, 10.12, 0.72, 1.62],                        // right
];

// Lights: red on the left wingtip, green on the right, a white strobe on each fin's tip and one aft, a
// red beacon on the top and one under the belly.
export function navLights() {
  const tipX = TAIL + 1.4, tipZ = SPAN / 2 - 0.25, tipY = surfaces(tipX, tipZ).top + 0.05;
  const fin = FIN.outline[1], finTop = finRoot() + fin[1] * Math.cos(FIN.cant);
  const finZ = FIN.z + fin[1] * Math.sin(FIN.cant);
  return [
    { p: [tipX, tipY, -tipZ], c: [9, 0.6, 0.35], blink: null },
    { p: [tipX, tipY, tipZ], c: [0.4, 8, 1.8], blink: null },
    { p: [fin[0] - 1, finTop, -finZ], c: [12, 12, 12], blink: [1.2, 0.0, 0.06] },
    { p: [fin[0] - 1, finTop, finZ], c: [12, 12, 12], blink: [1.2, 0.0, 0.06] },
    { p: [TAIL - 0.3, 1.2, 0], c: [10, 10, 10], blink: [1.2, 0.5, 0.06] },
    { p: [2, surfaces(2, 0).top + 0.1, 0], c: [10, 0.5, 0.3], blink: [1.0, 0.25, 0.15] },
    { p: [2, BELLY - 0.08, 0], c: [10, 0.5, 0.3], blink: [1.0, 0.75, 0.15] },
  ];
}

// The small thrusters: four quads, each four nozzles, two at the nose and two aft: [x, y, z, side].
export function thrusterQuads() {
  const out = [];
  for (const [x, k] of [[12.2, 0.8], [-13.6, 0.86]]) {
    for (const side of [-1, 1]) {
      const z = side * k * fuselageWidth(x), h = surfaces(x, z);
      out.push({ x, y: h.bottom + 0.55 * (h.top - h.bottom), z, side });
    }
  }
  return out;
}

// The plume's shape for a throttle and an outside pressure (vacuum 0 at sea level, 1 above the air):
// how long and how wide its glow reaches, m, and the spacing of the shock diamonds, which open out as
// the air thins and go when it is gone.
export function plume(throttle, vacuum) {
  const t = Math.min(1, Math.max(0, throttle)), v = Math.min(1, Math.max(0, vacuum));
  return {
    length: (8 + 34 * t) * (1 - 0.35 * v) + 30 * v * t,
    radius: (1.0 + 0.4 * t) * (1 + 7 * v * v),
    diamonds: (1 - v) * t,
    spacing: BELL.exit * 2 * (1.25 + 3 * v),
  };
}
