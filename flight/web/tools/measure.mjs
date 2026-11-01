// Opens the built page in a throwaway headless Chrome or Edge, lets it fly, and prints what it measured
// (globalThis.flightReport): the cost of a tick, the frames, and what drawing them cost. --software
// renders with SwiftShader, the CPU's rasteriser; --warp with WARP, Direct3D's own, which is what Chrome
// on Windows now falls back to with no usable GPU (found by fbw-desktop). A tool for the desktop, not
// part of the page. GPLv3.
//
//   node tools/measure.mjs [--page <folder>] [--query "crew=script&time=night"] [--seconds 20] [--software | --warp]
//
// Chrome is found where Windows installs it, or named by BROWSER. The DevTools protocol is spoken with
// node's own WebSocket; nothing is installed.

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const option = (name, fallback) => {
  const at = process.argv.indexOf(name);
  return at > 0 && at + 1 < process.argv.length ? process.argv[at + 1] : fallback;
};
const page = resolve(option('--page', join(here, '..', '..', 'build-web')), 'index.html');
const query = option('--query', '');
const seconds = Number(option('--seconds', '20'));
const software = process.argv.includes('--software');
const warp = process.argv.includes('--warp');

const candidates = [
  process.env.BROWSER,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
].filter(Boolean);
const browser = candidates.find((c) => existsSync(c));
if (!browser) {
  console.error('no Chrome or Edge found: name one with BROWSER=<path>');
  process.exit(2);
}

const profile = mkdtempSync(join(tmpdir(), 'flight-measure-'));
const port = 9300 + Math.floor(Math.random() * 600);
const args = [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run',
  '--no-default-browser-check', '--window-size=1440,900',
  ...(software ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu'] : []),
  ...(warp ? ['--use-angle=d3d11-warp'] : []),
  `${pathToFileURL(page).href}${query ? `?${query}` : ''}`,
];
const chrome = spawn(browser, args, { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target = null;
for (let k = 0; k < 100 && !target; ++k) {
  await sleep(200);
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    target = list.find((t) => t.type === 'page');
  } catch {
    // not listening yet
  }
}
if (!target) {
  chrome.kill();
  console.error('the browser never answered');
  process.exit(1);
}

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const call = (method, params) => new Promise((resolveCall) => {
  const mine = ++id;
  const on = (e) => {
    const m = JSON.parse(e.data);
    if (m.id === mine) {
      ws.removeEventListener('message', on);
      resolveCall(m.result);
    }
  };
  ws.addEventListener('message', on);
  ws.send(JSON.stringify({ id: mine, method, params }));
});

// The target can answer before the page has replaced about:blank; wait for the page's own report.
for (let k = 0; k < 150; ++k) {
  const r = await call('Runtime.evaluate', { expression: 'typeof flightReport', returnByValue: true });
  if (r?.result?.value === 'function') break;
  await sleep(200);
}
const result = await call('Runtime.evaluate', {
  expression: `(async () => { await new Promise((r) => setTimeout(r, ${seconds * 1000}));
                             return JSON.stringify(globalThis.flightReport ? flightReport() : null); })()`,
  awaitPromise: true,
  returnByValue: true,
});
ws.close();
chrome.kill();
await sleep(500);
try {
  rmSync(profile, { recursive: true, force: true });
} catch {
  // the browser may hold a file a moment longer
}
const report = result?.result?.value ? JSON.parse(result.result.value) : null;
console.log(JSON.stringify({ browser, software, warp, query, seconds, report }, null, 1));
process.exit(report && !report.error ? 0 : 1);
