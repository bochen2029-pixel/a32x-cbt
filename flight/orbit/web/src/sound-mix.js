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
// get there, and nothing at all where there is no air: the drive, and the hull and the cabin as they
// sound through their skin, all the same way.
//
// Over the Ring's flight deck the craft is in vacuum (the deck's roof is open): the swivelled drive, the
// hover's load, the nose's lift jet, the roll posts and the gear on the plating are all the structure's.
// Inside the Ring the air is the sea level's, turning with the Ring, so in its frame it stands still and
// sound crosses it at 343 m/s: the band's distant hum, its air handling, the canal, the lifts, footsteps
// and a ball, each heard from where it is, in a room of its own (the band, the hub's lobby, a lift's car)
// whose answer is worked out from its size and its surfaces.
//
// Every level is a share of the drive's roar at full power at sea level, which is 1: the loudest thing.
// docs/provenance.md, 1h, "The map and the sound", names where the ideas come from.

import { RING } from './core.js';
import { WALK } from './walk-core.js';
import { surfaceAt } from './walk-math.js';

export const RHO0 = 1.225;      // kg/m3, the standard's air at sea level
export const C0 = 340.294;      // m/s, its speed of sound

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const sat = (v) => clamp(v, 0, 1);
const num = (v) => (Number.isFinite(v) ? v : 0);
const D2R = Math.PI / 180;
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
  hover: 0.14,         // the flight deck, through the structure: the hover's loaded thrum, all the thrust through the swivel
  duct: 0.12,          // the drive's flow turned down in the swivel's duct, full power, straight down
  whine: 0.05,         // the nose's lift jet, under the cockpit
  posts: 0.07,         // the roll posts, working hard
  actuator: 0.04,      // the swivel's actuators at their full rate
  room: 0.12,          // the Ring's interior: the band's air, all its far sounds together
  airy: 0.05,          // its air handling
  city: 0.06,          // the town's hum, far off, swelling and falling
  canal: 0.07,         // the canal's water, at its bank
  draught: 0.06,       // the wind where a lift's doors stand open
  rush: 0.1,           // a lift's car at its cruise: the air in the tube, the rails
  lift: 0.12,          // a spoke's lift, moving: its motor, aboard the car
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

