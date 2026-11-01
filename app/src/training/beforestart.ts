/**
 * Before start: the flow that gets an aircraft ready to turn a starter.
 *
 * The order is the SOP order and the reasons are the ones a trainee is actually asked for. Two
 * steps carry a measurement, because the interesting part of a start is the numbers, not the
 * switch positions: idle N2 and the cabin state that follows.
 */

import type { Dictionary } from '../dictionary.ts';
import type { Procedure } from './procedure.ts';

export const beforeStart: Procedure = {
  id: 'before-start',
  title: 'Before start',
  steps: [
    {
      id: 'batteries',
      label: 'Batteries on',
      done: (d: Dictionary) => d.bool('sw.bat1') && d.bool('sw.bat2'),
      withinSec: 60,
      why: 'the ECB and the ECAM need DC before anything else can be selected',
    },
    {
      id: 'ext-pwr',
      label: 'Ground power on',
      done: (d: Dictionary) => d.bool('bus.acEss'),
      withinSec: 90,
      why: 'AC ESS powers the fuel pumps and the pack valves; batteries alone will not',
    },
    {
      id: 'apu-bleed',
      label: 'APU bleed on',
      done: (d: Dictionary) => d.bool('sw.apuBleed') && d.bool('sys.apuBleedAvail'),
      withinSec: 150,
      why: 'the APU is the bleed source that starts an engine on a cold aircraft',
    },
    {
      id: 'packs-off',
      label: 'Packs off for start',
      done: (d: Dictionary) => !d.bool('sw.pack1') && !d.bool('sw.pack2'),
      withinSec: 170,
      why: 'packs take air the starter needs; the checklist pulls them off before a start',
    },
    {
      id: 'fuel-pumps',
      label: 'Fuel pumps on',
      done: (d: Dictionary) => d.bool('sw.fuelPumpL1') && d.bool('sw.fuelPumpR1'),
      withinSec: 200,
      why: 'both sides pressurised, or the LP valve opens onto nothing',
    },
    {
      id: 'lp-valves',
      label: 'LP valves open',
      done: (d: Dictionary) => d.bool('sys.fuelLp1') && d.bool('sys.fuelLp2'),
      withinSec: 220,
      why: 'the LP valve is the last thing between the tank and the engine',
    },
    {
      id: 'hyd',
      label: 'Hydraulics available',
      done: (d: Dictionary) => d.bool('sys.hydBluePump'),
      withinSec: 260,
      why: 'the BLUE electric pump proves the electric network and gives flight controls pressure',
      measure: { var: 'hyd.blue', aim: 3000, band: 300, unit: 'psi' },
    },
  ],
};
