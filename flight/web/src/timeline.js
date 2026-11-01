// The debrief's timeline, in the manner of Tacview's: the flight as a bar along the foot of the debrief, coloured
// by the gate's bands as the flown path is, its moments (events.js) marked where they happened, and a playhead
// that can be dragged back through the flight, stepped a second at a time or played at the flight's own pace. The
// view draws the aircraft where the playhead holds it, in vectors, and the camera follows it there (view.js,
// setHead). It works on the samples the view keeps of the flight, four a second (view.js, record), interpolated
// between: what the page saw, not a replay through the core. Plain numbers, and a canvas drawn from them: node
// tests the numbers. GPLv3.

import { standing, tagColour } from './events.js';

// What a sample keeps of the state, for the readout and the camera (view.js, record); the core's own names.
export const KEPT = ['thr_height_ft', 'thr_along_m', 'cas_kn', 'vapp_kn', 'vs_fpm', 'loc_dots', 'gs_dots', 'roll_deg',
  'pitch_deg', 'heading_deg', 'gs_kn', 'on_ground'];
const BAND_CSS = ['#40ff73', '#ff3829', '#8c99a8'];     // acmi.js's BAND_COLOUR: in the bands, out of them, outside
const BAND_WORD = ['in the bands', 'out of the bands', ''];
const LEFT = 8, RIGHT_PAD = 56;                          // the bar's ends in the canvas, in CSS pixels
const HELD = '#4fd8ff', LIVE = '#40ff70', DIM = '#7a9a7a';
const finite = Number.isFinite;
const fmt = (v, digits = 0) => Number(v).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });

export function sampleState(s) {
  const kept = {};
  for (const k of KEPT) kept[k] = s[k];
  return kept;
}

const lerp = (a, b, f) => a + (b - a) * f;
const lerpDeg = (a, b, f) => (((a + ((((b - a) % 360) + 540) % 360 - 180) * f) % 360) + 360) % 360;

