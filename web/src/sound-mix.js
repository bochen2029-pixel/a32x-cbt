// sound-mix.js — what the flight sounds like, as numbers. The pure half of sound.js: no browser, no audio,
// nothing kept between calls but what the caller hands back in. The sound is an observer of the core's
// readouts and of nothing else, and it writes nothing back. GPLv3.
//
// The ear is aboard. What reaches it comes three ways, and the mix keeps them apart:
//   through the structure   the drive's vibration, the gear, the thrusters' valves, anything that strikes the
//                           hull: it excites the hull's own modes, which ring and die away. This is all there
//                           is in a vacuum, and it is felt more than heard.
//   through the air         the drive's roar and crackle, the wind over the skin, the plasma of an entry.
//                           Each is as strong as the air is dense, so it fades with height to nothing.
//   in the cabin            fans and a faint electrical hum.
// A camera outside the craft hears only what the air carries to it, late by the time the sound takes to
// get there, and nothing at all where there is no air; the structure is still felt, fainter.
//
// Every level is a share of the drive's roar at full power at sea level, which is 1: the loudest thing.
// docs/provenance.md, 1h, "The map and the sound", names where the ideas come from.

export const RHO0 = 1.225;      // kg/m3, the standard's air at sea level
export const C0 = 340.294;      // m/s, its speed of sound

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const sat = (v) => clamp(v, 0, 1);
const num = (v) => (Number.isFinite(v) ? v : 0);
// 0 below a, 1 above b, a smooth S between
export const smooth = (a, b, x) => { const t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// ---- levels: each voice at its loudest, as a share of the full-power roar ------------------------

export const LEVEL = {
  roar: 1.0,           // the drive through the air: full power, sea level, in the cabin
  tear: 0.22,          // its bright edge
  crackle: 0.5,        // its shocklets
  vib: 0.34,           // the drive through the structure: rumble
  hum: 0.2,            // and its machinery's hum
  shear: 0.03,         // and its metallic shear
  kick: 0.3,           // the throttle moving: the hull is struck by the change
  wind: 0.5,           // the air over the skin at the highest dynamic pressure of the ascent
  windLow: 0.3,        // the same, through the skin
  buffet: 0.4,         // a wing past its smooth angle
  plasma: 0.6,         // an entry at its hottest
  plasmaCrackle: 0.3,
  rcs: 0.2,            // the small thrusters, full on
  roll: 0.3,           // the tyres at take-off speed
  joint: 1.0,          // the runway's joints, each a knock: its strength at speed
  brake: 0.2,
  fans: 0.12,          // the cabin: heard, never noticed
  elec: 0.02,
  room: 0.12,          // the Ring's interior: its air
  airy: 0.05,
  lift: 0.12,          // a spoke's lift, moving
};

export const Q_REF = 36600;        // Pa: the ascent's highest dynamic pressure (flight/orbit/README.md)
export const HEAT_REF = 5.0e5;     // W/m2: a returning orbiter's peak, to which the plasma is scaled
export const NOSE_RADIUS = 1.0;    // m, for the heating
export const RCS_ACC = 0.5;        // m/s2 an axis: the core's small thrusters
export const SPREAD_REF = 70;      // m: the chase view's own distance, where the outside roar is 1
export const WARP_SILENT = 50;     // from this clock rate up there is no sound
export const NOZZLE_AFT = 14;      // m behind the craft's origin, where the drive's sound comes from
export const MAX_DELAY = 4;        // s: the longest wait the outside path keeps; past it the sound is lost

// ---- the air at the craft, from the readouts alone ----------------------------------------------
// The core gives the speed through the air, the Mach number and the dynamic pressure, so the speed of
// sound is tas / mach and the density 2 q / tas^2: nothing else is asked of it. At rest neither ratio
// exists; the craft is then on the ground or near it and the air is the standard's by height.
export function airOf(s, out) {
  const tas = num(s.tas), mach = num(s.mach);
  if (tas > 5 && mach > 1e-4) {
    out.sound = tas / mach;
    out.rho = Math.max(0, (2 * num(s.qbar)) / (tas * tas));
  } else {
    const alt = Math.max(0, num(s.alt));
    out.sound = C0;
    out.rho = RHO0 * Math.exp(-alt / 8400);
  }
  return out;
}

// The stagnation point's heating in a fast flow, W/m2: Sutton and Graves's form for air,
// k sqrt(rho / r_nose) v^3. It is what an entry's plasma sounds as loud as.
export function heatFlux(rho, tas) {
  return 1.7415e-4 * Math.sqrt(Math.max(0, rho) / NOSE_RADIUS) * tas * tas * tas;
}

// ---- the drive's crackle ------------------------------------------------------------------------
// A rocket's roar is not smooth noise: it carries shocklets, steep fronts with a slow fall behind, arriving
// at random (a Poisson process) and more often the harder the engine runs, so that the pressure trace
// leans positive. Here each is one sample let through a threshold and then shaped by two filters. The
// noise ahead of the threshold is the sum of two loops of different lengths, each uniform on -1/2..1/2:
// a triangular law on -1..1, of which the share above x is (1 - x)^2 / 2.

export const CRACKLE = { rate: 900, theta: 0.5, power: 1.3 };

export function crackleRate(throttle) {   // shocklets a second
  const t = sat(num(throttle));
  return CRACKLE.rate * t * Math.sqrt(t);
}

// The gain ahead of the threshold that lets `rate` shocklets a second through at this sample rate.
export function crackleDrive(rate, sampleRate) {
  const p = clamp(num(rate) / sampleRate, 0, 0.125);
  return CRACKLE.theta / (1 - Math.sqrt(2 * p));
}

// The threshold as a WaveShaper's curve over -1..1: nothing below theta, then rising to 1.
export function crackleCurve(n = 4097) {
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (2 * i) / (n - 1) - 1;
    curve[i] = x > CRACKLE.theta ? Math.pow((x - CRACKLE.theta) / (1 - CRACKLE.theta), CRACKLE.power) : 0;
  }
  return curve;
}

