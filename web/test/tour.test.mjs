// The tour's plan, run on made-up states: every stage is reached in order, each gives the commands a
// person would press, time runs fast where nothing happens and slow where something does, and a crash or
// the end stops it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ORDER, RET_PH, STAGES, tourStep } from '../src/tour-plan.js';
import { DPH } from '../src/dock-hud.js';

const header = readFileSync(new URL('../../core/orbit_return.h', import.meta.url), 'utf8');

test('the return\'s phases are orbit_return.h\'s', () => {
  for (const [k, v] of Object.entries(RET_PH)) {
    const m = header.match(new RegExp(`OC_RET_PH_${k.toUpperCase()}\\s*=\\s*(\\d+)`));
    assert.ok(m, `OC_RET_PH_${k.toUpperCase()} in the header`);
    assert.equal(Number(m[1]), v, k);
  }
});

const base = {
  t: 0, phase: 0, auto: 1, crashed: false, onGround: true, alt: 0, tas: 0, mach: 0, qbar: 0, g: 1, vorb: 400, apo: 0, peri: 0,
  ringRange: 25000, docked: false, dockPhase: 0, dockRange: 25000, closing: 0, retPhase: 0, dv: 0, togo: 0, heat: 0,
  heatPeak: 0, load: 0, tdAlong: 0, tdSink: 0, tdOff: 0, stopAlong: 0, walking: false, wall: 0,
};

// A tour driven by a script of states; returns every step's output.
function drive(script) {
  let stage = 'runway', memory = {};
  const outs = [];
  for (const s of script) {
    const o = tourStep(stage, memory, { ...base, ...s });
    outs.push(o);
    stage = o.stage; memory = o.memory;
    if (o.ended) break;
  }
  return outs;
}

test('the stages run in the order of the loop', () => {
  assert.deepEqual(ORDER, ['runway', 'climb', 'space', 'orbit', 'dock', 'aboard', 'floor', 'home', 'entry', 'land', 'done']);
  for (const k of ORDER) assert.equal(typeof STAGES[k].next, 'function', k);
});

