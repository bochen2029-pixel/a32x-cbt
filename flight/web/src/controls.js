// From what the pilot's hands do to the flight core's inputs: axes calibrated and dead-zoned, a thrust
// lever that clicks into its detents, switches and levers that stay where they were put. No browser in
// here, so node tests it. GPLv3.
//
// Signs are the core's (core.h): pitch +1 full pull, roll +1 full right, pedals +1 full LEFT, thrust
// lever angle 0 idle .. 45 TOGA, rudder_trim +1 the switch held left.

// IDLE, CL, FLX/MCT, TOGA: where the A320's thrust levers click in.
export const DETENTS = [0, 25, 35, 45];
export const DETENT_SNAP = 2;      // degrees of lever travel either side of a detent that click into it
export const LEVER_RATE = 20;      // deg/s when the levers are driven by buttons or keys

// Every action a button or key can be given.
export const ACTIONS = [
  'brakes', 'parkingBrake', 'speedbrake', 'spoilersArm', 'flapsUp', 'flapsDown', 'gear',
  'thrustUp', 'thrustDown', 'rudderTrimLeft', 'rudderTrimRight', 'rudderTrimReset', 'takeover',
];

// A raw axis reading made -1..1 by its calibration: the halves either side of the centre are scaled
// apart, so a stick that rests off centre still reaches full travel both ways.
export function calibrated(raw, cal = { min: -1, center: 0, max: 1 }) {
  if (!Number.isFinite(raw)) return 0;
  const v = raw >= cal.center ? (raw - cal.center) / Math.max(1e-6, cal.max - cal.center)
                              : (raw - cal.center) / Math.max(1e-6, cal.center - cal.min);
  return Math.max(-1, Math.min(1, v));
}

// Nothing inside the deadzone; outside it, the rest of the travel rescaled to reach 1.
export function deadzone(v, dz) {
  const a = Math.abs(v);
  if (a <= dz) return 0;
  return Math.sign(v) * Math.min(1, (a - dz) / (1 - dz));
}

// A lever position in degrees, clicked into the nearest detent when it is close enough.
export function detented(tla) {
  const t = Math.max(0, Math.min(45, tla));
  for (const d of DETENTS) if (Math.abs(t - d) <= DETENT_SNAP) return d;
  return t;
}

// Where a session on the runway starts: parked on the parking brake, levers at idle, gear down, flaps up.
export function initialControls() {
  return {
    pitch: 0, roll: 0, pedals: 0, tla: 0, toeBrakes: 0, parkingBrake: true, speedbrake: 0,
    spoilersArmed: false, flapLever: 0, gearDown: true, rudderTrim: 0, rudderTrimReset: false, takeover: false,
  };
}

// Where the flight core's start left the levers (its ready message's inputs, by name): on the runway,
// what initialControls gives; on an approach, the flap lever and gear set, the thrust levers at the
// angle the trim needed, the brakes off. The hands take over from there.
export function controlsFromInputs(values, index) {
  const v = (name) => values[index[name]];
  return {
    ...initialControls(),
    tla: Math.max(0, Math.min(45, v('tla_1'))),
    flapLever: Math.max(0, Math.min(4, Math.round(v('flap_lever')))),
    gearDown: v('gear_down') >= 0.5,
    spoilersArmed: v('spoilers_armed') >= 0.5,
    speedbrake: v('speedbrake') > 0 ? 1 : 0,
    parkingBrake: v('brakes') >= 1,
  };
}

// One frame of hands on the controls. axes: {pitch, roll, pedals, throttle, toeBrakes}, each in its
// core range (throttle 0 idle .. 1 TOGA), or undefined where nothing is mapped. held: the actions whose
// buttons or keys are down; pressed: those that went down this frame. dt: seconds since the last frame.
export function apply(previous, axes, held, pressed, dt) {
  const c = { ...previous };
  for (const name of ['pitch', 'roll', 'pedals']) {
    if (axes[name] !== undefined) c[name] = Math.max(-1, Math.min(1, axes[name]));
  }
  if (axes.throttle !== undefined) {
    c.tla = detented(axes.throttle * 45);
  } else {
    const drive = (held.has('thrustUp') ? 1 : 0) - (held.has('thrustDown') ? 1 : 0);
    if (drive) c.tla = moveLever(c.tla, drive * LEVER_RATE * dt);
  }
  if (pressed.has('flapsUp')) c.flapLever = Math.max(0, c.flapLever - 1);
  if (pressed.has('flapsDown')) c.flapLever = Math.min(4, c.flapLever + 1);
  if (pressed.has('gear')) c.gearDown = !c.gearDown;
  if (pressed.has('parkingBrake')) c.parkingBrake = !c.parkingBrake;
  if (pressed.has('speedbrake')) c.speedbrake = c.speedbrake > 0 ? 0 : 1;
  if (pressed.has('spoilersArm')) c.spoilersArmed = !c.spoilersArmed;
  c.toeBrakes = held.has('brakes') ? 1 : Math.max(0, Math.min(1, axes.toeBrakes ?? 0));
  c.rudderTrim = (held.has('rudderTrimLeft') ? 1 : 0) - (held.has('rudderTrimRight') ? 1 : 0);
  c.rudderTrimReset = held.has('rudderTrimReset');
  c.takeover = held.has('takeover');
  return c;
}

// A lever driven at a rate stops for a moment in each detent it reaches, as a hand feels the click:
// it does not pass a detent within one frame.
export function moveLever(tla, delta) {
  const next = Math.max(0, Math.min(45, tla + delta));
  for (const d of DETENTS) {
    if ((tla < d && next > d) || (tla > d && next < d)) return d;
  }
  return next;
}

// The core's input slots, by the names flight_input_name gives them. The takeover pushbutton has no
// slot: with no autopilot yet (P9) it disconnects nothing.
export function coreInputs(c) {
  return {
    pitch: c.pitch,
    roll: c.roll,
    pedals: c.pedals,
    tla_1: c.tla,
    tla_2: c.tla,
    brakes: c.parkingBrake ? 1 : c.toeBrakes,
    speedbrake: c.speedbrake,
    spoilers_armed: c.spoilersArmed ? 1 : 0,
    flap_lever: c.flapLever,
    gear_down: c.gearDown ? 1 : 0,
    rudder_trim: c.rudderTrim,
    rudder_trim_reset: c.rudderTrimReset ? 1 : 0,
  };
}