// ---- the hull -----------------------------------------------------------------------------------
// The structure's modes, made up for a 28 m hull: a stretched, inharmonic series. Driven by noise each is
// a narrow band that swells and falls slowly, which is the hum; struck, each rings and dies away in
// q / (pi hz) seconds to 1/e. Under the drive's load the hull rings longer: each q is multiplied by
// hullQ(throttle), which falls back slowly when the drive stops, so the hull rings down (after ASTRA-7's
// hull modes, whose damping falls as the drive rises; docs/provenance.md).
export const HULL = [
  { hz: 37.0, q: 24, gain: 1.0, pan: -0.25 },
  { hz: 58.6, q: 30, gain: 0.9, pan: 0.25 },
  { hz: 92.1, q: 38, gain: 0.75, pan: -0.25 },
  { hz: 149, q: 46, gain: 0.6, pan: 0.25 },
  { hz: 241, q: 52, gain: 0.46, pan: -0.25 },
  { hz: 388, q: 56, gain: 0.34, pan: 0.25 },
  { hz: 641, q: 56, gain: 0.22, pan: -0.25 },
  { hz: 1079, q: 50, gain: 0.13, pan: 0.25 },
];

export const HULL_RING = 2.5;      // at full power each mode's q is this many times its own

// Seconds for a struck mode to fall by 60 dB, with its q multiplied by k.
export function ringTime(mode, k = 1) { return (Math.log(1000) * mode.q * k) / (Math.PI * mode.hz); }

// How much longer the hull rings under the drive's load: 1 at rest, HULL_RING at full power.
export function hullQ(throttle) { return 1 + (HULL_RING - 1) * Math.pow(sat(num(throttle)), 0.8); }

// ---- the drive's shear --------------------------------------------------------------------------
// A metallic note in the structure that never resolves: two-operator FM with the modulator at pi times
// the carrier, so no partial is a multiple of another (ASTRA-7's boundary shear, docs/provenance.md). The
// index stays small here, a few radians, so it is an edge and not a noise; the deviation the modulator's
// gain is set to is index x the modulator's frequency.
export const SHEAR_RATIO = Math.PI;
export function shearHz(throttle) { return 240 + 80 * sat(num(throttle)); }
export function shearIndex(throttle) { const t = sat(num(throttle)); return 0.5 + 2.5 * t * Math.sqrt(t); }

