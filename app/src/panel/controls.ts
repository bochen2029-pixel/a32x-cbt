/**
 * Controls are data, not widgets.
 *
 * PSX note 07: a switch is `(position, registry slot, physical form, geometry table, event)` and
 * nothing else. The panel is a list of those. A form declares how it is actuated and what a press
 * means, so the UI cannot misuse a control — the type is the contract.
 *
 * No rendering here: this module resolves a point to a control and applies the actuation to the
 * dictionary. The canvas later draws the same list.
 */

import type { Dictionary } from '../dictionary.ts';

export type Form = 'push' | 'guarded' | 'selector' | 'lamp';

export interface Control {
  readonly id: string;
  readonly label: string;
  /** panel-grid rectangle, top-left origin */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly form: Form;
  /** dictionary variable this control writes */
  readonly var: string;
  /** selector detents; a selector with n positions writes 0..n-1 */
  readonly positions?: number;
  /**
   * Detent values, PSX `DIAL_n_45` tables: a selector whose detents are not 0..n-1 writes these
   * instead. A five-position outflow selector steps 0/25/50/75/100, not 0/1/2/3/4.
   */
  readonly table?: readonly number[];
  /** guarded controls hold their guard state here */
  readonly guard?: string;
  readonly note?: string;
}

export interface Panel {
  readonly id: string;
  readonly title: string;
  readonly cols: number;
  readonly rows: number;
  readonly controls: readonly Control[];
}

export class NotFound extends Error {}

/** Topmost control containing the point. Later declarations sit on top. */
export function hitTest(p: Panel, x: number, y: number): Control | undefined {
  let found: Control | undefined;
  for (const c of p.controls) {
    if (x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h) found = c;
  }
  return found;
}

export function controlAt(p: Panel, id: string): Control {
  const c = p.controls.find((k) => k.id === id);
  if (!c) throw new NotFound(`no control ${id} on panel ${p.id}`);
  return c;
}

/**
 * Actuate. A guard opens on the first press and passes the press through on the second, so a
 * guarded switch takes two deliberate clicks and cannot be knocked.
 */
export function actuate(d: Dictionary, c: Control): void {
  switch (c.form) {
    case 'lamp':
      return;
    case 'push':
      // a plain panel switch is maintained: it toggles. The momentary ones (APU START) are
      // cleared by their own system, so the panel does not have to know which is which.
      toggleBool(d, c.var);
      return;
    case 'guarded': {
      if (!c.guard) throw new Error(`${c.id}: guarded control needs a guard variable`);
      if (!d.bool(c.guard)) {
        d.set(c.guard, true);
        return;
      }
      toggleBool(d, c.var);
      d.set(c.guard, false);
      return;
    }
    case 'selector': {
      const detents = c.table ?? Array.from({ length: c.positions ?? 2 }, (_, i) => i);
      const at = detents.indexOf(d.num(c.var));
      // an unknown position is treated as the first detent, so a scenario written by hand
      // cannot wedge the selector
      const next = detents[(at + 1) % detents.length];
      d.set(c.var, next);
      return;
    }
  }
}

function toggleBool(d: Dictionary, name: string): void {
  d.set(name, !d.bool(name));
}

/** Human-readable state for the debrief and for tests that need to see a position. */
export function describe(d: Dictionary, c: Control): string {
  switch (c.form) {
    case 'lamp':
      return d.bool(c.var) ? 'lit' : 'dark';
    case 'selector':
      return `${d.num(c.var)}`;
    default:
      return d.bool(c.var) ? 'on' : 'off';
  }
}

