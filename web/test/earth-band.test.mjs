// The band round the limb that the Earth at half the size works out in full (earth.js, bandAngles): it holds
// the limb with its margin, reaches the air's top from orbit, and its inner edge is where the ground's
// distance changes by the threshold across a sample, checked here by differences of the geometry itself.
// Runs with flight/web's three.js. MIT.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { register } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const three = join(here, '..', '..', '..', 'web', 'node_modules', 'three');
const why = !existsSync(join(three, 'build', 'three.module.js')) && `three.js is not at ${three}: npm ci in flight/web`;
let bandAngles, EARTH_UPSAMPLE;
if (!why) {
  const main = pathToFileURL(join(three, 'build', 'three.module.js')).href, addons = pathToFileURL(join(three, 'examples', 'jsm')).href;
  register(`data:text/javascript,export async function resolve(s, c, next) {
    if (s === 'three') return { url: ${JSON.stringify(main)}, shortCircuit: true };
    if (s.startsWith('three/addons/')) return { url: ${JSON.stringify(addons)} + s.slice('three/addons'.length), shortCircuit: true };
    return next(s, c);
  }`);
  ({ bandAngles, EARTH_UPSAMPLE } = await import('../src/earth.js'));
}

const RE = 6371000, TOP = RE + 100000;
// the distance to the ground along a ray at angle a from the Earth's centre's direction, from dist
const ground = (dist, a) => dist * Math.cos(a) - Math.sqrt(RE * RE - (dist * Math.sin(a)) ** 2);
const texel = (2 * (Math.PI / 3)) / 810;   // half of a 1,440 x 810 picture at 60 degrees

test('from orbit the band holds the limb and reaches the air\'s top', { skip: why }, () => {
  const dist = RE + 5e5;
  const { inner, outer, limb } = bandAngles(dist, texel);
  assert.ok(Math.abs(limb - Math.asin(RE / dist)) < 1e-12);
  assert.ok(inner <= limb - EARTH_UPSAMPLE.margin * texel && outer >= limb + EARTH_UPSAMPLE.margin * texel);
  assert.ok(Math.abs(outer - Math.asin(TOP / dist)) < 1e-12, 'the sky\'s band ends at the air\'s top');
  assert.ok(outer - inner < 0.08, `${(outer - inner).toFixed(4)} rad across`);
});

test('from the runway the sky is not steep, and the ground\'s edge is where its distance changes by the threshold', { skip: why }, () => {
  const dist = RE + 3;
  const { inner, outer, limb } = bandAngles(dist, texel);
  assert.ok(Math.abs(outer - (limb + EARTH_UPSAMPLE.margin * texel)) < 1e-12, 'only the margin above the horizon');
  // the change in the logarithm of the ground's distance across a sample, by differences
  const change = (a) => Math.abs(Math.log(ground(dist, a + texel / 2)) - Math.log(ground(dist, a - texel / 2)));
  assert.ok(change(inner - 2 * texel) < EARTH_UPSAMPLE.ground, `just inside the band's edge: ${change(inner - 2 * texel).toFixed(3)}`);
  assert.ok(change(inner + 2 * texel) > EARTH_UPSAMPLE.ground, `just within it: ${change(inner + 2 * texel).toFixed(3)}`);
  assert.ok(limb - inner < 0.05, `${(limb - inner).toFixed(4)} rad below the horizon`);
});

test('a coarser picture works out a wider band, and the band always holds its margins', { skip: why }, () => {
  for (const h of [3, 1e3, 1e4, 3e4, 1e5, 2e5, 5e5, 3.6e7]) {
    const dist = RE + h;
    const fine = bandAngles(dist, texel), coarse = bandAngles(dist, texel * 2);
    assert.ok(coarse.inner <= fine.inner + 1e-12 && coarse.outer >= fine.outer - 1e-12, `${h} m`);
    const reach = Math.max(Math.PI / 2, fine.limb + EARTH_UPSAMPLE.margin * texel);   // the margin may spill above the horizontal
    assert.ok(fine.inner >= 0 && fine.outer <= reach + 1e-12 && fine.inner < fine.limb && fine.outer > fine.limb, `${h} m`);
  }
});
