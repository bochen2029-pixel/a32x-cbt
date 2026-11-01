/**
 * ECAM page definitions as data.
 *
 * A page is a list of lines. A line is either a title, a label, or text that may carry `{{var}}`
 * tokens resolved from the dictionary at render time — twelve decimals by default, `{{var:0}}` for
 * whole numbers. A line may carry a condition, and the condition decides its colour rather than
 * whether it exists, so a page never changes shape under the trainee.
 *
 * Content lives in `web/data/pages.json`.
 */

import type { Dictionary } from '../dictionary.ts';
import { label, normal, title, type Level, type Line } from './line.ts';
import { evaluate, type Cond } from './warnings.ts';

export type LineSpec =
  | { readonly title: string }
  | { readonly label: string }
  | {
      readonly text: string;
      /** when true the line takes `level`, otherwise it is normal */
      readonly when?: Cond;
      readonly level?: Level;
      /** when present the line exists only while the condition holds — a display rule, not a colour */
      readonly only?: Cond;
    };

export interface PageSpec {
  readonly id: string;
  readonly name: string;
  readonly lines: readonly LineSpec[];
}

const LEVELS: readonly Level[] = ['warning', 'caution', 'advisory', 'normal', 'label', 'title'];
const TOKEN = /\{\{([a-zA-Z0-9._-]+)(?::(\d+))?\}\}/g;

export function parsePages(raw: unknown): PageSpec[] {
  if (!Array.isArray(raw)) throw new Error('pages: expected an array');
  const seen = new Set<string>();
  return raw.map((p, i) => {
    const o = p as Partial<PageSpec>;
    if (typeof o.id !== 'string' || !o.id) throw new Error(`pages[${i}]: id required`);
    if (seen.has(o.id)) throw new Error(`pages[${i}]: duplicate id ${o.id}`);
    seen.add(o.id);
    if (typeof o.name !== 'string' || !o.name) throw new Error(`pages[${i}]: name required`);
    if (!Array.isArray(o.lines) || o.lines.length === 0) throw new Error(`pages[${i}]: lines required`);

    const lines = o.lines.map((l, j) => {
      const k = l as Record<string, unknown>;
      const where = `pages[${i}].lines[${j}]`;
      if (typeof k.title === 'string') return { title: k.title } as LineSpec;
      if (typeof k.label === 'string') return { label: k.label } as LineSpec;
      if (typeof k.text !== 'string') throw new Error(`${where}: needs title, label or text`);
      if (k.level !== undefined && !LEVELS.includes(k.level as Level)) throw new Error(`${where}: unknown level`);
      if (k.when !== undefined && typeof k.when !== 'object') throw new Error(`${where}: when must be a condition`);
      if (k.only !== undefined && typeof k.only !== 'object') throw new Error(`${where}: only must be a condition`);
      return {
        text: k.text,
        when: k.when as Cond | undefined,
        level: k.level as Level | undefined,
        only: k.only as Cond | undefined,
      };
    });

    return { id: o.id, name: o.name, lines };
  });
}

/** Every variable a page reads, including those inside tokens. */
export function pageVars(p: PageSpec): string[] {
  const out: string[] = [];
  for (const l of p.lines) {
    if ('text' in l) for (const m of l.text.matchAll(TOKEN)) out.push(m[1]);
  }
  return out;
}

function resolve(text: string, d: Dictionary): string {
  return text.replace(TOKEN, (_all, name: string, dec: string | undefined) => {
    const v = d.get(name);
    if (typeof v === 'number') return v.toFixed(dec === undefined ? 0 : Number(dec));
    return String(v);
  });
}

export function renderPage(p: PageSpec, d: Dictionary): Line[] {
  const visible = p.lines.filter((l) => !('text' in l) || l.only === undefined || evaluate(l.only, d));
  return visible.map((l) => {
    if ('title' in l) return title(l.title);
    if ('label' in l) return label(resolve(l.label, d));
    const text = resolve(l.text, d);
    const hot = l.when ? evaluate(l.when, d) : false;
    return hot ? { level: l.level ?? 'caution', text } : normal(text);
  });
}



