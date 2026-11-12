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
//   the hull  eight resonators, the structure's modes: what the drive shakes and what a knock rings
//   the air   the roar, the crackle, the wind and the plasma, each as strong as the air is dense; the cabin
//             hears them through its wall, a camera outside hears them late and thinned by the distance
//   the cabin fans and a faint electrical hum
//   the Ring  its interior's air, footsteps, a lift, in a room six seconds long (built when first entered)
//   master    a limiter, a soft ceiling, the volume

import {
  C0, HULL, MAX_DELAY, NOZZLE_AFT, SHEAR_RATIO, airOf, carried, crackleCurve, detect, fillNoise, joints, mix, newEvents, newInputs,
  newMemory, newMix, roomResponse, thrusting, toCamera, turnRate, turning,
} from './sound-mix.js';

// A voice asked for 1 comes out of the instrument at REF, root mean square, ahead of the volume: the drive at
// full power sits 20 dB under full scale and its peaks clear it. TRIM is each voice's gain to make that so,
// measured by rendering the voice alone (flight/orbit/README.md, "The map and the sound").
export const REF = 0.1;
export const TRIM = {
  roar: 10.2, tear: 42.4, crack: 774, vib: 49.1, hum: 1.2, shear: 2.53, kick: 80.1, wind: 14.2, windLow: 80.3, buffet: 117, plasma: 9.55,
  plasCrack: 4390, rcs: 30.8, roll: 70.4, joint: 2.69, brake: 68.6, fans: 7.13, elec: 1.37, room: 14.8, airy: 3.94, lift: 1.46,
  strike: 56.8, thump: 0.451, screech: 3.83, motor: 0.0242, hiss: 0.228, step: 0.145, door: 1.1, out: 0.559, makeup: 0.74,
  strikeAir: 0.0791, rollAir: 0.15, brakeAir: 0.854,   // what a knock, the tyres and the brakes send to a camera outside
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
    this.nextStep = 0;
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
    this.nA = nA; this.nB = nB; this.air = air;
    const crackSum = gainOf(ac, 1);
    nA.connect(crackSum);
    nB.connect(crackSum);
    const curve = crackleCurve();

    // ---- buses
    const hullIn = gainOf(ac, 1), hullOut = gainOf(ac, 1), jet = gainOf(ac, 1), skin = gainOf(ac, 1), cabin = gainOf(ac, 1);
    const aboard = gainOf(ac, 1), ext = gainOf(ac, 1), life = gainOf(ac, 1), mixBus = gainOf(ac, 1);
    // what a knock, a thump or the tyres send out through the air to a camera: as much as there is air to carry it
    const knocks = gainOf(ac, 1), gKnocksAir = gainOf(ac);
    follow('knocksAir', gKnocksAir.gain);
    this.hullIn = hullIn; this.hullOut = hullOut; this.cabin = cabin; this.mixBus = mixBus;

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
    // drive is.
    const delay = ac.createDelay(MAX_DELAY + 0.5), absorb = filter(ac, 'lowpass', 18000, 0.5), gOut = gainOf(ac), where = placer(ac);
    delay.delayTime.value = 0.2;
    jet.connect(delay);
    skin.connect(delay);
    wire(knocks, gKnocksAir, delay);
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

    // ---- master: a limiter for the moments, a soft ceiling, the volume
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
  }

  // The Ring's interior, built the first time it is wanted: its air, a lift, footsteps, a door, and the room.
  ring() {
    if (this.ringBuilt) return;
    this.ringBuilt = true;
    const ac = this.ac, follow = this.follow, level = this.level;
    const dry = gainOf(ac, 1), send = gainOf(ac, 1), out = gainOf(ac, 1), gRing = gainOf(ac);
    const gRoom = gainOf(ac), gAiry = gainOf(ac), gLift = gainOf(ac), liftLP = filter(ac, 'lowpass', 300, 0.7);
    wire(this.air, filter(ac, 'lowpass', 190, 0.6), gRoom, dry);
    wire(this.air, filter(ac, 'bandpass', 1100, 0.3), gAiry, dry);
    wire(liftLP, gLift, dry);
    for (const ratio of [1, 2.01]) {
      const o = oscillator(ac, 'sawtooth', 52 * ratio);
      o.connect(liftLP);
      follow('liftHz', o.frequency, ratio);
    }
    level('room', gRoom.gain);
    level('airy', gAiry.gain);
    level('lift', gLift.gain);
    this.steps = [];
    for (let k = 0; k < 2; k++) {
      const f = filter(ac, 'bandpass', 900, 0.8), g = gainOf(ac), p = panner(ac, 0);
      wire(this.nB, f, g, p, dry);
      wire(p, gainOf(ac, 0.5), send);
      const o = oscillator(ac, 'sine', 90), og = gainOf(ac);
      wire(o, og, dry);
      this.steps.push({ f, g, p, o, og });
    }
    this.doorBP = filter(ac, 'bandpass', 500, 2);
    this.gDoor = gainOf(ac);
    wire(this.nA, this.doorBP, this.gDoor, dry);
    wire(this.gDoor, gainOf(ac, 0.5), send);
    const seconds = 6, n = Math.floor(seconds * ac.sampleRate), ir = ac.createBuffer(2, n, ac.sampleRate);
    roomResponse(ir.getChannelData(0), ir.getChannelData(1), ac.sampleRate, { seconds: 5.5 });
    const room = ac.createConvolver();
    room.normalize = true;
    room.buffer = ir;
    wire(send, room, gainOf(ac, 0.6), out);
    wire(dry, out, gRing, this.mixBus);
    follow('ring', gRing.gain);
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

  // Through the speed of sound. Aboard it is one thump; outside, a returning craft's two reports.
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

  // A footfall inside the Ring: grass is a soft brush with little under it, paving a short knock.
  step(t, surface = 'grass', side = 0, weight = 1) {
    this.ring();
    const v = this.steps[this.nextStep++ % this.steps.length], grass = surface !== 'paving';
    if (v.p.pan) v.p.pan.setValueAtTime(0.3 * side, t);
    v.f.frequency.setValueAtTime(grass ? 2600 : 1100, t);
    v.f.Q.setValueAtTime(grass ? 0.5 : 1.2, t);
    v.g.gain.setTargetAtTime((grass ? 0.5 : 0.8) * weight * TRIM.step, t, grass ? 0.012 : 0.002);
    v.g.gain.setTargetAtTime(0, t + (grass ? 0.05 : 0.012), grass ? 0.05 : 0.02);
    v.o.frequency.setValueAtTime(grass ? 80 : 120, t);
    v.og.gain.setTargetAtTime((grass ? 0.15 : 0.35) * weight * TRIM.step, t, 0.004);
    v.og.gain.setTargetAtTime(0, t + 0.02, 0.03);
  }

  door(t, open = true) {   // a lift's doors: a second of sliding, and the stop
    this.ring();
    this.doorBP.frequency.setValueAtTime(open ? 380 : 620, t);
    this.doorBP.frequency.linearRampToValueAtTime(open ? 620 : 380, t + 0.9);
    this.gDoor.gain.setTargetAtTime(0.5 * TRIM.door, t, 0.06);
    this.gDoor.gain.setTargetAtTime(0, t + 0.9, 0.04);
    this.strike(t + 0.95, 0.12, 500);
  }
}

