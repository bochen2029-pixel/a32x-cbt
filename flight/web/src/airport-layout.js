// An airport, laid out: its runways' frames, their paint and lights, its buildings, as plain numbers.
// No three.js and no browser here, so node tests where every stripe and light lands; airport.js makes
// the meshes. Adapted from the visuals study's KDFW mockup (fbw-desktop, 2026-11-01). GPLv3.
//
// The world is the view's (scene-math.js): x east, y up, z south, metres from an origin. A runway's own
// frame has its low end's landing threshold at the origin, the landing direction -z, right +x; a point
// in it reaches the world by the runway's frame (runwayFrame, toWorld).

import { localMetres, origin } from './scene-math.js';

const FT = 0.3048;
const DEG = Math.PI / 180;

// What a US precision instrument runway carries, by the FAA's book: markings from AC 150/5340-1, lights
// from AC 150/5340-30. Metres.
export const FAA = {
  marking: {
    stripesByWidthFt: [[200, 16], [150, 12], [100, 8], [75, 6], [0, 4]], stripeWidth: 1.75, stripeLength: 45.7,
    stripeSetback: 6, designatorLength: 18.3, centrelineStripe: 36.6, centrelineGap: 24.4, centrelineWidth: 0.9,
    edgeWidth: 0.9, aimingPoint: 311, aimingLength: 45.7, aimingWidth: 9.1, aimingInner: 22,
    touchdown: [[152, 3], [457, 2], [610, 2], [762, 1], [914, 1]], tdzLength: 22.9, tdzWidth: 1.8, tdzGap: 1.5,
  },
  lights: {
    edgeSpacing: 61, centrelineSpacing: 15.2, tdzSpacing: 30.5, tdzLength: 914, tdzInner: 22, caution: 610,
    approach: { length: 731, spacing: 30.5, crossbars: [152, 305], sideRows: 305, flashers: [335, 731] },
    papi: { fromEdge: 15, spacing: 9, anglesDeg: [3.5, 19 / 6, 17 / 6, 2.5] },
  },
  shoulderM: 7.5,
  taxiway: { offset: 190, width: 23, linkSpacing: 600, holdShort: 75 },
};

// The glide every arrival's PAPI is set to: the flight core's ILS (runway.h), 3 degrees over the
// threshold at 50 ft, so the PAPI and the glideslope agree.
export const GLIDE = { deg: 3, tchFt: 50 };

// Fitting colours as a viewer sees them; lights are not tone mapped.
export const COLOURS = {
  white: [1.0, 0.93, 0.78], whiteHot: [1.0, 0.98, 0.95], yellow: [1.0, 0.75, 0.25], red: [1.0, 0.12, 0.06],
  green: [0.25, 1.0, 0.45], blue: [0.25, 0.45, 1.0], sodium: [1.0, 0.62, 0.28], strobe: [0.9, 0.95, 1.0],
};

// Heights above the ground of each layer, metres; polygon offset keeps them apart at range.
export const Y = { grass: 0.05, shoulder: 0.08, asphalt: 0.1, rubber: 0.12, paint: 0.15 };

// --- the data -------------------------------------------------------------------------------------

