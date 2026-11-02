// The nose camera: a camera in the aircraft's nose, boresighted along the fuselage, looking ahead as an
// enhanced-vision camera would, with no overlay (view.js, 'nose'); the frames a tool takes from it (flightDebug.frame),
// at the size and the field of view it asks, within what the Jev experiment's model takes (agreed with the jev-park
// session); and the landing runway's PAPI as seen from it, for grading what a camera sees, never for flying. Plain
// numbers: node tests them. GPLv3.

import { papiShowsWhite } from './airport-layout.js';

export const NOSE_HFOV_DEG = 60;            // the nose camera's horizontal field of view
export const NOSE_AHEAD_M = 0.3;            // how far ahead of the fuselage's nose it sits, clear of the radome
export const FRAME_SIDE_PX = [280, 1568];   // a frame's sides, as Jev takes them
export const FRAME_MIN_PX = 78400;          // and its pixels in all
export const FRAME_TYPES = ['image/jpeg', 'image/png'];

// The vertical field of view, degrees, that gives hfovDeg across an image aspect wide (width / height).
export function vfov(hfovDeg, aspect) {
  return (2 * Math.atan(Math.tan((hfovDeg * Math.PI) / 360) / aspect) * 180) / Math.PI;
}

// The nose camera's place in the structure's metres (x aft, y right, z up, as the airframe's points are):
// NOSE_AHEAD_M ahead of the fuselage's first station, on its centreline, at that station's waist.
export function nosePoint(fuselage) {
  const [x, crown, keel] = fuselage[0];
  return [x - NOSE_AHEAD_M, 0, (crown + keel) / 2];
}

// Why a frame cannot be taken as asked, or '' when it can: whole pixels within Jev's sides and total, a type the
// page encodes, a quality above 0 and at most 1, a field of view of 1 to 120 degrees.
export function frameRefusal({ width, height, type, quality, hfovDeg }) {
  const [lo, hi] = FRAME_SIDE_PX;
  if (![width, height].every((v) => Number.isInteger(v) && v >= lo && v <= hi)) return `width and height: whole pixels, ${lo} to ${hi}`;
  if (width * height < FRAME_MIN_PX) return `width × height: at least ${FRAME_MIN_PX.toLocaleString('en-US')} pixels`;
  if (!FRAME_TYPES.includes(type)) return `type: ${FRAME_TYPES.join(' or ')}`;
  if (!(quality > 0 && quality <= 1)) return 'quality: above 0, at most 1';
  if (!(hfovDeg >= 1 && hfovDeg <= 120)) return 'hfovDeg: 1 to 120';
  return '';
}

// The landing runway's PAPI as seen from p (the world's metres, y up): each of its units, inboard first, white or red
// by the rule that colours the lights drawn (airport-layout.js, papiShowsWhite) at the unit's centre, with its
// setting and the angle p is seen above it; and how many show white. lamps: the airport's (airport.js, papiLamps),
// two to a unit sharing its setting; end: the id of the runway end flown to.
export function papiSeen(lamps, end, p) {
  const units = new Map();
  for (const l of lamps) {
    if (l.end !== end) continue;
    const u = units.get(l.unit) ?? { n: 0, x: 0, y: 0, z: 0, angle: l.angle };
    u.n += 1;
    u.x += l.x;
    u.y += l.y;
    u.z += l.z;
    units.set(l.unit, u);
  }
  const seen = [...units.keys()].sort((a, b) => a - b).map((k) => {
    const u = units.get(k), c = { x: u.x / u.n, y: u.y / u.n, z: u.z / u.n, angle: u.angle };
    const elevationDeg = (Math.atan2(p.y - c.y, Math.hypot(p.x - c.x, p.z - c.z)) * 180) / Math.PI;
    return { angleDeg: c.angle, elevationDeg, white: papiShowsWhite(p, c) };
  });
  return { white: seen.filter((u) => u.white).length, lamps: seen };
}
