// A recording read back as law_harness --replay reads it, a replay's note on its build, and a replay's verdict
// set against the one its recording was saved with (core-session.js). No module needed: plain text and numbers;
// the module test flies the replays. GPLv3.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareVerdicts, parseRecording, replayNote, UNNAMED_BUILD } from '../src/core-session.js';

const NAMES = 'pitch,roll,tla_1';
const JUDGED = [
  'an ILS approach to KDFW 17C, judged from 1,000 ft above the threshold to the stop',
  '  pass  localizer within 1 dot - worst 0.12 dots at 300 ft',
  '  pass  and through the rollout - worst 0.4 m, 392 m past the threshold',
  'STABLE',
];
const SAMPLE = [
  '# scenario: approach;distance=5', '# airframe: a320', '# crew: hands', '# build: abc1234', '# hands: a joystick',
  '# flown: 2026-11-01T22:40Z', NAMES, '0,0,25', '0.10000000000000001,-0.5,25', '1e-3,0,-20',
  ...JUDGED.map((l) => `# judged: ${l}`),
].join('\n') + '\n';

const plain = (r) => ({ ...r, header: { ...r.header }, rows: Array.from(r.rows) });

test('a recording reads as law_harness reads it: its header, its columns, a row a step, its saved verdict', () => {
  const r = plain(parseRecording(SAMPLE));
  assert.deepEqual(r.header, {
    scenario: 'approach;distance=5', airframe: 'a320', crew: 'hands', build: 'abc1234', hands: 'a joystick',
    flown: '2026-11-01T22:40Z',
  });
  assert.deepEqual(r.columns, ['pitch', 'roll', 'tla_1']);
  assert.equal(r.count, 3);
  assert.deepEqual(r.rows, [0, 0, 25, 0.1, -0.5, 25, 0.001, 0, -20], 'every value the double it was written from');
  assert.deepEqual(r.judged, JUDGED, 'the judged lines as they were, their leading spaces kept');
});

test('written on Windows or saved again by an editor, it reads the same', () => {
  const crlf = SAMPLE.replace(/\n/g, '\r\n') + '\r\n\r\n';
  assert.deepEqual(plain(parseRecording(crlf)), plain(parseRecording(SAMPLE)), 'CR LF, and blank lines at the end');
  const trimmed = SAMPLE.replace('# scenario: approach;distance=5', '# scenario:approach;distance=5');
  assert.equal(parseRecording(trimmed).header.scenario, 'approach;distance=5', 'a header line without its space');
  const empty = parseRecording(`# scenario:\n${NAMES}\n0,0,0\n`);
  assert.equal(empty.header.scenario, '', 'an empty scenario: the runway');
});

test('lines that begin with # among the rows are passed over, as law_harness passes over them', () => {
  const r = parseRecording(`${NAMES}\n0,0,1\n# a note\n0,0,2\n# judged: STABLE\n`);
  assert.equal(r.count, 2);
  assert.deepEqual(Array.from(r.rows), [0, 0, 1, 0, 0, 2]);
  assert.deepEqual(r.judged, ['STABLE']);
});

test('what law_harness would not replay is refused, saying which line and why', () => {
  assert.throws(() => parseRecording('# scenario: approach\n'), /no column names/);
  assert.throws(() => parseRecording(''), /no column names/);
  assert.throws(() => parseRecording(`${NAMES}\n0,0\n`), /line 2 has 2 values where the columns name 3/);
  assert.throws(() => parseRecording(`${NAMES}\n0,0,1,1\n`), /line 2 has 4 values where the columns name 3/);
  assert.throws(() => parseRecording(`${NAMES}\n0,x,1\n`), /line 2: 'x' is not a number/);
  assert.throws(() => parseRecording(`${NAMES}\n0,,1\n`), /line 2: '' is not a number/);
  assert.throws(() => parseRecording(`${NAMES}\n0,NaN,1\n`), /line 2: 'NaN' is not a number/);
  assert.throws(() => parseRecording(`${NAMES}\n0,0,1\n\n0,0,1\n`), /line 3 is blank, among the rows/);
});

test('a header line names no more than itself: no key reaches anything but the header', () => {
  const r = parseRecording(`# constructor: x\n# __proto__: y\n${NAMES}\n0,0,0\n`);
  assert.equal(r.header.constructor, 'x');
  assert.equal(Object.getPrototypeOf(r.header), null);
  assert.equal('build' in r.header, false, 'and a recording without a build line has none');
});

test('a replay says plainly whether it is the flight itself, and when it is not this build\'s', () => {
  assert.deepEqual(replayNote('abc1234', 'abc1234'), { text: 'flown on this build, abc1234: the replay is the flight itself', warn: false });
  const other = replayNote('0000000', 'abc1234');
  assert.equal(other.warn, true);
  assert.match(other.text, /^flown on build 0000000, replayed on build abc1234: .*not the gate's$/);
  assert.match(replayNote(UNNAMED_BUILD, 'abc1234', false).text, /build 1a672e9 \(it has no build line: v0\.1\.0's\)/);
  for (const b of ['abc1234+dirty', 'unknown']) {
    assert.deepEqual(replayNote(b, b), { text: `flown and replayed on build ${b}, not a commit's: not for the gate`, warn: true });
  }
  assert.doesNotMatch(replayNote('<b>x</b>', 'abc1234').text, /[<>/]/, 'what the file says is shown as plain characters');
});

test('a replay\'s verdict is set against the saved one: the same line for line, or the bands that differ', () => {
  assert.deepEqual(compareVerdicts(JUDGED, JUDGED.slice()), { comparable: true, same: true, changed: [], saved: JUDGED, replayed: JUDGED });
  const finer = JUDGED.map((l) => l.replace('0.12 dots', '0.13 dots'));
  const b = compareVerdicts(JUDGED, finer);
  assert.equal(b.same, false, 'another build may word a band otherwise');
  assert.deepEqual(b.changed, [], 'and while every band and the verdict hold, nothing has changed');
  const broken = JUDGED.map((l) => l.replace('  pass  and through', '  FAIL  and through').replace(/^STABLE$/, 'NOT STABLE: 1 band broken'));
  assert.deepEqual(compareVerdicts(JUDGED, broken).changed, [
    'and through the rollout: pass when flown, FAIL here',
    'the verdict: STABLE when flown, NOT STABLE: 1 band broken here',
  ]);
  const unjudged = JUDGED.map((l) => l.replace('  pass  localizer', '  ....  localizer'));
  assert.deepEqual(compareVerdicts(unjudged, JUDGED).changed, [], 'a band not judged on one side is passed over');
  assert.deepEqual(compareVerdicts([], JUDGED), { comparable: false, same: false, changed: [], saved: [], replayed: JUDGED },
                   'a recording saved without a verdict has none to compare');
});
