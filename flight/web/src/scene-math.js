// The out-the-window view's geometry, without a browser: where the eye is, where the runway is, what
// the PAPI shows. three.js frame: x east, y up, z south (so north is -z), metres. GPLv3.

const DEG = Math.PI / 180;

// The view's origin is where the flight starts, taken from its first state: the harness puts the
// aircraft near 47 N 8 E heading 360 on a sea-level runway, but which latitude it reports — geodetic —
// differs from the one it was given by a fifth of a degree, 21 km. The drawn runway puts its threshold
// behind the start, its centreline through it.
export const RUNWAY = { thresholdZ: 150, length: 3000, width: 45, aimingPoint: 400, heading: 360 };

// Metres per degree of latitude and of longitude at an origin, on the WGS84 ellipsoid (series good to
// centimetres a kilometre, far finer than this view needs).
export function origin(latDeg, lonDeg) {
  const phi = latDeg * DEG;
  return {
    lat: latDeg,
    lon: lonDeg,
    mPerDegLat: 111132.954 - 559.822 * Math.cos(2 * phi) + 1.175 * Math.cos(4 * phi),
    mPerDegLon: 111412.84 * Math.cos(phi) - 93.5 * Math.cos(3 * phi) + 0.118 * Math.cos(5 * phi),
  };
}

export function localMetres(o, latDeg, lonDeg) {
  return { east: (lonDeg - o.lon) * o.mPerDegLon, north: (latDeg - o.lat) * o.mPerDegLat };
}

// The pilot's eye, from the airframe's state: its CG over the ground, then the eye 14 m forward and
// 2.5 m up from the CG along the body, which puts it 5.5 m above the runway standing on the gear.
export const EYE = { cgHeight: 3.0, forward: 14, up: 2.5 };

export function eye(o, latDeg, lonDeg, radioHeightFt, pitchDeg, headingDeg) {
  const p = localMetres(o, latDeg, lonDeg);
  const th = pitchDeg * DEG, psi = headingDeg * DEG;
  const along = EYE.forward * Math.cos(th) - EYE.up * Math.sin(th);
  const height = EYE.cgHeight + Math.max(0, radioHeightFt) * 0.3048 + EYE.forward * Math.sin(th) + EYE.up * Math.cos(th);
  return { x: p.east + along * Math.sin(psi), y: height, z: -(p.north + along * Math.cos(psi)) };
}

// The PAPI: four boxes left of the runway abeam the aiming point, the innermost set highest. Each shows
// white when the eye is above its angle; on a 3 degree path two white outside, two red inside.
export const PAPI_ANGLES = [3.5, 19 / 6, 17 / 6, 2.5];  // innermost first
export const PAPI = { firstX: -(RUNWAY.width / 2 + 15), spacing: 9, z: RUNWAY.thresholdZ - RUNWAY.aimingPoint };

export function papiBox(k) {
  return { x: PAPI.firstX - k * PAPI.spacing, y: 0.6, z: PAPI.z };
}

export function papiWhite(eyePos) {
  return PAPI_ANGLES.map((angle, k) => {
    const b = papiBox(k);
    const along = Math.hypot(eyePos.x - b.x, eyePos.z - b.z);
    return Math.atan2(eyePos.y - b.y, along) / DEG > angle;
  });
}
