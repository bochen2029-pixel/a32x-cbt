/**
 * A pressurisation drill: both packs fail in cruise.
 *
 * This is the one the A320 checklist treats as serious — with no air coming in, the cabin climbs and
 * the masks come out. The modelled recovery is the manual route: take the outflow valve off
 * automatic and shut it, which holds the cabin until the aircraft can descend. It is a simplification
 * (a real crew descends) and it is the only response the current model can express, because B1 has
 * no aircraft to descend.
 */

import type { Dictionary } from '../dictionary.ts';
import type { Procedure } from './procedure.ts';

export const packsFail: Procedure = {
  id: 'packs-fail',
  title: 'Both packs fail in cruise — hold the cabin',
  steps: [
    {
      id: 'fault',
      label: 'Both packs fail',
      done: (d: Dictionary) => d.bool('fault.pack1') && d.bool('fault.pack2'),
      withinSec: 600,
      why: 'the instructor injects this; nothing is expected until it happens',
    },
    {
      id: 'manual',
      label: 'PRESS mode to MANUAL',
      done: (d: Dictionary) => d.num('sw.pressMode') === 1,
      startsWhen: (d: Dictionary) => d.bool('fault.pack1') && d.bool('fault.pack2'),
      withinSec: 45,
      why: 'in automatic the valve does what the controller wants; with no air it cannot hold anything',
    },
    {
      id: 'valve-shut',
      label: 'Outflow valve closed',
      done: (d: Dictionary) => d.num('sw.pressMode') === 1 && d.num('sw.pressValve') === 0,
      startsWhen: (d: Dictionary) => d.bool('fault.pack1') && d.bool('fault.pack2'),
      withinSec: 60,
      why: 'closing the valve is what stops the cabin climbing once nothing is feeding it',
    },
    {
      id: 'held',
      label: 'Cabin rate held near zero',
      done: (d: Dictionary) => Math.abs(d.num('press.cabinVs')) < 50,
      startsWhen: (d: Dictionary) => d.bool('fault.pack1') && d.bool('fault.pack2'),
      withinSec: 90,
      why: 'the point of the drill is the rate, not the switch position',
    },
  ],
};

