/**
 * Engine start, as the A320 sequences it.
 *
 * N2 comes up on bleed air with the start valve open. The master lever introduces fuel; a good
 * start introduces it after the engine is turning fast enough to swallow it, and a hot start is
 * what happens when it is introduced too early — the fuel puddles and burns in the wrong place, so
 * EGT climbs and the acceleration does not follow. Both are modelled as consequences, not as
 * refusals: the trainee can do it wrong and see why.
 */

import type { Dictionary } from '../dictionary.ts';

export interface EngineInputs {
  /** bleed pressure present on this engine's side */
  bleedAvailable: boolean;
  /** LP fuel valve open and fuel reaching the engine */
  fuelAvailable: boolean;
}

const LIGHT_UP_N2 = 16;
const SELF_SUSTAINING_N2 = 58;
const STARTER_RATE = 1.2; // %/s on air alone
const ACCEL_RATE = 3.5; // %/s once burning cleanly
const HOT_START_RATE = 1.8; // %/s — fuel burning early is a poor accelerant
const SHUTDOWN_RATE = 4.0; // %/s with fuel off
const IDLE_N2 = 58;

export function declareEngine(d: Dictionary, n: 1 | 2): void {
  const p = `eng${n}`;
  const b = (name: string, note: string) => d.declare({ name, kind: 'bool', note });
  const r = (name: string, unit: string, note: string, max = 110) =>
    d.declare({ name, kind: 'real', min: 0, max, unit, note });

  b(`sw.${p}Master`, `ENG ${n} MASTER LEVER`);
  d.declare({ name: `sw.${p}Start`, kind: 'int', min: 0, max: 1, note: `ENG ${n} MODE selector` });
  b(`sys.${p}StartValve`, `ENG ${n} start valve open`);
  b(`sys.${p}Burning`, `ENG ${n} fuel is burning`);
  b(`sys.${p}Running`, `ENG ${n} self-sustaining`);
  b(`sys.${p}HotStart`, `ENG ${n} hot start — fuel introduced before the engine was turning`);
  b(`sys.${p}HotStartLatched`, `ENG ${n} hot start latched until the engine is stopped`);

  r(`${p}.n2`, '%', `ENG ${n} N2`);
  r(`${p}.n1`, '%', `ENG ${n} N1`);
  r(`${p}.egt`, 'degC', `ENG ${n} EGT`, 900);
}

export function updateEngine(d: Dictionary, n: 1 | 2, i: EngineInputs, dt: number): void {
  const p = `eng${n}`;
  const master = d.bool(`sw.${p}Master`);
  const startSel = d.num(`sw.${p}Start`) !== 0;
  const n2 = d.num(`${p}.n2`);

  const startValve = startSel && i.bleedAvailable && n2 < SELF_SUSTAINING_N2;
  const fuelOn = startValve && master && i.fuelAvailable;
  const hot = fuelOn && n2 < LIGHT_UP_N2;

  d.set(`sys.${p}StartValve`, startValve);
  d.set(`sys.${p}Burning`, fuelOn);
  d.set(`sys.${p}HotStart`, hot);
  if (hot) d.set(`sys.${p}HotStartLatched`, true);

  let next = n2;
  if (startValve) {
    next += (fuelOn ? (hot ? HOT_START_RATE : ACCEL_RATE) : STARTER_RATE) * dt;
  } else if (master && i.fuelAvailable && n2 >= SELF_SUSTAINING_N2) {
    // running on its own; idle is the floor
    if (next < IDLE_N2) next += ACCEL_RATE * dt;
    d.set(`sys.${p}Burning`, true);
  } else if (next > 0) {
    next = Math.max(0, next - SHUTDOWN_RATE * dt);
  }

  next = Math.min(105, next);
  d.set(`${p}.n2`, next);
  d.set(`sys.${p}Running`, next >= SELF_SUSTAINING_N2);
  // the fault latches until the engine is shut down, as an ECAM message would
  if (next === 0 && !startValve) d.set(`sys.${p}HotStartLatched`, false);

  // a completed start releases the selector, as the real START position does
  if (next >= SELF_SUSTAINING_N2 && startSel) d.set(`sw.${p}Start`, 0);

  // N1 follows N2 with lag; idle N1 is roughly a quarter of N2
  const n1 = d.num(`${p}.n1`);
  d.set(`${p}.n1`, n1 + (next * 0.25 - n1) * Math.min(1, dt * 1.5));

  // EGT: hot starts run hotter than a clean start; with fuel off it settles back to ambient.
  // Snap inside a dead band, the PSX getSmoothExpo rule — otherwise it approaches 15 forever and
  // a settled aircraft never stops moving.
  const target = d.bool(`sys.${p}Burning`) ? (hot ? 800 : 300 + next * 3) : 15;
  const egt = d.num(`${p}.egt`);
  const moved = egt + (target - egt) * Math.min(1, dt * 0.8);
  d.set(`${p}.egt`, Math.min(900, Math.abs(target - moved) < 0.5 ? target : moved));
}



