// Headless Chrome over the DevTools protocol, on a pipe: no port is opened and nothing is left
// running. Shared by the measurement harness and the package gate. Node built-ins only.
//
// Every launch gets a throwaway profile, so every launch is cold, and the profile goes when the
// browser does. Every call has a deadline, so a wedged browser fails the run instead of hanging it.

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PLACES = {
  win32: [
    `${process.env.PROGRAMFILES}/Google/Chrome/Application/chrome.exe`,
    `${process.env['PROGRAMFILES(X86)']}/Google/Chrome/Application/chrome.exe`,
    `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`,
    `${process.env['PROGRAMFILES(X86)']}/Microsoft/Edge/Application/msedge.exe`,
    `${process.env.PROGRAMFILES}/Microsoft/Edge/Application/msedge.exe`,
  ],
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ],
  linux: [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
    '/usr/bin/microsoft-edge',
  ],
};

/**
 * A Chromium-family browser. `which` is 'chrome', 'edge', or a path; left out, it is $CHROME, else
 * the first browser installed in a usual place.
 */
export function findBrowser(which) {
  if (which && existsSync(which)) return which;
  if (!which && process.env.CHROME) return process.env.CHROME;
  const installed = (PLACES[process.platform] ?? []).filter((p) => existsSync(p));
  const pick = which ? installed.find((p) => p.toLowerCase().includes(which === 'edge' ? 'edge' : 'chrom')) : installed[0];
  if (!pick) throw new Error(`no ${which ?? 'Chrome, Chromium or Edge'} found; pass a path, or set CHROME`);
  return pick;
}

const FLAGS = [
  '--headless=new',
  '--remote-debugging-pipe',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  '--disable-component-update',
  '--disable-background-networking',
  '--disable-sync',
  '--disable-default-apps',
  '--mute-audio',
  // a headless page is the page in front: keep its timers and frames at full rate
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--window-size=1280,900',
];

const DEADLINE_MS = 30_000;

export class Browser {
  #child;
  #profile;
  #write;
  #next = 1;
  #calls = new Map();
  #listeners = new Set();
  #stderr = [];
  #exited;
  #reap;

  /** Start a browser. `args` are extra command-line flags. */
  static async launch({ browser, args = [] } = {}) {
    const executable = findBrowser(browser);
    const profile = mkdtempSync(join(tmpdir(), 'a32x-cbt-chrome-'));
    const spawnedAt = Date.now();
    const child = spawn(executable, [...FLAGS, `--user-data-dir=${profile}`, ...args, 'about:blank'], {
      stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const b = new Browser(child, profile, executable, spawnedAt);
    try {
      b.version = await b.send('Browser.getVersion');
    } catch (err) {
      await b.close();
      throw err;
    }
    return b;
  }

  constructor(child, profile, executable, spawnedAt) {
    this.#child = child;
    this.#profile = profile;
    this.executable = executable;
    this.spawnedAt = spawnedAt;
    this.#write = (text) => child.stdio[3].write(text);

    child.stderr.on('data', (b) => {
      this.#stderr.push(String(b));
      if (this.#stderr.length > 40) this.#stderr.shift();
    });

    let pending = Buffer.alloc(0);
    child.stdio[4].on('data', (chunk) => {
      pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
      for (let end = pending.indexOf(0); end >= 0; end = pending.indexOf(0)) {
        const message = JSON.parse(pending.toString('utf8', 0, end)); // whole messages only: UTF-8 may split
        pending = pending.subarray(end + 1);
        this.#receive(message);
      }
    });

    this.#exited = new Promise((resolve) => child.once('exit', resolve));
    this.#exited.then((code) => {
      const why = new Error(`browser exited (${code}) with calls outstanding\n${this.#stderr.join('').slice(-2000)}`);
      for (const c of this.#calls.values()) c.reject(why);
      this.#calls.clear();
    });
    this.#reap = () => child.exitCode === null && child.kill();
    process.once('exit', this.#reap);
  }

  #receive(m) {
    if (m.id !== undefined) {
      const call = this.#calls.get(m.id);
      if (!call) return;
      this.#calls.delete(m.id);
      clearTimeout(call.timer);
      if (m.error) call.reject(new Error(`${call.method}: ${m.error.message}`));
      else call.resolve(m.result);
      return;
    }
    for (const listen of this.#listeners) listen(m);
  }

  send(method, params = {}, sessionId, deadlineMs = DEADLINE_MS) {
    const id = this.#next++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#calls.delete(id);
        reject(new Error(`${method}: no answer in ${deadlineMs} ms`));
      }, deadlineMs);
      this.#calls.set(id, { method, resolve, reject, timer });
      this.#write(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }) + '\0');
    });
  }

  /** Subscribe to protocol events; returns the unsubscribe. */
  listen(fn) {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  /** The tab the browser opened with, attached and ready. */
  async page() {
    const { targetInfos } = await this.send('Target.getTargets');
    const tab = targetInfos.find((t) => t.type === 'page');
    if (!tab) throw new Error('the browser opened no page');
    const { sessionId } = await this.send('Target.attachToTarget', { targetId: tab.targetId, flatten: true });
    return new Page(this, sessionId);
  }

  /** Close the browser, wait for it to go, and remove its profile. Safe to call twice. */
  async close() {
    if (this.#child.exitCode === null) {
      this.send('Browser.close', {}, undefined, 5_000).catch(() => {});
      const gone = await Promise.race([this.#exited.then(() => true), sleep(5_000).then(() => false)]);
      if (!gone) {
        this.#child.kill();
        await this.#exited;
      }
    }
    process.removeListener('exit', this.#reap);
    rmSync(this.#profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
}

export class Page {
  #browser;

  constructor(browser, sessionId) {
    this.#browser = browser;
    this.sessionId = sessionId;
  }

  send(method, params = {}, deadlineMs) {
    return this.#browser.send(method, params, this.sessionId, deadlineMs);
  }

  /** Call `fn(params)` for each `method` event on this page; returns the unsubscribe. */
  on(method, fn) {
    return this.#browser.listen((m) => {
      if (m.sessionId === this.sessionId && m.method === method) fn(m.params);
    });
  }

  /** The next `method` event on this page, within the deadline. */
  next(method, deadlineMs = DEADLINE_MS) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        off();
        reject(new Error(`no ${method} in ${deadlineMs} ms`));
      }, deadlineMs);
      const off = this.on(method, (params) => {
        clearTimeout(timer);
        off();
        resolve(params);
      });
    });
  }

  /** Evaluate an expression in the page, awaiting a promise, and return its value. */
  async evaluate(expression, deadlineMs) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, deadlineMs);
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      throw new Error(`page threw: ${d.exception?.description ?? d.text}`);
    }
    return r.result.value;
  }

  /** Navigate and wait for the load event. Throws when the browser cannot open the URL. */
  async goto(url, deadlineMs = DEADLINE_MS) {
    await this.send('Page.enable');
    const loaded = this.next('Page.loadEventFired', deadlineMs);
    const r = await this.send('Page.navigate', { url });
    if (r.errorText) throw new Error(`cannot open ${url}: ${r.errorText}`);
    await loaded;
  }

  /** Poll an expression until it is truthy; return its value. */
  async until(expression, deadlineMs = 10_000, everyMs = 25) {
    const end = Date.now() + deadlineMs;
    for (;;) {
      const v = await this.evaluate(expression);
      if (v) return v;
      if (Date.now() > end) throw new Error(`timed out after ${deadlineMs} ms waiting for: ${expression}`);
      await sleep(everyMs);
    }
  }
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
