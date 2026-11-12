// sound.js — the flight, heard. Everything is made as it plays, by the browser's own audio nodes: there is
// no sound file, no sample and no recording anywhere, and nothing is fetched. sound-mix.js says what the
// flight sounds like, as numbers from the core's readouts; this file is the instrument those numbers play,
// and the page's part: starting on the pilot's first key or tap (a browser allows no sound before one), the
// SOUND button and the Y key to mute, and ctx.sound, through which another part of the page plays a moment
// of its own. The sound only listens: it reads the readouts and writes nothing back. GPLv3.
//
// The instrument, in the order the sound flows:
//   sources   loops of noise that are never heard bare (each is filtered, gated and moved by the readouts),
//             and a few oscillators
//   the hull  eight resonators, the structure's modes: what the drive shakes and what a knock rings; over
//             the flight deck the swivelled drive's own load, the lift jet, the roll posts, the actuators
//   the air   the roar, the crackle, the wind and the plasma, each as strong as the air is dense; the cabin
//             hears them through its wall, a camera outside hears them, and the hull, late and thinned by
//             the distance, and a boom where the Mach cone passes it
//   the cabin fans and a faint electrical hum
//   the Ring  its air, its far hum, the canal, the lifts, a walker's footsteps and a ball, each in its room:
//             the band, the hub's lobby or a car, whose answers are made from their sizes (built when first
//             entered)
//   master    a limiter, a soft ceiling, the volume

import {
  C0, C_RING, HULL, MAX_DELAY, NOZZLE_AFT, ROOMS, SHEAR_RATIO, airOf, bodyRates, boomStrength, canalHeard, carried, conePassed,
  crackleCurve, detect, detectDeck, detectWalk, draughtAt, fillNoise, jetBorne, jetWork, joints, liftHeard, mix, newDeckEvents, newDeckMemory,
  newEvents, newInputs, newMemory, newMix, newWalkEvents, newWalkMemory, roomIR, thrusting, toCamera, toListener, turnRate, turning, underfoot,
} from './sound-mix.js';
import { RING } from './core.js';
import { WALK } from './walk-core.js';
import { viewAxes } from './walk-math.js';

// A voice asked for 1 comes out of the instrument at REF, root mean square, ahead of the volume: the drive at
// full power sits 20 dB under full scale and its peaks clear it. TRIM is each voice's gain to make that so,
// measured by rendering the voice alone (flight/orbit/README.md, "The map and the sound").
export const REF = 0.1;
export const TRIM = {
  roar: 10.2, tear: 42.4, crack: 774, vib: 49.1, hum: 1.2, shear: 2.53, kick: 80.1, wind: 14.2, windLow: 80.3, buffet: 117, plasma: 9.55,
  plasCrack: 4390, rcs: 30.8, roll: 70.4, joint: 2.69, brake: 68.6, fans: 7.13, elec: 1.37, room: 14.8, airy: 3.94, lift: 1.46,
  hover: 2.84, duct: 23.8, whine: 1.18, posts: 17.2, actuator: 1.92, city: 15, canal: 15.6, draught: 11, rush: 5.44,
  strike: 56.8, thump: 0.451, screech: 3.83, motor: 0.0242, hiss: 0.228, step: 0.299, door: 1.1, out: 0.559, makeup: 0.74,
  strikeAir: 0.0791, rollAir: 0.15, brakeAir: 0.854,   // what a knock, the tyres and the brakes send to a camera outside
  pad: 0.271, puff: 0.516, boom: 1.77, chime: 0.0291, ball: 0.151, clunk: 0.168,
};

const HUM_RATIOS = [1, 2, 2.98, 4.21], HUM_GAINS = [1, 0.5, 0.3, 0.18];   // a drone that never quite resolves
// What a steady note gives the hull's modes. A note is felt through the structure directly; the modes are
// rung by noise and knocks, and only touched by a note, so that one passing over a mode's own frequency (the
// throttle moving the hum, the speed moving the runway's joints) swells a little and never booms.
const TOUCH = 0.12;

// How fast each of the mix's targets is followed, seconds to 1/e: [rising, falling]. The hull's q falls
// back slowly, so that when the drive stops the hull rings down.
const FOLLOW = {
  kick: [0.01, 0.16], rcs: [0.006, 0.05], rcsPan: [0.03, 0.03], master: [0.12, 0.12], life: [0.3, 0.6], hullQ: [0.4, 1.6],
  outX: [0.08, 0.08], outY: [0.08, 0.08], outZ: [0.08, 0.08],
  wind: [0.25, 0.25], windLow: [0.25, 0.25], buffet: [0.2, 0.2], plasma: [0.3, 0.3], plasCrack: [0.3, 0.3],
  hullView: [0.15, 0.15], cabinView: [0.15, 0.15], jetAboard: [0.15, 0.15], skinAboard: [0.15, 0.15], out: [0.15, 0.15],
  knocksAir: [0.3, 0.3], outDelay: [0.12, 0.12], outHz: [0.15, 0.15], room: [0.6, 0.6], airy: [0.6, 0.6], ring: [0.5, 0.5],
  lift: [0.25, 0.4], brake: [0.12, 0.2], default: [0.06, 0.06], hz: [0.1, 0.1],
  hover: [0.25, 0.5], duct: [0.15, 0.3], whine: [0.12, 0.25], posts: [0.03, 0.12], postsPan: [0.03, 0.03], actuator: [0.04, 0.08],
  hullAir: [0.15, 0.15], cabinAir: [0.15, 0.15], city: [0.8, 0.8], canal: [0.4, 0.4], canalPan: [0.3, 0.3], draught: [0.6, 0.9], rush: [0.3, 0.3],
  verbBand: [0.5, 0.5], verbHub: [0.5, 0.5], verbCar: [0.15, 0.3],
};

const gainOf = (ac, v = 0) => { const g = ac.createGain(); g.gain.value = v; return g; };
const filter = (ac, type, hz, q = 0.707) => {
  const f = ac.createBiquadFilter();
  f.type = type;
  f.frequency.value = hz;
  f.Q.value = q;
  return f;
};
const wire = (...nodes) => { for (let i = 0; i + 1 < nodes.length; i++) nodes[i].connect(nodes[i + 1]); return nodes[nodes.length - 1]; };
const panner = (ac, pan) => {   // a browser without one hears it in the middle
  if (typeof ac.createStereoPanner !== 'function') return gainOf(ac, 1);
  const p = ac.createStereoPanner();
  p.pan.value = pan;
  return p;
};
// A sound put where it is round the listener and heard through a head (HRTF), with no loss by distance (the
// mix spreads it itself): { node, x, y, z }, the position's three parameters, a unit vector in the listener's
// axes (x right, y up, z back). A browser without one hears it in the middle.
const placer = (ac) => {
  if (typeof ac.createPanner !== 'function') return { node: gainOf(ac, 1) };
  const p = ac.createPanner();
  p.panningModel = 'HRTF';
  p.distanceModel = 'inverse';
  p.refDistance = 1;
  p.rolloffFactor = 0;
  if (p.positionZ) p.positionZ.value = -1;
  return { node: p, x: p.positionX, y: p.positionY, z: p.positionZ };
};

// A loop of noise: a carrier only, never heard as itself.
function noiseLoop(ac, seconds, channels, seed, scale) {
  const n = Math.floor(seconds * ac.sampleRate), buf = ac.createBuffer(channels, n, ac.sampleRate);
  for (let c = 0; c < channels; c++) fillNoise(buf.getChannelData(c), seed + 7919 * c, scale);
  const src = ac.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.start();
  return src;
}

function oscillator(ac, type, hz) {
  const o = ac.createOscillator();
  o.type = type;
  o.frequency.value = hz;
  o.start();
  return o;
}

function shaper(ac, curve, oversample = 'none') {
  const w = ac.createWaveShaper();
  w.curve = curve;
  w.oversample = oversample;
  return w;
}

// What a footfall sounds like on each surface: its parts, each a burst of filtered noise (noise: the filter's
// type, hz, q) or a note (tone: hz, falling to `to`), its peak, attack and decay (s to 1/e), and when it comes
// after the heel. Made up; the surfaces are the floor's plan's (sound-mix.js, underfoot).
const STEPS = {
  grass: [{ noise: 'lowpass', hz: 450, q: 0.7, peak: 0.55, attack: 0.006, decay: 0.035 }, { noise: 'bandpass', hz: 3200, q: 0.7, peak: 0.12, attack: 0.008, decay: 0.05, at: 0.01 },
    { tone: 70, peak: 0.18, attack: 0.004, decay: 0.03 }],
  paving: [{ noise: 'bandpass', hz: 2400, q: 0.9, peak: 1.0, attack: 0.0005, decay: 0.01 }, { noise: 'bandpass', hz: 1200, q: 1.4, peak: 0.35, attack: 0.001, decay: 0.012 },
    { tone: 110, peak: 0.25, decay: 0.02 }, { noise: 'bandpass', hz: 3000, q: 1.2, peak: 0.22, attack: 0.002, decay: 0.01, at: 0.065 }],
  tarmac: [{ noise: 'bandpass', hz: 1500, q: 0.8, peak: 0.62, attack: 0.0008, decay: 0.01 }, { noise: 'bandpass', hz: 700, q: 1.2, peak: 0.35, attack: 0.001, decay: 0.016 },
    { tone: 100, peak: 0.3, decay: 0.02 }, { noise: 'bandpass', hz: 2500, q: 1, peak: 0.18, attack: 0.002, decay: 0.012, at: 0.07 }],
  gravel: [{ tone: 80, peak: 0.2, decay: 0.02 }, ...[0, 0.009, 0.017, 0.026, 0.038, 0.047, 0.061].map((at, k) => (
    { noise: 'bandpass', hz: 2600 + 450 * ((k * 5) % 3), q: 0.8, peak: 0.25 + 0.06 * ((k * 3) % 4), attack: 0.0005, decay: 0.004, at }))],
  deck: [{ noise: 'bandpass', hz: 1800, q: 1, peak: 0.55, attack: 0.0006, decay: 0.008 }, { tone: 140, peak: 0.35, decay: 0.09 },
    { tone: 310, peak: 0.15, decay: 0.05 }],
  grip: [{ noise: 'lowpass', hz: 600, q: 0.7, peak: 0.55, attack: 0.002, decay: 0.025 }, { tone: 85, peak: 0.25, decay: 0.03 },
    { noise: 'bandpass', hz: 1500, q: 1, peak: 0.1, attack: 0.001, decay: 0.01 }],
  car: [{ noise: 'bandpass', hz: 1600, q: 1, peak: 0.4, attack: 0.0006, decay: 0.008 }, { tone: 190, peak: 0.25, decay: 0.12 },
    { tone: 512, peak: 0.12, decay: 0.07 }, { tone: 1130, peak: 0.06, decay: 0.04 }],
};
const STEP_EAR_M = 1.6;   // the feet from the ear
const BUBBLE = 0.012;     // a canal bubble's peak, against the lapping's 0.007 at the bank

