// fd-hud.js — the flight director on the page, without a browser (orbit_fd.h): what its readouts mean, how
// far each cue stands from where the craft is, the HUD's words, and the ILS to KDFW 17C from the runway's
// own geometry (flight/web's drawing of the field, unchanged). fd-view.js draws it; test/fd.test.mjs holds
// it to the header and to the runway. GPLv3.

import { GLIDE } from '../../../web/src/airport-layout.js';
import { localMetres, origin } from '../../../web/src/scene-math.js';
import { AUTO } from './core.js';
import { fmtDistance } from './hud.js';

const D2R = Math.PI / 180, R2D = 180 / Math.PI, FT = 0.3048, NM = 1852;

// orbit_fd.h's OC_FD_PH_*, in its order: the crew to orbit's phases, then the flight home's (a test reads the
// header to hold them equal).
export const FD_PH = {
  none: 0, hold: 1, roll: 2, rotate: 3, climb: 4, ascent: 5, insert: 6, orbit: 7,
  depart: 8, wait: 9, burn: 10, coast: 11, entry: 12, terminal: 13, approach: 14, flare: 15, rollout: 16, stopped: 17,
};
const LABELS = ['', 'HOLD', 'TAKE-OFF ROLL', 'ROTATE', 'CLIMB', 'ASCENT', 'INSERTION', 'ORBIT', 'LEAVING THE RING', 'WAITING FOR THE PASS',
  'DE-ORBIT BURN', 'FALLING TO THE AIR', 'ENTRY', 'TERMINAL AREA', 'APPROACH', 'FLARE', 'ROLLOUT', 'STOPPED'];
export const fdLabel = (phase) => LABELS[Math.round(phase)] || '';

export const wrap180 = (a) => { const r = ((a + 540) % 360 + 360) % 360; return r - 180; };

// What the 8 key cycles through: the director shown while you fly (the default), shown while the crew flies
// too (its bars then sit on the craft, as an autopilot's do), or off (and not computed: oc_fd(0)).
export const FD_MODES = ['hand', 'always', 'off'];
export const FD_MODE_WORDS = {
  hand: 'Flight director: shown while you fly',
  always: 'Flight director: shown while the crew flies too',
  off: 'Flight director: off',
};

// Whether the director's cues are drawn: its readouts valid, and by the mode, who flies.
export function fdShown(s, mode) {
  if (!(s.fdValid > 0.5) || mode === 'off') return false;
  return mode === 'always' || Math.round(s.auto) === AUTO.off;
}

// The cues, in pixels from the aircraft symbol at the middle of a display R pixels to its edge (x right, y
// down), each on a soft scale, R e / (|e| + k), so a small error reads finely and a large one still shows
// its side:
//   pitch:   the pitch bar; above the symbol when the director asks for more nose up (k 10 degrees).
//   lateral: the bank bar; right of the symbol when it asks for more bank right. In the air the stick banks
//            (k 30 degrees); above the air (OC_AIR_LAW 0) the stick turns the craft, and the bar is the
//            heading's error instead, right for a turn right (k 10), the bank its own index on the scale.
//   bank, cmdBank: the craft's bank and the director's, radians, for the bank scale's pointer and index.
//   throttle: the director's throttle, 0..1.
export const SOFT = { pitch: 10, bank: 30, heading: 10 };
export function fdCues(s, R) {
  const soft = (e, k) => (R * e) / (Math.abs(e) + k);
  const ePitch = s.fdPitch - s.pitch, eBank = wrap180(s.fdBank - s.roll), eHdg = wrap180(s.fdHdg - s.hdg);
  const air = s.airLaw > 0.5 || s.onGround > 0.5;
  return {
    pitch: -soft(ePitch, SOFT.pitch),
    lateral: air ? soft(eBank, SOFT.bank) : soft(eHdg, SOFT.heading),
    lateralIs: air ? 'bank' : 'heading',
    bank: s.roll * D2R,
    cmdBank: s.fdBank * D2R,
    throttle: Math.min(1, Math.max(0, s.fdThrottle)),
    errors: { pitch: ePitch, bank: eBank, heading: eHdg },
  };
}

