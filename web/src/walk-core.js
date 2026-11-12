// The walk's core (orbit_walk.h), from the page: its readouts by name, its numbers, and a thin wrapper over
// the module's oc_walk_* functions. The readouts' order is the header's enum and the numbers are its
// #defines; a test reads the header to hold the two equal. No three.js and no DOM here. GPLv3.

// The readouts of oc_walk_out(), in the header's order.
export const WALK_OUT = [
  't', 'where', 'spoke', 'theta', 's', 'c', 'h', 'r', 'upTheta', 'eyeX', 'eyeY', 'eyeZ', 'vs', 'vc', 'vh', 'speed',
  'heading', 'pitch', 'ground', 'g', 'feltS', 'feltC', 'feltH', 'centrifugal', 'corS', 'corC', 'corH',
  'lift', 'liftR', 'liftV', 'liftA', 'use', 'aboard', 'jumps', 'jumpDs', 'jumpDc', 'jumpT', 'jumpRise',
  'ball', 'ballX', 'ballY', 'ballZ', 'ballFalls', 'ballDs', 'ballDc', 'ballT',
  'carR0', 'carR1', 'carR2', 'carR3', 'carR4', 'carR5',
];

// orbit_walk.h's chosen numbers, by the header's names less OC_WALK_ (and _M): metres, m/s, m/s2.
export const WALK = {
  tall: 1.8, eye: 1.7, cm: 1.0, radius: 0.3, pace: 1.4, run: 4.0, jump: 4.43, push: 4.0, mu: 0.7, grip: 1.0, ball: 0.11,
  lobby: 150, lobbyC0: 10, lobbyC1: 90,
  liftC: 48, car: 5, carTall: 3, door: 2, doorTall: 2.4, shaftWall: 0.5, liftPush: 1.5, liftEase: 0.5, liftBrake: 1.0,
  streets: 60, street: 5, canal: 30, parapet: 0.4, parapetTall: 1.1, plazaDeck: 60, plaza: 120,
  promenade: 37, promenadeW: 8, lane: 224, laneW: 5, wallpath: 492, wallpathW: 10,
};

export const PLACE = { hatch: 0, lift: 1, floor: 2 };          // where oc_walk_reset puts the walker
export const WHERE = { hub: 0, lift: 1, floor: 2 };            // where the walker is
export const LIFT = { atHub: 0, down: 1, atFloor: 2, up: 3 };  // a car
export const USE = { nothing: 0, hatch: 1, call: 2, ride: 3 }; // what use would do
export const BALL = { none: 0, flying: 1, resting: 2 };
export const BOX = { block: 0, parapet: 1, pylon: 2, shaft: 3 };
export const BOX_FIELDS = ['zone', 'kind', 's', 'half', 'c0', 'c1', 'h0', 'h1'];

const NEEDS = ['reset', 'put', 'controls', 'ball', 'step', 'out', 'out_len', 'box_count', 'boxes', 'hash'];

export class WalkCore {
  // module: the orbit core's Emscripten module, the one the flight runs in (Core.m)
  constructor(module) {
    for (const f of NEEDS) {
      if (typeof module[`_oc_walk_${f}`] !== 'function') throw new Error(`the core has no oc_walk_${f}: rebuild it`);
    }
    const n = module._oc_walk_out_len();
    if (n !== WALK_OUT.length) throw new Error(`the walk has ${n} readouts and the page knows ${WALK_OUT.length}: rebuild one of them`);
    this.m = module;
    this.o = {};
    this.read();
  }

  // Start at PLACE.hatch, PLACE.lift or PLACE.floor, at rest. Any other place is refused.
  reset(place) {
    this.m._oc_walk_reset(place);
    return this.read();
  }

  // Stand at rest on the rim floor at s, c; false, with nothing changed, where the floor is not free.
  put(s, c) {
    const ok = this.m._oc_walk_put(s, c) === 1;
    this.read();
    return ok;
  }

  // fwd, right -1..1; heading, pitch radians; run, jump, use booleans (jump and use act on the press)
  controls(c) {
    this.m._oc_walk_controls(c.fwd, c.right, c.heading, c.pitch, c.run ? 1 : 0, c.jump ? 1 : 0, c.use ? 1 : 0);
  }

  ball(height, speed) {
    this.m._oc_walk_ball(height, speed);
    return this.read();
  }

  step(n) {
    if (n > 0) this.m._oc_walk_step(n);
    return this.read();
  }

  read() {
    const h = this.m.HEAPF64, p = this.m._oc_walk_out() / 8;
    for (let i = 0; i < WALK_OUT.length; i++) this.o[WALK_OUT[i]] = h[p + i];
    return this.o;
  }

  // The solid things of the lobby and the floor, as the walker meets them: [{ zone, kind, s, half, c0, c1, h0, h1 }]
  boxes() {
    const n = this.m._oc_walk_box_count(), p = this.m._oc_walk_boxes() / 8, h = this.m.HEAPF64, k = BOX_FIELDS.length;
    const list = [];
    for (let i = 0; i < n; i++) {
      const b = {};
      for (let j = 0; j < k; j++) b[BOX_FIELDS[j]] = h[p + i * k + j];
      list.push(b);
    }
    return list;
  }

  hash() { return this.m._oc_walk_hash() >>> 0; }
}
