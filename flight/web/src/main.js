// The flyable simulator's page: the flight core in its worker at 50 Hz under the display's own rate.
// GPLv3.
//
//   index.html?airframe=a320|737&crew=hands|script[&scenario=approach;distance=10;wind=227/15][&bench=MINUTES]
//
// crew=script lets the harness's own crew fly; the default is hands on the controls: a joystick through
// the Gamepad API, or the keyboard (hands.js). scenario= starts the flight elsewhere than on the runway:
// "approach" puts it on LSZH 14's ILS, trimmed, its options as core.h lists them. bench=MINUTES first
// flies that many simulated minutes as fast as the worker can, in batches of 500 ticks, and reports the
// cost of a tick: the headroom under 50 Hz, free of the timer's coarse grain.

import { Clock } from './clock.js';
import { apply, controlsFromInputs, coreInputs, initialControls } from './controls.js';
import { FlightLog } from './events.js';
import { Flight, recordingName } from './flight.js';
import { Hands, KEY_HELP } from './hands.js';
import { Overlay } from './overlay.js';
import { runwayFromState } from './scene-math.js';
import { CAMERAS, softwareRendering, View, VIEW_KEYS } from './view.js';

const params = new URLSearchParams(location.search);
const airframe = params.get('airframe') || '';
const scripted = params.get('crew') === 'script';
const scenario = params.get('scenario') || '';
const benchTicks = Math.round(Number(params.get('bench') || 0) * 60 * 50);
const bench = { ticks: 0, ms: 0, wallMs: 0, done: benchTicks <= 0 };

const hud = document.getElementById('hud');
const status = document.getElementById('status');
// Antialiasing doubles the cost of a frame drawn in software; on a GPU it is nearly free. aa=0|1 decides.
// The view's tier: the floor where the CPU draws, the GPU tier elsewhere; tier=low|high decides, and
// hour= sets the GPU tier's solar hour (time= names one: dawn, day, golden, dusk, night).
const software = softwareRendering();
const view = new View(document.getElementById('view'), params.get('time') || 'dusk',
                      params.has('aa') ? params.get('aa') !== '0' : !software,
                      { software, tier: params.get('tier'), hour: params.has('hour') ? Number(params.get('hour')) : null,
                        flying: airframe === '737' ? '737' : 'a320' });
let drawn = '';          // the airport the view drew, and the runway end the flight is on
const overlayCanvas = document.getElementById('overlay');
const panel = document.getElementById('debrief'), verdict = document.getElementById('verdict');
const eventsBox = document.getElementById('events');
const log = new FlightLog();   // the flight's moments, from the core's slots (events.js)
let shownLog = 0;              // the log's version the panel shows
let shownVerdict = '';   // the verdict the panel shows
let saved = '';          // what the last save did, for the status line
document.getElementById('save').addEventListener('click', () => save());
const overlay = new Overlay(overlayCanvas);

// The view's own keys, beside the hands' (hands.js uses none of these): cameras, the hour, the debrief.
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
    e.preventDefault();
    save();
    return;
  }
  if (e.ctrlKey || e.altKey || e.metaKey || !view.body) return;
  if (/^[0-9]$/.test(e.key)) view.setCamera(CAMERAS[(Number(e.key) + 9) % 10]);
  else if (e.key === 'v' || e.key === 'V') view.nextCamera();
  else if (e.key === '[') view.moveHour(-0.25);
  else if (e.key === ']') view.moveHour(0.25);
  else if (e.key === 'k' || e.key === 'K') view.setDebrief(!view.debriefOn);
  else if (e.key === 'l' || e.key === 'L') view.setTrail(!view.trailOn);
});
function resize() {
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  view.resize(window.innerWidth, window.innerHeight);
  overlay.resize(window.innerWidth, window.innerHeight, ratio);
}
window.addEventListener('resize', resize);
resize();
const renderMs = [], frameMs = [];  // the last few thousand frames: what drawing cost, and how often