// An airport's JSON (flight/web/data), checked and turned into metres. A row that is missing or out of
// range is refused, by name: the view fails to start rather than draw a runway in the wrong place.
export function validateAirport(raw) {
  const name = raw && typeof raw.icao === 'string' ? raw.icao : '?';
  const fail = (where, what) => {
    throw new Error(`airport ${name}: ${where}: ${what}`);
  };
  const num = (v, where, lo, hi) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) fail(where, `not a number (${JSON.stringify(v)})`);
    if (v < lo || v > hi) fail(where, `${v} is outside ${lo}..${hi}`);
    return v;
  };
  if (!raw || typeof raw !== 'object') fail('the file', 'not an object');
  if (!/^[A-Z0-9]{3,4}$/.test(name)) fail('icao', `'${name}' is not an ICAO code`);
  if (!Array.isArray(raw.runways) || raw.runways.length === 0) fail('runways', 'none');
  const ids = new Set();
  const runways = raw.runways.map((r, i) => {
    const at = `runways[${i}]`;
    if (!Array.isArray(r.ends) || r.ends.length !== 2) fail(at, 'a runway has two ends');
    const ends = r.ends.map((e, k) => {
      const w = `${at}.ends[${k}]`;
      if (typeof e.id !== 'string' || !/^(0?[1-9]|[1-2][0-9]|3[0-6])[LCR]?$/.test(e.id)) fail(w, `'${e.id}' is not a runway designator`);
      if (ids.has(e.id)) fail(w, `${e.id} appears twice`);
      ids.add(e.id);
      return {
        id: e.id, lat: num(e.lat, `${w}.lat`, -90, 90), lon: num(e.lon, `${w}.lon`, -180, 180),
        elevationM: num(e.elevationFt, `${w}.elevationFt`, -1500, 15000) * FT,
        headingDeg: num(e.headingDeg, `${w}.headingDeg`, 0, 360), displacedM: num(e.displacedFt, `${w}.displacedFt`, 0, 5000) * FT,
      };
    });
    const lengthM = num(r.lengthFt, `${at}.lengthFt`, 1000, 20000) * FT;
    if (ends[0].displacedM + ends[1].displacedM >= lengthM * 0.6) fail(at, 'its displaced thresholds take most of it');
    return { lengthM, widthM: num(r.widthFt, `${at}.widthFt`, 50, 400) * FT, widthFt: r.widthFt, ends };
  });
  const arrivals = new Set(Array.isArray(raw.arrivals) ? raw.arrivals : []);
  for (const id of arrivals) if (!ids.has(id)) fail('arrivals', `${id} is no runway end here`);
  const taxiwaySide = raw.taxiwaySide || {};
  for (const [id, s] of Object.entries(taxiwaySide)) {
    if (!ids.has(id)) fail('taxiwaySide', `${id} is no runway end here`);
    if (s !== 1 && s !== -1) fail(`taxiwaySide.${id}`, 'is 1 (right) or -1 (left)');
  }
  // buildings: each terminal its footprint, a ring of latitude and longitude; each tower a point
  const terminals = (raw.terminals || []).map((t, i) => {
    const at = `terminals[${i}]`;
    if (!Array.isArray(t.outline) || t.outline.length < 3) fail(`${at}.outline`, 'a footprint takes three points or more');
    return {
      name: String(t.name), heightM: num(t.heightM, `${at}.heightM`, 3, 100),
      outline: t.outline.map((p, k) => [num(p[0], `${at}.outline[${k}][0]`, -90, 90), num(p[1], `${at}.outline[${k}][1]`, -180, 180)]),
    };
  });
  const ramps = (raw.ramps || []).map((r, i) => {
    if (!Array.isArray(r.outline) || r.outline.length < 3) fail(`ramps[${i}].outline`, 'a ramp takes three points or more');
    return r.outline.map((p, k) => [num(p[0], `ramps[${i}].outline[${k}][0]`, -90, 90), num(p[1], `ramps[${i}].outline[${k}][1]`, -180, 180)]);
  });
  const towers = (raw.towers || []).map((t, i) => ({
    name: String(t.name), lat: num(t.lat, `towers[${i}].lat`, -90, 90), lon: num(t.lon, `towers[${i}].lon`, -180, 180),
    heightM: num(t.heightM, `towers[${i}].heightM`, 5, 200),
  }));
  const spine = raw.spine ? {
    lon: num(raw.spine.lon, 'spine.lon', -180, 180), fromLat: num(raw.spine.fromLat, 'spine.fromLat', -90, 90),
    toLat: num(raw.spine.toLat, 'spine.toLat', -90, 90),
  } : null;
  return {
    icao: name, name: String(raw.name || name), elevationM: num(raw.elevationFt, 'elevationFt', -1500, 15000) * FT,
    runways, arrivals, taxiwaySide, terminals, ramps, towers, spine,
  };
}