// A sonic boom is the Mach cone's surface passing over the ear: the shock a craft faster than sound drags
// behind it. For any ear, still on the ground or riding along, the cone has passed when carried() starts or
// stops finding the sound arriving at all, so a boom is heard where `heard` leaves or reaches nothing between
// two moments of a supersonic flight: never ahead of the cone, never deep inside it. How hard: the far
// field's N-wave, its overpressure falling as the distance to the three-quarters power (Whitham's), and
// with the air's density's square root (the pressure where it is made and where it is heard, Carlson's);
// 1 at the chase view's 70 m at sea level.
export function boomStrength(range, rho) {
  const r = Math.max(SPREAD_REF, num(range));
  return Math.min(1, Math.pow(SPREAD_REF / r, 0.75) * Math.sqrt(sat(num(rho) / RHO0)));
}
export function conePassed(wasHeard, heard, machBefore, machNow) {
  return Math.max(num(machBefore), num(machNow)) >= 1 && (num(wasHeard) > 0) !== (num(heard) > 0);
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
    nozzle: 0,       // degrees, the drive's swivel: 0 aft, 90 down (the deck's readouts)
    nozzleRate: 0,   // degrees a second it turns
    posts: 0,        // 0..1, the roll posts working (jetWork)
    postsSide: 0,    // -1 the left post, 1 the right
    liftJet: 0,      // 0..1, the nose's lift jet working
    scene: 0,        // 0 the flight, 1 the Ring's band, 2 its hub's lobby, 3 a lift's car
    walk: 0,         // m/s, the walker's speed
    lift: 0,         // 0..1, a lift's motor under load, as near it as the ear is
    car: 0,          // 0..1, the speed of the car the ear rides in, of its cruise
    canal: 0,        // 0..1, the canal's water, as heard from here (canalHeard)
    canalPan: 0,     // -1..1, from which side
    draught: 0,      // 0..1, the wind at an open lift door, as near it as the ear is
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
  'hover', 'hoverHz', 'duct', 'whine', 'whineHz', 'posts', 'postsPan', 'actuator', 'actuatorHz',
  'room', 'airy', 'city', 'canal', 'canalPan', 'draught', 'rush', 'rushHz', 'lift', 'liftHz', 'verbBand', 'verbHub', 'verbCar',
  'hullView', 'cabinView', 'jetAboard', 'skinAboard', 'hullAir', 'cabinAir', 'out', 'outX', 'outY', 'outZ', 'knocksAir', 'outDelay', 'outHz',
  'ring', 'life', 'master', 'ui',
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

  // the flight deck: the drive turned down through its swivel and the jets that bleed it, all felt through
  // the structure. The hover's load goes into the airframe at the swivel's bearing, amidships, and rings a
  // mode of its own; the flow turned in the duct roars as much as it is turned; the lift jet whines under
  // the cockpit as its share of the flow rises; the roll posts hiss with their trim flow and more as they work.
  const sw = clamp(num(i.nozzle), 0, 90) * D2R, jet = thr * Math.sin(sw);
  out.hover = LEVEL.hover * Math.pow(jet, 0.8);
  out.hoverHz = 38 + 8 * jet;
  out.duct = LEVEL.duct * Math.pow(thr, 0.8) * (1 - Math.cos(sw));
  const liftJet = sat(num(i.liftJet)), posts = sat(num(i.posts));
  out.whine = LEVEL.whine * Math.min(1, Math.pow(jet, 0.7) * (0.75 + 0.5 * liftJet));
  out.whineHz = 2100 + 900 * jet + 250 * liftJet;
  out.posts = LEVEL.posts * Math.min(1, jet * (0.3 + 0.7 * posts));
  out.postsPan = 0.6 * clamp(num(i.postsSide), -1, 1);
  const turn = sat(Math.abs(num(i.nozzleRate)) / SWIVEL_DPS);
  out.actuator = LEVEL.actuator * turn;
  out.actuatorHz = 150 + 90 * turn;

  // inside the Ring: the band's air and its far sounds, the canal, the lifts; quieter in the hub's lobby, and
  // in a car its own sounds. Each place answers what is played in it with its own reverb (ROOMS).
  const place = Math.round(clamp(num(i.scene), 0, 3)), band = place === 1, hub = place === 2, car = place === 3, inRing = place > 0;
  out.room = LEVEL.room * (band ? 1 : hub ? 0.3 : car ? 0.25 : 0);
  out.airy = LEVEL.airy * (band ? 1 : hub ? 0.6 : car ? 0.3 : 0);
  out.city = band ? LEVEL.city : 0;
  out.canal = band ? LEVEL.canal * sat(num(i.canal)) : 0;
  out.canalPan = clamp(num(i.canalPan), -1, 1);
  out.draught = inRing ? LEVEL.draught * sat(num(i.draught)) : 0;
  const carV = sat(num(i.car));
  out.rush = car ? LEVEL.rush * carV * carV : 0;
  out.rushHz = 250 + 650 * carV;
  out.lift = inRing ? LEVEL.lift * sat(num(i.lift)) : 0;
  out.liftHz = 52 + 14 * sat(num(i.lift));
  out.verbBand = band ? SHARE.band : 0;
  out.verbHub = hub ? SHARE.hub : 0;
  out.verbCar = car ? SHARE.car : 0;

  // where the ear is: aboard, or with a camera outside, which hears the craft only through the air: its
  // drive, and its hull and its cabin as they sound through the skin, all late by the way, thinned by it,
  // and only inside the Mach cone
  const outside = num(i.outside) > 0.5;
  const heard = sat(num(i.heard)), path = Math.max(0, num(i.path));
  out.hullView = flight && !outside ? 1 : 0;
  out.cabinView = flight && !outside ? 1 : 0;
  out.hullAir = flight && outside ? 0.9 * air : 0;
  out.cabinAir = flight && outside ? 0.8 * air : 0;
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
  out.ui = num(i.muted) > 0.5 ? 0 : sat(num(i.volume));   // the page's own tones: at the volume, whatever the clock
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

// ---- the flight deck: the craft as a jet ---------------------------------------------------------
// What the deck's readouts (orbit_deck.h) do not say, the craft's motion does: the roll posts and the lift jet
// work when the law asks for an angular acceleration in roll or in pitch, and they can give it in proportion
// to the thrust through the swivel (internal.h: ROLL_POST_ANG, LIFT_JET_ANG, with the thrusters' RCS_ANG
// beside them).

export const SWIVEL_DPS = 15;                         // orbit_deck.h, OC_DECK_SWIVEL_DPS
export const POST_ACC = 0.40, LIFT_JET_ACC = 0.14;    // rad/s2 at full thrust through the swivel
export const RCS_ROLL_ACC = 0.15, RCS_PITCH_ACC = 0.10;

// The thrust through the swivel, 0..1 of full: what holds the craft up over the deck.
export function jetBorne(throttle, nozzleDeg) { return sat(num(throttle)) * Math.sin(clamp(num(nozzleDeg), 0, 90) * D2R); }

// The body's angular velocity from two attitudes dt apart, rad/s about its own axes (x forward, y right, z
// down: roll, pitch, yaw), into out. Quaternions [w, x, y, z], body to site.
export function bodyRates(q0, q1, dt, out) {
  out[0] = 0; out[1] = 0; out[2] = 0;
  if (!(dt > 0)) return out;
  const w0 = q0[0], x0 = -q0[1], y0 = -q0[2], z0 = -q0[3];
  let w = w0 * q1[0] - x0 * q1[1] - y0 * q1[2] - z0 * q1[3];
  let x = w0 * q1[1] + x0 * q1[0] + y0 * q1[3] - z0 * q1[2];
  let y = w0 * q1[2] - x0 * q1[3] + y0 * q1[0] + z0 * q1[1];
  let z = w0 * q1[3] + x0 * q1[2] - y0 * q1[1] + z0 * q1[0];
  if (w < 0) { w = -w; x = -x; y = -y; z = -z; }
  const s = Math.sqrt(x * x + y * y + z * z);
  if (!(s > 1e-15) || !Number.isFinite(s)) return out;
  const k = (2 * Math.atan2(s, w)) / (s * dt);
  out[0] = x * k; out[1] = y * k; out[2] = z * k;
  return out;
}

// How hard the roll posts and the lift jet work, 0..1 each, from the angular accelerations in roll and pitch
// (rad/s2) and the thrust through the swivel: the law shares what it asks among the jets and the thrusters
// by what each can give, so each works at what is asked over what all of them can give together. The side
// is the post that fires: a roll to the right lifts the left wing. Into out: [posts, side, liftJet].
export function jetWork(rollAcc, pitchAcc, jet, out) {
  const j = sat(num(jet)), p = num(rollAcc), q = num(pitchAcc);
  out[0] = 0; out[1] = 0; out[2] = 0;
  if (j < 0.02) return out;
  out[0] = sat(Math.abs(p) / (POST_ACC * j + RCS_ROLL_ACC));
  out[1] = p > 0 ? -1 : p < 0 ? 1 : 0;
  out[2] = sat(Math.abs(q) / (LIFT_JET_ACC * j + RCS_PITCH_ACC));
  return out;
}

// The deck's moments, found from its readouts as the flight's are from the core's: each a strength 0..1, 0
// for nothing. pad: the gear meets the plating (sink: m/s); liftoff: the legs come off it and the struts top
// out; swivel: the swivel comes to rest after turning; puff: a roll post opens (side: which). None after a
// jump in time, nor for a touchdown the deck calls a crash (the crash is the flight's).
export const DECK_EVENT_KEYS = ['pad', 'sink', 'liftoff', 'swivel', 'puff', 'side'];

export function newDeckEvents() {
  const e = {};
  for (const k of DECK_EVENT_KEYS) e[k] = 0;
  return e;
}

export function newDeckMemory() { return { t: -1, tdT: 0, onDeck: 0, nozzle: 0, turning: 0, travel: 0, posts: 0, valid: 0 }; }

// d: the deck's readouts (null without a deck); s: the core's; posts, side: jetWork's this frame.
export function detectDeck(mem, d, s, posts, side, out) {
  for (const k of DECK_EVENT_KEYS) out[k] = 0;
  if (!d) return out;
  const t = num(s.t), dt = t - mem.t, tdT = num(d.tdT), onDeck = num(d.onDeck) > 0.5 ? 1 : 0, nozzle = num(d.nozzle);
  const crashed = num(s.crashed) > 0.5, work = sat(num(posts));
  const rate = dt > 0 ? Math.abs(nozzle - mem.nozzle) / dt : 0, turning = rate > 1 ? 1 : rate < 0.3 ? 0 : mem.turning;
  if (mem.valid && dt > 0 && dt <= 1.0) {
    if (tdT !== mem.tdT && tdT > 0 && Math.round(num(d.tdVerdict)) !== 2 && !crashed) {
      out.sink = Math.max(0, num(d.tdSink));
      out.pad = sat(0.2 + out.sink / 2);
    }
    if (mem.onDeck && !onDeck && !crashed) out.liftoff = 1;
    if (mem.turning && !turning && mem.travel > 3) out.swivel = sat(mem.travel / 45);
    if (mem.posts < 0.2 && work >= 0.2 && !crashed) { out.puff = work; out.side = num(side); }
  }
  mem.travel = turning ? (mem.turning ? mem.travel : 0) + Math.abs(nozzle - mem.nozzle) : 0;
  mem.t = t; mem.tdT = tdT; mem.onDeck = onDeck; mem.nozzle = nozzle; mem.turning = turning; mem.posts = work; mem.valid = 1;
  return out;
}

// ---- inside the Ring: its air, its rooms -----------------------------------------------------------
// The Ring's air is the standard's at sea level, at 20 °C (chosen), turning with the Ring: in its frame it
// stands still, so sound crosses it at the speed of sound in still air. The turning itself does nothing a
// person could hear to a sound: Coriolis's turn of a wave in a second is a twentieth of a radian of the
// Ring's spin, against its hundreds of cycles.
export const C_RING = 343.2;   // m/s, at 20 °C
export const OCTAVES = [63, 125, 250, 500, 1000, 2000, 4000, 8000];

// The air's absorption of sound, dB a metre, at f Hz: ISO 9613-1's formula, at T kelvin, rh % relative
// humidity and p kPa. 20 °C and 50 % unless said.
export function airAbsorption(f, T = 293.15, rh = 50, p = 101.325) {
  const pr = 101.325, T0 = 293.15, T01 = 273.16, pa = p / pr, tr = T / T0, f2 = f * f;
  const h = rh * Math.pow(10, -6.8346 * Math.pow(T01 / T, 1.261) + 4.6151) / pa;   // water vapour, % of the molecules
  const frO = pa * (24 + (4.04e4 * h * (0.02 + h)) / (0.391 + h));
  const frN = (pa / Math.sqrt(tr)) * (9 + 280 * h * Math.exp(-4.17 * (Math.pow(tr, -1 / 3) - 1)));
  return 8.686 * f2 * ((1.84e-11 / pa) * Math.sqrt(tr) + Math.pow(tr, -2.5) * ((0.01275 * Math.exp(-2239.1 / T)) / (frO + f2 / frO) + (0.1068 * Math.exp(-3352 / T)) / (frN + f2 / frN)));
}

// What the surfaces take of a sound that meets them, by octave from 63 Hz to 8 kHz (published tables' values
// for such materials from 125 Hz to 4 kHz, the ends carried on: docs/provenance.md).
export const MATERIALS = {
  grass: [0.05, 0.11, 0.26, 0.6, 0.69, 0.92, 0.99, 0.99],          // turf on soil
  water: [0.008, 0.008, 0.008, 0.013, 0.015, 0.02, 0.025, 0.025],
  town: [0.08, 0.06, 0.05, 0.04, 0.04, 0.05, 0.05, 0.05],           // paving, walls and windows
  glass: [0.25, 0.18, 0.06, 0.04, 0.03, 0.02, 0.02, 0.02],          // large heavy panes: the roof
  rubber: [0.02, 0.02, 0.03, 0.03, 0.03, 0.03, 0.02, 0.02],         // the lobby's grip floor
  lined: [0.12, 0.3, 0.65, 0.85, 0.85, 0.75, 0.65, 0.55],           // perforated metal over an absorber
  steel: [0.12, 0.1, 0.07, 0.05, 0.04, 0.04, 0.04, 0.04],           // painted steel panels
};

// The three rooms the ear can be in, from the Ring's numbers (core.js RING, walk-core.js WALK). The band is
// the floor to the roof, wall to wall, all the way round but for the deck's open sector behind its
// bulkheads; the hub's lobby a drum about the axis; a lift's car a steel box. Each reverb's level is its
// diffuse field's against a sound's own at a metre (reverbShare); the band's is lifted, as chosen below.
// Each also has the echoes its shape gives a walker's ear: path, m; what the surfaces on the way keep of the
// sound's energy, each time; seconds of IR to make.
const BAND_OPEN = 1 - RING.deck.arc / (2 * Math.PI * RING.floor);
const FLOOR_M2 = 2 * Math.PI * RING.floor * RING.width * BAND_OPEN, WATER = (2 * WALK.canal) / RING.width, TOWN = 0.3;
const UP = RING.floor - RING.roof - 1.7;   // the ear to the roof
export const ROOMS = {
  band: {
    volume: Math.PI * (RING.floor ** 2 - RING.roof ** 2) * RING.width * BAND_OPEN,
    surfaces: [
      ['grass', FLOOR_M2 * (1 - WATER - TOWN)], ['water', FLOOR_M2 * WATER], ['town', FLOOR_M2 * TOWN],
      ['glass', 2 * Math.PI * RING.roof * RING.width * BAND_OPEN],
      ['town', 2 * Math.PI * (RING.floor ** 2 - RING.roof ** 2) * BAND_OPEN + 2 * (RING.floor - RING.roof) * RING.width],   // the rim walls, the bulkheads
    ],
    // Lifted 20 dB: at its diffuse field's own level, a kilometre's critical distance puts the band's answer
    // to a footstep 56 dB under the step, deep under the band's own hum. Heard, it says how big the band is.
    lift: 10,
    seconds: 8, predelay: 0.06, onset: 1.5,
    // the roof's glass, 298 m over the ear, a mirror at that: then the floor's grass and the roof again
    echoes: [{ path: 2 * UP, keep: 1 - MATERIALS.glass[4], every: 2 * (RING.floor - RING.roof), again: (1 - MATERIALS.grass[4]) * (1 - MATERIALS.glass[4]), n: 3 }],
  },
  hub: {
    volume: Math.PI * WALK.lobby ** 2 * (WALK.lobbyC1 - WALK.lobbyC0),
    surfaces: [['rubber', 2 * Math.PI * WALK.lobby * (WALK.lobbyC1 - WALK.lobbyC0)], ['lined', 2 * Math.PI * WALK.lobby ** 2]],
    lift: 1,
    seconds: 7, predelay: 0.04, onset: 0.4,
    // the drum's far side, 300 m across: a concave mirror of 150 m that brings the sound back to a focus 200 m
    // from it, so that the echo comes as from 346 m (the two curvatures' mean) rather than 600
    echoes: [{ path: Math.sqrt(4 * WALK.lobby * (4 * WALK.lobby) / 3), keep: 1 - MATERIALS.rubber[4], every: 4 * WALK.lobby, again: 0.5 * (1 - MATERIALS.rubber[4]) ** 2, n: 2, at: (4 * WALK.lobby) / C_RING }],
  },
  car: {
    volume: (2 * WALK.car) ** 2 * WALK.carTall,
    surfaces: [['rubber', (2 * WALK.car) ** 2], ['lined', (2 * WALK.car) ** 2], ['steel', 4 * 2 * WALK.car * WALK.carTall]],   // its ceiling lined
    lift: 1,
    seconds: 1.5, predelay: 0.005, onset: 0.02, echoes: [],
  },
};

// A room's equivalent absorption area in octave k, m2: its surfaces' by Eyring's law, and its air's.
export function absorptionArea(room, k) {
  let S = 0, Sa = 0;
  for (const [m, area] of room.surfaces) { S += area; Sa += area * MATERIALS[m][k]; }
  return -S * Math.log(1 - Sa / S) + 4 * (airAbsorption(OCTAVES[k]) / (10 * Math.LOG10E)) * room.volume;
}

// The time a sound takes to die away by 60 dB in it, s, in octave k: Eyring's, with the air.
export function reverbTime(room, k) { return ((24 * Math.LN10) / C_RING) * (room.volume / absorptionArea(room, k)); }

// Its diffuse field against a sound's direct one at a metre, as amplitudes, at 1 kHz: the critical distance's
// square root of 16 pi / A, by the room's lift. A sound d metres off comes in at 1 / d of that, its room's
// answer at this whatever d is.
export function reverbShare(room) { return Math.min(1, room.lift * Math.sqrt((16 * Math.PI) / absorptionArea(room, 4))); }
export const SHARE = { band: reverbShare(ROOMS.band), hub: reverbShare(ROOMS.hub), car: reverbShare(ROOMS.car) };

// The echoes a room's shape gives a walker's ear: [{ at: s, energy: against the diffuse field's whole, hz: the
// corner the air leaves it }]. A reflection's energy is 1 / L² at a metre's 1, kept by the surfaces it meets
// and the air on its way, where the diffuse field's whole is 16 pi / A: so their ratio is A keep air / 16 pi L².
export function echoesOf(room) {
  const A = absorptionArea(room, 4), out = [];
  for (const e of room.echoes) {
    for (let r = 0; r < Math.max(1, e.n); r++) {
      const L = e.path + r * e.every, keep = e.keep * Math.pow(e.again, r), heard = L + (e.at ? e.at * C_RING - e.path : 0);
      const air = Math.pow(10, (-airAbsorption(1000) * heard) / 10);
      let hz = 18000;                                   // where the air has taken 10 dB more than at 1 kHz
      for (const f of [16000, 8000, 4000, 2000]) if ((airAbsorption(f) - airAbsorption(1000)) * heard > 10) hz = f / 2;
      out.push({ at: (e.at || e.path / C_RING) + (r * e.every) / C_RING, energy: (A * keep * air) / (16 * Math.PI * L * L), hz });
    }
  }
  return out;
}

// A room's answer to a clap, made up: noise whose spectrum dies away bin by bin at the room's own time for that
// frequency (reverbTime, by octave, and between the octaves in proportion on a log scale), after a first
// silence while the sound crosses to a surface and a build-up as it fills the room. Made frame by frame in the
// frequency domain, so that each octave decays at its own time and no other's: summing octaves of filtered
// noise would let the low notes' long tails into their neighbours. Faded out over its last fifth and its
// energy made 1 in each channel; then the echoes the room's shape gives (echoesOf), each with its own energy
// against that 1, darker by the air on its way. Into left and right, at sampleRate.
export function roomIR(left, right, sampleRate, room, seed = 7) {
  const n = left.length, fs = sampleRate, N = 1024, hop = N / 2, bins = N / 2;   // Hann windows half over each other sum to 1
  const start = Math.floor(room.predelay * fs);
  const t60 = OCTAVES.map((f, k) => reverbTime(room, k)), echoes = echoesOf(room);
  const rate = new Float64Array(bins + 1), fall = new Float64Array(bins + 1), env = new Float64Array(bins + 1);   // each bin falls as exp(-rate t)
  for (let b = 0; b <= bins; b++) {
    const x = clamp(Math.log2(Math.max(1, (b * fs) / N) / OCTAVES[0]), 0, OCTAVES.length - 1), k = Math.floor(x), w = x - k;
    rate[b] = 6.9078 / Math.exp(Math.log(t60[k]) * (1 - w) + Math.log(t60[Math.min(OCTAVES.length - 1, k + 1)]) * w);
    fall[b] = Math.exp((-rate[b] * hop) / fs);
  }
  const win = new Float64Array(N), re = new Float64Array(N), im = new Float64Array(N), cos = new Float64Array(1024), sin = new Float64Array(1024);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
  for (let i = 0; i < 1024; i++) { cos[i] = Math.cos((2 * Math.PI * i) / 1024); sin[i] = Math.sin((2 * Math.PI * i) / 1024); }
  for (const [ch, out] of [[0, left], [1, right]]) {
    out.fill(0);
    const noise = fillNoise(new Float32Array(n), seed + 977 * ch);
    const first = start - N + hop, t0 = (first + N / 2 - start) / fs;
    for (let b = 0; b <= bins; b++) env[b] = Math.exp(-rate[b] * Math.max(0, t0));
    let r = 0;
    for (let at = first; at < n; at += hop) {
      const t = (at + N / 2 - start) / fs, fill = t <= 0 ? 0 : room.onset > 0 ? 1 - Math.exp(-t / room.onset) : 1;
      for (let b = 0; b <= bins; b++) {   // as much as is left of each bin, at a random phase
        const m = fill * env[b], p = ((noise[r++ % n] + 1) * 512) & 1023;
        if (t > 0) env[b] *= fall[b];
        re[b] = m * cos[p];
        im[b] = b === 0 || b === bins ? 0 : m * sin[p];
        if (b > 0 && b < bins) { re[N - b] = re[b]; im[N - b] = -im[b]; }
      }
      fft(re, im, true);
      for (let i = 0; i < N; i++) { const j = at + i; if (j >= start && j < n) out[j] += win[i] * re[i]; }
    }
    const fade = Math.floor(0.2 * n);
    for (let i = n - fade; i < n; i++) out[i] *= 0.5 + 0.5 * Math.cos((Math.PI * (i - (n - fade))) / fade);
    let e = 0;
    for (let i = 0; i < n; i++) e += out[i] * out[i];
    const g = e > 0 ? 1 / Math.sqrt(e) : 0;
    for (let i = 0; i < n; i++) out[i] *= g;
    for (const echo of echoes) {   // 20 ms of the roof's or the wall's scatter, as much energy as the echo has
      const at = Math.floor(echo.at * fs), len = Math.floor(0.02 * fs), a = Math.exp((-2 * Math.PI * Math.min(0.45 * fs, echo.hz)) / fs);
      if (at >= n) continue;
      const burst = new Float32Array(Math.min(len, n - at));
      let lp = 0, eb = 0;
      for (let i = 0; i < burst.length; i++) {
        lp = (1 - a) * noise[(at * 3 + i * 7 + 1) % n] + a * lp;
        burst[i] = lp * Math.exp((-4 * i) / len);
        eb += burst[i] * burst[i];
      }
      const k = eb > 0 ? Math.sqrt(echo.energy / eb) : 0;
      for (let i = 0; i < burst.length; i++) out[at + i] += k * burst[i];
    }
  }
  return [left, right];
}

// The discrete Fourier transform of re + i im, in place, by Cooley and Tukey's halving; inverse, the way back
// (divided by the length). The length a power of two.
export function fft(re, im, inverse = false) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2, xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
  return re;
}

