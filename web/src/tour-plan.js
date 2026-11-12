// The tour's plan: the whole loop in one button, for whoever has no stick. Runway, the climb through the
// air, the guidance above it, orbit, the crew's docking at the hub, a look inside the Ring, and the flight
// home to a stop on 17C. Each stage says what to command on the way in, how fast time runs and from
// where to look, what to say, and when it is done. The tour is a director, not a pilot: it flies only
// through the crew's own modes, as a person pressing the buttons would. Pure (no page, no drawing), so a
// test can run it on made-up states. GPLv3.

import { DPH } from './dock-hud.js';

// orbit_return.h's OC_RET_PH_*, as return-view.js's RET_PH has them (that module draws, so it is not
// imported here; tour.test.mjs holds the two equal to the header)
const AUTO_CREW = 1;   // orbit_core.h's OC_AUTO_CREW

export const RET_PH = { none: 0, depart: 1, wait: 2, burn: 3, coast: 4, entry: 5, terminal: 6, approach: 7, flare: 8, rollout: 9, stopped: 10 };

const km = (m) => (m / 1000).toFixed(m < 100000 ? 1 : 0);

// what the tour reads, from the page's blocks, in one flat record
export function snapshot(core, walking, wall) {
  const s = core.s, d = core.dock || {}, r = core.ret || {};
  return {
    t: s.t, phase: Math.round(s.phase), auto: Math.round(s.auto), crashed: s.crashed > 0.5, onGround: s.onGround > 0.5,
    alt: s.alt, tas: s.tas, mach: s.mach, qbar: s.qbar, g: s.g, vorb: s.vorb, apo: s.apo, peri: s.peri, ringRange: s.ringRange,
    docked: d.docked > 0.5, dockPhase: Math.round(d.phase || 0), dockRange: d.range ?? 1e9, closing: d.closing ?? 0,
    retPhase: Math.round(r.phase || 0), dv: r.dv ?? 0, togo: r.togo ?? 0, heat: r.heat ?? 0, heatPeak: r.heatPeak ?? 0,
    load: r.load ?? 0, tdAlong: r.tdAlong ?? 0, tdSink: r.tdSink ?? 0, tdOff: r.tdOff ?? 0, stopAlong: r.stopAlong ?? 0,
    walking, wall,
  };
}

