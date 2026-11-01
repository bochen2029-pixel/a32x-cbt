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
import { Flight } from './flight.js';
import { Hands, KEY_HELP } from './hands.js';
import { Overlay } from './overlay.js';
import { runwayFromState } from './scene-math.js';
import { softwareRendering, View } from './view.js';

const params = new URLSearchParams(location.search);
const airframe = params.get('airframe') || '';
const scripted = params.get('crew') === 'script';
const scenario = params.get('scenario') || '';
const benchTicks = Math.round(Number(params.get('bench') || 0) * 60 * 50);
const bench = { ticks: 0, ms: 0, wallMs: 0, done: benchTicks <= 0 };

const hud = document.getElementById('hud');
const status = document.getElementById('status');
// Antialiasing doubles the cost of a frame drawn in software; on a GPU it is nearly free. aa=0|1 decides.
const software = softwareRendering();
const view = new View(document.getElementById('view'), params.get('time') || 'dusk',
                      params.has('aa') ? params.get('aa') !== '0' : !software, { software });
let drawn = '';          // the airport the view drew, and the runway end the flight is on
const overlay = new Overlay(document.getElementById('overlay'));
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
    `${hands.prompt()}` + (hands.help ? `\n\n${KEY_HELP.join('\n')}` : '');
  const r = report();
  const cls = r.stepsDropped ? 'warn' : '';
  status.innerHTML = `${r.airport} · ${r.airframe} · ${r.crew}\n` +
    `tick ${r.tickUs.mean.toFixed(0)} µs mean, ${r.tickUs.max.toFixed(0)} max of 20000\n` +
    `<span class="${cls}">${r.stepsDropped} steps dropped</span>`;
}

let last = 0;
let pending = 0;         // steps due but not yet asked for: the worker was still busy
let droppedWaiting = 0;  // steps given up because the worker stayed busy past five
let lastDropS = NaN;     // simulated time of the last frame that dropped steps
function frame(now) {
  ++frames;
  const realMs = last ? Math.min(now - last, 1000) : 0;
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
  if (latest) {
    const s = Object.fromEntries(flight.stateNames.map((n, i) => [n, latest.state[i]]));
    view.update(s.lat_deg, s.lon_deg, s.ra_ft, s.pitch_deg, s.roll_deg, s.heading_deg, s.t_s);
    const t0 = performance.now();
    view.render();
    keep(renderMs, performance.now() - t0);
    if (realMs > 0) keep(frameMs, realMs);
    const ils = s.loc_valid || s.gs_valid ? { loc: s.loc_valid ? s.loc_dots : null, gs: s.gs_valid ? s.gs_dots : null } : null;
    overlay.draw(s, view.camera.fov, controls, ils);
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
    drawn = view.setRunway(runwayFromState(Object.fromEntries(flight.stateNames.map((n, i) => [n, ready.state[i]]))));
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
