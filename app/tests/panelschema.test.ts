/**
 * Panel schema: what a valid panel file is, and what a bad one must be refused for.
 *   node --test tests/panelschema.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Dictionary } from '../src/dictionary.ts';
import { declareAll } from '../src/systems/index.ts';
import { checkPanel, panelVars, parsePanel } from '../src/panel/schema.ts';
import { overhead } from '../src/panel/overhead.ts';

const minimal = (over: Record<string, unknown> = {}) => ({
  id: 'p',
  title: 'P',
  cols: 20,
  rows: 4,
  controls: [{ id: 'a', label: 'A', x: 1, y: 1, w: 5, h: 1, form: 'push', var: 'sw.bat1' }],
  ...over,
});

test('the shipped panel parses and names itself', () => {
  assert.equal(overhead.id, 'overhead');
  assert.ok(overhead.controls.length >= 30, `${overhead.controls.length} controls`);
});

test('a control outside the grid is refused', () => {
  assert.throws(() => parsePanel(minimal({ cols: 4 })), /past 4 columns/);
  assert.throws(() => parsePanel(minimal({ rows: 1 })), /past 1 rows/);
});

test('duplicate ids and missing fields are refused', () => {
  const c = { id: 'a', label: 'A', x: 1, y: 1, w: 5, h: 1, form: 'push', var: 'sw.bat1' };
  assert.throws(() => parsePanel(minimal({ controls: [c, c] })), /duplicate id/);
  assert.throws(() => parsePanel(minimal({ controls: [{ ...c, id: '' }] })), /id required/);
  assert.throws(() => parsePanel(minimal({ controls: [{ ...c, var: '' }] })), /var required/);
});

test('an unknown form is refused', () => {
  assert.throws(
    () => parsePanel(minimal({ controls: [{ id: 'a', label: 'A', x: 1, y: 1, w: 5, h: 1, form: 'knob', var: 'x' }] })),
    /form must be one of/,
  );
});

test('a guarded control without a guard variable is refused', () => {
  assert.throws(
    () => parsePanel(minimal({ controls: [{ id: 'a', label: 'A', x: 1, y: 1, w: 5, h: 1, form: 'guarded', var: 'x' }] })),
    /needs a guard variable/,
  );
});

test('a selector needs detents, and a table that matches them', () => {
  const base = { id: 'a', label: 'A', x: 1, y: 1, w: 5, h: 1, form: 'selector', var: 'x' };
  assert.throws(() => parsePanel(minimal({ controls: [base] })), /positions/);
  assert.throws(
    () => parsePanel(minimal({ controls: [{ ...base, positions: 3, table: [0, 50] }] })),
    /table must match positions/,
  );
  assert.throws(
    () => parsePanel(minimal({ controls: [{ ...base, positions: 2, table: [5, 5] }] })),
    /duplicate detents/,
  );
  assert.doesNotThrow(() => parsePanel(minimal({ controls: [{ ...base, positions: 2, table: [0, 100] }] })));
});

test('every variable the shipped panel binds exists in the model', () => {
  const d = new Dictionary();
  declareAll(d);
  // guards are declared by the panel itself, so check the switches against the model
  const switchVars = overhead.controls.map((c) => c.var);
  const missing = switchVars.filter((v) => {
    try {
      d.spec(v);
      return false;
    } catch {
      return true;
    }
  });
  assert.deepEqual(missing, []);
});

test('checkPanel catches an undeclared binding', () => {
  const d = new Dictionary();
  declareAll(d);
  const p = parsePanel(minimal({ controls: [{ id: 'a', label: 'A', x: 1, y: 1, w: 5, h: 1, form: 'push', var: 'sw.nope' }] }));
  assert.throws(() => checkPanel(p, d), /undeclared variables sw\.nope/);
});

test('panelVars lists switches and guards', () => {
  const p = parsePanel(
    minimal({
      controls: [
        { id: 'a', label: 'A', x: 1, y: 1, w: 5, h: 1, form: 'guarded', var: 'sw.bat1', guard: 'guard.a' },
      ],
    }),
  );
  assert.deepEqual(panelVars(p), ['sw.bat1', 'guard.a']);
});