// A one-runway airport made from the runway the flight core names (scene-math.js, runwayFromState), for
// a runway no airport file holds: its pavement from the start of the displaced part, its far end, the
// approach lights and PAPI on the end the flight lands on.
export function airportFromRunway(rwy) {
  const id = (deg) => String(((Math.round(deg / 10) + 35) % 36) + 1).padStart(2, '0');
  const h = rwy.headingDeg * DEG;
  const o = origin(rwy.lat, rwy.lon);
  const at = (along) => ({ lat: rwy.lat + (along * Math.cos(h)) / o.mPerDegLat, lon: rwy.lon + (along * Math.sin(h)) / o.mPerDegLon });
  const le = id(rwy.headingDeg), he = id((rwy.headingDeg + 180) % 360);
  const start = at(-rwy.displacedM), far = at(rwy.lengthM);
  return validateAirport({
    icao: 'XRWY', name: 'the flight\'s runway', elevationFt: 0,
    runways: [{ lengthFt: (rwy.lengthM + rwy.displacedM) / FT, widthFt: Math.max(50, rwy.widthM / FT), ends: [
      { id: le, lat: start.lat, lon: start.lon, elevationFt: 0, headingDeg: rwy.headingDeg, displacedFt: rwy.displacedM / FT },
      { id: he === le ? `${he}R` : he, lat: far.lat, lon: far.lon, elevationFt: 0, headingDeg: (rwy.headingDeg + 180) % 360, displacedFt: 0 },
    ] }],
    arrivals: [le],
  });
}

// --- frames ---------------------------------------------------------------------------------------

// A runway's frame in the world: its low end's landing threshold, and its heading.
export function runwayFrame(o, rw) {
  const le = rw.ends[0];
  const p = localMetres(o, le.lat, le.lon);
  const h = le.headingDeg * DEG;
  return { x: p.east + Math.sin(h) * le.displacedM, z: -(p.north + Math.cos(h) * le.displacedM), headingDeg: le.headingDeg };
}

// A point in a runway's frame, in the world.
export function toWorld(frame, x, y, z) {
  const h = frame.headingDeg * DEG, c = Math.cos(h), s = Math.sin(h);
  return { x: frame.x + x * c - z * s, y, z: frame.z + x * s + z * c };
}

// Where along a runway's frame each end's landing threshold is, and which way its landings run.
export function runwayExtent(rw) {
  const [le, he] = rw.ends;
  const start = le.displacedM, end = -(rw.lengthM - le.displacedM);
  return { start, end, half: rw.widthM / 2, thresholds: [0, end + he.displacedM] };
}

// The runway end whose landing threshold lies within toleranceM of a position and whose heading agrees
// within 3 degrees: how the view knows which airport the flight is at.
export function findRunwayEnd(airports, latDeg, lonDeg, headingDeg, toleranceM = 100) {
  const o = origin(latDeg, lonDeg);
  for (const a of airports) {
    for (const rw of a.runways) {
      const f = runwayFrame(o, rw), { thresholds } = runwayExtent(rw);
      for (const k of [0, 1]) {
        const t = toWorld(f, 0, 0, thresholds[k]);
        const off = Math.abs(((rw.ends[k].headingDeg - headingDeg + 540) % 360) - 180);
        if (Math.hypot(t.x, t.z) <= toleranceM && off <= 3) return { airport: a, runway: rw, end: rw.ends[k].id };
      }
    }
  }
  return null;
}

// --- a runway, in its own frame -------------------------------------------------------------------

