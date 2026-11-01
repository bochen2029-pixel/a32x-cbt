/**
 * Scenario tests: round trip, refusal, atomicity.  node --test tests/scenario.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Dictionary } from '../src/dictionary.ts';
import { declareAll, tick, type World } from '../src/systems/index.ts';
import { HEADER, ParseError, apply, load, parse, save } from '../src/scenario/situation.ts';

const world: World = {
  externalPowerAvailable: true,
  groundAirAvailable: false,
  tanks: { leftHasFuel: true, rightHasFuel: true, centerHasFuel: false },
  ratDeployed: false,
};

function rig() {
  const d = new Dictionary();
  declareAll(d);
  return d;
}

function deflected(): Dictionary {
  const d = rig();
  d.set('sw.extPwr', true);
  d.set('sw.busTie', true);
  d.set('sw.fuelPumpL1', true);
  d.set('sw.fuelEng1LpValve', true);
  d.set('sw.apuMaster', false);
  d.set('eng1.n2', 42.5);
  d.set('hyd.yellow', 1234);
  d.set('sw.eng1Start', 1);
  d.set('sw.hydBlueEpump', true);
  for (let i = 0; i < 5; i++) tick(d, world, 0.05);
  return d;
}

test('a saved situation starts with the header and a version', () => {
  const text = save(rig(), 'cold & dark');
  const lines = text.split('\n');
  assert.equal(lines[0], HEADER);
  assert.equal(lines[1], '[Version 1]');
  assert.ok(lines.includes('Description=cold & dark'));
});

test('a round trip restores every variable exactly', () => {
  const a = deflected();
  const text = save(a, 'mid-start');

  const b = rig();
  load(b, text);

  assert.deepEqual(
    b.names().map((n) => [n, b.get(n)]),
    a.names().map((n) => [n, a.get(n)]),
  );
});

test('the description survives the round trip', () => {
  const text = save(rig(), 'apu available, brakes set');
  assert.equal(parse(text).description, 'apu available, brakes set');
});

test('a file that is not a situation is refused by name', () => {
  assert.throws(() => parse('hello\nsw.bat1=true\n'), ParseError);
});

test('an unknown variable refuses the whole load', () => {
  const d = rig();
  d.set('sw.bat1', true);
  const text = save(rig(), 'x').replace('sw.bat2=false', 'sw.bat2=false\nsw.nonsense=true');
  assert.throws(() => load(d, text), /nonsense|unknown/);
  assert.equal(d.bool('sw.bat1'), true, 'untouched after a refused load');
});

test('an out-of-range value refuses the whole load and leaves the aircraft alone', () => {
  const d = rig();
  d.set('sw.bat1', true);
  d.set('hyd.green', 3000);

  const text = save(rig(), 'x').replace(/^hyd\.green=.*$/m, 'hyd.green=99999');
  assert.throws(() => load(d, text), ParseError);
  assert.equal(d.bool('sw.bat1'), true);
  assert.equal(d.num('hyd.green'), 3000);
});

test('a bad value late in the file does not leave earlier writes applied', () => {
  const d = rig();
  const text = `${HEADER}\n[Version 1]\nDescription=x\n^-^-^-^ End of description ^-^-^-^\n\nsw.bat1=true\nsw.eng1Start=9\n`;
  assert.throws(() => load(d, text), ParseError);
  assert.equal(d.bool('sw.bat1'), false, 'the first line was rolled back');
});

test('a boolean written as a number is refused rather than coerced', () => {
  const d = rig();
  const text = save(rig(), 'x').replace(/^sw\.bat1=.*$/m, 'sw.bat1=1');
  assert.throws(() => load(d, text), /true\/false/);
});

test('apply reports each variable as it lands', () => {
  const d = rig();
  const seen: string[] = [];
  apply(d, parse(save(rig(), 'x')), (n) => seen.push(n));
  assert.ok(seen.length > 0);
  assert.equal(seen[0], d.names()[0]);
});

test('a saved file reads from and writes to disk unchanged', () => {
  const a = deflected();
  const path = join(tmpdir(), `a32x-cbt-${process.pid}.situ`);
  writeFileSync(path, save(a, 'disk round trip'), 'utf8');
  try {
    assert.ok(existsSync(path));
    const b = rig();
    const desc = load(b, readFileSync(path, 'utf8'));
    assert.equal(desc, 'disk round trip');
    assert.equal(b.num('eng1.n2'), a.num('eng1.n2'));
    assert.equal(b.num('sw.eng1Start'), 1);
  } finally {
    if (existsSync(path)) unlinkSync(path);
  }
});

test('loading restores a system value the model had computed, without re-running it', () => {
  const a = deflected();
  assert.ok(a.num('hyd.blue') > 0, 'fixture: the BLUE pump must have made pressure');

  const b = rig();
  assert.equal(b.num('hyd.blue'), 0, 'a fresh dictionary starts unpressurised');

  load(b, save(a, 'frozen'));
  assert.equal(b.num('hyd.blue'), a.num('hyd.blue'));
});

