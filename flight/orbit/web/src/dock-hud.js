// dock-hud.js — what the docking says on the page, without a browser: the core's docking readouts by
// name, what DOCK does from where the craft is, the HUD's and the status line's words, and the docking
// reticle's layout. dock-view.js draws it; test/dock.test.mjs holds it to orbit_dock.h. GPLv3.

import { AUTO, SAS } from './core.js';
import { fmtDistance } from './hud.js';

const D2R = Math.PI / 180;

// orbit_dock.h's numbers, in a pilot's units (m, m/s, degrees), and its enums: a test holds them equal
// to the header's.
export const DOCK = {
  probe: 18, tolOffset: 0.3, vMin: 0.03, vMax: 0.3, tolSlide: 0.1, tolAngle: 3, tolRoll: 2, tolRollRate: 0.3,
  stroke: 0.4, drawS: 6, separation: 0.15, engageM: 50000, engageSpeed: 50,
};
export const DOCK_OUT = [
  'docked', 'phase', 'range', 'gap', 'closing', 'offY', 'offZ', 'rateY', 'rateZ', 'angle', 'pitch', 'yaw', 'roll', 'rollRate',
  'contact', 'verdict', 'cT', 'cSpeed', 'cOffset', 'cSlide', 'cAngle', 'cRoll', 'cRollRate', 'hit', 'hitPart', 'refused', 'axial', 'radial',
];
export const DPH = { none: 0, transfer: 1, align: 2, close: 3, captured: 4, docked: 5 };
export const VERDICT = { none: 0, captured: 1, fast: 2, offset: 3, sliding: 4, angle: 5, roll: 6, rollRate: 7, slow: 8 };
export const HIT = { none: 0, hull: 1, roof: 2, rim: 3, spoke: 4, hub: 5, port: 6, deck: 7, bulkhead: 8 };
export const PART = { none: 0, probe: 1, nose: 2, body: 3, leftWing: 4, rightWing: 5, tail: 6, gear: 7 };
export const REFUSED = { none: 0, docked: 1, crashed: 2, low: 3, far: 4, fast: 5 };

const PHASE_WORDS = ['', 'to the hold point', 'lining up', 'closing', 'captured', 'docked'];
const PHASE_LABELS = ['', 'TO HOLD POINT', 'LINING UP', 'CLOSING', 'CAPTURED', 'DOCKED'];
const HIT_WORDS = ['nothing', 'the hull', 'the roof', 'a rim wall', 'a spoke', 'the hub', 'the port', 'the deck', 'a bulkhead'];
const PART_WORDS = ['nothing', 'the probe', 'the nose', 'the body', 'the left wing', 'the right wing', 'the tail', 'the gear'];
const REFUSED_WORDS = ['', 'docked already', 'crashed', 'not in orbit', 'more than 50 km from the Ring', 'passing the Ring faster than 50 m/s'];

const round = (v) => Math.round(v);

// A number with its sign: fmtSigned(0.0213, 2) is '+0.02', and a nought is '+0.00', never '-0.00'.
export function fmtSigned(v, digits) {
  const r = Number(v.toFixed(digits));
  return `${r >= 0 ? '+' : '-'}${Math.abs(r).toFixed(digits)}`;
}

// A distance near the port: centimetres under 10 m, decimetres under 100 m, the HUD's units beyond.
export function fmtNear(m) {
  const a = Math.abs(m);
  if (a < 10) return `${m.toFixed(2)} m`;
  if (a < 100) return `${m.toFixed(1)} m`;
  return fmtDistance(m);
}

// An offset with its sign, to the centimetre near the axis and to the metre far from it.
export function fmtOff(m) { return fmtSigned(m, Math.abs(m) < 10 ? 2 : Math.abs(m) < 100 ? 1 : 0); }

// Closing on the port, or opening from it.
export function fmtWay(closing) { return `${closing >= 0 ? 'closing' : 'opening'} ${Math.abs(closing).toFixed(2)} m/s`; }

