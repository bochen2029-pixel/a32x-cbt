// The out-the-window view's geometry, without a browser. The world is three.js's frame: x east, y up, z
// south (north is -z), metres, its origin the runway's landing threshold at the field's elevation. The
// runway's own frame: x right of the centreline looking along the landing direction, z before the
// threshold (+, toward the approach) or past it (-). GPLv3.

const DEG = Math.PI / 180;
const FT = 0.3048;

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

// The runway as the flight core reports it (core.h, the rwy_ state slots), with the glide its ILS flies
// (runway.h: 3 degrees, crossing the threshold at 50 ft).
export function runwayFromState(s) {
  return {
    lat: s.rwy_lat_deg, lon: s.rwy_lon_deg, headingDeg: s.rwy_heading_deg, lengthM: s.rwy_length_m,
    widthM: s.rwy_width_m, displacedM: s.rwy_displaced_m, glideDeg: 3, tchFt: 50,
  };
}

// A point in the runway's frame, in the world's.
export function toWorld(rwy, xRight, zBefore) {
  const h = rwy.headingDeg * DEG;
  const along = -zBefore;  // along the landing direction
  const east = along * Math.sin(h) + xRight * Math.cos(h);
  const north = along * Math.cos(h) - xRight * Math.sin(h);
  return { x: east, z: -north };
}

// The pilot's eye, from the airframe's state: its CG over the ground, then the eye 14 m forward and
// 2.5 m up from the CG along the body, which puts it 5.5 m above the runway standing on the gear.
export const EYE = { cgHeight: 3.0, forward: 14, up: 2.5 };

export function eye(o, latDeg, lonDeg, radioHeightFt, pitchDeg, headingDeg) {
  const p = localMetres(o, latDeg, lonDeg);
  const th = pitchDeg * DEG, psi = headingDeg * DEG;
  const along = EYE.forward * Math.cos(th) - EYE.up * Math.sin(th);
  const height = EYE.cgHeight + Math.max(0, radioHeightFt) * FT + EYE.forward * Math.sin(th) + EYE.up * Math.cos(th);
  return { x: p.east + along * Math.sin(psi), y: height, z: -(p.north + along * Math.cos(psi)) };
}

// The PAPI: four boxes left of the runway, 15 m from its edge and 9 m apart, abeam the point where the
// glide meets the runway, the innermost set highest. Each shows white when the eye is above its angle;
// on the glide, two white outside and two red inside.
export const PAPI_ANGLES = [3.5, 19 / 6, 17 / 6, 2.5];  // innermost first

export function papiBoxes(rwy) {
  const past = rwy.tchFt * FT / Math.tan(rwy.glideDeg * DEG);
  return PAPI_ANGLES.map((_, k) => ({ ...toWorld(rwy, -(rwy.widthM / 2 + 15 + 9 * k), -past), y: 0.6 }));
}

export function papiWhite(eyePos, boxes) {
  return PAPI_ANGLES.map((angle, k) => {
    const b = boxes[k];
    const along = Math.hypot(eyePos.x - b.x, eyePos.z - b.z);
    return Math.atan2(eyePos.y - b.y, along) / DEG > angle;
  });
}
