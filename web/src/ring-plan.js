// The Ring's plan: where its parts go, as plain numbers in its own frame (y its axis, a point at angle
// a and radius r at (r sin a, y, r cos a), as core.js says the spokes run). ring.js makes it into meshes;
// the tests read it. No three.js here. GPLv3.
//
// The shape is RING's (core.js, held equal to orbit_core.h): the band 5 km in radius and 1 km wide,
// the floor at 5,000 m, the hull 40 m under it, the roof 300 m over it, the rim 80 m above the roof,
// six spokes, the hub 160 m in radius with its port 350 m out along -y. What is added here is detail
// on that shape: walls 30 m thick, trusses, ribs, lights, a town.

import { HUB_PORT_M, RING } from './core.js';
import { rng } from './paint.js';

export { RING };

export const HALF = RING.width / 2;               // 500 m: the band's outer faces
export const WALL = 30;                            // m: the end walls' thickness
export const INNER = HALF - WALL;                  // 470 m: the habitat, floor and roof, is |y| < INNER
export const PORT_CLEAR = 45;                      // m: the port face, this far round the axis, is docking's to mark
export const PORT = { torus: 45, tube: 6, mouth: 39 };   // the port's ring and dark mouth, as the sketch has always had them
export const COLLAR = { r: 200, half: 60 };        // the hub's collar, where the spokes meet it
export const MAST = { y0: HUB_PORT_M, y1: HUB_PORT_M + 560, r: 10 };   // the solar mast, held still to face the Sun
export const ARRAYS = { at: [530, 690, 850], span: 260, chord: 110, root: 24 };   // its wings: y, length out, width
export const RADIATORS = { count: 6, r0: 168, r1: 470, y0: 95, y1: 335 };
export const TILES = 4;                            // the floor's town repeats this many times round
export const TILE = (2 * Math.PI * RING.floor) / TILES;   // m of floor in one repeat
export const SIDE_COLOURS = { [-1]: [1.0, 0.16, 0.1], 1: [0.15, 1.0, 0.35] };   // the port side's rims red, the far side's green

// The open flight deck: a sector of the band with no roof, where a craft that can land upright sets down
// on pads under the spin's 1 g. Its numbers are RING.deck where core.js has them (orbit_core.h's
// OC_DECK_*), else these, the same: centred `angle` degrees round in the spokes' own convention (midway
// between spokes 0 and 1), `arc` m of floor long, sealed from the town at each end by a bulkhead
// `bulkhead` m thick standing just outside it. Its pads, `pads` of them `padSpacing` apart on its
// centreline, each `padRadius` m across, are the deck's own part of the page to draw (deck-view.js).
export const DECK = RING.deck || { angle: 30, arc: 1500, bulkhead: 20, pads: 3, padSpacing: 400, padRadius: 25 };
export const DECK_A = (DECK.angle * Math.PI) / 180;         // the sector's middle, rad
export const DECK_HALF = DECK.arc / 2 / RING.floor;         // its half-angle at the floor, rad
export const DECK_WALL = DECK.bulkhead / RING.floor;        // a bulkhead's thickness, as an angle at the floor
export const DECK_DOOR = { half: 280, top: RING.floor - 210 };   // each bulkhead's hangar door: 560 m wide, 210 m tall

const TAU = 2 * Math.PI;
const at = (r, a, y) => [r * Math.sin(a), y, r * Math.cos(a)];
const round = (a) => [Math.cos(a), 0, -Math.sin(a)];   // the way round, at angle a

export function spokeAngle(k) { return (k / RING.spokes) * TAU; }

// How far round from the deck's middle angle a is, rad, -pi to pi.
export function fromDeck(a) { return Math.atan2(Math.sin(a - DECK_A), Math.cos(a - DECK_A)); }

// Whether angle a is over the open deck, its bulkheads included where `walls`.
export function onDeck(a, walls = true) { return Math.abs(fromDeck(a)) < DECK_HALF + (walls ? DECK_WALL : 0); }

// The bulkheads: one at each end of the deck, from the floor up past the roof's edge and from end wall
// to end wall. a: the middle of its thickness; face: the angle of its face toward the deck.
export function bulkheads() {
  return [-1, 1].map((side) => ({
    side, a: DECK_A + side * (DECK_HALF + DECK_WALL / 2), face: DECK_A + side * DECK_HALF,
    r0: RING.roof - 12, r1: RING.floor, y: HALF - 2,
  }));
}

// A member: a box from a to b, w across along `up` (made square to the length), t through the third way.
function member(a, b, w, t, up, shade = 1) { return { a, b, w, t, up, shade }; }