// What the last contact of the probe's head with the port came to, and the number that decided it
// against its limit.
export function verdictText(d) {
  switch (round(d.verdict)) {
    case VERDICT.captured: return `captured at ${d.cSpeed.toFixed(2)} m/s`;
    case VERDICT.fast: return `too fast: ${d.cSpeed.toFixed(2)} m/s, the latches take ${DOCK.vMax.toFixed(2)} at most`;
    case VERDICT.slow: return `too slow: ${d.cSpeed.toFixed(3)} m/s, the latches need ${DOCK.vMin.toFixed(2)}`;
    case VERDICT.offset: return `off the centre: ${d.cOffset.toFixed(2)} m, the drogue takes ${DOCK.tolOffset.toFixed(2)}`;
    case VERDICT.sliding: return `sliding: ${d.cSlide.toFixed(2)} m/s across the face, ${DOCK.tolSlide.toFixed(2)} at most`;
    case VERDICT.angle: return `the nose ${d.cAngle.toFixed(1)}° off the axis, ${DOCK.tolAngle}° at most`;
    case VERDICT.roll: return `the key ${Math.abs(d.cRoll).toFixed(1)}° out of phase, ${DOCK.tolRoll}° at most`;
    case VERDICT.rollRate: return `the spin ${Math.abs(d.cRollRate).toFixed(2)}°/s off the port's, ${DOCK.tolRollRate}°/s at most`;
    default: return '';
  }
}

// What a crash on the Ring hit, and with what.
export function hitText(d) {
  if (round(d.hit) === HIT.port) return `the probe struck the port at ${d.cSpeed.toFixed(1)} m/s, past its stroke`;
  return `${PART_WORDS[round(d.hitPart)] || 'the craft'} hit ${HIT_WORDS[round(d.hit)] || 'the Ring'}`;
}

// What the page says when the probe's head first meets the port.
export function contactText(d) {
  return round(d.verdict) === VERDICT.captured ? `Captured at ${d.cSpeed.toFixed(2)} m/s: the latches draw the craft in` : `No capture: ${verdictText(d)}`;
}

// What DOCK does from here, and what the page says: let go of the port, start the crew's docking, or
// nothing, saying why. The core judges the same things (dockEngage) and refuses on its own as well.
export function dockCommand(s, d) {
  const phase = round(d.phase);
  if (d.docked > 0.5) {
    return phase === DPH.docked
      ? { action: 'undock', say: `Undocked: backing away at ${DOCK.separation} m/s, still turning with the port` }
      : { action: 'none', say: 'Captured: the latches are drawing the craft in' };
  }
  if (s.crashed > 0) return { action: 'none', say: 'Crashed: start again' };
  if (round(s.auto) === AUTO.dock) return { action: 'none', say: `The crew is docking: ${PHASE_WORDS[phase] || 'on its way'}` };
  if (s.peri < 150000) return { action: 'none', say: 'Docking starts in orbit, near the Ring' };
  if (s.ringRange > DOCK.engageM) return { action: 'none', say: `The Ring is ${fmtDistance(s.ringRange)} away: the crew docks from within 50 km; its approach comes nearer` };
  const passing = Math.hypot(s.vrelE, s.vrelN, s.vrelU);
  if (passing > DOCK.engageSpeed) return { action: 'none', say: `Passing the Ring at ${passing.toFixed(0)} m/s: the crew docks from under 50 m/s` };
  return { action: 'engage', say: '' };
}

// What the page says once the crew's docking has been asked for: what the crew does first, or why the
// core refused it.
export function engagedText(s, d) {
  if (round(s.auto) !== AUTO.dock) return `Docking refused: ${REFUSED_WORDS[round(d.refused)] || 'the core gave no reason'}`;
  return round(d.phase) === DPH.transfer ? `The crew docks at the hub: first to the hold point, ${fmtDistance(s.portRange)} away` : 'The crew docks at the hub: lining up on the port';
}

// The hold on the port (OC_SAS_PORT) is for docking: in orbit, within 50 km of the Ring.
export function portHoldMakesSense(s) { return s.crashed === 0 && s.peri > 150000 && s.ringRange < DOCK.engageM; }

// The status line while the crew docks, while docked or captured, while a pilot flies the port hold near
// it, and after a crash on the Ring; null leaves the flight's own line.
export function dockStatus(s, d, touch = false) {
  const k = touch ? { take: 'CREW: take the controls', undock: 'DOCK: let go', reset: 'RESTART' } : { take: 'Space: take the controls', undock: 'P: let go', reset: 'Backspace' };
  const phase = round(d.phase), auto = round(s.auto);
  if (s.crashed > 0) return d.hit > 0 ? { line: `CRASHED · ${hitText(d)}`, hint: `${k.reset} to start again` } : null;
  if (phase === DPH.docked) return { line: 'DOCKED AT THE HUB · turning with the Ring', hint: k.undock };
  if (phase === DPH.captured) return { line: 'CAPTURED · the latches draw the craft in', hint: '' };
  if (auto === AUTO.dock) {
    if (phase === DPH.transfer) return { line: `DOCKING · ${fmtDistance(s.portRange)} to the hold point`, hint: k.take };
    if (phase === DPH.align) return { line: `DOCKING · LINING UP · key ${fmtSigned(d.roll, 1)}°, spin ${fmtSigned(d.rollRate, 2)}°/s`, hint: k.take };
    return { line: `DOCKING · CLOSING · ${fmtNear(d.gap)}, ${fmtWay(d.closing)}`, hint: k.take };
  }
  if (auto === AUTO.off && round(s.sas) === SAS.port && d.range < 5000) {
    return { line: `HAND · ON THE PORT · ${fmtNear(d.gap)}, ${fmtWay(d.closing)}`, hint: touch ? '' : 'I K in, out · J L left, right · U M up, down' };
  }
  return null;
}

