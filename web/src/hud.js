// The heads-up readouts: what the core says, in a pilot's units, and two markers on the view — where
// the craft is going and where the Ring is. Text only, drawn by the page; no instruments. GPLv3.

import { AUTO, PHASES, PH, SAS_NAMES, STANDOFF_M } from './core.js';

export function fmtDistance(m) {
  const a = Math.abs(m);
  if (a >= 1e6) return `${(m / 1000).toFixed(0)} km`;
  if (a >= 1e4) return `${(m / 1000).toFixed(1)} km`;
  if (a >= 1000) return `${(m / 1000).toFixed(2)} km`;
  return `${m.toFixed(0)} m`;
}

export function fmtClock(t) {
  const s = Math.max(0, Math.floor(t)), m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// What the craft is doing, in a line, and what the pilot can do next: by key, or on a touch screen by
// the button's name.
export function status(s, warp, touch = false) {
  const auto = Math.round(s.auto), phase = Math.round(s.phase);
  const k = touch
    ? { take: 'CREW: take the controls', skip: 'TO ORBIT: skip ahead', approach: 'APPROACH: the crew flies it', faster: 'TIME +: faster', reset: 'RESTART' }
    : { take: 'Space: take the controls', skip: 'O: skip ahead to orbit', approach: 'T: the crew flies the approach', faster: '.: faster', reset: 'Backspace' };
  if (s.crashed > 0) return { line: 'CRASHED', hint: `${k.reset} to start again` };
  if (auto === AUTO.crew) {
    if (phase === PH.hold) return { line: `CREW · HOLD · brakes off in ${Math.max(0, s.window).toFixed(0)} s`, hint: `${k.take} · ${k.skip}` };
    if (phase === PH.orbit) return { line: `CREW · IN ORBIT · the Ring ${fmtDistance(s.ringRange)} ahead`, hint: `${k.take} · ${k.approach}` };
    return { line: `CREW · ${PHASES[phase]}`, hint: warp > 1 ? '' : `${k.take} · ${k.faster}` };
  }
  if (auto === AUTO.approach) {
    const held = s.portRange < 5;
    return { line: held ? `APPROACH · HOLDING ${STANDOFF_M} m OFF THE HUB PORT` : `APPROACH · ${fmtDistance(s.portRange)} to the hold point`, hint: k.take };
  }
  const law = s.onGround > 0.5 || s.qbar > 300 ? 'AIR LAW: pitch and bank hold' : `RATE + ${SAS_NAMES[Math.round(s.sas)]}`;
  return { line: `HAND · ${law}`, hint: '' };
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
  }

  // s: readouts; view: { warp, view }; marks: screen points (null when behind) for velocity and Ring;
  // more: { extra: lines a feature adds, status: a feature's { line, hint } in place of the flight's }
  draw(s, view, marks, now, more = {}) {
    this.place(this.fpm, marks.velocity);
    this.place(this.tgt, marks.ring);
    if (marks.ring) this.tgtLabel.textContent = fmtDistance(s.ringRange);
    if (now < this.next) return;
    this.next = now + 100;
    const st = more.status || status(s, view.warp, this.touch);
    const extra = more.extra || [];
    this.top.textContent = st.line;
    this.hint.textContent = st.hint;
    const vs = s.vs >= 0 ? `+${s.vs.toFixed(0)}` : s.vs.toFixed(0);
    const peri = s.peri < -1e5 ? 'below ground' : fmtDistance(s.peri);
    const apo = s.apo > 1e9 ? 'escape' : fmtDistance(s.apo);
    const rate = s.ringRate <= 0 ? `closing ${(-s.ringRate).toFixed(1)} m/s` : `opening ${s.ringRate.toFixed(1)} m/s`;
    const vrel = Math.hypot(s.vrelE, s.vrelN, s.vrelU);
    if (window.innerWidth < 560) {   // a phone: the same, shorter
      this.lines.textContent = [
        `T+${fmtClock(s.t - 20)}  ${view.warp}×  ${view.view}`,
        `ALT ${fmtDistance(s.alt)}  VS ${vs}`,
        `SPD ${s.tas.toFixed(0)} m/s  M ${s.mach.toFixed(1)}`,
        `APO ${apo}  PER ${peri}`,
        `THR ${(s.throttle * 100).toFixed(0)}%  PROP ${((s.prop / 30000) * 100).toFixed(0)}%  ${s.g.toFixed(1)} g`,
        `RING ${fmtDistance(s.ringRange)}  ${s.ringRate <= 0 ? '−' : '+'}${Math.abs(s.ringRate).toFixed(0)} m/s`,
        ...extra,
      ].join('\n');
      return;
    }
    this.lines.textContent = [
      `T+${fmtClock(s.t - 20)}   WARP ${view.warp}×   VIEW ${view.view}`,
      `ALT  ${fmtDistance(s.alt).padStart(9)}   VS ${vs} m/s`,
      `SPD  ${s.tas.toFixed(0).padStart(5)} m/s air   M ${s.mach.toFixed(2)}   q ${(s.qbar / 1000).toFixed(1)} kPa`,
      `ATT  pitch ${s.pitch.toFixed(1)}°  bank ${s.roll.toFixed(1)}°  hdg ${s.hdg.toFixed(0).padStart(3, '0')}°`,
      `AERO α ${s.alpha.toFixed(1)}°  β ${s.beta.toFixed(1)}°  ${s.g.toFixed(2)} g`,
      `ORB  ${s.vorb.toFixed(0)} m/s   apo ${apo}   peri ${peri}   inc ${s.inc.toFixed(1)}°`,
      `ENG  thrust ${(s.throttle * 100).toFixed(0)}%   propellant ${(s.prop / 1000).toFixed(2)} t (${((s.prop / 30000) * 100).toFixed(0)}%)   gear ${s.gear > 0.5 ? 'DOWN' : 'up'}`,
      `RING ${fmtDistance(s.ringRange)}   ${rate}   rel ${vrel.toFixed(1)} m/s`,
      ...extra,
    ].join('\n');
  }

  place(el, p) {
    if (!p) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    el.style.transform = `translate(${p[0].toFixed(1)}px, ${p[1].toFixed(1)}px)`;
  }
}