// The stages, in order. enter: commands to give, the warp, the view, the walk ('hatch' is the walk command
// itself; 'floor' puts the walker on the floor; 'stop' brings them back aboard). warp(s): the warp while in
// the stage, if it changes with the state. text(s, m): the caption. next(s, m): the stage after, when due.
// m is the stage's memory: what it has seen (the highest q, where it crossed Mach 1) and when it began.
export const STAGES = {
  runway: {
    enter: { commands: ['reset'], warp: 1, view: 'chase' },
    title: 'KDFW, runway 17C',
    act(s, m) {   // the start has the crew flying; if it does not, ask for it once (CREW toggles, so never twice)
      if (m.wall > 0.5 && s.auto !== AUTO_CREW && !m.crewAsked) { m.crewAsked = true; return ['crew']; }
      return [];
    },
    text(s) {
      if (s.t < 20) return 'Sixty tonnes, half of it propellant, and one fiction: a drive of 2,000 s of specific impulse. The crew lets the brakes go at 20 s.';
      if (s.onGround) return s.tas < 90 ? `The take-off roll: ${s.tas.toFixed(0)} m/s` : 'Rotate at 95 m/s';
      return `Airborne, turning east to 090: ${km(s.alt)} km`;
    },
    next: (s) => (!s.onGround && s.alt > 1500 ? 'climb' : null),
  },
  climb: {
    enter: { warp: 2 },
    title: 'Through the air',
    text(s, m) {
      const bits = [`Mach ${s.mach.toFixed(2)} at ${km(s.alt)} km, ${(s.qbar / 1000).toFixed(1)} kPa of dynamic pressure`];
      if (m.mach1) bits.push(`through Mach 1 at ${km(m.mach1)} km`);
      if (m.qMax > 20000 && s.qbar < 0.8 * m.qMax) bits.push(`the most it felt, ${(m.qMax / 1000).toFixed(1)} kPa, is behind it`);
      return bits.join('; ') + '.';
    },
    watch(s, m) {
      m.qMax = Math.max(m.qMax || 0, s.qbar);
      if (!m.mach1 && s.mach >= 1) m.mach1 = s.alt;
    },
    next: (s) => (s.alt > 30000 && s.qbar < 1000 ? 'space' : null),
  },
  space: {
    enter: { warp: 25 },
    title: 'Above the air',
    text: (s) => `The crew steers by powered explicit guidance, the Shuttle's method, for a round orbit at 500 km: ${km(s.alt)} km, ${(s.vorb / 1000).toFixed(2)} km/s, ${s.g.toFixed(2)} g.`,
    next: (s) => (s.phase >= 6 ? 'orbit' : null),
  },
  orbit: {
    enter: { warp: 1 },
    title: 'In orbit',
    text: (s) => `${km(s.apo)} × ${km(s.peri)} km at ${(s.vorb / 1000).toFixed(2)} km/s, round the Earth in 94 minutes. The Ring waits ${km(s.ringRange)} km ahead.`,
    next: (s, m) => (m.wall > 8 ? 'dock' : null),
  },
  dock: {
    enter: { commands: ['dock'], warp: 100 },
    title: 'To the Ring',
    warp: (s) => (s.dockRange > 2500 ? 100 : s.dockRange > 400 ? 25 : s.dockRange > 40 ? 5 : 2),
    view: (s) => (s.dockRange < 700 && !s.docked ? 'from the Ring' : null),
    text(s) {
      switch (s.dockPhase) {
        case DPH.align: return 'Lining up with the hub\'s port, which turns with the Ring at 2.5° a second: the crew turns with it.';
        case DPH.close: return `Closing on the port: ${s.dockRange.toFixed(1)} m, ${Math.abs(s.closing).toFixed(2)} m/s.`;
        case DPH.captured: return 'Captured: the probe is in the drogue.';
        case DPH.docked: return 'Docked. The craft rides the Ring now, turning with it.';
        default: return `The crew flies to a point 300 m off the hub's port on the small thrusters: ${s.dockRange > 2000 ? km(s.dockRange) + ' km' : s.dockRange.toFixed(0) + ' m'} to go.`;
      }
    },
    watch(s, m) { if (s.docked && m.dockedAt === undefined) m.dockedAt = m.wall; },
    next: (s, m) => (m.dockedAt !== undefined && m.wall > m.dockedAt + 4 ? 'aboard' : null),
  },
  aboard: {
    enter: { walk: 'hatch' },
    title: 'Aboard: the hub',
    text: () => 'The lobby, 149 m from the axis: a thirtieth of a g. The Ring turns once in 142 s.',
    next: (s, m) => (m.wall > 9 ? 'floor' : null),
  },
  floor: {
    enter: { walk: 'floor' },
    title: 'The floor, 5 km from the axis',
    text: () => 'One g, from the turn alone, after a lift ride of five and a half minutes (skipped). The floor rises ahead and behind, and meets itself overhead.',
    next: (s, m) => (m.wall > 15 ? 'home' : null),
  },
  home: {
    enter: { walk: 'stop', view: 'chase', commands: ['return'], warp: 100 },
    title: 'The way home',
    warp: (s) => (s.retPhase === RET_PH.burn ? 10 : 100),
    text(s) {
      switch (s.retPhase) {
        case RET_PH.depart: return 'The crew lets go of the port and backs away from the Ring on the small thrusters.';
        case RET_PH.wait: return 'Waiting for a pass that brings it down at KDFW: skipping ahead to the burn.';
        case RET_PH.burn: return `The de-orbit burn, tail first: ${s.dv.toFixed(0)} m/s, to bring the bottom of the orbit down into the air.`;
        default: return `Falling toward the air, half a world from home: ${km(s.alt)} km.`;
      }
    },
    act(s, m) {   // once the plan is made, skip the wait, as RETURN pressed again does
      if (s.retPhase === RET_PH.wait && !m.skipped) { m.skipped = true; return ['return']; }
      return [];
    },
    next: (s) => (s.retPhase >= RET_PH.entry ? 'entry' : null),
  },
  entry: {
    enter: { warp: 25 },
    title: 'Entry',
    text: (s) => `${(s.tas / 1000).toFixed(2)} km/s at ${km(s.alt)} km; ${(s.heat / 1000).toFixed(0)} kW/m² on the nose (the most, ${(s.heatPeak / 1000).toFixed(0)}), ${s.load.toFixed(2)} g. The crew banks to steer its drag, and learns its model's error as it goes.`,
    next: (s) => (s.retPhase >= RET_PH.terminal ? 'land' : null),
  },
  land: {
    enter: { warp: 10 },
    title: 'KDFW, 17C',
    warp: (s) => (s.retPhase <= RET_PH.terminal ? 10 : s.retPhase === RET_PH.approach ? 2 : 1),
    text(s) {
      if (s.retPhase <= RET_PH.terminal) return `Gliding home: ${km(s.togo)} km to go, ${km(s.alt)} km up, Mach ${s.mach.toFixed(2)}.`;
      if (s.retPhase === RET_PH.approach) return `On the approach to 17C: ${s.tas.toFixed(0)} m/s, ${s.alt.toFixed(0)} m.`;
      if (s.retPhase === RET_PH.flare) return 'The flare.';
      return `Down ${s.tdAlong.toFixed(0)} m past the threshold, ${Math.abs(s.tdOff).toFixed(2)} m off the line, sinking ${s.tdSink.toFixed(2)} m/s.`;
    },
    next: (s) => (s.retPhase === RET_PH.stopped ? 'done' : null),
  },
  done: {
    enter: { warp: 1 },
    title: 'Home',
    text: (s) => `Stopped on 17C, ${km(s.stopAlong)} km down the runway: from the runway to the Ring and back. Backspace starts again.`,
    next: (s, m) => (m.wall > 15 ? 'end' : null),
  },
};

