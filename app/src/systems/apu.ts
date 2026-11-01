/**
 * APU as a state machine.
 *
 * Until now `apuRunning` was an input handed to the world. It is now produced by the model, so a
 * trainee starts it and waits, the bleed and the generator appear on their own schedule, and the
 * procedure can require the start instead of assuming it.
 *
 * States: off → starting → running → shutting down → off. Time-driven, deterministic, and driven
 * only by the dictionary and dt (no wall clock, no timers).
 */

import type { Dictionary } from '../dictionary.ts';

export interface ApuInputs {
  /** DC power available to the ECB; without it the APU cannot be controlled */
  dcPowered: boolean;
  /** bleed duct available for the APU's own start (ground air or the other side) */
  groundAirAvailable: boolean;
}

const START_SECONDS = 20;
const SHUTDOWN_SECONDS = 8;
const AVAILABLE_AT = 95;

export function declareApu(d: Dictionary): void {
  const b = (name: string, note: string) => d.declare({ name, kind: 'bool', note });
  const r = (name: string, unit: string, note: string, max = 110) =>
    d.declare({ name, kind: 'real', min: 0, max, unit, note });

  b('sw.apuMaster', 'APU MASTER SW');
  b('sw.apuStart', 'APU START pushbutton (momentary)');

  b('sys.apuStarting', 'APU start sequence in progress');
  b('sys.apuRunning', 'APU running and available');
  b('sys.apuShuttingDown', 'APU shut down sequence running');
  b('sys.apuGenAvail', 'APU generator available');
  b('sys.apuBleedAvail', 'APU bleed available');

  r('apu.n1', '%', 'APU speed');
  r('apu.egt', 'degC', 'APU exhaust gas temperature', 900);
}

export function updateApu(d: Dictionary, i: ApuInputs, dt: number): void {
  const master = d.bool('sw.apuMaster');
  const startPressed = d.bool('sw.apuStart');
  const n1 = d.num('apu.n1');

  // commanded state: master on and start latched, or master dropped
  if (master && (startPressed || d.bool('sys.apuStarting') || d.bool('sys.apuRunning')) && i.dcPowered) {
    // spool toward 100 %
    const target = AVAILABLE_AT + 5;
    const next = Math.min(target, n1 + (target / START_SECONDS) * dt);
    d.set('apu.n1', next);
    d.set('sys.apuStarting', next < AVAILABLE_AT);
    d.set('sys.apuRunning', next >= AVAILABLE_AT);
    d.set('sys.apuShuttingDown', false);
    // EGT rises through the start and settles
    d.set('apu.egt', next < AVAILABLE_AT ? 400 + next * 2 : 520);
    // the start pushbutton is momentary
    d.set('sw.apuStart', false);
  } else if (n1 > 0) {
    // shutdown or unpowered: decay to zero
    const next = Math.max(0, n1 - (AVAILABLE_AT / SHUTDOWN_SECONDS) * dt);
    d.set('apu.n1', next);
    d.set('sys.apuStarting', false);
    d.set('sys.apuRunning', false);
    d.set('sys.apuShuttingDown', next > 0);
    d.set('apu.egt', Math.max(0, d.num('apu.egt') - 40 * dt));
  } else {
    d.set('sys.apuStarting', false);
    d.set('sys.apuRunning', false);
    d.set('sys.apuShuttingDown', false);
    d.set('apu.egt', 0);
  }

  const running = d.bool('sys.apuRunning');
  d.set('sys.apuGenAvail', running);
  d.set('sys.apuBleedAvail', running);
}