// A band-pass biquad's coefficients [b0, b1, b2, a1, a2], a0 made 1: the Audio EQ Cookbook's, constant 0 dB peak.
export function bandpass(fc, q, fs) {
  const w = (2 * Math.PI * fc) / fs, alpha = Math.sin(w) / (2 * q), a0 = 1 + alpha;
  return [alpha / a0, 0, -alpha / a0, (-2 * Math.cos(w)) / a0, (1 - alpha) / a0];
}

// ---- inside the Ring: what is heard where --------------------------------------------------------

// Where a sound comes from, for the walker's ear: a source at d (its place less the eye's, the Ring's frame)
// in the ear's own axes (x right, y up, z back), from the view's axes (walk-math.js viewAxes), unit length,
// into out; returns the distance.
export function toListener(dx, dy, dz, axes, out) {
  const r = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const x = dx * axes.right[0] + dy * axes.right[1] + dz * axes.right[2];
  const y = dx * axes.up[0] + dy * axes.up[1] + dz * axes.up[2];
  const z = -(dx * axes.fwd[0] + dy * axes.fwd[1] + dz * axes.fwd[2]);
  const len = Math.sqrt(x * x + y * y + z * z);
  if (len > 0 && Number.isFinite(len)) { out[0] = x / len; out[1] = y / len; out[2] = z / len; } else { out[0] = 0; out[1] = 0; out[2] = -1; }
  return Number.isFinite(r) ? r : 0;
}

