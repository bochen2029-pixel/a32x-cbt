// Holding the frame rate: the drawing buffer's size, set from the frame times the page sees, and the
// tiers stepped down and up while the page chooses them itself. No three.js and no browser here, so
// the tests can drive it with made-up frame times. It never touches the flight: the core steps by its
// fixed clock whatever the frame rate, and all this changes is how many pixels are drawn. GPLv3.
//
// The picture's size goes down a ladder of rungs, each 0.8 of the pixels of the one above (the pixel
// ratio times 0.894), from the tier's cap at rung 0 to about a quarter of its pixels. Every half second
// or so of frames (a window) the law looks at the frame time, a mean with the slowest eighth and any
// spike left out, so one long frame (a shader compiling, a collection) moves nothing:
//
//   slow, more than 15 % over the target: down as many rungs as the pixels' share says will bring it
//     under 0.9 of the target, at most three at once. Where the GPU's own time is known and well under
//     the target, the time goes elsewhere (the core, the page) and fewer pixels would not help: nothing.
//   a step down that bought less than a quarter of what it should have is undone, and steps down wait
//     4 s, then 8, up to 64: a browser that holds the page to 30 frames a second to save power, or a
//     slow processor, is not helped by a blurrier picture.
//   on target (within 5 % of it, or faster) for long enough: up a rung, on trial, judged on its first
//     four frames and watched for a window after. If it is slow, back down, and that rung waits twice as
//     long before the next try (1.5 s, doubling to 30 s): binary exponential backoff. A display's refresh
//     hides how much faster a frame could be drawn, so without the GPU's time the only way to find out is
//     to try. Where the GPU's time is known, the step is taken at once where it says the rung above fits
//     with room, tried after the wait where it fits at all, and never where it does not.
//   fast, at rung 0: nothing. A fast machine never leaves the tier's own size.
//
// After any change the first frames (a quarter second, at least three) are not counted: the buffers
// are being made again. Nor, at the start and at each new tier, are the first two seconds and twenty
// frames, while the shaders compile.

export const TARGET = { desktop: 1000 / 60, phone: 1000 / 30 };   // ms a frame: 60 frames a second, and 30 on a phone
export const RUNG = 0.8;                                            // each rung's share of the pixels of the one above
export const RUNGS = 7;                                             // rung 6 draws 0.26 of the cap's pixels

export const LAW = {
  band: 0.15,            // slow: the frame time this far over the target
  onTarget: 0.05,        // on target: within this of it, or under
  aim: 0.9,              // a step down aims under this share of the target
  maxDown: 3,            // rungs one step down may drop
  windowMs: 500,         // a window: at least this long
  windowFrames: 6,       // and at least this many frames
  settleMs: 250,         // after a change, frames not counted for this long
  settleFrames: 3,       // and at least this many
  warmMs: 2000,          // at the start, and at a new tier, while its shaders compile: not counted for this long
  warmFrames: 20,        // and at least this many frames
  trim: 1 / 8,           // the slowest share of a window left out of its mean
  spike: 4,              // and any frame this many times the window's median
  noEffect: 0.25,        // a step down that bought less than this share of its promise is undone
  holdMs: 4000,          // then steps down wait this long
  holdMaxMs: 64000,      // doubling to this
  probeMs: 1500,         // time on target before trying the rung above
  probeMaxMs: 30000,     // doubling to this after failed tries
  probeSettle: 2,        // a try's first frames not counted (no time: the picture only grew)
  probeFrames: 4,        // and the frames that judge it
  gpuRoom: 0.75,         // slow but the GPU under this share of the target: not the pixels' fault
  gpuFits: 0.85,         // the GPU's time for the rung above under this share of the target: step up at once
};

// The pixel ratio's factor at rung k.
export function rungScale(k) { return Math.pow(RUNG, k / 2); }

// A window's frame time: the mean with the slowest share and the spikes left out.
export function windowMs(times, law = LAW) {
  const xs = times.filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  if (!xs.length) return 0;
  const median = xs[xs.length >> 1];
  const kept = xs.slice(0, Math.max(1, xs.length - Math.floor(xs.length * law.trim))).filter((x) => x <= median * law.spike);
  return kept.reduce((a, b) => a + b, 0) / kept.length;
}

