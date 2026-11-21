// The tour's plan, run on made-up states: every stage is reached in order, each gives the commands a
// person would press, time runs fast where nothing happens and slow where something does, and a crash or
// the end stops it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ORDER, RET_PH, STAGES, tourStep } from '../src/tour-plan.js';
import { DECK_PH } from '../src/deck-hud.js';
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
  deckPhase: 0, deckHeight: 0, deckG: 0, nozzle: 0, deckAlong: 0, deckSink: 0, deckOff: 0, deckVerdict: 0,
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
  assert.deepEqual(ORDER, ['runway', 'climb', 'space', 'orbit', 'dock', 'aboard', 'floor', 'deck', 'liftoff', 'home', 'entry', 'land', 'done']);
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
    { ...base, docked: true, walking: true, wall: (w += 16) },                 // -> deck
    at({ onGround: false, deckPhase: DECK_PH.transfer }),                      // deck: back aboard, let go, LAND DECK
    at({ onGround: false, deckPhase: DECK_PH.wait }),
    at({ onGround: false, deckPhase: DECK_PH.glide, deckAlong: -120, nozzle: 45, deckG: 0.4 }),
    at({ onGround: false, deckPhase: DECK_PH.hover, deckHeight: 20 }),
    at({ onGround: false, deckPhase: DECK_PH.descend, deckHeight: 3 }),
    at({ deckPhase: DECK_PH.landed, deckSink: 0.3, deckOff: 0.9 }),
    { ...base, deckPhase: DECK_PH.landed, wall: (w += 9) },                  // -> liftoff
    at({ onGround: false, deckPhase: DECK_PH.lift }),                          // TAKE OFF
    at({ onGround: false, deckPhase: DECK_PH.climb }),
    at({ onGround: false, deckPhase: DECK_PH.coast }),
    at({ onGround: false, deckPhase: DECK_PH.none }),                          // at the hold point -> home
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
  assert.deepEqual(cmds, ['reset', 'dock', 'dock', 'deck', 'takeoff', 'return', 'return'],
    'reset (the crew flies from the start), DOCK, P to let go and LAND DECK, TAKE OFF, RETURN, and RETURN once more to skip the wait');
  const walks = outs.map((o) => o.walk).filter(Boolean);
  assert.deepEqual(walks, ['hatch', 'floor', 'stop', 'stop']);
  // time: fast far out, slow at the capture and the touchdown
  const warpAt = (stage, i = 0) => outs.filter((o) => o.stage === stage && o.warp)[i]?.warp;
  assert.equal(outs[0].warp, 1);
  const dockWarps = outs.slice(8, 13).map((o) => o.warp);
  assert.deepEqual(dockWarps, [100, 25, 5, 2, 2]);
  assert.equal(outs[10].view, 'from the Ring', 'the last of the approach seen from the Ring');
  assert.ok(warpAt('land') >= 1);
  assert.equal(outs[39].warp, 1, 'the touchdown at one to one');
  // the deck: fast while coasting, slow for the glide, one to one on the pad; the glide's caption says it
  assert.equal(outs[18].warp, 100, 'out over the deck at 100x');
  assert.equal(outs[20].warp, 5, 'the glide at 5x');
  assert.match(outs[20].caption.text, /inside of a wheel, 120 m\/s against the deck, the drive swivelled 45° down/);
  assert.equal(outs[23].warp, 1, 'on the pad at one to one');
  assert.match(outs[23].caption.text, /0\.30 m\/s at the touch, 0\.9 m from its centre/);
  assert.equal(outs[25].warp, 2, 'off the deck at 2x');
  // captions say what is happening, with the numbers of the moment
  assert.match(outs[3].caption.text, /Mach 1\.05/);
  assert.match(outs[6].caption.text, /round orbit at 500 km/);
  assert.match(outs[32].caption.text, /125 m\/s/);
  assert.match(outs[35].caption.text, /358 kW/);
  assert.match(outs[39].caption.text, /432 m past the threshold/);
});

test('if the start leaves no crew flying, the tour asks for it, once: CREW toggles', () => {
  const outs = drive([{ t: 0, wall: 0 }, { t: 0, auto: 0, wall: 1 }, { t: 0, auto: 0, wall: 2 }, { t: 1, auto: 1, wall: 3 }]);
  assert.deepEqual(outs.flatMap((o) => o.commands), ['reset', 'crew']);
});

test('the skip of the wait is asked again if it was not taken, and never while it is skipping', () => {
  const home = (s, wall) => ({ ...s, onGround: false, retPhase: RET_PH.wait, wall });
  let stage = 'home', memory = { since: 0 };
  const step = (s) => { const o = tourStep(stage, memory, { ...base, ...s }); stage = o.stage; memory = o.memory; return o.commands; };
  assert.deepEqual(step(home({}, 0)), ['return', 'return'], 'RETURN on the way in, and the skip at once');
  assert.deepEqual(step(home({}, 1)), [], 'not again within 3 s');
  assert.deepEqual(step(home({}, 4)), ['return'], 'not taken: asked again');
  assert.deepEqual(step(home({ skipping: true }, 9)), [], 'skipping: never a second press, which would stop it');
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
