/**
 * ECAM tests: message conditions, ordering, and page content.  node --test tests/ecam.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Dictionary } from '../src/dictionary.ts';
import { declareAll, tick, type World } from '../src/systems/index.ts';
import { active, activeLines, messages } from '../src/ecam/messages.ts';
import { loadPages, page, pages } from '../src/ecam/pages.ts';
import { renderDisplay } from '../src/ecam/render.ts';

const pageSpecs = loadPages();
import { paint, warning, caution, normal } from '../src/ecam/line.ts';

const ground: World = {
  externalPowerAvailable: true,
  groundAirAvailable: false,
  tanks: { leftHasFuel: true, rightHasFuel: true, centerHasFuel: false },
  ratDeployed: false,
};

function rig() {
  const d = new Dictionary();
  declareAll(d);
  return d;
}

function step(d: Dictionary, w: World = ground, n = 1): void {
  for (let i = 0; i < n; i++) tick(d, w, 0.05);
}

/** A powered, pressurised aircraft with both engines turning: nothing should be complaining. */
function healthy(): Dictionary {
  const d = rig();
  d.set('sw.extPwr', true);
  d.set('sw.busTie', true);
  // engines turning: N2 is model state, so seed that rather than the derived running flag
  d.set('eng1.n2', 60);
  d.set('eng2.n2', 60);
  d.set('sw.eng1Master', true);
  d.set('sw.eng2Master', true);
  d.set('sw.fuelPumpL1', true);
  d.set('sw.fuelPumpR1', true);
  d.set('sw.fuelEng1LpValve', true);
  d.set('sw.fuelEng2LpValve', true);
  d.set('sw.hydGreenEng1', true);
  d.set('sw.hydYellowEng2', true);
  d.set('sw.hydBlueEpump', true);
  d.set('sw.pack1', true);
  d.set('sw.pack2', true);
  d.set('sw.eng1Bleed', true);
  d.set('sw.eng2Bleed', true);
  step(d, ground, 3);
  return d;
}

test('a healthy aircraft raises no messages', () => {
  assert.deepEqual(active(healthy()).map((m) => m.id), []);
});

test('losing both AC buses while the essential DC survives is an emergency-config warning', () => {
  const d = rig();
  d.set('sw.bat1', true);
  d.set('sw.bat2', true);
  step(d);
  const ids = active(d).map((m) => m.id);
  assert.ok(ids.includes('elec-emer-config'), `got ${ids.join(',')}`);
  assert.equal(active(d)[0].level, 'warning');
});

test('a master lever on with a dead engine raises ENG FAIL', () => {
  const d = rig();
  d.set('sw.extPwr', true);
  d.set('sw.eng1Master', true);
  step(d);
  assert.ok(active(d).some((m) => m.id === 'eng1-fail'));
});

test('during the start, with the selector in START, ENG FAIL is suppressed', () => {
  const d = rig();
  d.set('sw.extPwr', true);
  d.set('sw.eng1Master', true);
  d.set('sw.eng1Start', 1);
  step(d);
  assert.equal(active(d).some((m) => m.id === 'eng1-fail'), false);
});

test('low blue pressure raises the blue caution', () => {
  const d = rig();
  d.set('sw.extPwr', true);
  step(d);
  assert.ok(active(d).some((m) => m.id === 'hyd-b-lo-pr'));
  assert.equal(active(d).find((m) => m.id === 'hyd-b-lo-pr')?.level, 'caution');
});

test('warnings sort above cautions regardless of declaration order', () => {
  const d = rig();
  d.set('sw.bat1', true);
  d.set('sw.bat2', true);
  d.set('sw.eng2Master', true);
  step(d);
  const levels = active(d).map((m) => m.level);
  const firstCaution = levels.indexOf('caution');
  if (firstCaution !== -1) {
    assert.equal(levels.slice(firstCaution).every((l) => l !== 'warning'), true, `order: ${levels.join(',')}`);
  }
});

test('a message clears when its condition is fixed', () => {
  const d = rig();
  d.set('sw.bat1', true);
  d.set('sw.bat2', true);
  step(d);
  assert.ok(active(d).length > 0);

  d.set('sw.extPwr', true);
  d.set('sw.busTie', true);
  step(d);
  assert.equal(active(d).some((m) => m.id === 'elec-emer-config'), false);
});

test('the elec page reports real voltage when powered and zero when not', () => {
  const d = rig();
  const text = (): string => page('elec')!.lines(d).map((l) => l.text).join('\n');
  assert.match(text(), /VOLT 0/);

  d.set('sw.extPwr', true);
  d.set('sw.busTie', true);
  step(d);
  assert.match(text(), /VOLT 115/);
});

test('the fuel page shows LO PR when a valve is open with no feed', () => {
  const d = rig();
  d.set('sw.fuelEng1LpValve', true);
  const lines = page('fuel')!.lines(d);
  assert.ok(lines.some((l) => l.level === 'caution' && /LO PR/.test(l.text)));
});

test('every page renders and names itself in a title line', () => {
  const d = rig();
  for (const p of pages) {
    const lines = p.lines(d);
    assert.equal(lines[0].level, 'title');
    assert.equal(lines[0].text, p.name);
  }
});

test('an unknown page throws', () => {
  assert.throws(() => renderDisplay(messages, pageSpecs, rig(), 'nope'), /no page/);
});

test('the display puts warnings above the page body', () => {
  const d = rig();
  d.set('sw.bat1', true);
  d.set('sw.bat2', true);
  step(d);
  const out = renderDisplay(messages, pageSpecs, d, 'hyd').split('\n');
  assert.equal(out[0], 'ELEC EMER CONFIG');
  assert.ok(out.indexOf('HYD') > out.indexOf('ELEC EMER CONFIG'));
});

test('paint colours each level and resets after every line', () => {
  const out = paint([warning('w'), caution('c'), normal('n')]);
  assert.match(out, /\u001b\[31mw\u001b\[0m/);
  assert.match(out, /\u001b\[33mc\u001b\[0m/);
  assert.match(out, /\u001b\[37mn\u001b\[0m/);
});

test('activeLines and active agree on a powered aircraft, and lines are blank when dark', () => {
  const d = rig();
  d.set('sw.bat1', true);
  d.set('sw.bat2', true);
  step(d);
  assert.equal(activeLines(d).length, active(d).length);

  const dark = rig();
  step(dark);
  assert.equal(active(dark).length > 0, true, 'the model still knows the systems are down');
  assert.equal(activeLines(dark).length, 0, 'but a dark ECAM shows nothing');
});







