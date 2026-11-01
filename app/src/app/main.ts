/**
 * Browser entry: one page, no framework, no bundler.
 *
 * Everything the page does is a view over a Session, which is the same object the tests drive. The
 * panel, the display and the procedure list are all rendered from session state each frame — the
 * page holds no simulation state of its own.
 */

import { Session } from '../session/session.ts';
import { parsePanel } from '../panel/schema.ts';
import { actuate, hitTest, type Control, type Panel } from '../panel/controls.ts';
import { scene, COLOURS, type Scene } from './draw.ts';
import { linesOf, parseMessages, type Message } from '../ecam/warnings.ts';
import { parsePages, renderPage, type PageSpec } from '../ecam/pageSchema.ts';
import { powerUp } from '../training/powerup.ts';
import { startEngine1 } from '../training/startengine.ts';
import { bluePumpDrill } from '../training/bluepump.ts';
import { packsFail } from '../training/packsfail.ts';
import { beforeStart } from '../training/beforestart.ts';
import { afterStart } from '../training/afterstart.ts';
import { applySetup, type SetupId } from '../training/setup.ts';
import { faultIds } from '../faults/index.ts';
import type { Procedure } from '../training/procedure.ts';

const CELL = 13;
const PAD = 6;

interface Drill {
  readonly id: string;
  readonly label: string;
  readonly procedure: Procedure;
  readonly setup: SetupId;
}

const DRILLS: readonly Drill[] = [
  { id: 'power-up', label: 'Power up', procedure: powerUp, setup: 'cold' },
  { id: 'before-start', label: 'Before start', procedure: beforeStart, setup: 'cold' },
  { id: 'start-eng1', label: 'Start ENG 1', procedure: startEngine1, setup: 'apu' },
  { id: 'after-start', label: 'After start', procedure: afterStart, setup: 'engines' },
  { id: 'blue-pump', label: 'BLUE pump failure', procedure: bluePumpDrill, setup: 'apu' },
  { id: 'packs-fail', label: 'Packs fail in cruise', procedure: packsFail, setup: 'engines' },
];

const canvas = document.getElementById('panel') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const ecamEl = document.getElementById('ecam') as HTMLPreElement;
const pagesBar = document.getElementById('pages') as HTMLDivElement;
const statusEl = document.getElementById('status') as HTMLDivElement;
const drillsBar = document.getElementById('drills') as HTMLDivElement;
const stepsEl = document.getElementById('steps') as HTMLDivElement;
const restart = document.getElementById('restart') as HTMLButtonElement;
const freeze = document.getElementById('freeze') as HTMLButtonElement;
const faultPick = document.getElementById('fault') as HTMLSelectElement;

let pageId = 'elec';
let messages: readonly Message[] = [];
let pages: readonly PageSpec[] = [];

/** Panel and messages are content, not code: the page fetches the same JSON the tests read. */
let loadError = '';

const overhead: Panel = await fetch('data/panel.json')
  .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`panel ${r.status}`))))
  .then(parsePanel)
  .catch((err: unknown) => {
    loadError = `panel failed to load: ${String(err)}`;
    return { id: 'empty', title: 'PANEL', cols: 10, rows: 2, controls: [] } as Panel;
  });

let session = new Session({ procedure: powerUp, panel: overhead });

pages = await fetch('data/pages.json')
  .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`pages ${r.status}`))))
  .then(parsePages)
  .catch((err: unknown) => {
    loadError = `pages failed to load: ${String(err)}`;
    return [] as PageSpec[];
  });

messages = await fetch('data/messages.json')
  .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`messages ${r.status}`))))
  .then(parseMessages)
  .catch((err: unknown) => {
    loadError = `messages failed to load: ${String(err)}`;
    return [] as Message[];
  });


canvas.width = overhead.cols * CELL + PAD * 2;
canvas.height = overhead.rows * CELL + PAD * 2;
canvas.style.width = `${canvas.width}px`;
canvas.style.height = `${canvas.height}px`;

function start(drill: Drill): void {
  const faults =
    drill.id === 'packs-fail'
      ? [
          { id: 'pack-1', trigger: { kind: 'atTime' as const, sec: 4 } },
          { id: 'pack-2', trigger: { kind: 'atTime' as const, sec: 4 } },
        ]
      : drill.id === 'blue-pump'
        ? [{ id: 'hyd-blue-pump', trigger: { kind: 'atTime' as const, sec: 4 } }]
        : undefined;

  session = new Session({
    procedure: drill.procedure,
    panel: overhead,
    ...(faults ? { faults } : {}),
    ...(drill.id === 'packs-fail' ? { world: { pressureAltitudeFt: 35000 } } : {}),
  });

  applySetup(session, drill.setup);
  paintAll();
}
for (const p of pages) {
  const b = document.createElement('button');
  b.textContent = p.name;
  b.dataset.page = p.id;
  b.addEventListener('click', () => {
    pageId = p.id;
    paintEcam();
  });
  pagesBar.appendChild(b);
}

