// The orbit sketch as a repository of its own, its history kept, ready to push. GPLv3.
//
//   node flight/orbit/tools/standalone.mjs [--branch orbit-standalone] [--out <folder>] [--force]
//
// 1. git subtree split: flight/orbit's own history, with the folder as the root, on a branch.
// 2. A worktree of that branch (default: beside the repository, ../orbit-standalone).
// 3. What the sketch borrows from the rest of a32x-cbt, copied in:
//    - flight/web's modules the page imports, and theirs, found by reading the imports, under
//      vendor/flight-web (the KDFW drawing and its data);
//    - app/tools' zip writer and Chrome driver, under tools/;
//    - flight's GPLv3 licence as LICENSE;
//    - docs/provenance.md, whole.
// 4. The paths that reached out of the folder pointed in. A package.json pins three.js and esbuild at
//    flight/web's versions, and a CLAUDE.md carries the house rules that apply to the sketch.
// 5. One commit on top. Nothing is pushed: the owner names the repository and says where it lives, then
//    git push <its URL> orbit-standalone:main
//
// Node built-ins and git only. A run with --force makes the branch and the worktree again from HEAD.

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const git = (cwd, args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function args(argv) {
  const out = { branch: 'orbit-standalone', force: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--force') out.force = true;
    else if (argv[i] === '--branch' || argv[i] === '--out') out[argv[i].slice(2)] = argv[++i];
    else throw new Error(`unknown argument ${argv[i]}`);
  }
  return out;
}

// every file under dir whose name passes test
function walk(dir, test, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== 'node_modules' && !name.startsWith('build')) walk(p, test, out);   // not build outputs; build.mjs is a source
    }
    else if (test(name)) out.push(p);
  }
  return out;
}

