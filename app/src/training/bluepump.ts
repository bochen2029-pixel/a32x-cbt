/**
 * A fault-response drill.
 *
 * The BLUE pump is failed by the instructor at some point during the flight. The window on the
 * response does not open until the fault exists — that is what `startsWhen` is for. Before the
 * fault, the trainee is flying; after it, they have thirty seconds.
 */

import type { Dictionary } from '../dictionary.ts';
import type { Procedure } from './procedure.ts';

export const bluePumpDrill: Procedure = {
  id: 'blue-pump-drill',
  title: 'BLUE pump failure — recover on YELLOW',
  steps: [
    {
      id: 'fault-seen',
      label: 'BLUE pump failure occurs',
      done: (d: Dictionary) => d.bool('fault.hydBluePump'),
      withinSec: 600,
      why: 'the instructor injects this; nothing is expected of the trainee until it happens',
    },
    {
      id: 'yellow-pump',
      label: 'YELLOW electric pump selected on',
      done: (d: Dictionary) => d.bool('sw.hydYellowEpump'),
      startsWhen: (d: Dictionary) => d.bool('fault.hydBluePump'),
      withinSec: 30,
      why: 'with BLUE gone the YELLOW electric pump is the only source for that system on the ground',
    },
    {
      id: 'pressure-back',
      label: 'YELLOW pressure recovered',
      done: (d: Dictionary) => d.num('hyd.yellow') > 2000,
      startsWhen: (d: Dictionary) => d.bool('fault.hydBluePump'),
      withinSec: 45,
      why: 'selecting the pump is not the same as having pressure; the debrief should see the difference',
    },
  ],
};