// What ctx.sound.cue() can play, and what each takes. Another part of the page calls these at its own
// moments; the flight's own moments (the drive lighting, the gear, a touchdown, the speed of sound, a capture
// when core.dock.docked goes to 1, a crash) are found from the readouts and need no call.
export const CUES = {
  strike: (e, t, p) => e.strike(t, p.strength ?? 0.5, p.hz ?? 600),
  thump: (e, t, p) => e.thump(t, p.strength ?? 0.5, p.from ?? 70, p.to ?? 36, p.seconds ?? 0.4),
  contact: (e, t, p) => e.contact(t, p.speed ?? 0.1),
  latch: (e, t, p) => e.latch(t, p.n ?? 4),
  capture: (e, t) => e.capture(t),
  release: (e, t) => e.release(t),
  hiss: (e, t, p) => e.hiss(t, p.seconds ?? 4, p.strength ?? 1),
  boom: (e, t, p) => e.boom(t, p.n ?? 2),
  ignition: (e, t, p) => e.ignition(t, p.strength ?? 0.7),
  shutdown: (e, t, p) => e.shutdown(t, p.strength ?? 0.6),
  gear: (e, t, p) => e.gear(t, p.down ?? true),
  touchdown: (e, t, p) => e.touchdown(t, p.strength ?? 0.6, p.screech ?? 0.5),
  crash: (e, t) => e.crash(t),
  step: (e, t, p) => e.step(t, p.surface ?? 'grass', p.side ?? 0, p.weight ?? 1),
  door: (e, t, p) => e.door(t, p.open ?? true),
};
const SCENES = { flight: 0, ring: 1, hub: 2 };
const SETTABLE = ['heat', 'lift', 'walk', 'surface'];
const WALK_KEYS = ['w', 'a', 's', 'd', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
// What a browser counts as the pilot acting: a key, a mouse button going down, a finger coming up.
const GESTURES = ['keydown', 'mousedown', 'pointerup', 'touchend', 'click'];

// ---- the page's part ----------------------------------------------------------------------------

const st = {
  ctx: null, ac: null, engine: null, button: null,
  wanted: true,        // the pilot has not muted it
  failed: '',          // why there is no sound, if there is none
  volume: 0.7,
  toggledAt: -1e9,     // when it was last started or muted, ms: one press is one change
  inputs: newInputs(), mix: newMix(), events: newEvents(), memory: newMemory(),
  air: { rho: 1.225, sound: C0 }, hear: { heard: 1, delay: 0, path: 0 }, extra: { docked: 0, rcs: 0 },
  q0: new Float64Array(4), q1: new Float64Array(4), haveQ: false, rate: 0, dir: new Float64Array(3),
  rolled: 0, rolled0: 0, jointAt: new Float64Array(16),   // m along the runway, and the joints crossed this frame
  simT: -1, thr: 0, tas: 0, decel: 0,
  scene: null,         // a scene another part asked for, or null: found from who draws the frame
  set: { heat: NaN, lift: 0, walk: NaN, surface: 'grass' },
  updatedAt: -1e9,     // when update() last ran, ms: a frame another part draws does not call it
  stepAt: 0, stepSide: 1, sleep: 0, meter: null, scratch: null, warned: {},
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

// The frame's readouts, as the mix reads them. Allocates nothing.
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
  } else i.att = 0;
  st.q0.set(st.q1);
  st.haveQ = true;
  // the ear: aboard, or with the camera; the drive's sound to a camera that flies along
  i.outside = ctx.VIEWS[ctx.state.view] === 'cockpit' ? 0 : 1;
  if (ctx.cam && ctx.P && ctx.axes) {
    const f = ctx.axes.fwd, r = ctx.axes.right, d = ctx.axes.down;
    const a = (s.alpha * Math.PI) / 180, b = (s.beta * Math.PI) / 180;
    const cf = s.tas * Math.cos(a) * Math.cos(b), cr = s.tas * Math.sin(b), cd = s.tas * Math.sin(a) * Math.cos(b);
    const dx = ctx.cam[0] - ctx.P[0] + f[0] * NOZZLE_AFT, dy = ctx.cam[1] - ctx.P[1] + f[1] * NOZZLE_AFT, dz = ctx.cam[2] - ctx.P[2] + f[2] * NOZZLE_AFT;
    carried(dx, dy, dz, cf * f[0] + cr * r[0] + cd * d[0], cf * f[1] + cr * r[1] + cd * d[1], cf * f[2] + cr * r[2] + cd * d[2], st.air.sound, st.hear);
    i.range = Math.hypot(dx, dy, dz);
    i.delay = st.hear.delay; i.path = st.hear.path; i.heard = st.hear.heard;
    // where the drive is, seen from the camera: three.js has just placed it (main.js), so its view is this frame's
    const view = ctx.camera && ctx.camera.matrixWorldInverse && ctx.camera.matrixWorldInverse.elements;
    if (view) {
      toCamera(-dx, -dy, -dz, view, st.dir);
      i.dirX = st.dir[0]; i.dirY = st.dir[1]; i.dirZ = st.dir[2];
    }
  }
  i.heat = st.set.heat;
  i.scene = st.scene !== null ? st.scene : owned ? 1 : 0;
  i.lift = st.set.lift;
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
  if (i.scene > 0.5) e.ring();
  e.apply(mix(i, st.mix), now);
  const ev = detect(st.memory, ctx.s, st.extra, st.events);
  if (owned || !(i.warp > 0 && i.warp <= 2) || i.skipping) return;   // moments are for a clock near real time
  const t = now + 0.005;
  if (ev.ignition) e.ignition(t, ev.ignition);
  if (ev.shutdown) e.shutdown(t, ev.shutdown);
  if (ev.boom) e.boom(t, i.outside ? 2 : 1);
  if (ev.gear) e.gear(t, ev.gear > 0);
  if (ev.touchdown) e.touchdown(t, ev.touchdown, ev.screech);
  if (ev.crash) e.crash(t);
  if (ev.capture) e.capture(t);
  if (ev.release) e.release(t);
  if (ev.contact) e.contact(t, 2 * ev.contact);
  if (ev.rcsOn) e.strike(t, 0.12 * ev.rcsOn, 900);
  if (ev.rcsOff) e.strike(t, 0.08 * ev.rcsOff, 700);
  if (st.mix.joint > 0) {   // the joints crossed in this frame, spread over the next as they were over this
    const n = joints(st.rolled0, st.rolled, st.jointAt), span = Math.min(0.1, Math.max(0, ctx.dt || 0));
    for (let k = 0; k < n; k++) e.bump(t + 0.02 + st.jointAt[k] * span, st.mix.joint * (0.8 + 0.2 * Math.random()));
  }
}

