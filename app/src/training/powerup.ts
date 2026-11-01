/**
 * A first procedure: power the aircraft up from cold & dark.
 *
 * The order is the real order, and the windows are loose enough for a beginner and tight enough
 * that a trainee who wanders off gets told. Every predicate reads the dictionary only — no
 * system is asked how it thinks it is doing.
 */

import type { Dictionary } from '../dictionary.ts';
import type { Procedure } from './procedure.ts';

export const powerUp: Procedure = {
  id: 'power-up',
  title: 'Cold & dark to fully powered',
  steps: [
    {
      id: 'ext-pwr',
      label: 'EXT PWR on',
      done: (d: Dictionary) => d.bool('sw.extPwr'),
      withinSec: 60,
      why: 'without ground power the aircraft has only batteries; nothing downstream can run',
    },
    {
      id: 'ac1',
      label: 'AC BUS 1 powered',
      done: (d: Dictionary) => d.bool('bus.ac1'),
      withinSec: 75,
      why: 'AC BUS 1 feeds the essential network and the first transformer',
    },
    {
      id: 'dc-ess',
      label: 'DC ESS BUS powered',
      done: (d: Dictionary) => d.bool('bus.dcEss'),
      withinSec: 90,
      why: 'the essential DC bus is what keeps the computers and the standby instruments alive',
    },
    {
      id: 'pumps',
      label: 'Fuel pumps on',
      done: (d: Dictionary) => d.bool('sw.fuelPumpL1') && d.bool('sw.fuelPumpR1'),
      withinSec: 120,
      why: 'both sides must be pressurised before a start, or the LP valve opens onto nothing',
    },
    {
      id: 'lp-valves',
      label: 'Both LP valves open',
      done: (d: Dictionary) => d.bool('sys.fuelLp1') && d.bool('sys.fuelLp2'),
      withinSec: 140,
      why: 'fuel reaching both engines is the last thing checked before the start sequence',
    },
    {
      id: 'blue-pump',
      label: 'BLUE electric pump running',
      done: (d: Dictionary) => d.bool('sys.hydBluePump'),
      withinSec: 170,
      why: 'the BLUE system has no engine pump; without the electric pump it is dead until the RAT',
    },
    {
      id: 'bleed-1',
      label: 'Bleed 1 supplying the duct',
      done: (d: Dictionary) => d.bool('sys.bleedSrc1') || d.bool('sys.bleedApu'),
      withinSec: 200,
      why: 'something has to pressurise the duct before a pack or a start valve does any work',
    },
  ],
};
