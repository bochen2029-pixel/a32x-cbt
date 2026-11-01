/**
 * Procedures and scoring — the thing that makes this a trainer and not a simulator.
 *
 * PSX gives its instructor a metric grid with no tolerances and no procedure (notes 08). Here a
 * procedure is an ordered list of steps, each with a predicate over the dictionary, an optional
 * time window, and the rationale shown in the debrief.
 *
 * The scoring rule is deliberately unforgiving about *order*: a flow is ordered for a reason, and
 * a trainee who reaches step 4 without having done step 2 needs to be told that, not congratulated.
 */

import type { Dictionary } from '../dictionary.ts';

export interface Step {
  readonly id: string;
  readonly label: string;
  /** satisfied when this returns true; read-only over the dictionary */
  readonly done: (d: Dictionary) => boolean;
  /** seconds allowed; measured from start, or from `startsWhen` if given */
  readonly withinSec?: number;
  /**
   * When present, this step's window does not open until the predicate is true — for a fault the
   * trainee has to react to, the clock starts at the fault, not at the procedure.
   */
  readonly startsWhen?: (d: Dictionary) => boolean;
  /** why the step matters — printed in the debrief */
  readonly why: string;
  /**
   * A number to sample when the step completes, with the aim and the band that counts as on target.
   * A step can be done and still be off the aim, and the debrief should say which.
   */
  readonly measure?: { readonly var: string; readonly aim: number; readonly band: number; readonly unit?: string };
}

export interface Procedure {
  readonly id: string;
  readonly title: string;
  readonly steps: readonly Step[];
}

export type StepStatus = 'pending' | 'done' | 'missed';

export interface StepResult {
  readonly id: string;
  readonly label: string;
  readonly status: StepStatus;
  /** seconds after procedure start, when it completed */
  readonly atSec?: number;
  readonly why: string;
  /** what the measure read when the step completed */
  readonly reading?: { readonly value: number; readonly aim: number; readonly band: number; readonly ok: boolean };
}

export interface Debrief {
  readonly procedureId: string;
  readonly title: string;
  readonly passed: boolean;
  readonly completed: number;
  readonly total: number;
  readonly seconds: number;
  readonly steps: readonly StepResult[];
}

function read(m: NonNullable<Step['measure']>, d: Dictionary): { value: number; aim: number; band: number; ok: boolean } {
  const value = d.num(m.var);
  return { value, aim: m.aim, band: m.band, ok: Math.abs(value - m.aim) <= m.band };
}

export class Scorer {
  private readonly proc: Procedure;
  private readonly d: Dictionary;
  private readonly results: StepResult[];
  private cursor = 0;
  private elapsedSec = 0;
  private finished = false;
  /** when the current step's window opened; -1 while it has not */
  private windowStart = -1;

  constructor(proc: Procedure, d: Dictionary) {
    this.proc = proc;
    this.d = d;
    this.results = proc.steps.map((s) => ({ id: s.id, label: s.label, why: s.why, status: 'pending' }));
  }

  /** Advance the procedure by one model tick of `dt` seconds. */
  tick(dt: number): void {
    if (this.finished) return;
    this.elapsedSec += dt;

    const step = this.proc.steps[this.cursor];
    if (!step) {
      this.finished = true;
      return;
    }

    if (step.startsWhen) {
      if (this.windowStart < 0) {
        if (step.startsWhen(this.d)) this.windowStart = this.elapsedSec;
        return; // nothing can happen before the window opens
      }
    }

    if (step.done(this.d)) {
      this.results[this.cursor] = {
        ...this.results[this.cursor],
        status: 'done',
        atSec: this.elapsedSec,
        ...(step.measure ? { reading: read(step.measure, this.d) } : {}),
      };
      this.cursor++;
      this.windowStart = -1;
      if (this.cursor >= this.proc.steps.length) this.finished = true;
      return;
    }

    const open = this.windowStart >= 0 ? this.windowStart : 0;
    if (step.withinSec !== undefined && this.elapsedSec - open > step.withinSec) {
      this.results[this.cursor] = { ...this.results[this.cursor], status: 'missed', atSec: this.elapsedSec };
      this.cursor++;
      this.windowStart = -1;
      if (this.cursor >= this.proc.steps.length) this.finished = true;
    }
  }

  get done(): boolean {
    return this.finished;
  }

  get currentStep(): Step | undefined {
    return this.proc.steps[this.cursor];
  }

  debrief(): Debrief {
    const completed = this.results.filter((r) => r.status === 'done').length;
    return {
      procedureId: this.proc.id,
      title: this.proc.title,
      passed: this.finished && completed === this.proc.steps.length,
      completed,
      total: this.proc.steps.length,
      seconds: Math.round(this.elapsedSec),
      steps: [...this.results],
    };
  }
}

/** Render a debrief as the one screen a trainee reads after a run. */
export function formatDebrief(r: Debrief): string {
  const mark: Record<StepStatus, string> = { done: '  ok ', pending: '  -- ', missed: ' MISS' };
  const lines = r.steps.map(
    (s, i) =>
      `${mark[s.status]} ${String(i + 1).padStart(2)}. ${s.label.padEnd(38)}` +
      `${s.status === 'done' ? `${(s.atSec ?? 0).toFixed(1)}s` : ''}`,
  );
  const head = `${r.title} — ${r.passed ? 'PASS' : 'FAIL'}  ${r.completed}/${r.total} in ${r.seconds}s`;
  const misses = r.steps.filter((s) => s.status !== 'done').map((s) => `   ${s.label}: ${s.why}`);
  const off = r.steps
    .filter((s) => s.reading && !s.reading.ok)
    .map(
      (s) =>
        `   ${s.label}: read ${s.reading!.value.toFixed(1)} against ${s.reading!.aim} ± ${s.reading!.band} ` +
        `(${(s.reading!.value - s.reading!.aim > 0 ? '+' : '')}${(s.reading!.value - s.reading!.aim).toFixed(1)})`,
    );
  return [
    head,
    ...lines,
    ...(misses.length ? ['', 'why it mattered:', ...misses] : []),
    ...(off.length ? ['', 'off the aim:', ...off] : []),
  ].join('\n');
}



