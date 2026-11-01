// The name a recording is saved under: one file a pilot hands in, named for what was flown, and a file
// name on every system whatever the scenario holds. GPLv3.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildNote, recordingName } from '../src/flight.js';

const header = (airframe) => `# scenario: approach;wind=270/15\n# airframe: ${airframe}\npitch,roll\n0,0\n`;

test('the status line names the build a page flies, and marks one the gate would refuse', () => {
  assert.deepEqual(buildNote('edf90dd'), { text: 'build edf90dd', warn: false });
  assert.deepEqual(buildNote('edf90dd+dirty'), { text: 'build edf90dd+dirty: not for the gate', warn: true });
  assert.deepEqual(buildNote('unknown'), { text: 'build unknown: not for the gate', warn: true });
  assert.deepEqual(buildNote(undefined), { text: '', warn: false }, 'a core older than the build line');
  assert.equal(buildNote('<b>x</b>').text, 'build bxb', 'nothing but a build id reaches the page');
});

test('a recording is named for its airframe, its scenario and its seconds', () => {
  assert.equal(recordingName(header('a320'), 'approach', 412.4), 'a32x-a320-approach-0412s.csv');
  assert.equal(recordingName(header('737'), 'approach', 9.6), 'a32x-737-approach-0010s.csv');
});

test('a scenario\'s slashes, semicolons and equals signs never reach the file name', () => {
  const name = recordingName(header('a320'), 'approach;wind=270/15', 1234);
  assert.equal(name, 'a32x-a320-approach-wind-270-15-1234s.csv');
  assert.doesNotMatch(name, /[\\/:*?"<>|;= ]/);
  assert.equal(recordingName(header('a320'), 'KDFW 17C', 60), 'a32x-a320-KDFW-17C-0060s.csv', 'the runway, for a runway start');
});

test('a recording flown at a time carries it, so five approaches sort in the order flown', () => {
  const at = (iso) => recordingName(header('a320'), 'approach', 412, 'a320', iso);
  assert.equal(at('2026-11-01T18:30:12.345Z'), 'a32x-a320-approach-20261101T1830Z-0412s.csv');
  const names = ['2026-11-01T18:42:00Z', '2026-11-01T18:30:00Z', '2026-11-01T19:05:00Z'].map(at);
  assert.deepEqual([...names].sort(), [names[1], names[0], names[2]]);
  assert.equal(at('not a time'), 'a32x-a320-approach-0412s.csv', 'no time, no stamp');
});

test('without the core\'s airframe line the page\'s own word is used, and nothing is left empty', () => {
  assert.equal(recordingName('pitch,roll\n', '', NaN, '737'), 'a32x-737-flight-0000s.csv');
  const odd = recordingName('# airframe: ../../x\n', '///', 5);
  assert.doesNotMatch(odd, /[\\/]/, 'no path separator survives, so the name is one file');
  assert.match(odd, /^a32x-[A-Za-z0-9._-]+-flight-0005s\.csv$/);
});
