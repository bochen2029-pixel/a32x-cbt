/**
 * Fuel — tanks, pumps, feed and crossfeed.
 *
 * Deliberately quantity-free for now: B1 trains *flows and valve states*, and a trainee learns
 * the fuel feed order by watching which tank is feeding which engine. Quantities arrive with
 * the performance model in B2.
 */

import type { Dictionary } from '../dictionary.ts';

export function declareFuel(d: Dictionary): void {
  const b = (name: string, note: string) => d.declare({ name, kind: 'bool', note });

  b('sw.fuelPumpL1', 'LEFT tank pump 1');
  b('sw.fuelPumpL2', 'LEFT tank pump 2');
  b('sw.fuelPumpR1', 'RIGHT tank pump 1');
  b('sw.fuelPumpR2', 'RIGHT tank pump 2');
  b('sw.fuelPumpC1', 'CENTER tank pump 1');
  b('sw.fuelPumpC2', 'CENTER tank pump 2');
  b('sw.fuelXfeed', 'crossfeed valve open');
  b('sw.fuelEng1LpValve', 'ENG 1 LP valve open');
  b('sw.fuelEng2LpValve', 'ENG 2 LP valve open');

  b('sys.fuelLp1', 'ENG 1 LP valve open (actual)');
  b('sys.fuelLp2', 'ENG 2 LP valve open (actual)');
  b('sys.fuelToEng1', 'fuel is reaching engine 1');
  b('sys.fuelToEng2', 'fuel is reaching engine 2');
  b('sys.fuelXfeedOpen', 'crossfeed valve open (actual)');
}

export interface FuelState {
  /** left tank has usable fuel */
  leftHasFuel: boolean;
  rightHasFuel: boolean;
  centerHasFuel: boolean;
}

export function updateFuel(d: Dictionary, s: FuelState): void {
  // 1 — valve positions follow the switches
  const xfeed = d.bool('sw.fuelXfeed');
  d.set('sys.fuelXfeedOpen', xfeed);
  d.set('sys.fuelLp1', d.bool('sw.fuelEng1LpValve'));
  d.set('sys.fuelLp2', d.bool('sw.fuelEng2LpValve'));

  // 2 — pressure available on each side
  const leftPressure = s.leftHasFuel && (d.bool('sw.fuelPumpL1') || d.bool('sw.fuelPumpL2'));
  const rightPressure = s.rightHasFuel && (d.bool('sw.fuelPumpR1') || d.bool('sw.fuelPumpR2'));
  const centerPressure = s.centerHasFuel && (d.bool('sw.fuelPumpC1') || d.bool('sw.fuelPumpC2'));

  // 3 — engines draw from their own side, or across the open crossfeed, or from center
  const eng1 = d.bool('sys.fuelLp1') && (leftPressure || (xfeed && rightPressure) || centerPressure);
  const eng2 = d.bool('sys.fuelLp2') && (rightPressure || (xfeed && leftPressure) || centerPressure);

  d.set('sys.fuelToEng1', eng1);
  d.set('sys.fuelToEng2', eng2);
}