for (const drill of DRILLS) {
  const b = document.createElement('button');
  b.textContent = drill.label;
  b.dataset.drill = drill.id;
  b.addEventListener('click', () => {
    for (const other of Array.from(drillsBar.children)) other.classList.remove('on');
    b.classList.add('on');
    start(drill);
  });
  drillsBar.appendChild(b);
}
(drillsBar.firstElementChild as HTMLButtonElement).classList.add('on');

for (const id of faultIds()) {
  const o = document.createElement('option');
  o.value = id;
  o.textContent = `inject: ${id}`;
  faultPick.appendChild(o);
}
const first = document.createElement('option');
first.value = '';
first.textContent = 'instructor: inject fault';
first.selected = true;
faultPick.insertBefore(first, faultPick.firstChild);

faultPick.addEventListener('change', () => {
  if (!faultPick.value) return;
  session.injectFault(faultPick.value);
  faultPick.value = '';
  paintAll();
});

freeze.addEventListener('click', () => {
  if (session.isPaused) session.resume();
  else session.pause();
  freeze.classList.toggle('frozen', session.isPaused);
  freeze.textContent = session.isPaused ? 'frozen' : 'freeze';
  paintAll();
});

restart.addEventListener('click', () => {
  const on = drillsBar.querySelector('.on') as HTMLButtonElement | null;
  const drill = DRILLS.find((x) => x.id === on?.dataset.drill) ?? DRILLS[0];
  start(drill);
});

function paintPanel(s: Scene): void {
  ctx.fillStyle = '#11161c';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = '11px ui-monospace, Consolas, monospace';
  ctx.textBaseline = 'top';

  for (const b of s.boxes) {
    const x = PAD + b.x * CELL;
    const y = PAD + b.y * CELL;
    const w = b.w * CELL - 3;
    const h = b.h * CELL - 3;

    ctx.fillStyle = b.lit ? '#1d3b2a' : '#1a2029';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = b.guarded ? '#ffb020' : b.lit ? '#4ade80' : '#39424f';
    ctx.lineWidth = b.guarded ? 2 : 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);

    ctx.fillStyle = '#9fb0c3';
    ctx.fillText(b.label, x + 4, y + 3);

    ctx.fillStyle = b.lit ? '#7ef0b0' : '#7d8b9c';
    ctx.fillText(b.state, x + 4, y + h - 13);
  }
}

function paintEcam(): void {
  const spec = pages.find((p) => p.id === pageId);
  const lines = [
    ...linesOf(messages, session.d),
    { level: 'normal' as const, text: '' },
    ...(spec ? renderPage(spec, session.d) : [{ level: 'normal' as const, text: '(no pages loaded)' }]),
  ];
  ecamEl.textContent = '';
  for (const l of lines) {
    const span = document.createElement('span');
    span.textContent = l.text || ' ';
    span.style.color = COLOURS[l.level] ?? '#e8eef5';
    ecamEl.appendChild(span);
    ecamEl.appendChild(document.createTextNode('\n'));
  }
  for (const b of Array.from(pagesBar.children) as HTMLButtonElement[]) {
    b.classList.toggle('on', b.dataset.page === pageId);
  }
}

function paintSteps(): void {
  const r = session.debrief();
  const rows = r.steps.map((st, i) => {
    const mark = st.status === 'done' ? ' ok ' : st.status === 'missed' ? 'MISS' : ' -- ';
    const colour = st.status === 'done' ? '#4ade80' : st.status === 'missed' ? '#ff3b30' : '#55677d';
    const when = st.status === 'done' ? ` ${st.atSec?.toFixed(1) ?? ''}s` : '';
    return `<div style="color:${colour}">${mark} ${String(i + 1).padStart(2)}. ${st.label}${when}</div>`;
  });

  const verdict = session.done
    ? `<div class="verdict ${r.passed ? 'pass' : 'fail'}">${r.passed ? 'PASS' : 'FAIL'} ${r.completed}/${r.total} in ${r.seconds}s</div>`
    : `<div class="verdict">${r.completed}/${r.total}</div>`;

  stepsEl.innerHTML = `<div class="title">${r.title}</div>${verdict}${rows.join('')}`;
}

function paintAll(): void {
  paintPanel(scene(overhead, session.d));
  paintEcam();
  paintSteps();
  statusEl.textContent = loadError || [session.describe(), session.done ? 'complete' : session.scorer.currentStep?.label ?? '', session.isPaused ? 'FROZEN' : '', session.repositionCount ? `moved ${session.repositionCount}` : ''].filter(Boolean).join(' · ');
}

canvas.addEventListener('click', (ev) => {
  const r = canvas.getBoundingClientRect();
  const gx = (ev.clientX - r.left - PAD) / CELL;
  const gy = (ev.clientY - r.top - PAD) / CELL;
  const c: Control | undefined = hitTest(overhead, gx, gy);
  if (!c) return;
  actuate(session.d, c);
  paintAll();
});

let last = performance.now();
function frame(now: number): void {
  const due = session.advance(now - last);
  last = now;
  if (due > 0) paintAll();
  requestAnimationFrame(frame);
}

paintAll();
requestAnimationFrame(frame);


