// Everything one runway carries: rectangles of surface and paint, boxes, light fittings, PAPI lamps and
// designators, each in the runway's frame. A fitting's axis points at the viewers who see its front
// colour; those behind see its back colour (none: black).
export function layoutRunway(rw, arrivals, taxiwaySide = 1) {
  const m = FAA.marking, sp = FAA.lights;
  const { start, end, half, thresholds } = runwayExtent(rw);
  const out = { rects: [], boxes: [], lights: [], papi: [], designators: [] };
  const rect = (kind, x0, z0, x1, z1, y) => out.rects.push({ kind, x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), y });
  const box = (kind, cx, cz, w, l) => rect(kind, cx - w / 2, cz - l / 2, cx + w / 2, cz + l / 2, Y.paint);
  const light = (x, y, z, colour, opts = {}) => out.lights.push({ x, y, z, colour, back: null, axis: null, beam: [0.94, 0.5], size: 2.2, flash: null, ...opts });

  // the pavement, its shoulders, and rubber where the wheels meet it at either end
  rect('asphalt', -half, start, half, end, Y.asphalt);
  rect('shoulder', -half - FAA.shoulderM, start, -half, end, Y.shoulder);
  rect('shoulder', half, start, half + FAA.shoulderM, end, Y.shoulder);
  rect('rubber', -13, thresholds[0] - 150, 13, thresholds[0] - 1000, Y.rubber);
  rect('rubber', -13, thresholds[1] + 150, 13, thresholds[1] + 1000, Y.rubber);

  // each end's markings: threshold stripes by the runway's width, the touchdown zone, the aiming point
  const stripes = m.stripesByWidthFt.find(([w]) => rw.widthFt >= w)[1];
  const n = stripes / 2;
  const gap = Math.min(1.75, (half - 3 - n * m.stripeWidth) / n);
  for (const k of [0, 1]) {
    const z0 = thresholds[k], dir = k === 0 ? -1 : 1;  // the landing direction along z
    for (let i = 0; i < n; ++i) {
      const x = 3 + i * (m.stripeWidth + gap) + m.stripeWidth / 2;
      for (const s of [-1, 1]) box('white', s * x, z0 + dir * (m.stripeSetback + m.stripeLength / 2), m.stripeWidth, m.stripeLength);
    }
    for (const [d, count] of m.touchdown) {
      for (const s of [-1, 1]) {
        for (let i = 0; i < count; ++i) {
          box('white', s * (m.aimingInner / 2 + m.tdzWidth / 2 + i * (m.tdzWidth + m.tdzGap)), z0 + dir * (d + m.tdzLength / 2), m.tdzWidth, m.tdzLength);
        }
      }
    }
    for (const s of [-1, 1]) box('white', s * (m.aimingInner / 2 + m.aimingWidth / 2), z0 + dir * (m.aimingPoint + m.aimingLength / 2), m.aimingWidth, m.aimingLength);
    if (rw.ends[k].displacedM > 0) box('white', 0, z0 - dir * 0.9, rw.widthM, 1.8);  // the threshold bar
    out.designators.push({ text: rw.ends[k].id, z: z0 + dir * (m.stripeSetback + m.stripeLength + 12), turn: k === 0 ? 0 : Math.PI, len: m.designatorLength });
  }
  // the centreline between the designators, the side stripes along the edges
  const clear = m.stripeSetback + m.stripeLength + 12 + m.designatorLength * 2 + 12;
  for (let z = thresholds[0] - clear; z > thresholds[1] + clear + m.centrelineStripe; z -= m.centrelineStripe + m.centrelineGap) {
    box('white', 0, z - m.centrelineStripe / 2, m.centrelineWidth, m.centrelineStripe);
  }
  for (const s of [-1, 1]) box('white', s * (half - m.edgeWidth / 2 - 0.3), (start + end) / 2, m.edgeWidth, start - end);

  // Edge lights every 200 ft, white, yellow over the last 2,000 ft toward the end being landed on;
  // centreline every 50 ft, red and white alternating from 3,000 ft to go, red over the last 1,000.
  const along = [0, 0, 1];
  const toGo = (z, k) => (k === 0 ? z - end : start - z);  // to the pavement's end, landing from end k
  for (let z = start; z >= end; z -= sp.edgeSpacing) {
    const c0 = toGo(z, 0) < sp.caution ? COLOURS.yellow : COLOURS.white;
    const c1 = toGo(z, 1) < sp.caution ? COLOURS.yellow : COLOURS.white;
    for (const s of [-1, 1]) light(s * (half + 1.5), 0.45, z, c0, { back: c1, axis: along, beam: [0.0, -1.0], size: 1.9 });
  }
  const code = (d, i) => (d < 305 ? COLOURS.red : d < 914 ? (i % 2 ? COLOURS.red : COLOURS.white) : COLOURS.white);
  for (let z = thresholds[0] - 7.6; z > thresholds[1]; z -= sp.centrelineSpacing) {
    const i = Math.round((thresholds[0] - z) / sp.centrelineSpacing);
    light(0.3, Y.paint + 0.02, z, code(toGo(z, 0), i), { back: code(toGo(z, 1), i), axis: along, beam: [0.985, 0.88], size: 1.6 });
  }
  // the thresholds green toward their landings; each pavement end red toward the landings that run at it
  for (let x = -half + 1; x <= half - 1; x += 3) {
    light(x, 0.3, thresholds[0], COLOURS.green, { back: thresholds[0] === start ? COLOURS.red : null, axis: along, beam: [0.9, 0.4], size: 1.9 });
    light(x, 0.3, thresholds[1], thresholds[1] === end ? COLOURS.red : null, { back: COLOURS.green, axis: along, beam: [0.9, 0.4], size: 1.9 });
    if (thresholds[0] !== start) light(x, 0.3, start, null, { back: COLOURS.red, axis: along, beam: [0.9, 0.4], size: 1.9 });
    if (thresholds[1] !== end) light(x, 0.3, end, COLOURS.red, { axis: along, beam: [0.9, 0.4], size: 1.9 });
  }

  // the arrival ends: touchdown zone lights, ALSF-2 and a PAPI
  for (const k of [0, 1]) {
    if (!arrivals.has(rw.ends[k].id)) continue;
    const z0 = thresholds[k], dir = k === 0 ? -1 : 1, facing = [0, 0, -dir];
    const at = (d) => z0 + dir * d;   // d metres past the threshold; negative is on the approach
    const left = dir;                 // the landing pilot's left, in x
    for (let d = 30; d <= sp.tdzLength; d += sp.tdzSpacing) {
      for (const s of [-1, 1]) for (let i = 0; i < 3; ++i) light(s * (sp.tdzInner / 2 + i * 1.5), Y.paint + 0.02, at(d), COLOURS.white, { axis: facing, beam: [0.985, 0.88], size: 1.45 });
    }
    approachLights(out, at, facing, light, rw.ends[k].displacedM);
    const dPapi = (GLIDE.tchFt * FT) / Math.tan(GLIDE.deg * DEG);
    sp.papi.anglesDeg.forEach((angle, i) => {
      const x = left * (half + sp.papi.fromEdge + i * sp.papi.spacing);
      for (const dx of [-0.6, 0.6]) out.papi.push({ x: x + dx, y: 0.9, z: at(dPapi), angle, axis: facing, end: rw.ends[k].id, unit: i });
      out.boxes.push({ kind: 'housing', cx: x, cy: 0.45, cz: at(dPapi) + dir * 0.8, w: 2.4, h: 0.9, d: 1.2 });  // behind its lamps
    });
  }

  // a parallel taxiway on one side, links every 600 m with green centreline lights and a red stop bar
  const tw = FAA.taxiway, tx = taxiwaySide * tw.offset;
  rect('taxiway', tx - tw.width / 2, start - 20, tx + tw.width / 2, end + 20, Y.asphalt - 0.01);
  rect('yellow', tx - 0.08, start - 20, tx + 0.08, end + 20, Y.paint);
  for (let z = start - 20; z > end + 20; z -= 60) for (const s of [-1, 1]) light(tx + s * (tw.width / 2 + 1), 0.35, z, COLOURS.blue, { size: 1.15 });
  for (let z = -60; z > end + 60; z -= tw.linkSpacing) {
    const x0 = taxiwaySide * half;
    rect('taxiway', Math.min(x0, tx), z - tw.width / 2, Math.max(x0, tx), z + tw.width / 2, Y.asphalt - 0.012);
    rect('yellow', Math.min(x0, tx), z - 0.08, Math.max(x0, tx), z + 0.08, Y.paint);
    for (let s = 12; s < Math.abs(tx - x0); s += 15) light(x0 + taxiwaySide * s, 0.13, z, COLOURS.green, { size: 1.2 });
    for (let i = -3; i <= 3; ++i) light(x0 + taxiwaySide * tw.holdShort, 0.15, z + i * 3, COLOURS.red, { size: 1.3 });
  }
  return out;
}

