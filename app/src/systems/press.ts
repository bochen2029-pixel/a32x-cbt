/**
 * Cabin pressurisation.
 *
 * The one system that needs state the aircraft does not yet produce: pressure altitude. B1 has no
 * aero, so altitude is a world input with a default of 0 (on the ground). When B2 arrives the
 * source changes and nothing else does.
 *
 * The A320 keeps the cabin on a schedule below 8,000 ft and holds a differential ceiling around
 * 8.6 psi. Two outflow valves do the work; the packs fill. This models the pair as one valve,
 * which is enough to teach the failure — lose the packs and the cabin climbs.
 */

import type { Dictionary } from '../dictionary.ts';

export interface PressInputs {
  /** the aircraft's pressure altitude */
  altFt: number;
  /** at least one pack is delivering air */
  packsOn: boolean;
}

const CABIN_TARGET_FT = 8000;
const CLIMB_FPM = 500;
const DESCENT_FPM = 300;
const MAX_DIFF_PSI = 8.6;
/** psi per foot of cabin-to-aircraft altitude difference, linearised over the normal band */
const PSI_PER_FT = 0.000277;

export function declarePress(d: Dictionary): void {
  const b = (name: string, note: string) => d.declare({ name, kind: 'bool', note });
  const r = (name: string, unit: string, note: string, min: number, max: number) =>
    d.declare({ name, kind: 'real', min, max, unit, note });

  d.declare({ name: 'sw.pressMode', kind: 'int', min: 0, max: 1, note: 'PRESS mode 0=auto 1=manual' });
  d.declare({ name: 'sw.pressValve', kind: 'int', min: 0, max: 100, note: 'manual outflow valve, % open' });

  b('sys.pressAuto', 'pressurisation in automatic');
  r('press.cabinAlt', 'ft', 'cabin altitude', 0, 45000);
  r('press.cabinVs', 'fpm', 'cabin rate of climb', -6000, 6000);
  r('press.diffPsi', 'psi', 'cabin differential pressure', 0, 10);
  r('press.outflow', '%', 'outflow valve open', 0, 100);
}

export function updatePress(d: Dictionary, i: PressInputs, dt: number): void {
  const manual = d.num('sw.pressMode') === 1;
  d.set('sys.pressAuto', !manual);

  const cabin = d.num('press.cabinAlt');
  const alt = Math.max(0, i.altFt);

  // target: the schedule floor, never below the aircraft itself
  const target = Math.min(CABIN_TARGET_FT, alt);

  let vs: number;
  if (manual) {
    // the trainee drives the valve directly: open bleeds the cabin toward the aircraft altitude
    const outlet = d.num('sw.pressValve') / 100;
    vs = Math.max(-6000, Math.min(6000, (alt - cabin) * outlet * 0.5));
  } else if (i.packsOn) {
    // packs on: drive toward the schedule, rate limited both ways
    const gap = target - cabin;
    vs = Math.max(-DESCENT_FPM, Math.min(CLIMB_FPM, gap * 0.5));
  } else {
    // no packs: the cabin climbs toward the aircraft altitude and nothing stops it
    const gap = alt - cabin;
    vs = Math.max(0, Math.min(CLIMB_FPM, gap * 0.5));
  }

  // snap inside a dead band: an exponential approach otherwise creeps toward the target forever.
  // Only an automatic pressurised aircraft may sit on the schedule — with no packs it must climb.
  const snapped = Math.abs(target - cabin) < 20 && !manual && i.packsOn;
  const next = snapped ? target : Math.max(0, Math.min(45000, cabin + (vs * dt) / 60));
  if (snapped) vs = 0;
  d.set('press.cabinAlt', next);
  d.set('press.cabinVs', vs);

  // differential, never negative, never past the relief valve
  const diff = Math.max(0, Math.min(MAX_DIFF_PSI, (alt - next) * PSI_PER_FT));
  d.set('press.diffPsi', diff);

  // outflow is what the valve is doing, which in auto is whatever it takes
  d.set('press.outflow', manual ? d.num('sw.pressValve') : Math.max(0, 100 - diff * 11));
}



