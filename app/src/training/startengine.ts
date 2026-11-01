/**
 * Starting engine 1 from cold, as a graded flow.
 *
 * The step that matters is 5: the master lever belongs on *after* the engine is turning fast
 * enough to take fuel. A trainee who arms it early gets a hot start — the engine still runs, which
 * is why the mistake is worth catching in a debrief rather than in the airframe.
 */

import type { Dictionary } from '../dictionary.ts';
import type { Procedure } from './procedure.ts';

export const startEngine1: Procedure = {
  id: 'start-engine-1',
  title: 'Start ENG 1 on APU bleed',
  steps: [
    {
      id: 'apu',
      label: 'APU available',
      done: (d: Dictionary) => d.bool('sys.apuRunning'),
      withinSec: 90,
      why: 'with no ground air the APU is the only bleed source on a cold aircraft',
    },
    {
      id: 'bleed',
      label: 'APU bleed on',
      done: (d: Dictionary) => d.bool('sw.apuBleed'),
      withinSec: 100,
      why: 'no bleed means the starter has nothing to turn the engine with',
    },
    {
      id: 'fuel',
      label: 'Fuel pumps and LP valve open',
      done: (d: Dictionary) => d.bool('sys.fuelToEng1'),
      withinSec: 120,
      why: 'fuel has to reach the engine before the master lever means anything',
    },
    {
      id: 'crank',
      label: 'Start selector to START',
      done: (d: Dictionary) => d.num('sw.eng1Start') === 1,
      withinSec: 135,
      why: 'the selector opens the start valve; nothing turns without it',
    },
    {
      id: 'armed-clean',
      label: 'Master lever on, no hot start',
      done: (d: Dictionary) => d.bool('sw.eng1Master') && !d.bool('sys.eng1HotStartLatched'),
      withinSec: 200,
      why: 'arming below 16 % N2 runs the engine hot; the fault latches until the engine stops',
    },
    {
      id: 'running',
      label: 'ENG 1 self-sustaining',
      done: (d: Dictionary) => d.bool('sys.eng1Running'),
      withinSec: 260,
      why: 'the engine must reach idle on its own before the selector is released',
    },
    {
      id: 'released',
      label: 'Selector released',
      done: (d: Dictionary) => d.num('sw.eng1Start') === 0,
      withinSec: 300,
      why: 'a selector left in START keeps the valve open and the starter engaged',
    },
  ],
};