export class Resolution {
  // target: ms a frame; rungs: how many (rung 0 the tier's cap); law: LAW or a variant.
  constructor({ target = TARGET.desktop, rungs = RUNGS, law = LAW } = {}) {
    this.target = target;
    this.law = law;
    this.top = rungs - 1;
    this.reset();
  }

  // Back to the tier's own size, everything learned forgotten (a new tier, or the page's own choice).
  reset(rung = 0) {
    this.rung = rung;
    this.t = 0;                // ms of frames seen
    this.frames = [];
    this.gpu = [];
    this.spanMs = 0;
    this.settleMs = this.law.warmMs;
    this.settleFrames = this.law.warmFrames;
    this.since = 0;            // t of the last change
    this.last = null;          // the last change, until the window after it has judged it
    this.wait = new Array(this.top + 1).fill(this.law.probeMs);   // per rung: time on target before trying it
    this.holdUntil = 0;        // no step down before this t
    this.holdMs = this.law.holdMs;
    this.probation = null;     // a rung tried and kept, still watched: { rung, until }
    this.lastMs = 0;           // the last window's frame time
    this.lastGpu = null;
    this.slow = false;
    this.windows = 0;          // windows judged
  }

  get scale() { return rungScale(this.rung); }

  // One frame: ms between it and the one before; gpuMs its GPU time where measured (else null).
  // Returns null, or the change made: { rung, from, kind: 'down' | 'up' | 'undo' | 'back', ms }.
  push(ms, gpuMs = null) {
    if (!(ms > 0) || !Number.isFinite(ms)) return null;
    this.t += ms;
    if (this.settleFrames > 0 || this.settleMs > 0) {
      this.settleFrames--;
      this.settleMs -= ms;
      return null;
    }
    this.frames.push(ms);
    this.gpu.push(gpuMs);
    this.spanMs += ms;
    // a rung tried above is judged on its first few frames, so a try that fails costs a few frames only
    const quick = this.last && this.last.kind === 'up';
    if (quick ? this.frames.length < this.law.probeFrames : this.spanMs < this.law.windowMs || this.frames.length < this.law.windowFrames) return null;
    const m = windowMs(this.frames, this.law);
    const known = this.gpu.filter((g) => g !== null && Number.isFinite(g) && g >= 0);
    const g = known.length === this.gpu.length ? windowMs(known, this.law) : null;
    this.frames = [];
    this.gpu = [];
    this.spanMs = 0;
    this.lastMs = m;
    this.lastGpu = g;
    this.windows++;
    return this.decide(m, g);
  }

  // Frames that are not the drawing's (the flight skipped ahead): the window starts again after them.
  skip(ms) {
    if (ms > 0 && Number.isFinite(ms)) this.t += ms;
    this.frames = [];
    this.gpu = [];
    this.spanMs = 0;
  }

  change(to, kind, m, extra = {}) {
    const from = this.rung;
    this.rung = to;
    this.since = this.t;
    this.settleMs = kind === 'up' ? 0 : this.law.settleMs;
    this.settleFrames = kind === 'up' ? this.law.probeSettle : this.law.settleFrames;
    this.last = { kind, from, to, ms: m, ...extra };
    return { rung: to, from, kind, ms: m };
  }

