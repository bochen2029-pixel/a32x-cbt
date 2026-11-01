// The flight core's worker. Its source is the module (flight_core.js, which defines createFlightCore)
// followed by this, made into a Blob by the page: no file is fetched, so it runs from file:// with the
// network off. One flight per worker; a new flight is a new worker. GPLv3.
//
// Messages in:  {type: 'start', airframe, scripted, scenario}
//               {type: 'step', ticks, inputs}   inputs: a Float64Array in the core's order, or null
//               {type: 'recording', extra}      at any time; extra: header lines by name (CoreSession)
// Messages out: {type: 'ready', inputNames, stateNames, state, texts, inputs, debrief}
//               {type: 'state', state, texts, inputs, debrief, ticks, ms}   ms: what the ticks cost in here
//               {type: 'recording', text, steps}  the flight so far, as law_harness --replay reads it
//               {type: 'error', message}
// debrief is the gate's judge as text (core.h, flight_debrief), on every message.

import { CoreSession } from './core-session.js';

/* global createFlightCore */

let session = null;

function report(type, extra) {
  const state = session.state();
  const inputs = session.inputs();
  self.postMessage({ type, state, inputs, texts: session.stateTexts(), debrief: session.debrief(), ...extra },
                   [state.buffer, inputs.buffer]);
}

self.onmessage = async (event) => {
  const m = event.data;
  try {
    if (m.type === 'start') {
      if (session) throw new Error('this worker has flown its flight; start a new worker');
      session = new CoreSession(await createFlightCore(), m.airframe, m.scripted, m.scenario);
      report('ready', { inputNames: session.inputNames, stateNames: session.stateNames });
    } else if (m.type === 'step') {
      const t0 = performance.now();
      session.step(m.ticks, m.inputs);
      report('state', { ticks: m.ticks, ms: performance.now() - t0 });
    } else if (m.type === 'recording') {
      self.postMessage({ type: 'recording', text: session.recording(m.extra || {}), steps: session.steps });
    }
  } catch (e) {
    self.postMessage({ type: 'error', message: String(e && e.message ? e.message : e) });
  }
};
