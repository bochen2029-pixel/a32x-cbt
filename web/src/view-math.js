// What the view works out from the core's readouts, without a browser: where the eye may go, and which
// way the craft is going as the PROGRADE hold reckons it. The tests read it. GPLv3.

import { RE, WE, add, cross, heightOf, scale } from './frames.js';

// The chase camera's eye, kept at least `min` m above the sphere: lifted along up (the site frame's
// vertical at the craft) when the drag has swung it under the ground, where the Earth's shader would
// see only sky and the field would be hidden.
export function keepAbove(eye, up, min = 1.5) {
  const h = heightOf(eye);
  return h < min ? add(eye, scale(up, min - h)) : eye;
}

// The velocity in space, from the velocity through the air (site frame, m/s) at site-frame point P: the
// air turns with the Earth, so the Earth's turn at P is added. lat0: the site's latitude, degrees, which
// sets where the Earth's axis lies in the site frame (east 0, north cos, up sin).
export function inertialVelocity(vAir, P, lat0) {
  const la = (lat0 * Math.PI) / 180;
  const omega = [0, WE * Math.cos(la), WE * Math.sin(la)];
  return add(vAir, cross(omega, [P[0], P[1], P[2] + RE]));
}

// Below this dynamic pressure the craft flies by rates and holds, and PROGRADE means the velocity in
// space; the core's air law hands over between 200 and 400 Pa.
export const AIR_LAW_PA = 400;
