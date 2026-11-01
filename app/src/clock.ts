/**
 * Fixed-step clock.
 *
 * The correction to PSX (note 09): PSX sleeps 50 ms and integrates on whatever delta the
 * scheduler hands it, with per-subsystem clamps (note 02 I4). A CBT needs determinism, so
 * the model advances on a fixed step and the wall clock only decides how many steps are due.
 *
 * The grid is 20 Hz. A step is always exactly `stepMs`; time never stretches. If the host
 * stalls, the clock catches up to a bounded debt and then gives up — it would rather drop
 * simulated time than run a 400 ms step through a rate law.
 */

export class Clock {
  readonly stepMs: number;
  readonly dt: number;
  /** most steps a single advance() may run; keeps a stalled tab from spiralling */
  readonly maxCatchUp: number;

  private accumulated = 0;
  private steps = 0;

  constructor(hz = 20, maxCatchUp = 5) {
    if (hz <= 0) throw new RangeError('hz must be positive');
    this.stepMs = 1000 / hz;
    this.dt = 1 / hz;
    this.maxCatchUp = maxCatchUp;
  }

  /** How many fixed steps are due for this much wall time. Never returns > maxCatchUp. */
  advance(realMs: number): number {
    if (!Number.isFinite(realMs) || realMs < 0) throw new RangeError('realMs must be finite and >= 0');
    this.accumulated += realMs;
    let due = Math.floor(this.accumulated / this.stepMs);
    if (due > this.maxCatchUp) {
      // drop the excess debt instead of widening the step
      this.accumulated -= (due - this.maxCatchUp) * this.stepMs;
      due = this.maxCatchUp;
    }
    this.accumulated -= due * this.stepMs;
    this.steps += due;
    return due;
  }

  /** Simulated seconds since construction. */
  get elapsed(): number {
    return this.steps * this.dt;
  }

  get stepCount(): number {
    return this.steps;
  }

  /** Run `tick(dt)` the number of times `realMs` has earned. Returns steps run. */
  run(realMs: number, tick: (dt: number, index: number) => void): number {
    const due = this.advance(realMs);
    for (let i = 0; i < due; i++) tick(this.dt, this.steps - due + i);
    return due;
  }
}
