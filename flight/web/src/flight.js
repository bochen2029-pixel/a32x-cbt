// The page's side of the flight core: a worker made from the embedded source, one step request in flight
// at a time. GPLv3.
//
// The source is globalThis.FLIGHT_CORE_SOURCE, which core.js (written by tools/build.mjs) defines: the
// module and the worker together, as one string. A Blob made from it is a worker that loads nothing, so
// the page runs from file:// with the network off.

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