const clock = new Clock(20, 5);
const hands = new Hands(window);
let controls = initialControls();
let inputs = null;       // the core's input slots as the page sends them: the ready message's, then ours
let latest = null;       // the last state message from the worker
let error = null;
const tickUs = [];       // what each tick cost in the worker, microseconds
let requests = 0, frames = 0;

const flight = new Flight(
  (m) => {
    latest = m;
    if (m.type !== 'state' || !(m.ticks > 0)) return;
    if (!bench.done) {
      bench.ticks += m.ticks;
      bench.ms += m.ms;
      if (bench.ticks >= benchTicks) {
        bench.done = true;
        bench.wallMs = performance.now() - bench.wallMs;
        requestAnimationFrame(frame);
      } else {
        flight.step(Math.min(500, benchTicks - bench.ticks), null);
      }
      return;
    }
    const perTick = (m.ms * 1000) / m.ticks;
    for (let k = 0; k < m.ticks; ++k) tickUs.push(perTick);
  },
  (message) => {
    error = message;
    status.innerHTML = `<span class="bad">${message}</span>`;
  });

function value(name) {
  return latest ? latest.state[flight.field[name]] : NaN;
}

function stats(list) {
  const sorted = [...list].sort((a, b) => a - b);
  const at = (q) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : NaN);
  return { frames: sorted.length, mean: sorted.reduce((a, b) => a + b, 0) / Math.max(1, sorted.length), p50: at(0.5), p99: at(0.99) };
}

// What the page has measured, for a person and for a test driving the page.
function report() {
  const sorted = [...tickUs].sort((a, b) => a - b);
  const at = (q) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : NaN);
  const mean = sorted.length ? sorted.reduce((a, b) => a + b, 0) / sorted.length : NaN;
  return {
    error,
    airframe: airframe || 'default',
    crew: scripted ? 'script' : 'hands',
    scenario: scenario || 'runway',
    airport: drawn,
    simulatedS: value('t_s'),
    stepsDue: clock.steps,
    stepsDropped: clock.dropped + droppedWaiting,
    lastDropS,
    frames,
    requests,
    tickUs: { mean, p50: at(0.5), p99: at(0.99), max: sorted.length ? sorted[sorted.length - 1] : NaN },
    view: {
      renderer: view.rendererName(),
      software,
      tier: view.floor ? 'low' : 'high',
      camera: view.mode,
      antialias: view.renderer.getContextAttributes().antialias,
      eye: view.camera.position.toArray().map((v) => +v.toFixed(2)),
      drawn: { calls: view.renderer.info.render.calls, triangles: view.renderer.info.render.triangles, points: view.renderer.info.render.points },
      renderMs: stats(renderMs),
      frameMs: stats(frameMs),
    },
    bench: benchTicks > 0 ? {
      done: bench.done,
      ticks: bench.ticks,
      usPerTick: (bench.ms * 1000) / Math.max(1, bench.ticks),
      timesRealTime: (bench.ticks * 20) / Math.max(1e-9, bench.ms),
      wallS: bench.wallMs / 1000,
    } : null,
    texts: latest ? latest.texts : null,
  };
}
globalThis.flightReport = report;

const FLAPS = ['0', '1', '2', '3', 'FULL'];
const DETENT_NAMES = { 0: 'IDLE', 25: 'CL', 35: 'FLX/MCT', 45: 'TOGA' };

