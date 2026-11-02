// The flight core's worker. Its source is the module (flight_core.js, which defines createFlightCore)
// followed by this, made into a Blob by the page: no file is fetched, so it runs from file:// with the
// network off. One flight per worker; a new flight is a new worker. GPLv3.
//
// Messages in:  {type: 'start', airframe, scripted, scenario}
//               {type: 'replay', text}          in place of start: a saved recording flown again (core-session.js,
//                                               Replay), from the scenario and on the airframe it names
//               {type: 'step', ticks, inputs}   inputs: a Float64Array in the core's order, or null; in a replay
//                                               the recording's rows fly, a row a tick, and inputs are passed over
//               {type: 'recording', extra}      at any time; extra: header lines by name (CoreSession); in a
//                                               replay, the recording as it was opened: a replay is not a flight
//               {type: 'command', name}         to the scripted crew (core.h, flight_command): "flare", where
//                                               its flare waits for one (flare=external); never in a replay
// Messages out: {type: 'ready', inputNames, stateNames, build, state, texts, inputs, debrief, replay}
//               {type: 'state', state, texts, inputs, debrief, ticks, ms, replay}   ms: what the ticks cost in here
//               {type: 'recording', text, steps, replayed}  the flight so far, as law_harness --replay reads it
//               {type: 'command', name, taken}   whether the command was taken
//               {type: 'error', message}
// debrief is the gate's judge as text (core.h, flight_debrief), on every message. replay, in a replay only: on
// 'ready' what the recording says of itself (Replay.info: where, on what, by whom and on which build it was
// flown, its length, a note on the build); on 'state' how far it has flown, and once it has ended the verdict
// against the one it was saved with (Replay.progress). ticks: how many flew, none once a replay has ended.

import { CoreSession, Replay } from './core-session.js';

/* global createFlightCore */

let session = null;
let replay = null;

function report(type, extra) {
  const state = session.state();
  const inputs = session.inputs();
  self.postMessage({ type, state, inputs, texts: session.stateTexts(), debrief: session.debrief(), ...extra },
                   [state.buffer, inputs.buffer]);
}

self.onmessage = async (event) => {
  const m = event.data;
  try {
    if (m.type === 'start' || m.type === 'replay') {
      if (session) throw new Error('this worker has flown its flight; start a new worker');
      const mod = await createFlightCore();
      if (m.type === 'replay') {
        replay = new Replay(mod, m.text);
        session = replay.session;
      } else {
        session = new CoreSession(mod, m.airframe, m.scripted, m.scenario);
      }
      report('ready', {
        inputNames: session.inputNames, stateNames: session.stateNames, build: session.build,
        ...(replay ? { replay: replay.info() } : {}),
      });
    } else if (m.type === 'step') {
      const t0 = performance.now();
      const ticks = replay ? replay.step(m.ticks) : (session.step(m.ticks, m.inputs), m.ticks);
      report('state', { ticks, ms: performance.now() - t0, ...(replay ? { replay: replay.progress() } : {}) });
    } else if (m.type === 'command') {
      self.postMessage({ type: 'command', name: m.name, taken: !replay && session.command(m.name) });
    } else if (m.type === 'recording') {
      if (replay) self.postMessage({ type: 'recording', text: replay.text, steps: replay.steps, replayed: true });
      else self.postMessage({ type: 'recording', text: session.recording(m.extra || {}), steps: session.steps });
    }
  } catch (e) {
    self.postMessage({ type: 'error', message: String(e && e.message ? e.message : e) });
  }
};
