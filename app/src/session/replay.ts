/**
 * Recording and replay.
 *
 * An action is a variable set at a simulated second. Replay drives a session through the same
 * actions at the same seconds, so a run parked halfway, resumed and finished must produce the same
 * debrief as the run that was never interrupted. That is the P1 gate.
 *
 * Replay deliberately works on *variables*, not on controls: a recording must survive a panel
 * relaid out underneath it.
 */

import type { Session } from './session.ts';

export interface Action {
  /** simulated seconds at which the action happened */
  readonly sec: number;
  readonly name: string;
  readonly value: boolean | number | string;
}

export class Recorder {
  private readonly log: Action[] = [];

  private readonly session: Session;

  constructor(session: Session) {
    this.session = session;
  }

  /** Record and apply, so live play and the log cannot drift. */
  set(name: string, value: boolean | number | string): void {
    this.session.d.set(name, value);
    this.log.push({ sec: round(this.session.simSeconds), name, value });
  }

  actions(): readonly Action[] {
    return this.log;
  }
}

function round(sec: number): number {
  return Math.round(sec * 100) / 100;
}

/**
 * Play actions into a session, one fixed step at a time. Actions land on the step whose time
 * reaches them, in log order.
 */
export function replay(session: Session, actions: readonly Action[], untilSec: number): void {
  const queue = [...actions];
  while (session.simSeconds < untilSec && !session.done) {
    while (queue.length && queue[0].sec <= session.simSeconds) {
      const a = queue.shift()!;
      session.d.set(a.name, a.value);
    }
    session.step(session.clock.dt);
  }
  // anything left is past the horizon; apply the ones that fall inside it
  while (queue.length && queue[0].sec <= untilSec) {
    const a = queue.shift()!;
    session.d.set(a.name, a.value);
  }
}

