/**
 * The message set, loaded from disk. Node only — the browser fetches the same JSON.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Dictionary } from '../dictionary.ts';
import { activeOf, linesOf, parseMessages, type Message } from './warnings.ts';

export function loadMessages(file = join('web', 'data', 'messages.json')): Message[] {
  return parseMessages(JSON.parse(readFileSync(file, 'utf8')));
}

export const messages: readonly Message[] = loadMessages();

export const active = (d: Dictionary): Message[] => activeOf(messages, d);
export const activeLines = (d: Dictionary): ReturnType<typeof linesOf> => linesOf(messages, d);

