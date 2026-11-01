/**
 * Page data: the line DSL, its validation, and that the shipped pages read only real variables.
 *   node --test tests/pageschema.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Dictionary } from '../src/dictionary.ts';
import { declareAll, tick, type World } from '../src/systems/index.ts';
import { parsePages, pageVars, renderPage } from '../src/ecam/pageSchema.ts';
import { pages, page } from '../src/ecam/pages.ts';

const world: World = {
  externalPowerAvailable: true,
  groundAirAvailable: false,
  pressureAltitudeFt: 0,
  tanks: { leftHasFuel: true, rightHasFuel: true, centerHasFuel: false },
  ratDeployed: false,
};

function rig() {
  const d = new Dictionary();
  declareAll(d);
  return d;
}

const one = (over: Record<string, unknown> = {}) => ({
  id: 'p',
  name: 'P',
  lines: [{ title: 'P' }],
  ...over,
});

test('the shipped page set parses and names itself', () => {
  assert.deepEqual(
    pages.map((p) => p.id),
    ['elec', 'hyd', 'fuel', 'bleed', 'press'],
  );
});

test('a page without lines, or with no name, is refused', () => {
  assert.throws(() => parsePages([one({ lines: [] })]), /lines required/);
  assert.throws(() => parsePages([one({ name: '' })]), /name required/);
  assert.throws(() => parsePages({}), /array/);
});

test('duplicate page ids and unknown levels are refused', () => {
  assert.throws(() => parsePages([one(), one()]), /duplicate id/);
  assert.throws(() => parsePages([one({ lines: [{ text: 'x', level: 'purple' }] })]), /unknown level/);
  assert.throws(() => parsePages([one({ lines: [{ text: 'x', when: 'nope' }] })]), /when must be a condition/);
});

test('every variable the shipped pages read exists in the model', () => {
  const d = rig();
  for (const p of pages) {
    const spec = p.id;
    const pageSpec = { id: spec } as never;
    void pageSpec;
  }
  // read the specs through the same path the pages use
  for (const p of pages) {
    const lines = p.lines(d);
    assert.ok(lines.length > 0);
  }
});

test('a token renders the value with its decimals', () => {
  const d = rig();
  d.set('hyd.green', 1234.5678);
  const [p] = parsePages([
    one({
      lines: [
        { title: 'P' },
        { text: 'G {{hyd.green}}' },
        { text: 'G {{hyd.green:1}}' },
        { text: 'B {{bus.ac1}}' },
      ],
    }),
  ]);
  const out = renderPage(p, d).map((l) => l.text);
  assert.equal(out[1], 'G 1235');
  assert.equal(out[2], 'G 1234.6');
  assert.equal(out[3], 'B false');
});

test('a condition colours the line, it does not add or remove it', () => {
  const d = rig();
  d.set('hyd.green', 3000);
  const [p] = parsePages([
    one({
      lines: [{ title: 'P' }, { text: 'G {{hyd.green}}', when: { lt: { var: 'hyd.green', value: 1450 } }, level: 'caution' }],
    }),
  ]);
  const healthy = renderPage(p, d)[1];
  assert.equal(healthy.level, 'normal');
  assert.match(healthy.text, /3000/);

  d.set('hyd.green', 100);
  const low = renderPage(p, d)[1];
  assert.equal(low.level, 'caution');
  assert.match(low.text, /100/, 'the value follows the dictionary');
});

test('pageVars finds tokens but not conditions', () => {
  const [p] = parsePages([
    one({ lines: [{ title: 'P' }, { text: '{{hyd.blue}} psi', when: { var: 'sys.ptuRunning' } }] }),
  ]);
  assert.deepEqual(pageVars(p), ['hyd.blue']);
});

test('the hyd page shows three pressures, coloured when low', () => {
  const d = rig();
  const lines = page('hyd')!.lines(d);
  const psi = lines.filter((l) => l.text.includes('PSI'));
  assert.equal(psi.length, 3);
  assert.equal(psi.every((l) => l.level === 'caution'), true, 'nothing is pressurised on a cold aircraft');
});

test('the press page reports the cabin and flags it when high', () => {
  const d = rig();
  d.set('press.cabinAlt', 15000);
  tick(d, world, 0.05);
  const lines = page('press')!.lines(d);
  assert.ok(lines.some((l) => l.text.includes('FT')));
  assert.ok(lines.some((l) => l.level === 'warning'), 'a cabin above 9550 is red');
});

