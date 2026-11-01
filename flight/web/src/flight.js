// The page's side of the flight core: a worker made from the embedded source, one step request in flight
// at a time. GPLv3.
//
// The source is globalThis.FLIGHT_CORE_SOURCE, which core.js (written by tools/build.mjs) defines: the
// module and the worker together, as one string. A Blob made from it is a worker that loads nothing, so
// the page runs from file:// with the network off.

// The name a recording is saved under: the airframe the core flew (the file's '# airframe:' line), the
// scenario or else the runway the flight started on, when it was flown (UTC, to the minute, so a pilot's
// five approaches sort in the order flown) and the simulated seconds. Nothing in it but letters,
// digits, '.', '_' and '-', so it is a file name on every system: wind=270/15 has a '/'.
export function recordingName(text, scenario, seconds, airframe = 'a320', flown = null) {
  const safe = (v) => String(v).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  const key = safe((/^# airframe: *(\S+)/m.exec(text) || [])[1] || airframe) || 'a320';
  const t = Number.isFinite(seconds) ? Math.max(0, Math.round(seconds)) : 0;
  const when = /^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(flown || '') ? `-${flown.slice(0, 16).replace(/[-:]/g, '')}Z` : '';
  return `a32x-${key}-${safe(scenario) || 'flight'}${when}-${String(t).padStart(4, '0')}s.csv`;
}

export class Flight {
  // onState(message) is called with each state the worker sends back.
  constructor(onState, onError) {
    if (typeof globalThis.FLIGHT_CORE_SOURCE !== 'string') throw new Error('core.js is not loaded');
    const url = URL.createObjectURL(new Blob([globalThis.FLIGHT_CORE_SOURCE], { type: 'text/javascript' }));
    this.worker = new Worker(url);
    URL.revokeObjectURL(url);
    this.onState = onState;
    this.onError = onError;
    this.busy = false;
    this.recordings = [];  // what recording() waits on, oldest first: the worker answers in order
    this.inputNames = [];
    this.stateNames = [];
    this.worker.onmessage = (e) => this.receive(e.data);
    this.worker.onerror = (e) => onError(e.message || 'the worker failed');
  }

  start(airframe, scripted, scenario = '') {
    return new Promise((resolve, reject) => {
      this.started = { resolve, reject };
      this.worker.postMessage({ type: 'start', airframe, scripted, scenario });
    });
  }

  // Asks for ticks steps with these inputs, unless the last request is still out: then false, and the
  // caller's clock keeps the debt.
  step(ticks, inputs) {
    if (this.busy || ticks <= 0) return false;
    this.busy = true;
    this.worker.postMessage({ type: 'step', ticks, inputs });
    return true;
  }

  // The flight so far, as law_harness --replay reads it: a promise of {text, steps}. extra: header lines
  // by name, {hands: the device, flown: the wall-clock time} (CoreSession.recording).
  recording(extra = {}) {
    return new Promise((resolve) => {
      this.recordings.push(resolve);
      this.worker.postMessage({ type: 'recording', extra });
    });
  }

  receive(m) {
    if (m.type === 'ready') {
      this.inputNames = m.inputNames;
      this.stateNames = m.stateNames;
      this.field = Object.fromEntries(m.stateNames.map((n, i) => [n, i]));
      this.input = Object.fromEntries(m.inputNames.map((n, i) => [n, i]));
      this.started.resolve(m);
      this.onState(m);
    } else if (m.type === 'state') {
      this.busy = false;
      this.onState(m);
    } else if (m.type === 'recording') {
      this.recordings.shift()(m);
    } else if (m.type === 'error') {
      this.busy = false;
      if (this.started && !this.inputNames.length) this.started.reject(new Error(m.message));
      this.onError(m.message);
    }
  }

  stop() {
    this.worker.terminate();
  }
}