// The deck's plating struck by the gear: a plate's first modes, inharmonic (chosen), as [hz, peak, decay].
const PLATE = [[118, 1, 0.7], [287, 0.55, 0.45], [523, 0.3, 0.3], [911, 0.15, 0.18]];

export class Engine {
  // ac: an AudioContext, or an OfflineAudioContext to measure the instrument without hearing it.
  constructor(ac) {
    this.ac = ac;
    this.keys = [];
    this.params = [];
    this.scales = [];
    this.up = [];
    this.down = [];
    this.last = [];
    this.nextStrike = 0;
    this.nextThump = 0;
    this.shots = 0;
    this.ringBuilt = false;
    // follow(key, param, scale): the mix's target `key`, times scale, is what `param` is led to
    const follow = (key, param, scale = 1) => {
      if (!param) return;
      const f = FOLLOW[key] || (key.endsWith('Hz') ? FOLLOW.hz : FOLLOW.default);
      this.keys.push(key);
      this.params.push(param);
      this.scales.push(scale);
      this.up.push(f[0]);
      this.down.push(f[1]);
      this.last.push(NaN);
    };
    const level = (key, param) => follow(key, param, TRIM[key] * REF);   // a voice's level: 1 comes out at REF
    this.follow = follow;
    this.level = level;

    // ---- sources
    const bed = noiseLoop(ac, 3.7, 2, 0x51ade, 1), air = noiseLoop(ac, 5.3, 2, 0x0a1e, 1);
    const nA = noiseLoop(ac, 4.1, 1, 0xc0ffee, 0.5), nB = noiseLoop(ac, 6.7, 1, 0xbead, 0.5);
    this.nA = nA; this.nB = nB; this.air = air; this.bed = bed;
    const crackSum = gainOf(ac, 1);
    nA.connect(crackSum);
    nB.connect(crackSum);
    const curve = crackleCurve();
    // a second of noise that each moment plays a piece of, through nodes made for it and let go after
    this.noiseBuf = ac.createBuffer(1, Math.floor(2.3 * ac.sampleRate), ac.sampleRate);
    fillNoise(this.noiseBuf.getChannelData(0), 0x5eed5, 0.5);

    // ---- buses
    const hullIn = gainOf(ac, 1), hullOut = gainOf(ac, 1), jet = gainOf(ac, 1), skin = gainOf(ac, 1), cabin = gainOf(ac, 1);
    const aboard = gainOf(ac, 1), ext = gainOf(ac, 1), life = gainOf(ac, 1), mixBus = gainOf(ac, 1);
    // what a knock, a thump or the tyres send out through the air to a camera: as much as there is air to carry it
    const knocks = gainOf(ac, 1), gKnocksAir = gainOf(ac);
    follow('knocksAir', gKnocksAir.gain);
    this.hullIn = hullIn; this.hullOut = hullOut; this.cabin = cabin; this.mixBus = mixBus; this.ext = ext;

    // ---- the hull: the structure's modes, and under them the push itself. Under the drive's load each mode's
    // q, and with it its gain at its own note, rises by hullQ: the hull rings, and when the drive stops it rings
    // down; a knock starts as loud whatever the q and rings the longer the higher it is.
    const left = panner(ac, -0.25), right = panner(ac, 0.25);
    for (const m of HULL) {
      const bp = filter(ac, 'bandpass', m.hz, m.q), g = gainOf(ac, m.gain);
      wire(hullIn, bp, g, m.pan < 0 ? left : right);
      follow('hullQ', bp.Q, m.q);
      follow('hullQ', g.gain, m.gain);
    }
    left.connect(hullOut);
    right.connect(hullOut);
    wire(hullIn, filter(ac, 'lowpass', 150, 0.6), gainOf(ac, 0.05), hullOut);
    const gHullView = gainOf(ac);
    wire(hullOut, gHullView, aboard);
    follow('hullView', gHullView.gain);

    // ---- the drive, through the air: a roar that brightens with the throttle, a bright edge, the crackle
    const gRoar = gainOf(ac), roarBP = filter(ac, 'bandpass', 300, 0.5), roarLP = filter(ac, 'lowpass', 110, 0.7);
    wire(bed, roarBP, gRoar, jet);
    wire(bed, roarLP, gainOf(ac, 1.6), gRoar);
    level('roar', gRoar.gain);
    follow('roarHz', roarBP.frequency);
    follow('lowHz', roarLP.frequency);
    const gTear = gainOf(ac);
    wire(bed, filter(ac, 'bandpass', 2100, 0.8), gTear, jet);
    level('tear', gTear.gain);
    const gCrackDrive = gainOf(ac, 0.5), gCrack = gainOf(ac);
    wire(crackSum, gCrackDrive, shaper(ac, curve), filter(ac, 'highpass', 150, 0.5), filter(ac, 'lowpass', 2800, 0.5), gCrack, jet);
    follow('crackDrive', gCrackDrive.gain);
    level('crack', gCrack.gain);

    // ---- the drive, through the structure: rumble, the machinery's hum and shear, the throttle's kick
    const gVib = gainOf(ac);
    wire(bed, filter(ac, 'lowpass', 220, 0.6), gVib, hullIn);
    level('vib', gVib.gain);
    const gHum = gainOf(ac);
    gHum.connect(hullOut);
    wire(gHum, gainOf(ac, TOUCH), hullIn);
    HUM_RATIOS.forEach((ratio, k) => {
      const o = oscillator(ac, 'sine', 30 * ratio);
      wire(o, gainOf(ac, HUM_GAINS[k]), gHum);
      follow('humHz', o.frequency, ratio);
    });
    level('hum', gHum.gain);
    // the shear: a sine whose frequency a second sine, pi times as high, swings by shearDev hertz; the
    // highpass takes off what the swing folds down to nothing
    const gShear = gainOf(ac), carrier = oscillator(ac, 'sine', 240), modulator = oscillator(ac, 'sine', 240 * SHEAR_RATIO), swing = gainOf(ac);
    wire(modulator, swing, carrier.frequency);
    wire(carrier, filter(ac, 'highpass', 20, 0.7), filter(ac, 'lowpass', 900, 0.6), gShear, hullOut);
    wire(gShear, gainOf(ac, TOUCH), hullIn);
    follow('shearHz', carrier.frequency);
    follow('shearHz', modulator.frequency, SHEAR_RATIO);
    follow('shearDev', swing.gain);
    level('shear', gShear.gain);
    const gKick = gainOf(ac);
    wire(nB, filter(ac, 'lowpass', 420, 0.7), gKick, hullIn);
    level('kick', gKick.gain);

    // ---- the air over the skin: wind, its rumble through the skin, buffet, an entry's plasma
    const gWind = gainOf(ac), windBP = filter(ac, 'bandpass', 400, 0.45);
    wire(air, windBP, gWind, skin);
    level('wind', gWind.gain);
    follow('windHz', windBP.frequency);
    const gWindLow = gainOf(ac);
    wire(air, filter(ac, 'lowpass', 110, 0.7), gWindLow, hullIn);
    level('windLow', gWindLow.gain);
    const gBuffet = gainOf(ac);
    wire(air, filter(ac, 'lowpass', 42, 1.4), gBuffet, hullIn);
    level('buffet', gBuffet.gain);
    const gPlasma = gainOf(ac), plasLP = filter(ac, 'lowpass', 200, 0.6);
    wire(bed, plasLP, gPlasma, skin);
    wire(gPlasma, gainOf(ac, 0.5), hullIn);
    level('plasma', gPlasma.gain);
    follow('plasmaHz', plasLP.frequency);
    const gPlasDrive = gainOf(ac, 0.5), gPlasCrack = gainOf(ac);
    wire(crackSum, gPlasDrive, shaper(ac, curve), filter(ac, 'bandpass', 1400, 0.7), gPlasCrack, skin);
    follow('plasCrackDrive', gPlasDrive.gain);
    level('plasCrack', gPlasCrack.gain);

    // ---- the small thrusters: a hiss through the structure, from the side they are on
    const gRcs = gainOf(ac), rcsPan = panner(ac, 0);
    wire(nA, filter(ac, 'bandpass', 1500, 0.7), gRcs, rcsPan, filter(ac, 'lowpass', 900, 0.5), hullOut);
    wire(gRcs, gainOf(ac, 0.3), hullIn);
    level('rcs', gRcs.gain);
    follow('rcsPan', rcsPan.pan);

    // ---- the flight deck, through the structure. The hover's load goes into the airframe at the swivel's
    // bearing and rings a mode of its own: a thrum, its note swelling and falling as the mode beats with its
    // neighbour, rung also by the drive's rumble. The flow turned in the duct roars into the hull. The nose's
    // lift jet whines under the cockpit, its note and its narrow hiss rising with its flow. The roll posts hiss
    // from the side that works. The swivel's actuators: a motor's note and a bearing's grind.
    const gHover = gainOf(ac), thrum = gainOf(ac, 0.6), hoverOsc = oscillator(ac, 'sawtooth', 38), beat = oscillator(ac, 'sine', 3.2);
    wire(hoverOsc, filter(ac, 'lowpass', 190, 0.9), thrum, gHover);
    wire(beat, gainOf(ac, 0.4), thrum.gain);
    wire(bed, filter(ac, 'bandpass', 40, 6), gainOf(ac, 2.5), gHover);
    gHover.connect(hullOut);
    wire(gHover, gainOf(ac, TOUCH), hullIn);
    follow('hoverHz', hoverOsc.frequency);
    follow('hoverHz', beat.frequency, 0.085);
    level('hover', gHover.gain);
    const gDuct = gainOf(ac);
    wire(bed, filter(ac, 'bandpass', 260, 0.9), gDuct, hullIn);
    wire(gDuct, gainOf(ac, 0.5), hullOut);
    level('duct', gDuct.gain);
    const gWhine = gainOf(ac), whineLP = filter(ac, 'lowpass', 6500, 0.7), wobble = oscillator(ac, 'sine', 5.3), wobbleG = gainOf(ac, 1);
    wobble.connect(wobbleG);
    for (const [ratio, g] of [[1, 1], [2.003, 0.35], [3.01, 0.14]]) {
      const o = oscillator(ac, 'sine', 2100 * ratio);
      wire(o, gainOf(ac, g), whineLP);
      wire(wobbleG, gainOf(ac, 6 * ratio), o.frequency);
      follow('whineHz', o.frequency, ratio);
    }
    const whineNoise = filter(ac, 'bandpass', 2100, 14);
    wire(nA, whineNoise, gainOf(ac, 3), whineLP);
    follow('whineHz', whineNoise.frequency);
    wire(whineLP, gWhine, hullOut);
    level('whine', gWhine.gain);
    const gPosts = gainOf(ac), postsPan = panner(ac, 0);
    wire(nA, filter(ac, 'bandpass', 1100, 0.8), gPosts, postsPan, filter(ac, 'lowpass', 2400, 0.6), hullOut);
    wire(gPosts, gainOf(ac, 0.25), hullIn);
    level('posts', gPosts.gain);
    follow('postsPan', postsPan.pan);
    this.postsPan = postsPan;
    const gAct = gainOf(ac), actOsc = oscillator(ac, 'sawtooth', 150);
    wire(actOsc, filter(ac, 'lowpass', 700, 1.2), gAct, hullOut);
    wire(nB, filter(ac, 'bandpass', 95, 3), gainOf(ac, 2.5), gAct);
    wire(gAct, gainOf(ac, TOUCH), hullIn);
    level('actuator', gAct.gain);
    follow('actuatorHz', actOsc.frequency);

    // ---- the gear on the runway: the tyres, the joints passing under them, the brakes
    const gRoll = gainOf(ac), rollLP = filter(ac, 'lowpass', 200, 0.7);
    wire(bed, rollLP, gRoll, hullIn);
    wire(gRoll, gainOf(ac, TRIM.rollAir), knocks);
    level('roll', gRoll.gain);
    follow('rollHz', rollLP.frequency);
    const gBrake = gainOf(ac);
    wire(nB, filter(ac, 'bandpass', 210, 5), gBrake, hullOut);
    wire(gBrake, gainOf(ac, 0.3), hullIn);
    wire(gBrake, gainOf(ac, TRIM.brakeAir), knocks);
    level('brake', gBrake.gain);

    // ---- the cabin
    const gFans = gainOf(ac), gElec = gainOf(ac), gCabinView = gainOf(ac);
    wire(air, filter(ac, 'bandpass', 480, 0.5), gFans, cabin);
    wire(oscillator(ac, 'sine', 400), gElec, cabin);
    wire(oscillator(ac, 'sine', 1200), gainOf(ac, 0.25), gElec);
    wire(cabin, gCabinView, aboard);
    level('fans', gFans.gain);
    level('elec', gElec.gain);
    follow('cabinView', gCabinView.gain);

    // ---- moments: knocks on the hull, thumps, the tyres' chirp, the gear's motor, a hiss of air
    this.strikes = [];
    for (let k = 0; k < 4; k++) {
      const f = filter(ac, 'lowpass', 600, 0.7), g = gainOf(ac);
      wire(nB, f, g, hullIn);
      wire(g, gainOf(ac, TRIM.strikeAir), knocks);   // to a camera outside, the knock itself; aboard, the hull's ring
      this.strikes.push({ f, g });
    }
    this.thumps = [];
    for (let k = 0; k < 3; k++) {
      const o = oscillator(ac, 'sine', 60), g = gainOf(ac);
      wire(o, g, hullOut);
      wire(g, gainOf(ac, 0.7), knocks);
      this.thumps.push({ o, g });
    }
    this.bumps = [];   // the runway's joints under the wheels: a dull knock each, felt more than heard
    for (let k = 0; k < 4; k++) {
      const g = gainOf(ac);
      wire(nB, filter(ac, 'lowpass', 140, 0.8), g, hullOut);
      wire(g, gainOf(ac, TOUCH), hullIn);
      this.bumps.push(g);
    }
    this.nextBump = 0;
    this.screechBP = filter(ac, 'bandpass', 1000, 7);
    this.gScreech = gainOf(ac);
    wire(nA, this.screechBP, this.gScreech, knocks);
    wire(this.gScreech, gainOf(ac, 0.4), hullOut);
    this.motor = oscillator(ac, 'sawtooth', 150);
    this.gMotor = gainOf(ac);
    wire(this.motor, filter(ac, 'lowpass', 520, 0.8), this.gMotor, hullOut);
    wire(this.gMotor, gainOf(ac, TOUCH), hullIn);
    this.hissBP = filter(ac, 'bandpass', 2400, 1);
    this.gHiss = gainOf(ac);
    wire(nA, this.hissBP, this.gHiss, cabin);

    // ---- where the ear is. Aboard: the cabin's wall takes the high notes from what the air brings.
    const gJetAboard = gainOf(ac), gSkinAboard = gainOf(ac), wall = filter(ac, 'lowpass', 420, 0.6);
    wire(jet, gJetAboard, wall, aboard);
    wire(skin, gSkinAboard, wall);
    follow('jetAboard', gJetAboard.gain);
    follow('skinAboard', gSkinAboard.gain);
    // Outside: what the air carries to the camera, late by the way there, thinned by it, and from where the
    // drive is: the drive, and the hull and the cabin as they sound through the skin.
    const delay = ac.createDelay(MAX_DELAY + 0.5), absorb = filter(ac, 'lowpass', 18000, 0.5), gOut = gainOf(ac), where = placer(ac);
    delay.delayTime.value = 0.2;
    jet.connect(delay);
    skin.connect(delay);
    wire(knocks, gKnocksAir, delay);
    const gHullAir = gainOf(ac), gCabinAir = gainOf(ac);
    wire(hullOut, gHullAir, delay);
    wire(cabin, gCabinAir, delay);
    follow('hullAir', gHullAir.gain);
    follow('cabinAir', gCabinAir.gain);
    wire(delay, absorb, gOut, where.node, ext);
    follow('out', gOut.gain, TRIM.out);
    follow('outDelay', delay.delayTime);
    follow('outHz', absorb.frequency);
    follow('outX', where.x);
    follow('outY', where.y);
    follow('outZ', where.z);
    wire(aboard, life, mixBus);
    ext.connect(life);
    follow('life', life.gain);

    // ---- master: a limiter for the moments, a soft ceiling, the volume. Beside it the page's own tones (the
    // tour's), at the volume but not ducked by a fast clock: they are not sounds of the world.
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -8;
    comp.knee.value = 6;
    comp.ratio.value = 8;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;
    const ceiling = new Float32Array(4097);
    for (let i = 0; i < ceiling.length; i++) ceiling[i] = 0.87 * Math.tanh(1.15 * 4 * ((2 * i) / (ceiling.length - 1) - 1));
    this.master = gainOf(ac);
    wire(mixBus, comp, gainOf(ac, 0.25 * TRIM.makeup), shaper(ac, ceiling, '2x'), this.master, ac.destination);
    follow('master', this.master.gain);
    this.ui = gainOf(ac);
    this.ui.connect(ac.destination);
    follow('ui', this.ui.gain);
  }

