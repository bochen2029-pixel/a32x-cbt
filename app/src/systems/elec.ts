/**
 * A320 electrical network — the B1 systems pattern.
 *
 * Structure taken from PSX `Elec` (notes 01, 03): a graph of sources and contactors evaluated
 * in causal order, every node publishing to the dictionary, lamps reading the nodes rather than
 * predicting them (note 04: actuate and observe, never mirror).
 *
 * Simplified deliberately: no load shedding, no generator drive faults, no TR current limits.
 * What is modelled is the thing a trainee powers an aircraft with — which source feeds which
 * bus, and what is lost when one is removed.
 */

import type { Dictionary } from '../dictionary.ts';

export interface ElecInputs {
  /** engine 1 / 2 spooled above self-sustaining rpm */
  eng1Running: boolean;
  eng2Running: boolean;
  apuRunning: boolean;
  /** ground power connected and available */
  externalPowerAvailable: boolean;
}

/** Declare the variables. Called once per scenario instance. */
export function declareElec(d: Dictionary): void {
  const b = (name: string, note: string) => d.declare({ name, kind: 'bool', note });

  // switches, panel side
  b('sw.extPwr', 'EXT PWR pushbutton');
  b('sw.gen1', 'ELEC GEN 1 pushbutton');
  b('sw.gen2', 'ELEC GEN 2 pushbutton');
  b('sw.apuGen', 'ELEC APU GEN pushbutton');
  b('sw.busTie', 'BUS TIE pushbutton');
  b('sw.bat1', 'BAT 1 pushbutton');
  b('sw.bat2', 'BAT 2 pushbutton');

  // contactors
  b('ctr.extPwr', 'external power contactor closed');
  b('ctr.gen1', 'generator 1 line contactor closed');
  b('ctr.gen2', 'generator 2 line contactor closed');
  b('ctr.apuGen', 'APU generator line contactor closed');

  // buses
  b('bus.ac1', 'AC BUS 1 powered');
  b('bus.ac2', 'AC BUS 2 powered');
  b('bus.acEss', 'AC ESS BUS powered');
  b('bus.dc1', 'DC BUS 1 powered');
  b('bus.dc2', 'DC BUS 2 powered');
  b('bus.dcBat', 'DC BAT BUS powered');
  b('bus.dcEss', 'DC ESS BUS powered');
  b('bus.hotBat', 'HOT BAT BUS powered');
}

/**
 * One tick. Sources first, then AC, then transformers, then DC — the causal order the
 * network is wired in. Never read a node before writing it in the same pass.
 */
export function updateElec(d: Dictionary, i: ElecInputs): void {
  // 1 — sources and their contactors
  const extPwr = d.bool('sw.extPwr') && i.externalPowerAvailable;
  const gen1 = d.bool('sw.gen1') && i.eng1Running;
  const gen2 = d.bool('sw.gen2') && i.eng2Running;
  const apuGen = d.bool('sw.apuGen') && i.apuRunning;

  d.set('ctr.extPwr', extPwr);
  d.set('ctr.gen1', gen1);
  d.set('ctr.gen2', gen2);
  d.set('ctr.apuGen', apuGen);

  // 2 — AC buses. External power is preferred over a generator on its own side; with the
  // bus tie open each side is isolated.
  const busTie = d.bool('sw.busTie');
  const ac1 = extPwr || gen1 || (busTie && (gen2 || apuGen));
  const ac2 = extPwr || gen2 || apuGen || (busTie && gen1);

  d.set('bus.ac1', ac1);
  d.set('bus.ac2', ac2);
  d.set('bus.acEss', ac1 || ac2);

  // 3 — transformer rectifiers
  const tr1 = ac1;
  const tr2 = ac2;

  // 4 — DC network
  const bat1 = d.bool('sw.bat1');
  const bat2 = d.bool('sw.bat2');
  const dc1 = tr1;
  const dc2 = tr2;
  const dcBat = dc1 || dc2 || bat1 || bat2;

  d.set('bus.dc1', dc1);
  d.set('bus.dc2', dc2);
  d.set('bus.dcBat', dcBat);
  d.set('bus.dcEss', dcBat || dc2);
  // the hot battery bus is unswitched: it is live whenever a battery is installed
  d.set('bus.hotBat', true);
}
