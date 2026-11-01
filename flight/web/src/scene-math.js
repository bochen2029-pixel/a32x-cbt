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

// The pilot's eye, from the flight core's state s, by name: the CG over the ground (cg_height_m standing
// on the gear, ra_ft above that), then the airframe definition's own eyepoint, the left seat, from the
// CG in body axes (eye_fwd_m, eye_right_m, eye_up_m), turned by the attitude: heading, pitch, roll.
export function eye(o, s) {
  const p = localMetres(o, s.lat_deg, s.lon_deg);
  const th = s.pitch_deg * DEG, ph = s.roll_deg * DEG, psi = s.heading_deg * DEG;
  const f = s.eye_fwd_m, r = s.eye_right_m, u = s.eye_up_m;
  const sth = Math.sin(th), cth = Math.cos(th), sph = Math.sin(ph), cph = Math.cos(ph);
  // the body's forward, right and up axes, level: along the heading, across it, up; then pitch and roll
  const along = f * cth + r * sph * sth - u * cph * sth;      // forward over the ground
  const across = r * cph + u * sph;                            // right of the heading
  const up = f * sth - r * sph * cth + u * cph * cth;
  const sps = Math.sin(psi), cps = Math.cos(psi);
  const east = along * sps + across * cps, north = along * cps - across * sps;
  const height = s.cg_height_m + Math.max(0, s.ra_ft) * FT + up;
  return { x: p.east + east, y: height, z: -(p.north + north) };
}

// A latitude and longitude as the world's [x, z], the form the scenery's builders take; and back.
export function xz(o, latDeg, lonDeg) {
  const p = localMetres(o, latDeg, lonDeg);
  return [p.east, -p.north];
}

export function latLon(o, x, z) {
  return [o.lat - z / o.mPerDegLat, o.lon + x / o.mPerDegLon];
}

// Where the sun is at a local solar hour on a day of the year: its elevation and azimuth (degrees) and
// the unit vector toward it in the world's frame. Declination by Cooper's formula, good to a degree:
// enough for the light, and the GPU tier's hours are solar, not clock time. Day 305 is 1 November.
export function sunAt(hour, latDeg, day = 305) {
  const dec = 23.44 * Math.sin((2 * Math.PI * (284 + day)) / 365) * DEG, phi = latDeg * DEG, H = (hour - 12) * 15 * DEG;
  const e = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
  const A = Math.atan2(-Math.cos(dec) * Math.sin(H), Math.sin(dec) * Math.cos(phi) - Math.cos(dec) * Math.sin(phi) * Math.cos(H));
  return { elevation: e / DEG, azimuth: A / DEG, dir: [Math.cos(e) * Math.sin(A), Math.sin(e), -Math.cos(e) * Math.cos(A)] };
}
