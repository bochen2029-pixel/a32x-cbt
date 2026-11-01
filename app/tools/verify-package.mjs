// The P5 gate: unzip the package somewhere that is not the repository and run it from file://, as a
// stranger would — nothing serving it, no repository beside it, no network.
//
//   npm run gate                      dist/a32x-cbt.zip, Chrome, software rendering, three loads
//   npm run gate -- --browser edge    or a path; --gpu for default rendering; --loads N
//
// The archive is opened by the operating system's unzip, not by tools/zip.mjs, so a writer bug
// cannot hide behind a matching reader. Each load is a fresh browser on a fresh profile with the
// network off, and every request the page makes is recorded: anything outside the unzipped folder
// fails the gate. Then the page has to work, not just paint — six drills, a clean status line, the
// disclaimer, a painted panel, time that moves, a switch that answers a real click, a drill that
// restarts, a freeze that holds — with nothing thrown and nothing logged as an error. Loads repeat
// because the trainer once froze on most loads, not all. Exit code 0 means the gate passed.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { Browser, sleep } from './chrome.mjs';
import { DISCLAIMER, ROOT } from './package.mjs';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = resolve(APP, '..');

/** Unzip with a tool that ships with the operating system. Returns the tool's name. */
function extract(zipPath, into) {
  const tries =
    process.platform === 'win32'
      ? [[join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe'), ['-xf', zipPath, '-C', into]]]
      : [
          ['unzip', ['-q', zipPath, '-d', into]],
          ['bsdtar', ['-xf', zipPath, '-C', into]],
          ['python3', ['-I', '-m', 'zipfile', '-e', zipPath, into]],
        ];
  const failures = [];
  for (const [tool, args] of tries) {
    try {
      execFileSync(tool, args, { stdio: ['ignore', 'ignore', 'pipe'] });
      return tool;
    } catch (err) {
      failures.push(`${tool}: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`);
    }
  }
  throw new Error(`no system unzip could open the archive\n  ${failures.join('\n  ')}`);
}

function walk(dir, base = dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name), base) : [relative(base, join(dir, e.name)).split(sep).join('/')],
  );
}

/** What a stranger's folder must hold, and must not. */
function inventory(files) {
  const need = ['index.html', 'app.js', 'LICENSE', 'README.txt'].map((f) => `${ROOT}/${f}`);
  const missing = need.filter((f) => !files.includes(f));
  const content = files.filter((f) => /^a32x-cbt\/data\/[^/]+\.json$/.test(f));
  const extra = files.filter((f) => !need.includes(f) && !content.includes(f));
  if (missing.length) return { ok: false, detail: `missing ${missing.join(', ')}` };
  if (!content.length) return { ok: false, detail: 'no content in data/' };
  if (extra.length) return { ok: false, detail: `should not ship: ${extra.join(', ')}` };
  return { ok: true, detail: `${files.length} files: ${files.map((f) => f.slice(ROOT.length + 1)).join(', ')}` };
}

// A cell size and margin are derived from the canvas and the grid, so the gate does not hard-code
// the page's layout: width = cols*cell + 2*pad and height = rows*cell + 2*pad.
const PROBE_PANEL = (panel) => `(() => {
  const c = document.getElementById('panel');
  const cell = (c.width - c.height) / (${panel.cols} - ${panel.rows});
  const pad = (c.width - ${panel.cols} * cell) / 2;
  const r = c.getBoundingClientRect();
  return { cell, pad, left: r.left, top: r.top, width: c.width, height: c.height };
})()`;

const PIXEL = (x, y) =>
  `Array.from(document.getElementById('panel').getContext('2d').getImageData(${x}, ${y}, 1, 1).data).join(',')`;

const PAINTED = `(() => {
  const c = document.getElementById('panel');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  const first = d.slice(0, 4).join(',');
  let other = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] + ',' + d[i + 1] + ',' + d[i + 2] + ',' + d[i + 3] !== first) other++;
  return other;
})()`;

