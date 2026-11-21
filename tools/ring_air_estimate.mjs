// The numbers of handoff/RING_AIR_SPEC.md, made again: the open Ring's air layer (the plateau and its skin,
// section 2) and a point mass flown exactly along the autoland's path (section 4) in the Ring's turning frame,
// for the pull, the thrust, the time and the propellant. An estimate for a document, not the core: the core's
// own flight of the autoland, when it is built, is what the spec's RA8 records. Node only. MIT.
//
//   node flight/orbit/tools/ring_air_estimate.mjs

const W = 0.0443, R = 5000, G0 = 9.80665, ISP = 2000, T_MAX = 1.2 * 60000 * G0;   // orbit_core.h, internal.h
const RS = 287.05287, T = 288.15, RHO0 = 1.225;
const gFloor = W * W * R, HG = RS * T / gFloor;
const HS = 30, HT = 50, SKIN = 7;   // OC_AIR_PLATEAU_M, OC_AIR_TOP_M, OC_AIR_SKIN_M
const eT = Math.exp(-((HT - HS) ** 2) / (2 * SKIN * SKIN));
const plateau = (h) => RHO0 * Math.exp(-(h / HG) * (1 - h / (2 * R)));

// the one function (section 2.1), by height over the floor; the band's sides are left out here
export function rho(h) {
  if (h >= HT) return 0;
  if (h <= 0) return RHO0;
  if (h <= HS) return plateau(h);
  const x = h - HS;
  return plateau(HS) * (Math.exp(-(x * x) / (2 * SKIN * SKIN)) - eT) / (1 - eT);
}

function air() {
  console.log(`the floor's pull ${gFloor.toFixed(4)} m/s2, the plateau's scale height ${HG.toFixed(1)} m, e_t ${eT.toFixed(6)}`);
  for (const h of [0, 1.7, 10, 20, 30, 35, 40, 45, 48, 49, 50]) {
    console.log(`  h ${String(h).padStart(4)} m: rho/rho0 ${(rho(h) / RHO0).toFixed(5)}, p ${(rho(h) * RS * T / 1000).toFixed(2)} kPa`);
  }
  let column = 0;
  for (let h = 0; h < HT; h += 1e-3) column += rho(h + 5e-4) * 1e-3;
  console.log(`  the column ${column.toFixed(2)} kg/m2; the band's ${(column * 1000 * 2 * Math.PI * R / 1e9).toFixed(2)} million tonnes`);
  for (const x of [5, 10, 15, 19]) {
    const h = HS + x, d = 1e-4, slope = (Math.log(rho(h + d)) - Math.log(rho(h - d))) / (2 * d);
    console.log(`  ${x} m into the skin, the field holds the air with ${(-RS * T * slope / G0).toFixed(0)} g`);
  }
  console.log(`  the plain exponential (11 m) instead: ${[1.7, 10, 20, 30, 50].map((h) => `${h} m ${Math.exp(-h / 11).toFixed(3)}`).join(', ')}`);
}

// The path (section 4.3): floor arc s out from the pad, + spinward, the craft coming in antispinward; height
// h = 20 m + s tan 6 deg; the speed along it scheduled by the distance to go at two constant decelerations.
const GLIDE = 6 * Math.PI / 180, H_HOVER = 20, H_FAF = 200, H_DP = 60, V_FAF = 80, V_DP = 30;
const out = (h) => (h - H_HOVER) / Math.tan(GLIDE);
const along = (s) => s / Math.cos(GLIDE);
const sFAF = out(H_FAF), sDP = out(H_DP);
const aC = V_DP * V_DP / (2 * along(sDP)), aF = (V_FAF ** 2 - V_DP ** 2) / (2 * (along(sFAF) - along(sDP)));
const speed = (s) => (along(s) <= along(sDP) ? Math.sqrt(2 * aC * along(s)) : Math.sqrt(V_DP ** 2 + 2 * aF * (along(s) - along(sDP))));

