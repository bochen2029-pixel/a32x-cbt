// The flight's moments, as a debrief lists them: where the approach crossed 1,000, 500, 100 and 50 ft
// above the threshold and how it stood there, when it left the gate's bands and came back, the
// touchdown and any bounce, 80 kt on the rollout, the stop and the gate's verdict; the gear and the
// flight laws as they change. Found from the core's own state slots, a sample at a time (CLAUDE.md, 6):
// a height's or a speed's crossing is timed by interpolating between the samples either side of it, so
// the time does not depend on how often the page looked. No three.js and no browser: node tests it.
// GPLv3.

export const GATES_FT = [1000, 500, 100, 50];
const MOST_BAND_CHANGES = 12;   // a pilot hunting at a band's edge would fill the log; past this, a note
const MOST_REVERSE = 6;         // the reversers deployed and stowed: a landing has two, a rejected one more
const SETTLE_S = 3;            // the computers power up in a start's first seconds: their laws then are not the flight's

const fmt = (v, digits = 0) => Number(v).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const finite = Number.isFinite;

// A moment's colour in the debrief, by its tag, on the path and on the timeline's bar alike: red for out of the
// bands, a bounce or a crash, green for back in them, white for a gate, amber for the rest.
export function tagColour(tag, kind) {
  return /out|bounce|crash/.test(tag) ? '#ff5a4a' : /in the bands/.test(tag) ? '#40ff70' : kind === 'gate' ? '#e8f0e8' : '#ffb000';
}

// A moment as the panel prints it: the simulated time, then what happened.
export function eventLine(e) {
  return `${e.t.toFixed(1).padStart(7)} s  ${e.text}`;
}

// Where the aircraft stands against the beams, as a pilot says it. core.h: loc_dots and gs_dots are where
// each beam lies from the aircraft, + right and + up; so + is left of the localizer, below the glideslope.
export function beams(s) {
  const one = (name, v, plus, minus) => (!finite(v) ? '' : Math.abs(v) < 0.05 ? `${name} on` : `${name} ${Math.abs(v).toFixed(2)} ${v > 0 ? plus : minus}`);
  return [one('LOC', s.loc_dots, 'left', 'right'), one('G/S', s.gs_dots, 'low', 'high')].filter(Boolean).join(' · ');
}

// The approach's numbers at a sample: the speed against the target, the sink, the beams, the bank.
export function standing(s) {
  const parts = [];
  if (finite(s.cas_kn)) {
    const d = finite(s.vapp_kn) ? Math.round(s.cas_kn - s.vapp_kn) : null;
    parts.push(`${fmt(s.cas_kn)} kt${d === null ? '' : ` (Vapp ${d >= 0 ? '+' : '−'}${Math.abs(d)})`}`);
  }
  if (finite(s.vs_fpm)) parts.push(`sink ${fmt(Math.max(0, -s.vs_fpm))} fpm`);
  const b = beams(s);
  if (b) parts.push(b);
  if (finite(s.roll_deg)) parts.push(`bank ${Math.abs(s.roll_deg).toFixed(1)}°`);
  return parts.join(' · ');
}

// The time a quantity crossed a level between two samples, by straight-line interpolation; and another
// quantity's value at that time, the same way.
function crossing(p, s, key, level) {
  const a = p[key], b = s[key];
  return a === b ? s.t_s : p.t_s + ((a - level) / (a - b)) * (s.t_s - p.t_s);
}

function between(p, s, key, t) {
  return s.t_s === p.t_s ? s[key] : p[key] + ((s[key] - p[key]) * (t - p.t_s)) / (s.t_s - p.t_s);
}

const airborne = (s) => !(s.on_ground > 0.5);
const inBands = (s) => (finite(s.judge_in_bands) ? s.judge_in_bands > 0.5 : null);
// metres past the landing threshold (core.h: thr_along_m is + before it)
const past = (metresBefore) => fmt(-metresBefore);

export class FlightLog {
  constructor() {
    this.reset();
  }

