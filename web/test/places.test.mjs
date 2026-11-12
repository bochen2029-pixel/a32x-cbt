// The night side's lights, from Natural Earth's populated places: the data decodes into real places,
// the large cities are lit and the seas and deserts dark, and a city's light grows with it. GPLv3.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLACES } from '../data/places.js';
import { paintLights, placesOf, townLight } from '../src/land.js';

const places = placesOf();

test('the data decodes into real places, the largest first', () => {
  assert.equal(places.length, PLACES.count);
  assert.ok(places.length > 7000, `${places.length} places`);
  for (const p of places) assert.ok(Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180 && p.pop >= 1, `${p.lat}, ${p.lon}`);
  for (let i = 1; i < places.length; i++) assert.ok(places[i].pop <= places[i - 1].pop);
  const near = (lat, lon) => places.find((p) => Math.abs(p.lat - lat) < 0.15 && Math.abs(p.lon - lon) < 0.15);
  const tokyo = near(35.69, 139.75), dallas = near(32.78, -96.8);
  assert.ok(tokyo && tokyo.pop > 3e7, 'Tokyo, the largest');
  assert.ok(dallas && dallas.pop > 4e6 && dallas.pop < 6e6, `Dallas, ${Math.round(dallas.pop)}`);
});

test('the cities are lit, the seas and the deserts dark', () => {
  const W = 2048, L = paintLights(W, places);
  const at = (lat, lon) => L[Math.floor(((90 - lat) / 180) * (W / 2)) * W + Math.floor(((lon + 180) / 360) * W)];
  for (const [name, lat, lon] of [['Dallas', 32.78, -96.8], ['Tokyo', 35.69, 139.75], ['London', 51.5, -0.12], ['Lagos', 6.45, 3.39], ['Sao Paulo', -23.55, -46.63]]) {
    assert.ok(at(lat, lon) > 60, `${name}: ${at(lat, lon)}`);
  }
  for (const [name, lat, lon] of [['the mid-Pacific', 0, -150], ['the Sahara', 23, 10], ['the Southern Ocean', -60, 90], ['the Atlantic where the Ring waits', 22.5, -60]]) {
    assert.equal(at(lat, lon), 0, name);
  }
  let lit = 0;
  for (const v of L) if (v > 8) lit++;
  assert.ok(lit > 0.0005 * L.length && lit < 0.05 * L.length, `${(100 * lit / L.length).toFixed(2)} % of the globe lit`);
});

test('a bigger town spreads wider and its heart is brighter, but not in proportion', () => {
  const small = townLight(1e4), city = townLight(1e6), metro = townLight(2e7);
  assert.ok(small.radius < city.radius && city.radius < metro.radius);
  assert.ok(small.peak < city.peak && city.peak < metro.peak * 1.5);
  assert.ok(metro.peak / city.peak < 20, 'a city of twenty times the people is not twenty times as bright at heart');
});