// ---- a listener that flies along ----------------------------------------------------------------
// The chase camera rides with the craft through still air. Sound leaves the drive at the speed of sound
// through that air while the camera moves on, so the wait is not distance / c: it is the t that solves
// |d + v t| = c t, with d the camera's place from the source and v their common velocity. Behind the
// craft the sound comes sooner, ahead of it later, and past the speed of sound only a camera inside the
// cone behind hears anything at all. `path` is how far the sound has travelled through the air, which is
// what it spreads over.
export function carried(dx, dy, dz, vx, vy, vz, c, out) {
  const dd = dx * dx + dy * dy + dz * dz, dv = dx * vx + dy * vy + dz * vz, vv = vx * vx + vy * vy + vz * vz;
  const a = c * c - vv;
  out.heard = 0;
  out.delay = Infinity;
  out.path = Infinity;
  if (!(c > 0)) return out;
  if (dd === 0) { out.heard = 1; out.delay = 0; out.path = 0; return out; }
  if (a > 1e-6 * c * c) {                       // slower than sound: it always arrives
    out.delay = (dv + Math.sqrt(dv * dv + a * dd)) / a;
    out.heard = 1;
  } else if (dv < 0) {                          // at or past it: only from behind, inside the cone
    const disc = dv * dv + a * dd;
    if (disc > 0) {
      out.delay = a > -1e-6 * c * c ? -dd / (2 * dv) : (dv + Math.sqrt(disc)) / a;
      out.heard = smooth(0, 0.2, disc / (dv * dv));
    }
  }
  if (out.heard > 0) out.path = c * out.delay;
  return out;
}

// How much of a sound is left after spreading over `path` metres: 1 at the chase view's own distance.
export function spread(path) { return path <= 0 ? 1.6 : Math.min(1.6, SPREAD_REF / path); }

// The air takes the high notes first: a low-pass whose corner falls with the path, from all of it at
// 150 m to a rumble at 20 km (the corner's two ends are a sketch's, not a measurement).
export function absorbHz(path) {
  if (!(path > 150)) return 18000;
  if (path >= 20000) return 30;
  const t = Math.log(path / 150) / Math.log(20000 / 150);
  return Math.exp(Math.log(18000) * (1 - t) + Math.log(30) * t);
}

// Compressed time is not played as if it were real: the sound falls by 3 dB each time the clock's rate
// doubles and is gone from WARP_SILENT; stopped, nothing moves and nothing sounds.
export function warpDuck(warp) {
  const w = num(warp);
  if (w <= 0 || w >= WARP_SILENT) return 0;
  return w <= 1 ? 1 : 1 / Math.sqrt(w);
}

// A direction from the camera in site axes (east, north, up) into the camera's own axes (x right, y up,
// z back: three.js's camera and the Web Audio listener have the same), unit length. `view` is the camera's
// matrixWorldInverse, sixteen numbers in column order; the camera sits at the origin of what is drawn, so
// only its turn counts. Where the outside ear hears the drive from.
export function toCamera(e, n, u, view, out) {
  const x = e, y = u, z = -n;   // the site's axes as three.js's
  const cx = view[0] * x + view[4] * y + view[8] * z;
  const cy = view[1] * x + view[5] * y + view[9] * z;
  const cz = view[2] * x + view[6] * y + view[10] * z;
  const len = Math.sqrt(cx * cx + cy * cy + cz * cz);
  if (len > 0 && Number.isFinite(len)) { out[0] = cx / len; out[1] = cy / len; out[2] = cz / len; } else { out[0] = 0; out[1] = 0; out[2] = -1; }
  return out;
}

// ---- the mix ------------------------------------------------------------------------------------

