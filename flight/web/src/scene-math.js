// The out-the-window view's geometry, without a browser. The world is three.js's frame: x east, y up, z
// south (north is -z), metres, its origin the flight's runway's landing threshold at the field's
// elevation. A runway's own frame, and what stands in it, are airport-layout.js's. GPLv3.

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