// A direction in the site frame (east, north, up at the start point) from a pitch and a heading at the craft's
// place P (site frame, m): the heading against the true north there, as the core reckons it. The Earth's
// pole is fixed in the site frame, at [0, cos lat0, sin lat0].
export function directionAt(P, pitchDeg, hdgDeg, lat0, RE = 6371000) {
  const up = norm([P[0], P[1], P[2] + RE]);
  const la = lat0 * D2R, pole = [0, Math.cos(la), Math.sin(la)];
  const east = norm(cross(pole, up)), north = cross(up, east);
  const p = pitchDeg * D2R, h = hdgDeg * D2R;
  return [0, 1, 2].map((i) => Math.cos(p) * (Math.sin(h) * east[i] + Math.cos(h) * north[i]) + Math.sin(p) * up[i]);
}
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const n = Math.hypot(a[0], a[1], a[2]); return [a[0] / n, a[1] / n, a[2] / n]; };

// ---- the ILS -------------------------------------------------------------------------------------------
// From the runway's geometry in flight/web's data: the landing threshold, the true heading, the pavement's
// length beyond the threshold. The localizer's course is the centreline; its antenna 1,000 ft past the far
// end (this sketch's choice: 1,000 to 2,000 ft is usual), and it reads full scale, 2 dots, 350 ft either side
// of the centreline at the threshold (the course 700 ft wide there, as the FAA tailors it), in angle from the
// antenna. The glide slope is GLIDE's, the PAPI's: 3 degrees, crossing the threshold at 50 ft, so from the
// point on the centreline where that path meets the runway, 291 m past the threshold; a dot is 0.12 of the
// path's angle, full scale 2 dots, 0.72 degrees. It is judged at the wheels, the centre of mass's height less
// 3 m (the gear's reach standing): the crew's own approach (return.cpp) puts them 15 m over the threshold on
// a 3 degree path. Coverage: the localizer within 18 NM of its antenna and 35 degrees of its course, the glide
// slope within 10 NM of its origin and 8 degrees of the course, short of that origin.
export const ILS = { locBeyondM: 1000 * FT, locHalfM: 350 * FT, locRangeM: 18 * NM, locSectorDeg: 35, gsRangeM: 10 * NM, gsSectorDeg: 8, dotOfGlide: 0.12, wheelsM: 3 };

export function ilsGeometry(airport, endId, start) {
  const rw = airport.runways.find((r) => r.ends.some((e) => e.id === endId));
  if (!rw) throw new Error(`no runway end ${endId} at ${airport.icao}`);
  const end = rw.ends.find((e) => e.id === endId);
  const o = origin(start.lat, start.lon);
  const p = localMetres(o, end.lat, end.lon);   // the pavement's end this landing starts over
  const h = end.headingDeg * D2R, course = [Math.sin(h), Math.cos(h)], right = [Math.cos(h), -Math.sin(h)];
  const threshold = [p.east + course[0] * end.displacedM, p.north + course[1] * end.displacedM];
  const toFar = rw.lengthM - end.displacedM;
  return {
    id: endId, headingDeg: end.headingDeg, threshold, course, right, lengthM: toFar, widthM: rw.widthM,
    loc: toFar + ILS.locBeyondM, gpip: (GLIDE.tchFt * FT) / Math.tan(GLIDE.deg * D2R), glideDeg: GLIDE.deg, tchM: GLIDE.tchFt * FT,
  };
}

// Where the craft is against the ILS: P its centre of mass in the site frame (m), alt its height above the
// sphere (m; the Earth curves away from the site frame's plane, 8 m in 10 km). Angles in degrees, + the craft
// right of the course and above the path; dots as an instrument shows them, the course or the path that
// much to the other side of the craft.
export function ilsDeviation(g, P, alt) {
  const d = [P[0] - g.threshold[0], P[1] - g.threshold[1]];
  const along = d[0] * g.course[0] + d[1] * g.course[1];      // m past the threshold
  const right = d[0] * g.right[0] + d[1] * g.right[1];        // m right of the centreline
  const fromLoc = g.loc - along;
  const locDeg = Math.atan2(right, fromLoc) * R2D;
  const locFullDeg = Math.atan2(ILS.locHalfM, g.loc) * R2D;
  const toGpip = g.gpip - along, wheels = alt - ILS.wheelsM;
  const gsAngle = Math.atan2(wheels, toGpip) * R2D;
  const gsDeg = gsAngle - g.glideDeg;
  const locValid = fromLoc > 0 && Math.hypot(fromLoc, right) < ILS.locRangeM && Math.abs(locDeg) < ILS.locSectorDeg;
  const gsValid = locValid && toGpip > 0 && Math.hypot(toGpip, right) < ILS.gsRangeM && Math.abs(Math.atan2(right, toGpip) * R2D) < ILS.gsSectorDeg;
  return {
    along, right, distance: Math.hypot(along, right),
    loc: { deg: locDeg, dots: (2 * locDeg) / locFullDeg, valid: locValid },
    gs: { deg: gsDeg, dots: gsDeg / (ILS.dotOfGlide * g.glideDeg), valid: gsValid, height: wheels, onPath: Math.max(0, toGpip) * Math.tan(g.glideDeg * D2R) },
  };
}

