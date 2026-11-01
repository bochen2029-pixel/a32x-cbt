// The flight simulator's Windows release, built here and published nowhere: flight/dist/
// a32x-sim-<version>-win64.zip (A32X.exe, the page, the trainer, every licence and notice) and
// a32x-sim-<version>-source.zip, its Corresponding Source. Where they go is the operator's word. GPLv3.
//
//   npm run release -- --a32nx <A32NX clone> --jsbsim <JSBSim clone>     (or A32NX_DIR and JSBSIM_DIR)
//                      [--out <folder>] [--keep]        --keep leaves the build folder in the temp dir
//
// The source archive comes first, from git's objects alone, so no working tree can leak into it: this
// repository at HEAD, refused if a tracked file differs from HEAD; A32NX at 66021c2, the flight-control
// code the module compiles and the licence; JSBSim at 66f7faf, whole; and the three.js files the page
// bundles, as npm installed them under package-lock.json's hashes. Everything that ships is then built
// from that archive, unzipped outside the repository: the WebAssembly module in WSL (on Linux, here) by
// the pinned Emscripten, which then flies it (the_browser_module_flies); the page by esbuild; A32X.exe by
// MSVC, and its test; the trainer by P5's own packager, once its committed bundle is shown to be what
// its source builds. So the source archive is the source of the shipped bytes by construction.
//
// Deterministic: the same commit gives the same bytes. The module's __DATE__ (JSBSim compiles one into
// its version string) is SOURCE_DATE_EPOCH's, or else the commit's time; zip entries are dated as P5
// dates its zip, by SOURCE_DATE_EPOCH or else the zip epoch, 1980 — never the commit's time, which a
// zip stores without a time zone, so that unzipped west of Greenwich every file would sit hours in the
// future and Ninja would regenerate its build forever. MSVC links A32X.exe with /Brepro. Refused: a
// notice missing or not saying what it must, a system
// library linked whose licence is unknown, a file naming a path of this machine, a launcher importing a
// DLL Windows does not ship. On Windows, WSL's distribution, user and emsdk default to the ones
// docs/provenance.md records: A32X_WSL_DISTRO, A32X_WSL_USER and EMSDK override them.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { cpus, tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { unzip, ZIP_EPOCH } from '../../../app/tools/zip.mjs';
import {
  BINARY, EMSCRIPTEN, SOURCE, UPSTREAM, VERSION, archive, checkBinary, checkSource, cmakePins, embeddedFiles, fill,
  firstParagraph, libraryNotices, linkedLibraries, notice, templateValues, wrap, xmlHeader,
} from './release-contents.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(here, '..');

class Refusal extends Error {}
const refuse = (why) => {
  throw new Refusal(`release refused: ${why}`);
};

/** Run a program; resolve with its output as bytes, or reject with the tail of what it said. */
export function run(command, args, { cwd, input, env } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, env: env ? { ...process.env, ...env } : process.env, windowsHide: true });
    const out = [];
    const err = [];
    child.stdout.on('data', (b) => out.push(b));
    child.stderr.on('data', (b) => err.push(b));
    child.on('error', reject);
    child.on('close', (code) => {
      const stdout = Buffer.concat(out);
      if (code === 0) return resolvePromise(stdout);
      const said = `${stdout.toString('utf8')}\n${Buffer.concat(err).toString('utf8')}`.trim().split('\n').slice(-25).join('\n');
      reject(new Error(`${[command, ...args].join(' ')} exited ${code}${cwd ? ` in ${cwd}` : ''}\n${said}`));
    });
    child.stdin.end(input ?? '');
  });
}

const git = (repo, ...args) => run('git', ['-C', repo, ...args]).then((b) => b.toString('utf8').trim());

/** npm, through the node that runs this script: on Windows npm is a .cmd, which spawn will not start. */
function npm(args, cwd) {
  const cli = process.env.npm_execpath && /npm-cli\.js$/.test(process.env.npm_execpath)
    ? process.env.npm_execpath
    : join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  if (!existsSync(cli)) refuse(`npm is not where node keeps it (${cli})`);
  return run(process.execPath, [cli, ...args], { cwd });
}

