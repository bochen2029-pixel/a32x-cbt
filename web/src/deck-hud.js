// deck-hud.js — what the flight deck says on the page, without a browser: the core's deck readouts by name,
// what LAND DECK and the deck hold do from where the craft is, the HUD's and the status line's words, and the
// layout of the approach display (the deck's ILS needles, the flight director and the hover's plan).
// deck-view.js draws it; test/deck.test.mjs holds it to orbit_deck.h. GPLv3.

import { AUTO, RING, SAS } from './core.js';
import { fmtDistance } from './hud.js';

const D2R = Math.PI / 180;

// orbit_deck.h's numbers, in a pilot's units (m, m/s, degrees, kg), and its enums: a test holds them equal to
// the header's.
export const DECK = {
  swivel: 15, glide: 400, hover: 20, side: 100,
  tolSink: 0.5, tolDrift: 0.3, tolOff: 5, tolTilt: 2,
  crashSink: 3, crashDrift: 2, crashTilt: 10, propMin: 2000,
};
export const DECK_OUT = [
  'phase', 'pad', 'onDeck', 's', 'c', 'height', 'along', 'across', 'vertical', 'apparentG', 'nozzle', 'loc', 'gs',
  'fdAlong', 'fdAcross', 'fdVertical', 'setAlong', 'setAcross', 'setVertical',
  'tdVerdict', 'tdT', 'tdSink', 'tdDrift', 'tdOff', 'tdTilt', 'tdPad', 'propUsed', 'refused', 'sectorS', 'heading',
];
export const DECK_PH = { none: 0, transfer: 1, depart: 2, wait: 3, glide: 4, hover: 5, descend: 6, landed: 7 };
export const DECK_V = { none: 0, landed: 1, crashed: 2, firm: 3, drifting: 4, tilted: 5, offPad: 6 };
export const DECK_NO = { none: 0, docked: 1, crashed: 2, low: 3, far: 4, fast: 5, landed: 6, prop: 7 };

const PHASE_WORDS = ['', 'to the hold point', 'out into the Ring', 'waiting for the pad to come round', 'on the glide', 'hovering over the pad',
  'descending', 'on the deck'];
const PHASE_LABELS = ['', 'TO HOLD POINT', 'OUT', 'WAIT', 'GLIDE', 'HOVER', 'DESCEND', 'ON DECK'];
const REFUSED_WORDS = ['', 'docked at the hub', 'crashed', 'not in orbit', 'more than 50 km from the Ring', 'passing the Ring faster than 50 m/s',
  'on the deck already', `under ${DECK.propMin.toLocaleString('en')} kg of propellant`];

const round = (v) => Math.round(v);
const sign = (v, digits) => { const r = Number(v.toFixed(digits)); return `${r >= 0 ? '+' : '-'}${Math.abs(r).toFixed(digits)}`; };

// A pad, as the page names it: 1, 2, 3 from the antispinward end.
export const padName = (k) => (k >= 0 ? `pad ${k + 1}` : 'no pad');

// Within this of the Ring's centre the craft flies with the Ring, and its own orbit says little (deck.cpp's
// deckEngage judges the same way).
export const WITHIN_M = Math.hypot(RING.floor + 500, RING.width / 2 + 1500);

// What a touchdown came to, with the number that decided it against its limit.
export function verdictText(d) {
  const pad = padName(round(d.tdPad));
  switch (round(d.tdVerdict)) {
    case DECK_V.landed: return `landed on ${pad} at ${d.tdSink.toFixed(2)} m/s, ${d.tdOff.toFixed(1)} m from its centre`;
    case DECK_V.crashed:
      if (d.tdSink > DECK.crashSink) return `down at ${d.tdSink.toFixed(1)} m/s: the legs take ${DECK.crashSink}`;
      if (d.tdDrift > DECK.crashDrift) return `${d.tdDrift.toFixed(1)} m/s across the deck at the touch: the gear takes ${DECK.crashDrift}`;
      if (d.tdTilt > DECK.crashTilt) return `${d.tdTilt.toFixed(0)}° off level at the touch: a wingtip met the deck`;
      return 'struck the deck';
    case DECK_V.firm: return `a firm touchdown on ${pad}: ${d.tdSink.toFixed(2)} m/s, ${DECK.tolSink} is good`;
    case DECK_V.drifting: return `down drifting ${d.tdDrift.toFixed(2)} m/s across, ${DECK.tolDrift} is good`;
    case DECK_V.tilted: return `down ${d.tdTilt.toFixed(1)}° off level, ${DECK.tolTilt}° is good`;
    case DECK_V.offPad: return `down ${d.tdOff.toFixed(0)} m from ${pad}'s centre, ${DECK.tolOff} is good`;
    default: return '';
  }
}

// What the page says when the gear first meets the deck.
export function touchdownText(d) { return `Touchdown: ${verdictText(d)}`; }