const SECONDS = `Number(/ · (\\d+) s · /.exec(document.getElementById('status').textContent)?.[1] ?? NaN)`;

async function load(url, folderUrl, panel, o) {
  const checks = [];
  const check = (name, ok, detail = '') => checks.push({ name, ok: Boolean(ok), detail });

  const browser = await Browser.launch({ browser: o.browser, args: o.gpu ? [] : ['--disable-gpu'] });
  try {
    const page = await browser.page();
    const requests = [];
    const errors = [];
    page.on('Network.requestWillBeSent', (p) => requests.push(p.request.url));
    page.on('Runtime.exceptionThrown', (p) => errors.push(`exception: ${p.exceptionDetails.exception?.description ?? p.exceptionDetails.text}`));
    page.on('Runtime.consoleAPICalled', (p) => p.type === 'error' && errors.push(`console.error: ${p.args.map((a) => a.value ?? a.description).join(' ')}`));
    page.on('Log.entryAdded', (p) => p.entry.level === 'error' && errors.push(`log: ${p.entry.text} ${p.entry.url ?? ''}`));
    await page.send('Network.enable');
    await page.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await page.send('Runtime.enable');
    await page.send('Log.enable');

    await page.goto(url);
    await page.until(`document.getElementById('status').textContent.length > 0`);
    const first = await page.evaluate(`({
      href: location.href,
      drills: [...document.querySelectorAll('#drills button')].map((b) => b.textContent),
      status: document.getElementById('status').textContent,
      notice: document.getElementById('notice')?.textContent ?? '',
      ecam: document.getElementById('ecam').textContent.trim().length,
      steps: document.querySelectorAll('#steps div').length,
    })`);
    check('opened from file://, offline', first.href === url && url.startsWith('file:'), first.href);
    check('six drills', first.drills.length === 6, first.drills.join(' | '));
    check('status line, no load error', first.status && !/failed to load/.test(first.status), first.status);
    check('disclaimer on the page', first.notice.replace(/\s+/g, ' ').includes(DISCLAIMER), first.notice);
    check('ECAM and step list rendered', first.ecam > 0 && first.steps > 2, `${first.ecam} ECAM chars, ${first.steps} step-list rows`);
    const painted = await page.evaluate(PAINTED);
    check('panel painted', painted > 1000, `${painted} pixels off the background`);

    await sleep(1600);
    const s1 = await page.evaluate(SECONDS);
    await sleep(1200);
    const s2 = await page.evaluate(SECONDS);
    check('time moves', s1 >= 1 && s2 > s1, `${s1} s, then ${s2} s, 1.2 s apart`);

    // a real click, through the browser's input pipeline, on the first push switch
    const g = await page.evaluate(PROBE_PANEL(panel));
    const sw = panel.controls.find((c) => c.form === 'push');
    const inside = { x: Math.round(g.pad + (sw.x + sw.w) * g.cell - 8), y: Math.round(g.pad + (sw.y + sw.h / 2) * g.cell) };
    const before = await page.evaluate(PIXEL(inside.x, inside.y));
    const at = { x: g.left + g.pad + (sw.x + sw.w / 2) * g.cell, y: g.top + g.pad + (sw.y + sw.h / 2) * g.cell };
    for (const type of ['mousePressed', 'mouseReleased']) {
      await page.send('Input.dispatchMouseEvent', { type, x: at.x, y: at.y, button: 'left', clickCount: 1 });
    }
    await sleep(150);
    const after = await page.evaluate(PIXEL(inside.x, inside.y));
    check('a switch answers a click', Number.isInteger(g.cell) && before !== after, `${sw.label} at cell ${g.cell}: rgba ${before} -> ${after}`);

    // restart into another drill: a new aircraft, a new procedure, the clock back to zero
    const restarted = await page.evaluate(`(async () => {
      const title = () => document.querySelector('#steps .title').textContent;
      const was = title();
      document.querySelectorAll('#drills button')[1].click();
      return { was, now: title(), status: document.getElementById('status').textContent };
    })()`);
    check('a drill restarts', restarted.now !== restarted.was && / · 0 s · /.test(restarted.status), `${restarted.was} -> ${restarted.now}`);

    // freeze holds time; unfreezing lets it go
    await sleep(1100);
    await page.evaluate(`document.getElementById('freeze').click()`);
    const f1 = await page.evaluate(SECONDS);
    const frozenStatus = await page.evaluate(`document.getElementById('status').textContent`);
    await sleep(1300);
    const f2 = await page.evaluate(SECONDS);
    await page.evaluate(`document.getElementById('freeze').click()`);
    await sleep(1300);
    const f3 = await page.evaluate(SECONDS);
    check('freeze holds time, and lets it go', /FROZEN/.test(frozenStatus) && f2 === f1 && f3 > f2, `${f1} s frozen, ${f2} s 1.3 s later, ${f3} s after unfreezing`);

    const outside = requests.filter((u) => !u.startsWith(folderUrl));
    const read = [...new Set(requests.map((u) => (u.startsWith(folderUrl) ? u.slice(folderUrl.length) : u)))];
    check('every request stays inside the unzipped folder', requests.length > 0 && outside.length === 0, outside.length ? `outside: ${outside.join(', ')}` : `read: ${read.join(', ')}`);
    check('nothing thrown, nothing logged as an error', errors.length === 0, errors.slice(0, 3).join(' | '));
    return { checks, browser: browser.version.product };
  } finally {
    await browser.close();
  }
}