function show() {
  if (!latest) return;
  const t = latest.texts;
  const c = controls;
  const lever = DETENT_NAMES[c.tla] || `${c.tla.toFixed(1)}°`;
  const thr = value('thr_along_m');
  hud.textContent =
    `${value('t_s').toFixed(1).padStart(7)} s   ${t.phase}` +
    (thr > 0 ? `   THR ${(thr / 1852).toFixed(1)} nm` : '') + '\n' +
    `CAS ${value('cas_kn').toFixed(0).padStart(4)} kt   ALT ${value('alt_ft').toFixed(0).padStart(6)} ft   ` +
    `V/S ${value('vs_fpm').toFixed(0).padStart(6)}\n` +
    `PITCH ${value('pitch_deg').toFixed(1).padStart(6)}   BANK ${value('roll_deg').toFixed(1).padStart(6)}   ` +
    `HDG ${value('heading_deg').toFixed(0).padStart(4)}\n` +
    `LAW  pitch ${t.pitch_law}  roll ${t.lateral_law}\n` +
    (scripted ? '' :
      `STICK ${c.pitch.toFixed(2).padStart(5)} ${c.roll.toFixed(2).padStart(5)}  RUD ${c.pedals.toFixed(2).padStart(5)}  ` +
      `THR ${lever}  FLAPS ${FLAPS[c.flapLever]}  GEAR ${c.gearDown ? 'DN' : 'UP'}\n` +
      `${c.parkingBrake ? 'PARK BRK  ' : ''}${c.toeBrakes ? 'BRAKES  ' : ''}${c.speedbrake ? 'SPD BRK  ' : ''}` +
      `${c.spoilersArmed ? 'GND SPLR ARM  ' : ''}${c.rudderTrim ? `RUD TRIM ${c.rudderTrim > 0 ? 'L' : 'R'}  ` : ''}` +
      `${c.takeover ? 'TAKEOVER (no autopilot yet)' : ''}\n`) +
    `${hands.prompt()}` + (hands.help ? `\n\n${[...KEY_HELP, ...VIEW_KEYS, 'Ctrl+S  save the recording'].join('\n')}` : '');
  const r = report();
  const cls = r.stepsDropped ? 'warn' : '';
  status.innerHTML = `${r.airport} · ${r.airframe} · ${r.crew}\n${view.describe()}\n` +
    `tick ${r.tickUs.mean.toFixed(0)} µs mean, ${r.tickUs.max.toFixed(0)} max of 20000\n` +
    `<span class="${cls}">${r.stepsDropped} steps dropped</span>` + (saved ? `\n${saved}` : '');
  // the gate's verdict once the core has stopped judging, as the core words it (flight_debrief())
  const judged = Number.isFinite(value('judge_stable'));
  // a worker too old to send the core's words gets the verdict from the slots, said as plainly
  const words = latest.debrief || (judged ? `${value('judge_stable') ? 'STABLE' : 'NOT STABLE'}, the touchdown ` +
    `${value('judge_touchdown_m').toFixed(0)} m past the threshold` : '');
  const open = judged || view.debriefOn;   // once judged; and in the debrief (K) as it flies
  if (open && words !== shownVerdict) {
    shownVerdict = words;
    verdict.textContent = words;
  }
  if (open && log.version !== shownLog) {
    shownLog = log.version;
    eventsBox.textContent = log.text();
  }
  panel.hidden = !open;
}

// The recording, saved as the one file a pilot hands in: the scenario, the airframe and every step's
// inputs, which law_harness --replay judges as it stands. Named for the airframe, the scenario (or the
// runway the flight started on) and the simulated seconds; only letters, digits, '.', '_' and '-'.
async function save() {
  if (!latest) return;
  // who flew it and when, as header lines the gate's --repeatable prints (P7's recording contract)
  const extra = { hands: hands.pad ? hands.pad.id : 'keyboard', flown: flownAt || new Date().toISOString() };
  const reply = await Promise.race([flight.recording(extra), new Promise((resolve) => setTimeout(() => resolve(null), 3000))]);
  if (!reply || typeof reply.text !== 'string' || !reply.text) {
    saved = '<span class="bad">no recording: this core does not keep one</span>';
    return;
  }
  const name = recordingName(reply.text, scenario || drawn, value('t_s'), airframe || 'a320', extra.flown);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([reply.text], { type: 'text/csv' }));
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  saved = `saved ${name} (${reply.steps} steps)`;
}