// What the mix reads. sound.js fills one of these each frame from the readouts and the page.
export function newInputs() {
  return {
    thr: 0,          // 0..1, what the drive gives
    thrRate: 0,      // 1/s, how fast that changes
    rho: RHO0,       // kg/m3, the air at the craft
    sound: C0,       // m/s
    tas: 0, mach: 0, qbar: 0, alpha: 0,   // m/s, -, Pa, degrees
    onGround: 1, gear: 1, crashed: 0, docked: 0,
    decel: 0,        // m/s2 lost along the runway: the brakes
    rcs: 0,          // 0..1, the small thrusters pushing
    rcsSide: 0,      // -1 left .. 1 right, where that is heard from
    att: 0,          // 0..1, the small thrusters turning
    heat: NaN,       // 0..1 to stand for the entry's heating; NaN: derived from the air and the speed
    outside: 0,      // 1 when the camera is outside the craft
    range: 70,       // m, the camera from the drive
    dirX: 0, dirY: 0, dirZ: -1,   // the drive from the camera, a unit vector in the camera's axes (toCamera)
    delay: 0,        // s, from carried(): the camera's wait for the drive's sound
    path: 0,         // m, how far that sound travels through the air
    heard: 1,        // 0..1, whether it arrives at all
    scene: 0,        // 0 the flight, 1 the Ring's interior, 2 its hub
    walk: 0,         // m/s, the walker's speed
    lift: 0,         // 0..1, a lift moving
    warp: 1,         // the clock's rate
    skipping: 0,
    volume: 0.7,     // the master
    muted: 0,
    sampleRate: 48000,
  };
}

export const MIX_KEYS = [
  'roar', 'roarHz', 'lowHz', 'tear', 'crackDrive', 'crack', 'vib', 'hum', 'humHz', 'shear', 'shearHz', 'shearDev', 'hullQ', 'kick',
  'wind', 'windHz', 'windLow', 'buffet', 'plasma', 'plasmaHz', 'plasCrackDrive', 'plasCrack',
  'rcs', 'rcsPan', 'roll', 'rollHz', 'joint', 'brake', 'fans', 'elec',
  'room', 'airy', 'lift', 'liftHz',
  'hullView', 'cabinView', 'jetAboard', 'skinAboard', 'out', 'outX', 'outY', 'outZ', 'knocksAir', 'outDelay', 'outHz', 'ring', 'life', 'master',
];

export function newMix() {
  const m = {};
  for (const k of MIX_KEYS) m[k] = 0;
  return m;
}

