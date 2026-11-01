// Reverse thrust as the view shows it: each engine's REV amber while its doors move and green once they are open,
// nothing while stowed or where a core has no reverser slots; and a door's angle that follows the reverser from flush
// to fully open and no further. GPLv3.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOOR_OPEN_DEG, doorAngle, reversers, reverserState } from '../src/reverse.js';

test('a reverser shows no light stowed, amber in transit and green deployed, as the engine display has it', () => {
  assert.equal(reverserState(0), 'stowed');
  assert.equal(reverserState(0.0005), 'stowed');
  assert.equal(reverserState(0.3), 'transit');
  assert.equal(reverserState(0.998), 'transit');
  assert.equal(reverserState(1), 'deployed');
  assert.equal(reverserState(undefined), 'stowed', 'a core without the slot');
  assert.equal(reverserState(NaN), 'stowed');
});

test('the lights are per engine, engine 1 first, and only for reversers that are out', () => {
  assert.deepEqual(reversers({ reverser_1: 0, reverser_2: 0 }), []);
  assert.deepEqual(reversers({ reverser_1: 1, reverser_2: 0.4 }), [{ engine: 1, state: 'deployed' }, { engine: 2, state: 'transit' }]);
  assert.deepEqual(reversers({ reverser_1: 0, reverser_2: 1 }), [{ engine: 2, state: 'deployed' }], 'one reverser out');
  assert.deepEqual(reversers({}), [], 'a core older than the reversers');
});

test('a door follows its reverser from flush to fully open, and no further', () => {
  const deg = (v) => (doorAngle(v) * 180) / Math.PI;
  assert.equal(deg(0), 0);
  assert.ok(Math.abs(deg(0.5) - DOOR_OPEN_DEG / 2) < 1e-9);
  assert.ok(Math.abs(deg(1) - DOOR_OPEN_DEG) < 1e-9);
  assert.equal(deg(1.5), DOOR_OPEN_DEG, 'never past fully open');
  assert.equal(deg(-0.2), 0, 'never into the cowl');
  assert.equal(deg(undefined), 0);
});
