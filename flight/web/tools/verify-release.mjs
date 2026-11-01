// The release gate, as P5's (app/tools/verify-package.mjs): unzip both archives outside the repository,
// as a stranger would, and check three things. GPLv3.
//
//   (a) The page from file://, the network off, in headless Chrome and Edge: it loads, its steps keep
//       real time with none dropped, nothing is thrown or logged as an error in the page or in the
//       flight core's worker, and no request leaves the unzipped folder. The trainer beside it loads.
//   (b) A32X.exe under --print-url names that page, and the trainer's, as file URLs; refuses a page
//       that is not there, on stderr, with no window; and imports nothing Windows does not ship.
//   (c) The source archive builds: CMake configures flight/ against the archive's own upstream folders,
//       MSVC builds it, and ctest is green with either airframe; the launcher builds, passes its test,
//       and comes out byte for byte the A32X.exe that ships.
//
//   npm run release:gate          the release, then the gate
//   node tools/verify-release.mjs [--only a,b,c] [--browsers chrome,edge] [--loads 2] [--seconds 15]
//                                 [--software] [--dist <folder>]
//
// The archives are opened by the operating system's tar, not by app/tools/zip.mjs, so a writer bug
// cannot hide behind a matching reader. Exit code 0 means the gate passed.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { Browser, Page, sleep } from '../../../app/tools/chrome.mjs';
import { bareWindowsProblems, readPe } from './pe.mjs';
import { cpuLoad, extract, run } from './release.mjs';
import { BINARY, BINARY_FILES, DISCLAIMER, SOURCE } from './release-contents.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(here, '..', '..', '..');

function walk(dir, base = dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name), base) : [relative(base, join(dir, e.name)).split(sep).join('/')],
  );
}

/** What the unzipped Windows folder holds: the list, and nothing else. */
function inventory(folder) {
  const files = walk(folder);
  const trainer = files.filter((f) => f.startsWith('trainer/'));
  const missing = BINARY_FILES.filter((f) => !files.includes(f));
  const extra = files.filter((f) => !BINARY_FILES.includes(f) && !f.startsWith('trainer/'));
  const ok = !missing.length && !extra.length && trainer.includes('trainer/index.html') && trainer.includes('trainer/LICENSE');
  return { ok, detail: ok ? `${files.length} files, ${trainer.length} of them the trainer's` : `missing ${missing.join(', ') || '-'}; should not ship ${extra.join(', ') || '-'}` };
}

/**
 * Watch a page, and the workers it starts, for errors and requests. The flight core runs in a Blob
 * worker: its exceptions, its console and its requests are its own target's, so the page's auto-attach
 * holds each worker at its start until it is watched too.
 */
async function watch(browser, page) {
  const seen = { requests: [], errors: [], workers: 0, workerNetwork: true };
  const track = (target, label) => {
    target.on('Network.requestWillBeSent', (p) => seen.requests.push(p.request.url));
    target.on('Runtime.exceptionThrown', (p) => seen.errors.push(`${label} exception: ${p.exceptionDetails.exception?.description ?? p.exceptionDetails.text}`));
    target.on('Runtime.consoleAPICalled', (p) => p.type === 'error' && seen.errors.push(`${label} console.error: ${p.args.map((a) => a.value ?? a.description).join(' ')}`));
  };
  track(page, 'page');
  page.on('Log.entryAdded', (p) => p.entry.level === 'error' && seen.errors.push(`log: ${p.entry.text} ${p.entry.url ?? ''}`));
  page.on('Target.attachedToTarget', async (p) => {
    const worker = new Page(browser, p.sessionId);
    seen.workers++;
    track(worker, 'worker');
    await worker.send('Runtime.enable').catch(() => {});
    await worker.send('Network.enable').catch(() => {
      seen.workerNetwork = false;
    });
    await worker.send('Runtime.runIfWaitingForDebugger').catch(() => {});
  });
  await page.send('Network.enable');
  await page.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await page.send('Runtime.enable');
  await page.send('Log.enable');
  await page.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
  return seen;
}

const inside = (seen, folderUrl) => seen.requests.filter((u) => !u.startsWith(folderUrl) && !u.startsWith('blob:') && !u.startsWith('data:'));