  // The Ring's interior, built the first time it is wanted. Its air: the band's hum of everything far off, the
  // air handling, the town far away, the canal, the draught at an open lift door, a car's ride and its motor.
  // What happens near the ear (footsteps, a ball, doors) comes in two ways: dry, thinned by its distance, and
  // into the room's answer, which is not; each room (sound-mix.js ROOMS: the band, the hub's lobby, a car) has
  // its own, made from its size and surfaces, and the mix leads the sound into the one the ear is in.
  ring() {
    if (this.ringBuilt) return;
    this.ringBuilt = true;
    const ac = this.ac, follow = this.follow, level = this.level;
    const near = gainOf(ac, 1), wet = gainOf(ac, 1), out = gainOf(ac, 1), gRing = gainOf(ac);
    this.near = near;
    this.wet = wet;
    const gRoom = gainOf(ac), gAiry = gainOf(ac), gLift = gainOf(ac), liftLP = filter(ac, 'lowpass', 300, 0.7);
    wire(this.air, filter(ac, 'lowpass', 190, 0.6), gRoom, near);
    wire(this.air, filter(ac, 'bandpass', 1100, 0.3), gAiry, near);
    wire(liftLP, gLift, near);
    wire(gLift, gainOf(ac, 0.3), wet);
    for (const ratio of [1, 2.01]) {
      const o = oscillator(ac, 'sawtooth', 52 * ratio);
      o.connect(liftLP);
      follow('liftHz', o.frequency, ratio);
    }
    level('room', gRoom.gain);
    level('airy', gAiry.gain);
    level('lift', gLift.gain);
    // the town far off: its low hum, swelling and falling on two slow, unrelated waves
    const gCity = gainOf(ac), swell = gainOf(ac, 0.7);
    wire(this.bed, filter(ac, 'bandpass', 120, 0.5), swell, gCity, near);
    wire(oscillator(ac, 'sine', 0.071), gainOf(ac, 0.18), swell.gain);
    wire(oscillator(ac, 'sine', 0.113), gainOf(ac, 0.12), swell.gain);
    level('city', gCity.gain);
    // the canal: its water lapping at the walls, in slow lumps, from the side it is on (the page adds its bubbles)
    const gCanal = gainOf(ac), lap = gainOf(ac, 0.55), canalPan = panner(ac, 0);
    wire(this.nB, filter(ac, 'bandpass', 650, 0.9), lap, gCanal);
    wire(this.air, filter(ac, 'lowpass', 300, 0.7), gainOf(ac, 0.6), gCanal);
    wire(oscillator(ac, 'sine', 0.7), gainOf(ac, 0.25), lap.gain);
    wire(oscillator(ac, 'sine', 1.13), gainOf(ac, 0.2), lap.gain);
    wire(gCanal, canalPan, near);
    wire(gCanal, gainOf(ac, 0.5), wet);
    level('canal', gCanal.gain);
    follow('canalPan', canalPan.pan);
    this.canalPan = canalPan;
    // the draught at an open lift door: wind in gusts
    const gDraught = gainOf(ac), gust = gainOf(ac, 0.6);
    wire(this.air, filter(ac, 'bandpass', 520, 0.45), gust, gDraught, near);
    wire(oscillator(ac, 'sine', 0.37), gainOf(ac, 0.3), gust.gain);
    wire(oscillator(ac, 'sine', 0.83), gainOf(ac, 0.15), gust.gain);
    wire(gDraught, gainOf(ac, 0.3), wet);
    level('draught', gDraught.gain);
    // a car moving: the air in its tube and the rails' rumble
    const gRush = gainOf(ac), rushBP = filter(ac, 'bandpass', 400, 0.6);
    wire(this.air, rushBP, gRush, near);
    wire(this.bed, filter(ac, 'lowpass', 90, 0.8), gainOf(ac, 1.4), gRush);
    wire(gRush, gainOf(ac, 0.4), wet);
    level('rush', gRush.gain);
    follow('rushHz', rushBP.frequency);
    // the rooms' answers, each made the first time the ear is in that room (roomFor)
    this.rooms = {};
    for (const [name, key] of [['band', 'verbBand'], ['hub', 'verbHub'], ['car', 'verbCar']]) {
      const conv = ac.createConvolver(), send = gainOf(ac);
      conv.normalize = false;
      wire(wet, send, conv, out);
      follow(key, send.gain);
      this.rooms[name] = conv;
    }
    near.connect(out);
    wire(out, gRing, this.mixBus);
    follow('ring', gRing.gain);
  }

