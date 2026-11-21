// Two promises the invariants held by review alone (INVARIANTS.md, G3 and G4), now held by tests:
// - the native and WebAssembly builds fly the crew's 900 s to the same printed table, row for row (their
//   hashes differ: the C libraries' last bits do, O12);
// - the core reads no clock and draws no unseeded random number: time is the step count (O11).
// GPLv3.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const orbit = join(here, '..', '..');
const native = join(orbit, 'build', 'orbit_run'), wasm = join(orbit, 'build-wasm', 'orbit_run.js');

test('the native and WebAssembly builds print the same flight, row for row, for the crew\'s 900 s (G3)',
  { skip: (!existsSync(native) && 'no native build') || (!existsSync(wasm) && 'no WebAssembly build') }, () => {
    const run = (file, args) => execFileSync(file, args, { encoding: 'utf8', maxBuffer: 1 << 24 }).split('\n').filter(Boolean);
    const a = run(native, ['10', '900']), b = run(process.execPath, [wasm, '10', '900']);
    const rows = (lines) => lines.filter((l) => !/hash/.test(l));
    assert.ok(rows(a).length > 90, `${rows(a).length} rows`);
    assert.deepEqual(rows(b), rows(a), 'the same table to every printed digit');
  });

// A call that reads the time or draws an unseeded random number, outside a comment.
export const CLOCKS = /\bstd::chrono\b|<chrono>|<ctime>|<time\.h>|\bgettimeofday\b|\bclock_gettime\b|\b(?:time|clock)\s*\(|\bs?rand\s*\(|\brandom_device\b|\bemscripten_get_now\b|\bDate\.now\b|\bperformance\.now\b/;
export function readsAClock(source) {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').replace(/"(?:[^"\\]|\\.)*"/g, '""');
  return CLOCKS.test(code);
}

test('the core reads no clock and draws no unseeded random number (G4): time is the step count', () => {
  assert.ok(readsAClock('double t = time(nullptr);'), 'the check finds a clock read');
  assert.ok(readsAClock('#include <chrono>'), 'and an include of one');
  assert.ok(!readsAClock('// time(nullptr) in a comment\nconst double t = timeOf(s);'), 'not a comment or a name that holds the word');
  const dir = join(orbit, 'core');
  const files = readdirSync(dir).filter((f) => /\.(c|cc|cpp|h)$/.test(f));
  assert.ok(files.length > 10, `${files.length} files in the core`);
  const bad = files.filter((f) => readsAClock(readFileSync(join(dir, f), 'utf8')));
  assert.deepEqual(bad, [], 'files that read a clock');
});