test('the whole loop, stage by stage, with the commands a person would give', () => {
  let w = 0;
  const at = (s) => ({ ...s, wall: (w += 1) });
  const outs = drive([
    at({ t: 0 }),                                                              // runway: reset, crew
    at({ t: 25, tas: 60 }),
    at({ t: 45, onGround: false, alt: 1600, tas: 120 }),                       // -> climb
    at({ t: 60, onGround: false, alt: 5000, mach: 1.05, qbar: 36000 }),
    at({ t: 120, onGround: false, alt: 31000, mach: 4, qbar: 900 }),           // -> space
    at({ t: 600, onGround: false, alt: 400000, phase: 5 }),
    at({ t: 760, onGround: false, alt: 500000, phase: 6, apo: 501000, peri: 500000 }),   // -> orbit
    { ...base, onGround: false, phase: 6, wall: (w += 9) },                   // 9 s later -> dock
    at({ onGround: false, phase: 6, dockRange: 20000 }),                       // dock: the command, 100x
    at({ onGround: false, phase: 6, dockRange: 1000 }),
    at({ onGround: false, phase: 6, dockRange: 100, dockPhase: DPH.close }),
    at({ onGround: false, phase: 6, dockRange: 10, dockPhase: DPH.close }),
    at({ onGround: false, phase: 6, dockRange: 0, dockPhase: DPH.docked, docked: true }),
    { ...base, onGround: false, phase: 6, docked: true, dockPhase: DPH.docked, wall: (w += 5) },   // -> aboard
    { ...base, docked: true, walking: true, wall: (w += 1) },                  // aboard: the walk at the hatch
    { ...base, docked: true, walking: true, wall: (w += 10) },                 // -> floor
    { ...base, docked: true, walking: true, wall: (w += 1) },                  // floor
    { ...base, docked: true, walking: true, wall: (w += 16) },                 // -> home
    at({ onGround: false, retPhase: RET_PH.depart }),                          // home: aboard, RETURN
    at({ onGround: false, retPhase: RET_PH.wait }),                            // the plan made: skip
    at({ onGround: false, retPhase: RET_PH.wait }),                            // not twice
    at({ onGround: false, retPhase: RET_PH.burn, dv: 125 }),
    at({ onGround: false, retPhase: RET_PH.coast }),
    at({ onGround: false, retPhase: RET_PH.entry, alt: 119000, tas: 7500 }),  // -> entry
    at({ onGround: false, retPhase: RET_PH.entry, alt: 70000, tas: 6700, heat: 358000, heatPeak: 358000 }),
    at({ onGround: false, retPhase: RET_PH.terminal, alt: 25000 }),            // -> land
    at({ onGround: false, retPhase: RET_PH.approach, alt: 500 }),
    at({ onGround: false, retPhase: RET_PH.flare, alt: 10 }),
    at({ retPhase: RET_PH.rollout, tdAlong: 432, tdSink: 0.74, tdOff: -0.07 }),
    at({ retPhase: RET_PH.stopped, stopAlong: 2121 }),                         // -> done
    { ...base, retPhase: RET_PH.stopped, wall: (w += 1) },
    { ...base, retPhase: RET_PH.stopped, wall: (w += 16) },                    // -> the end
  ]);
  const stages = [...new Set(outs.map((o) => o.stage))];
  assert.deepEqual(stages, ORDER);
  assert.equal(outs.at(-1).ended, true);
  const cmds = outs.flatMap((o) => o.commands);
  assert.deepEqual(cmds, ['reset', 'dock', 'return', 'return'], 'reset (the crew flies from the start), dock, RETURN, and RETURN once more to skip the wait');
  const walks = outs.map((o) => o.walk).filter(Boolean);
  assert.deepEqual(walks, ['hatch', 'floor', 'stop']);
  // time: fast far out, slow at the capture and the touchdown
  const warpAt = (stage, i = 0) => outs.filter((o) => o.stage === stage && o.warp)[i]?.warp;
  assert.equal(outs[0].warp, 1);
  const dockWarps = outs.slice(8, 13).map((o) => o.warp);
  assert.deepEqual(dockWarps, [100, 25, 5, 2, 2]);
  assert.equal(outs[10].view, 'from the Ring', 'the last of the approach seen from the Ring');
  assert.ok(warpAt('land') >= 1);
  assert.equal(outs[28].warp, 1, 'the touchdown at one to one');
  // captions say what is happening, with the numbers of the moment
  assert.match(outs[3].caption.text, /Mach 1\.05/);
  assert.match(outs[6].caption.text, /round orbit at 500 km/);
  assert.match(outs[21].caption.text, /125 m\/s/);
  assert.match(outs[24].caption.text, /358 kW/);
  assert.match(outs[28].caption.text, /432 m past the threshold/);
});

test('if the start leaves no crew flying, the tour asks for it, once: CREW toggles', () => {
  const outs = drive([{ t: 0, wall: 0 }, { t: 0, auto: 0, wall: 1 }, { t: 0, auto: 0, wall: 2 }, { t: 1, auto: 1, wall: 3 }]);
  assert.deepEqual(outs.flatMap((o) => o.commands), ['reset', 'crew']);
});

test('a crash ends the tour and says so', () => {
  const outs = drive([{ t: 0 }, { t: 50, crashed: true, wall: 1 }]);
  assert.equal(outs.at(-1).ended, true);
  assert.match(outs.at(-1).caption.text, /crashed/);
});

test('the climb remembers Mach 1 and the most dynamic pressure', () => {
  const outs = drive([
    { onGround: false, alt: 1600, wall: 0 },
    { onGround: false, alt: 4000, mach: 0.9, qbar: 36600, wall: 1 },
    { onGround: false, alt: 7000, mach: 1.01, qbar: 30000, wall: 2 },
    { onGround: false, alt: 12000, mach: 1.6, qbar: 20000, wall: 3 },
  ]);
  const last = outs.at(-1).caption.text;
  assert.match(last, /through Mach 1 at 7\.0 km/);
  assert.match(last, /36\.6 kPa, is behind it/);
});