export const ORDER = Object.keys(STAGES);

// One step of the tour: given its stage and memory and the state, what to do this frame. Returns
// { stage, memory, commands, warp, view, walk, caption, ended }. A crash ends the tour with the reason.
export function tourStep(stage, memory, s) {
  const out = { stage, memory, commands: [], warp: null, view: null, walk: null, caption: null, ended: false };
  if (s.crashed) return { ...out, ended: true, caption: { title: 'The tour ends', text: 'The craft crashed: Backspace starts again.' } };
  let st = STAGES[stage];
  if (!memory.entered) {
    memory.entered = true;
    if (memory.since === undefined) memory.since = s.wall;   // the stage's clock runs from when it was due
    const e = st.enter || {};
    out.commands.push(...(e.commands || []));
    if (e.warp) out.warp = e.warp;
    if (e.view) out.view = e.view;
    if (e.walk) out.walk = e.walk;
  }
  memory.wall = s.wall - memory.since;
  if (st.watch) st.watch(s, memory);
  if (st.act) out.commands.push(...st.act(s, memory));
  if (st.warp) { const w = st.warp(s, memory); if (w) out.warp = w; }
  if (st.view) { const v = st.view(s, memory); if (v) out.view = v; }
  out.caption = { title: st.title, text: st.text(s, memory) };
  const nx = st.next(s, memory);
  if (nx === 'end') return { ...out, ended: true };
  if (nx) { out.stage = nx; out.memory = { since: s.wall }; }
  return out;
}