// the relative imports of a module: './x.js', '../data/y.json'
const relativeImports = (src) => [...src.matchAll(/(?:from\s*|import\s*\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g)].map((m) => m[1]);

// Rewrite text in a file: [from, to] pairs, every occurrence; returns how many were made.
function rewrite(file, pairs) {
  let s = readFileSync(file, 'utf8'), n = 0;
  for (const [a, b] of pairs) {
    const parts = s.split(a);
    n += parts.length - 1;
    s = parts.join(b);
  }
  if (n) writeFileSync(file, s);
  return n;
}

const CLAUDE_MD = `# House rules

The orbit sketch, split from a32x-cbt's \`flight/orbit\` with its history. These are the rules it was built
to, kept.

1. **Implement, do not port.** No third-party source is vendored. \`vendor/flight-web\` is a32x-cbt's own
   KDFW drawing, by the same owner, carried with this repository. Every outside source is named in
   \`docs/provenance.md\` with its licence.
2. **Time is fixed.** The core steps by 0.02 s; nothing reads a clock for the simulation
   (\`web/test/builds.test.mjs\` holds it). The same inputs give the same flight, bit for bit.
3. **Tests with the change, green before every commit**: the core natively and as WebAssembly, and the
   page (below). A test states physics or a promise, not how the code is written, and is shown able to
   fail.
4. **Failure is visible.** A part that fails at start says so in the status line; the page test loads the
   built page on every tier.
5. **Every texture is painted by code.** No image, model or font file ships.
6. **Never claim a real vehicle's fidelity.** It is a sketch with one fiction, the drive.
7. **GPLv3** (\`LICENSE\`): this code once linked GPL flight software in a32x-cbt's \`flight/\`, and keeps
   that licence until its owner decides otherwise (\`handoff/LICENSING.md\`).

## Build and test

\`\`\`
npm ci
cmake -S . -B build -G Ninja && cmake --build build && ctest --test-dir build -j6
source <emsdk>/emsdk_env.sh && emcmake cmake -S . -B build-wasm -G Ninja && cmake --build build-wasm && ctest --test-dir build-wasm -j6
node web/tools/build.mjs --core build-wasm/orbit_core.js --core-js build-wasm/orbit_core_plain.js
cd web && node --test test/*.test.mjs
\`\`\`
`;

function main() {
  const a = args(process.argv.slice(2));
  const root = git(here, ['rev-parse', '--show-toplevel']);
  if (!existsSync(join(root, 'flight', 'orbit', 'CMakeLists.txt'))) throw new Error(`${root} has no flight/orbit: run this from a32x-cbt`);
  const out = resolve(a.out ?? join(root, '..', a.branch));   // beside the repository, not inside it
  const dirty = git(root, ['status', '--porcelain', '--', 'flight/orbit', 'flight/web', 'app/tools', 'flight/LICENSE', 'docs/provenance.md']);
  if (dirty) console.warn(`note: uncommitted changes are not carried (the split takes HEAD):\n${dirty}`);
  const head = git(root, ['rev-parse', '--short', 'HEAD']);

  // 1-2. the split and its worktree
  const exists = (() => { try { git(root, ['rev-parse', '--verify', '--quiet', `refs/heads/${a.branch}`]); return true; } catch { return false; } })();
  if (exists || existsSync(out)) {
    if (!a.force) throw new Error(`${exists ? `branch ${a.branch}` : ''}${exists && existsSync(out) ? ' and ' : ''}${existsSync(out) ? out : ''} already there: --force to make them again`);
    if (existsSync(out)) { try { git(root, ['worktree', 'remove', '--force', out]); } catch { rmSync(out, { recursive: true, force: true }); } }
    try { git(root, ['worktree', 'prune']); } catch { /* nothing to prune */ }
    if (exists) git(root, ['branch', '-D', a.branch]);
  }
  console.log(`splitting flight/orbit's history at ${head}…`);
  const split = execFileSync('git', ['-C', root, 'subtree', 'split', '--prefix=flight/orbit', '-b', a.branch], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim().split('\n').pop();
  git(root, ['worktree', 'add', out, a.branch]);

  // 3. what the page borrows from flight/web, and what that borrows, transitively
  const flightWeb = join(root, 'flight', 'web');
  const pageFiles = walk(join(out, 'web'), (n) => /\.(m?js|cjs)$/.test(n));
  const wanted = new Set();
  for (const f of pageFiles) {
    for (const m of readFileSync(f, 'utf8').matchAll(/['"](?:\.\.\/){3}web\/((?:src|data)\/[^'"]+)['"]/g)) wanted.add(m[1]);
  }
  const queue = [...wanted];
  while (queue.length) {
    const rel = queue.pop();
    if (!/\.m?js$/.test(rel)) continue;
    for (const spec of relativeImports(readFileSync(join(flightWeb, rel), 'utf8'))) {
      const next = relative(flightWeb, resolve(dirname(join(flightWeb, rel)), spec));
      if (!wanted.has(next)) { wanted.add(next); queue.push(next); }
    }
  }
  for (const rel of [...wanted].sort()) {
    const to = join(out, 'vendor', 'flight-web', rel);
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(join(flightWeb, rel), to);
  }
  mkdirSync(join(out, 'tools'), { recursive: true });
  for (const t of ['zip.mjs', 'chrome.mjs']) copyFileSync(join(root, 'app', 'tools', t), join(out, 'tools', t));
  copyFileSync(join(root, 'flight', 'LICENSE'), join(out, 'LICENSE'));
  mkdirSync(join(out, 'docs'), { recursive: true });
  writeFileSync(join(out, 'docs', 'provenance.md'),
    `<!-- a32x-cbt's docs/provenance.md, carried whole at ${head}. The orbit sketch's own sections are 1f (the runways and KDFW drawn), 1h (the orbit sketch: every part), 2a and 2b (what ships, Emscripten) and 3 (the words it may use of itself). -->\n\n` +
    readFileSync(join(root, 'docs', 'provenance.md'), 'utf8'));

  // 4. the paths that reached out of the folder, pointed in
  let n = 0;
  for (const f of pageFiles) {
    n += rewrite(f, [
      ["'../../../web/", "'../../vendor/flight-web/"], ['"../../../web/', '"../../vendor/flight-web/'],
      ["'..', '..', '..', 'web', 'node_modules'", "'..', '..', 'node_modules'"],
      ["[join(here, '..', '..', '..', 'web')]", "[join(here, '..', '..')]"],
      ["resolve(web, '..', '..', 'web')", "resolve(web, '..')"],
    ]);
  }
  n += rewrite(join(out, 'guide', 'build-guide.mjs'), [["'../../../app/tools/chrome.mjs'", "'../tools/chrome.mjs'"]]);
  for (const f of ['package.mjs', 'package.test.mjs']) n += rewrite(join(out, 'handoff', 'tools', f), [["'../../../../app/tools/zip.mjs'", "'../../tools/zip.mjs'"]]);
  for (const f of ['README.md', 'INVARIANTS.md']) {
    n += rewrite(join(out, f), [
      ['npm ci in flight/web', 'npm ci at the root'], ['`flight/orbit/', '`'], [' flight/orbit/', ' '], ['(flight/orbit/', '('],
      ['cd flight/orbit && ', ''], ['`cd flight/orbit`', '`.`'],
    ]);
  }
  const versions = JSON.parse(readFileSync(join(flightWeb, 'package.json'), 'utf8'));
  const pick = (name) => (versions.dependencies || {})[name] || (versions.devDependencies || {})[name];
  writeFileSync(join(out, 'package.json'), JSON.stringify({
    name: 'runway-to-ring', private: true,
    description: "A spaceplane from KDFW 17C to a ring station in orbit and back, the orbit sketch split from a32x-cbt's flight/orbit.",
    license: 'GPL-3.0-only',
    scripts: {
      build: 'node web/tools/build.mjs --core build-wasm/orbit_core.js --core-js build-wasm/orbit_core_plain.js',
      test: 'cd web && node --test test/*.test.mjs',
    },
    devDependencies: { esbuild: pick('esbuild'), three: pick('three') },
  }, null, 2) + '\n');
  writeFileSync(join(out, 'CLAUDE.md'), CLAUDE_MD);
  writeFileSync(join(out, '.gitignore'), ['build/', 'build-wasm/', 'build-web/', 'node_modules/', 'guide/out/', ''].join('\n'));
  const readme = readFileSync(join(out, 'README.md'), 'utf8');
  writeFileSync(join(out, 'README.md'),
    `> Split from a32x-cbt's \`flight/orbit\` at ${head}, with its history (${split.slice(0, 7)} is the last commit of it). \`vendor/flight-web\` is a32x-cbt's KDFW drawing, which the page reuses; \`tools/zip.mjs\` and \`tools/chrome.mjs\` are a32x-cbt's own. Build and test: \`CLAUDE.md\`.\n\n` + readme);

  // 5. one commit on top
  git(out, ['add', '-A']);
  execFileSync('git', ['-C', out, 'commit', '-q', '-F', '-'], {
    input: `feat: the orbit sketch as a repository of its own\n\nSplit from a32x-cbt's flight/orbit at ${head} with git subtree, its history kept.\nCopied in what it borrowed from the rest of a32x-cbt:\n- flight/web's modules the page imports, and theirs (${wanted.size} files), under\n  vendor/flight-web;\n- app/tools' zip writer and Chrome driver, under tools/;\n- flight's GPLv3 licence as LICENSE;\n- docs/provenance.md.\nThe paths that reached out of the folder point in (${n} of them). package.json pins\nthree.js and esbuild at flight/web's versions. CLAUDE.md carries the house rules.\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01E4nrb6dFnatXPkspSD5nCm\n`,
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  console.log(`branch ${a.branch}: ${git(out, ['log', '--oneline', '-1'])}, ${git(out, ['rev-list', '--count', 'HEAD'])} commits`);
  console.log(`worktree ${out}: ${wanted.size} files vendored, ${n} paths pointed in`);
  console.log(`next: cd ${out} && npm ci, then CLAUDE.md's build and test; to publish: git push <new repository> ${a.branch}:main`);
}

try { main(); } catch (e) { console.error(e.message); process.exit(1); }