  decide(m, g) {
    const L = this.law, T = this.target;
    const slow = m > T * (1 + L.band);
    this.slow = slow;
    // the last change, judged by the window after it
    const last = this.last;
    this.last = null;
    if (last && last.kind === 'down') {
      const promised = last.ms * (1 - Math.pow(RUNG, last.to - last.from));
      if (last.ms - m < L.noEffect * promised) {
        this.holdUntil = this.t + this.holdMs;
        this.holdMs = Math.min(this.holdMs * 2, L.holdMaxMs);
        return this.change(last.from, 'undo', m);
      }
    }
    // a rung tried above fails if its first frames are slow, or any window soon after them is
    if (this.probation && (this.probation.rung !== this.rung || this.t >= this.probation.until)) this.probation = null;
    const tried = last && last.kind === 'up' ? last.to : this.probation ? this.probation.rung : null;
    if (tried !== null && tried === this.rung) {
      if (slow) {
        this.wait[tried] = Math.min(this.wait[tried] * 2, L.probeMaxMs);
        this.probation = null;
        return this.change(tried + 1, 'back', m);
      }
      if (last) this.probation = { rung: tried, until: this.t + 2 * L.windowMs };
      else if (this.t >= this.probation.until - L.windowMs) { this.wait[tried] = L.probeMs; this.probation = null; }
    }
    if (slow) {
      if (g !== null && g < T * L.gpuRoom) return null;
      if (this.rung >= this.top || this.t < this.holdUntil) return null;
      const n = Math.min(L.maxDown, Math.max(1, Math.ceil(Math.log((T * L.aim) / m) / Math.log(RUNG))));
      return this.change(Math.min(this.top, this.rung + n), 'down', m);
    }
    if (this.rung > 0 && m <= T * (1 + L.onTarget)) {
      const up = this.rung - 1;
      const waited = this.t - this.since >= this.wait[up];
      // with the GPU's time: at once where it says the rung above fits with room (after a try that failed,
      // not before its wait), a try after the wait where it fits at all, never where it does not; without
      // it, a try after the wait
      const next = g === null ? null : g / RUNG;
      const go = next === null ? waited : (next < T * L.gpuFits && (waited || this.wait[up] <= L.probeMs)) || (next < T && waited);
      if (go) return this.change(up, 'up', m);
    }
    return null;
  }

  // For the meter and the tests.
  describe() {
    return { rung: this.rung, scale: this.scale, ms: this.lastMs, gpu: this.lastGpu, target: this.target, slow: this.slow, stuck: this.stuck };
  }

  // Fewer pixels were tried lately and did not help: the time goes elsewhere.
  get stuck() { return this.t < this.holdUntil; }
}

// The tiers, while the page chooses them itself ('auto'): down when the picture has come down three
// rungs (half the pixels) and the frames are still slow for two seconds, since a tier lower at its full
// size looks better than one higher at half of it; up when a minute has passed at the tier's full size
// on target, on trial. A trial that has to come down two rungs within ten seconds of its start goes
// back, and that tier is not tried again; nor is one the page has stepped down from. The first three
// seconds at a tier (its shaders compiling) count for nothing. Chosen by hand, the tier stays; where the
// GPU's time shows room for the next one, the page says so, once.
export const STEPS = {
  downRung: 3,           // the rung at which a slow picture takes a tier down instead
  slowMs: 2000,          // slow this long there
  roomMs: 60000,         // on target at full size this long before trying the tier above
  trialMs: 10000,        // a trial's length
  trialRung: 2,          // a trial that comes down to this rung fails
  warmMs: 3000,          // after a tier change, time that counts for nothing
  gpuRoom: 0.5,          // where the GPU's time is known, a trial only under this share of the target
  offerRoom: 0.4,        // and an offer, chosen by hand, under this
  gpuBusy: 0.75,         // slow, fewer pixels no help, and the GPU over this share of the target: a tier down
};

export class TierSteps {
  // tiers: names, cheapest first; tier: the one drawn; auto: whether the page chooses it.
  constructor({ tiers = ['low', 'medium', 'high'], tier = 'medium', auto = true, steps = STEPS } = {}) {
    this.tiers = tiers;
    this.steps = steps;
    this.failed = new Set();
    this.offered = false;
    this.set(tier, auto, 0);
  }

  // A tier now drawn, at time t (ms), chosen by the page itself (auto) or by hand.
  set(tier, auto, t) {
    this.tier = tier;
    this.auto = auto;
    this.at = t;
    this.slowFrom = null;
    this.roomFrom = t + this.steps.warmMs;
    if (!auto) this.trial = null;
  }