// The whole mix, as targets for the graph's gains and corners. Defined for every input: anything that is
// not a number counts as nothing. Allocates nothing.
export function mix(i, out) {
  const thr = sat(num(i.thr)), rho = Math.max(0, num(i.rho));
  const air = sat(rho / RHO0);                       // how much sound the air carries
  const mach = Math.max(0, num(i.mach)), tas = Math.max(0, num(i.tas)), q = Math.max(0, num(i.qbar));
  const grounded = num(i.onGround) > 0.5, flight = num(i.scene) < 0.5;
  const alive = num(i.crashed) > 0.5 ? 0 : 1;
  const fs = num(i.sampleRate) > 8000 ? i.sampleRate : 48000;

  // the drive, through the air
  out.roar = LEVEL.roar * Math.pow(thr, 0.8) * air;
  out.roarHz = 170 + 420 * thr;
  out.lowHz = 80 + 80 * thr;
  out.tear = LEVEL.tear * thr * thr * air;
  out.crackDrive = crackleDrive(crackleRate(thr), fs);
  out.crack = LEVEL.crackle * Math.sqrt(thr) * air;   // it thins faster than this: fewer shocklets and weaker ones
  // the drive, through the structure: there with or without air
  out.vib = LEVEL.vib * Math.pow(thr, 0.8);
  out.hum = LEVEL.hum * Math.pow(thr, 0.6);
  out.humHz = 29 + 19 * thr;
  out.shear = LEVEL.shear * Math.sqrt(thr);
  out.shearHz = shearHz(thr);
  out.shearDev = shearIndex(thr) * SHEAR_RATIO * out.shearHz;
  out.hullQ = hullQ(thr);
  out.kick = LEVEL.kick * sat(Math.abs(num(i.thrRate)) / 2.5);

  // the air over the skin
  const qn = Math.min(1.3, q / Q_REF);
  const transonic = Math.exp(-(((mach - 1) / 0.12) ** 2)) * Math.min(1, q / 15000);
  const gearOut = !grounded && num(i.gear) > 0.5 ? Math.min(1, q / 6000) : 0;   // the legs in the stream
  out.wind = LEVEL.wind * Math.min(1, Math.pow(qn, 0.6) + 0.25 * gearOut);
  out.windHz = 280 + 520 * Math.min(1, mach) + 240 * Math.min(1, mach / 4);
  out.windLow = LEVEL.windLow * Math.min(1, 0.6 * Math.pow(qn, 0.6) + 0.8 * transonic + 0.5 * gearOut);
  out.buffet = grounded ? 0 : LEVEL.buffet * smooth(14, 28, Math.abs(num(i.alpha))) * Math.min(1, q / 8000);

  // an entry: the shock's hot gas over the skin, as loud as the heating
  const heat = Number.isFinite(i.heat) ? sat(i.heat) : Math.min(1.2, heatFlux(rho, tas) / HEAT_REF);
  out.plasma = LEVEL.plasma * Math.min(1, Math.pow(heat, 0.7));
  out.plasmaHz = 140 + 280 * Math.min(1, heat);
  out.plasCrackDrive = crackleDrive(500 * Math.min(1, heat), fs);
  out.plasCrack = LEVEL.plasmaCrackle * Math.min(1, Math.sqrt(heat));

  // the small thrusters
  out.rcs = LEVEL.rcs * Math.max(sat(num(i.rcs)), 0.6 * sat(num(i.att)));
  out.rcsPan = 0.7 * clamp(num(i.rcsSide), -1, 1);

  // the gear on the runway
  const rolling = grounded ? Math.min(1, tas / 95) : 0;
  out.roll = LEVEL.roll * Math.pow(rolling, 0.7);
  out.rollHz = 90 + 3 * Math.min(tas, 120);
  out.joint = grounded && num(i.gear) > 0.5 ? LEVEL.joint * Math.pow(Math.min(1, tas / 30), 0.7) : 0;   // a knock at each (joints)
  out.brake = grounded ? LEVEL.brake * sat((num(i.decel) - 1.2) / 3) * Math.min(1, tas / 8) : 0;

  // the cabin
  out.fans = LEVEL.fans;
  out.elec = LEVEL.elec;

  // inside the Ring
  const inRing = num(i.scene) > 0.5, inHub = num(i.scene) > 1.5;
  out.room = inRing ? LEVEL.room * (inHub ? 0.3 : 1) : 0;
  out.airy = inRing ? LEVEL.airy * (inHub ? 0.15 : 1) : 0;
  out.lift = inRing ? LEVEL.lift * sat(num(i.lift)) : 0;
  out.liftHz = 52 + 14 * sat(num(i.lift));

  // where the ear is: aboard, or with a camera outside
  const outside = num(i.outside) > 0.5;
  const heard = sat(num(i.heard)), path = Math.max(0, num(i.path));
  out.hullView = flight ? (outside ? 0.5 * air : 1) : 0;    // a camera outside hears the craft only through the air
  out.cabinView = flight ? (outside ? 0.45 * air : 1) : 0;
  out.jetAboard = flight && !outside ? 1 - smooth(0.6, 1.0, mach) : 0;   // the cabin is ahead of the drive
  out.skinAboard = flight && !outside ? 1 : 0;
  const reach = heard > 0 && Number.isFinite(i.delay) && i.delay >= 0 && i.delay <= MAX_DELAY;
  out.out = flight && outside && reach ? heard * spread(path) : 0;
  const dx = num(i.dirX), dy = num(i.dirY), dz = num(i.dirZ), dl = Math.sqrt(dx * dx + dy * dy + dz * dz);
  out.outX = dl > 0 ? dx / dl : 0;
  out.outY = dl > 0 ? dy / dl : 0;
  out.outZ = dl > 0 ? dz / dl : -1;
  out.knocksAir = air;   // a knock or the tyres, to that camera: as much as there is air to carry it
  // unheard, the delay line waits where still air would put it, so that it has little way to slide when the sound returns
  out.outDelay = reach ? i.delay : Math.min(MAX_DELAY, Math.max(0, num(i.range)) / C0);
  out.outHz = reach ? absorbHz(path) : absorbHz(num(i.range));
  out.ring = inRing ? 1 : 0;

  // after a crash, silence; the clock's rate; the master
  out.life = alive;
  out.master = num(i.muted) > 0.5 || num(i.skipping) > 0.5 ? 0 : sat(num(i.volume)) * warpDuck(i.warp);
  return out;
}

