// The view's own physics and data, in node: the airframe it draws stands on the flight model's points,
// a broken data row stops it by name, the sun sets at DFW when it does, the atmosphere stays finite and
// reddens the low sun, and the debrief's bands judge as the P7 gate does. The parts that need three.js
// skip, saying so, where flight/web's packages are not installed. GPLv3.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sunAt } from '../src/scene-math.js';
import { validateAirframe, validateRegion, validateSkyline } from '../src/world-data.js';

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
const A320 = JSON.parse(read('../data/a320.json'));
const REGION = JSON.parse(read('../data/dfw-region.json'));
const SKYLINE = JSON.parse(read('../data/dallas-skyline.json'));
const XML = read('../../jsbsim/aircraft/A320-fit/A320-fit.xml');
const three = await import('three').then(() => true, () => false);
const needsThree = !three && 'three.js is not installed here (npm ci in flight/web)';

// a <location> block's x, y, z in inches
function xyz(block) {
  assert.match(block.head, /unit="IN"/, 'the airframe file gives its points in inches');
  return ['x', 'y', 'z'].map((a) => Number(new RegExp(`<${a}>\\s*([-0-9.]+)`).exec(block.body)[1]));
}
const located = (re) => [...XML.matchAll(re)].map((m) => xyz({ head: m[1], body: m[2] }));

test('the view draws the airframe on the flight model\'s own points', () => {
  const p = A320.fromAirframeFile;
  const named = (name) => located(new RegExp(`(<location name="${name}"[^>]*>)([\\s\\S]*?)</location>`, 'g'))[0];
  const contact = (name) => located(new RegExp(`<contact name="${name}"[^>]*>\\s*(<location[^>]*>)([\\s\\S]*?)</location>`, 'g'))[0];
  assert.deepEqual(named('CG'), p.cg);
  assert.deepEqual(named('EYEPOINT'), p.eye);
  assert.deepEqual(named('AERORP'), p.aeroRef);
  assert.deepEqual(contact('Nose gear'), p.noseGear);
  assert.deepEqual(contact('Right main gear'), p.mainGear);
  assert.deepEqual(contact('Tail'), p.tailBumper);
  const thrusters = located(/<thruster[^>]*>\s*(<location[^>]*>)([\s\S]*?)<\/location>/g);
  assert.ok(thrusters.some((t) => t.every((v, k) => v === p.engine[k])), `an engine's thruster at ${p.engine}`);
});

test('standing on its gear, the CG is as high as the core puts it when ra_ft reads zero', () => {
  const a = validateAirframe(A320);
  // A320-fit: CG z -40 in, main gear contact z -142 in
  assert.ok(Math.abs(a.cgHeightM - 102 * 0.0254) < 1e-9, `${a.cgHeightM} m`);
  // the left seat's eye stands 4.9 m over the runway, as an A320's does
  assert.ok(Math.abs(a.eye[2] - a.mainGear[2] - 4.877) < 0.01);
  assert.ok(a.eye[1] < 0, 'the eye is the captain\'s, on the left');
});

test('a broken row in the scenery\'s data stops the view, by name', () => {
  const copy = (v) => JSON.parse(JSON.stringify(v));
  const noEye = copy(A320);
  delete noEye.fromAirframeFile.eye;
  assert.throws(() => validateAirframe(noEye), /a320\.json: fromAirframeFile\.eye/);
  const backwards = copy(A320);
  backwards.outline.fuselage[3][0] = 0;
  assert.throws(() => validateAirframe(backwards), /a320\.json: outline\.fuselage\[3\]: stations run nose to tail/);
  const flood = copy(REGION);
  flood.lakes[0].w = 90000;
  assert.throws(() => validateRegion(flood), /dfw-region\.json: lakes\[0\]\.w: 90000 is outside/);
  const castle = copy(SKYLINE);
  castle.landmarks[0].kind = 'castle';
  assert.throws(() => validateSkyline(castle), /dallas-skyline\.json: landmarks\[0\]\.kind/);
});

test('the region and the skyline load, Reunion Tower among them', () => {
  const r = validateRegion(REGION), s = validateSkyline(SKYLINE);
  assert.ok(r.lakes.length >= 5 && r.towns.length >= 10 && r.freeways.length >= 5);
  const reunion = s.landmarks.find((b) => b.name === 'Reunion Tower');
  assert.equal(reunion.h, 171);
  assert.equal(reunion.kind, 'reunion');
});

test('on 1 November at DFW the sun sets at 17:19 solar, south of west, and stands 42 degrees at noon', () => {
  const lat = 32.9;
  let set = NaN;
  for (let h = 15; h < 20; h += 0.001) {
    if (sunAt(h, lat).elevation > 0 && sunAt(h + 0.001, lat).elevation <= 0) set = h;
  }
  assert.ok(Math.abs(set - (17 + 19 / 60)) < 3 / 60, `sunset at ${set.toFixed(3)} h`);
  const [east, , south] = sunAt(set, lat).dir;
  assert.ok(east < 0 && south > 0, 'the sun sets in the west-south-west in November');
  assert.ok(Math.abs(sunAt(12, lat).elevation - 41.7) < 0.5, `noon at ${sunAt(12, lat).elevation.toFixed(2)} degrees`);
});

test('the atmosphere stays finite, blue overhead at noon, and reddens the low sun', { skip: needsThree }, async () => {
  const THREE = await import('three');
  const { Atmosphere } = await import('../src/atmosphere.js');
  const a = new Atmosphere();
  a.update(41.7, 200, 70);
  for (const h of a.table) assert.ok(Number.isFinite(THREE.DataUtils.fromHalfFloat(h)));
  assert.ok(a.zenith.b > a.zenith.r * 1.5, 'the noon sky overhead is blue');
  const noon = a.sunColour.r / a.sunColour.b;
  a.update(2, 200, 70);
  assert.ok(a.sunColour.r / a.sunColour.b > noon * 1.5, 'the low sun is redder');
  for (const h of a.table) assert.ok(Number.isFinite(THREE.DataUtils.fromHalfFloat(h)));
});

test('the debrief colours the flown path by the gate\'s own judgement, the core\'s', { skip: needsThree }, async () => {
  const { BAND, bandOf } = await import('../src/acmi.js');
  assert.equal(bandOf({ judge_in_bands: 1 }), BAND.ok, 'inside all its bands');
  assert.equal(bandOf({ judge_in_bands: 0 }), BAND.out);
  assert.equal(bandOf({ judge_in_bands: NaN }), BAND.outside, 'outside the window it judges');
  assert.equal(bandOf({}), BAND.outside, 'a core without the judge judges nothing');
});