  // The room the ear is in, for a scene (1 the band, 2 the hub's lobby, 3 a car), its answer made if it is not yet:
  // a tenth of a second's work for the band, done once.
  roomFor(scene) {
    const name = ['', 'band', 'hub', 'car'][Math.round(scene)];
    if (!name) return;
    this.ring();
    const conv = this.rooms[name];
    if (conv.buffer) return;
    const ac = this.ac, room = ROOMS[name], ir = ac.createBuffer(2, Math.floor(room.seconds * ac.sampleRate), ac.sampleRate);
    roomIR(ir.getChannelData(0), ir.getChannelData(1), ac.sampleRate, room);
    conv.buffer = ir;
  }

  // Forget what apply() last sent, so that it sends every target again: after a parameter was moved by hand
  // (the mute), what it remembers is no longer what the parameter is heading for.
  forget() { this.last.fill(NaN); }

  // The mix's targets onto the instrument. Each is followed smoothly, so nothing steps and nothing clicks;
  // a target that has not moved is left alone. `now` is the context's time; atOnce: no following (to measure).
  apply(m, now, atOnce = false) {
    const { keys, params, scales, up, down, last } = this;
    for (let i = 0; i < keys.length; i++) {
      const v = m[keys[i]] * scales[i], was = last[i];
      if (!(Math.abs(v - was) <= 1e-5 + 0.002 * Math.abs(was))) {   // also true the first time, when was is NaN
        if (atOnce) params[i].setValueAtTime(v, now);
        else params[i].setTargetAtTime(v, now, v > was ? up[i] : down[i]);
        last[i] = v;
      }
    }
  }

  // ---- moments. t is the context's time at which each starts.

  // A knock on the hull: a few milliseconds of noise, darker the softer the thing that knocks. The hull rings.
  strike(t, strength, hz = 600, seconds = 0.012) {
    const v = this.strikes[this.nextStrike++ % this.strikes.length];
    v.f.frequency.setValueAtTime(hz, t);
    v.g.gain.setTargetAtTime(strength * TRIM.strike, t, 0.0015);
    v.g.gain.setTargetAtTime(0, t + seconds, seconds * 0.6);
  }

  // A wheel over a joint in the runway.
  bump(t, strength) {
    const g = this.bumps[this.nextBump++ % this.bumps.length].gain;
    g.setTargetAtTime(strength * TRIM.joint, t, 0.002);
    g.setTargetAtTime(0, t + 0.012, 0.022);
  }

  // A thump: a low note falling, felt in the seat.
  thump(t, strength, from = 70, to = 36, seconds = 0.4) {
    const v = this.thumps[this.nextThump++ % this.thumps.length];
    v.o.frequency.setValueAtTime(from, t);
    v.o.frequency.exponentialRampToValueAtTime(to, t + seconds * 0.6);
    v.g.gain.setTargetAtTime(strength * TRIM.thump, t, 0.004);
    v.g.gain.setTargetAtTime(0, t + 0.03, seconds / 3);
  }

  hiss(t, seconds = 4, strength = 1) {   // air finding its level: a hiss that falls as the pressures meet
    this.hissBP.frequency.setValueAtTime(3200, t);
    this.hissBP.frequency.exponentialRampToValueAtTime(1500, t + seconds);
    this.gHiss.gain.setTargetAtTime(strength * TRIM.hiss, t, 0.12);
    this.gHiss.gain.setTargetAtTime(0, t + 0.3, seconds / 3);
  }

  ignition(t, k = 0.7) { this.thump(t, 0.5 * k, 110, 40, 0.5); this.strike(t, 0.4 * k, 500); }
  shutdown(t, k = 0.6) { this.thump(t, 0.3 * k, 150, 60, 0.2); this.strike(t + 0.02, 0.5 * k, 900); }

  // Through the speed of sound, aboard: one thump, the shock moving over the wing (the cone itself passes a
  // camera outside: nwave).
  boom(t, n = 1) {
    for (let k = 0; k < n; k++) {
      this.thump(t + 0.13 * k, 0.6, 72, 30, 0.45);
      this.strike(t + 0.13 * k, 0.5, 320);
    }
  }

  gear(t, down) {   // the legs' motor for two seconds and a bit, then the lock
    const g = this.gMotor.gain, f = this.motor.frequency;
    g.cancelScheduledValues(t);
    f.cancelScheduledValues(t);
    f.setValueAtTime(down ? 172 : 148, t);
    f.linearRampToValueAtTime(down ? 150 : 176, t + 2.2);
    g.setTargetAtTime(TRIM.motor, t, 0.05);
    g.setTargetAtTime(0, t + 2.2, 0.06);
    this.strike(t + 2.32, 0.45, 700);
    this.thump(t + 2.32, 0.3, 90, 55, 0.15);
  }

  touchdown(t, strength = 0.6, screech = 0) {
    this.strike(t, 0.7 * strength, 260);
    this.thump(t, 0.7 * strength, 62, 36, 0.35);
    if (screech > 0.05) {   // the tyres brought up to speed
      this.screechBP.frequency.setValueAtTime(1250, t);
      this.screechBP.frequency.exponentialRampToValueAtTime(780, t + 0.35);
      this.gScreech.gain.setTargetAtTime(0.5 * screech * TRIM.screech, t, 0.004);
      this.gScreech.gain.setTargetAtTime(0, t + 0.05, 0.11);
    }
  }

  crash(t) {   // a heavy impact; the mix then closes to silence
    this.strike(t, 1, 2500);
    this.strike(t, 1, 400);
    this.thump(t, 1, 58, 22, 1.4);
    this.strike(t + 0.07, 0.6, 1200);
    this.strike(t + 0.17, 0.45, 600);
    this.thump(t + 0.09, 0.6, 90, 30, 0.6);
  }

  // Something touches the craft: soft, a clunk; hard, a bang that rings. speed is the closing speed, m/s.
  contact(t, speed = 0.1) {
    const k = Math.min(1, Math.max(0, speed) / 2);
    this.strike(t, Math.min(1, 0.22 + 0.9 * k), 380 + 2600 * k);
    this.thump(t, Math.min(1, 0.2 + 0.9 * k), 85 - 15 * k, 50 - 20 * k, 0.25 + 0.3 * k);
  }

  latch(t, n = 4) {   // the port's latches, one after another
    for (let k = 0; k < n; k++) {
      const at = t + 0.27 * k + (k % 2 ? 0.04 : 0);
      this.strike(at, 0.2, 2400, 0.006);
      this.thump(at, 0.1, 150, 95, 0.08);
    }
  }

  capture(t) { this.contact(t, 0.1); this.latch(t + 0.6, 4); this.hiss(t + 1.9, 4.5); }
  release(t) { this.latch(t, 2); this.hiss(t + 0.6, 0.5, 0.7); this.thump(t + 0.7, 0.2, 80, 50, 0.2); }

  // ---- one-shots: nodes made for a moment and let go when it has sounded

  // A piece of the moments' noise, from t for `seconds`.
  noise(t, seconds) {
    const s = this.ac.createBufferSource();
    s.buffer = this.noiseBuf;
    this.shots = (this.shots + 0.618034) % 1;
    s.start(t, this.shots * Math.max(0, this.noiseBuf.duration - seconds - 0.05), seconds + 0.02);
    return s;
  }

  // A note from t for `seconds`, falling (or rising) to `to` if given.
  note(t, hz, seconds, to = 0) {
    const o = this.ac.createOscillator();
    o.frequency.setValueAtTime(hz, t);
    if (to > 0) o.frequency.exponentialRampToValueAtTime(to, t + seconds);
    o.start(t);
    o.stop(t + seconds + 0.02);
    return o;
  }