// ---- moments ------------------------------------------------------------------------------------

export const EVENT_KEYS = ['ignition', 'shutdown', 'boom', 'gear', 'touchdown', 'screech', 'crash', 'capture', 'release', 'contact', 'rcsOn', 'rcsOff'];

export function newEvents() {
  const e = {};
  for (const k of EVENT_KEYS) e[k] = 0;
  return e;
}

// What the last frame is remembered by.
export function newMemory() {
  return { t: -1, thr: 0, mach: 0, gear: 1, onGround: 1, crashed: 0, docked: 0, vs: 0, g: 0, rcs: 0, valid: 0 };
}

// What happened between the last frame and this one: each a strength 0..1 (boom: +1 through the speed of
// sound going up, -1 coming down; gear: +1 down, -1 up), 0 for nothing. A frame that follows a jump in
// time (a restart, a skip ahead, the clock run fast) reports nothing: its moments were not lived through.
export function detect(mem, s, extra, out) {
  for (const k of EVENT_KEYS) out[k] = 0;
  const t = num(s.t), dt = t - mem.t;
  const thr = sat(num(s.throttle)), mach = num(s.mach), gear = num(s.gear) > 0.5 ? 1 : 0, onGround = num(s.onGround) > 0.5 ? 1 : 0;
  const crashed = num(s.crashed) > 0.5 ? 1 : 0, docked = num(extra.docked) > 0.5 ? 1 : 0, g = num(s.g), rcs = num(extra.rcs);
  if (mem.valid && dt > 0 && dt <= 1.0) {
    if (mem.thr < 0.02 && thr >= 0.02) out.ignition = 0.7;
    if (mem.thr >= 0.05 && thr < 0.05) out.shutdown = 0.6;
    if ((mem.mach - 1) * (mach - 1) < 0 && num(s.qbar) > 50) out.boom = mach > mem.mach ? 1 : -1;
    if (gear !== mem.gear) out.gear = gear ? 1 : -1;
    if (!mem.onGround && onGround && !crashed) {
      out.touchdown = 0.3 + 0.7 * sat(-mem.vs / 4);
      out.screech = sat(num(s.tas) / 80);
    }
    if (!mem.crashed && crashed) out.crash = 1;
    if (!mem.docked && docked) out.capture = 1;
    if (mem.docked && !docked) out.release = 1;
    // something pushed the craft that was neither the drive nor the thrusters nor the air nor the ground
    const quiet = thr < 0.01 && num(s.qbar) < 1 && !onGround && !docked && !mem.docked && !crashed;
    if (quiet && g > 0.13 && mem.g <= 0.13) out.contact = sat((g - 0.1) / 1.2);
    if (mem.rcs < 0.08 && rcs >= 0.08) out.rcsOn = sat(rcs);
    if (mem.rcs >= 0.08 && rcs < 0.08) out.rcsOff = sat(mem.rcs);
  }
  mem.t = t; mem.thr = thr; mem.mach = mach; mem.gear = gear; mem.onGround = onGround; mem.crashed = crashed;
  mem.docked = docked; mem.vs = num(s.vs); mem.g = g; mem.rcs = rcs; mem.valid = 1;
  return out;
}

// ---- the runway's joints -------------------------------------------------------------------------
// The concrete is laid in slabs with a joint every JOINT_M. The nose wheel crosses each and the main wheels
// cross it WHEELBASE_M later (the core's contacts, orbit_core.cpp: body x 10 and -3): ba-dum, ba-dum, which
// runs together into a rumble as the speed rises. Given the distance rolled at the last frame and at this
// one, the joints crossed between them, as fractions of the way (0 at d0, 1 at d1), into `out`, at most its
// length; returns how many. Allocates nothing.
export const JOINT_M = 6, WHEELBASE_M = 13;