// ALSF-2: five-light barrettes every 100 ft for 2,400 ft, red side rows over the inner 1,000 ft,
// crossbars at 500 and 1,000 ft, and the sequenced flashers running in toward the threshold twice a
// second. Flush within the pavement, on poles beyond it, rising gently with the ground's clearance.
function approachLights(out, at, facing, light, pavedBeforeM) {
  const a = FAA.lights.approach;
  const height = (d) => (d <= pavedBeforeM ? 0.12 : 0.6 + (d - pavedBeforeM) * 0.004);
  for (let d = a.spacing; d <= a.length + 1; d += a.spacing) {
    const y = height(d), z = at(-d);
    for (let i = -2; i <= 2; ++i) light(i * 1.05, y, z, COLOURS.white, { axis: facing, beam: [0.93, 0.5], size: 2.2 });
    if (d > pavedBeforeM) out.boxes.push({ kind: 'pole', cx: 0, cy: y / 2, cz: z, w: 0.15, h: y, d: 0.15 }, { kind: 'pole', cx: 0, cy: y - 0.12, cz: z, w: 4.6, h: 0.12, d: 0.12 });
    if (d <= a.sideRows) for (const s of [-1, 1]) for (let i = 0; i < 3; ++i) light(s * (11 + i * 1.5), y, z, COLOURS.red, { axis: facing, beam: [0.93, 0.5], size: 2.0 });
  }
  for (const d of a.crossbars) {
    const y = height(d), w = d > 200 ? 15 : 11;
    for (let x = 4; x <= w; x += 1.5) for (const s of [-1, 1]) light(s * x, y, at(-d), COLOURS.white, { axis: facing, beam: [0.93, 0.5], size: 2.2 });
  }
  const [f0, f1] = a.flashers, period = 0.5;
  for (let d = f1; d >= f0; d -= a.spacing) {
    light(0, height(d) + 0.3, at(-d), COLOURS.strobe, { axis: facing, beam: [0.9, 0.35], size: 3.2, flash: [period, ((f1 - d) / (f1 - f0)) * period * 0.8, 0.045] });
  }
}