// The canal: water 1.4 m under the floor in a channel down the band's middle, its banks at c = ±WALK.canal,
// decked over at each cross street and each spoke's plaza. A line of sound: from a line a sound spreads over
// a cylinder, so it falls as one over the square root of the distance, 3 dB each time that doubles, against
// a point's 6. Heard from the nearest open water, full at the bank's edge (the ear 3.1 m from the water) and
// muffled where a deck covers it. Into out: [gain 0..1, pan -1 left..1 right] for a walker at s, c facing
// heading (0 spinward, pi/2 toward +c; facing spinward, +c is on the right).
export const CANAL_EAR_M = 3.1;
export function canalHeard(s, c, heading, out) {
  const S = num(s), Cc = num(c), along = WALK.streets > 0 ? (2 * Math.PI * RING.floor) / WALK.streets : Infinity;
  const j = Math.floor(S / along + 0.5), ds = S - j * along, plaza = ((j % (WALK.streets / RING.spokes)) + WALK.streets / RING.spokes) % (WALK.streets / RING.spokes) === 0;
  const deck = plaza ? WALK.plazaDeck : WALK.street;
  const toOpen = Math.max(0, deck - Math.abs(ds));               // along the canal to where it is open
  const across = Math.max(0, Math.abs(Cc) - WALK.canal);
  const d = Math.sqrt(across * across + toOpen * toOpen + CANAL_EAR_M * CANAL_EAR_M);
  out[0] = Math.min(1, Math.sqrt(CANAL_EAR_M / d));
  // the open water is toward c = 0 across, and along to the deck's edge; as seen facing `heading`
  const ws = toOpen > 0 ? Math.sign(ds || 1) * toOpen : 0, wc = Math.abs(Cc) > WALK.canal ? -Math.sign(Cc) * across : 0;
  const h = num(heading), right = -ws * Math.sin(h) + wc * Math.cos(h), m = Math.hypot(ws, wc);
  out[1] = m > 1e-6 ? 0.75 * clamp(right / Math.max(m, CANAL_EAR_M), -1, 1) : 0;   // a line, heard from a broad arc
  return out;
}