// The members, by kind: each a list of member(). settings: a tier's ring settings (quality.js).
export function structure(settings) {
  const out = { spokes: [], yokes: [], rims: [], ribs: [], stringers: [], hub: [] };
  const S = RING.spoke, h = S / 2;
  const r0 = COLLAR.r, r1 = RING.rim;
  // the spokes: square trusses, four chords, a batten round each station and a diagonal on each face
  for (let k = 0; k < RING.spokes; k++) {
    const a = spokeAngle(k), e = round(a), d = [Math.sin(a), 0, Math.cos(a)];
    const P = (r, i, j) => { const c = at(r, a, j * h); return [c[0] + e[0] * i * h, c[1], c[2] + e[2] * i * h]; };
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    if (settings.struts) {
      for (const [i, j] of corners) out.spokes.push(member(P(r0, i, j), P(r1, i, j), 3.2, 3.2, [0, 1, 0], 0.9));
      const n = Math.max(2, Math.round((r1 - r0) / settings.bay));
      for (let s = 0; s <= n; s++) {
        const r = r0 + ((r1 - r0) * s) / n;
        for (let c = 0; c < 4; c++) {
          const [i0, j0] = corners[c], [i1, j1] = corners[(c + 1) % 4];
          out.spokes.push(member(P(r, i0, j0), P(r, i1, j1), 1.8, 1.8, d, 0.8));
          if (s < n) {
            const rn = r0 + ((r1 - r0) * (s + 1)) / n, flip = s % 2;
            out.spokes.push(member(P(flip ? rn : r, i0, j0), P(flip ? r : rn, i1, j1), 1.3, 1.3, [0, 1, 0], 0.7));
          }
        }
      }
    } else {
      out.spokes.push(member(at(r0, a, 0), at(r1, a, 0), S, S, [0, 1, 0], 1));   // painted as a lattice
    }
    // the yoke the spoke ends on: a girder across the band above the roof, from rim to rim
    out.yokes.push(member(at((RING.rim + RING.roof) / 2 - 2, a, -INNER), at((RING.rim + RING.roof) / 2 - 2, a, INNER), 64, RING.roof - RING.rim, e, 0.85));
  }
  // the rims: a triangular girder round each edge, standing on the rim toward the axis
  if (settings.struts) {
    for (const side of [-1, 1]) {
      const n = Math.round((TAU * RING.rim) / settings.rimBay);
      const A = (s) => at(RING.rim - 2, (s / n) * TAU, side * (INNER + 4));
      const B = (s) => at(RING.rim - 2, (s / n) * TAU, side * (HALF - 4));
      const C = (s) => at(RING.rim - 46, (s / n) * TAU, side * ((INNER + HALF) / 2));
      for (let s = 0; s < n; s++) {
        const up = round((s / n) * TAU);
        out.rims.push(member(A(s), A(s + 1), 2.6, 2.6, [0, 1, 0], 0.9), member(B(s), B(s + 1), 2.6, 2.6, [0, 1, 0], 0.9));
        out.rims.push(member(C(s), C(s + 1), 3, 3, [0, 1, 0], 0.95));
        out.rims.push(member(A(s), C(s), 1.4, 1.4, up, 0.75), member(B(s), C(s), 1.4, 1.4, up, 0.75));
        out.rims.push(member(A(s), C(s + 1), 1.1, 1.1, up, 0.7), member(B(s + 1), C(s), 1.1, 1.1, up, 0.7));
      }
    }
  }
  // ribs on the outer faces of the end walls, and stringers along the hull between them
  for (let j = 0; j < settings.ribs; j++) {
    const a = ((j + 0.5) / settings.ribs) * TAU, e = round(a);
    for (const side of [-1, 1]) out.ribs.push(member(at(RING.rim + 4, a, side * (HALF + 5)), at(RING.hull - 4, a, side * (HALF + 5)), 6, 10, e, 0.95));
    out.stringers.push(member(at(RING.hull + 3, a, -HALF + 2), at(RING.hull + 3, a, HALF - 2), 6, 6, e, 0.9));
  }
  // the hub: the collar's gussets to each spoke, the radiators between the spokes
  for (let k = 0; k < RING.spokes; k++) {
    const a = spokeAngle(k), e = round(a);
    for (const j of [-1, 1]) out.hub.push(member(at(RING.hub, a, j * 52), at(COLLAR.r + 40, a, j * 30), 10, 10, e, 0.85));
  }
  return out;
}

