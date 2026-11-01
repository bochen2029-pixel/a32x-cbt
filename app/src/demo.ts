/**
 * B1 smoke run: cold & dark to powered, driven by the fixed clock.
 *
 *   node src/demo.ts
 *
 * The smallest honest slice of the CBT loop: a dictionary, a 20 Hz clock, and one system that
 * publishes bus states. The frame loop here mimics the browser (a callback every 50 ms) rather
 * than advancing time in one lump — which is also why the clock's catch-up limit never bites.
 */

import { Dictionary } from './dictionary.ts';
import { Clock } from './clock.ts';
import { declareElec, updateElec, type ElecInputs } from './systems/elec.ts';

const d = new Dictionary();
declareElec(d);
const clock = new Clock(20);

const world: ElecInputs = {
  eng1Running: false,
  eng2Running: false,
  apuRunning: false,
  externalPowerAvailable: true,
};

const BUSES = ['bus.ac1', 'bus.ac2', 'bus.acEss', 'bus.dc1', 'bus.dc2', 'bus.dcBat', 'bus.dcEss', 'bus.hotBat'];
const HEAD = ['AC1', 'AC2', 'ACE', 'DC1', 'DC2', 'DCB', 'DCE', 'HOT'];

/** Drive the model for `seconds` of wall time in 50 ms frames, as the browser would. */
function run(seconds: number): void {
  const frames = Math.round((seconds * 1000) / 50);
  for (let f = 0; f < frames; f++) clock.run(50, () => updateElec(d, world));
}

function line(label: string): void {
  const cells = BUSES.map((b) => (d.bool(b) ? ' ON' : ' --'));
  console.log(`${label.padEnd(22)}${cells.join('')}`);
}

console.log(`${'state'.padEnd(22)}${HEAD.join('')}`);

run(0.05); // let the first tick settle before printing
line('cold & dark');

d.set('sw.extPwr', true);
d.set('sw.busTie', true);
run(1);
line('ext pwr on');

world.apuRunning = true;
d.set('sw.apuGen', true);
run(5);
line('apu gen on, tie open');
d.set('sw.busTie', false);
run(1);
line('  ...tie opened');

world.eng2Running = true;
d.set('sw.gen2', true);
d.set('sw.extPwr', false);
run(5);
line('gen 2, ext off');

world.eng1Running = true;
d.set('sw.gen1', true);
d.set('sw.apuGen', false);
run(5);
line('both gens');

console.log(
  `\nsimulated ${clock.elapsed.toFixed(2)} s in ${clock.stepCount} fixed steps of ${clock.dt.toFixed(3)} s; ` +
    `${d.drain().length} variables changed at end`,
);