// Where the flight was at time t: the samples either side of it interpolated, the position and every value in a
// straight line, a heading the shorter way round, the attitude along the shorter arc; the earlier one's band.
// Before the first sample, the first; after the newest, the newest; with none, null.
export function sampleAt(history, t) {
  const n = history.length;
  if (!n || !finite(t)) return null;
  if (t <= history[0].t) return history[0];
  if (t >= history[n - 1].t) return history[n - 1];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (history[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = history[lo], b = history[hi], f = (t - a.t) / (b.t - a.t);
  if (!a.q || !b.q) return a;
  const s = {};
  for (const [k, x] of Object.entries(a.s || {})) {
    const y = b.s?.[k];
    s[k] = !finite(x) || !finite(y) ? x : k === 'heading_deg' ? lerpDeg(x, y, f) : lerp(x, y, f);
  }
  let [bx, by, bz, bw] = b.q;
  const [ax, ay, az, aw] = a.q;
  if (ax * bx + ay * by + az * bz + aw * bw < 0) [bx, by, bz, bw] = [-bx, -by, -bz, -bw];
  const q = [lerp(ax, bx, f), lerp(ay, by, f), lerp(az, bz, f), lerp(aw, bw, f)];
  const len = Math.hypot(...q);
  return { t, p: a.p.map((v, k) => lerp(v, b.p[k], f)), q: q.map((v) => v / len), band: a.band, s };
}

// The playhead: live (t null) while the debrief follows the flight, else held at a time of it, which a drag, a step
// or playing moves. A seek to the newest sample or past it goes live; playing goes live when it gets there.
export class Playhead {
  constructor() {
    this.t = null;
    this.playing = false;
  }

  get live() {
    return this.t === null;
  }

  goLive() {
    this.t = null;
    this.playing = false;
  }

  seek(t, history) {
    const n = history.length;
    if (!n || Number.isNaN(t) || t === null || t === undefined) return;
    if (t >= history[n - 1].t) this.goLive();
    else this.t = Math.max(history[0].t, t);
  }

  // seconds back (-) or on (+) from where it is, or from the newest sample when live; a step pauses playing
  step(seconds, history) {
    if (!history.length) return;
    this.playing = false;
    this.seek((this.t ?? history[history.length - 1].t) + seconds, history);
  }

  // play from where it is held, or from the flight's start when live; or pause
  toggle(history) {
    if (!history.length) return;
    if (this.playing) {
      this.playing = false;
      return;
    }
    if (this.live) this.t = history[0].t;
    this.playing = true;
  }

  // real seconds gone by: playing, the playhead moves on by as many of the flight's
  advance(seconds, history) {
    if (this.playing && !this.live && seconds > 0) this.seek(this.t + seconds, history);
    if (this.live) this.playing = false;
  }
}

// The time under a point of the bar, x across a canvas width CSS pixels wide: the flight's first sample at the
// bar's left end, its newest at its right; Infinity past the right end, where LIVE is; null with no samples.
export function timeAt(x, width, history) {
  const n = history.length;
  if (!n) return null;
  const right = width - RIGHT_PAD;
  if (x > right + 4) return Infinity;
  const t0 = history[0].t, t1 = Math.max(t0 + 1, history[n - 1].t);
  return t0 + Math.max(0, Math.min(1, (x - LEFT) / (right - LEFT))) * (t1 - t0);
}

// The last of the log's moments at or before t (to a twentieth of a second), by its index; -1 before the first.
export function momentAt(events, t) {
  let at = -1;
  for (let k = 0; k < events.length && events[k].t <= t + 0.05; ++k) at = k;
  return at;
}

// A moment's mark on the bar: its tag's colour, as on the path; the moments without a tag, dim.
export function markColour(e) {
  return e.tag ? tagColour(e.tag, e.kind) : DIM;
}

// What the playhead's sample says: the time; in the air the height above the threshold and how far out, the speed
// against Vapp, the sink, the beams and the bank (events.js, standing); on the ground how far past the threshold
// and the speed; and the gate's band there.
export function readout(sample) {
  if (!sample) return '';
  const s = sample.s || {};
  const parts = [`${sample.t.toFixed(1)} s`];
  if (s.on_ground > 0.5) {
    if (finite(s.thr_along_m) && s.thr_along_m < 0) parts.push(`${fmt(-s.thr_along_m)} m past the threshold`);
    if (finite(s.cas_kn)) parts.push(`${fmt(s.cas_kn)} kt`);
  } else {
    const where = [finite(s.thr_height_ft) ? `${fmt(s.thr_height_ft)} ft` : '',
      finite(s.thr_along_m) && s.thr_along_m > 0 ? `${(s.thr_along_m / 1852).toFixed(1)} nm out` : ''].filter(Boolean).join(', ');
    if (where) parts.push(where);
    const standingThere = standing(s);
    if (standingThere) parts.push(standingThere);
  }
  if (BAND_WORD[sample.band]) parts.push(BAND_WORD[sample.band]);
  return parts.join(' · ');
}

// The bar, into a canvas w by h pixels, ratio of them to a CSS pixel: the readout of the playhead's moment over it;
// the flight from its first sample to its newest, each run of a band in its colour; the moments marked over it;
// the playhead; the times at its ends; LIVE at the right, lit while the debrief follows the flight.
export function drawTimeline(g, w, h, ratio, { history, events, head, sample, playing }) {
  const r = ratio, n = history.length;
  g.clearRect(0, 0, w, h);
  g.fillStyle = 'rgba(0, 0, 0, 0.62)';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(160, 200, 160, 0.3)';
  g.lineWidth = r;
  g.strokeRect(r / 2, r / 2, w - r, h - r);
  if (!n) return;
  const live = head === null || head === undefined;
  const t0 = history[0].t, t1 = Math.max(t0 + 1, history[n - 1].t);
  const left = LEFT * r, right = w - RIGHT_PAD * r, barY = 24 * r, barH = 10 * r;
  const x = (t) => left + ((Math.min(t1, Math.max(t0, t)) - t0) / (t1 - t0)) * (right - left);
  g.textBaseline = 'middle';
  g.font = `${12 * r}px ui-monospace, "Cascadia Mono", Consolas, monospace`;
  g.fillStyle = live ? LIVE : HELD;
  g.textAlign = 'left';
  g.fillText(`${readout(sample)}${playing ? '   playing' : ''}`, left, 11 * r, right - left);
  // the runs of a band, each from its first sample to the next run's first
  for (let from = 0, k = 1; k <= n; ++k) {
    if (k < n && history[k].band === history[from].band) continue;
    const end = history[Math.min(k, n - 1)].t;
    g.fillStyle = BAND_CSS[history[from].band] ?? BAND_CSS[2];
    g.fillRect(x(history[from].t), barY, Math.max(r, x(end) - x(history[from].t)), barH);
    from = k;
  }
  // the moments, those without a tag first, so that a tagged one at the same time (the stop, the verdict) shows
  for (const tagged of [false, true]) {
    for (const e of events) {
      if (!finite(e.t) || e.t < t0 || Boolean(e.tag) !== tagged) continue;
      g.fillStyle = markColour(e);
      g.fillRect(x(e.t) - r, barY - 6 * r, 2 * r, 6 * r);
    }
  }
  const hx = live ? right : x(head);
  g.fillStyle = live ? LIVE : HELD;
  g.fillRect(hx - r, barY - 7 * r, 2 * r, barH + 11 * r);
  g.font = `${11 * r}px ui-monospace, "Cascadia Mono", Consolas, monospace`;
  g.fillStyle = DIM;
  g.fillText(`${t0.toFixed(0)} s`, left, 47 * r);
  g.textAlign = 'right';
  g.fillText(`${t1.toFixed(0)} s`, right, 47 * r);
  g.textAlign = 'left';
  g.font = `bold ${11 * r}px ui-monospace, "Cascadia Mono", Consolas, monospace`;
  g.fillStyle = live ? LIVE : DIM;
  g.fillText('LIVE', right + 10 * r, barY + barH / 2);
}
