/**
 * Draw model: what a panel looks like right now, as data.
 *
 * Kept free of the DOM so it can be tested headlessly and so the canvas renderer stays a thin
 * mapper from these primitives to calls.
 */

import type { Dictionary } from '../dictionary.ts';
import { describe, type Control, type Panel } from '../panel/controls.ts';

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly label: string;
  readonly state: string;
  readonly guarded: boolean;
  readonly lit: boolean;
  readonly form: Control['form'];
}

export interface Scene {
  readonly cols: number;
  readonly rows: number;
  readonly boxes: Box[];
}

export function scene(p: Panel, d: Dictionary): Scene {
  return {
    cols: p.cols,
    rows: p.rows,
    boxes: p.controls.map((c) => ({
      x: c.x,
      y: c.y,
      w: c.w,
      h: c.h,
      label: c.label,
      state: describe(d, c),
      guarded: c.guard ? d.bool(c.guard) : false,
      lit: c.form === 'push' || c.form === 'guarded' ? d.get(c.var) === true : false,
      form: c.form,
    })),
  };
}

export interface EcamLine {
  readonly level: string;
  readonly text: string;
}

/** The colour discipline, in one place, so the canvas and the ASCII agree. */
export const COLOURS: Record<string, string> = {
  warning: '#ff3b30',
  caution: '#ffb020',
  advisory: '#38b6ff',
  normal: '#e8eef5',
  label: '#6aa9ff',
  title: '#d17bff',
};
