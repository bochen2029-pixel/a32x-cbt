// A saved recording opened in the page: known by its header, carried across the page's reload packed to a fraction of
// itself and back exactly, the replay's address keeping the view's choices and leaving the flight to the recording,
// and what the status line and the panel say of a replay, from the worker's account of it (Replay.info, progress).
// GPLv3.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, looksLikeRecording, pack, replayStatus, replayUrl, replayVerdict, unpack, wrap } from '../src/replay.js';

// a recording as core-session.js writes one, with the page's own header lines and the judge's at its end
const recording = (rows = 3) => ['# scenario: approach;distance=5', '# airframe: a320', '# crew: hands', '# build: 369e135',
  '# hands: keyboard', '# flown: 2026-11-01T22:30:00.000Z', 'pitch,roll,pedals,tla_1,tla_2',
  ...Array.from({ length: rows }, (_, k) => `${(Math.sin(k / 50) * 0.08).toFixed(5)},0,0,22.5,22.5`),
  '# judged: an ILS approach to KDFW 17C, judged from 1,000 ft above the threshold to the stop', '# judged: STABLE'].join('\n') + '\n';

test('a recording is known by its header and its line of input names; another file is not', () => {
  assert.ok(looksLikeRecording(recording()));
  assert.ok(looksLikeRecording(recording().replace(/\n/g, '\r\n')), 'with Windows line ends');
  assert.ok(!looksLikeRecording('time,value\n1,2\n'), 'another CSV');
  assert.ok(!looksLikeRecording('# scenario: approach\n# airframe: a320\n'), 'a header with no input names');
  assert.ok(!looksLikeRecording(null));
});

test('a recording packs to a fraction of itself, in base64, and comes back exactly', async () => {
  const text = recording(20000);   // 400 s at 50 Hz, an approach from 10 nm
  const packed = await pack(text);
  assert.equal(await unpack(packed), text);
  assert.ok(packed.length < text.length / 4, `${packed.length} characters for ${text.length}`);
  assert.match(packed, /^[A-Za-z0-9+/]+=*$/, 'base64, for sessionStorage');
});

test("the address of a replay keeps the view's choices and leaves the flight to the recording", () => {
  const url = new URL(replayUrl('file:///C:/a32x/web/index.html?scenario=approach&crew=script&time=night&cam=chase&debrief=1&airframe=737'));
  assert.equal(url.pathname, '/C:/a32x/web/index.html');
  assert.deepEqual([...url.searchParams.entries()], [['time', 'night'], ['cam', 'chase'], ['replay', '1']]);
});

test('the status line says whose flight, how far it has replayed, and the note on its build, amber if not the gate\'s', () => {
  const info = { scenario: 'approach;distance=5', airframe: 'a320', crew: 'hands', hands: 'keyboard', flown: '2026-11-01T22:30:12.345Z',
    build: '369e135', sameBuild: true, steps: 9500, judged: true, note: { text: 'flown on this build, 369e135: the replay is the flight itself', warn: false } };
  assert.deepEqual(replayStatus(info, { at: 1200, steps: 9500, ended: false }, 'a32x-a320-approach.csv'), [
    ['replay: a32x-a320-approach.csv', false],
    ['flown 2026-11-01 22:30 UTC, by keyboard', false],
    ['replaying, 24.0 s of 190.0 s', false],
    ['flown on this build, 369e135: the replay is the flight', false],
    ['itself', false],
  ]);
  const other = { ...info, crew: 'script', hands: '', sameBuild: false,
    note: { text: "flown on build 6fa5258, replayed on build 369e135: it may fly otherwise here, and this verdict is not the gate's", warn: true } };
  const lines = replayStatus(other, { at: 9500, steps: 9500, ended: true });
  assert.deepEqual(lines.slice(0, 3), [['replay', false], ['flown 2026-11-01 22:30 UTC, by the scripted crew', false], ['replayed to its end, 190.0 s', false]]);
  assert.ok(lines.slice(3).every(([l, warn]) => warn && l.length <= 60), 'the note in amber, in lines that fit');
  assert.equal(lines.slice(3).map(([l]) => l).join(' '), other.note.text);
  assert.deepEqual(replayStatus(null, null, 'f.csv'), [['replay: f.csv', false], ['reading the recording', false]]);
});

test("the replay's verdict against the one saved with it: the same, each band changed, or nothing to compare", () => {
  assert.equal(replayVerdict(undefined), '', 'not ended yet');
  assert.equal(replayVerdict({ comparable: true, same: true, changed: [] }), 'the same, line for line, as the verdict saved with the recording');
  assert.equal(replayVerdict({ comparable: true, same: false, changed: ['rollout: pass when flown, FAIL here', 'the verdict: STABLE when flown, NOT STABLE here'] }),
    'not as when it was saved:\n  rollout: pass when flown, FAIL here\n  the verdict: STABLE when flown, NOT STABLE here');
  assert.equal(replayVerdict({ comparable: true, same: false, changed: [] }), 'the same bands as when it was saved, their figures otherwise');
  assert.match(replayVerdict({ comparable: false, same: false, changed: [] }), /saved without a verdict/, 'a recording older than 0.1.1');
  assert.deepEqual(wrap('one two three four', 9), ['one two', 'three', 'four']);
});

test('what a recording says reaches the page as text, never as markup', () => {
  assert.equal(escapeHtml('<img src=x onerror=alert(1)> & "q"'), '&lt;img src=x onerror=alert(1)&gt; &amp; &quot;q&quot;');
});
