/**
 * Message conditions, as data.
 *
 * A condition is a small JSON tree — `var`, `not`, `all`, `eq/lt/gt` — evaluated against the
 * dictionary. Content lives in `data/messages.json` so the set can grow without touching code, and
 * so every entry can carry the ATA chapter it belongs to.
 *
 * Nothing is allowed to fail open: an unreadable condition throws at load rather than silently
 * never firing.
 */

import type { Dictionary } from '../dictionary.ts';
import { caution, warning, type Level, type Line } from './line.ts';

export type Cond =
  | { var: string }
  | { not: Cond }
  | { all: readonly Cond[] }
  | { any: readonly Cond[] }
  | { eq: { var: string; value: number | boolean } }
  | { lt: { var: string; value: number } }
  | { gt: { var: string; value: number } };

export interface Message {
  readonly id: string;
  readonly level: Level;
  readonly text: string;
  readonly when: Cond;
  /** ATA chapter the message belongs to, for the debrief and the manual reference */
  readonly chapter: string;
}

const RANK: Record<Level, number> = {
  warning: 0,
  caution: 1,
  advisory: 2,
  normal: 3,
  label: 4,
  title: 5,
};

export function evaluate(c: Cond, d: Dictionary): boolean {
  if ('var' in c) {
    const v = d.get(c.var);
    return typeof v === 'boolean' ? v : v !== 0;
  }
  if ('not' in c) return !evaluate(c.not, d);
  if ('all' in c) return c.all.every((x) => evaluate(x, d));
  if ('any' in c) return c.any.some((x) => evaluate(x, d));
  if ('eq' in c) return d.get(c.eq.var) === c.eq.value;
  if ('lt' in c) return d.num(c.lt.var) < c.lt.value;
  if ('gt' in c) return d.num(c.gt.var) > c.gt.value;
  throw new Error(`unreadable condition ${JSON.stringify(c)}`);
}

/** Every variable a condition touches, so a message set can be checked against a dictionary. */
export function varsOf(c: Cond): string[] {
  if ('var' in c) return [c.var];
  if ('not' in c) return varsOf(c.not);
  if ('all' in c) return c.all.flatMap(varsOf);
  if ('any' in c) return c.any.flatMap(varsOf);
  if ('eq' in c) return [c.eq.var];
  if ('lt' in c) return [c.lt.var];
  if ('gt' in c) return [c.gt.var];
  throw new Error(`unreadable condition ${JSON.stringify(c)}`);
}

export function parseMessages(raw: unknown): Message[] {
  if (!Array.isArray(raw)) throw new Error('messages: expected an array');
  return raw.map((m, i) => {
    const o = m as Partial<Message>;
    if (typeof o.id !== 'string' || typeof o.text !== 'string') throw new Error(`messages[${i}]: id and text`);
    if (o.level !== 'warning' && o.level !== 'caution' && o.level !== 'advisory') {
      throw new Error(`messages[${i}]: level must be warning, caution or advisory`);
    }
    if (!o.when) throw new Error(`messages[${i}]: missing condition`);
    if (typeof o.chapter !== 'string') throw new Error(`messages[${i}]: missing chapter`);
    return { id: o.id, level: o.level, text: o.text, when: o.when, chapter: o.chapter };
  });
}

/** The ECAM is dark without DC. Messages are a display, so nothing is shown on a dead aircraft. */
export function ecamPowered(d: Dictionary): boolean {
  return d.bool('bus.dcEss') || d.bool('bus.acEss') || d.bool('bus.dcBat');
}

/** Everything currently true in `set`, most severe first, then in file order. */
export function activeOf(set: readonly Message[], d: Dictionary): Message[] {
  return set
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => evaluate(m.when, d))
    .sort((a, b) => RANK[a.m.level] - RANK[b.m.level] || a.i - b.i)
    .map((x) => x.m);
}

export function linesOf(set: readonly Message[], d: Dictionary): Line[] {
  if (!ecamPowered(d)) return [];
  return activeOf(set, d).map((m) => (m.level === 'warning' ? warning(m.text) : caution(m.text)));
}



