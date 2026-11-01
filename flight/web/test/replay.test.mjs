// A saved recording opened in the page: known by its header, carried across the page's reload packed to a fraction of
// itself and back exactly, the replay's address keeping the view's choices and leaving the flight to the recording,
// and the recording's build and saved verdict set against the page's. GPLv3.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCompare, escapeHtml, looksLikeRecording, pack, replayUrl, savedVerdict, unpack } from '../src/replay.js';

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

test("the recording's build against the page's, and the verdict saved with it", () => {
  assert.deepEqual(buildCompare('369e135', '369e135'), { text: 'recorded on this build, 369e135', warn: false });
  assert.equal(buildCompare('6fa5258', '369e135').text, 'recorded on build 6fa5258, flown here by 369e135');
  assert.equal(buildCompare('6fa5258', '369e135').warn, true, 'judged by the laws of another build');
  assert.equal(buildCompare('', '369e135').warn, true);
  assert.equal(savedVerdict(['an ILS approach', '  pass  localizer within 1 dot', 'NOT STABLE: 1 band broken']), 'NOT STABLE: 1 band broken');
  assert.equal(savedVerdict(['STABLE']), 'STABLE');
  assert.equal(savedVerdict(['flying']), '', 'saved before the stop: no verdict');
  assert.equal(savedVerdict(undefined), '');
});

test('what a recording says reaches the page as text, never as markup', () => {
  assert.equal(escapeHtml('<img src=x onerror=alert(1)> & "q"'), '&lt;img src=x onerror=alert(1)&gt; &amp; &quot;q&quot;');
});