  reset() {
    this.events = [];      // {t, kind, text, tag, lat, lon, raFt}, in the order they happened
    this.prev = null;
    this.prevTexts = null;
    this.gates = new Set();
    this.touched = false;
    this.slowed = false;
    this.stopped = false;
    this.judged = false;
    this.bandChanges = 0;
    this.reverseEvents = 0;
    this.reversersOut = new Set();   // the reversers out since they were last all stowed
    this.lawsSettled = false;
    this.startT = 0;
    this.version = (this.version || 0) + 1;   // changes whenever the list does
  }

  add(t, kind, text, at, tag = '') {
    this.events.push({ t, kind, text, tag, lat: at.lat_deg, lon: at.lon_deg, raFt: Math.max(0, at.ra_ft || 0) });
    ++this.version;
  }

  // A state, by name, as the page has it; texts, the state's words (the flight laws). A sample no newer
  // than the last is passed over; one older starts the log again, as a restarted flight does.
  observe(s, texts = null) {
    if (!s || !finite(s.t_s)) return;
    const p = this.prev;
    if (p && s.t_s < p.t_s) this.reset();
    else if (p && s.t_s === p.t_s) return;
    const q = this.prev;
    this.prev = s;
    const lastTexts = this.prevTexts;
    this.prevTexts = texts;
    if (!q) {
      this.startT = s.t_s;
      const h = s.thr_height_ft, out = s.thr_along_m;
      this.add(s.t_s, 'start', !airborne(s) ? 'start: on the ground'
        : finite(h) && finite(out) && out > 0 ? `start: ${fmt(h)} ft above the threshold, ${(out / 1852).toFixed(1)} nm out`
          : 'start: in the air', s);
      return;
    }

    // the gates, each once, the first time the height above the threshold passes it going down
    if (airborne(q) && finite(q.thr_height_ft) && finite(s.thr_height_ft)) {
      for (const g of GATES_FT) {
        if (this.gates.has(g) || !(q.thr_height_ft > g && s.thr_height_ft <= g)) continue;
        this.gates.add(g);
        const band = inBands(s);
        this.add(crossing(q, s, 'thr_height_ft', g), 'gate',
          `${fmt(g)} ft${band === null ? '' : band ? ', in the bands' : ', out of the bands'} · ${standing(s)}`, s, `${fmt(g)} ft`);
      }
    }

    // leaving the gate's bands and coming back, inside its window: the core's own judgement
    const was = inBands(q), now = inBands(s);
    if (was !== null && now !== null && was !== now && this.bandChanges <= MOST_BAND_CHANGES) {
      ++this.bandChanges;
      const ft = finite(s.thr_height_ft) ? `${fmt(s.thr_height_ft)} ft` : '';
      if (this.bandChanges > MOST_BAND_CHANGES) this.add(s.t_s, 'band', 'more changes in and out of the bands, not listed', s);
      else if (now) this.add(s.t_s, 'band', `back in the bands at ${ft} · ${standing(s)}`, s, 'in the bands');
      else this.add(s.t_s, 'band', `out of the bands at ${ft} · ${standing(s)}`, s, 'out of the bands');
    }

    // the gear, by its position (gear_pos, 0 up to 1 down and locked)
    if (finite(q.gear_pos) && finite(s.gear_pos)) {
      if (q.gear_pos < 0.999 && s.gear_pos >= 0.999) this.add(s.t_s, 'gear', 'gear down and locked', s);
      else if (q.gear_pos >= 0.999 && s.gear_pos < 0.999) this.add(s.t_s, 'gear', 'gear retracting', s);
    }

    // the flight laws, as the core names them, once the computers have powered up; a law other than
    // normal by then is said once, as a failed start's is
    if (texts && s.t_s - this.startT >= SETTLE_S) {
      const laws = [['pitch_law', 'pitch law'], ['lateral_law', 'roll law']];
      if (!this.lawsSettled) {
        this.lawsSettled = true;
        for (const [key, name] of laws) if (texts[key] && texts[key] !== 'normal') this.add(s.t_s, 'law', `${name}: ${texts[key]}`, s);
      } else if (lastTexts) {
        for (const [key, name] of laws) {
          if (texts[key] && lastTexts[key] && texts[key] !== lastTexts[key]) this.add(s.t_s, 'law', `${name}: ${texts[key]}`, s);
        }
      }
    }

    // the touchdown, a bounce, 80 kt, the stop
    if (!this.touched && airborne(q) && !airborne(s)) {
      this.touched = true;
      const side = finite(s.thr_right_m) ? `, ${Math.abs(s.thr_right_m).toFixed(1)} m ${s.thr_right_m >= 0 ? 'right' : 'left'} of the centreline` : '';
      // the sink and the pitch of the last sample in the air: the touchdown's own, to a step or two
      const where = finite(s.judge_touchdown_m) ? fmt(s.judge_touchdown_m) : past(s.thr_along_m);   // the judge's own
      this.add(s.t_s, 'touchdown', `touchdown ${where} m past the threshold${side}` +
        `${finite(q.vs_fpm) ? `, sink ${fmt(Math.max(0, -q.vs_fpm))} fpm` : ''}${finite(q.pitch_deg) ? `, pitch ${q.pitch_deg.toFixed(1)}°` : ''}`,
        s, 'touchdown');
    } else if (this.touched && !this.stopped && !airborne(q) && airborne(s)) {
      this.add(s.t_s, 'bounce', 'airborne again: a bounce', s, 'bounce');
    }
    if (this.touched && !this.slowed && !airborne(s) && q.cas_kn > 80 && s.cas_kn <= 80) {
      this.slowed = true;
      const t = crossing(q, s, 'cas_kn', 80);
      this.add(t, '80kt', `80 kt, ${past(between(q, s, 'thr_along_m', t))} m past the threshold`, s, '80 kt');
    }
    // stopped: under half a knot, or the judge's own word that it has, whichever comes first
    if (this.touched && !this.stopped && !airborne(s) && (s.gs_kn < 0.5 || finite(s.judge_stable))) {
      this.stopped = true;
      this.add(s.t_s, 'stop', `stopped, ${past(s.thr_along_m)} m past the threshold`, s, 'stop');
    }
    if (!this.judged && finite(s.judge_stable)) {
      this.judged = true;
      this.add(s.t_s, 'verdict', `the gate's judge: ${s.judge_stable > 0.5 ? 'STABLE' : 'NOT STABLE'}`, s);
    }
    if (q.crashed < 0.5 && s.crashed > 0.5) this.add(s.t_s, 'crash', 'crashed', s, 'crash');

    // the reversers (reverser_1, reverser_2: 0 stowed .. 1 deployed): deployed once every one that is out is fully
    // open, stowed once none is out, naming every one that was out since they last were all stowed; each with the
    // speed and how far past the threshold
    const out = (x) => [1, 2].filter((k) => x[`reverser_${k}`] > 0.001);
    const open = (x) => [1, 2].filter((k) => x[`reverser_${k}`] >= 0.999);
    const full = (x) => open(x).length > 0 && open(x).length === out(x).length;
    const which = (ks) => (ks.length === 2 ? 'reversers' : `reverser ${ks[0]}`);
    const at = () => `${finite(s.cas_kn) ? `, ${fmt(s.cas_kn)} kt` : ''}${finite(s.thr_along_m) ? `, ${past(s.thr_along_m)} m past the threshold` : ''}`;
    if (this.reverseEvents < MOST_REVERSE) {
      if (!full(q) && full(s)) {
        ++this.reverseEvents;
        this.add(s.t_s, 'reverse', `${which(open(s))} deployed${at()}`, s, 'REV');
      } else if (out(q).length && !out(s).length) {
        ++this.reverseEvents;
        this.add(s.t_s, 'reverse', `${which([...this.reversersOut].sort())} stowed${at()}`, s);
      }
    }
    if (!out(s).length) this.reversersOut.clear();
    for (const k of out(s)) this.reversersOut.add(k);
  }

  // The log as a panel prints it, a line a moment (eventLine).
  text() {
    return this.events.map(eventLine).join('\n');
  }
}
