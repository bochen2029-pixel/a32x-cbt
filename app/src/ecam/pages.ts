/**
 * The ECAM pages, loaded from data.
 *
 * `web/data/pages.json` is the single definition; the browser fetches it and Node reads it. A page
 * is a list of lines with `{{var}}` tokens and optional conditions, so the text lives next to the
 * band it warns about instead of in code.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Dictionary } from '../dictionary.ts';
import type { Line } from './line.ts';
import { parsePages, pageVars, renderPage, type PageSpec } from './pageSchema.ts';

export function loadPages(file = join('web', 'data', 'pages.json')): PageSpec[] {
  return parsePages(JSON.parse(readFileSync(file, 'utf8')));
}

export interface Page {
  readonly id: string;
  readonly name: string;
  readonly lines: (d: Dictionary) => Line[];
}

const specs = loadPages();

export const pages: readonly Page[] = specs.map((p) => ({
  id: p.id,
  name: p.name,
  lines: (d: Dictionary) => renderPage(p, d),
}));

export function page(id: string): Page | undefined {
  return pages.find((p) => p.id === id);
}

export { pageVars };
export type { PageSpec };