  // Parts of a moment (STEPS shows their form) from t into dest, each scaled by k.
  parts(t, list, dest, k = 1, vary = 0) {
    const ac = this.ac;
    for (const p of list) {
      const at = t + (p.at || 0), attack = p.attack || 0.001, len = 3 * attack + 7 * p.decay, r = vary ? 1 + vary * (2 * Math.random() - 1) : 1;
      const g = gainOf(ac);
      g.gain.setValueAtTime(0, at);
      g.gain.setTargetAtTime(k * p.peak * (vary ? 0.85 + 0.3 * Math.random() : 1), at, attack);
      g.gain.setTargetAtTime(0, at + 3 * attack, p.decay);
      if (p.noise) wire(this.noise(at, len), filter(ac, p.noise, p.hz * r, p.q), g, dest);
      else wire(this.note(at, p.tone * r, len, p.to ? p.to * r : 0), g, dest);
    }
  }

  // ---- the flight deck's moments, all through the structure

  // The gear meets the deck's plating: the legs' struts take the sink (a heavy thump and the oil's hiss in
  // them), the plating rings under the wheels, the hull rings. No tyre's squeal: that is the air's.
  pad(t, strength = 0.5, sink = 0.3) {
    const k = Math.min(1.2, Math.max(0.05, strength));
    this.strike(t, 0.55 * k, 340);
    this.thump(t, 0.75 * k, 55, 28, 0.5 + 0.2 * k);
    this.parts(t, PLATE.map(([hz, peak, decay]) => ({ tone: hz, peak, decay })), this.hullOut, 0.5 * k * TRIM.pad);
    this.parts(t + 0.02, [{ noise: 'bandpass', hz: 1800, q: 1.2, peak: 0.25, attack: 0.01, decay: 0.08 + 0.1 * Math.min(1, sink) }], this.hullOut, k * TRIM.pad);
    for (const [at, s] of [[0.035, 0.6], [0.06, 0.45]]) this.strike(t + at, s * k * 0.5, 300);   // the other legs
  }

  // The legs come off the deck: each strut tops out with a clunk.
  liftoff(t) {
    for (const at of [0, 0.045, 0.08]) { this.strike(t + at, 0.22, 900, 0.006); this.thump(t + at, 0.14, 120, 80, 0.15); }
  }

  // The swivel comes to rest at the end of a turn: its actuators lock.
  swivelStop(t, k = 0.5) { this.strike(t, 0.18 * k + 0.05, 420, 0.008); this.thump(t, 0.12 * k + 0.04, 95, 60, 0.18); }

  // A roll post's valve opens: a puff of the drive's flow and the valve's knock, from its wing.
  puff(t, strength = 0.5, side = 0) {
    const ac = this.ac, k = Math.min(1, Math.max(0.1, strength)), p = panner(ac, 0.6 * Math.max(-1, Math.min(1, side)));
    p.connect(this.hullOut);
    this.parts(t, [{ noise: 'bandpass', hz: 950, q: 0.8, peak: 0.6, attack: 0.006, decay: 0.07 }, { tone: 85, peak: 0.25, decay: 0.03 }], p, k * TRIM.puff, 0.1);
    this.strike(t, 0.06 * k, 500, 0.008);
  }

  // The cone passing a camera outside: the N-wave, a sharp rise, a fall through nothing to as far below, a sharp
  // return (the bow's shock and the tail's), `seconds` apart, and the air's rumble after it. To the camera's
  // ear as it stands: the cone is at the ear when it is heard, so there is no wait.
  nwave(t, strength = 1, seconds = 0.12) {
    const ac = this.ac, fs = ac.sampleRate, T = Math.max(0.02, seconds), n = Math.floor((T + 0.8) * fs), buf = ac.createBuffer(1, n, fs), y = buf.getChannelData(0);
    const noise = this.noiseBuf.getChannelData(0), rise = Math.exp(-1 / (0.0004 * fs));
    let lp = 0, rumble = 0;
    for (let i = 0; i < n; i++) {
      const s = i / fs, wave = s < T ? 1 - (2 * s) / T : 0;
      lp = wave + rise * (lp - wave);
      rumble = 0.985 * rumble + 0.015 * noise[i % noise.length];
      y[i] = lp + (s > T ? 3 * rumble * Math.exp(-(s - T) / 0.25) : 0);
    }
    const src = ac.createBufferSource(), g = gainOf(ac, Math.min(1.2, Math.max(0, strength)) * TRIM.boom);
    src.buffer = buf;
    wire(src, filter(ac, 'highpass', 18, 0.7), g, this.ext);
    src.start(t);
  }

  // The tour's tone as a caption changes: two soft notes a fifth apart, heard over anything else at the volume.
  chime(t) {
    this.parts(t, [{ tone: 880, peak: 1, attack: 0.012, decay: 0.45 }, { tone: 1318.5, peak: 0.6, attack: 0.02, decay: 0.38 }, { tone: 1760, peak: 0.15, attack: 0.01, decay: 0.2 }],
      this.ui, TRIM.chime);
  }

  // ---- the Ring's moments

  // Where a moment near the walker is heard from: late by its distance over the speed of sound, thinned as
  // 1 / d from its level at a metre, through a head from dir (the ear's axes: x right, y up, z back), and
  // into its room's answer, which does not thin. Returns the node to play the moment into.
  placed(d, dir) {
    this.ring();
    const ac = this.ac, input = gainOf(ac, 1), late = ac.createDelay(1.5), p = placer(ac), thin = gainOf(ac, 1 / Math.max(0.5, d));
    late.delayTime.value = Math.min(1.4, Math.max(0, d) / C_RING);
    if (p.x) { p.x.value = dir[0]; p.y.value = dir[1]; p.z.value = dir[2]; }
    wire(input, late, p.node, thin, this.near);
    input.connect(this.wet);
    return input;
  }

  // A footfall inside the Ring, on a surface (STEPS: grass, paving, tarmac, gravel, deck, grip, car), the
  // foot to one side or the other, as hard as weight (1 a walk at one g). The feet are 1.6 m from the ear.
  step(t, surface = 'grass', side = 0, weight = 1) {
    this.ring();
    const ac = this.ac, list = STEPS[surface] || STEPS.grass, p = panner(ac, 0.22 * Math.max(-1, Math.min(1, side))), dry = gainOf(ac, 1 / STEP_EAR_M);
    wire(p, dry, this.near);
    p.connect(this.wet);
    this.parts(t, list, p, Math.min(1.6, Math.max(0, weight)) * TRIM.step, 0.08);
  }

  // A jump's landing, or any drop onto the feet: both feet, and the body's weight coming onto them.
  land(t, surface = 'grass', strength = 1) {
    const k = Math.min(1.6, Math.max(0.1, strength));
    this.step(t, surface, -1, k);
    this.step(t + 0.018, surface, 1, 0.8 * k);
    this.ring();
    this.parts(t, [{ tone: 68, peak: 0.5, decay: 0.06 }], this.near, k * TRIM.step / STEP_EAR_M);
  }

  // The ball comes down: a rubber ball's knock and its shell's note, d metres off from dir, on a surface.
  ball(t, strength, d, dir, surface = 'grass') {
    const k = Math.min(1, Math.max(0.03, strength)) * TRIM.ball, soft = surface === 'grass' ? 0.35 : 1, into = this.placed(d, dir);
    this.parts(t, [{ noise: 'bandpass', hz: 2600, q: 0.7, peak: 0.6 * soft, attack: 0.0003, decay: 0.004 }, { tone: 340, to: 310, peak: 0.5, decay: 0.035 },
      { tone: 120, peak: 0.25, decay: 0.02 }], into, k, 0.05);
  }

  // A lift's doors: a second of sliding on their rollers, and the stop; opening, or shutting with the two
  // leaves meeting. d, dir: where they are from the ear.
  door(t, open = true, d = 3, dir = [0, 0, -1]) {
    this.ring();
    const into = d > 0 ? this.placed(d, dir) : this.near, ac = this.ac, g = gainOf(ac), bp = filter(ac, 'bandpass', open ? 380 : 620, 2);
    bp.frequency.setValueAtTime(open ? 380 : 620, t);
    bp.frequency.linearRampToValueAtTime(open ? 620 : 380, t + 0.9);
    g.gain.setValueAtTime(0, t);
    g.gain.setTargetAtTime(0.5 * TRIM.door, t, 0.06);
    g.gain.setTargetAtTime(0, t + 0.9, 0.04);
    wire(this.noise(t, 1.2), bp, g, into);
    wire(this.noise(t, 1.2), filter(ac, 'lowpass', 160, 0.8), gainOf(ac, 0.6), g);
    this.parts(t + 0.93, [{ tone: 95, peak: 0.5, decay: 0.04 }, { noise: 'bandpass', hz: 900, q: 1, peak: 0.4, attack: 0.0008, decay: 0.012 }], into, (open ? 0.6 : 1) * TRIM.clunk);
  }

  // A car's brakes set or let go: a heavy clunk through its frame, loud aboard and faint at its station.
  brake(t, aboardCar = true, d = 0, dir = [0, -1, 0]) {
    const into = aboardCar ? (this.ring(), this.near) : this.placed(d, dir), k = (aboardCar ? 1 : 0.6) * TRIM.clunk;
    this.parts(t, [{ tone: 58, peak: 0.8, decay: 0.08 }, { noise: 'bandpass', hz: 850, q: 1.2, peak: 0.5, attack: 0.0008, decay: 0.015 },
      { tone: 230, peak: 0.2, decay: 0.05 }], into, k);
  }

  // The hatch between the hub and the craft: its latches, the seal's breath, its weight swinging and shut.
  hatch(t, open = true) {
    this.ring();
    const into = this.placed(2.5, [0.3, 0.1, -0.95]), k = TRIM.clunk;
    this.parts(t, [{ noise: 'bandpass', hz: 1200, q: 1.2, peak: 0.5, attack: 0.0008, decay: 0.012 }, { tone: 140, peak: 0.3, decay: 0.03 }], into, k);
    this.parts(t + 0.11, [{ noise: 'bandpass', hz: 700, q: 1.2, peak: 0.45, attack: 0.0008, decay: 0.014 }], into, k);
    this.parts(t + 0.2, [{ noise: 'bandpass', hz: 2600, q: 0.9, peak: 0.12, attack: 0.04, decay: 0.25 }, { noise: 'lowpass', hz: 220, q: 0.7, peak: 0.3, attack: 0.15, decay: 0.3 }], into, k);
    this.parts(t + (open ? 1.1 : 0.95), [{ tone: 62, peak: 0.9, decay: 0.09 }, { noise: 'bandpass', hz: 500, q: 1, peak: 0.4, attack: 0.001, decay: 0.03 }], into, k);
  }

