// The scenery's data files (flight/web/data), checked and turned into what the view builds from: the
// A320's outline beside the points the flight model's own file gives it, the country round DFW, and
// Dallas's skyline. As validateAirport does for an airport, a row missing or out of range is refused by
// name, so the view fails to start rather than draw a tower in the river (CLAUDE.md, 4 and 9). No
// three.js here: node tests read it. GPLv3.

const IN = 0.0254;

function checker(file) {
  const fail = (where, what) => {
    throw new Error(`${file}: ${where}: ${what}`);
  };
  const num = (v, where, lo, hi) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) fail(where, `not a number (${JSON.stringify(v)})`);
    if (v < lo || v > hi) fail(where, `${v} is outside ${lo}..${hi}`);
    return v;
  };
  const list = (v, where, least = 1) => {
    if (!Array.isArray(v) || v.length < least) fail(where, `a list of ${least} or more is wanted`);
    return v;
  };
  const point = (p, where) => {
    list(p, where, 2);
    return [num(p[0], `${where}[0]`, -90, 90), num(p[1], `${where}[1]`, -180, 180)];
  };
  // every number anywhere under an object finite: the outline's shapes have too many fields to name
  const finite = (v, where) => {
    if (typeof v === 'number') return num(v, where, -1e4, 1e4);
    if (Array.isArray(v)) return v.map((x, k) => finite(x, `${where}[${k}]`));
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, finite(x, `${where}.${k}`)]));
    if (typeof v === 'string' || typeof v === 'boolean') return v;
    return fail(where, `unexpected ${JSON.stringify(v)}`);
  };
  return { fail, num, list, point, finite };
}

// The airframe the view draws (a320.json). Its points are the flight model's own, in that file's
// inches (test/visuals.test.mjs reads A320-fit.xml to hold them so); its outline is in metres in the
// same structural frame: x aft from the nose, y right, z up.
export function validateAirframe(raw) {
  const { fail, num, list, finite } = checker('a320.json');
  const pts = raw?.fromAirframeFile;
  if (!pts || pts.unit !== 'IN') fail('fromAirframeFile', 'the flight model\'s points, unit IN');
  const m = (name) => list(pts[name], `fromAirframeFile.${name}`, 3).slice(0, 3).map((v, k) => num(v, `fromAirframeFile.${name}[${k}]`, -3000, 3000) * IN);
  const o = raw.outline || fail('outline', 'missing');
  const fuselage = list(o.fuselage, 'outline.fuselage', 4).map((row, k) => {
    const [x, crown, keel, half] = list(row, `outline.fuselage[${k}]`, 4).map((v, j) => num(v, `outline.fuselage[${k}][${j}]`, -10, 80));
    if (k && x <= o.fuselage[k - 1][0]) fail(`outline.fuselage[${k}]`, 'stations run nose to tail');
    if (crown < keel || half < 0) fail(`outline.fuselage[${k}]`, 'crown above keel, half width not negative');
    return [x, crown, keel, half];
  });
  const L = raw.livery || fail('livery', 'missing');
  for (const key of ['base', 'belly', 'line1', 'line2', 'tail', 'tailMark', 'cowl', 'titleColour']) {
    if (typeof L[key] !== 'string' || !/^#[0-9a-f]{6}$/i.test(L[key])) fail(`livery.${key}`, 'a colour, #rrggbb');
  }
  const out = {
    length: num(o.lengthM, 'outline.lengthM', 20, 80), fuselage,
    wing: finite(o.wing, 'outline.wing'), tailplane: finite(o.tailplane, 'outline.tailplane'), fin: finite(o.fin, 'outline.fin'),
    nacelle: finite(o.nacelle, 'outline.nacelle'), wheels: finite(o.wheels, 'outline.wheels'),
    cg: m('cg'), eye: m('eye'), noseGear: m('noseGear'), mainGear: m('mainGear'), engine: m('engine'), tailBumper: m('tailBumper'),
    livery: { ...L, title: String(L.title || '') },
  };
  num(out.wheels.main, 'outline.wheels.main', 0.2, 1.5);
  num(out.wheels.nose, 'outline.wheels.nose', 0.2, 1.0);
  // the CG over the runway, standing on the gear: where the core's ra_ft reads zero
  out.cgHeightM = out.cg[2] - out.mainGear[2];
  return out;
}

// The country round the airport (dfw-region.json): lakes and the river as centrelines with a half
// width, towns as centres of light, freeways as polylines.
export function validateRegion(raw) {
  const { fail, num, list, point } = checker('dfw-region.json');
  if (!raw || typeof raw !== 'object') fail('the file', 'not an object');
  return {
    lakes: list(raw.lakes, 'lakes', 0).map((l, i) => ({
      name: String(l.name), w: num(l.w, `lakes[${i}].w`, 10, 5000),
      line: list(l.line, `lakes[${i}].line`, 2).map((p, k) => point(p, `lakes[${i}].line[${k}]`)),
    })),
    towns: list(raw.towns, 'towns', 0).map((t, i) => {
      const [lat, lon] = point(t, `towns[${i}]`);
      return [lat, lon, num(t[2], `towns[${i}][2]`, 0.3, 40), num(t[3], `towns[${i}][3]`, 0, 1)];
    }),
    freeways: list(raw.freeways, 'freeways', 0).map((f, i) => list(f, `freeways[${i}]`, 2).map((p, k) => point(p, `freeways[${i}][${k}]`))),
  };
}

const KINDS = new Set(['reunion', 'outline', 'cross', 'gable', 'keyhole', 'prism', 'crown', 'pegasus', 'omni', 'box']);

// Dallas's skyline (dallas-skyline.json): the landmarks, each drawn its own way (city.js), and clusters
// of generic towers.
export function validateSkyline(raw) {
  const { fail, num, list } = checker('dallas-skyline.json');
  if (!raw || typeof raw !== 'object') fail('the file', 'not an object');
  const landmarks = list(raw.landmarks, 'landmarks').map((b, i) => {
    const at = `landmarks[${i}]`;
    if (!KINDS.has(b.kind)) fail(`${at}.kind`, `'${b.kind}' is none of ${[...KINDS].join(', ')}`);
    const out = { ...b, name: String(b.name), lat: num(b.lat, `${at}.lat`, -90, 90), lon: num(b.lon, `${at}.lon`, -180, 180), h: num(b.h, `${at}.h`, 5, 600) };
    for (const key of ['w', 'd', 'roof']) if (key in b) num(b[key], `${at}.${key}`, 1, 600);
    if ('colour' in b) list(b.colour, `${at}.colour`, 3).forEach((v, k) => num(v, `${at}.colour[${k}]`, 0, 1));
    if (b.kind !== 'reunion' && !('w' in b && 'd' in b)) fail(at, 'a footprint, w and d');
    return out;
  });
  const clusters = list(raw.clusters, 'clusters', 0).map((c, i) => {
    const at = `clusters[${i}]`;
    const out = {
      lat: num(c.lat, `${at}.lat`, -90, 90), lon: num(c.lon, `${at}.lon`, -180, 180), r: num(c.r, `${at}.r`, 50, 5000),
      n: num(c.n, `${at}.n`, 1, 200), hMin: num(c.hMin, `${at}.hMin`, 5, 600), hMax: num(c.hMax, `${at}.hMax`, 5, 600),
    };
    if (out.hMax < out.hMin) fail(at, 'hMax below hMin');
    return out;
  });
  return { landmarks, clusters };
}