// Footsteps. Walking is a pendulum: at one g the cadence rises as the speed to the 0.4, 1.87 steps a second at
// 1.4 m/s and 2.85 running at 4 (chosen to fit), and at a given Froude number (v² / g L) it goes as the
// square root of g, which together make it g to the 0.3: in the hub's three hundredths of a g a walk is a
// slow bound. A footfall is as hard as the weight's square root and the speed's.
export function cadence(speed, g) {
  return 1.87 * Math.pow(clamp(num(g), 0.005, 2), 0.3) * Math.pow(clamp(num(speed), 0.3, 8) / 1.4, 0.4);
}
export function stride(speed, g) { return Math.max(0.3, num(speed)) / cadence(speed, g); }
export function footfall(speed, g) {
  return Math.min(1.5, Math.sqrt(clamp(num(g), 0, 2)) * Math.sqrt(clamp(num(speed), 0.3, 8) / 1.4));
}

// What a foot meets: the floor's plan where it stands (walk-math.js surfaceAt, the plan the page paints and the
// walker walks on), the hub's grip floor, a car's floor. where: walk-core.js's WHERE.
const UNDER = { water: 'paving', deck: 'deck', bank: 'paving', promenade: 'paving', street: 'tarmac', plaza: 'paving', lane: 'paving', wallpath: 'gravel', grass: 'grass' };
export const SURFACES = ['grass', 'paving', 'tarmac', 'gravel', 'deck', 'grip', 'car'];
export function underfoot(where, s, c) {
  const w = Math.round(num(where));
  if (w === 0) return 'grip';
  if (w === 1) return 'car';
  return UNDER[surfaceAt(num(s), num(c))] || 'grass';
}

