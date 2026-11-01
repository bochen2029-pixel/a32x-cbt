// The mouse on the view: the head follows a drag on the flight deck, within a pilot's reach; the orbit
// camera swings and comes closer within its limits; the pilot's eye is never turned. GPLv3.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { centre, drag, wheel } from '../src/pointer.js';

const fresh = (mode) => ({ mode, look: { yaw: 0, pitch: -10 }, orbit: { yaw: 2.4, pitch: 0.14, dist: 80 }, zoom: 1 });

test('on the flight deck the head follows the mouse, as far as a seated pilot turns', () => {
  const v = fresh('cockpit');
  drag(v, 100, 0);
  assert.equal(v.look.yaw, -20, 'right: three.js turns a camera left for a positive yaw');
  drag(v, 0, -100);
  assert.equal(v.look.pitch, 10, 'up');
  drag(v, 5000, 5000);
  assert.deepEqual(v.look, { yaw: -150, pitch: -60 });
  assert.deepEqual(v.orbit, fresh('cockpit').orbit, 'the orbit is not moved from the deck');
});

test('the orbit camera swings round the aircraft and comes closer, within its limits', () => {
  const v = fresh('orbit');
  drag(v, 100, 50);
  assert.ok(Math.abs(v.orbit.yaw - 1.8) < 1e-12 && Math.abs(v.orbit.pitch - 0.44) < 1e-12);
  drag(v, 0, 1e6);
  assert.equal(v.orbit.pitch, 1.45, 'not past looking straight down');
  wheel(v, -1000);
  assert.ok(v.orbit.dist < 80 && v.orbit.dist > 15, 'the wheel away brings it closer');
  wheel(v, 1e6);
  assert.equal(v.orbit.dist, 4000);
  assert.equal(v.zoom, 1, 'and does not zoom');
});

test('the pilot\'s eye is the airframe\'s own: a drag never turns it; the wheel zooms other cameras', () => {
  const v = fresh('eye');
  drag(v, 300, 300);
  assert.deepEqual(v, fresh('eye'));
  const chase = fresh('chase');
  wheel(chase, -1e6);
  assert.equal(chase.zoom, 8);
  centre(chase);
  assert.equal(chase.zoom, 1);
});