/** (a): one load of the page and the trainer, in a fresh browser on a fresh profile. */
async function loadPage(folder, o, browserName) {
  const checks = [];
  const check = (name, ok, detail = '') => checks.push({ name, ok: Boolean(ok), detail });
  const folderUrl = `${pathToFileURL(folder).href}/`;
  const url = pathToFileURL(join(folder, 'web', 'index.html')).href;
  const args = ['--host-resolver-rules=MAP * ~NOTFOUND', ...(o.software ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu'] : [])];
  const browser = await Browser.launch({ browser: browserName, args });
  try {
    const page = await browser.page();
    const seen = await watch(browser, page);
    await page.goto(url);
    await page.until(`typeof flightReport === 'function' && (flightReport().error !== null || flightReport().simulatedS > 0)`, 30_000, 100);
    await sleep(2000); // past the first frames: a cold page compiles shaders and the worker its module
    const sample = `(() => { const r = flightReport(); return { now: performance.now(), r: { error: r.error, simulatedS: r.simulatedS, stepsDue: r.stepsDue, stepsDropped: r.stepsDropped, lastDropS: r.lastDropS, frames: r.frames, airport: r.airport, airframe: r.airframe, renderer: r.view.renderer, tickUs: r.tickUs }, status: document.getElementById('status').textContent }; })()`;
    const a = await page.evaluate(sample);
    await sleep(o.seconds * 1000);
    const b = await page.evaluate(sample);
    const wall = (b.now - a.now) / 1000;
    const sim = b.r.simulatedS - a.r.simulatedS;
    check('opened from file://, offline', (await page.evaluate('location.href')) === url && url.startsWith('file:'), url);
    check('the flight core started, no error on the page', !a.r.error && !b.r.error && !/fail|could not/i.test(b.status), b.r.error ?? b.status.replace(/\s+/g, ' '));
    check('the airport drawn', /KDFW/.test(b.r.airport), `${b.r.airport}, ${b.r.airframe}, ${b.r.renderer}`);
    check('steps keep real time', sim > 0 && Math.abs(sim - wall) < 0.25, `${sim.toFixed(2)} s simulated in ${wall.toFixed(2)} s of wall time`);
    // Dropped steps are counted from the start, and the page notes when the last frame that dropped
    // any was: the first frames, which compile the view, are told apart from the flight after them.
    const dropped = b.r.stepsDropped - a.r.stepsDropped;
    const tick = `ticks ${b.r.tickUs.mean.toFixed(0)} µs mean, ${(b.r.tickUs.max / 1000).toFixed(1)} ms worst`;
    check(`no step dropped in ${o.seconds} s of flight`, dropped === 0,
      `${dropped} of ${b.r.stepsDue - a.r.stepsDue} due${dropped ? `, the last at ${b.r.lastDropS.toFixed(2)} s` : ''}; ${a.r.stepsDropped} as it started${a.r.stepsDropped ? `, the last at ${a.r.lastDropS.toFixed(2)} s simulated` : ''}; ${tick}`);
    check('the view keeps drawing', b.r.frames - a.r.frames > o.seconds * 10, `${((b.r.frames - a.r.frames) / wall).toFixed(0)} frames a second`);
    check('the flight core runs in a worker, watched', seen.workers >= 1, `${seen.workers} worker${seen.workers === 1 ? '' : 's'}${seen.workerNetwork ? '' : ', whose requests the browser does not report'}`);

    // the trainer beside it: its own page, its own clock
    const trainerUrl = pathToFileURL(join(folder, 'trainer', 'index.html')).href;
    await page.goto(trainerUrl);
    await page.until(`document.getElementById('status')?.textContent.length > 0`, 10_000);
    const seconds = `Number(/ · (\\d+) s · /.exec(document.getElementById('status').textContent)?.[1] ?? NaN)`;
    await sleep(1600);
    const t1 = await page.evaluate(seconds);
    await sleep(1200);
    const t = await page.evaluate(`({ s: ${seconds}, drills: document.querySelectorAll('#drills button').length, notice: document.getElementById('notice')?.textContent ?? '', status: document.getElementById('status').textContent })`);
    check('the trainer loads beside it: six drills, the disclaimer, time moving', t.drills === 6 && t.notice.replace(/\s+/g, ' ').includes(DISCLAIMER) && t.s > t1, `${t.drills} drills, ${t1} s then ${t.s} s`);

    const outside = inside(seen, folderUrl);
    const read = [...new Set(seen.requests.map((u) => (u.startsWith(folderUrl) ? u.slice(folderUrl.length) : u.replace(/^(blob:[^/]*\/\/?[^/]*\/).*/, '$1…'))))];
    check('every request stays inside the unzipped folder', seen.requests.length > 0 && !outside.length, outside.length ? `outside: ${outside.join(', ')}` : `read: ${read.join(', ')}`);
    check('nothing thrown, nothing logged as an error, page or worker', !seen.errors.length, seen.errors.slice(0, 3).join(' | '));
    return { checks, browser: browser.version.product };
  } finally {
    await browser.close();
  }
}

/** (b): the launcher, through its test switch only: no window ever opens. */
function launcher(folder, scratch) {
  const checks = [];
  const check = (name, ok, detail = '') => checks.push({ name, ok: Boolean(ok), detail });
  const exe = join(folder, 'A32X.exe');
  const launch = (file, args) => {
    const r = spawnSync(file, args, { encoding: 'utf8', timeout: 15_000, windowsHide: true });
    return { code: r.status, lines: (r.stdout ?? '').split('\n').filter(Boolean), err: r.stderr ?? '', error: r.error };
  };
  for (const [page, args] of [['web', ['--print-url']], ['trainer', ['--print-url', '--trainer']]]) {
    const want = pathToFileURL(join(folder, page, 'index.html')).href;
    const r = launch(exe, args);
    check(`A32X.exe ${args.join(' ')} names ${page}\\index.html`, r.code === 0 && r.lines[0] === want && !r.err, r.error?.message ?? r.lines.join(' / '));
  }
  const alone = join(scratch, 'no-page');
  mkdirSync(alone, { recursive: true });
  copyFileSync(exe, join(alone, 'A32X.exe'));
  const missing = launch(join(alone, 'A32X.exe'), ['--print-url']);
  check('a missing page is refused on stderr, nothing opened', missing.code === 2 && /could not find its page/.test(missing.err) && !missing.lines.length, `exit ${missing.code}: ${missing.err.trim().split('\n')[0]}`);
  const image = readPe(readFileSync(exe));
  const problems = bareWindowsProblems(image);
  check('A32X.exe needs nothing but Windows', !problems.length, problems.length ? problems.join('; ') : `${image.machine}, imports ${image.imports.join(', ')}`);
  return checks;
}

/** (c): the source archive, built and tested as its README says. */
async function sourceBuilds(source, scratch, shippedExe) {
  const checks = [];
  const check = (name, ok, detail = '') => checks.push({ name, ok: Boolean(ok), detail });
  const flight = join(scratch, 'build-flight');
  const tried = async (name, fn) => {
    const t0 = Date.now();
    try {
      const detail = await fn();
      check(name, true, `${detail ? `${detail}, ` : ''}${((Date.now() - t0) / 1000).toFixed(0)} s`);
      return true;
    } catch (err) {
      check(name, false, err.message.split('\n').slice(-12).join('\n      '));
      return false;
    }
  };
  const passed = (out) => /100% tests passed, 0 tests failed out of (\d+)/.exec(out.toString('utf8'))?.[0] ?? 'ctest said nothing';
  const configured = await tried('CMake configures flight/ against the archive\'s upstream folders', async () => {
    await run('cmake', ['-S', join(source, 'a32x-cbt', 'flight'), '-B', flight,
      `-DA32NX_DIR=${join(source, 'upstream', 'a32nx')}`, `-DJSBSIM_DIR=${join(source, 'upstream', 'jsbsim')}`]);
    return 'no clone, no git: each upstream named by its SOURCE-COMMIT';
  });
  const built = async () => {
    await run('cmake', ['--build', flight, '--config', 'Release', '--parallel']);
  };
  if (configured && (await tried('MSVC builds it', built))) {
    await tried('ctest is green with our A320', async () => passed(await run('ctest', ['--test-dir', flight, '-C', 'Release', '--output-on-failure', '-j', '8'])));
    await tried('ctest is green with the 737', async () => passed(await run('ctest', ['--test-dir', flight, '-C', 'Release', '--output-on-failure', '-j', '8'], { env: { FLIGHT_AIRFRAME: '737' } })));
  }
  const build = join(scratch, 'build-launcher');
  await tried('the launcher builds and passes its test', async () => {
    await run('cmake', ['-S', join(source, 'a32x-cbt', 'flight', 'launcher'), '-B', build]);
    await run('cmake', ['--build', build, '--config', 'Release']);
    return passed(await run('ctest', ['--test-dir', build, '-C', 'Release', '--output-on-failure']));
  });
  const exe = [join(build, 'Release', 'A32X.exe'), join(build, 'A32X.exe')].find((f) => existsSync(f));
  const digest = (b) => createHash('sha256').update(b).digest('hex');
  check('A32X.exe built from the archive is the one that ships, byte for byte', exe && readFileSync(exe).equals(shippedExe), exe ? `sha256 ${digest(readFileSync(exe)).slice(0, 16)}… and ${digest(shippedExe).slice(0, 16)}…` : 'not built');
  return checks;
}

async function main() {
  const { values: v } = parseArgs({
    options: {
      dist: { type: 'string', default: resolve(here, '..', '..', 'dist') },
      only: { type: 'string', default: 'a,b,c' },
      browsers: { type: 'string', default: 'chrome,edge' },
      loads: { type: 'string', default: '2' },
      seconds: { type: 'string', default: '15' },
      software: { type: 'boolean', default: false },
    },
  });
  const only = new Set(v.only.split(','));
  const loads = Number(v.loads);
  const seconds = Number(v.seconds);
  if (!Number.isInteger(loads) || loads < 1 || !(seconds >= 5)) throw new Error('--loads must be at least 1 and --seconds at least 5');
  const zips = { binary: join(resolve(v.dist), `${BINARY}.zip`), source: join(resolve(v.dist), `${SOURCE}.zip`) };
  for (const z of Object.values(zips)) if (!existsSync(z)) throw new Error(`${z} does not exist: run npm run release first`);

  const into = realpathSync.native(mkdtempSync(join(tmpdir(), 'a32x-sim-gate-')));
  const load = cpuLoad();
  const started = Date.now();
  let failed = 0;
  const report = (checks) => {
    for (const c of checks) {
      if (!c.ok) failed++;
      console.log(`  ${c.ok ? 'pass' : 'FAIL'}  ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
    }
  };
  try {
    const fromRepo = relative(REPO, into);
    if (!fromRepo.startsWith('..') && !isAbsolute(fromRepo)) throw new Error(`${into} is inside the repository; the gate needs it elsewhere`);
    for (const [kind, z] of Object.entries(zips)) {
      console.log(`gate     ${relative(process.cwd(), z)}  sha256 ${createHash('sha256').update(readFileSync(z)).digest('hex')}`);
      mkdirSync(join(into, kind));
      await extract(z, join(into, kind));
    }
    console.log(`unzipped by the system's tar into ${into} (outside ${REPO})`);
    const folder = join(into, 'binary', BINARY);
    const inv = inventory(folder);
    console.log(`${inv.ok ? 'pass' : 'FAIL'}  the folder holds what ships, and nothing else — ${inv.detail}`);
    if (!inv.ok) failed++;

    if (only.has('a')) {
      for (const name of v.browsers.split(',')) {
        for (let i = 1; i <= loads; i++) {
          const r = await loadPage(folder, { seconds, software: v.software }, name);
          console.log(`(a) load ${i}/${loads}  ${r.browser}, headless, ${v.software ? 'software' : 'default'} rendering, fresh profile, network off`);
          report(r.checks);
        }
      }
    }
    if (only.has('b')) {
      console.log('(b) A32X.exe, under its test switch');
      report(launcher(folder, join(into, 'scratch')));
    }
    if (only.has('c')) {
      console.log('(c) the source archive builds, with MSVC');
      report(await sourceBuilds(join(into, 'source', SOURCE), join(into, 'scratch'), readFileSync(join(folder, 'A32X.exe'))));
    }
  } finally {
    rmSync(into, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
  console.log(`${((Date.now() - started) / 1000).toFixed(0)} s, the machine's processors ${load().toFixed(0)} % busy on average`);
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
