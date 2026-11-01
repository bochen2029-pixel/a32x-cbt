/**
 * Scenarios: the dictionary, serialised.
 *
 * PSX note 06: a situation file is the whole state written out by name, and loading is a bulk
 * actuation bracketed so no reader ever sees half of one. Same here.
 *
 * The format is deliberately boring — a header, a description, then `name=value` — because a
 * scenario has to be diffable, greppable and hand-editable, and because a trainee's instructor
 * will eventually want to type one.
 */

import type { Dictionary } from '../dictionary.ts';

export const HEADER = '[A32X CBT - Situation]';
export const VERSION = 1;
const END_MARK = '^-^-^-^ End of description ^-^-^-^';

export interface Situation {
  readonly description: string;
  /** fixed steps already run when the file was written; exact, unlike seconds */
  readonly elapsedSteps: number;
  /** variable name -> raw textual value, in declaration order */
  readonly values: ReadonlyMap<string, string>;
}

/** Serialise every declared variable. Bools as true/false, numbers with full precision. */
export function save(d: Dictionary, description: string, elapsedSteps = 0): string {
  const lines: string[] = [
    HEADER,
    `[Version ${VERSION}]`,
    `[ElapsedSteps ${elapsedSteps}]`,
    `Description=${description.replace(/\r?\n/g, ' ')}`,
    END_MARK,
    '',
  ];
  for (const name of d.names()) {
    lines.push(`${name}=${render(d, name)}`);
  }
  return `${lines.join('\n')}\n`;
}

function render(d: Dictionary, name: string): string {
  const v = d.get(name);
  return typeof v === 'boolean' ? String(v) : String(v);
}

export class ParseError extends Error {}

/** Parse a situation file. Refuses anything that is not this format rather than guessing. */
export function parse(text: string): Situation {
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== HEADER) throw new ParseError(`not a situation file: ${lines[0] ?? '(empty)'}`);

  let description = '';
  let elapsedSteps = 0;
  const values = new Map<string, string>();
  let i = 1;

  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('Description=')) {
      description = line.slice('Description='.length);
      continue;
    }
    if (line.startsWith('[ElapsedSteps ')) {
      const n = Number(line.slice('[ElapsedSteps '.length, -1));
      if (Number.isInteger(n) && n >= 0) elapsedSteps = n;
      continue;
    }
    if (line.trim() === END_MARK) {
      i++;
      break;
    }
  }

  for (; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) throw new ParseError(`malformed line ${i + 1}: ${line}`);
    values.set(line.slice(0, eq), line.slice(eq + 1));
  }

  return { description, elapsedSteps, values };
}

/**
 * Apply a parsed situation to a dictionary, all or nothing.
 *
 * Validates every entry against the declared kind and range first, so a single bad field leaves
 * the aircraft exactly as it was. A half-loaded scenario is worse than a refused one: the trainee
 * would be sitting in an aircraft that never existed.
 */
export function apply(d: Dictionary, s: Situation, onStep?: (name: string) => void): void {
  const staged: Array<[string, boolean | number | string]> = [];

  for (const [name, raw] of s.values) {
    const spec = d.spec(name); // throws on unknown name
    staged.push([name, coerce(spec, name, raw)]);
  }

  const snapshot = staged.map(([name]) => [name, d.get(name)] as const);
  try {
    for (const [name, value] of staged) {
      d.set(name, value);
      onStep?.(name);
    }
  } catch (err) {
    for (const [name, value] of snapshot) d.set(name, value);
    throw err;
  }
}

function coerce(spec: ReturnType<Dictionary['spec']>, name: string, raw: string): boolean | number | string {
  switch (spec.kind) {
    case 'bool':
      if (raw !== 'true' && raw !== 'false') throw new ParseError(`${name}: expected true/false, got "${raw}"`);
      return raw === 'true';
    case 'int': {
      const n = Number(raw);
      if (!Number.isInteger(n)) throw new ParseError(`${name}: expected integer, got "${raw}"`);
      if (n < spec.min! || n > spec.max!) throw new ParseError(`${name}: ${n} outside [${spec.min}, ${spec.max}]`);
      return n;
    }
    case 'real': {
      const n = Number(raw);
      if (!Number.isFinite(n)) throw new ParseError(`${name}: expected number, got "${raw}"`);
      if (n < spec.min! || n > spec.max!) throw new ParseError(`${name}: ${n} outside [${spec.min}, ${spec.max}]`);
      return n;
    }
    case 'string':
      return raw;
  }
}

/** Load text into a dictionary. Returns the description it carried. */
export function load(d: Dictionary, text: string): string {
  const s = parse(text);
  apply(d, s);
  return s.description;
}


