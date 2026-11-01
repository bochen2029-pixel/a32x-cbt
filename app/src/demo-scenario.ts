/**
 * Save a scenario, load it into a fresh aircraft, prove it resumes.
 *
 *   node src/demo-scenario.ts
 *
 * Writes `situations/apu-ready.situ` next to the source tree (the directory is created on demand)
 * and reads it back. The point is not that the values match — the tests hold that — but that a
 * trainee can be dropped into an aircraft someone else prepared.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { Dictionary } from './dictionary.ts';
import { declareAll, tick, type World } from './systems/index.ts';
import { load, save } from './scenario/situation.ts';
import { messages } from '../src/ecam/messages.ts';
import { loadPages } from '../src/ecam/pages.ts';
import { renderDisplay } from './ecam/render.ts';

const pageSpecs = loadPages();

const world: World = {
  externalPowerAvailable: false,
  groundAirAvailable: false,
  tanks: { leftHasFuel: true, rightHasFuel: true, centerHasFuel: false },
  ratDeployed: false,
};

const air = new Dictionary();
declareAll(air);

// prepare: batteries, APU running, one engine at idle on its own generator
air.set('sw.bat1', true);
air.set('sw.bat2', true);
air.set('sw.apuMaster', true);
air.set('sw.apuStart', true);
for (let i = 0; i < 700; i++) tick(air, world, 0.05); // APU to available
air.set('sw.apuGen', true);
air.set('sw.busTie', true);
air.set('sw.apuBleed', true);
air.set('sw.fuelPumpL1', true);
air.set('sw.fuelEng1LpValve', true);

// crank on APU bleed until the engine is turning fast enough to take fuel, then master on
air.set('sw.eng1Start', 1);
for (let i = 0; i < 2000 && air.num('eng1.n2') < 17; i++) tick(air, world, 0.05);
air.set('sw.eng1Master', true);
for (let i = 0; i < 2000 && !air.bool('sys.eng1Running'); i++) tick(air, world, 0.05);
air.set('sw.gen1', true);
air.set('sw.hydGreenEng1', true);
for (let i = 0; i < 40; i++) tick(air, world, 0.05);

const dir = join(process.cwd(), 'situations');
mkdirSync(dir, { recursive: true });
const path = join(dir, 'apu-ready.situ');
writeFileSync(path, save(air, 'APU available, ENG 1 at idle on its own generator'), 'utf8');

console.log(`saved ${path}`);
console.log(`  ${air.names().length} variables, ${air.num('eng1.n2').toFixed(1)} % N2, ${air.num('hyd.green').toFixed(0)} psi GREEN`);

// a second trainee opens it
const resumed = new Dictionary();
declareAll(resumed);
const description = load(resumed, save(air, 'reloaded'));
console.log(`\nloaded: "${description}"`);
console.log(`  ${resumed.num('eng1.n2').toFixed(1)} % N2, ${resumed.num('hyd.green').toFixed(0)} psi GREEN, AC1 ${resumed.bool('bus.ac1')}`);

console.log('\nECAM on resume:');
console.log(renderDisplay(messages, pageSpecs, resumed, 'elec'));