// The lifts. A car cruises at the speed that holds Coriolis's push on its riders to WALK.liftPush: v = a / 2 omega.
export const LIFT_CRUISE = WALK.liftPush / (2 * RING.spin);
const LIFT_STATE = { atHub: 0, down: 1, atFloor: 2, up: 3 };   // walk-core.js LIFT
// The walker's spoke's door, at the station where its car waits, from the walker: m, or Infinity when the doors
// are shut or at the other end. o: the walk's readouts.
export function doorDistance(o) {
  const where = Math.round(num(o.where)), state = Math.round(num(o.lift));
  if (where === 1) return state === LIFT_STATE.atHub || state === LIFT_STATE.atFloor ? WALK.car : Infinity;   // in the car, by its open door
  const at = where === 0 ? LIFT_STATE.atHub : LIFT_STATE.atFloor;
  if (state !== at) return Infinity;
  const R = where === 0 ? WALK.lobby : RING.floor, k = Math.round(num(o.spoke)), a = num(o.theta) - (2 * Math.PI * k) / RING.spokes;
  const along = R * (a - 2 * Math.PI * Math.round(a / (2 * Math.PI))), across = num(o.c) - (WALK.liftC + WALK.car);
  return Math.hypot(along, across);
}
// The wind where a lift's doors stand open, 0..1 by how near: a spoke's tube is a chimney 4.7 km tall, and the
// least difference of warmth between its air and the band's draws a draught through any door left open in it.
export function draughtAt(o) { const d = doorDistance(o); return sat((14 - d) / 12); }
// A car's motor, 0..1 by its load and how near the ear: aboard the moving car, or at its station, faint
// through the shaft. car: the speed of the car the ear rides in, 0..1.
export function liftHeard(o, out) {
  const where = Math.round(num(o.where)), state = Math.round(num(o.lift)), moving = state === LIFT_STATE.down || state === LIFT_STATE.up;
  const v = moving ? sat(Math.abs(num(o.liftV)) / LIFT_CRUISE) : 0;
  const near = where === 1 ? 1 : 0.15 * sat((40 - Math.hypot(num(o.c) - WALK.liftC, 0)) / 30);
  out[0] = sat(v * near + (moving && where === 1 ? 0.2 : 0));
  out[1] = where === 1 ? v : 0;
  return out;
}