// What a PAPI lamp shows an eye: white above the angle it is set to, red below.
export function papiShowsWhite(eye, lamp) {
  const along = Math.hypot(eye.x - lamp.x, eye.z - lamp.z);
  return Math.atan2(eye.y - lamp.y, along) / DEG > lamp.angle;
}

// --- buildings, in the world -----------------------------------------------------------------------

// The terminal spine, the terminals' footprints, the ramps and the towers, in the world from an origin:
// each footprint and ramp as [x, z] points, a footprint with its centre, each tower as a point.
export function layoutBuildings(a, o) {
  const xz = (lat, lon) => {
    const p = localMetres(o, lat, lon);
    return [p.east, -p.north];
  };
  const out = { spine: null, terminals: [], ramps: a.ramps.map((ring) => ring.map(([lat, lon]) => xz(lat, lon))), towers: [] };
  if (a.spine) {
    const [x0, z0] = xz(a.spine.fromLat, a.spine.lon), [x1, z1] = xz(a.spine.toLat, a.spine.lon);
    out.spine = { x0, z0, x1, z1 };
  }
  for (const t of a.terminals) {
    const points = t.outline.map(([lat, lon]) => xz(lat, lon));
    const centre = [0, 1].map((k) => points.reduce((s, p) => s + p[k], 0) / points.length);
    out.terminals.push({ name: t.name, points, centre, height: t.heightM });
  }
  for (const t of a.towers) {
    const [x, z] = xz(t.lat, t.lon);
    out.towers.push({ name: t.name, x, z, height: t.heightM });
  }
  return out;
}

// The longest a piece of the ground may be, metres: a curved earth (the GPU tier bends the world by the
// distance from the eye) moves only vertices, so a longer piece would keep its middle on the chord, above
// the ground bent under it, burying what is laid across it. 150 m keeps the chord within 0.5 mm.
export const GROUND_CELL_M = 150;

// Triangles, a flat array of x, y, z, three vertices a triangle, cut until no edge is longer than maxEdge:
// a triangle too long is split at the middle of its longest edge into two, each turning the same way.
// The surface, its area and its winding are as they were.
export function subdivide(positions, maxEdge = GROUND_CELL_M) {
  const out = [];
  const pending = [];
  for (let i = 0; i + 9 <= positions.length; i += 9) pending.push(Array.prototype.slice.call(positions, i, i + 9));
  const most = maxEdge * maxEdge;
  while (pending.length) {
    const t = pending.pop();
    const d = (a, b) => (t[3 * a] - t[3 * b]) ** 2 + (t[3 * a + 1] - t[3 * b + 1]) ** 2 + (t[3 * a + 2] - t[3 * b + 2]) ** 2;
    const edges = [d(0, 1), d(1, 2), d(2, 0)];
    const k = edges.indexOf(Math.max(...edges));
    if (edges[k] <= most) {
      out.push(...t);
      continue;
    }
    const a = k, b = (k + 1) % 3, c = (k + 2) % 3;
    const v = (i) => t.slice(3 * i, 3 * i + 3);
    const m = [0, 1, 2].map((j) => (t[3 * a + j] + t[3 * b + j]) / 2);
    pending.push([...v(a), ...m, ...v(c)], [...m, ...v(b), ...v(c)]);
  }
  return Float32Array.from(out);
}

// The area of a ring of [x, z] points, square metres.
export function ringArea(points) {
  let s = 0;
  for (let i = 0; i < points.length; ++i) {
    const [x0, z0] = points[i], [x1, z1] = points[(i + 1) % points.length];
    s += x0 * z1 - x1 * z0;
  }
  return Math.abs(s) / 2;
}
