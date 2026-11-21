// The notice a built page carries: the sketch's licence (LICENSE) and what in the page is others'
// (NOTICE.md), as one HTML comment. build.mjs puts it at the top of the body; the tests read it here.
// MIT.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// LICENSE's and NOTICE.md's text as an HTML comment. A sequence that would end the comment early, or
// open another, is refused, not escaped: the notice is printed as written or not at all.
export function pageNotice(licence, notice) {
  const text = `${licence.trim()}\n\n${notice.trim()}`;
  const bad = /<!--|-->|--!>/.exec(text);
  if (bad) throw new Error(`LICENSE or NOTICE.md holds "${bad[0]}", which would break the page's notice`);
  return `<!--\n${text}\n-->\n`;
}

// The notice of the sketch at <orbit>, the folder that holds LICENSE and NOTICE.md.
export const readNotice = (orbit) =>
  pageNotice(readFileSync(join(orbit, 'LICENSE'), 'utf8'), readFileSync(join(orbit, 'NOTICE.md'), 'utf8'));
