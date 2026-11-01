/**
 * ASCII render of a panel. Not the product's UI — a way to see the data and to prove the panel is
 * a first-class object. The canvas later draws the same controls from the same coordinates.
 */

import type { Dictionary } from '../dictionary.ts';
import { describe, type Panel } from './controls.ts';

export function render(p: Panel, d: Dictionary): string {
  const grid: string[][] = Array.from({ length: p.rows }, () => Array.from({ length: p.cols }, () => ' '));

  const put = (x: number, y: number, text: string): void => {
    for (let i = 0; i < text.length; i++) {
      const col = x + i;
      if (row(y) && col >= 0 && col < p.cols) row(y)![col] = text[i];
    }
  };
  const row = (y: number) => (y >= 0 && y < p.rows ? grid[y] : undefined);

  for (const c of p.controls) {
    const guarded = c.guard ? d.bool(c.guard) : false;
    const box = guarded ? `[${c.label}]` : ` ${c.label} `;
    put(c.x, c.y, box.slice(0, Math.max(c.w, 1)));
    if (c.form !== 'lamp') put(c.x, c.y + 1 < p.rows ? c.y + 1 : c.y, stateOf(d, c, guarded));
  }

  return [`${p.title}`, ...grid.map((r) => r.join('').replace(/\s+$/, ''))].join('\n');
}

function stateOf(d: Dictionary, c: { form: string; label: string }, guarded: boolean): string {
  const text = describe(d, c as never);
  if (c.form === 'guarded') return guarded ? 'guard up' : text;
  return text;
}