export function joints(d0, d1, out) {
  if (!(d1 > d0) || !Number.isFinite(d0) || !Number.isFinite(d1)) return 0;
  let n = 0;
  const span = d1 - d0;
  for (let x = Math.floor(d0 / JOINT_M + 1) * JOINT_M; x <= d1 && n < out.length; x += JOINT_M) out[n++] = (x - d0) / span;
  for (let x = Math.floor((d0 - WHEELBASE_M) / JOINT_M + 1) * JOINT_M + WHEELBASE_M; x <= d1 && n < out.length; x += JOINT_M) out[n++] = (x - d0) / span;
  return n;
}

// ---- the small thrusters, heard ------------------------------------------------------------------
// The readouts do not say when the thrusters fire. The pilot's hands do, when the pilot flies; when the
// crew does, the felt acceleration says it: above the air with the drive off, nothing else pushes.
export function thrusting(s, hands, pilotFlies) {
  if (num(s.onGround) > 0.5 || num(s.crashed) > 0.5) return 0;
  if (pilotFlies) return sat(Math.max(Math.abs(num(hands.tx)), Math.abs(num(hands.ty)), Math.abs(num(hands.tz))));
  if (num(s.throttle) > 0.01 || num(s.qbar) > 5) return 0;
  return sat((num(s.g) * 9.80665) / RCS_ACC);
}

// The craft's turning, from two attitudes dt apart: the angle between them over dt, rad/s. Quaternions
// [w, x, y, z]; the sign of a quaternion means nothing.
export function turnRate(q0, q1, dt) {
  if (!(dt > 0)) return 0;
  const d = Math.abs(q0[0] * q1[0] + q0[1] * q1[1] + q0[2] * q1[2] + q0[3] * q1[3]);
  return (2 * Math.acos(Math.min(1, d))) / dt;
}

// The thrusters turning the craft, 0..1: how fast its turning changes, against what the thrusters can
// give (about 0.1 rad/s2). Only above the air, where the surfaces have nothing to push on.
export function turning(rateNow, rateBefore, dt, s) {
  if (!(dt > 0) || dt > 0.11 || num(s.onGround) > 0.5 || num(s.qbar) > 400) return 0;
  return smooth(0.02, 0.1, Math.abs(rateNow - rateBefore) / dt);
}

// ---- made-up signals: noise, and a room's answer -------------------------------------------------

// White noise, uniform on -scale..scale, from a seed (xorshift32): the same seed, the same noise.
export function fillNoise(buf, seed, scale = 1) {
  let x = (seed | 0) || 0x9e3779b9;
  for (let i = 0; i < buf.length; i++) {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    buf[i] = ((x >>> 0) / 4294967296 * 2 - 1) * scale;
  }
  return buf;
}

// A great room's answer to a clap, made up: after the first silence while the sound crosses to the nearest
// wall, noise that dies away by 60 dB in `seconds`, its high notes first, with one late return from a roof
// `roofM` metres overhead. The Ring's interior is 300 m from floor to roof.
export function roomResponse(left, right, sampleRate, { seconds = 5.5, predelay = 0.06, roofM = 300, roofGain = 0.25, seed = 7 } = {}) {
  const n = left.length, k = Math.log(1000) / (seconds * sampleRate);
  const start = Math.floor(predelay * sampleRate), roof = Math.floor(((2 * roofM) / 343) * sampleRate);
  fillNoise(left, seed);
  fillNoise(right, seed * 31 + 11);
  for (const ch of [left, right]) {
    let lp = 0;
    for (let i = 0; i < n; i++) {
      if (i < start) { ch[i] = 0; continue; }
      const age = i - start;
      const a = 0.9 * Math.exp(-age / (0.35 * seconds * sampleRate)) + 0.06;   // the low-pass closes as the tail ages
      lp += a * (ch[i] - lp);
      ch[i] = lp * Math.exp(-k * age);
    }
    for (let i = n - 1; i >= roof; i--) ch[i] += roofGain * ch[i - roof + start];   // the roof's return
  }
  return [left, right];
}
