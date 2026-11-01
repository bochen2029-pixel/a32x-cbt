/**
 * Panel definitions come from data, so this module exists to refuse bad data at load.
 *
 * A panel is content: it changes when the aircraft is documented better, not when the code
 * changes. Everything that can be checked here is checked here — a control that binds a variable
 * nobody declares is a dead switch, and a dead switch in a trainer teaches nothing.
 */

import type { Dictionary } from '../dictionary.ts';
import type { Control, Form, Panel } from './controls.ts';

const FORMS: readonly Form[] = ['push', 'guarded', 'selector', 'lamp'];

export function parsePanel(raw: unknown): Panel {
  const o = raw as Partial<Panel>;
  if (!o || typeof o !== 'object') throw new Error('panel: expected an object');
  if (typeof o.id !== 'string' || typeof o.title !== 'string') throw new Error('panel: id and title required');
  if (!Number.isInteger(o.cols) || !Number.isInteger(o.rows)) throw new Error('panel: cols and rows must be integers');
  if (!Array.isArray(o.controls)) throw new Error('panel: controls must be an array');

  const cols = o.cols as number;
  const rows = o.rows as number;
  const seen = new Set<string>();
  const controls: Control[] = o.controls.map((c: unknown, i: number) => {
    const k = c as Partial<Control>;
    const where = `controls[${i}]${k.id ? ` (${k.id})` : ''}`;

    if (typeof k.id !== 'string' || !k.id) throw new Error(`${where}: id required`);
    if (seen.has(k.id)) throw new Error(`${where}: duplicate id`);
    seen.add(k.id);

    if (typeof k.label !== 'string' || !k.label) throw new Error(`${where}: label required`);
    if (typeof k.var !== 'string' || !k.var) throw new Error(`${where}: var required`);
    if (typeof k.form !== 'string' || !FORMS.includes(k.form as Form)) {
      throw new Error(`${where}: form must be one of ${FORMS.join(', ')}`);
    }
    for (const f of ['x', 'y', 'w', 'h'] as const) {
      if (!Number.isInteger(k[f])) throw new Error(`${where}: ${f} must be an integer`);
    }
    if ((k.x as number) < 0 || (k.y as number) < 0) throw new Error(`${where}: negative position`);
    if ((k.x as number) + (k.w as number) > cols) throw new Error(`${where}: runs past ${cols} columns`);
    if ((k.y as number) + (k.h as number) > rows) throw new Error(`${where}: runs past ${rows} rows`);

    if (k.form === 'guarded' && typeof k.guard !== 'string') throw new Error(`${where}: guarded needs a guard variable`);
    if (k.form === 'selector') {
      if (!Number.isInteger(k.positions) || (k.positions as number) < 2) throw new Error(`${where}: selector needs positions >= 2`);
      if (k.table) {
        if (!Array.isArray(k.table) || k.table.length !== k.positions) {
          throw new Error(`${where}: table must match positions`);
        }
        if (new Set(k.table).size !== k.table.length) throw new Error(`${where}: table has duplicate detents`);
      }
    }

    return {
      id: k.id as string,
      label: k.label as string,
      x: k.x as number,
      y: k.y as number,
      w: k.w as number,
      h: k.h as number,
      form: k.form as Form,
      var: k.var as string,
      positions: k.positions,
      table: k.table,
      guard: k.guard,
      note: k.note,
    };
  });

  return { id: o.id, title: o.title, cols, rows, controls };
}

/** Every variable a panel touches, so it can be checked against a dictionary. */
export function panelVars(p: Panel): string[] {
  return p.controls.flatMap((c) => (c.guard ? [c.var, c.guard] : [c.var]));
}

/** Declare the guard variables a panel needs. Selectors are declared by their own system. */
export function declarePanel(d: Dictionary, p: Panel): void {
  for (const c of p.controls) {
    if (!c.guard) continue;
    try {
      d.spec(c.guard);
    } catch {
      d.declare({ name: c.guard, kind: 'bool', note: `${c.label} guard lifted` });
    }
  }
}

/** Refuse a panel whose controls bind variables the model does not declare. */
export function checkPanel(p: Panel, d: Dictionary): void {
  const missing = panelVars(p).filter((v) => {
    try {
      d.spec(v);
      return false;
    } catch {
      return true;
    }
  });
  if (missing.length) throw new Error(`panel ${p.id}: undeclared variables ${[...new Set(missing)].join(', ')}`);
}