let last = 0;
let started = false;     // the clock is running: the worker has answered once
let flownAt = null;      // when the flight's clock started, wall-clock UTC: for the recording's header only
let kicked = false;      // the step that wakes the worker has been asked for
let pending = 0;         // steps due but not yet asked for: the worker was still busy
let droppedWaiting = 0;  // steps given up because the worker stayed busy past five
let lastDropS = NaN;     // simulated time of the last frame that dropped steps
function frame(now) {
  ++frames;
  // The clock runs from the worker's first answer: a fresh core's first steps, JSBSim and the computers
  // starting, are slow, and the time they take is not the flight's. Until then one step is asked for,
  // outside the clock's count; the flight's own time and its recording are the same either way.
  if (!started && latest && latest.type === 'state') {
    started = true;
    last = 0;
    flownAt = new Date().toISOString();   // metadata, not simulation (CLAUDE.md, 2)
  }
  const realMs = started && last ? Math.min(now - last, 1000) : 0;
  last = now;
  // The clock decides the steps. While the worker still owes the last answer they wait, up to five;
  // past that they are dropped, as the clock drops its own.
  const droppedBefore = clock.dropped + droppedWaiting;
  pending += clock.advance(realMs);
  if (pending > clock.maxCatchUp) {
    droppedWaiting += pending - clock.maxCatchUp;
    pending = clock.maxCatchUp;
  }
  if (clock.dropped + droppedWaiting > droppedBefore) lastDropS = value('t_s');

  // The hands, once a frame; the steps this frame asks for all fly what they did.
  const h = hands.read(realMs / 1000);
  controls = apply(controls, h.axes, h.held, h.pressed, realMs / 1000);
  for (const [name, v] of Object.entries(coreInputs(controls))) inputs[flight.input[name]] = v;

  if (pending && flight.step(pending, scripted ? null : inputs.slice())) {
    ++requests;
    pending = 0;
  }
  if (!started && !kicked && flight.step(1, scripted ? null : inputs.slice())) {
    kicked = true;
    ++requests;
  }
  if (latest) {
    const s = Object.fromEntries(flight.stateNames.map((n, i) => [n, latest.state[i]]));
    view.update(s, realMs / 1000);
    log.observe(s, latest.texts);
    view.tags(log.events);
    const t0 = performance.now();
    view.render();
    keep(renderMs, performance.now() - t0);
    if (realMs > 0) keep(frameMs, realMs);
    // the overlay's symbols are conformal to the pilot's eye: drawn there only
    overlayCanvas.style.visibility = view.overlayShown ? '' : 'hidden';
    const ils = s.loc_valid || s.gs_valid ? { loc: s.loc_valid ? s.loc_dots : null, gs: s.gs_valid ? s.gs_dots : null } : null;
    if (view.overlayShown) overlay.draw(s, view.camera.fov, controls, ils);
  }
  show();
  if (!error) requestAnimationFrame(frame);
}

function keep(list, v) {
  list.push(v);
  if (list.length > 3000) list.splice(0, list.length - 3000);
}

flight.start(airframe, scripted, scenario).then((ready) => {
  inputs = Float64Array.from(ready.inputs);  // the core's own start: FLT CTL pushbuttons pressed
  controls = controlsFromInputs(inputs, flight.input);
  try {
    const s = Object.fromEntries(flight.stateNames.map((n, i) => [n, ready.state[i]]));
    drawn = view.setRunway(runwayFromState(s));
    if (params.has('cam')) view.setCamera(params.get('cam'));
    // the first frame's cost (shaders, the airport's geometry and textures) paid here, before the clock
    // runs, not out of the flight's first steps
    view.update(s, 0);   // its first update warms the view: View.warm
    if (params.get('trail') === '1') view.setTrail(true);
    if (params.get('debrief') === '1') view.setDebrief(true);
  } catch (e) {
    // a bad airport file stops the page, said where it can be seen (CLAUDE.md, 9)
    error = `the airport could not be drawn: ${e.message}`;
    status.innerHTML = `<span class="bad">${error}</span>`;
    return;
  }
  status.textContent = bench.done ? 'flying' : 'measuring a tick…';
  if (bench.done) {
    requestAnimationFrame(frame);
  } else {
    bench.wallMs = performance.now();
    flight.step(Math.min(500, benchTicks), null);
  }
}, () => {});
