// The flight core's worker. Its source is the module (flight_core.js, which defines createFlightCore)
// followed by this, made into a Blob by the page: no file is fetched, so it runs from file:// with the
// network off. One flight per worker; a new flight is a new worker. GPLv3.
//
// Messages in:  {type: 'start', airframe, scripted}
//               {type: 'step', ticks, inputs}   inputs: a Float64Array in the core's order, or null
// Messages out: {type: 'ready', inputNames, stateNames, state, texts, inputs}
//               {type: 'state', state, texts, inputs, ticks, ms}   ms: what the ticks cost in here
//               {type: 'error', message}

import { CoreSession } from './core-session.js';

/* global createFlightCore */

let session = null;

function report(type, extra) {
  const state = session.state();
  const inputs = session.inputs();
  self.postMessage({ type, state, inputs, texts: session.stateTexts(), ...extra }, [state.buffer, inputs.buffer]);
}

self.onmessage = async (event) => {
  const m = event.data;
  try {
    if (m.type === 'start') {
      if (session) throw new Error('this worker has flown its flight; start a new worker');
      session = new CoreSession(await createFlightCore(), m.airframe, m.scripted);
      report('ready', { inputNames: session.inputNames, stateNames: session.stateNames });
    } else if (m.type === 'step') {
      const t0 = performance.now();
      session.step(m.ticks, m.inputs);
      report('state', { ticks: m.ticks, ms: performance.now() - t0 });
    }
  } catch (e) {
    self.postMessage({ type: 'error', message: String(e && e.message ? e.message : e) });
  }
};