// The HUD's docking lines, near the port or while docking: where the probe's head is against the port
// and how it moves, in the port's turning frame (right and down are a lined-up craft's), how the craft is
// lined up, and what the last contact came to. Far out on the way to the hold point, the first line only.
// narrow: a phone's shorter lines.
export function dockLines(s, d, narrow = false) {
  const phase = round(d.phase);
  if (s.crashed > 0 || !(d.range < 3000 || phase !== DPH.none || d.docked > 0.5)) return [];
  const last = d.cT > 0 ? verdictText(d) : '';
  if (phase === DPH.docked) return [narrow ? 'DOCKED' : `DOCK DOCKED at the hub${last ? `, ${last}` : ''}`];
  const far = phase === DPH.transfer && d.range >= 3000;
  if (narrow) {
    const lines = [`PORT ${fmtNear(d.range)}  ${fmtWay(d.closing)}`];
    if (!far) lines.push(`OFF ${fmtOff(d.offY)} ${fmtOff(d.offZ)} m  AXIS ${d.angle.toFixed(1)}°`, `KEY ${fmtSigned(d.roll, 1)}°  SPIN ${fmtSigned(d.rollRate, 2)}°/s`);
    return lines;
  }
  const lines = [`DOCK ${PHASE_LABELS[phase].padEnd(15)}port ${fmtNear(d.range)}   ${fmtWay(d.closing)}`];
  if (far) return lines;
  lines.push(
    `     off right ${fmtOff(d.offY)}  down ${fmtOff(d.offZ)} m   moving ${fmtSigned(d.rateY, 2)} ${fmtSigned(d.rateZ, 2)} m/s`,
    `     nose ${d.angle.toFixed(1)}° off the axis   key ${fmtSigned(d.roll, 1)}°   spin ${fmtSigned(d.rollRate, 2)}°/s`,
  );
  if (last) lines.push(`     last contact: ${last}`);
  return lines;
}

// The docking reticle, as the craft sees ahead along its docking axis: pixels from the reticle's centre,
// x right, y down. The crosshair at the centre is the craft's docking axis; the port's alignment cross
// stands where the port's centre is from the probe's head (both in the craft's axes, so the key's error
// turns the offsets too), its key arm up when in phase; a ring marks where the port's axis points, on the
// crosshair when the nose is along it. Offsets and angles go on a soft scale that fits a centimetre and a
// hundred metres: x sits at R x / (|x| + k), k 1 m or 5°. spin: the port's turn against the craft as an
// arc, radians, clockwise positive, as it is seen to turn.
export function reticle(d, R) {
  const soft = (x, k) => (R * x) / (Math.abs(x) + k);
  const ph = d.roll * D2R, c = Math.cos(ph), sn = Math.sin(ph);
  const right = c * d.offY + sn * d.offZ, down = -sn * d.offY + c * d.offZ;
  const off = Math.hypot(right, down), f = off > 1e-9 ? soft(off, 1) / off : R;
  return {
    port: [-right * f, -down * f],
    key: [-Math.sin(ph), -Math.cos(ph)],
    axis: [soft(d.yaw, 5), -soft(d.pitch, 5)],
    capture: soft(DOCK.tolOffset, 1),
    spin: (-Math.PI / 2) * d.rollRate / (Math.abs(d.rollRate) + 0.5),
    offset: off,
    ok: {
      offset: off <= DOCK.tolOffset,
      angle: d.angle <= DOCK.tolAngle,
      roll: Math.abs(d.roll) <= DOCK.tolRoll,
      rollRate: Math.abs(d.rollRate) <= DOCK.tolRollRate,
      closing: d.gap > 5 || (d.closing >= DOCK.vMin && d.closing <= DOCK.vMax),
    },
  };
}