// The walk's moments, found from its readouts: footsteps by the stride, a jump's landing, the ball's bounces, a
// car's doors and brakes, the hatch. Each step's time is given as a share of the frame (0 at its start, 1 at its
// end) so that steps fall where they belong between frames. None after a jump in time (a restart). o: the
// walk's readouts; eye, axes: the ear's place and axes in the Ring's frame, for the ball.
export const WALK_EVENT_KEYS = ['steps', 'land', 'bounce', 'doors', 'brake', 'hatch'];
export const MAX_STEPS = 4;

export function newWalkEvents() {
  const e = { stepAt: new Float64Array(MAX_STEPS), stepSide: new Float64Array(MAX_STEPS), stepWeight: 0, surface: 'grass' };
  for (const k of WALK_EVENT_KEYS) e[k] = 0;
  return e;
}

export function newWalkMemory() {
  return { t: -1, walked: 0, side: 1, still: 0, jumps: 0, falls: 0, ball: 0, ballR: 0, ballV: 0, carR: 0, lift: -1, where: -1, aboard: 0, valid: 0 };
}

const ballFloor = (r) => (r > 0.5 * (RING.floor + RING.hub) ? RING.floor : r < WALK.lobby + 5 ? WALK.lobby : NaN);

export function detectWalk(mem, o, out) {
  for (const k of WALK_EVENT_KEYS) out[k] = 0;
  const t = num(o.t), dt = t - mem.t, live = mem.valid && dt > 0 && dt <= 1.0;
  const g = num(o.g), speed = num(o.speed), ground = num(o.ground) > 0.5, where = Math.round(num(o.where)), lift = Math.round(num(o.lift));
  // footsteps: one each stride walked on the ground
  if (live && ground && speed > 0.25) {
    const len = stride(speed, g);
    let walked = mem.walked + speed * dt, k = 0;
    while (walked >= len && k < MAX_STEPS) {
      walked -= len;
      out.stepAt[k] = sat(1 - walked / (speed * dt));
      mem.side = -mem.side;
      out.stepSide[k] = mem.side;
      k++;
    }
    if (k === MAX_STEPS) walked = 0;
    mem.walked = walked;
    mem.still = 0;
    out.steps = k;
    out.stepWeight = footfall(speed, g);
    out.surface = underfoot(where, o.s, o.c);
  } else if (live) {
    mem.still += dt;
    if (mem.still > 0.3 || !ground) mem.walked = 0.6 * stride(1.4, g);   // the first step of the next walk comes soon
  }
  const r = Math.hypot(num(o.ballX), num(o.ballZ)), floor = ballFloor(r);
  const carR = num(o[`carR${Math.round(num(o.spoke))}`]);
  if (live) {
    if (num(o.jumps) > mem.jumps) {   // landed: as hard as the fall, v = sqrt(2 a h)
      out.land = sat(Math.sqrt(2 * Math.max(0, num(o.centrifugal)) * Math.max(0, num(o.jumpRise))) / 4.43) * 1.3;
      out.surface = underfoot(where, o.s, o.c);
    }
    // the ball: its speed outward to its floor, from where it was; a bounce where that turns back. A ball just
    // let go (none before, or one somewhere else) starts afresh.
    // The step it meets the floor in ends on the floor, so its speed then is only part of the fall's: the
    // impact is the fastest it fell before it turned back.
    const fresh = mem.ball === 0 || Math.abs(r - mem.ballR) > 30 * dt + 1;
    if (Math.round(num(o.ball)) !== 0 && !fresh) {
      const v = (r - mem.ballR) / dt, carV = Number.isFinite(floor) ? 0 : (carR - mem.carR) / dt, rel = v - carV;
      if (rel > 0) mem.ballV = Math.max(mem.ballV, rel);
      if (mem.ballV > 0.4 && rel < 0.5 * mem.ballV) { out.bounce = sat(mem.ballV / 8); mem.ballV = 0; }   // met the floor and turned back
    } else mem.ballV = 0;
    if (lift !== mem.lift && mem.lift >= 0 && where === mem.where) {
      const moving = (x) => x === LIFT_STATE.down || x === LIFT_STATE.up;
      if (moving(mem.lift) && !moving(lift)) { out.doors = 1; out.brake = 1; }        // arrived: the brakes set, the doors open
      else if (!moving(mem.lift) && moving(lift)) { out.doors = -1; out.brake = -1; } // the doors shut, the brakes let go
    }
    if (!mem.aboard && num(o.aboard) > 0.5) out.hatch = 1;
  }
  mem.t = t; mem.jumps = num(o.jumps); mem.falls = num(o.ballFalls); mem.ball = Math.round(num(o.ball)); mem.ballR = r; mem.carR = carR; mem.lift = lift; mem.where = where;
  mem.aboard = num(o.aboard) > 0.5 ? 1 : 0; mem.valid = 1;
  return out;
}

// ---- made-up signals --------------------------------------------------------------------------------

// White noise, uniform on -scale..scale, from a seed (xorshift32): the same seed, the same noise.
export function fillNoise(buf, seed, scale = 1) {
  let x = (seed | 0) || 0x9e3779b9;
  for (let i = 0; i < buf.length; i++) {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    buf[i] = ((x >>> 0) / 4294967296 * 2 - 1) * scale;
  }
  return buf;
}