  // A bubble in the canal: a note at Minnaert's frequency for its size (3.26 m/s over the radius, in water at
  // a bar), rising as it nears the surface, ringing for a few of its cycles. From the canal's side.
  bubble(t, radius, k = 1) {
    this.ring();
    const hz = 3.26 / Math.max(0.0015, radius), ac = this.ac, g = gainOf(ac);
    g.gain.setValueAtTime(0, t);
    g.gain.setTargetAtTime(k * BUBBLE, t, 0.0008);
    g.gain.setTargetAtTime(0, t + 0.003, Math.min(0.04, 18 / hz));
    wire(this.note(t, hz, 0.12, hz * 1.35), g, this.canalPan);
  }
}

// What ctx.sound.cue() can play, and what each takes. Another part of the page calls these at its own
// moments; the flight's own moments (the drive lighting, the gear, a touchdown, the speed of sound, a capture
// when core.dock.docked goes to 1, a crash), the deck's (the gear on the plating, the swivel, the roll posts)
// and the walk's (footsteps, a landing, the ball, the lifts, the hatch) are found from the readouts and need
// no call. What a cue is given is taken as a number in its range, or its default: a part of the page that
// passes NaN gets the default, not a fault in the browser's audio.
const fin = (v, d, lo = 0, hi = 1) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const unitDir = (v, d) => {
  const ok = Array.isArray(v) && v.length === 3 && v.every(Number.isFinite), n = ok ? Math.hypot(v[0], v[1], v[2]) : 0;
  return n > 0 ? [v[0] / n, v[1] / n, v[2] / n] : d;
};
export const CUES = {
  strike: (e, t, p) => e.strike(t, fin(p.strength, 0.5), fin(p.hz, 600, 40, 12000)),
  thump: (e, t, p) => e.thump(t, fin(p.strength, 0.5), fin(p.from, 70, 20, 400), fin(p.to, 36, 15, 400), fin(p.seconds, 0.4, 0.05, 3)),
  contact: (e, t, p) => e.contact(t, fin(p.speed, 0.1, 0, 10)),
  latch: (e, t, p) => e.latch(t, Math.round(fin(p.n, 4, 1, 8))),
  capture: (e, t) => e.capture(t),
  release: (e, t) => e.release(t),
  hiss: (e, t, p) => e.hiss(t, fin(p.seconds, 4, 0.1, 20), fin(p.strength, 1)),
  boom: (e, t, p) => e.boom(t, Math.round(fin(p.n, 2, 1, 3))),
  nwave: (e, t, p) => e.nwave(t, fin(p.strength, 1), fin(p.seconds, 0.12, 0.02, 0.4)),
  ignition: (e, t, p) => e.ignition(t, fin(p.strength, 0.7)),
  shutdown: (e, t, p) => e.shutdown(t, fin(p.strength, 0.6)),
  gear: (e, t, p) => e.gear(t, p.down ?? true),
  touchdown: (e, t, p) => e.touchdown(t, fin(p.strength, 0.6), fin(p.screech, 0.5)),
  pad: (e, t, p) => e.pad(t, fin(p.strength, 0.5), fin(p.sink, 0.3, 0, 5)),
  liftoff: (e, t) => e.liftoff(t),
  swivel: (e, t, p) => e.swivelStop(t, fin(p.strength, 0.5)),
  puff: (e, t, p) => e.puff(t, fin(p.strength, 0.5), fin(p.side, 0, -1, 1)),
  crash: (e, t) => e.crash(t),
  step: (e, t, p) => e.step(t, p.surface ?? 'grass', fin(p.side, 0, -1, 1), fin(p.weight, 1, 0, 1.6)),
  land: (e, t, p) => e.land(t, p.surface ?? 'grass', fin(p.strength, 1, 0, 1.6)),
  ball: (e, t, p) => e.ball(t, fin(p.strength, 0.5), fin(p.distance, 2, 0.3, 300), unitDir(p.dir, [0, -0.6, -0.8]), p.surface ?? 'paving'),
  door: (e, t, p) => e.door(t, p.open ?? true, fin(p.distance, 3, 0.3, 300), unitDir(p.dir, [0, 0, -1])),
  brake: (e, t, p) => e.brake(t, p.aboard ?? true, fin(p.distance, 0, 0, 300), unitDir(p.dir, [0, -1, 0])),
  hatch: (e, t, p) => e.hatch(t, p.open ?? true),
  bubble: (e, t, p) => e.bubble(t, fin(p.radius, 0.005, 0.0015, 0.02), fin(p.strength, 1)),
  chime: (e, t) => e.chime(t),
};
const SCENES = { flight: 0, ring: 1, hub: 2, car: 3 };
const SETTABLE = ['heat', 'lift', 'walk', 'surface'];
const WALK_KEYS = ['w', 'a', 's', 'd', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
// What a browser counts as the pilot acting: a key, a mouse button going down, a finger coming up.
const GESTURES = ['keydown', 'mousedown', 'pointerup', 'touchend', 'click'];
const WHERE_SCENE = [2, 3, 1];   // the walk's WHERE (hub, lift, floor) as a scene

// ---- the page's part ----------------------------------------------------------------------------

const st = {
  ctx: null, ac: null, engine: null, button: null,
  wanted: true,        // the pilot has not muted it
  failed: '',          // why there is no sound, if there is none
  volume: 0.7,
  toggledAt: -1e9,     // when it was last started or muted, ms: one press is one change
  inputs: newInputs(), mix: newMix(), events: newEvents(), memory: newMemory(),
  deckEvents: newDeckEvents(), deckMemory: newDeckMemory(), walkEvents: newWalkEvents(), walkMemory: newWalkMemory(),
  air: { rho: 1.225, sound: C0 }, hear: { heard: 1, delay: 0, path: 0 }, extra: { docked: 0, rcs: 0 },
  q0: new Float64Array(4), q1: new Float64Array(4), haveQ: false, rate: 0, dir: new Float64Array(3),
  w0: new Float64Array(3), w1: new Float64Array(3), acc: new Float64Array(3), work: new Float64Array(3), nozzle: NaN,
  heardBefore: 1, machBefore: 0, offset: new Float64Array(3), viewBefore: -1, boomOut: 0, boomSec: 0.12, boomAt: -1e9,
  rolled: 0, rolled0: 0, jointAt: new Float64Array(16),   // m along the runway, and the joints crossed this frame
  simT: -1, thr: 0, tas: 0, decel: 0,
  scene: null,         // a scene another part asked for, or null: found from who draws the frame
  set: { heat: NaN, lift: 0, walk: NaN, surface: 'grass' },
  updatedAt: -1e9,     // when update() last ran, ms: a frame another part draws does not call it
  stepAt: 0, stepSide: 1, sleep: 0, meter: null, scratch: null, warned: {},
  walking: false, ticked: false, canal: new Float64Array(2), liftOut: new Float64Array(2), ear: new Float64Array(3), bubbleDebt: 0,
};

function say(text) { if (st.ctx) st.ctx.say(text); }

function remember() {
  try { localStorage.setItem('orbit.sound', JSON.stringify({ muted: !st.wanted, volume: st.volume })); } catch { /* a host may refuse storage */ }
}

function audible() { return Boolean(st.wanted && st.ac && st.ac.state === 'running'); }

function showState() {
  if (!st.button) return;
  st.button.setAttribute('aria-pressed', audible() ? 'true' : 'false');
  st.button.title = st.failed ? `No sound: ${st.failed}` : audible() ? 'Sound on (Y mutes; the wheel sets the volume)' : 'Sound off (Y)';
}

// Make the instrument, on a gesture of the pilot's: no browser lets a page sound before one.
function start() {
  if (st.ac || st.failed) return;
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) { st.failed = 'this browser has no Web Audio'; say(`No sound: ${st.failed}`); showState(); return; }
  try {
    st.ac = new AC({ latencyHint: 'interactive' });
    st.engine = new Engine(st.ac);
    st.ac.onstatechange = showState;
    requestAnimationFrame(tick);
  } catch (e) {
    st.failed = e.message || String(e);
    st.ac = null;
    st.engine = null;
    say(`No sound: ${st.failed}`);
  }
  showState();
}

function wake() {
  clearTimeout(st.sleep);
  if (st.ac && st.ac.state !== 'running' && st.ac.state !== 'closed') st.ac.resume().then(showState, () => {});
}

// Sound on or off, as the pilot wants it.
function want(on) {
  st.wanted = on;
  if (st.engine) st.engine.forget();
  if (on) {
    if (!st.ac) start();
    wake();
  } else if (st.ac) {
    st.engine.master.gain.setTargetAtTime(0, st.ac.currentTime, 0.05);
    st.engine.ui.gain.setTargetAtTime(0, st.ac.currentTime, 0.05);
    st.sleep = setTimeout(() => { if (!st.wanted && st.ac.state === 'running') st.ac.suspend().then(showState, () => {}); }, 600);
  }
  remember();
  showState();
}

// Any key or tap: the first one starts the sound, a later one wakes it if the browser put it to sleep. The Y
// key and the SOUND button are left to toggle().
function gesture(e) {
  if (!st.wanted || document.hidden || e.target === st.button || e.key === 'y' || e.key === 'Y') return;
  if (!st.ac) start();
  wake();
}

function toggle() {
  const now = performance.now();
  if (now - st.toggledAt < 300) return;   // one press, however many ways it arrives
  st.toggledAt = now;
  want(!audible());
  say(st.failed ? `No sound: ${st.failed}` : st.wanted ? 'Sound on' : 'Sound off');
}

function setVolume(v) {
  st.volume = Math.min(1, Math.max(0, Number(v) || 0));
  remember();
  return st.volume;
}

