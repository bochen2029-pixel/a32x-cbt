// The heads-up readouts: what the core says, in a pilot's units, and two markers on the view — where
// the craft is going and where the Ring is. Text only, drawn by the page; no instruments. MIT.

import { AUTO, PHASES, PH, SAS_NAMES, STANDOFF_M } from './core.js';

export function fmtDistance(m) {
  const a = Math.abs(m);
  if (a >= 1e6) return `${(m / 1000).toFixed(0)} km`;
  if (a >= 1e4) return `${(m / 1000).toFixed(1)} km`;
  if (a >= 1000) return `${(m / 1000).toFixed(2)} km`;
  return `${m.toFixed(0)} m`;
}

export function fmtClock(t) {
  const s = Math.max(0, Math.floor(t)), m = Math.floor(s / 60), h = Math.floor(m / 60);
  if (h > 0) return `${h}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;   // a day's wait for a pass
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// A number to so many places, never "-0": a readout that rounds to nought reads as nought.
export function fixed(v, digits = 0) {
  const r = Number(v.toFixed(digits));
  return (r === 0 ? 0 : r).toFixed(digits);
}

// orbit_dock.h's OC_DOCK_ENGAGE_M and OC_DOCK_ENGAGE_SPEED, as dock-hud.js's DOCK has them (hud.test.mjs holds
// them equal): the core starts the approach and docking only this near the Ring, passing it this slowly in the
// frame turning with its orbit (oc_auto, dockEngage).
export const REACH = { m: 50000, speed: 50 };
export const inReach = (s) => s.ringRange < REACH.m && Math.hypot(s.vrelE, s.vrelN, s.vrelU) < REACH.speed;

// What the craft is doing, in a line, and what the pilot can do next: by key, or on a touch screen by
// the button's name. hands: the pilot's (input.js), for the brakes held on the ground.
export function status(s, warp, touch = false, hands = null) {
  const auto = Math.round(s.auto), phase = Math.round(s.phase);
  const k = touch
    ? {
      take: 'CREW: take the controls', skip: 'TO ORBIT: skip ahead', approach: 'APPROACH: the crew flies it', faster: 'TIME +: faster', reset: 'RESTART',
      dock: 'DOCK: the crew docks', home: 'RETURN: the crew flies home', help: '', brakes: 'MORE, BRAKES: let them go',   // HELP is a button there
    }
    : {
      take: 'Space: take the controls', skip: 'O: skip ahead to orbit', approach: 'T: the crew flies the approach', faster: '.: faster', reset: 'Backspace',
      dock: 'P: the crew docks', home: 'R: the crew flies home', help: 'H: the keys', brakes: 'B: let the brakes go',
    };
  if (s.crashed > 0) return { line: 'CRASHED', hint: `${k.reset} to start again` };
  if (auto === AUTO.crew) {
    if (phase === PH.hold) return { line: `CREW · HOLD · brakes off in ${Math.max(0, s.window).toFixed(0)} s`, hint: [k.take, k.skip, k.help].filter(Boolean).join(' · ') };
    if (phase === PH.orbit) {
      // the approach starts only near the Ring, passing it slowly: from an orbit flown up by hand it may be out of reach
      if (inReach(s)) return { line: `CREW · IN ORBIT · the Ring ${fmtDistance(s.ringRange)} ahead`, hint: `${k.take} · ${k.approach}` };
      const passing = Math.hypot(s.vrelE, s.vrelN, s.vrelU);
      return {
        line: `CREW · IN ORBIT · the Ring ${fmtDistance(s.ringRange)} away, passing at ${passing.toFixed(0)} m/s`,
        hint: `out of the approach's reach (${REACH.m / 1000} km, ${REACH.speed} m/s) · ${k.home}`,
      };
    }
    return { line: `CREW · ${PHASES[phase]}`, hint: warp > 1 ? '' : `${k.take} · ${k.faster}` };
  }
  if (auto === AUTO.approach) {
    const held = s.portRange < 5;
    return { line: held ? `APPROACH · HOLDING ${STANDOFF_M} m OFF THE HUB PORT` : `APPROACH · ${fmtDistance(s.portRange)} to the hold point`, hint: held ? `${k.dock} · ${k.take}` : k.take };
  }
  const law = s.airLaw > 0.5 ? 'AIR LAW: pitch and bank hold' : `RATE + ${SAS_NAMES[Math.round(s.sas)]}`;   // the core's own law (OC_AIR_LAW)
  // on the ground with the brakes held the throttle alone does not move the craft: say how to let them go
  const braked = hands && hands.brake > 0 && s.onGround > 0.5 && auto === AUTO.off;
  return { line: `HAND · ${law}`, hint: braked ? k.brakes : '' };
}

