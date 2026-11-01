// The mouse on the view: a drag turns the head on the flight deck, and swings the orbit camera round
// the aircraft, as the debrief's is; the wheel zooms, or in the orbit camera comes closer and goes
// further; a double click sets the head and the zoom back. The pilot's eye is the airframe's own and
// is never turned: the overlay is drawn for it. Plain numbers, no browser: node tests them. GPLv3.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// v: the view's {mode, look: {yaw, pitch} degrees, orbit: {yaw, pitch} radians and dist metres, zoom};
// dx, dy: the drag in pixels, right and down. The head follows the mouse; the orbit is the world grabbed.
export function drag(v, dx, dy) {
  if (v.mode === 'cockpit') {
    v.look.yaw = clamp(v.look.yaw - dx * 0.2, -150, 150);
    v.look.pitch = clamp(v.look.pitch - dy * 0.2, -60, 40);
  } else if (v.mode === 'orbit') {
    v.orbit.yaw -= dx * 0.006;
    v.orbit.pitch = clamp(v.orbit.pitch + dy * 0.006, -0.05, 1.45);
  }
}

// deltaY: the wheel's, + towards the user. In the orbit camera the distance; elsewhere the zoom.
export function wheel(v, deltaY) {
  if (v.mode === 'orbit') v.orbit.dist = clamp(v.orbit.dist * Math.exp(deltaY * 0.0012), 15, 4000);
  else v.zoom = clamp(v.zoom * Math.exp(-deltaY * 0.0012), 0.5, 8);
}

export function centre(v) {
  v.look.yaw = 0;
  v.look.pitch = -10;
  v.zoom = 1;
}