// A frame that another part of the page draws whole (the walk inside the Ring) never reaches update(): this
// runs beside it, so the sound goes on there. Footsteps follow what the walk says of itself, or, until it
// says anything, the walker's keys.
function tick(nowMs) {
  if (!st.ac || st.ac.state === 'closed') return;
  requestAnimationFrame(tick);
  const ctx = st.ctx;
  if (!audible() || nowMs - st.updatedAt < 150) return;
  play(ctx, true);
  const walk = ctx.core.walk, touch = ctx.input.touch;
  let speed = Number.isFinite(st.set.walk) ? st.set.walk : walk && Number.isFinite(walk.speed) ? walk.speed : NaN;
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
  cue(name, params = {}) {
    const f = CUES[name];
    if (!f) {
      if (!st.warned[name]) {
        st.warned[name] = true;
        say(`Sound has no cue named ${name}`);
        console.error(`sound: no cue named "${name}"; there are ${api.cues.join(', ')}`);
      }
      return false;
    }
    if (audible()) f(st.engine, st.ac.currentTime + 0.005 + (params.delay ?? 0), params);
    return true;
  },
  // A standing condition: heat 0..1 (the entry's heating, in place of the derived one; NaN to derive again),
  // lift 0..1 (a lift moving), walk m/s (the walker's speed; NaN: from the keys), surface 'grass' or 'paving'.
  set(name, value) {
    if (!SETTABLE.includes(name)) { console.error(`sound: nothing to set named "${name}"; there are ${SETTABLE.join(', ')}`); return false; }
    st.set[name] = value;
    return true;
  },
  // Where the ear is: 'flight', 'ring' (the Ring's interior), 'hub', or null to follow who draws the frame.
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
  get targets() { return st.mix; },
  // The level leaving the instrument, root mean square over the last few milliseconds: for a test to see that it sounds.
  level() {
    if (!st.engine) return 0;
    if (!st.meter) {
      st.meter = st.ac.createAnalyser();
      st.meter.fftSize = 2048;
      st.engine.master.connect(st.meter);
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
    st.updatedAt = ctx.now;
    if (audible()) play(ctx, false);
  },
};