// The frame's readouts, as the mix reads them. Allocates nothing but the deck's, read where the page has them.
function listen(ctx, owned) {
  const s = ctx.s, i = st.inputs, hands = ctx.input.hands;
  const dt = st.simT >= 0 ? s.t - st.simT : 0, lived = dt > 0 && dt <= 1;
  airOf(s, st.air);
  i.thr = s.throttle;
  i.thrRate = lived ? (s.throttle - st.thr) / dt : 0;
  i.rho = st.air.rho;
  i.sound = st.air.sound;
  i.tas = s.tas; i.mach = s.mach; i.qbar = s.qbar; i.alpha = s.alpha;
  i.onGround = s.onGround; i.gear = s.gear; i.crashed = s.crashed;
  const dock = ctx.core.dock;
  i.docked = dock && dock.docked > 0.5 ? 1 : 0;
  // how far the wheels have rolled: the runway's joints are laid along it
  st.rolled0 = st.rolled;
  if (lived && s.onGround > 0.5) st.rolled += Math.max(0, s.tas) * dt;
  // the brakes, from the speed lost along the runway
  const slowing = lived && s.onGround > 0.5 ? (st.tas - s.tas) / dt : 0;
  st.decel += (slowing - st.decel) * Math.min(1, lived ? dt / 0.25 : 1);
  i.decel = st.decel;
  // the small thrusters: the pilot's hands or the crew's, and the craft's turning
  const pilot = Math.round(s.auto) === ctx.AUTO.off;
  i.rcs = i.docked ? 0 : thrusting(s, hands, pilot);
  i.rcsSide = pilot ? -hands.ty : 0;
  st.q1[0] = s.qw; st.q1[1] = s.qx; st.q1[2] = s.qy; st.q1[3] = s.qz;
  if (st.haveQ && lived) {
    const rate = turnRate(st.q0, st.q1, dt);
    i.att = i.docked ? 0 : turning(rate, st.rate, dt, s);
    st.rate = rate;
    // the body's angular acceleration in roll and pitch: what the roll posts and the lift jet are asked for
    bodyRates(st.q0, st.q1, dt, st.w1);
    for (let k = 0; k < 3; k++) {
      const a = (st.w1[k] - st.w0[k]) / dt;
      st.acc[k] += (a - st.acc[k]) * Math.min(1, dt / 0.08);
      if (!Number.isFinite(st.acc[k])) st.acc[k] = 0;
    }
    st.w0.set(st.w1);
  } else { i.att = 0; st.acc.fill(0); }
  st.q0.set(st.q1);
  st.haveQ = true;
  // the flight deck's swivel, where the deck's readouts are
  const deck = ctx.core.deck;
  const nozzle = deck && Number.isFinite(deck.nozzle) ? deck.nozzle : 0;
  i.nozzle = nozzle;
  i.nozzleRate = lived && Number.isFinite(st.nozzle) ? (nozzle - st.nozzle) / dt : 0;
  st.nozzle = nozzle;
  jetWork(st.acc[0], st.acc[1], jetBorne(s.throttle, nozzle), st.work);
  i.posts = st.work[0]; i.postsSide = st.work[1]; i.liftJet = st.work[2];
  // the ear: aboard, or with the camera; the drive's sound to a camera, and whether the cone has passed it
  i.outside = ctx.VIEWS[ctx.state.view] === 'cockpit' ? 0 : 1;
  st.boomOut = 0;
  if (ctx.cam && ctx.P && ctx.axes) {
    const f = ctx.axes.fwd, r = ctx.axes.right, d = ctx.axes.down;
    const a = (s.alpha * Math.PI) / 180, b = (s.beta * Math.PI) / 180;
    const cf = s.tas * Math.cos(a) * Math.cos(b), cr = s.tas * Math.sin(b), cd = s.tas * Math.sin(a) * Math.cos(b);
    const dx = ctx.cam[0] - ctx.P[0] + f[0] * NOZZLE_AFT, dy = ctx.cam[1] - ctx.P[1] + f[1] * NOZZLE_AFT, dz = ctx.cam[2] - ctx.P[2] + f[2] * NOZZLE_AFT;
    carried(dx, dy, dz, cf * f[0] + cr * r[0] + cd * d[0], cf * f[1] + cr * r[1] + cd * d[1], cf * f[2] + cr * r[2] + cd * d[2], st.air.sound, st.hear);
    i.range = Math.hypot(dx, dy, dz);
    i.delay = st.hear.delay; i.path = st.hear.path; i.heard = st.hear.heard;
    // the cone passed the camera: between two lived frames of the same view, the camera not jumped
    const jumped = Math.hypot(dx - st.offset[0], dy - st.offset[1], dz - st.offset[2]) > 0.25 * i.range + 20;
    if (lived && i.outside && ctx.state.view === st.viewBefore && !jumped && s.t - st.boomAt > 1 && conePassed(st.heardBefore, i.heard, st.machBefore, s.mach)) {
      st.boomAt = s.t;
      st.boomOut = boomStrength(i.range, st.air.rho);
      const m = Math.max(1.05, s.mach, st.machBefore);   // the N-wave's length: the craft's 34 m at the cone's angle, longer far off
      st.boomSec = Math.min(0.3, ((34 * Math.sqrt(m * m - 1)) / (m * st.air.sound)) * Math.pow(Math.max(1, i.range / 70), 0.25));
    }
    st.offset[0] = dx; st.offset[1] = dy; st.offset[2] = dz;
    st.heardBefore = i.heard;
    // where the drive is, seen from the camera: three.js has just placed it (main.js), so its view is this frame's
    const view = ctx.camera && ctx.camera.matrixWorldInverse && ctx.camera.matrixWorldInverse.elements;
    if (view) {
      toCamera(-dx, -dy, -dz, view, st.dir);
      i.dirX = st.dir[0]; i.dirY = st.dir[1]; i.dirZ = st.dir[2];
    }
  }
  st.machBefore = s.mach;
  st.viewBefore = ctx.state.view;
  i.heat = st.set.heat;
  i.scene = st.scene !== null ? st.scene : owned ? 1 : 0;
  i.lift = st.set.lift;
  i.car = 0; i.canal = 0; i.draught = 0;
  i.warp = owned ? 1 : ctx.state.warp;
  i.skipping = ctx.state.skipping ? 1 : 0;
  i.volume = st.volume;
  i.muted = st.wanted ? 0 : 1;
  i.sampleRate = st.ac.sampleRate;
  st.simT = s.t; st.thr = s.throttle; st.tas = s.tas;
  st.extra.docked = i.docked;
  st.extra.rcs = Math.max(i.rcs, 0.6 * i.att);
  return i;
}

// One frame of sound: the mix onto the instrument, and the moments that happened since the last.
function play(ctx, owned) {
  const e = st.engine, now = st.ac.currentTime, i = listen(ctx, owned);
  if (i.scene > 0.5) e.roomFor(i.scene);
  e.apply(mix(i, st.mix), now);
  const ev = detect(st.memory, ctx.s, st.extra, st.events);
  const dv = detectDeck(st.deckMemory, ctx.core.deck || null, ctx.s, st.work[0], st.work[1], st.deckEvents);
  if (owned || !(i.warp > 0 && i.warp <= 2) || i.skipping) return;   // moments are for a clock near real time
  const t = now + 0.005;
  if (ev.ignition) e.ignition(t, ev.ignition);
  if (ev.shutdown) e.shutdown(t, ev.shutdown);
  if (ev.boom && !i.outside) e.boom(t, 1);
  if (st.boomOut > 0) e.nwave(t, st.boomOut, st.boomSec);
  if (ev.gear) e.gear(t, ev.gear > 0);
  if (ev.touchdown) e.touchdown(t, ev.touchdown, ev.screech);
  if (ev.crash) e.crash(t);
  if (ev.capture) e.capture(t);
  if (ev.release) e.release(t);
  if (ev.contact) e.contact(t, 2 * ev.contact);
  if (ev.rcsOn) e.strike(t, 0.12 * ev.rcsOn, 900);
  if (ev.rcsOff) e.strike(t, 0.08 * ev.rcsOff, 700);
  if (dv.pad) e.pad(t, dv.pad, dv.sink);
  if (dv.liftoff) e.liftoff(t);
  if (dv.swivel) e.swivelStop(t, dv.swivel);
  if (dv.puff) e.puff(t, dv.puff, dv.side);
  if (st.mix.joint > 0) {   // the joints crossed in this frame, spread over the next as they were over this
    const n = joints(st.rolled0, st.rolled, st.jointAt), span = Math.min(0.1, Math.max(0, ctx.dt || 0));
    for (let k = 0; k < n; k++) e.bump(t + 0.02 + st.jointAt[k] * span, st.mix.joint * (0.8 + 0.2 * Math.random()));
  }
}

