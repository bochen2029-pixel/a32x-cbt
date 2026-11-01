/**
 * A session: one aircraft, one clock, one procedure, one score.
 *
 * This is the seam the browser and the tests share. Before it existed the page owned a dictionary
 * and a clock of its own and the tests owned another; anything that can only be exercised in a
 * browser is not tested, so the session exists and both callers drive it.
 *
 * A session is reset by throwing it away, which is why the dictionary is built per session rather
 * than reset in place.
 */

import { Dictionary } from '../dictionary.ts';
import { Clock } from '../clock.ts';
import { declareAll, tick, type World } from '../systems/index.ts';
import { declarePanel } from '../panel/schema.ts';
import type { Panel } from '../panel/controls.ts';
import { Scorer, type Debrief, type Procedure } from '../training/procedure.ts';
import { arm, step as stepFaults, type FaultSet, type Trigger } from '../faults/index.ts';
import { apply, parse, save } from '../scenario/situation.ts';
import { fault as faultSpec, repair } from '../faults/index.ts';

export type SessionFault = { id: string; trigger?: Trigger };

export interface SessionOptions {
  procedure: Procedure;
  faults?: readonly SessionFault[];
  world?: Partial<World>;
  /** the panel to bind; its guard variables are declared on the session dictionary */
  panel?: Panel;
}

const DEFAULT_WORLD: World = {
  externalPowerAvailable: true,
  groundAirAvailable: false,
  pressureAltitudeFt: 0,
  tanks: { leftHasFuel: true, rightHasFuel: true, centerHasFuel: false },
  ratDeployed: false,
};

export class Session {
  readonly d: Dictionary;
  readonly clock: Clock;
  readonly procedure: Procedure;
  readonly world: World;
  scorer: Scorer;

  private readonly faults: FaultSet | undefined;
  private altitudeFt = 0;
  private steps = 0;
  private fired: string[] = [];
  private paused = false;
  private repositions = 0;

  constructor(o: SessionOptions, clock = new Clock(20)) {
    this.d = new Dictionary();
    declareAll(this.d);
    if (o.panel) declarePanel(this.d, o.panel);
    this.clock = clock;
    this.procedure = o.procedure;
    this.world = { ...DEFAULT_WORLD, ...o.world };
    this.altitudeFt = this.world.pressureAltitudeFt ?? 0;
    this.scorer = new Scorer(o.procedure, this.d);
    this.faults = o.faults?.length ? arm(o.faults) : undefined;
  }

  /** Rebuild a session from a parked situation. */
  static fromSituation(o: SessionOptions, text: string, clock = new Clock(20)): Session {
    const parked = parse(text);
    const s = new Session(o, clock);
    apply(s.d, parked);
    s.steps = parked.elapsedSteps;
    return s;
  }

  /** Freeze the model. Time does not pass, but the instructor can still inspect and act. */
  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  /** Advance by wall time. Returns how many fixed steps ran — none while frozen. */
  advance(realMs: number): number {
    if (this.paused) return 0;
    return this.clock.run(realMs, (dt) => this.step(dt));
  }

  /**
   * Advance a whole number of simulated seconds, in frame-sized slices. The clock refuses to run
   * more than a few steps per call — that is what stops a stalled tab spiralling — so anything that
   * wants seconds rather than frames has to ask for them this way.
   */
  runFor(seconds: number, frameMs = 50): number {
    const frames = Math.ceil((seconds * 1000) / frameMs);
    let ran = 0;
    for (let i = 0; i < frames && !this.done; i++) ran += this.advance(frameMs);
    return ran;
  }

  /**
   * Fire a fault by hand, as an instructor would. Works whether or not the drill armed it: the
   * instructor is not bound by the scenario.
   */
  injectFault(id: string): void {
    this.d.set(faultSpec(id).flag, true);
    this.fired.push(id);
  }

  /** Repair a fault by hand, and stop counting it as fired. */
  clearFault(id: string): void {
    repair(this.d, id);
    this.fired = this.fired.filter((f) => f !== id);
  }

  /**
   * Move the aircraft to a parked situation mid-run. The score cannot survive that — the trainee
   * would be credited for steps performed against a different aircraft — so the attempt restarts
   * and the reposition is counted.
   */
  reposition(text: string): void {
    const parked = parse(text);
    apply(this.d, parked);
    this.steps = parked.elapsedSteps;
    this.scorer = new Scorer(this.procedure, this.d);
    this.repositions++;
  }

  get repositionCount(): number {
    return this.repositions;
  }

  /** One fixed step. Public so a test can drive it without a clock. */
  step(dt: number): void {
    this.steps++;
    tick(this.d, this.world, dt);
    if (this.faults) {
      const fired = stepFaults(this.d, this.faults, { sec: this.simSeconds, altitudeFt: this.altitudeFt });
      this.fired.push(...fired);
    }
    this.scorer.tick(dt);
  }

  /** Simulated seconds, derived from the step count so a resumed run never accumulates drift. */
  get simSeconds(): number {
    return this.steps * this.clock.dt;
  }

  /** Park this session as a situation file, elapsed time included. */
  toSituation(description: string): string {
    return save(this.d, description, this.steps);
  }

  get done(): boolean {
    return this.scorer.done;
  }

  get faultsFired(): readonly string[] {
    return this.fired;
  }

  debrief(): Debrief {
    return this.scorer.debrief();
  }

  /** The scenario the trainee is handed, for the header line. */
  describe(): string {
    return `${this.procedure.title} · ${this.clock.elapsed.toFixed(0)} s · ${this.d.names().length} variables`;
  }
}










