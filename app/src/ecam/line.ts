/**
 * ECAM text.
 *
 * PSX generates its displays from state rather than drawing stored pictures; this does the same
 * for the pages a B1 trainee needs. A page is a pure function of the dictionary returning lines,
 * and a line carries a level so the renderer does not have to re-derive colour.
 *
 * Levels map to the A320 colour discipline: warning (red), caution (amber), advisory (blue/green,
 * here simply advisory), normal (white), label and title (blue).
 */

export type Level = 'warning' | 'caution' | 'advisory' | 'normal' | 'label' | 'title';

export interface Line {
  readonly level: Level;
  readonly text: string;
}

export const label = (text: string): Line => ({ level: 'label', text });
export const title = (text: string): Line => ({ level: 'title', text });
export const normal = (text: string): Line => ({ level: 'normal', text });
export const advisory = (text: string): Line => ({ level: 'advisory', text });
export const caution = (text: string): Line => ({ level: 'caution', text });
export const warning = (text: string): Line => ({ level: 'warning', text });

/** Pick a level from a condition — used by pages so colour is data, not logic in the renderer. */
export const state = (bad: boolean, text: string, badLevel: Level = 'caution'): Line =>
  bad ? { level: badLevel, text } : normal(text);

const COLOUR: Record<Level, string> = {
  warning: '\u001b[31m',
  caution: '\u001b[33m',
  advisory: '\u001b[36m',
  normal: '\u001b[37m',
  label: '\u001b[34m',
  title: '\u001b[35m',
};
const RESET = '\u001b[0m';

export function paint(lines: readonly Line[], colour = true): string {
  return lines
    .map((l) => (colour ? `${COLOUR[l.level]}${l.text}${RESET}` : l.text))
    .join('\n');
}