// The walk, heard: the walker's place (the band, the hub's lobby, a car) from its readouts, the canal, the
// lifts, the draught at a door, and the walk's moments, each from where it happens. The walk draws its own
// frames on its own clock (walk-view.js), so this runs beside them, from tick().
function playWalk(ctx, walk) {
  const e = st.engine, v = walk.v, o = v.core.o, i = st.inputs, now = st.ac.currentTime;
  const where = Math.round(o.where), scene = st.scene !== null ? st.scene : WHERE_SCENE[where] ?? 1;
  i.scene = scene;
  i.thr = 0; i.thrRate = 0; i.rho = 0; i.tas = 0; i.mach = 0; i.qbar = 0; i.onGround = 1; i.crashed = 0; i.docked = 1;
  i.rcs = 0; i.att = 0; i.nozzle = 0; i.nozzleRate = 0; i.posts = 0; i.liftJet = 0; i.outside = 0; i.heard = 0;
  canalHeard(o.s, o.c, v.look.heading, st.canal);
  i.canal = where === 2 ? st.canal[0] : 0;
  i.canalPan = st.canal[1];
  i.draught = draughtAt(o);
  liftHeard(o, st.liftOut);
  i.lift = Math.max(st.liftOut[0], st.set.lift || 0);
  i.car = st.liftOut[1];
  i.warp = v.warp;
  i.skipping = 0;
  i.volume = st.volume;
  i.muted = st.wanted ? 0 : 1;
  i.sampleRate = st.ac.sampleRate;
  e.roomFor(scene);
  e.apply(mix(i, st.mix), now);
  const ev = detectWalk(st.walkMemory, o, st.walkEvents);
  if (!(v.warp > 0 && v.warp <= 2)) return;   // moments are for a clock near real time
  const t = now + 0.005, span = Math.min(0.1, Math.max(0.005, ctx.dt || 1 / 60));
  for (let k = 0; k < ev.steps; k++) e.step(t + ev.stepAt[k] * span, ev.surface, ev.stepSide[k], ev.stepWeight);
  if (ev.land) e.land(t, ev.surface, ev.land);
  const axes = viewAxes(o.upTheta, v.look.heading, v.look.pitch);
  if (ev.bounce) {
    const d = toListener(o.ballX - o.eyeX, o.ballY - o.eyeY, o.ballZ - o.eyeZ, axes, st.ear);
    const r = Math.hypot(o.ballX, o.ballZ);
    e.ball(t, ev.bounce, d, st.ear, r > 0.5 * (RING.floor + RING.hub) ? ballSurface(o) : r < WALK.lobby + 5 ? 'grip' : 'car');
  }
  if (ev.doors || ev.brake) {
    const k = Math.round(o.spoke), a = (2 * Math.PI * k) / RING.spokes, R = (where === 0 ? WALK.lobby : RING.floor) - 1.2;
    const inCar = where === 1;
    const d = inCar ? WALK.car : toListener(R * Math.sin(a) - o.eyeX, WALK.liftC + WALK.car - o.eyeY, R * Math.cos(a) - o.eyeZ, axes, st.ear);
    if (inCar) { st.ear[0] = 0; st.ear[1] = 0; st.ear[2] = -1; }
    if (d < 120) {
      if (ev.doors) e.door(t + (ev.doors > 0 ? 0.4 : 0), ev.doors > 0, d, st.ear);
      if (ev.brake) e.brake(t + (ev.brake > 0 ? 0 : 0.9), inCar, d, st.ear);
    }
  }
  if (ev.hatch) e.hatch(t, true);
  // the canal's bubbles, a few a second at its bank, fewer further off
  st.bubbleDebt += 8 * i.canal * span * (0.5 + Math.random());
  while (st.bubbleDebt >= 1) {
    st.bubbleDebt -= 1;
    e.bubble(t + Math.random() * span, 0.0025 + 0.007 * Math.random() ** 2, i.canal * (0.4 + 0.6 * Math.random()));
  }
}

// The floor under the ball where it came down: the plan's surface there.
function ballSurface(o) {
  const th = Math.atan2(o.ballX, o.ballZ);
  return underfoot(2, (th < 0 ? th + 2 * Math.PI : th) * RING.floor, o.ballY);
}

// A frame that another part of the page draws whole (the walk inside the Ring) never reaches update(): this
// runs beside it, so the sound goes on there. While walking it is the walk's sound; otherwise, if the flight's
// update() has not run lately, the flight's, heard from the Ring's interior.
function tick(nowMs) {
  if (!st.ac || st.ac.state === 'closed') return;
  requestAnimationFrame(tick);
  const ctx = st.ctx, walk = ctx.walk, walking = Boolean(walk && walk.v && walk.v.on && walk.v.core);
  if (walking !== st.walking) {   // through the hatch: into the hub, or back aboard
    if (audible() && st.ticked) {   // seen happen, not found so when the sound began
      if (walking) st.engine.hatch(st.ac.currentTime + 0.05, false);
      else if (walk && walk.v.core && walk.v.core.o.aboard > 0.5) st.engine.hatch(st.ac.currentTime + 0.02, true);
    }
    st.walking = walking;
    st.walkMemory.valid = 0;
    if (!walking) { st.simT = -1; st.engine && st.engine.forget(); }
  }
  st.ticked = true;
  if (!audible()) return;
  if (walking) { playWalk(ctx, walk); return; }
  if (nowMs - st.updatedAt < 150) return;
  play(ctx, true);
  const touch = ctx.input.touch;
  let speed = Number.isFinite(st.set.walk) ? st.set.walk : NaN;
  if (!Number.isFinite(speed)) {
    speed = touch && touch.active ? 1.4 : 0;
    for (const k of WALK_KEYS) if (ctx.input.held.has(k)) speed = 1.4;
  }
  if (speed > 0.3 && st.inputs.scene < 1.5) {
    const every = 1000 / (1.9 * Math.sqrt(Math.min(4, speed / 1.4)));
    if (nowMs - st.stepAt > every) {
      st.stepAt = nowMs;
      st.stepSide = -st.stepSide;
      st.engine.step(st.ac.currentTime + 0.005, st.set.surface, st.stepSide, 0.8 + 0.2 * Math.min(2, speed / 1.4));
    }
  }
}

// ctx.sound: what the rest of the page may ask of the sound.
const api = {
  cues: Object.keys(CUES),
  // Play a moment by name, with what it takes (CUES, above; delay: seconds from now). False, and said once, for
  // a name that is not a cue. Muted or not yet started, a cue is taken and not played.
  cue(name, given = {}) {
    const f = Object.hasOwn(CUES, name) ? CUES[name] : null, params = given && typeof given === 'object' ? given : {};
    if (!f) {
      if (!st.warned[name]) {
        st.warned[name] = true;
        say(`Sound has no cue named ${name}`);
        console.error(`sound: no cue named "${name}"; there are ${api.cues.join(', ')}`);
      }
      return false;
    }
    if (audible()) f(st.engine, st.ac.currentTime + 0.005 + fin(params.delay, 0, 0, 30), params);
    return true;
  },
  // A standing condition: heat 0..1 (the entry's heating, in place of the derived one; NaN to derive again),
  // lift 0..1 (a lift's motor, beside the walk's own), walk m/s (footsteps at that speed in a frame another part
  // draws where no walk runs; the walk's own come from its readouts; NaN: from the keys), surface (for those).
  set(name, value) {
    if (!SETTABLE.includes(name)) { console.error(`sound: nothing to set named "${name}"; there are ${SETTABLE.join(', ')}`); return false; }
    st.set[name] = value;
    return true;
  },
  // Where the ear is: 'flight', 'ring' (the Ring's band), 'hub', 'car', or null to follow who draws the frame.
  scene(name) {
    if (name !== null && !(name in SCENES)) { console.error(`sound: no scene named "${name}"`); return false; }
    st.scene = name === null ? null : SCENES[name];
    return true;
  },
  volume(v) { return v === undefined ? st.volume : setVolume(v); },
  mute(on = true) { want(!on); return !st.wanted; },
  get on() { return audible(); },
  get state() { return st.failed ? `failed: ${st.failed}` : !st.ac ? (st.wanted ? 'waiting for a key or a tap' : 'off') : st.wanted ? st.ac.state : 'muted'; },
  get context() { return st.ac; },
  get engine() { return st.engine; },   // the instrument, for the page's tests to watch
  get targets() { return st.mix; },
  // The level leaving the instrument, root mean square over the last few milliseconds: for a test to see that it sounds.
  level() {
    if (!st.engine) return 0;
    if (!st.meter) {
      st.meter = st.ac.createAnalyser();
      st.meter.fftSize = 2048;
      st.engine.master.connect(st.meter);
      st.engine.ui.connect(st.meter);
      st.scratch = new Float32Array(st.meter.fftSize);
    }
    st.meter.getFloatTimeDomainData(st.scratch);
    let sum = 0;
    for (let k = 0; k < st.scratch.length; k++) sum += st.scratch[k] * st.scratch[k];
    return Math.sqrt(sum / st.scratch.length);
  },
};

export const sound = {
  name: 'sound',

  init(ctx) {
    st.ctx = ctx;
    ctx.sound = api;
    try {
      const saved = JSON.parse(localStorage.getItem('orbit.sound') || 'null');
      if (saved && typeof saved === 'object') {
        st.wanted = !saved.muted;
        if (Number.isFinite(saved.volume)) st.volume = Math.min(1, Math.max(0, saved.volume));
      }
    } catch { /* a host may refuse storage */ }
    const volume = Number(new URLSearchParams(location.search).get('volume'));
    if (volume > 0) st.volume = Math.min(1, volume);

    const grid = document.getElementById('buttons');
    if (grid) {
      const style = document.createElement('style');
      style.textContent = '#buttons button[aria-pressed="true"] { border-color: var(--vector, #7cc7ff); }';
      document.head.appendChild(style);
      const b = document.createElement('button');
      b.type = 'button';
      b.id = 'btn-sound';
      b.dataset.cmd = 'sound';
      b.textContent = 'SOUND';
      b.addEventListener('click', (e) => { toggle(); e.stopPropagation(); });
      b.addEventListener('wheel', (e) => {
        say(`Sound ${Math.round(setVolume(st.volume - Math.sign(e.deltaY) * 0.1) * 100)}%`);
        e.preventDefault();
      }, { passive: false });
      const help = document.getElementById('btn-help');   // with the page's own buttons, before HELP
      (help ? help.parentNode : grid).insertBefore(b, help);
      st.button = b;
    }
    for (const type of GESTURES) window.addEventListener(type, gesture, { capture: true, passive: true });
    window.addEventListener('keydown', (e) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || (e.target && e.target.tagName === 'INPUT')) return;
      if (e.key === 'y' || e.key === 'Y') toggle();
    });
    document.addEventListener('visibilitychange', () => {   // a hidden page is a silent one
      if (!st.ac || st.ac.state === 'closed') return;
      if (document.hidden) st.ac.suspend().catch(() => {});
      else if (st.wanted) wake();
    });
    showState();
  },

  command(c) {
    if (c !== 'sound') return false;
    toggle();
    return true;
  },

  update(ctx) {
    if (ctx.walk && ctx.walk.v && ctx.walk.v.on) return;   // the walk draws the frame: it is heard from tick()
    st.updatedAt = ctx.now;
    if (audible()) play(ctx, false);
  },
};