async function main() {
  const { values: v } = parseArgs({
    options: {
      zip: { type: 'string', default: join(APP, 'dist', `${ROOT}.zip`) },
      browser: { type: 'string' },
      loads: { type: 'string', default: '3' },
      gpu: { type: 'boolean', default: false },
    },
  });
  const loads = Number(v.loads);
  if (!Number.isInteger(loads) || loads < 1) throw new Error('--loads must be a whole number of at least 1');
  const zipPath = resolve(v.zip);
  if (!existsSync(zipPath)) throw new Error(`${zipPath} does not exist: run npm run package first`);
  const digest = createHash('sha256').update(readFileSync(zipPath)).digest('hex');

  const into = mkdtempSync(join(tmpdir(), 'a32x-cbt-gate-'));
  let failed = 0;
  try {
    const fromRepo = relative(REPO, into);
    if (!fromRepo.startsWith('..') && !isAbsolute(fromRepo)) throw new Error(`${into} is inside the repository; the gate needs it elsewhere`);
    const tool = extract(zipPath, into);
    const files = walk(into);
    const inv = inventory(files);
    const folder = join(into, ROOT);
    const url = pathToFileURL(join(folder, 'index.html')).href;
    const folderUrl = pathToFileURL(folder).href + '/';
    const panel = JSON.parse(readFileSync(join(folder, 'data', 'panel.json'), 'utf8'));

    console.log(`gate     ${relative(process.cwd(), zipPath)}  sha256 ${digest}`);
    console.log(`unzipped by ${tool} into ${into} (outside ${REPO})`);
    console.log(`${inv.ok ? 'pass' : 'FAIL'}  the folder holds what a user needs, and nothing else — ${inv.detail}`);
    if (!inv.ok) failed++;

    for (let i = 1; i <= loads; i++) {
      const r = await load(url, folderUrl, panel, { browser: v.browser, gpu: v.gpu });
      console.log(`load ${i}/${loads}  ${r.browser}, headless, ${v.gpu ? 'default' : 'software'} rendering, fresh profile, network off`);
      for (const c of r.checks) {
        if (!c.ok) failed++;
        console.log(`  ${c.ok ? 'pass' : 'FAIL'}  ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
      }
    }
  } finally {
    rmSync(into, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
  console.log(failed ? `GATE FAILED: ${failed} check(s)` : 'GATE PASSED');
  process.exitCode = failed ? 1 : 0;
}

const invoked = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href.toLowerCase();
if (invoked === import.meta.url.toLowerCase()) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  });
}
