/**
 * The message set as data: shape, references, and coverage.  node --test tests/messages.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Dictionary } from '../src/dictionary.ts';
import { declareAll, tick } from '../src/systems/index.ts';
import { parseMessages, varsOf, evaluate, linesOf, ecamPowered } from '../src/ecam/warnings.ts';
import { messages, loadMessages } from '../src/ecam/messages.ts';

function rig() {
  const d = new Dictionary();
  declareAll(d);
  return d;
}

test('every message in the file parses', () => {
  assert.ok(messages.length >= 10);
  for (const m of messages) {
    assert.match(m.id, /^[a-z0-9-]+$/, m.id);
    assert.ok(m.text.length > 2);
    assert.match(m.chapter, /^\d{2}-\d{2}$/, `${m.id} chapter ${m.chapter}`);
  }
});

test('every variable a message reads is declared by the model', () => {
  const d = rig();
  for (const m of messages) {
    for (const v of varsOf(m.when)) assert.doesNotThrow(() => d.spec(v), `${m.id} -> ${v}`);
  }
});

test('message ids are unique', () => {
  assert.equal(new Set(messages.map((m) => m.id)).size, messages.length);
});

test('a malformed message is refused at parse time, not silently skipped', () => {
  assert.throws(() => parseMessages([{ id: 'x', level: 'caution', text: 'X', when: { var: 'a' } }]), /chapter/);
  assert.throws(() => parseMessages([{ id: 'x', level: 'alarm', text: 'X', when: { var: 'a' }, chapter: '00-00' }]), /level/);
  assert.throws(() => parseMessages({}), /array/);
});

test('an unreadable condition throws rather than reading as false', () => {
  const d = rig();
  const [bad] = parseMessages([{ id: 'b', level: 'caution', text: 'B', when: { nonsense: 1 }, chapter: '00-00' }]);
  assert.throws(() => varsOf(bad.when), /unreadable/);
  assert.throws(() => evaluate(bad.when, d), /unreadable/);
});

test('the condition combinators behave', () => {
  const d = rig();
  d.declare({ name: 'a', kind: 'bool' });
  d.declare({ name: 'n', kind: 'int', min: 0, max: 10 });
  d.set('a', true);
  assert.equal(evaluate({ var: 'a' }, d), true);
  assert.equal(evaluate({ not: { var: 'a' } }, d), false);
  assert.equal(evaluate({ all: [{ var: 'a' }, { var: 'a' }] }, d), true);
  assert.equal(evaluate({ any: [{ not: { var: 'a' } }, { var: 'a' }] }, d), true);
  assert.equal(evaluate({ eq: { var: 'a', value: true } }, d), true);
  d.set('n', 5);
  assert.equal(evaluate({ lt: { var: 'n', value: 6 } }, d), true);
  assert.equal(evaluate({ gt: { var: 'n', value: 6 } }, d), false);
});

test('a dark aircraft shows no messages, a battery-powered one does', () => {
  const d = rig();
  assert.equal(ecamPowered(d), false);
  assert.deepEqual(linesOf(messages, d), [], 'nothing is displayed without DC');

  d.set('sw.bat1', true);
  d.set('sw.bat2', true);
  const dc = rig();
  dc.set('sw.bat1', true);
  dc.set('sw.bat2', true);
  for (let i = 0; i < 3; i++) tick(dc, { externalPowerAvailable: false, groundAirAvailable: false, pressureAltitudeFt: 0, tanks: { leftHasFuel: true, rightHasFuel: true, centerHasFuel: false }, ratDeployed: false }, 0.05);
  assert.equal(ecamPowered(dc), true);
  assert.ok(linesOf(messages, dc).length > 0, 'an unpressurised aircraft says so');
});

test('the file on disk is what the code reads', () => {
  assert.deepEqual(
    loadMessages().map((m) => m.id),
    messages.map((m) => m.id),
  );
});