// The path to follow, drawn in the world: square gates down the glide slope and the localizer's course, every
// km from 1 km to 18 km short of the threshold, w wide and h tall, centred where the craft's centre of mass
// is on the path (its wheels on it, ILS.wheelsM under). In the site frame, which is the start point's plane:
// the Earth falls away under it by d squared over 2R, and the gate with it. Each gate its four corners, in
// order round, and its distance.
export function glidePathGates(g, { from = 1000, to = 18000, every = 1000, w = 120, h = 60, RE = 6371000 } = {}) {
  const gates = [];
  for (let d = from; d <= to + 1e-6; d += every) {
    const e = g.threshold[0] - g.course[0] * d, n = g.threshold[1] - g.course[1] * d;
    const r = Math.hypot(e, n);
    const up = (d + g.gpip) * Math.tan(g.glideDeg * D2R) + ILS.wheelsM - (r * r) / (2 * RE);
    const corner = (sr, su) => [e + g.right[0] * sr * w / 2, n + g.right[1] * sr * w / 2, up + su * h / 2];
    gates.push({ d, centre: [e, n, up], corners: [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)] });
  }
  return gates;
}

// Whether the ILS is worth showing: on an approach, which is to say off the ground, short of the threshold,
// within 90 degrees of the course and below 8 km, with the localizer received (not taking off over it).
export function ilsShown(s, dev, g) {
  return dev.loc.valid && dev.along < 0 && !(s.onGround > 0.5) && Math.abs(wrap180(s.hdg - g.headingDeg)) < 90 && s.alt < 8000 && s.crashed === 0;
}

// ---- words ----------------------------------------------------------------------------------------------

// A bank as a pilot says it, left or right, and level as level; a heading in three figures.
export const fmtBank = (deg) => (Math.abs(deg) < 0.5 ? '0°' : `${deg < 0 ? 'L' : 'R'} ${Math.abs(deg).toFixed(0)}°`);
export const fmtHdg = (deg) => String(Math.round(((deg % 360) + 360) % 360) % 360).padStart(3, '0');

// The HUD's lines: the director's command in a pilot's terms, and the ILS (to runway id) when it is received.
// On the way home, in the air, the bank first as the guidance flies it, about the air's velocity, with its
// angle of attack; then the attitude that gives them, which the bars show.
export function fdLines(s, shown, ils, id = '17C', narrow = false) {
  const lines = [];
  if (shown) {
    const phase = Math.round(s.fdPhase);
    const air = phase >= FD_PH.coast && phase <= FD_PH.flare;
    const gear = s.fdGear > 0.5 ? 'down' : 'up';
    if (narrow) lines.push(`FD ${fdLabel(phase)}  P ${s.fdPitch.toFixed(0)}° B ${fmtBank(s.fdBank)}  THR ${(s.fdThrottle * 100).toFixed(0)}%`);
    else if (air) {
      lines.push(`FD   ${fdLabel(phase).padEnd(14)} bank ${fmtBank(s.fdLiftBank)} about the air, α ${s.fdAlpha.toFixed(1)}°   so pitch ${s.fdPitch.toFixed(1)}°, bank ${fmtBank(s.fdBank)}   thrust ${(s.fdThrottle * 100).toFixed(0)}%   gear ${gear}`);
    } else {
      lines.push(`FD   ${fdLabel(phase).padEnd(14)} pitch ${s.fdPitch.toFixed(1)}°   bank ${fmtBank(s.fdBank)}   hdg ${fmtHdg(s.fdHdg)}°   thrust ${(s.fdThrottle * 100).toFixed(0)}%   gear ${gear}`);
    }
  }
  if (ils) {   // where the craft is: right of the course or left, above the path or below
    const off = (dots, a, b, on) => (Math.abs(dots) < 0.05 ? on : `${Math.abs(dots).toFixed(1)} dot ${dots >= 0 ? a : b}`);
    const loc = ils.loc.valid ? `LOC ${off(ils.loc.dots, 'right', 'left', 'on the course')}` : 'LOC —';
    const gs = ils.gs.valid ? `GS ${off(ils.gs.dots, 'high', 'low', 'on the path')}` : 'GS —';
    lines.push(narrow ? `ILS ${loc} ${gs}` : `ILS  ${id}  ${loc}   ${gs}   ${fmtDistance(ils.distance)} to the threshold`);
  }
  return lines;
}