// The deck hold (OC_SAS_DECK) is for flying over the deck: in the Ring's reach, neither crashed nor docked.
export function deckHoldMakesSense(s, dock) {
  return s.crashed === 0 && !(dock && dock.docked > 0.5) && s.ringRange < WITHIN_M;
}

// What LAND DECK does from here, and what the page says: start the crew's landing, or nothing, saying why.
// The core judges the same things (deckEngage) and refuses on its own as well.
export function deckCommand(s, d, dock) {
  if (s.crashed > 0) return { action: 'none', say: 'Crashed: start again' };
  if (dock && dock.docked > 0.5) return { action: 'none', say: 'Docked at the hub: let go first (P)' };
  if (d.onDeck > 0.5) return { action: 'none', say: 'On the deck already: open the throttle to lift off (6 holds over the deck)' };
  if (round(s.auto) === AUTO.deck) return { action: 'none', say: `The crew is landing: ${PHASE_WORDS[round(d.phase)] || 'on its way'}` };
  const within = s.ringRange < WITHIN_M;
  if (!within && s.peri < 150000) return { action: 'none', say: 'The deck landing starts in orbit, near the Ring' };
  if (s.ringRange > 50000) return { action: 'none', say: `The Ring is ${fmtDistance(s.ringRange)} away: the crew lands from within 50 km` };
  const passing = Math.hypot(s.vrelE, s.vrelN, s.vrelU);
  if (!within && passing > 50) return { action: 'none', say: `Passing the Ring at ${passing.toFixed(0)} m/s: the crew lands from under 50 m/s` };
  if (s.prop < DECK.propMin) return { action: 'none', say: `${s.prop.toFixed(0)} kg of propellant: a deck landing wants ${DECK.propMin.toLocaleString('en')}` };
  return { action: 'engage', say: '' };
}

// What the page says once the crew's landing has been asked for: what the crew does first, or why the core
// refused it.
export function engagedText(s, d) {
  if (round(s.auto) !== AUTO.deck) return `Deck landing refused: ${REFUSED_WORDS[round(d.refused)] || 'the core gave no reason'}`;
  const pad = round(d.pad) >= 0 ? padName(round(d.pad)) : 'the deck';
  switch (round(d.phase)) {
    case DECK_PH.transfer: return `The crew lands on ${pad}: first to the hold point, ${fmtDistance(s.portRange)} away`;
    case DECK_PH.hover: return `The crew lands on ${pad}: over to it and down`;
    default: return `The crew lands on ${pad}: out into the Ring, then the glide along the deck`;
  }
}

// The status line: the crew's phases, the pilot's deck hold, on the deck; null leaves the others' lines.
export function deckStatus(s, d, touch = false) {
  const k = touch ? { take: 'CREW: take the controls' } : { take: 'Space: take the controls' };
  const phase = round(d.phase), auto = round(s.auto);
  if (s.crashed > 0) return null;   // a crash is docking's to say: it keeps the record of what hit what
  const pad = padName(round(d.pad));
  if (auto === AUTO.deck) {
    switch (phase) {
      case DECK_PH.transfer: return { line: `DECK · ${fmtDistance(s.portRange)} to the hold point`, hint: k.take };
      case DECK_PH.depart: return { line: `DECK · OUT INTO THE RING · ${fmtDistance(d.height)} over the floor`, hint: k.take };
      case DECK_PH.wait: return { line: `DECK · WAITING · ${pad} ${fmtDistance(d.s)} ahead, the deck by at ${Math.abs(d.along).toFixed(0)} m/s`, hint: k.take };
      case DECK_PH.glide: return { line: `DECK · GLIDE · ${pad} ${fmtDistance(d.s)} · ${Math.abs(d.along).toFixed(0)} m/s against the deck · swivel ${d.nozzle.toFixed(0)}°`, hint: k.take };
      case DECK_PH.hover: return { line: `DECK · HOVER over ${pad} · ${d.height.toFixed(1)} m`, hint: k.take };
      case DECK_PH.descend: return { line: `DECK · DESCENDING onto ${pad} · ${(d.height - 3).toFixed(1)} m · ${Math.abs(d.vertical).toFixed(2)} m/s`, hint: k.take };
      default: return { line: `DECK · ${PHASE_LABELS[phase] || ''}`, hint: k.take };
    }
  }
  if (phase === DECK_PH.landed || d.onDeck > 0.5) {
    const last = round(d.tdVerdict) !== DECK_V.none ? ` · ${verdictText(d)}` : '';
    return { line: `ON THE DECK${last}`, hint: touch ? 'THR up: lift off' : 'Shift: lift off' };
  }
  if (auto === AUTO.off && round(s.sas) === SAS.deck && s.ringRange < WITHIN_M) {
    const speed = Math.hypot(d.along, d.across).toFixed(1);
    return {
      line: touch ? `DECK HOLD · ${d.height.toFixed(1)} m · ${speed} m/s` : `HAND · DECK HOLD · ${d.height.toFixed(1)} m over the floor · ${speed} m/s · ${sign(d.vertical, 1)} m/s`,
      hint: touch ? 'the stick: fly against the deck; THR: climb, sink' : 'W S A D fly, let go to hold · Shift Ctrl climb, sink · Q E turn',
    };
  }
  return null;
}

