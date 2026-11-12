// The coastlines the globe is painted from: real places on the right side of them. GPLv3.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LAKES, LAND } from '../data/land.js';
import { isLand, ringsOf } from '../src/land.js';

const land = ringsOf(LAND), lakes = ringsOf(LAKES);
const at = (lat, lon) => isLand(lat, lon, land, lakes);

test('the data decodes into rings of real coordinates', () => {
  assert.ok(land.length > 500 && lakes.length > 100, `${land.length} land rings, ${lakes.length} lakes`);
  for (const r of [...land, ...lakes]) for (const [lon, lat] of r) assert.ok(Math.abs(lon) <= 180 && Math.abs(lat) <= 90, `${lon}, ${lat}`);
});

test('land is land', () => {
  for (const [name, lat, lon] of [['KDFW', 32.9, -97.04], ['the Sahara', 23, 10], ['London', 51.5, -0.12], ['Antarctica', -80, 30],
    ['Sydney', -33.87, 151.2], ['Greenland', 72, -40]]) assert.ok(at(lat, lon), name);
});

test('water is water, lakes included', () => {
  for (const [name, lat, lon] of [['the Gulf of Mexico', 26, -90], ['the middle of the Pacific', 0, -150], ['Lake Michigan', 44, -87],
    ['the Caspian Sea', 42, 51], ['the Atlantic where the crew reaches the Ring', 22.5, -60]]) assert.ok(!at(lat, lon), name);
});
