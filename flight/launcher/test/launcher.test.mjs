// A32X.exe through its test switch: it names the page beside it as the file URL Node would write, from
// folders with awkward names, and the trainer's page when asked; a missing page or an unknown option is
// said and nothing is opened; and the program imports nothing Windows does not ship. GPLv3.
//
//   A32X_EXE=<built A32X.exe> node --test flight/launcher/test/launcher.test.mjs   (ctest sets it)
//
// Each run has a deadline: a message box shown by mistake would hold the program open, and the deadline
// turns that into a failure instead of a hang.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { bareWindowsProblems, readPe } from '../../web/tools/pe.mjs';

const exe = process.env.A32X_EXE;
const skip = process.platform !== 'win32' ? 'a Windows program' : !exe ? 'A32X_EXE names no built A32X.exe' : false;

const made = [];
process.on('exit', () => made.forEach((d) => rmSync(d, { recursive: true, force: true })));

/** A folder named `name` holding the launcher and, as asked, the simulator's page and the trainer's. */
function folder(name, { web = true, trainer = false } = {}) {
  const top = realpathSync.native(mkdtempSync(join(tmpdir(), 'a32x-launcher-')));
  made.push(top);
  const dir = join(top, name);
  mkdirSync(dir, { recursive: true });
  copyFileSync(exe, join(dir, 'A32X.exe'));
  for (const [page, wanted] of [['web', web], ['trainer', trainer]]) {
    if (!wanted) continue;
    mkdirSync(join(dir, page));
    writeFileSync(join(dir, page, 'index.html'), '<!doctype html><title>stand-in</title>\n');
  }
  return dir;
}

function run(dir, args) {
  const r = spawnSync(join(dir, 'A32X.exe'), args, { encoding: 'utf8', timeout: 15_000, windowsHide: true });
  if (r.error) throw r.error;
  return { code: r.status, lines: r.stdout.split('\n').filter(Boolean), out: r.stdout, err: r.stderr };
}

function namesPage(dir, args, page) {
  const r = run(dir, args);
  assert.equal(r.err, '', 'nothing on stderr');
  assert.equal(r.code, 0, 'exit code 0');
  const want = pathToFileURL(join(dir, page, 'index.html')).href;
  assert.equal(r.lines[0], want, 'the first line is the page as a file URL');
  // the second says how it would open: Edge in app mode, or the default browser when there is none
  const edge = /^"([^"]+\\msedge\.exe)" --app=(\S+)$/i.exec(r.lines[1]);
  if (edge) assert.equal(edge[2], want, 'Edge is handed the same URL');
  else assert.equal(r.lines[1], `default browser: ${join(dir, page, 'index.html')}`);
}

test('names web/index.html beside it, as Node writes a file URL', { skip }, () => {
  namesPage(folder('A32X'), ['--print-url'], 'web');
});

test('from a folder whose name needs percent-encoding: spaces, # ? % ^ [ ] { } ~, an apostrophe, UTF-8', { skip }, () => {
  namesPage(folder("a b#c%d^e[f]{g}~h'i café € \u{1F6EB}"), ['--print-url'], 'web');
});

test('--trainer names trainer/index.html', { skip }, () => {
  namesPage(folder('both', { trainer: true }), ['--print-url', '--trainer'], 'trainer');
});

test('a missing page is said, and nothing is opened', { skip }, () => {
  const dir = folder('no page', { web: false });
  const r = run(dir, ['--print-url']);
  assert.equal(r.code, 2);
  assert.equal(r.out, '');
  assert.match(r.err, /could not find its page/);
  assert.ok(r.err.includes(join(dir, 'web', 'index.html')), r.err);
});

test('an unknown option is refused, with the usage', { skip }, () => {
  const r = run(folder('options'), ['--print-url', '--fly']);
  assert.equal(r.code, 64);
  assert.match(r.err, /does not know the option "--fly"/);
  assert.match(r.err, /--print-url/);
});

test('imports nothing Windows does not ship, and is hardened as an x64 windows program', { skip }, () => {
  const image = readPe(readFileSync(exe));
  assert.deepEqual(bareWindowsProblems(image), [], JSON.stringify(image));
});
