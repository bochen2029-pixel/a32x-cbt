/**
 * Faults.
 *
 * PSX note 06: a fault is not code, it is a registry entry plus a trigger. Here a fault is a
 * declared boolean that a system consults, and a trigger decides when it becomes true.
 *
 * Triggers are deliberately the boring three — manual, at a simulated time, at a pressure
 * altitude — because those are the ones a scripted scenario needs. A trainee-driven trigger
 * ("when the pilot forgets X") belongs to the scoring layer, not here.
 */

import type { Dictionary } from '../dictionary.ts';

export interface Fault {
  readonly id: string;
  /** the boolean a system reads */
  readonly flag: string;
  readonly note: string;
}

const FAULTS: readonly Fault[] = [
  { id: 'hyd-green-pump', flag: 'fault.hydGreenPump', note: 'GREEN engine pump fails' },
  { id: 'hyd-blue-pump', flag: 'fault.hydBluePump', note: 'BLUE electric pump fails' },
  { id: 'hyd-yellow-pump', flag: 'fault.hydYellowPump', note: 'YELLOW pump fails' },
  { id: 'pack-1', flag: 'fault.pack1', note: 'PACK 1 fails' },
  { id: 'pack-2', flag: 'fault.pack2', note: 'PACK 2 fails' },
  { id: 'bleed-1', flag: 'fault.bleed1', note: 'engine 1 bleed duct burst' },
];

export function declareFaults(d: Dictionary): void {
  for (const f of FAULTS) d.declare({ name: f.flag, kind: 'bool', note: f.note });
}

export function fault(id: string): Fault {
  const f = FAULTS.find((x) => x.id === id);
  if (!f) throw new Error(`unknown fault ${id}`);
  return f;
}

export function faultIds(): string[] {
  return FAULTS.map((f) => f.id);
}

export type Trigger = { kind: 'manual' } | { kind: 'atTime'; sec: number } | { kind: 'atAltitude'; ft: number };

export interface Armed {
  readonly id: string;
  readonly trigger: Trigger;
  fired: boolean;
}

export interface FaultSet {
  readonly armed: Armed[];
}

/** Arms faults. Nothing happens until `step`. */
export function arm(faults: readonly { id: string; trigger?: Trigger }[]): FaultSet {
  return {
    armed: faults.map((f) => ({ id: f.id, trigger: f.trigger ?? { kind: 'manual' }, fired: false })),
  };
}

export interface Clock {
  readonly sec: number;
  readonly altitudeFt: number;
}

/**
 * Fire whatever is due. A fault fires once and stays true — clearing it is a repair, and a repair
 * is a different verb, not the absence of a fault.
 */
export function step(d: Dictionary, set: FaultSet, c: Clock): string[] {
  const fired: string[] = [];
  for (const a of set.armed) {
    if (a.fired) continue;
    if (due(a.trigger, c)) {
      d.set(fault(a.id).flag, true);
      a.fired = true;
      fired.push(a.id);
    }
  }
  return fired;
}

function due(t: Trigger, c: Clock): boolean {
  switch (t.kind) {
    case 'manual':
      return false; // a manual fault is fired by the instructor calling fire()
    case 'atTime':
      return c.sec >= t.sec;
    case 'atAltitude':
      return c.altitudeFt >= t.ft;
  }
}

/** Fire one by hand, as an instructor would. */
export function fire(d: Dictionary, set: FaultSet, id: string): void {
  const a = set.armed.find((x) => x.id === id);
  if (!a) throw new Error(`${id} is not armed`);
  d.set(fault(id).flag, true);
  a.fired = true;
}

/** Clear a flag. Repairing a fault is an explicit act. */
export function repair(d: Dictionary, id: string): void {
  d.set(fault(id).flag, false);
}
