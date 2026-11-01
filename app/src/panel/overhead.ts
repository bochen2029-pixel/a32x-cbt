/**
 * The overhead panel, loaded from data.
 *
 * The layout lives in `web/data/panel.json` — the browser fetches that file and the Node side reads
 * it, so there is exactly one definition of where a switch is. This module is the Node side.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Dictionary } from '../dictionary.ts';
import type { Panel } from './controls.ts';
import { checkPanel, declarePanel as declarePanelFor, parsePanel } from './schema.ts';

export function loadPanel(file = join('web', 'data', 'panel.json')): Panel {
  return parsePanel(JSON.parse(readFileSync(file, 'utf8')));
}

export const overhead: Panel = loadPanel();

export function declarePanel(d: Dictionary): void {
  declarePanelFor(d, overhead);
}

export { checkPanel };