export class Hud {
  constructor(root) {
    this.root = root;
    this.lines = root.querySelector('#readouts');
    this.top = root.querySelector('#statusline');
    this.hint = root.querySelector('#hint');
    this.fpm = root.querySelector('#fpm');
    this.tgt = root.querySelector('#target');
    this.tgtLabel = root.querySelector('#target-label');
    this.next = 0;
    this.touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    // on a touch screen the buttons used most sit under the thumbs; MORE opens the rest, and any of
    // them, pressed, closes it again
    const buttons = root.querySelector('#buttons'), more = root.querySelector('#btn-more');
    if (!buttons) return;
    const open = (on) => {
      if (!more) return;
      buttons.classList.toggle('open', on);
      more.setAttribute('aria-expanded', String(on));
      more.textContent = on ? 'LESS' : 'MORE';
    };
    if (more) more.addEventListener('click', () => open(!buttons.classList.contains('open')));
    // Every button, the features' too (added after this, and stopping their clicks where they land), is seen
    // here on the way down, before its own handler: any but MORE closes MORE. Clicked by a mouse or a finger it
    // keeps no focus, or the next Enter, the walk's key, would press it again; pressed from the keyboard
    // (detail 0) it keeps it, as a keyboard's user expects.
    buttons.addEventListener('click', (e) => {
      const b = e.target && e.target.closest ? e.target.closest('button') : null;
      if (!b) return;
      if (e.detail > 0) b.blur();
      if (b !== more) open(false);
    }, true);
  }

  // s: readouts; view: { warp (a number, or 'MAX' while skipping), view, hands: the pilot's }; marks: screen
  // points (null when behind) for velocity and Ring; more: { extra: lines a feature adds, status: a feature's
  // { line, hint } in place of the flight's }
  draw(s, view, marks, now, more = {}) {
    this.place(this.fpm, marks.velocity);
    this.place(this.tgt, marks.ring);
    if (marks.ring) this.tgtLabel.textContent = fmtDistance(s.ringRange);
    if (now < this.next) return;
    this.next = now + 100;
    const st = more.status || status(s, view.warp, this.touch, view.hands);
    const extra = more.extra || [];
    this.top.textContent = st.line;
    // TIME − at one to one stops time: nothing moves, and the hint says why and how to go on
    this.hint.textContent = view.warp === 0 ? `paused · ${this.touch ? 'TIME +' : '.'}: time runs again` : st.hint;
    this.lines.textContent = readouts(s, view, window.innerWidth < 560, extra);
  }

  place(el, p) {
    if (!p) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    el.style.transform = `translate(${p[0].toFixed(1)}px, ${p[1].toFixed(1)}px)`;
  }
}

// The readouts' text: the flight's lines, then the features' (extra). narrow: a phone's, the same shorter. The
// brakes are the pilot's own, shown while they hold the craft on the ground, as the gear is the core's.
export function readouts(s, view, narrow = false, extra = []) {
  const vs = Number(fixed(s.vs)) >= 0 ? `+${fixed(s.vs)}` : fixed(s.vs);
  const warp = typeof view.warp !== 'number' ? view.warp : view.warp === 0 ? '0× paused' : `${view.warp}×`;
  const brakes = view.hands && view.hands.brake > 0 && s.onGround > 0.5 && Math.round(s.auto) === AUTO.off;
  const peri = s.peri < -1e5 ? 'below ground' : fmtDistance(s.peri);
  const apo = s.apo > 1e9 ? 'escape' : fmtDistance(s.apo);
  const rate = s.ringRate <= 0 ? `closing ${(-s.ringRate).toFixed(1)} m/s` : `opening ${s.ringRate.toFixed(1)} m/s`;
  const vrel = Math.hypot(s.vrelE, s.vrelN, s.vrelU);
  if (narrow) {
    return [
      `T+${fmtClock(s.t - 20)}  ${warp}  ${view.view}`,
      `ALT ${fmtDistance(s.alt)}  VS ${vs}`,
      `SPD ${s.tas.toFixed(0)} m/s  M ${s.mach.toFixed(1)}`,
      `APO ${apo}  PER ${peri}`,
      `THR ${(s.throttle * 100).toFixed(0)}%  PROP ${((s.prop / 30000) * 100).toFixed(0)}%  ${s.g.toFixed(1)} g${brakes ? '  BRAKES' : ''}`,
      `RING ${fmtDistance(s.ringRange)}  ${s.ringRate <= 0 ? '−' : '+'}${Math.abs(s.ringRate).toFixed(0)} m/s`,
      ...extra,
    ].join('\n');
  }
  return [
    `T+${fmtClock(s.t - 20)}   WARP ${warp}   VIEW ${view.view}`,
    `ALT  ${fmtDistance(s.alt).padStart(9)}   VS ${vs} m/s`,
    `SPD  ${s.tas.toFixed(0).padStart(5)} m/s air   M ${s.mach.toFixed(2)}   q ${(s.qbar / 1000).toFixed(1)} kPa`,
    `ATT  pitch ${fixed(s.pitch, 1)}°  bank ${fixed(s.roll, 1)}°  hdg ${s.hdg.toFixed(0).padStart(3, '0')}°`,
    `AERO α ${fixed(s.alpha, 1)}°  β ${fixed(s.beta, 1)}°  ${s.g.toFixed(2)} g`,
    `ORB  ${s.vorb.toFixed(0)} m/s   apo ${apo}   peri ${peri}   inc ${s.inc.toFixed(1)}°`,
    `ENG  thrust ${(s.throttle * 100).toFixed(0)}%   propellant ${(s.prop / 1000).toFixed(2)} t (${((s.prop / 30000) * 100).toFixed(0)}%)   gear ${s.gear > 0.5 ? 'DOWN' : 'up'}${brakes ? '   BRAKES' : ''}`,
    `RING ${fmtDistance(s.ringRange)}   ${rate}   rel ${vrel.toFixed(1)} m/s`,
    ...extra,
  ].join('\n');
}