// The radiators: flat panels standing out from the hub between the spokes, on the side away from the
// port. Each { a: angle, r0, r1, y0, y1 }.
export function radiators() {
  const out = [];
  for (let k = 0; k < RADIATORS.count; k++) out.push({ a: spokeAngle(k) + Math.PI / RING.spokes, ...RADIATORS });
  return out;
}

// Lights: { p, c (linear, brighter than white where they should glow), size (px), blink: [period s,
// phase, duty] or null, night: lit only out of the Sun }. `spin`: the lights on what turns; `still`:
// on the solar mast, which does not.
export function lights(settings) {
  const spin = [], still = [];
  const add = (list, p, c, size, blink = null, night = false) => list.push({ p, c, size, blink, night });
  const radii = [RING.rim + 6, RING.hull - 6, RING.roof, RING.floor - 60, RING.floor - 160].slice(0, settings.lightRings);
  for (const side of [-1, 1]) {
    radii.forEach((r, i) => {
      for (let j = 0; j < settings.lights; j++) {
        const a = ((j + (i % 2) * 0.5) / settings.lights) * TAU;
        const p = at(r, a, side * (HALF + 1.5));
        if (i < 2) add(spin, p, SIDE_COLOURS[side].map((v) => v * 7), 2.2, i === 0 ? [2.4, (j % 2) * 0.5, 0.5] : null);
        else add(spin, p, [5, 4.2, 3.2], 1.6, null, true);
      }
    });
  }
  // along each spoke's chords, and a beacon at each end
  const every = settings.struts ? 220 : 440;
  for (let k = 0; k < RING.spokes; k++) {
    const a = spokeAngle(k), e = round(a), h = RING.spoke / 2 + 2;
    for (let r = COLLAR.r + every; r < RING.rim - 50; r += every) {
      for (const [i, j] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const c = at(r, a, j * h);
        add(spin, [c[0] + e[0] * i * h, c[1], c[2] + e[2] * i * h], [6, 6, 6.5], 1.4);
      }
    }
    for (const r of [COLLAR.r + 30, RING.rim - 70]) add(spin, at(r, a, -h - 4), [8, 0.6, 0.3], 2.6, [1.6, k / RING.spokes, 0.25]);
  }
  // the hub: rings round the barrel, the port's approach lights, strobes at the radiators' tips
  for (const y of [-300, -200, -100, 100, 200, 300]) {
    const n = settings.lights >= 360 ? 32 : 16;
    for (let j = 0; j < n; j++) add(spin, at(RING.hub + 4, (j / n) * TAU, y), [5, 5, 5.5], 1.5);
  }
  for (let j = 0; j < 12; j++) add(spin, at(60, (j / 12) * TAU, -HUB_PORT_M - 2), [9, 9, 9], 2.4, [1.2, j / 12, 0.18]);
  for (let j = 0; j < 4; j++) add(spin, at(RING.hub - 6, (j / 4) * TAU + Math.PI / 4, -HUB_PORT_M - 2), [10, 10, 10], 2.6, [2.0, 0.5, 0.06]);
  for (const r of radiators()) add(spin, at(r.r1 + 4, r.a, (r.y0 + r.y1) / 2), [10, 10, 10], 2.4, [3.0, r.a / TAU, 0.05]);
  // the deck: a row along each edge, clear of the centreline and its pads; the hangar doors' outlines
  // and the windows over them; a red beacon at each bulkhead's top corners
  for (let s = -DECK.arc / 2 + 25; s <= DECK.arc / 2 - 25; s += 50) {
    for (const side of [-1, 1]) add(spin, at(RING.floor - 1.5, DECK_A + s / RING.floor, side * (INNER - 40)), [4, 6, 9], 1.8);
  }
  for (const b of bulkheads()) {
    const pull = -b.side * (2 / RING.floor);   // a couple of metres out from the face, over the deck
    for (let y = -DECK_DOOR.half; y <= DECK_DOOR.half; y += 20) add(spin, at(DECK_DOOR.top - 3, b.face + pull, y), [9, 7, 3.5], 1.8);
    for (let r = DECK_DOOR.top; r < RING.floor - 4; r += 20) for (const y of [-DECK_DOOR.half, DECK_DOOR.half]) add(spin, at(r, b.face + pull, y), [9, 7, 3.5], 1.8);
    for (let y = -170; y <= 170; y += 7) for (const r of [RING.roof + 26, RING.roof + 38]) add(spin, at(r, b.face + pull, y), [5, 4.2, 3.2], 1.4, null, true);
    for (const y of [-(INNER - 12), INNER - 12]) add(spin, at(b.r0 + 4, b.face + pull, y), [10, 0.7, 0.35], 2.6, [1.5, b.side > 0 ? 0 : 0.5, 0.3]);
  }
  // the mast's tip and the arrays' wingtips
  add(still, [0, MAST.y1 + 6, 0], [10, 0.8, 0.4], 2.8, [1.0, 0, 0.5]);
  for (const y of ARRAYS.at) for (const s of [-1, 1]) add(still, [s * (ARRAYS.root + ARRAYS.span + 3), y, 0], s < 0 ? [8, 0.6, 0.3] : [0.4, 7, 1.6], 2.2);
  return { spin, still };
}

