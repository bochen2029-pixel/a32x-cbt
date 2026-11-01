// The flyable simulator's page: the flight core in its worker at 50 Hz under the display's own rate.
// GPLv3.
//
//   index.html?airframe=a320|737&crew=hands|script[&bench=MINUTES]
//
// crew=script lets the harness's own crew fly; the default is hands on the controls. bench=MINUTES
// first flies that many simulated minutes as fast as the worker can, in batches of 500 ticks, and
// reports the cost of a tick: the headroom under 50 Hz, free of the timer's coarse grain.

import { Clock } from './clock.js';
import { Flight } from './flight.js';

const params = new URLSearchParams(location.search);
const airframe = params.get('airframe') || '';
const scripted = params.get('crew') === 'script';
const benchTicks = Math.round(Number(params.get('bench') || 0) * 60 * 50);
const bench = { ticks: 0, ms: 0, wallMs: 0, done: benchTicks <= 0 };

const hud = document.getElementById('hud');
const status = document.getElementById('status');

const clock = new Clock(20, 5);
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

// What the page has measured, for a person and for a test driving the page.
function report() {
  const sorted = [...tickUs].sort((a, b) => a - b);
  const at = (q) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : NaN);
  const mean = sorted.length ? sorted.reduce((a, b) => a + b, 0) / sorted.length : NaN;
  return {
    error,
    airframe: airframe || 'default',
    crew: scripted ? 'script' : 'hands',
    simulatedS: value('t_s'),
    stepsDue: clock.steps,
    stepsDropped: clock.dropped + droppedWaiting,
    lastDropS,
    frames,
    requests,
    tickUs: { mean, p50: at(0.5), p99: at(0.99), max: sorted.length ? sorted[sorted.length - 1] : NaN },
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

function show() {
  if (!latest) return;
  const t = latest.texts;
  hud.textContent =
    `${value('t_s').toFixed(1).padStart(7)} s   ${t.phase}\n` +
    `CAS ${value('cas_kn').toFixed(0).padStart(4)} kt   ALT ${value('alt_ft').toFixed(0).padStart(6)} ft   ` +
    `V/S ${value('vs_fpm').toFixed(0).padStart(6)}\n` +
    `PITCH ${value('pitch_deg').toFixed(1).padStart(6)}   BANK ${value('roll_deg').toFixed(1).padStart(6)}   ` +
    `HDG ${value('heading_deg').toFixed(0).padStart(4)}\n` +
    `LAW  pitch ${t.pitch_law}  roll ${t.lateral_law}`;
  const r = report();
  const cls = r.stepsDropped ? 'warn' : '';
  status.innerHTML = `${r.airframe} · ${r.crew}\n` +
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
  if (pending && flight.step(pending, null)) {
    ++requests;
    pending = 0;
  }
  show();
  if (!error) requestAnimationFrame(frame);
}

flight.start(airframe, scripted).then(() => {
  status.textContent = bench.done ? 'flying' : 'measuring a tick…';
  if (bench.done) {
    requestAnimationFrame(frame);
  } else {
    bench.wallMs = performance.now();
    flight.step(Math.min(500, benchTicks), null);
  }
}, () => {});
