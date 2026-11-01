// Drives the built page in a throwaway headless Chrome or Edge, step by step, so that an agent (or a person) can see
// the simulator do something without sitting at it: keys held and let go, waits, the camera posed, JavaScript
// evaluated, screenshots. The page's own hooks do the rest: globalThis.flightReport (what it measured) and
// globalThis.flightDebug (the core's state by name, and the camera posed exactly; main.js). A tool for the desktop,
// not part of the page. GPLv3.
//
//   node tools/drive.mjs <steps.json> [--page <folder>] [--query "crew=script&time=dusk"] [--out <folder>] [--size 1440x900]
//
// The steps file is a JSON array; each step is one of
//   { "wait": 14 }                                  seconds
//   { "until": "<expression>", "timeout": 60 }      until it is true, checked four times a second; false at the timeout
//                                                   stops the run, as an error does
//   { "keydown": "ShiftLeft" }, { "keyup": "..." }  a key held and let go, by KeyboardEvent.code (hands.js reads codes)
//   { "press": "Digit4" }                           down then up: a camera's number, K, L, V, [ and ] ...
//   { "pose": { "camera": "orbit", "yaw": 0.7, "pitch": 0.25, "dist": 16 } }   flightDebug.pose
//   { "eval": "<expression>" }                      its value printed as JSON; an async expression is awaited
//   { "shot": "<name>" }                            <out>/<name>.png, the viewport
// and "note": "..." on any step is printed before it runs. Chrome is found where Windows installs it, or named by
// BROWSER. The DevTools protocol is spoken with node's own WebSocket; nothing is installed.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const option = (name, fallback) => {
  const at = process.argv.indexOf(name);
  return at > 0 && at + 1 < process.argv.length ? process.argv[at + 1] : fallback;
};
const stepsFile = process.argv[2];
if (!stepsFile || stepsFile.startsWith('--')) {
  console.error('usage: node tools/drive.mjs <steps.json> [--page <folder>] [--query "..."] [--out <folder>] [--size WxH]');
  process.exit(2);
}
const steps = JSON.parse(readFileSync(stepsFile, 'utf8'));
const page = resolve(option('--page', join(here, '..', '..', 'build-web')), 'index.html');
const query = option('--query', '');
const out = resolve(option('--out', join(process.cwd(), 'drive-shots')));
const [width, height] = option('--size', '1440x900').split('x').map(Number);

// The key a KeyboardEvent carries with its code: main.js reads camera keys by key, hands.js reads codes.
export function keyOf(code) {
  const digit = /^Digit(\d)$/.exec(code);
  if (digit) return digit[1];
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return letter[1].toLowerCase();
  return { ShiftLeft: 'Shift', ShiftRight: 'Shift', ControlLeft: 'Control', ControlRight: 'Control', BracketLeft: '[',
    BracketRight: ']', Comma: ',', Period: '.', Slash: '/', Space: ' ', Escape: 'Escape', Enter: 'Enter' }[code] ?? code;
}

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

const profile = mkdtempSync(join(tmpdir(), 'flight-drive-'));
const port = 9300 + Math.floor(Math.random() * 600);
const chrome = spawn(browser, [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run',
  '--no-default-browser-check', `--window-size=${width},${height}`,
  `${pathToFileURL(page).href}${query ? `?${query}` : ''}`,
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target = null;
for (let k = 0; k < 100 && !target; ++k) {
  await sleep(200);
  try {
    target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page');
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
const call = (method, params = {}) => new Promise((done) => {
  const mine = ++id;
  const on = (e) => {
    const m = JSON.parse(e.data);
    if (m.id !== mine) return;
    ws.removeEventListener('message', on);
    done(m.error ? { error: m.error.message } : m.result);
  };
  ws.addEventListener('message', on);
  ws.send(JSON.stringify({ id: mine, method, params }));
});
// an expression's value, awaited when it is a promise; a thrown error comes back as { error }
async function evaluate(expression) {
  const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.error) return { error: r.error };
  if (r.exceptionDetails) return { error: r.exceptionDetails.exception?.description ?? r.exceptionDetails.text };
  return { value: r.result?.value };
}
const key = (type, code) => evaluate(`window.dispatchEvent(new KeyboardEvent(${JSON.stringify(type)}, `
  + `{ code: ${JSON.stringify(code)}, key: ${JSON.stringify(keyOf(code))}, bubbles: true })), true`);

mkdirSync(out, { recursive: true });
let failed = false;
try {
  for (const step of steps) {
    if (step.note) console.log(`# ${step.note}`);
    if ('wait' in step) await sleep(step.wait * 1000);
    else if ('until' in step) {
      const end = Date.now() + (step.timeout ?? 60) * 1000;
      let ok = false;
      while (!ok && Date.now() < end) {
        ok = (await evaluate(`Boolean(${step.until})`)).value === true;
        if (!ok) await sleep(250);
      }
      console.log(`until ${step.until}: ${ok ? 'true' : 'timed out'}`);
      if (!ok) throw new Error(`timed out waiting for ${step.until}`);
    } else if ('keydown' in step) await key('keydown', step.keydown);
    else if ('keyup' in step) await key('keyup', step.keyup);
    else if ('press' in step) {
      await key('keydown', step.press);
      await key('keyup', step.press);
    } else if ('pose' in step) {
      const r = await evaluate(`flightDebug.pose(${JSON.stringify(step.pose)})`);
      if (r.error) throw new Error(`pose: ${r.error}`);
      await sleep(400);   // a frame or two drawn from there
    } else if ('eval' in step) {
      const r = await evaluate(step.eval);
      console.log(r.error ? `eval error: ${r.error}` : JSON.stringify(r.value));
    } else if ('shot' in step) {
      const shot = await call('Page.captureScreenshot', { format: 'png' });
      const file = join(out, `${step.shot}.png`);
      writeFileSync(file, Buffer.from(shot.data, 'base64'));
      console.log(`shot ${file}`);
    } else throw new Error(`a step this tool does not know: ${JSON.stringify(step)}`);
  }
} catch (e) {
  failed = true;
  console.error(String(e.message ?? e));
} finally {
  ws.close();
  chrome.kill();
  await sleep(500);
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    // the browser still holds it for a moment; the temp folder is swept with the rest
  }
}
process.exit(failed ? 1 : 0);