// Every building of every repeat of the town, as it stands round the Ring: u is now m round from angle 0,
// and none stands on the deck or its bulkheads. Heights differ a little from one repeat to the next.
export function standing(plan = town()) {
  const r = rng(77), out = [];
  for (let t = 0; t < TILES; t++) {
    for (const b of plan.buildings) {
      const h = b.h * (0.75 + r() * 0.5), u0 = b.u0 + t * TILE, u1 = b.u1 + t * TILE;
      if (onDeck(u0 / RING.floor) || onDeck(u1 / RING.floor) || onDeck((u0 + u1) / 2 / RING.floor)) continue;
      out.push({ ...b, u0, u1, h });
    }
  }
  return out;
}

// The town on the floor, one repeat of it: u along the floor round the Ring (0 to TILE), v across it
// (y, -INNER to INNER). A canal down the middle with quays; at three places a square where a spoke's
// lift comes down (the spokes fall at 0, 1/3 and 2/3 of a repeat); between them districts of town,
// park and fields. Town is blocks between streets, each with a few buildings, heights in m.
export const CANAL = 34, QUAY = 56, FOOT = INNER - 16;   // half-widths, m
export const SQUARES = [0, TILE / 3, (2 * TILE) / 3];    // where the lifts come down
export const SQUARE = 150;                               // m: a square's half-length along u

export function town(seed = 1974) {
  const r = rng(seed);
  const districts = [], blocks = [], buildings = [];
  // districts along u, between the squares
  const edges = [...SQUARES, TILE];
  for (let q = 0; q < SQUARES.length; q++) {
    let u = edges[q] + SQUARE;
    const end = edges[q + 1] - SQUARE;
    while (u < end - 120) {
      const len = Math.min(end - u, 260 + r() * 700);
      const roll = r();
      for (const side of [-1, 1]) {
        const kind = roll < 0.56 ? 'town' : roll < 0.8 ? 'park' : 'fields';
        districts.push({ u0: u, u1: u + len, side, kind: side > 0 && kind === 'fields' && r() < 0.5 ? 'town' : kind });
      }
      u += len;
    }
  }
  for (const d of districts) {
    if (d.kind !== 'town') continue;
    const v0 = QUAY + 6, v1 = FOOT - 6;
    for (let u = d.u0 + 8; u < d.u1 - 40; ) {
      const bu = Math.min(d.u1 - 8 - u, 64 + r() * 46);
      for (let v = v0; v < v1 - 30; ) {
        const bv = Math.min(v1 - v, 52 + r() * 34);
        const block = { u0: u, u1: u + bu, v0: d.side * v, v1: d.side * (v + bv), green: r() < 0.08 };
        if (block.v0 > block.v1) [block.v0, block.v1] = [block.v1, block.v0];
        blocks.push(block);
        if (!block.green) {
          // a few buildings in the block, set back from its streets; taller toward the canal
          const near = 1 - (v - v0) / (v1 - v0);
          const n = 1 + Math.floor(r() * 3);
          for (let b = 0; b < n; b++) {
            const w = (bu - 10) / n;
            const bu0 = u + 5 + b * w, bu1 = bu0 + w - 4;
            const inset = 4 + r() * 8;
            const height = 9 + r() * 22 + near * near * r() * 50;
            const bv0 = Math.min(block.v0, block.v1) + inset, bv1 = Math.max(block.v0, block.v1) - inset - r() * 10;
            if (bu1 - bu0 > 8 && bv1 - bv0 > 8) buildings.push({ u0: bu0, u1: bu1, v0: bv0, v1: bv1, h: height });
          }
        }
        v += bv + 12 + (r() < 0.25 ? 10 : 0);
      }
      u += bu + 12 + (r() < 0.2 ? 14 : 0);
    }
  }
  return { districts, blocks, buildings };
}
