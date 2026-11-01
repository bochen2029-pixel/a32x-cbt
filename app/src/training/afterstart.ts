/**
 * After start: what a crew does once both engines are turning.
 *
 * The failure this drill catches is the one that hides in a simulator: leaving the APU bleed open.
 * Nothing breaks immediately — the engines run — but the duct is being fed from two sources and the
 * first indication is a bleed fault at the worst moment.
 */

import type { Dictionary } from '../dictionary.ts';
import type { Procedure } from './procedure.ts';

export const afterStart: Procedure = {
  id: 'after-start',
  title: 'After start',
  steps: [
    {
      id: 'eng1',
      label: 'ENG 1 running',
      done: (d: Dictionary) => d.bool('sys.eng1Running'),
      withinSec: 300,
      why: 'the flow cannot start until the engine is self-sustaining',
      measure: { var: 'eng1.n2', aim: 58, band: 4, unit: '%' },
    },
    {
      id: 'eng2',
      label: 'ENG 2 running',
      done: (d: Dictionary) => d.bool('sys.eng2Running'),
      withinSec: 360,
      why: 'both engines before the generators and the bleeds are reconfigured',
      measure: { var: 'eng2.n2', aim: 58, band: 4, unit: '%' },
    },
    {
      id: 'gens',
      label: 'Both generators on line',
      done: (d: Dictionary) => d.bool('ctr.gen1') && d.bool('ctr.gen2'),
      startsWhen: (d: Dictionary) => d.bool('sys.eng1Running') && d.bool('sys.eng2Running'),
      withinSec: 45,
      why: 'the aircraft leaves ground power behind only when its own generators carry the network',
    },
    {
      id: 'bleeds',
      label: 'Engine bleeds on',
      done: (d: Dictionary) => d.bool('sw.eng1Bleed') && d.bool('sw.eng2Bleed'),
      startsWhen: (d: Dictionary) => d.bool('ctr.gen1') && d.bool('ctr.gen2'),
      withinSec: 45,
      why: 'the ducts have to be fed by the engines before the APU is taken off them',
    },
    {
      id: 'apu-bleed-off',
      label: 'APU bleed off',
      done: (d: Dictionary) => !d.bool('sw.apuBleed'),
      startsWhen: (d: Dictionary) => d.bool('sw.eng1Bleed') && d.bool('sw.eng2Bleed'),
      withinSec: 40,
      why: 'an APU bleed left open fights the engine bleeds and hides a duct fault',
    },
    {
      id: 'packs',
      label: 'Packs on',
      done: (d: Dictionary) => d.bool('sw.pack1') && d.bool('sw.pack2'),
      startsWhen: (d: Dictionary) => !d.bool('sw.apuBleed'),
      withinSec: 60,
      why: 'air conditioning comes back once the ducts belong to the engines',
    },
    {
      id: 'apu-off',
      label: 'APU master off',
      done: (d: Dictionary) => !d.bool('sw.apuMaster'),
      startsWhen: (d: Dictionary) => d.bool('sw.pack1') && d.bool('sw.pack2'),
      withinSec: 40,
      why: 'the APU is shut down and left available, not left running for the flight',
    },
  ],
};
