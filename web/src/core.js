// The core, from the page: the WebAssembly module (orbit_core.h) behind names. The readouts' order is
// the header's enum, and a test reads the header to hold the two equal. GPLv3.

export const OUT = [
  't', 'phase', 'auto', 'sas', 'crashed', 'window', 'siteE', 'siteN', 'siteU', 'qw', 'qx', 'qy', 'qz',
  'lat', 'lon', 'alt', 'hdg', 'pitch', 'roll', 'tas', 'mach', 'qbar', 'vs', 'alpha', 'beta', 'g',
  'vorb', 'apo', 'peri', 'inc', 'tApo', 'throttle', 'prop', 'mass', 'gear', 'onGround',
  'ringE', 'ringN', 'ringU', 'ringAxE', 'ringAxN', 'ringAxU', 'ringRefE', 'ringRefN', 'ringRefU',
  'ringRange', 'ringRate', 'sunE', 'sunN', 'sunU', 'vrelE', 'vrelN', 'vrelU', 'portRange',
];

export const DT = 0.02;
export const AUTO = { off: 0, crew: 1, approach: 2, return: 3, dock: 4 };
export const SAS = { hold: 0, prograde: 1, retrograde: 2, target: 3 };
export const PHASES = ['HOLD', 'TAKE-OFF ROLL', 'ROTATE', 'CLIMB', 'ASCENT', 'INSERTION', 'ORBIT'];
export const PH = { hold: 0, roll: 1, rotate: 2, climb: 3, ascent: 4, insert: 5, orbit: 6 };
export const SAS_NAMES = ['HOLD', 'PROGRADE', 'RETROGRADE', 'TARGET'];
export const HUB_PORT_M = 350, STANDOFF_M = 300;

// The ring's shape: orbit_core.h's OC_RING_* and OC_HUB_*, held equal to them by a test. Spoke k runs
// along sin(2 pi k / spokes) ref + cos(2 pi k / spokes) (ref x axis); the hub's port is at -axis.
export const RING = {
  spin: 0.0443, floor: 5000, width: 1000, hull: 5040, roof: 4700, rim: 4620, spokes: 6, spoke: 70, hub: 160, port: HUB_PORT_M,
};

// KDFW 17C, its end and true heading (docs/provenance.md, 1f): where every flight starts.
export const START = { lat: 32.91569901, lon: -97.02600098, hdg: 180.3 };

export class Core {
  constructor(module) {
    this.m = module;
    this.s = {};
    this.blocks = [];
    if (module._oc_out_len() !== OUT.length) {
      throw new Error(`the core has ${module._oc_out_len()} readouts and the page knows ${OUT.length}: rebuild one of them`);
    }
  }

  reset(start = START) {
    this.m._oc_reset(start.lat, start.lon, start.hdg);
    return this.read();
  }

  controls(c) {
    this.m._oc_controls(c.pitch, c.roll, c.yaw, c.throttle, c.tx, c.ty, c.tz, c.gear ? 1 : 0, c.brake);
  }

  auto(mode) { this.m._oc_auto(mode); }
  sas(mode) { this.m._oc_sas(mode); }

  step(n) {
    if (n > 0) this.m._oc_step(n);
    return this.read();
  }

  hash() { return this.m._oc_hash() >>> 0; }

  read() {
    const h = this.m.HEAPF64, p = this.m._oc_out() / 8;
    for (let i = 0; i < OUT.length; i++) this.s[OUT[i]] = h[p + i];
    for (const b of this.blocks) {
      const q = this.m[b.out]() / 8, o = this[b.key];
      for (let i = 0; i < b.names.length; i++) o[b.names[i]] = h[q + i];
    }
    return this.s;
  }

  // A feature's own readouts (orbit_dock.h, orbit_return.h, ...): another block of doubles, read with
  // the main one after every step into this[key]. Refused, loudly, when the core and the page disagree.
  addBlock(key, out, len, names) {
    if (typeof this.m[out] !== 'function' || typeof this.m[len] !== 'function') throw new Error(`the flight core has no ${out}: rebuild it`);
    const n = this.m[len]();
    if (n !== names.length) throw new Error(`${out} has ${n} readouts and the page knows ${names.length}: rebuild one of them`);
    this.blocks.push({ key, out, names });
    this[key] = {};
    this.read();
    return this[key];
  }
}

// The module, made: createOrbitCore is the Emscripten factory the page's build puts before the page,
// the core as WebAssembly. Where a host refuses WebAssembly, the same core compiled to plain JavaScript
// (createOrbitCoreJs, when the build carries it) runs instead, and the page says so.
export async function loadCore(factory = globalThis.createOrbitCore, fallback = globalThis.createOrbitCoreJs) {
  if (typeof factory !== 'function') throw new Error('the flight core is missing from the page: build it with tools/build.mjs --core');
  try {
    return new Core(await factory());
  } catch (e) {
    if (typeof fallback !== 'function') throw e;
    const core = new Core(await fallback());
    core.note = `The flight core runs as JavaScript: this page may not run WebAssembly (${e.message || e})`;
    return core;
  }
}
