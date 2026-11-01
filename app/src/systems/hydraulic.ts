/**
 * Hydraulic generation — GREEN / BLUE / YELLOW.
 *
 * PSX pattern (notes 01, 03): a graph of pumps, a network, and pressures as outputs; consumers
 * read the pressure, they do not assume it. Causal order inside one tick: engines and
 * electricity in, pumps out, network, then pressures.
 */

import type { Dictionary } from '../dictionary.ts';

export interface HydInputs {
  eng1Running: boolean;
  eng2Running: boolean;
  /** AC power available for the electric pumps */
  elecPowered: boolean;
  /** RAT deployed by the crew */
  ratDeployed: boolean;
}

export function declareHyd(d: Dictionary): void {
  const b = (name: string, note: string) => d.declare({ name, kind: 'bool', note });
  const r = (name: string, unit: string, note: string) =>
    d.declare({ name, kind: 'real', min: 0, max: 4000, unit, note });

  b('sw.hydGreenEng1', 'GREEN engine pump pushbutton');
  b('sw.hydBlueEpump', 'BLUE electric pump pushbutton');
  b('sw.hydYellowEng2', 'YELLOW engine pump pushbutton');
  b('sw.hydYellowEpump', 'YELLOW electric pump pushbutton');
  b('sw.ptu', 'PTU pushbutton');

  b('sys.hydGreenPump', 'GREEN pump pressurised');
  b('sys.hydBluePump', 'BLUE pump pressurised');
  b('sys.hydYellowPump', 'YELLOW pump pressurised');
  b('sys.ptuRunning', 'PTU transferring');

  r('hyd.green', 'psi', 'GREEN system pressure');
  r('hyd.blue', 'psi', 'BLUE system pressure');
  r('hyd.yellow', 'psi', 'YELLOW system pressure');
}

const NOMINAL = 3000;
const RAT_PRESSURE = 2000;

export function updateHyd(d: Dictionary, i: HydInputs): void {
  // 1 — pumps
  const green = d.bool('sw.hydGreenEng1') && i.eng1Running && !d.bool('fault.hydGreenPump');
  const blueElec = d.bool('sw.hydBlueEpump') && i.elecPowered && !d.bool('fault.hydBluePump');
  const blueRam = i.ratDeployed;
  const yellowEng = d.bool('sw.hydYellowEng2') && i.eng2Running && !d.bool('fault.hydYellowPump');
  const yellowElec = d.bool('sw.hydYellowEpump') && i.elecPowered && !d.bool('fault.hydYellowPump');

  d.set('sys.hydGreenPump', green);
  d.set('sys.hydBluePump', blueElec || blueRam);
  d.set('sys.hydYellowPump', yellowEng || yellowElec);

  // 2 — PTU: bidirectional, only useful when one side is dead and the other is alive
  const ptuWanted = d.bool('sw.ptu');
  const greenOk = green;
  const yellowOk = yellowEng || yellowElec;
  const ptu = ptuWanted && greenOk !== yellowOk;
  d.set('sys.ptuRunning', ptu);

  // 3 — pressures. The PTU lets a live side pressurise a dead one.
  const greenPsi = green ? NOMINAL : ptu && yellowOk ? NOMINAL * 0.8 : 0;
  const yellowPsi = yellowOk ? NOMINAL : ptu && greenOk ? NOMINAL * 0.8 : 0;
  const bluePsi = blueRam ? RAT_PRESSURE : blueElec ? NOMINAL : 0;

  d.set('hyd.green', greenPsi);
  d.set('hyd.yellow', yellowPsi);
  d.set('hyd.blue', bluePsi);
}

