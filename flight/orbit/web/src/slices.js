// How the near things share the depth buffer. The near pass runs from half a metre to 360 km, and at
// 25 km a 24-bit depth buffer over that range cannot tell two surfaces apart that are less than about
// 75 m from each other: the Ring's ribs and its walls would flicker through each other. So where the
// Ring and the near things (the craft, the field) lie at depths of their own, each is drawn in a slice
// of its own, the farther first, with the depth cleared between; where they overlap (the craft at the
// hub) they share one slice, its near plane as far out as the nearest of them allows. No three.js
// here. GPLv3.

import { HUB_PORT_M } from './core.js';
import { HALF, MAST, PORT, RADIATORS, RING } from './ring-plan.js';

// The camera in the Ring's frame (y along its axis, r out from it; centre: the distance to the Ring's
// centre): the nearest any of it is, and a bound on the farthest.
export function ringDepth(y, r, centre) {
  const band = Math.hypot(Math.max(0, Math.abs(y) - (HALF + 12)), Math.max(0, RING.rim - 60 - r, r - RING.hull - 12));
  const front = HUB_PORT_M + PORT.tube + 4;   // the port's ring stands its tube's radius proud of the face
  const hubY = y < -front ? -front - y : y > MAST.y1 + 12 ? y - MAST.y1 - 12 : 0;
  const hub = Math.hypot(hubY, Math.max(0, r - RADIATORS.r1 - 6));
  const spokes = Math.hypot(Math.max(0, Math.abs(y) - RING.spoke), Math.max(0, r - RING.roof));
  return { min: Math.min(band, hub, spokes), max: centre + RING.hull + 60 };
}

// The near slices, farthest first, each { scene: 'ring' | 'near' | 'both', near, far } in metres.
// ring: ringDepth's, or null where the Ring is not among the near things; stuff: the depths the near
// things span ({ min, max }), or null when none is drawn; base: the near plane the near pass has always
// had; far: its far plane; cosEdge: the cosine of the angle from the view's centre to its corner.
//
// A near plane cuts at a depth along the view's axis, and a point d away and θ off that axis lies at depth
// d cos θ, as little as d cosEdge at the screen's corners. So a near plane set from the nearest distance
// comes in by cosEdge, or a surface at the screen's edge is cut: on 2026-11-12, docking 235 m off the port,
// the hub's face was cut along a straight line and the port's ring a wedge short.
export function depthSlices(ring, stuff, { base = 0.5, far = 3.6e5, cosEdge = 0.5 } = {}) {
  if (!ring) return [{ scene: 'near', near: base, far }];
  const k = 0.9 * cosEdge;
  const ringSlice = { scene: 'ring', near: Math.max(base, ring.min * k), far: Math.min(far, ring.max * 1.02) };
  if (!stuff) return [ringSlice, { scene: 'near', near: base, far }];
  if (ring.min > stuff.max * 1.05 + 20) return [ringSlice, { scene: 'near', near: base, far }];
  if (stuff.min > ring.max * 1.02 + 20) {
    return [{ scene: 'near', near: Math.max(base, stuff.min * k), far }, ringSlice];
  }
  return [{ scene: 'both', near: Math.max(base, Math.min(ring.min, stuff.min) * k), far }];
}

// The cosine of the angle from a perspective view's centre to its corner: vertical field of view fovDeg,
// width over height aspect.
export function cornerCos(fovDeg, aspect) {
  const t = Math.tan((fovDeg * Math.PI) / 360);
  return 1 / Math.sqrt(1 + t * t * (1 + aspect * aspect));
}

// The depth one step of a 24-bit buffer spans at distance d, for a slice from n to f: what two surfaces
// must be apart by to be told apart.
export function depthStep(d, n, f) {
  return (d * d * (f - n)) / (n * f * 16777216);
}
