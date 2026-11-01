/**
 * Compose the display: warnings above, the selected page below. ASCII only; the canvas draws the
 * same lines later.
 */

import type { Dictionary } from '../dictionary.ts';
import { paint } from './line.ts';
import { linesOf, type Message } from './warnings.ts';
import { renderPage, type PageSpec } from './pageSchema.ts';

export function renderDisplay(set: readonly Message[], pages: readonly PageSpec[], d: Dictionary, pageId: string, colour = false): string {
  const p = pages.find((x) => x.id === pageId);
  if (!p) throw new Error(`no page ${pageId}`);

  const warns = linesOf(set, d);
  const head = warns.length ? warns : [{ level: 'normal' as const, text: 'no warnings' }];
  const body = renderPage(p, d);

  return paint([...head, { level: 'normal', text: '' }, ...body], colour);
}




