/**
 * The display, driven by state.
 *
 *   node src/demo-ecam.ts
 *
 * Cold & dark, then powered, then both AC buses lost while the batteries hold the DC network. The
 * display is generated from the dictionary each time, never stored.
 */

import { Dictionary } from './dictionary.ts';
import { declareAll, tick, type World } from './systems/index.ts';
import { messages } from '../src/ecam/messages.ts';
import { loadPages } from '../src/ecam/pages.ts';
import { renderDisplay } from './ecam/render.ts';

const pageSpecs = loadPages();
import { active } from './ecam/messages.ts';

const world: World = {
  externalPowerAvailable: true,
  groundAirAvailable: false,
  tanks: { leftHasFuel: true, rightHasFuel: true, centerHasFuel: false },
  ratDeployed: false,
};

const d = new Dictionary();
declareAll(d);
const step = (n = 1): void => {
  for (let i = 0; i < n; i++) tick(d, world, 0.05);
};

console.log('--- cold & dark');
step();
console.log(renderDisplay(messages, pageSpecs, d, 'elec'));

console.log('\n--- ground power on, bus tie closed');
d.set('sw.extPwr', true);
d.set('sw.busTie', true);
step(5);
console.log(renderDisplay(messages, pageSpecs, d, 'elec'));

console.log('\n--- hydraulics not yet running');
console.log(renderDisplay(messages, pageSpecs, d, 'hyd'));

console.log('\n--- ground power pulled, batteries only');
d.set('sw.bat1', true);
d.set('sw.bat2', true);
d.set('sw.extPwr', false);
step(5);
console.log(renderDisplay(messages, pageSpecs, d, 'elec'));
console.log(`\nactive messages: ${active(d).map((m) => m.id).join(', ')}`);