/** Every file of a commit, or of `paths` in it, from git's objects: a Map of path to bytes. */
async function tree(repo, commit, paths = []) {
  const listing = (await run('git', ['-C', repo, 'ls-tree', '-r', '-z', '--full-tree', commit, '--', ...paths])).toString('utf8');
  const items = listing.split('\0').filter(Boolean).map((line) => {
    const [meta, path] = line.split('\t');
    const [mode, type, object] = meta.split(' ');
    if (type !== 'blob' || mode === '120000') refuse(`${repo} at ${commit} holds ${path} as a ${mode === '120000' ? 'symbolic link' : type}, which a zip of files cannot carry`);
    return { path, object };
  });
  if (!items.length) refuse(`${repo} at ${commit} holds nothing under ${paths.join(', ')}`);
  const batch = await run('git', ['-C', repo, 'cat-file', '--batch'], { input: items.map((i) => i.object).join('\n') + '\n' });
  const files = new Map();
  let at = 0;
  for (const { path, object } of items) {
    const end = batch.indexOf(0x0a, at);
    const [got, type, size] = batch.toString('utf8', at, end).split(' ');
    if (got !== object || type !== 'blob') refuse(`git cat-file answered "${batch.toString('utf8', at, end)}" for ${path}`);
    files.set(path, Buffer.from(batch.subarray(end + 1, end + 1 + Number(size)))); // each its own, not a view of the batch
    at = end + 1 + Number(size) + 1;
  }
  return files;
}

/** The three.js files the page bundles, read where npm ci put them, at the version the lock pins. */
async function threeFiles() {
  const lock = JSON.parse(readFileSync(join(WEB, 'package-lock.json'), 'utf8')).packages;
  for (const name of ['three', 'esbuild']) {
    const want = lock[`node_modules/${name}`]?.version;
    const have = existsSync(join(WEB, 'node_modules', name, 'package.json'))
      ? JSON.parse(readFileSync(join(WEB, 'node_modules', name, 'package.json'), 'utf8')).version
      : 'nothing';
    if (have !== want) refuse(`flight/web/node_modules holds ${name} ${have}, and package-lock.json pins ${want}: run npm ci there`);
  }
  const { build } = await import('esbuild');
  const r = await build({
    entryPoints: [join(WEB, 'src', 'main.js')], absWorkingDir: WEB, bundle: true, write: false, metafile: true,
    format: 'iife', platform: 'browser', target: 'es2022', logLevel: 'silent',
  });
  const bundled = Object.keys(r.metafile.inputs).filter((p) => p.startsWith('node_modules/three/')).map((p) => p.slice(19));
  if (!bundled.length) refuse('the page bundles no three.js file: the metafile read wrong');
  const files = new Map();
  for (const f of ['LICENSE', 'README.md', 'package.json', ...bundled.sort()]) files.set(f, readFileSync(join(WEB, 'node_modules', 'three', f)));
  return { files, version: lock['node_modules/three'].version, esbuild: lock['node_modules/esbuild'].version };
}

/**
 * Unzip with the operating system's own tool, so the archive meets a reader that is not ours. Files are
 * dated when they are written, not as the archive dates them: a build's timestamps must not depend on it.
 */
