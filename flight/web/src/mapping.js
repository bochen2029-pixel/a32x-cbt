// A device's mapping: which axis and which button does what, how each axis is calibrated, and the
// wizard that learns it from the pilot's own hands. No browser in here, so node tests it. GPLv3.
//
// A mapping: {axes: {pitch, roll, pedals, throttle, toeBrakes}, buttons: {action: buttonIndex}}, where
// an axis is {index, invert, deadzone, cal: {min, center, max}}. A snapshot of a device: {axes: [raw],
// buttons: [bool]}.

import { calibrated, deadzone } from './controls.js';

const STICK_DEADZONE = 0.04;

// What a standard-mapping gamepad does out of the box: the left stick flies, the right stick's
// x axis is the rudder, the shoulders drive the thrust levers, the triggers move the flap lever, and
// D-pad up held lifts the reverse latches.
export function standardGamepad() {
  const axis = (index, invert = false) => ({ index, invert, deadzone: STICK_DEADZONE, cal: { min: -1, center: 0, max: 1 } });
  return {
    axes: { pitch: axis(1), roll: axis(0), pedals: axis(2, true) },
    buttons: {
      brakes: 0, speedbrake: 1, spoilersArm: 2, gear: 3, thrustDown: 4, thrustUp: 5, flapsUp: 6, flapsDown: 7,
      parkingBrake: 8, takeover: 9, reverse: 12, rudderTrimReset: 13, rudderTrimLeft: 14, rudderTrimRight: 15,
    },
  };
}

// Anything else — a joystick, pedals — gets the two axes nearly every stick puts first, and is asked
// to be mapped.
export function unknownDevice() {
  const axis = (index) => ({ index, invert: false, deadzone: STICK_DEADZONE, cal: { min: -1, center: 0, max: 1 } });
  return { axes: { pitch: axis(1), roll: axis(0) }, buttons: {} };
}

// One device's axes in the core's ranges: stick and pedals -1..1, throttle and toe brakes 0..1.
export function readAxes(mapping, snapshot) {
  const out = {};
  for (const [name, a] of Object.entries(mapping.axes)) {
    const raw = snapshot.axes[a.index];
    if (raw === undefined) continue;
    let v = calibrated(raw, a.cal);
    if (a.invert) v = -v;
    out[name] = name === 'throttle' || name === 'toeBrakes' ? (v + 1) / 2 : deadzone(v, a.deadzone ?? STICK_DEADZONE);
  }
  return out;
}

// The actions whose buttons are down.
export function readButtons(mapping, snapshot) {
  const held = new Set();
  for (const [action, index] of Object.entries(mapping.buttons)) if (snapshot.buttons[index]) held.add(action);
  return held;
}

// The wizard: the pilot is asked for each control in turn. An axis step is answered by holding the
// control at the stated end and confirming (any button, or Enter); a button step by pressing the
// button wanted. Any step but the first two may be skipped (Escape).
export const STEPS = [
  { kind: 'centre', ask: 'centre the stick, pedals and twist, then press any button or Enter' },
  { kind: 'axis', name: 'pitch', ask: 'hold the stick fully BACK, then press any button or Enter' },
  { kind: 'axis', name: 'roll', ask: 'hold the stick fully RIGHT, then press any button or Enter' },
  { kind: 'axis', name: 'pedals', ask: 'hold full LEFT rudder (pedals or twist), then press any button — Escape skips' },
  { kind: 'axis', name: 'throttle', ask: 'thrust levers fully FORWARD, then press any button — Escape skips' },
  { kind: 'axis', name: 'toeBrakes', ask: 'press the toe brakes fully, then press any button — Escape skips' },
  ...[
    ['brakes', 'brakes (held)'], ['parkingBrake', 'parking brake'], ['speedbrake', 'speedbrake'],
    ['spoilersArm', 'ground spoilers arm'], ['flapsUp', 'flaps up one notch'], ['flapsDown', 'flaps down one notch'],
    ['gear', 'gear lever'], ['thrustUp', 'thrust levers forward (held)'], ['thrustDown', 'thrust levers back (held)'],
    ['reverse', 'the reverse latches (held), to pull the levers into reverse'],
    ['rudderTrimLeft', 'RUD TRIM left (held)'], ['rudderTrimRight', 'RUD TRIM right (held)'],
    ['rudderTrimReset', 'RUD TRIM RESET'], ['takeover', 'sidestick takeover pushbutton'],
  ].map(([name, what]) => ({ kind: 'button', name, ask: `press the button for: ${what} — Escape skips` })),
];

export function startLearning() {
  return { step: 0, centres: null, mapping: { axes: {}, buttons: {} }, done: false, note: '' };
}

// One frame of the wizard. snapshot: the device now; pressedButtons: indices that went down this frame;
// keys: {confirm, skip} pressed this frame. Returns the next state; state.done when the last step is
// answered.
export function learn(state, snapshot, pressedButtons, keys) {
  if (state.done) return state;
  const step = STEPS[state.step];
  const next = { ...state, mapping: { axes: { ...state.mapping.axes }, buttons: { ...state.mapping.buttons } }, note: '' };
  const advance = () => {
    next.step += 1;
    next.done = next.step >= STEPS.length;
    return next;
  };
  const confirmed = keys.confirm || pressedButtons.length > 0;
  if (keys.skip && state.step >= 3) return advance();

  if (step.kind === 'centre') {
    if (!confirmed) return state;
    next.centres = snapshot.axes.slice();
    return advance();
  }
  if (step.kind === 'axis') {
    if (!confirmed) return state;
    const taken = new Set(Object.values(next.mapping.axes).map((a) => a.index));
    let best = -1, travel = 0;
    snapshot.axes.forEach((v, i) => {
      const d = Math.abs(v - (state.centres[i] ?? 0));
      if (!taken.has(i) && d > travel) {
        best = i;
        travel = d;
      }
    });
    if (best < 0 || travel < 0.5) {
      next.note = 'no axis moved far enough: hold the control at its end and try again';
      return next;
    }
    const value = snapshot.axes[best];
    const centre = state.centres[best] ?? 0;
    // Each step names the end that should read +1 (or 1, for the throttle and toe brakes).
    const stick = step.name === 'pitch' || step.name === 'roll' || step.name === 'pedals';
    next.mapping.axes[step.name] = {
      index: best,
      invert: value < centre,
      deadzone: STICK_DEADZONE,
      cal: stick ? { min: -1, center: centre, max: 1 } : { min: -1, center: 0, max: 1 },
    };
    return advance();
  }
  // a button step: the first button pressed is the one
  if (pressedButtons.length === 0) return state;
  next.mapping.buttons[step.name] = pressedButtons[0];
  return advance();
}

// Calibration: the extremes each axis reached while the pilot stirred every control, the centre where
// it rested at the start. Returns the mapping with each mapped axis's calibration replaced.
export function calibrate(mapping, centres, lows, highs) {
  const out = { axes: {}, buttons: { ...mapping.buttons } };
  for (const [name, a] of Object.entries(mapping.axes)) {
    const min = lows[a.index], max = highs[a.index];
    const stick = name === 'pitch' || name === 'roll' || name === 'pedals';
    const center = stick ? centres[a.index] : (min + max) / 2;
    out.axes[name] = max - min > 0.2 ? { ...a, cal: { min, center, max } } : a;  // an axis left still keeps its old calibration
  }
  return out;
}