// The HUD's deck lines: while the crew lands, in the deck hold, or on the deck.
export function deckLines(s, d, narrow = false) {
  const phase = round(d.phase), auto = round(s.auto);
  const active = auto === AUTO.deck || d.onDeck > 0.5 || phase === DECK_PH.landed || (round(s.sas) === SAS.deck && s.ringRange < WITHIN_M);
  if (s.crashed > 0 || !active) return [];
  const pad = padName(round(d.pad));
  const label = auto === AUTO.deck ? PHASE_LABELS[phase] : d.onDeck > 0.5 ? 'ON DECK' : 'HOLD';
  const far = phase === DECK_PH.transfer;
  if (narrow) {
    const lines = [`DECK ${label} ${pad} ${fmtDistance(d.s)}`];
    if (!far) lines.push(`H ${d.height.toFixed(0)} m  ${d.apparentG.toFixed(2)} g  SWIVEL ${d.nozzle.toFixed(0)}°`, `V ${sign(d.along, 0)} ${sign(d.across, 1)} ${sign(d.vertical, 1)} m/s`);
    return lines;
  }
  const lines = [`DECK ${label.padEnd(15)}${pad}  ${fmtDistance(d.s)} along the deck   ${d.height.toFixed(0)} m over the floor`];
  if (far) return lines;
  lines.push(
    `     against the deck ${sign(d.along, 1)} along  ${sign(d.across, 1)} across  ${sign(d.vertical, 1)} up  m/s   ${d.apparentG.toFixed(2)} g   swivel ${d.nozzle.toFixed(0)}°`,
    `     ILS localizer ${sign(d.loc, 1)} m  glide path ${sign(d.gs, 1)} m   FD ${sign(d.fdAlong, 1)} ${sign(d.fdAcross, 1)} ${sign(d.fdVertical, 1)} m/s`,
  );
  if (round(d.tdVerdict) !== DECK_V.none) lines.push(`     last touchdown: ${verdictText(d)}`);
  if (d.propUsed > 0) lines.push(`     propellant for the landing ${d.propUsed.toFixed(0)} kg`);
  return lines;
}

// The approach display's layout, as numbers, for a box of half-size R pixels (x right, y down):
//   needles: the deck's ILS, as an instrument shows it: where the course is from the craft, across (x), and
//     where the glide path is, up and down (y), each on a soft scale, full at the stops.
//   plan: the hover's plan, nose up: the pad from the craft (on a soft scale that fits a metre and a
//     kilometre), the craft's velocity against the deck, and the velocity the flight director wants, so that
//     a pilot flying the deck hold puts the one on the other.
//   tape: the height over the floor and the vertical speed against the director's.
export const LOC_FULL_M = 50, GS_FULL_M = 25, PLAN_SOFT_M = 60, VEL_SOFT = 10;
export function approachLayout(d, R) {
  const soft = (x, k) => (R * x) / (Math.abs(x) + k);
  const h = d.heading * D2R, ch = Math.cos(h), sh = Math.sin(h);
  // the deck's axes (along spinward, across +axis) into the nose's (forward, right)
  const nose = (along, across) => [along * ch + across * sh, -along * sh + across * ch];
  const toPad = nose(-d.s, -d.c);
  const softVec = ([f, r], k) => { const m = Math.hypot(f, r); const g = m > 1e-9 ? soft(m, k) / m : 0; return [r * g, -f * g]; };
  const locRight = d.loc * ch;   // off the course toward the nose's right
  return {
    needles: {
      loc: Math.max(-1, Math.min(1, -locRight / LOC_FULL_M)) * R,
      gs: Math.max(-1, Math.min(1, d.gs / GS_FULL_M)) * R,
      ok: Math.abs(d.loc) < 12 && Math.abs(d.gs) < 12,
    },
    plan: {
      pad: softVec(toPad, PLAN_SOFT_M),
      velocity: softVec(nose(d.along, d.across), VEL_SOFT),
      director: softVec(nose(d.fdAlong, d.fdAcross), VEL_SOFT),
      padRadius: soft(RING.deck.padRadius, PLAN_SOFT_M),
    },
    tape: { height: d.height, vertical: d.vertical, director: d.fdVertical, ok: d.height > 3.5 || Math.abs(d.vertical) <= DECK.tolSink },
  };
}
