/**
 * Panel tests: hit resolution and actuation semantics.  node --test tests/panel.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Dictionary } from '../src/dictionary.ts';
import { declareAll, tick, type World } from '../src/systems/index.ts';
import { actuate, controlAt, describe, hitTest, NotFound, type Panel } from '../src/panel/controls.ts';
import { overhead, declarePanel } from '../src/panel/overhead.ts';
import { render } from '../src/panel/render.ts';

const ground: World = {
  externalPowerAvailable: true,
  groundAirAvailable: false,
  tanks: { leftHasFuel: true, rightHasFuel: true, centerHasFuel: false },
  ratDeployed: false,
};

function rig() {
  const d = new Dictionary();
  declareAll(d);
  declarePanel(d);
  return d;
}

function click(d: Dictionary, panel: Panel, id: string): void {
  actuate(d, controlAt(panel, id));
}

// ---------------------------------------------------------------- hit testing

test('a point inside a control resolves to it', () => {
  const c = controlAt(overhead, 'bat1');
  assert.equal(hitTest(overhead, c.x + 1, c.y)?.id, 'bat1');
});

test('a point in dead space resolves to nothing', () => {
  assert.equal(hitTest(overhead, 43, 0), undefined);
});

test('an unknown control id throws', () => {
  assert.throws(() => controlAt(overhead, 'nope'), NotFound);
});

test('the later of two overlapping controls wins', () => {
  const panel: Panel = {
    id: 'p',
    title: 'p',
    cols: 10,
    rows: 4,
    controls: [
      { id: 'under', label: 'U', x: 0, y: 0, w: 4, h: 2, form: 'push', var: 'a' },
      { id: 'over', label: 'O', x: 1, y: 0, w: 2, h: 1, form: 'push', var: 'b' },
    ],
  };
  assert.equal(hitTest(panel, 1, 0)?.id, 'over');
  assert.equal(hitTest(panel, 3, 0)?.id, 'under');
});

// ---------------------------------------------------------------- actuation

test('a push button toggles its variable', () => {
  const d = rig();
  click(d, overhead, 'bat1');
  assert.equal(d.bool('sw.bat1'), true);
  click(d, overhead, 'bat1');
  assert.equal(d.bool('sw.bat1'), false);
});

test('a guarded switch needs two presses and clears its guard', () => {
  const d = rig();
  click(d, overhead, 'ext-pwr');
  assert.equal(d.bool('guard.extPwr'), true, 'first press lifts the guard');
  assert.equal(d.bool('sw.extPwr'), false, 'and changes nothing yet');

  click(d, overhead, 'ext-pwr');
  assert.equal(d.bool('sw.extPwr'), true, 'second press acts');
  assert.equal(d.bool('guard.extPwr'), false, 'and the guard drops');
});

test('a selector cycles and wraps', () => {
  const d = rig();
  click(d, overhead, 'eng1-start');
  assert.equal(d.num('sw.eng1Start'), 1);
  click(d, overhead, 'eng1-start');
  assert.equal(d.num('sw.eng1Start'), 0, 'wraps back to the first detent');
});

test('a lamp writes nothing', () => {
  const d = rig();
  const lamp = { ...controlAt(overhead, 'bat1'), form: 'lamp' as const };
  const before = d.bool('sw.bat1');
  actuate(d, lamp);
  assert.equal(d.bool('sw.bat1'), before);
});

test('describe reports the position without changing it', () => {
  const d = rig();
  const c = controlAt(overhead, 'gen1');
  assert.equal(describe(d, c), 'off');
  actuate(d, c);
  assert.equal(describe(d, c), 'on');
});

// ---------------------------------------------------------------- through the model

test('clicking the panel actually powers the aircraft', () => {
  const d = rig();
  click(d, overhead, 'ext-pwr');
  click(d, overhead, 'ext-pwr');
  click(d, overhead, 'bus-tie');
  tick(d, ground, 0.05);
  assert.equal(d.bool('bus.ac1'), true);
  assert.equal(d.bool('bus.dcEss'), true);
});

test('the panel renders control positions and guard state', () => {
  const d = rig();
  const before = render(overhead, d);
  assert.match(before, /BAT 1/);
  assert.match(before, /off/);

  click(d, overhead, 'ext-pwr');
  const lifted = render(overhead, d);
  assert.match(lifted, /\[EXT PWR\]/, 'the guard shows as brackets');
  assert.match(lifted, /guard up/);
});

test('every control binds a variable the model actually declares', () => {
  const d = rig();
  for (const c of overhead.controls) {
    assert.doesNotThrow(() => d.spec(c.var), `${c.id} -> ${c.var}`);
    if (c.guard) assert.doesNotThrow(() => d.spec(c.guard), `${c.id} guard`);
  }
});