function approach(m0) {
  console.log(`the FAF ${sFAF.toFixed(0)} m out at ${H_FAF} m, the DP ${sDP.toFixed(0)} m out at ${H_DP} m; decelerating at ${aF.toFixed(2)}, then ${aC.toFixed(2)} m/s2`);
  const dt = 0.01;
  let m = m0, t = 0, s = sFAF, used = 0, peak = 0, sdotWas = -speed(s) * Math.cos(GLIDE), next = sFAF, skinIn = null, skinOut = null;
  while (s > 0.05) {
    const v = speed(s), sdot = -v * Math.cos(GLIDE), sddot = (sdot - sdotWas) / dt;
    sdotWas = sdot;
    const h = H_HOVER + s * Math.tan(GLIDE), r = R - h;
    const phid = sdot / R + W, rdot = -Math.tan(GLIDE) * sdot, rddot = -Math.tan(GLIDE) * sddot;
    const fr = rddot - r * phid * phid, ft = r * sddot / R + 2 * rdot * phid;   // the specific force it must make
    const f = Math.hypot(fr, ft), pull = r * phid * phid / gFloor;
    peak = Math.max(peak, m * f);
    if (skinIn === null && h < HT) skinIn = { t, v };
    if (skinOut === null && h < HS) skinOut = { t, v };
    if (s <= next) {
      console.log(`  t ${t.toFixed(1).padStart(5)} s, ${s.toFixed(0).padStart(5)} m out, h ${h.toFixed(0).padStart(4)} m, ${v.toFixed(1).padStart(5)} m/s, pull ${pull.toFixed(2)} g, thrust ${(m * f / 1000).toFixed(0)} kN, air ${(rho(h) / RHO0 * 100).toFixed(0)} %`);
      next -= 200;
    }
    const mdot = m * f / (ISP * G0);
    m -= mdot * dt; used += mdot * dt; t += dt; s += sdot * dt;
  }
  const fEnd = Math.hypot(W * W * (R - H_HOVER) + aC * Math.sin(GLIDE), aC * Math.cos(GLIDE));
  console.log(`  the hover point: ${t.toFixed(1)} s, ${used.toFixed(0)} kg; there ${(m * fEnd / 1000).toFixed(0)} kN, ${(m * fEnd / T_MAX).toFixed(2)} of T_MAX`);
  console.log(`  the skin: entered at ${skinIn.t.toFixed(1)} s (${skinIn.v.toFixed(0)} m/s), left at ${skinOut.t.toFixed(1)} s (${skinOut.v.toFixed(0)} m/s)`);
  return m;
}

// The hover (8 s) and the deck crew's descent law (deck.cpp: 2 m/s, easing at 0.45 m/s2 to 0.3 m/s at 3.75 m)
function hoverAndDescent(m0) {
  const dt = 0.01, pull = (h) => W * W * (R - h);
  let m = m0, used = 0, t = 0, h = H_HOVER, vWas = 0;
  for (let k = 0; k < 8 / dt; k++) { const d = m * pull(H_HOVER) / (ISP * G0) * dt; m -= d; used += d; t += dt; }
  while (h > 3) {
    const v = Math.min(2.0, Math.sqrt(0.3 * 0.3 + 2 * 0.45 * Math.max(h - 3.75, 0)));
    const a = (v - vWas) / dt;
    vWas = v;
    const d = m * (pull(h) - a) / (ISP * G0) * dt;
    m -= d; used += d; t += dt; h -= v * dt;
  }
  console.log(`the hover and the descent: ${t.toFixed(1)} s, ${used.toFixed(0)} kg`);
}

// The capture: from the hold point, at rest among the stars on the axis, out at vOut, a coast, then one burn to
// the FAF's velocity among the stars
function capture(m0) {
  const r = R - H_FAF, v = speed(sFAF);
  const tangential = W * r - v * Math.cos(GLIDE) * r / R, outward = v * Math.sin(GLIDE);
  for (const vOut of [20, 40, 60]) {
    const burn = Math.hypot(tangential, outward - vOut), dv = vOut + burn;
    console.log(`  the capture, out at ${vOut} m/s: a ${(r / vOut).toFixed(0)} s coast, then ${burn.toFixed(0)} m/s; ${dv.toFixed(0)} m/s in all, ${(m0 * (1 - Math.exp(-dv / (ISP * G0)))).toFixed(0)} kg`);
  }
}

function ball() {
  let x = 0, z = 20, vx = 0, vz = 0, t = 0;
  const dt = 1e-4;
  while (z > 0) {
    const ax = 2 * W * vz, az = -(W * W * (R - z)) - 2 * W * vx;
    vx += ax * dt; vz += az * dt; x += vx * dt; z += vz * dt; t += dt;
  }
  console.log(`a ball let go 20 m up, no drag: down in ${t.toFixed(2)} s, ${x.toFixed(2)} m along the floor (+ spinward)`);
}

air();
capture(34388);
const m = approach(34000);
hoverAndDescent(m);
ball();