export async function extract(zipPath, into) {
  if (process.platform === 'win32') {
    await run(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe'), ['-xmf', zipPath, '-C', into]);
  } else {
    await run('unzip', ['-q', '-DD', zipPath, '-d', into]);
  }
}

function wslPath(p) {
  const m = /^([A-Za-z]):[\\/](.*)$/.exec(p);
  if (!m) refuse(`${p} is not on a drive WSL can see`);
  return `/mnt/${m[1].toLowerCase()}/${m[2].replace(/\\/g, '/')}`;
}

const shellQuote = (s) => `'${String(s).replace(/'/g, `'"'"'`)}'`;

/**
 * The module, built from the source archive by the pinned Emscripten: unzipped by Info-ZIP in WSL's own
 * file system (or here, on Linux), configured against the archive's upstream folders, built with the
 * release's SOURCE_DATE_EPOCH, flown by the_browser_module_flies, and linked once more verbosely to name
 * the system libraries it takes in. Emscripten's licence texts come back beside it.
 */
async function buildModule(work, zipPath, epoch) {
  const out = join(work, 'module');
  mkdirSync(join(out, 'notices'), { recursive: true });
  const windows = process.platform === 'win32';
  const p = windows ? wslPath : (x) => x;
  const emsdk = process.env.EMSDK || '/root/emsdk';
  const script = [
    '#!/bin/bash',
    '# Written by flight/web/tools/release.mjs: builds the module from the source archive.',
    'set -euo pipefail',
    `ZIP=${shellQuote(p(zipPath))} OUT=${shellQuote(p(out))} ROOT=${shellQuote(SOURCE)} EPOCH=${shellQuote(epoch)} EMSDK=${shellQuote(emsdk)}`,
    'source "$EMSDK/emsdk_env.sh" > /dev/null 2>&1',
    'emcc --version | head -n 1 > "$OUT/emcc.txt"',
    'git -C "$EMSDK" rev-parse HEAD > "$OUT/emsdk.txt"',
    'B=$(mktemp -d /tmp/a32x-release-XXXXXX)',
    'trap \'rm -rf "$B"\' EXIT',
    'cd "$B" && unzip -q -DD "$ZIP"  # -DD: dated now, as written, whatever the archive says',
    'S="$B/$ROOT"',
    'emcmake cmake -S "$S/a32x-cbt/flight" -B "$B/build" -G Ninja -DCMAKE_BUILD_TYPE=Release \\',
    '  -DA32NX_DIR="$S/upstream/a32nx" -DJSBSIM_DIR="$S/upstream/jsbsim" > "$OUT/configure.log" 2>&1',
    'SOURCE_DATE_EPOCH="$EPOCH" cmake --build "$B/build" --target flight_core > "$OUT/build.log" 2>&1',
    'ctest --test-dir "$B/build" -R "^the_browser_module_flies$" --output-on-failure > "$OUT/ctest.log" 2>&1',
    'cp "$B/build/flight_core.js" "$OUT/flight_core.js"',
    'cd "$B/build"',
    'link=$(ninja -t commands flight_core | tail -n 1 | sed -e "s# -o flight_core.js # -o $B/probe.js #" -e "s#/em++ #/em++ -v #")',
    'SOURCE_DATE_EPOCH="$EPOCH" bash -c "$link" > "$OUT/link.txt" 2>&1',
    'E="$EMSDK/upstream/emscripten" L="$EMSDK/upstream/emscripten/system/lib"',
    'cp "$E/LICENSE" "$OUT/notices/Emscripten"',
    'cp "$L/libc/musl/COPYRIGHT" "$OUT/notices/musl"',
    'cp "$L/libcxx/LICENSE.TXT" "$OUT/notices/libc++"',
    'cp "$L/libcxxabi/LICENSE.TXT" "$OUT/notices/libc++abi"',
    'cp "$L/libunwind/LICENSE.TXT" "$OUT/notices/libunwind"',
    'cp "$L/compiler-rt/LICENSE.TXT" "$OUT/notices/compiler-rt"',
    'cp "$L/dlmalloc.c" "$OUT/notices/dlmalloc.c"',
    '',
  ].join('\n');
  const scriptPath = join(work, 'build-module.sh');
  writeFileSync(scriptPath, script);
  try {
    if (windows) {
      const distro = process.env.A32X_WSL_DISTRO || 'Ubuntu-24.04';
      const user = process.env.A32X_WSL_USER || 'root';
      await run('wsl.exe', ['-d', distro, '-u', user, '--exec', 'bash', wslPath(scriptPath)]);
    } else {
      await run('bash', [scriptPath]);
    }
  } catch (err) {
    const logs = ['configure.log', 'build.log', 'ctest.log', 'link.txt'].filter((f) => existsSync(join(out, f)));
    const last = logs.length ? readFileSync(join(out, logs.at(-1)), 'utf8').trim().split('\n').slice(-20).join('\n') : '';
    throw new Error(`the module did not build from the source archive\n${err.message}${last ? `\n--- ${logs.at(-1)}\n${last}` : ''}`);
  }
  const emcc = readFileSync(join(out, 'emcc.txt'), 'utf8').trim();
  const emsdkCommit = readFileSync(join(out, 'emsdk.txt'), 'utf8').trim();
  if (!emcc.includes(EMSCRIPTEN.version) || !emcc.includes(EMSCRIPTEN.commit)) refuse(`the module was built by "${emcc}", not Emscripten ${EMSCRIPTEN.version} (${EMSCRIPTEN.commit})`);
  if (emsdkCommit !== EMSCRIPTEN.emsdk) refuse(`emsdk is at ${emsdkCommit}, not ${EMSCRIPTEN.emsdk}`);
  const licence = (n) => readFileSync(join(out, 'notices', n), 'utf8');
  return {
    core: join(out, 'flight_core.js'),
    libraries: linkedLibraries(readFileSync(join(out, 'link.txt'), 'utf8')),
    flew: readFileSync(join(out, 'ctest.log'), 'utf8').match(/\d+% tests passed.*/)?.[0] ?? '',
    licence,
    emcc,
  };
}

/** The page, built from the archive's flight/web with the archive's lock: index.html, flight.js, core.js. */
async function buildPage(root, core, out, three) {
  const web = join(root, 'a32x-cbt', 'flight', 'web');
  await npm(['ci', '--prefer-offline', '--no-audit', '--no-fund'], web);
  // run from flight/web, so the bundles name their inputs from there, as on any machine
  await run(process.execPath, ['tools/build.mjs', '--core', core, '--out', out], { cwd: web });
  const page = Object.fromEntries(['index.html', 'flight.js', 'core.js'].map((f) => [f, readFileSync(join(out, f))]));
  const bundled = [...page['flight.js'].toString('utf8').matchAll(/^\s*\/\/ node_modules\/three\/(\S+)$/gm)].map((m) => m[1]);
  if (!bundled.length) refuse('web/flight.js names no three.js file it bundles');
  for (const f of bundled) {
    const shipped = readFileSync(join(web, 'node_modules', 'three', f));
    if (!three.has(f)) refuse(`web/flight.js bundles three/${f}, which the source archive does not carry`);
    if (!three.get(f).equals(shipped)) refuse(`web/flight.js bundles a three/${f} that differs from the source archive's`);
  }
  return page;
}

/** A32X.exe, built from the archive by MSVC, and its own test run. */
async function buildLauncher(root, work) {
  if (process.platform !== 'win32') refuse('A32X.exe is built with MSVC, on Windows');
  const build = join(work, 'launcher');
  await run('cmake', ['-S', join(root, 'a32x-cbt', 'flight', 'launcher'), '-B', build]);
  await run('cmake', ['--build', build, '--config', 'Release']);
  await run('ctest', ['--test-dir', build, '-C', 'Release', '--output-on-failure']);
  const exe = [join(build, 'Release', 'A32X.exe'), join(build, 'A32X.exe')].find((f) => existsSync(f));
  if (!exe) refuse('the launcher built, but no A32X.exe is where CMake puts one');
  return readFileSync(exe);
}

/**
 * The trainer, as P5 packages it, from the archive: its committed bundle must be what its source builds
 * to, or the trainer in the release would not be the source beside it.
 */
async function buildTrainer(root, work, committed) {
  const app = join(root, 'a32x-cbt', 'app');
  await npm(['ci', '--prefer-offline', '--no-audit', '--no-fund'], app);
  await run(process.execPath, ['tools/build.mjs'], { cwd: app });
  if (!readFileSync(join(app, 'web', 'app.js')).equals(committed)) {
    refuse('app/web/app.js at this commit is not what app/src builds to: run npm run build:web in app/ and commit it');
  }
  const { buildPackage, ROOT } = await import(pathToFileURL(join(app, 'tools', 'package.mjs')).href);
  const r = buildPackage({ app, license: join(root, 'a32x-cbt', 'LICENSE'), out: join(work, 'trainer') });
  const files = new Map();
  for (const e of unzip(readFileSync(r.path))) {
    if (!e.name.endsWith('/')) files.set(e.name.slice(ROOT.length + 1), e.data);
  }
  return files;
}

/** Each second, how busy the machine's processors were: the desktop is shared, and timings need it. */
export function cpuLoad() {
  let last = cpus();
  const samples = [];
  const timer = setInterval(() => {
    const now = cpus();
    let busy = 0;
    let total = 0;
    now.forEach((c, i) => {
      const a = last[i].times;
      const b = c.times;
      const t = b.user - a.user + (b.nice - a.nice) + (b.sys - a.sys) + (b.irq - a.irq) + (b.idle - a.idle);
      total += t;
      busy += t - (b.idle - a.idle);
    });
    if (total > 0) samples.push(busy / total);
    last = now;
  }, 1000);
  timer.unref(); // a refusal must not wait on it
  return () => {
    clearInterval(timer);
    return samples.length ? (100 * samples.reduce((x, y) => x + y, 0)) / samples.length : NaN;
  };
}

async function main() {
  const { values: o } = parseArgs({
    options: {
      a32nx: { type: 'string', default: process.env.A32NX_DIR },
      jsbsim: { type: 'string', default: process.env.JSBSIM_DIR },
      out: { type: 'string', default: resolve(WEB, '..', 'dist') },
      keep: { type: 'boolean', default: false },
    },
  });
  if (!o.a32nx || !o.jsbsim) refuse('name the upstream clones: --a32nx <clone> --jsbsim <clone>, or A32NX_DIR and JSBSIM_DIR');
  const started = Date.now();
  const load = cpuLoad();
  const steps = [];
  const step = async (name, fn) => {
    const t0 = Date.now();
    process.stdout.write(`${name} ... `);
    const r = await fn();
    const s = (Date.now() - t0) / 1000;
    steps.push([name, s]);
    console.log(`${s.toFixed(1)} s`);
    return r;
  };

  const out = resolve(o.out);
  const targets = { source: join(out, `${SOURCE}.zip`), binary: join(out, `${BINARY}.zip`), sums: join(out, 'SHA256SUMS') };
  for (const t of Object.values(targets)) rmSync(t, { force: true }); // a refused release leaves nothing that looks current

  // --- what the release is made of: this commit, and the pinned upstream commits ---------------------
  const repo = await git(WEB, 'rev-parse', '--show-toplevel');
  const commit = await git(repo, 'rev-parse', 'HEAD');
  const dirty = await git(repo, 'status', '--porcelain', '--untracked-files=no');
  if (dirty) refuse(`tracked files differ from HEAD; a release is built from a commit:\n${dirty}`);
  const epochText = process.env.SOURCE_DATE_EPOCH || (await git(repo, 'show', '-s', '--format=%ct', commit));
  const epoch = Number(epochText);
  if (!Number.isInteger(epoch) || epoch < 315532800) refuse(`SOURCE_DATE_EPOCH must be whole seconds after 1980, got "${epochText}"`);
  const when = process.env.SOURCE_DATE_EPOCH ? new Date(epoch * 1000) : ZIP_EPOCH; // the zip entries' date
  const commitDate = await git(repo, 'show', '-s', '--format=%cs', commit);
  for (const [key, clone] of [['a32nx', o.a32nx], ['jsbsim', o.jsbsim]]) {
    await git(resolve(clone), 'cat-file', '-e', `${UPSTREAM[key].commit}^{commit}`).catch(() => refuse(`${clone} does not hold ${UPSTREAM[key].title} ${UPSTREAM[key].commit}`));
  }

  // --- the source archive ---------------------------------------------------------------------------
  const ours = await step(`this repository at ${commit.slice(0, 7)}`, () => tree(repo, commit));
  const pins = cmakePins(ours.get('flight/CMakeLists.txt').toString('utf8'));
  for (const key of ['a32nx', 'jsbsim']) {
    if (!pins[key] || !UPSTREAM[key].commit.startsWith(pins[key])) refuse(`flight/CMakeLists.txt accepts ${key} ${pins[key]}, the release ships ${UPSTREAM[key].commit}`);
  }
  const a32nx = await step(`A32NX ${UPSTREAM.a32nx.commit.slice(0, 7)}, what is compiled`, () => tree(resolve(o.a32nx), UPSTREAM.a32nx.commit, UPSTREAM.a32nx.paths));
  const jsbsim = await step(`JSBSim ${UPSTREAM.jsbsim.commit.slice(0, 7)}, whole`, () => tree(resolve(o.jsbsim), UPSTREAM.jsbsim.commit));
  const three = await step('three.js, the files the page bundles', threeFiles);

  const values = templateValues({ commit, commitDate, epoch, three: three.version, esbuild: three.esbuild });
  const template = (name) => ours.get(`flight/web/release/${name}`)?.toString('utf8') ?? refuse(`flight/web/release/${name} is missing`);

  const source = new Map([['README.txt', Buffer.from(fill(template('README-source.txt'), values, 'README-source.txt'))]]);
  for (const [path, data] of ours) source.set(`a32x-cbt/${path}`, data);
  // Exported without .git, this repository names its own commit as the upstreams do, so that a build
  // from the archive can say which commit it is (the recordings' build line).
  if (ours.has('SOURCE-COMMIT')) refuse('this repository tracks a SOURCE-COMMIT; the release writes its own');
  source.set('a32x-cbt/SOURCE-COMMIT', Buffer.from(`${commit}\n`));
  for (const [key, files] of [['a32nx', a32nx], ['jsbsim', jsbsim]]) {
    for (const [path, data] of files) source.set(`upstream/${key}/${path}`, data);
    source.set(`upstream/${key}/SOURCE-COMMIT`, Buffer.from(`${UPSTREAM[key].commit}\n`));
  }
  for (const [path, data] of three.files) source.set(`upstream/three/${path}`, data);

  const work = mkdtempSync(join(tmpdir(), 'a32x-release-'));
  const fromRepo = relative(repo, work);
  if (!fromRepo.startsWith('..') && !isAbsolute(fromRepo)) refuse(`${work} is inside the repository; the release builds elsewhere`);
  // Nothing of this machine's file system may ride along: not the build folder, the repository or the home
  // folder, and in what was built not the clones either. Committed text may name a clone's folder as an
  // example (flight/contract does); it says nothing of this machine that the repository does not.
  const home = [work, repo, process.env.USERPROFILE, process.env.HOME, tmpdir()];
  const paths = [...home, resolve(o.a32nx), resolve(o.jsbsim)];
  let failed = true;
  try {
    checkSource(source, { paths: home });
    const sourceZip = await step(`${SOURCE}.zip, ${source.size} files`, () => archive(SOURCE, source, when));
    const sourcePath = join(work, `${SOURCE}.zip`);
    writeFileSync(sourcePath, sourceZip.bytes);

    // --- everything that ships, built from that archive ---------------------------------------------
    const unzipped = join(work, 'source');
    mkdirSync(unzipped);
    await step('unzipped by the system\'s tar', () => extract(sourcePath, unzipped));
    const root = join(unzipped, SOURCE);
    const module = await step(`the module, Emscripten ${EMSCRIPTEN.version}, from the archive`, () => buildModule(work, sourcePath, epoch));
    const owed = libraryNotices(module.libraries);
    const page = await step('the page, esbuild, from the archive', () => buildPage(root, module.core, join(work, 'web'), three.files));
    const exe = await step('A32X.exe, MSVC, from the archive', () => buildLauncher(root, work));
    const trainer = await step('the trainer, P5\'s packager, from the archive', () => buildTrainer(root, work, ours.get('app/web/app.js')));

    // --- the Windows archive ------------------------------------------------------------------------
    const upstreamFile = (tree, path) => (tree === 'jsbsim' ? jsbsim : ours).get(tree === 'jsbsim' ? path : `flight/${path}`)
      ?? refuse(`the module embeds ${tree === 'jsbsim' ? 'JSBSim\'s ' : 'flight/'}${path}, which is not at the commit`);
    const embedded = embeddedFiles(ours.get('flight/CMakeLists.txt').toString('utf8'));
    const aircraft = notice(
      `Data files compiled into web\\core.js, which the flight core reads at run time. JSBSim's are as its repository carries them at ${UPSTREAM.jsbsim.commit} (${UPSTREAM.jsbsim.tag}): each one's header follows, verbatim, and where a header names no licence the file is under JSBSim's LGPL-2.1 (notices\\JSBSim.txt). The rest are this project's, GPLv3 (LICENSE.txt).`,
      ...embedded.map(({ tree, path, at }) => {
        const text = upstreamFile(tree, path).toString('utf8');
        return tree === 'jsbsim'
          ? `${path}, from JSBSim (in the module at ${at})\n\n${xmlHeader(text, path)}`
          : `flight/${path}, this project's, GPLv3 (in the module at ${at})\n\n${wrap(firstParagraph(text, path))}`;
      }),
    );
    const dlmalloc = /This is a version \(aka dlmalloc\)[\s\S]*?\* Version [^\n]*/.exec(module.licence('dlmalloc.c'))?.[0]
      ?? refuse('dlmalloc.c no longer says how it is licensed');
    const emscriptenAbout = (what) => `${what} It is part of web\\core.js, which Emscripten ${EMSCRIPTEN.version} compiled and linked; its licence, as Emscripten ${EMSCRIPTEN.version} ships it, follows.`;
    const binary = new Map([
      ['A32X.exe', exe],
      ['README.txt', Buffer.from(fill(template('README.txt'), values, 'README.txt'))],
      ['LICENSE.txt', ours.get('flight/LICENSE')],
      ['web/index.html', page['index.html']],
      ['web/flight.js', page['flight.js']],
      ['web/core.js', page['core.js']],
      ...[...trainer].map(([name, data]) => [`trainer/${name}`, data]),
      ['notices/A32NX.txt', notice(
        `FlyByWire A32NX. The flight-control computers in web\\core.js, the ELACs, SECs, FACs and FCDCs with their laws, are compiled unmodified from FlyByWire Simulations' A32NX: ${UPSTREAM.a32nx.repository}, commit ${UPSTREAM.a32nx.commit} (${UPSTREAM.a32nx.date}), fbw-a32nx/src/wasm/fbw_a320/. Copyright the A32NX contributors. Licensed under the GNU General Public License, version 3, whose text, as the repository carries it, follows. Their source is in ${SOURCE}.zip, upstream/a32nx/.`,
        a32nx.get('LICENSE').toString('utf8'))],
      ['notices/JSBSim.txt', notice(
        `JSBSim. The airframe's flight dynamics in web\\core.js (its equations of motion, atmosphere, engines, landing gear and aerodynamic model) are JSBSim's, ${UPSTREAM.jsbsim.repository}, commit ${UPSTREAM.jsbsim.commit} (${UPSTREAM.jsbsim.tag}), linked in statically. Licensed under the GNU Lesser General Public License, version 2.1, whose text follows, then the authors as JSBSim lists them. Its source, from which web\\core.js can be relinked against a changed JSBSim, is in ${SOURCE}.zip, upstream/jsbsim/.`,
        jsbsim.get('COPYING').toString('utf8'), jsbsim.get('AUTHORS').toString('utf8'))],
      ['notices/aircraft-data.txt', aircraft],
      ['notices/Emscripten.txt', notice(emscriptenAbout('Emscripten\'s JavaScript runtime and its own system libraries, which load and run the WebAssembly.'), module.licence('Emscripten'))],
      ['notices/musl.txt', notice(emscriptenAbout('musl, the C library.'), module.licence('musl'))],
      ['notices/libc++.txt', notice(emscriptenAbout('libc++, LLVM\'s C++ standard library.'), module.licence('libc++'))],
      ['notices/libc++abi.txt', notice(emscriptenAbout('libc++abi, LLVM\'s C++ runtime.'), module.licence('libc++abi'))],
      ['notices/libunwind.txt', notice(emscriptenAbout('libunwind, LLVM\'s unwinder, which C++ exceptions use.'), module.licence('libunwind'))],
      ['notices/compiler-rt.txt', notice(emscriptenAbout('compiler-rt\'s builtins, LLVM\'s low-level runtime.'), module.licence('compiler-rt'))],
      ['notices/dlmalloc.txt', notice(
        `dlmalloc, Doug Lea's memory allocator, version 2.8.6. It is part of web\\core.js, which Emscripten ${EMSCRIPTEN.version} compiled and linked; its dedication to the public domain, as Emscripten's system/lib/dlmalloc.c carries it, follows.`,
        dlmalloc)],
      ['notices/three.js.txt', notice(
        `three.js ${three.version}, which draws the view. web\\flight.js bundles it; its licence, as its npm package carries it, follows. Its source as bundled is in ${SOURCE}.zip, upstream/three/.`,
        three.files.get('LICENSE').toString('utf8'))],
      ['notices/airport-data.txt', ours.get('flight/web/release/airport-data.txt')],
    ].map(([name, data]) => [name, Buffer.isBuffer(data) ? data : Buffer.from(data)]));
    checkBinary(binary, { trainer: [...trainer.keys()], owed, paths });
    const binaryZip = await step(`${BINARY}.zip, ${binary.size} files`, () => archive(BINARY, binary, when));

    mkdirSync(out, { recursive: true });
    writeFileSync(targets.source, sourceZip.bytes);
    writeFileSync(targets.binary, binaryZip.bytes);
    writeFileSync(targets.sums, `${binaryZip.sha256}  ${BINARY}.zip\n${sourceZip.sha256}  ${SOURCE}.zip\n`);
    failed = false;

    const cpu = load();
    const mb = (b) => `${(b.length / 1e6).toFixed(1)} MB`.padStart(8);
    console.log(`\nreleased a32x-sim ${VERSION} from ${commit} (${commitDate}); SOURCE_DATE_EPOCH ${epoch} for the module, zip entries dated ${when.toISOString().slice(0, 10)}`);
    console.log(`  ${mb(binaryZip.bytes)}  sha256 ${binaryZip.sha256}  ${relative(process.cwd(), targets.binary)}`);
    console.log(`  ${mb(sourceZip.bytes)}  sha256 ${sourceZip.sha256}  ${relative(process.cwd(), targets.source)}`);
    console.log(`  module: Emscripten ${EMSCRIPTEN.version}, linking -l${module.libraries.join(' -l')}; the_browser_module_flies: ${module.flew || 'passed'}`);
    console.log(`  ${((Date.now() - started) / 1000).toFixed(0)} s in all; the machine's processors ${cpu.toFixed(0)} % busy on average while it ran`);
  } finally {
    if (o.keep || failed) console.log(`build folder ${o.keep ? 'kept' : 'left for a look'}: ${work}`);
    else rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
}

const invoked = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href.toLowerCase();
if (invoked === import.meta.url.toLowerCase()) {
  main().catch((err) => {
    console.error(`\n${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  });
}