  // After each window the resolution has judged: t its clock, ms the window's frame time, slow, rung,
  // gpu (ms or null), target. Returns null, or { tier, why } to change to, or { offer, why } to say.
  judge({ t, ms, slow, rung, gpu = null, target, stuck = false }) {
    const S = this.steps;
    if (t - this.at < S.warmMs) return null;
    const at = this.tiers.indexOf(this.tier);
    if (slow || rung > 0) this.roomFrom = t;
    // slow where fewer pixels have done what they can: three rungs down, or, by the GPU's own time, busy
    // where fewer pixels did not help (its fixed costs: shadows, reflections, the Ring's geometry)
    const spent = rung >= S.downRung || (stuck && gpu !== null && gpu > target * S.gpuBusy);
    this.slowFrom = slow && spent ? (this.slowFrom ?? t) : null;
    if (!this.auto) {
      const next = this.tiers[at + 1];
      if (next && !this.offered && rung === 0 && t - this.roomFrom >= S.roomMs && ((gpu !== null && gpu < target * S.offerRoom) || ms < target * 0.6)) {
        this.offered = true;
        return { offer: next, why: `room for ${next}` };
      }
      return null;
    }
    if (this.trial) {
      if (rung >= S.trialRung) {
        const back = this.trial.from;
        this.failed.add(this.trial.to);
        this.trial = null;
        this.set(back, true, t);
        return { tier: back, why: `${this.tiers[at]} was too slow here` };
      }
      if (t - this.trial.t >= S.trialMs) this.trial = null;
    }
    if (this.slowFrom !== null && t - this.slowFrom >= S.slowMs && at > 0) {
      const down = this.tiers[at - 1];
      this.failed.add(this.tier);
      this.trial = null;
      this.set(down, true, t);
      return { tier: down, why: `${ms.toFixed(0)} ms a frame at ${this.tiers[at]}, even with fewer pixels` };
    }
    const up = this.tiers[at + 1];
    if (up && !this.trial && !this.failed.has(up) && rung === 0 && !slow && t - this.roomFrom >= S.roomMs
        && (gpu === null || gpu < target * S.gpuRoom)) {
      this.set(up, true, t);
      this.trial = { from: this.tiers[at], to: up, t };
      return { tier: up, why: `a minute with room at ${this.tiers[at]}` };
    }
    return null;
  }
}

// The two together, as the page uses them: frame() with each frame's interval, and whether to count it
// (not while the flight is skipped ahead: those frames are the core's). Returns null, or
// { resize: true } when the picture's size changed, and { tier, why } or { offer, why } from the tiers.
export class Governor {
  constructor({ target = TARGET.desktop, tier = 'medium', auto = true, fixed = false, law = LAW, steps = STEPS, tiers } = {}) {
    this.fixed = fixed;
    this.resolution = new Resolution({ target, law });
    this.tiers = new TierSteps({ tiers, tier, auto, steps });
    this.clock = 0;
  }

  get scale() { return this.fixed ? 1 : this.resolution.scale; }
  get rung() { return this.fixed ? 0 : this.resolution.rung; }

  // A tier now drawn: by the page (auto) or by hand. The picture goes back to the tier's full size.
  setTier(tier, auto) {
    this.resolution.reset();
    this.tiers.set(tier, auto, this.clock);
  }

  frame(ms, { count = true, gpuMs = null } = {}) {
    if (this.fixed || !(ms > 0) || !Number.isFinite(ms)) return null;
    this.clock += ms;
    const r = this.resolution;
    if (!count) { r.skip(ms); return null; }
    const windows = r.windows;
    const change = r.push(ms, gpuMs);
    let out = change ? { resize: true, change } : null;
    if (r.windows !== windows) {
      const step = this.tiers.judge({ t: this.clock, ms: r.lastMs, slow: r.slow, rung: r.rung, gpu: r.lastGpu, target: r.target, stuck: r.stuck });
      if (step && step.tier) {
        r.reset();
        out = { resize: true, ...step };
      } else if (step) out = { ...(out || {}), ...step };
    }
    return out;
  }

  describe() { return { ...this.resolution.describe(), tier: this.tiers.tier, auto: this.tiers.auto, fixed: this.fixed }; }
}
