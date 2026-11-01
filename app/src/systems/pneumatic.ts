/**
 * Pneumatic — bleed sources, crossbleed, packs.
 *
 * The A320 lesson this models: bleed 1 normally comes from engine 1, bleed 2 from engine 2, and
 * the crossbleed valve is what lets one side start the other or run both packs alone. The APU
 * and ground air are separate sources feeding the same duct.
 */

import type { Dictionary } from '../dictionary.ts';

export interface BleedInputs {
  eng1Running: boolean;
  eng2Running: boolean;
  apuRunning: boolean;
  /** ground cart connected */
  groundAirAvailable: boolean;
}

export function declareBleed(d: Dictionary): void {
  const b = (name: string, note: string) => d.declare({ name, kind: 'bool', note });

  b('sw.eng1Bleed', 'ENG BLEED 1 pushbutton');
  b('sw.eng2Bleed', 'ENG BLEED 2 pushbutton');
  b('sw.apuBleed', 'APU BLEED pushbutton');
  b('sw.xbleed', 'crossbleed valve open');
  b('sw.pack1', 'PACK 1 pushbutton');
  b('sw.pack2', 'PACK 2 pushbutton');

  b('sys.bleedSrc1', 'bleed 1 supplying the duct');
  b('sys.bleedSrc2', 'bleed 2 supplying the duct');
  b('sys.bleedApu', 'APU supplying the duct');
  b('sys.bleedDuctL', 'left duct pressurised');
  b('sys.bleedDuctR', 'right duct pressurised');
  b('sys.pack1Running', 'PACK 1 running');
  b('sys.pack2Running', 'PACK 2 running');
}

export function updateBleed(d: Dictionary, i: BleedInputs): void {
  // 1 — sources
  const src1 = d.bool('sw.eng1Bleed') && i.eng1Running && !d.bool('fault.bleed1');
  const src2 = d.bool('sw.eng2Bleed') && i.eng2Running;
  const apu = d.bool('sw.apuBleed') && i.apuRunning;
  d.set('sys.bleedSrc1', src1);
  d.set('sys.bleedSrc2', src2);
  d.set('sys.bleedApu', apu);

  // 2 — duct. APU and ground air feed the left duct, which is the A320 arrangement.
  const xbleed = d.bool('sw.xbleed');
  const leftFeed = src1 || apu || i.groundAirAvailable;
  const rightFeed = src2;
  const ductL = leftFeed || (xbleed && rightFeed);
  const ductR = rightFeed || (xbleed && leftFeed);
  d.set('sys.bleedDuctL', ductL);
  d.set('sys.bleedDuctR', ductR);

  // 3 — packs downstream of their own duct
  d.set('sys.pack1Running', d.bool('sw.pack1') && ductL && !d.bool('fault.pack1'));
  d.set('sys.pack2Running', d.bool('sw.pack2') && ductR && !d.bool('fault.pack2'));
}

