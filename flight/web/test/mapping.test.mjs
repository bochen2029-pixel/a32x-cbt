// A device's mapping: the defaults, the wizard that learns one from the pilot's hands, calibration.
// GPLv3.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calibrate, learn, readAxes, readButtons, standardGamepad, startLearning, STEPS } from '../src/mapping.js';

const pad = (axes, pressed = []) => ({ axes, buttons: Array.from({ length: 16 }, (_, i) => pressed.includes(i)) });
const none = { confirm: false, skip: false };

test('a standard gamepad flies out of the box: left stick, right stick for the rudder', () => {
  const m = standardGamepad();
  const a = readAxes(m, pad([0.5, 1, 1, 0]));
  assert.equal(a.pitch, 1, 'left stick back pulls');
  assert.ok(Math.abs(a.roll - (0.5 - 0.04) / 0.96) < 1e-12, 'left stick right rolls right');
  assert.equal(a.pedals, -1, 'right stick right is right rudder, the core\'s minus');
  assert.ok(readButtons(m, pad([0, 0, 0, 0], [3])).has('gear'));
});

test('the wizard learns a joystick from the hands, and skips what it does not have', () => {
  let s = startLearning();
  const rest = [0, 0.02, -1, 0, 0];  // axis 2 is a throttle sitting at idle
  s = learn(s, pad(rest), [], none);
  assert.equal(s.step, 0, 'nothing pressed: still waiting');
  s = learn(s, pad(rest), [], { confirm: true, skip: false });
  assert.equal(s.step, 1, 'centres taken');
  s = learn(s, pad([0, -0.97, -1, 0, 0]), [0], none);  // stick back reads negative on this one
  assert.deepEqual([s.mapping.axes.pitch.index, s.mapping.axes.pitch.invert], [1, true]);
  s = learn(s, pad([0.1, 0, -1, 0, 0]), [0], none);
  assert.equal(s.step, 2, 'a roll that barely moved is not taken');
  assert.match(s.note, /no axis moved far enough/);
  s = learn(s, pad([0.98, 0, -1, 0, 0]), [0], none);
  assert.deepEqual([s.mapping.axes.roll.index, s.mapping.axes.roll.invert], [0, false]);
  s = learn(s, pad(rest), [], { confirm: false, skip: true });
  assert.equal(s.mapping.axes.pedals, undefined, 'no rudder axis: skipped');
  s = learn(s, pad([0, 0, 1, 0, 0]), [], { confirm: true, skip: false });  // thrust levers forward: +1
  assert.deepEqual([s.mapping.axes.throttle.index, s.mapping.axes.throttle.invert], [2, false]);
  s = learn(s, pad(rest), [], { confirm: false, skip: true });  // no toe brakes
  s = learn(s, pad(rest, [5]), [5], none);
  assert.equal(s.mapping.buttons.brakes, 5, 'the first button pressed is the one');
  while (!s.done) s = learn(s, pad(rest), [], { confirm: false, skip: true });
  assert.equal(s.step, STEPS.length);

  const a = readAxes(s.mapping, pad([0, -1, 1, 0, 0]));
  assert.equal(a.pitch, 1, 'learned: back is a pull');
  assert.equal(a.throttle, 1, 'learned: forward is TOGA');
  assert.equal(readAxes(s.mapping, pad([0, 0, -1, 0, 0])).throttle, 0, 'and back is idle');
});

test('calibration takes the ends each axis reached and the centre it rested at', () => {
  const m = calibrate(standardGamepad(), [0.1, -0.05, 0, 0], [-0.8, -0.9, -1, -1], [0.9, 0.95, 1, 1]);
  assert.deepEqual(m.axes.roll.cal, { min: -0.8, center: 0.1, max: 0.9 });
  assert.equal(readAxes(m, pad([0.9, -0.05, 0, 0])).roll, 1, 'its own end is full travel');
  assert.equal(readAxes(m, pad([0.1, -0.05, 0, 0])).roll, 0, 'its own rest is centre');
});
