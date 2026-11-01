/**
 * Frame pacing: how much wall time each animation frame hands the session.
 *
 * One clock only. requestAnimationFrame stamps a frame with the time it began, and a frame can
 * begin before the code that asked for it has finished running. Mixing those stamps with a
 * performance.now() taken at startup therefore produced a negative interval on the first frame;
 * Clock rightly refused it, the refusal escaped the frame callback, and the trainer stopped on
 * load — on most loads in headless Chrome with software rendering. Intervals here come from frame
 * stamps alone, which only move forward. The first frame sets the baseline and advances nothing.
 */

import type { Session } from '../session/session.ts';

/** A frame callback's pacer: give it each frame's stamp, it advances the current session. */
export function pacer(current: () => Session): (stamp: number) => number {
  let last: number | undefined;
  return (stamp) => {
    const since = last === undefined ? 0 : stamp - last;
    last = stamp;
    return current().advance(since);
  };
}
