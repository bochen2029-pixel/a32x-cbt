// What the hands do, made into the flight core's inputs: calibration, deadzones, detents, and switches
// that stay where they were put. GPLv3.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apply, calibrated, controlsFromInputs, coreInputs, deadzone, detented, initialControls, moveLever } from '../src/controls.js';

const none = new Set();

test('an off-centre stick still reaches full travel both ways', () => {
  const cal = { min: -0.8, center: 0.1, max: 0.9 };
  assert.equal(calibrated(0.1, cal), 0);
  assert.equal(calibrated(0.9, cal), 1);
  assert.equal(calibrated(-0.8, cal), -1);
  assert.equal(calibrated(2, cal), 1, 'and never past it');
  assert.equal(calibrated(NaN, cal), 0, 'a dead axis reads centre');
});

test('a deadzone swallows the rest position and keeps full travel', () => {
  assert.equal(deadzone(0.04, 0.05), 0);
  assert.equal(deadzone(-1, 0.05), -1);
  assert.ok(Math.abs(deadzone(0.525, 0.05) - 0.5) < 1e-12);
});

test('the thrust lever clicks into IDLE, CL, FLX/MCT and TOGA', () => {
  assert.equal(detented(24), 25);
  assert.equal(detented(36.5), 35);
  assert.equal(detented(44), 45);
  assert.equal(detented(30), 30, 'between detents it stays put');
});

test('a lever driven by a button stops in each detent it reaches', () => {
  assert.equal(moveLever(24, 2), 25, 'stops at CL');
  assert.equal(moveLever(25, 2), 27, 'and leaves it on the next push');
  assert.equal(moveLever(34, -10), 25, 'pulled back through, it stops at CL again');
  assert.equal(moveLever(1, -5), 0, 'never below idle');
});

test('switches toggle on the press, not while held', () => {
  let c = initialControls();
  c = apply(c, {}, new Set(['gear']), new Set(['gear']), 0.02);
  assert.equal(c.gearDown, false, 'gear up');
  c = apply(c, {}, new Set(['gear']), none, 0.02);
  assert.equal(c.gearDown, false, 'held, it stays up');
  c = apply(c, {}, none, new Set(['flapsDown']), 0.02);
  c = apply(c, {}, none, new Set(['flapsDown']), 0.02);
  assert.equal(c.flapLever, 2);
  for (let k = 0; k < 5; ++k) c = apply(c, {}, none, new Set(['flapsDown']), 0.02);
  assert.equal(c.flapLever, 4, 'FULL is the last notch');
});

test('the parking brake holds the aircraft until released; toe brakes work without it', () => {
  let c = initialControls();
  assert.equal(coreInputs(c).brakes, 1, 'a session starts parked');
  c = apply(c, {}, none, new Set(['parkingBrake']), 0.02);
  assert.equal(coreInputs(c).brakes, 0, 'released');
  c = apply(c, { toeBrakes: 0.4 }, none, none, 0.02);
  assert.equal(coreInputs(c).brakes, 0.4, 'toe brakes from an axis');
  c = apply(c, {}, new Set(['brakes']), none, 0.02);
  assert.equal(coreInputs(c).brakes, 1, 'or full from a button');
});

test('the RUD TRIM switch is momentary and its RESET too', () => {
  let c = apply(initialControls(), {}, new Set(['rudderTrimLeft']), new Set(['rudderTrimLeft']), 0.02);
  assert.equal(coreInputs(c).rudder_trim, 1, 'held left: +1, the core sign for left');
  c = apply(c, {}, new Set(['rudderTrimRight']), none, 0.02);
  assert.equal(coreInputs(c).rudder_trim, -1);
  c = apply(c, {}, none, none, 0.02);
  assert.equal(coreInputs(c).rudder_trim, 0, 'released, it springs back');
  c = apply(c, {}, new Set(['rudderTrimReset']), new Set(['rudderTrimReset']), 0.02);
  assert.equal(coreInputs(c).rudder_trim_reset, 1);
});

test('the input slots are the core\'s own names, and both levers move together', () => {
  const inputs = coreInputs(apply(initialControls(), { throttle: 25 / 45 }, none, none, 0.02));
  assert.equal(inputs.tla_1, 25);
  assert.equal(inputs.tla_2, 25);
  for (const name of Object.keys(inputs)) assert.match(name, /^[a-z0-9_]+$/);
});

test('the controls start where the flight core started: an approach keeps its flaps, gear and thrust', () => {
  const names = ['pitch', 'roll', 'pedals', 'tla_1', 'tla_2', 'brakes', 'speedbrake', 'spoilers_armed', 'flap_lever',
                 'gear_down', 'rudder_trim', 'rudder_trim_reset'];
  const index = Object.fromEntries(names.map((n, i) => [n, i]));
  const runway = [0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0];
  assert.deepEqual(controlsFromInputs(runway, index), initialControls(), 'on the runway: parked, idle, flaps up');
  const approach = [0, 0, 0, 7.1, 7.1, 0, 0, 1, 4, 1, 0, 0];
  const c = controlsFromInputs(approach, index);
  assert.deepEqual([c.tla, c.flapLever, c.gearDown, c.spoilersArmed, c.parkingBrake], [7.1, 4, true, true, false]);
  const back = coreInputs(c);
  assert.deepEqual([back.tla_1, back.flap_lever, back.gear_down, back.brakes], [7.1, 4, 1, 0],
                   'and handed back to the core unchanged until the hands move them');
});
