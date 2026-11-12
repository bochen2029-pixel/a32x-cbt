// The Ring: a band 5 km in radius and 1 km wide that spins once in 142 s for one g at the floor; a roof
// of glass 300 m over the floor; six spokes to a hub on the axis, whose port faces the way the crew
// arrives. What is drawn is ring-plan.js's plan: panelled hull and end walls with ribs and rows of
// windows, a triangular girder round each rim, trusses for spokes with their lift tubes, a glazed roof
// on frames, the town under it with its canal, and at the hub radiators and a mast of solar arrays held
// still to face the Sun. Thousands of small lights, for the size. Every texture is painted by code
// (paint.js); how much is drawn is the tier's (quality.js). GPLv3.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { HUB_PORT_M } from './core.js';
import { lightPoints, lightsMaterial } from './glow.js';
import { Paint, rng } from './paint.js';
import {
  ARRAYS, CANAL, COLLAR, DECK, DECK_A, DECK_DOOR, DECK_HALF, DECK_WALL, FOOT, HALF, INNER, MAST, PORT, QUAY, RING, SQUARE, SQUARES,
  TILE, TILES, bulkheads, lights as planLights, radiators as planRadiators, spokeAngle, standing, structure, town,
} from './ring-plan.js';

export { RING };

const TAU = 2 * Math.PI;

// ---- textures ------------------------------------------------------------------------------------

function dataTexture(bytes, w, h, { srgb = false, anisotropy = 4 } = {}) {
  const t = new THREE.DataTexture(bytes, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = anisotropy;
  t.needsUpdate = true;
  return t;
}

// A painted surface's three textures: albedo (sRGB, glow in alpha where `glowInAlpha`), normal (when
// the tier has relief), and the mask: glow, roughness, metalness.
function textures(paint, settings, anisotropy, { normal = 3, glowInAlpha = false } = {}) {
  const { w, h } = paint;
  return {
    map: dataTexture(paint.albedoBytes(glowInAlpha), w, h, { srgb: true, anisotropy }),
    normalMap: settings.normalMaps ? dataTexture(paint.normalBytes(normal), w, h, { anisotropy }) : null,
    mask: dataTexture(paint.maskBytes(), w, h, { anisotropy }),
  };
}

const grey = (v, warm = 0) => [v * (1 + warm), v, v * (1 - warm * 0.6)];

// Big panels with seams, smaller ones inside some, a tone of their own each: the skin of the hull and
// of the hub. `scale`: texels per metre.
function panelled(paint, r, { across, along, base, spread, dark = 0.06, accents = 0.04, scale }) {
  const { w, h } = paint;
  for (let x = 0; x < w; ) {
    const pw = Math.max(4, Math.round(across * scale * (0.6 + r() * 0.8)));
    for (let y = 0; y < h; ) {
      const ph = Math.max(4, Math.round(along * scale * (0.5 + r() * 1.0)));
      const roll = r();
      const v = roll < dark ? base * 0.42 : base * (1 - spread / 2 + r() * spread);
      const col = roll > 1 - accents ? [0.62, 0.47, 0.2] : grey(v, (r() - 0.5) * 0.06);
      paint.rect(x, y, x + pw, y + ph, { albedo: col, height: 0.1 + r() * 0.15, rough: 0.38 + r() * 0.3, metal: roll > 1 - accents ? 0.7 : 0.1 + r() * 0.25 });
      paint.seam(x, y, x + pw, y + ph, Math.max(1, Math.round(scale * 0.25)), 0.5, 0.7);
      if (r() < 0.35) {   // sub-panels
        const n = 2 + Math.floor(r() * 3);
        for (let k = 1; k < n; k++) paint.rect(x + (k * pw) / n, y + 2, x + (k * pw) / n + 1, y + ph - 2, { raise: -0.25, tint: 0.85 });
      }
      if (r() < 0.12) {   // a hatch, or a vent
        const hw = Math.round(scale * (1.5 + r() * 2.5)), hy = y + Math.round(r() * Math.max(1, ph - hw));
        paint.rect(x + 3, hy, x + 3 + hw, hy + hw, { tint: 0.6, raise: -0.3, rough: 0.7 });
      }
      y += ph;
    }
    x += pw;
  }
}

// The hull outside the floor: u round (a 1/120 of the way), v across the band (1,000 m).
function paintHull(T, seed) {
  const w = Math.max(64, T / 4), h = T, scale = h / (2 * HALF), r = rng(seed);
  const p = new Paint(w, h, { base: grey(0.6), rough: 0.5, metal: 0.15 });
  panelled(p, r, { across: 16, along: 40, base: 0.58, spread: 0.22, scale });
  // two raised rails along the band, and the tracks the service crawlers run on
  for (const v of [0.2, 0.5, 0.8]) p.rect(0, v * h - scale * 2, w, v * h + scale * 2, { albedo: grey(0.35), height: 0.6, rough: 0.6, metal: 0.5 });
  p.grain(r, 0.04, 0.05);
  return p;
}

// The end walls' outer faces: u round (1/120), v from the rim (4,620 m) to the hull (5,040 m). Bands
// of windows in the habitat's end wall, the rim girder's face above them, the floor's works below; the
// two ribs a tile carries leave a pillar clear at u = 1/4 and 3/4.
function paintWall(T, seed) {
  const w = T / 2, h = T, span = RING.hull - RING.rim, scale = h / span, r = rng(seed);
  const p = new Paint(w, h, { base: grey(0.55), rough: 0.55, metal: 0.2 });
  const V = (radius) => ((radius - RING.rim) / span) * h;
  panelled(p, r, { across: 22, along: 18, base: 0.5, spread: 0.25, scale, accents: 0.02 });
  p.rect(0, V(RING.rim), w, V(RING.roof), { tint: 0.62 });                       // the rim girder's face
  p.rect(0, V(RING.roof) - scale * 2, w, V(RING.roof) + scale * 4, { albedo: grey(0.75), height: 0.5, rough: 0.35, metal: 0.4 });
  p.rect(0, V(RING.floor - 8), w, V(RING.hull), { tint: 0.45 });                 // the floor's works
  for (let k = 0; k < 6; k++) {
    const y = V(RING.floor - 4) + (k / 6) * (V(RING.hull) - V(RING.floor - 4));
    p.rect(0, y, w, y + scale * 1.5, { raise: 0.5, tint: 1.3, metal: 0.6 });
  }
  // windows: three bands of ten storeys, 4 m apart round, lit at random
  const bands = [[RING.roof + 30, RING.roof + 78], [RING.roof + 112, RING.roof + 160], [RING.roof + 194, RING.roof + 242]];
  const pillar = (x) => Math.min(Math.abs(x / w - 0.25), Math.abs(x / w - 0.75)) * w < scale * 9;
  for (const [a, b] of bands) {
    p.rect(0, V(a) - scale * 3, w, V(b) + scale * 3, { albedo: grey(0.3), rough: 0.3, metal: 0.3, height: -0.2 });
    for (let y = V(a); y + scale * 2.4 < V(b); y += scale * 4.8) {
      for (let x = scale * 1; x + scale * 2 < w; x += scale * 4) {
        if (pillar(x)) continue;
        const lit = r() < 0.4 ? 0.35 + r() * 0.65 : 0.03 * r();
        p.rect(x, y, x + scale * 2.2, y + scale * 2.4, { albedo: [0.03, 0.04, 0.05], glow: lit, rough: 0.08, metal: 0.0, height: -0.4 });
      }
    }
  }
  for (const u of [0.25, 0.75]) p.rect(u * w - scale * 8, 0, u * w + scale * 8, h, { tint: 0.8, rough: 0.6 });
  p.grain(r, 0.05, 0.05);
  return p;
}

// The end walls' inner faces, toward the habitat: u round (1/120), v from the rim (4,620 m) to the
// floor (5,000 m). Above the roof the girder; below it terraces, their windows and gardens.
function paintInner(T, seed) {
  const w = T / 4, h = T / 2, span = RING.floor - RING.rim, scale = h / span, r = rng(seed);
  const p = new Paint(w, h, { base: grey(0.45), rough: 0.6, metal: 0.15 });
  const V = (radius) => ((radius - RING.rim) / span) * h;
  panelled(p, r, { across: 20, along: 14, base: 0.42, spread: 0.2, scale, accents: 0 });
  p.rect(0, V(RING.rim), w, V(RING.roof), { tint: 0.7 });
  for (let y = V(RING.roof + 14); y < V(RING.floor - 6); y += scale * 12) {   // terraces, 12 m a storey pair
    p.rect(0, y, w, y + scale * 2.5, { albedo: [0.1, 0.17, 0.06], rough: 0.95, metal: 0, raise: 0.8 });   // a planted ledge
    for (let x = 0; x < w; x += scale * 3.5) {
      const lit = r() < 0.45 ? 0.3 + r() * 0.7 : 0.02;
      p.rect(x + scale * 0.5, y + scale * 3.5, x + scale * 3, y + scale * 9, { albedo: [0.05, 0.06, 0.07], glow: lit, rough: 0.1, raise: -0.4 });
    }
  }
  p.grain(r, 0.06, 0.05);
  return p;
}

// The hub's skin: u round its barrel (1/8 of it, 126 m), v along it (175 m).
function paintHub(T, seed) {
  const w = T / 2, h = T / 2, scale = w / ((TAU * RING.hub) / 8), r = rng(seed);
  const p = new Paint(w, h, { base: grey(0.7), rough: 0.45, metal: 0.2 });
  panelled(p, r, { across: 7, along: 10, base: 0.68, spread: 0.08, scale, accents: 0.015, dark: 0.02 });
  for (let k = 0; k < 40; k++) p.disc(r() * w, r() * h, scale * (0.4 + r() * 0.8), { tint: 0.7, raise: 0.4, metal: 0.6 });
  p.grain(r, 0.03, 0.04);
  return p;
}

// Radiator panels: white, with the coolant's tubes standing proud along them.
function paintRadiator(T, seed) {
  const w = Math.max(32, T / 8), h = T / 2, r = rng(seed);
  const p = new Paint(w, h, { base: grey(0.8), rough: 0.35, metal: 0.05 });
  for (let x = 0; x < w; x += 8) p.rect(x, 0, x + 2, h, { raise: 1, albedo: grey(0.88), rough: 0.25 });
  for (let y = 0; y < h; y += h / 6) p.rect(0, y, w, y + 3, { albedo: grey(0.45), raise: 0.6, metal: 0.6 });
  p.grain(r, 0.03, 0.05);
  return p;
}

// Solar cells: deep blue glass, a grid of silver between them.
function paintArray(T, seed) {
  const w = Math.max(64, T / 4), h = w, r = rng(seed);
  const p = new Paint(w, h, { base: [0.012, 0.022, 0.07], rough: 0.18, metal: 0.25 });
  const cell = w / 16;
  for (let x = 0; x < w; x += cell) for (let y = 0; y < h; y += cell) {
    p.rect(x, y, x + cell, y + cell, { albedo: [0.01 + r() * 0.01, 0.018 + r() * 0.012, 0.06 + r() * 0.03] });
    p.rect(x, y, x + 1, y + cell, { albedo: [0.5, 0.52, 0.56], metal: 0.9, rough: 0.3, raise: 0.3 });
    p.rect(x, y, x + cell, y + 1, { albedo: [0.5, 0.52, 0.56], metal: 0.9, rough: 0.3, raise: 0.3 });
  }
  return p;
}

// A face of a spoke where the tier paints it rather than builds it: four chords and the diagonals,
// alpha in the glow channel's place.
// Returned as bytes for an alphaMap, which reads green: the members are green 255, the gaps 0. One bay
// of the truss across the texture's width (u runs along a member), the chords along its two edges.
function paintLattice() {
  const n = 64, p = new Paint(n, n);
  const mark = (x, y) => p.rect(x, y, x + 1, y + 1, { glow: 1 });
  for (let x = 0; x < n; x++) {
    for (let t = 0; t < 4; t++) { mark(x, t); mark(x, n - 1 - t); }
    for (let t = -2; t <= 2; t++) mark(x, x + t);
  }
  for (let y = 0; y < n; y++) for (let t = 0; t < 3; t++) mark(t, y);
  const bytes = p.maskBytes();
  for (let i = 0; i < bytes.length; i += 4) bytes[i + 1] = bytes[i];
  return { bytes, w: n, h: n };
}

// The town, from the plan: canal and quays, squares, parks, fields, streets and roofs; glow (in the
// albedo's alpha) where it is lit at night. u round, one repeat of TILE; v across, the habitat's width.
function paintFloor(T, plan, seed) {
  const w = Math.min(4096, Math.max(2048, T * 2)), h = Math.max(256, T / 4);
  const su = w / TILE, sv = h / (2 * INNER), r = rng(seed);
  const p = new Paint(w, h, { base: [0.09, 0.15, 0.05], rough: 0.92, metal: 0 });
  const X = (u) => u * su, Y = (v) => (v + INNER) * sv;
  const box = (u0, u1, v0, v1, paint) => p.rect(X(u0), Y(Math.min(v0, v1)), X(u1), Y(Math.max(v0, v1)), paint);
  // lawns and woods everywhere first, then what is built
  for (let k = 0; k < (w * h) / 40; k++) {
    const x = r() * w, y = r() * h, s = 1 + r() * 2.5;
    p.disc(x, y, s, { albedo: r() < 0.5 ? [0.035, 0.08, 0.03] : [0.13, 0.2, 0.07], raise: 0.4 });
  }
  for (const d of plan.districts) {
    const v0 = d.side * QUAY, v1 = d.side * FOOT;
    if (d.kind === 'fields') {
      let u = d.u0;
      while (u < d.u1) {
        const len = 30 + r() * 70, crop = [[0.2, 0.2, 0.06], [0.12, 0.2, 0.05], [0.3, 0.26, 0.1], [0.16, 0.13, 0.06]][Math.floor(r() * 4)];
        box(u, Math.min(d.u1, u + len), v0, v1, { albedo: crop, rough: 0.95 });
        for (let s = u; s < Math.min(d.u1, u + len); s += 3) box(s, s + 1, v0, v1, { tint: 0.8 });
        u += len + 4;
      }
    } else if (d.kind === 'town') {
      box(d.u0, d.u1, v0, v1, { albedo: [0.05, 0.05, 0.055], rough: 0.85 });   // streets, between the blocks
    } else {
      if (r() < 0.5) {   // a park: paths, and now and then a pond
        const u = d.u0 + r() * (d.u1 - d.u0), v = d.side * (QUAY + 60 + r() * (FOOT - QUAY - 120));
        p.disc(X(u), Y(v), 6 + r() * 8, { albedo: [0.015, 0.035, 0.05], rough: 0.06, raise: -1 });
      }
      box(d.u0, d.u1, d.side * (QUAY + 40), d.side * (QUAY + 44), { albedo: [0.35, 0.32, 0.26] });
    }
  }
  for (const b of plan.blocks) {
    box(b.u0, b.u1, b.v0, b.v1, b.green ? { albedo: [0.12, 0.2, 0.07] } : { albedo: [0.26, 0.25, 0.23], rough: 0.8 });
    // street lights round each block
    for (let u = b.u0; u < b.u1; u += 22) for (const v of [b.v0, b.v1]) box(u, u + 2, v, v + Math.sign(v || 1) * 2, { glow: 0.9 });
  }
  for (const b of plan.buildings) {
    const roof = r() < 0.2 ? [0.32, 0.16, 0.09] : r() < 0.15 ? [0.1, 0.16, 0.07] : grey(0.3 + r() * 0.25);
    box(b.u0, b.u1, b.v0, b.v1, { albedo: roof, raise: 2 + b.h / 10, rough: 0.7, metal: r() < 0.3 ? 0.4 : 0.05 });
    // what shows of its lit windows from above: a few points along its edges
    for (let k = 0; k < (b.u1 - b.u0) / 6; k++) {
      const u = b.u0 + r() * (b.u1 - b.u0), v = r() < 0.5 ? b.v0 : b.v1;
      if (r() < 0.6) box(u, u + 1.5, v - 1, v + 1, { glow: 0.5 + r() * 0.5 });
    }
  }
  // the canal, its quays, the squares and the roads along the walls' feet
  box(0, TILE, -QUAY, QUAY, { albedo: [0.4, 0.38, 0.34], rough: 0.7 });
  box(0, TILE, -CANAL, CANAL, { albedo: [0.01, 0.03, 0.045], rough: 0.05, metal: 0, height: -2 });
  for (const s of [-1, 1]) {
    box(0, TILE, s * (CANAL + 2), s * (CANAL + 4), { glow: 0.5 });
    box(0, TILE, s * FOOT, s * INNER, { albedo: [0.3, 0.3, 0.29], rough: 0.8 });
    for (let u = 0; u < TILE; u += 30) box(u, u + 3, s * (FOOT + 2), s * (FOOT + 5), { glow: 0.8 });
  }
  for (const u of SQUARES) {
    for (const du of [0, TILE]) {
      const c = u + du;
      box(c - SQUARE, c + SQUARE, -QUAY - 60, QUAY + 60, { albedo: [0.46, 0.44, 0.4], rough: 0.6, glow: 0 });
      box(c - 40, c + 40, -CANAL, CANAL, { albedo: [0.4, 0.38, 0.35] });   // the island the lift stands on
      // lamps across the square at night, a grid of points rather than a lit slab
      for (let u = c - SQUARE + 10; u < c + SQUARE; u += 24) for (let v = -QUAY - 50; v < QUAY + 60; v += 24) box(u, u + 2, v, v + 2, { glow: 0.9 });
    }
  }
  p.grain(r, 0.06);
  return p;
}

// The deck: dark plates in rows, their seams, wear down the middle, a painted line along each side and
// across each end, small lights set in the plating by the edges; the centreline left plain, where the
// pads are drawn. u along the deck (its bulkheads included), v across it.
function paintDeck(T, seed) {
  const len = DECK.arc + 2 * DECK.bulkhead, w = T / 2, h = T / 4, su = w / len, sv = h / (2 * INNER), r = rng(seed);
  const p = new Paint(w, h, { base: [0.085, 0.09, 0.1], rough: 0.65, metal: 0.35 });
  const X = (u) => (u + len / 2) * su, Y = (v) => (v + INNER) * sv;
  for (let u = -len / 2; u < len / 2; u += 12) {
    for (let v = -INNER; v < INNER; v += 8) {
      const k = 0.075 + r() * 0.04;
      p.rect(X(u), Y(v), X(u + 12), Y(v + 8), { albedo: [k, k * 1.03, k * 1.1], height: 0.2 + r() * 0.1, rough: 0.55 + r() * 0.2 });
      p.seam(X(u), Y(v), X(u + 12), Y(v + 8), 1, 0.4, 0.7);
    }
  }
  p.rect(X(-len / 2), Y(-180), X(len / 2), Y(180), { tint: 0.85 });              // where the craft come and go, darker
  const paint = { albedo: [0.55, 0.42, 0.08], rough: 0.5, metal: 0 }, white = { albedo: [0.6, 0.6, 0.58], rough: 0.5, metal: 0 };
  for (const v of [-(INNER - 55), INNER - 55]) p.rect(X(-len / 2), Y(v - 2.5), X(len / 2), Y(v + 2.5), paint);
  for (const u of [-(DECK.arc / 2 - 30), DECK.arc / 2 - 30]) p.rect(X(u - 2.5), Y(-INNER + 55), X(u + 2.5), Y(INNER - 55), paint);
  // lanes toward the bulkheads' doors along each side, kept off the centreline and its pads
  for (const v of [-(INNER - 140), INNER - 140, -(INNER - 250), INNER - 250]) {
    for (let u = -DECK.arc / 2 + 40; u < DECK.arc / 2 - 40; u += 30) p.rect(X(u), Y(v - 1.5), X(u + 18), Y(v + 1.5), white);
  }
  for (let u = -DECK.arc / 2 + 12; u < DECK.arc / 2; u += 24) for (const v of [-(INNER - 65), INNER - 65]) p.rect(X(u), Y(v - 1), X(u + 2), Y(v + 1), { glow: 1, albedo: [0.4, 0.45, 0.5] });
  p.grain(r, 0.05, 0.05);
  return p;
}

// A bulkhead's face toward the deck: u across the band (y), v from its top (the roof's edge) down to the
// floor. Panels; the hangar door, its leaves and its lit frame; a row of windows over it.
function paintBulkhead(T, seed) {
  const span = 2 * INNER, tall = RING.floor - (RING.roof - 12), w = T / 2, h = T / 4, su = w / span, sv = h / tall, r = rng(seed);
  const p = new Paint(w, h, { base: grey(0.4), rough: 0.55, metal: 0.3 });
  const X = (y) => (y + INNER) * su, Y = (radius) => (radius - (RING.roof - 12)) * sv;
  panelled(p, r, { across: 30, along: 20, base: 0.4, spread: 0.18, scale: su, accents: 0.01, dark: 0.04 });
  const d = DECK_DOOR;
  p.rect(X(-d.half - 6), Y(d.top - 6), X(d.half + 6), Y(RING.floor), { albedo: grey(0.22), rough: 0.4, metal: 0.6, height: -1 });
  for (let y = -d.half; y < d.half; y += 40) {
    p.rect(X(y), Y(d.top), X(y + 40), Y(RING.floor), { albedo: grey(0.3 + r() * 0.06), height: -0.5, rough: 0.45, metal: 0.5 });
    p.rect(X(y), Y(d.top), X(y) + 1, Y(RING.floor), { tint: 0.4, raise: -0.5 });
    for (let v = d.top + 15; v < RING.floor; v += 15) p.rect(X(y + 2), Y(v), X(y + 38), Y(v) + 1, { tint: 0.75 });
  }
  p.rect(X(-d.half - 6), Y(d.top - 6), X(d.half + 6), Y(d.top - 3), { glow: 0.9, albedo: grey(0.6) });
  for (const y of [-d.half - 6, d.half + 3]) p.rect(X(y), Y(d.top - 6), X(y + 3), Y(RING.floor), { glow: 0.9, albedo: grey(0.6) });
  for (let y = -170; y < 170; y += 7) for (const v of [RING.roof + 24, RING.roof + 36]) p.rect(X(y), Y(v), X(y + 4.5), Y(v + 5), { albedo: [0.04, 0.05, 0.06], glow: r() < 0.7 ? 0.6 + r() * 0.4 : 0.05, rough: 0.1 });
  p.grain(r, 0.04, 0.04);
  return p;
}

// Windows on the buildings' walls: 16 by 16 of them, 4 m apart and 3.5 m a storey; lit at random.
function paintFacade(seed) {
  const n = 16, c = 8, w = n * c, r = rng(seed);
  const p = new Paint(w, w, { base: grey(0.42), rough: 0.6, metal: 0.1 });
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const lit = r() < 0.4 ? 0.4 + r() * 0.6 : 0;
    p.rect(i * c + 2, j * c + 2, i * c + c - 1, j * c + c - 2, { albedo: [0.04, 0.05, 0.06], glow: lit, rough: 0.1 });
  }
  return p;
}

// ---- geometry ------------------------------------------------------------------------------------

function build(pos, nor, uv, idx, col = null) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (col) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

// An open cylinder round the axis, its normals out (or in); u round in `uTiles` repeats, v along. From
// angle a0 to a1 where it is not the whole way round: u keeps the whole way's mapping, so a texture runs
// on across a gap, unless `local`, where u runs 0 to uTiles over the part.
function cylinder({ r, y0, y1, segs, inward = false, uTiles = 1, vTiles = 1, a0 = 0, a1 = TAU, local = false }) {
  const pos = [], nor = [], uv = [], idx = [];
  const n = Math.max(2, Math.ceil(segs * ((a1 - a0) / TAU)));
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n, s = Math.sin(a), c = Math.cos(a);
    for (const [y, v] of [[y0, 0], [y1, vTiles]]) {
      pos.push(r * s, y, r * c);
      nor.push(inward ? -s : s, 0, inward ? -c : c);
      uv.push(local ? (i / n) * uTiles : (a / TAU) * uTiles, v);
    }
  }
  segs = n;
  for (let i = 0; i < segs; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    if (inward) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
  }
  return build(pos, nor, uv, idx);
}

// A flat ring across the axis at y, facing +y (facing 1) or -y; u round, v from r0 to r1.
function annulus({ r0, r1, y, segs, facing, uTiles = 1, vTiles = 1 }) {
  const pos = [], nor = [], uv = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * TAU, s = Math.sin(a), c = Math.cos(a);
    for (const [r, v] of [[r0, 0], [r1, vTiles]]) {
      pos.push(r * s, y, r * c);
      nor.push(0, facing, 0);
      uv.push((i / segs) * uTiles, v);
    }
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    if (facing > 0) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
  }
  return build(pos, nor, uv, idx);
}

// Boxes from the plan's members, merged: position, normal, a shade per member in the colour, and uv
// along each member (u: its length in units of its width) for a painted lattice.
export function membersGeometry(list, jitter = 0.08, seed = 5) {
  const r = rng(seed);
  const pos = [], nor = [], col = [], uv = [], idx = [];
  const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
  for (const m of list) {
    const A = v3(...m.a), B = v3(...m.b), L = B.clone().sub(A);
    const len = L.length();
    if (len < 1e-6) continue;
    L.divideScalar(len);
    let U = v3(...m.up);
    U.addScaledVector(L, -U.dot(L));
    if (U.lengthSq() < 1e-6) { U = Math.abs(L.y) < 0.9 ? v3(0, 1, 0) : v3(1, 0, 0); U.addScaledVector(L, -U.dot(L)); }
    U.normalize();
    const W = v3().crossVectors(L, U).normalize();
    const shade = m.shade * (1 + (r() - 0.5) * 2 * jitter);
    const hw = m.w / 2, ht = m.t / 2;
    const corner = (P, su, sw) => P.clone().addScaledVector(U, su * hw).addScaledVector(W, sw * ht);
    // the four long faces: [normal, how far out it is, the axis across it, its half-width]
    const faces = [[U, hw, W, ht], [U.clone().negate(), hw, W, ht], [W, ht, U, hw], [W.clone().negate(), ht, U, hw]];
    for (const [n, out, across, half] of faces) {
      const base = pos.length / 3;
      const pts = [];
      for (const P of [A, B]) for (const s of [-1, 1]) pts.push(P.clone().addScaledVector(n, out).addScaledVector(across, s * half));
      for (const q of pts) { pos.push(q.x, q.y, q.z); nor.push(n.x, n.y, n.z); col.push(shade, shade, shade); }
      uv.push(0, 0, 0, 1, len / m.w, 0, len / m.w, 1);
      // pts: A-, A+, B-, B+; wound so that the front is the side n points to
      const c = v3().crossVectors(pts[2].clone().sub(pts[0]), pts[1].clone().sub(pts[0]));
      if (c.dot(n) > 0) idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
      else idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
    // the two ends
    for (const [P, n] of [[A, L.clone().negate()], [B, L]]) {
      const base = pos.length / 3;
      const pts = [corner(P, -1, -1), corner(P, 1, -1), corner(P, 1, 1), corner(P, -1, 1)];
      for (const q of pts) { pos.push(q.x, q.y, q.z); nor.push(n.x, n.y, n.z); col.push(shade, shade, shade); uv.push(0, 0); }
      const c = v3().crossVectors(pts[1].clone().sub(pts[0]), pts[2].clone().sub(pts[0]));
      if (c.dot(n) > 0) idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      else idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
  }
  return build(pos, nor, uv, idx, col);
}

// The buildings of every repeat of the town: boxes standing in from the floor, walls and roofs apart
// (the walls carry the windows). Heights differ from one repeat to the next.
function buildingsGeometry(list) {
  const walls = { pos: [], nor: [], uv: [], idx: [] }, roofs = { pos: [], nor: [], uv: [], idx: [] };
  const P = (u, v, lift) => {   // floor point at u (m round), v (y), raised `lift` m toward the axis
    const a = u / RING.floor, rad = RING.floor - lift;
    return [rad * Math.sin(a), v, rad * Math.cos(a)];
  };
  const quad = (G, a, b, c, d, n, uvs) => {
    const base = G.pos.length / 3;
    for (const q of [a, b, c, d]) G.pos.push(...q);
    for (let k = 0; k < 4; k++) G.nor.push(...n);
    G.uv.push(...uvs);
    G.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  const norm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const crossv = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  {
    for (const b of list) {
      const { h, u0, u1 } = b;
      // footprint corners on the floor (sunk a metre) and at the roof
      const f = [P(u0, b.v0, -1), P(u1, b.v0, -1), P(u1, b.v1, -1), P(u0, b.v1, -1)];
      const top = [P(u0, b.v0, h), P(u1, b.v0, h), P(u1, b.v1, h), P(u0, b.v1, h)];
      const lens = [u1 - u0, b.v1 - b.v0, u1 - u0, b.v1 - b.v0];
      for (let k = 0; k < 4; k++) {
        const k1 = (k + 1) % 4;
        // a wall from corner k to k1, facing out of the footprint
        const n = norm(crossv(sub(f[k1], f[k]), sub(top[k], f[k])));
        const su = lens[k] / 64, sv = (h + 1) / 56;
        quad(walls, f[k], top[k], top[k1], f[k1], n.map((x) => -x), [0, 0, 0, sv, su, sv, su, 0]);
      }
      const up = norm(sub(top[0], f[0]));
      quad(roofs, top[0], top[3], top[2], top[1], up, [0, 0, 0, 1, 1, 1, 1, 0]);
    }
  }
  const make = (G) => build(G.pos, G.nor, G.uv, G.idx);
  return { walls: make(walls), roofs: make(roofs) };
}

// ---- materials -----------------------------------------------------------------------------------

// What every surface of the Ring shares, as GLSL: the inward direction (toward the axis) in view space,
// the local height along the axis, and from the Sun's light (three's first directional light) whether
// a point is in daylight. On the floor and what stands on it the rims cast their shadow, worked out
// rather than mapped: a point is in shade when its ray to the Sun meets the rim before it clears it.
const RING_VERTEX = /* glsl */ `
  varying vec3 vInward;
  varying float vRingY;
`;
const RING_VERTEX_MAIN = /* glsl */ `
  vInward = normalize(normalMatrix * normalize(vec3(-position.x, 0.0, -position.z) + vec3(1e-6)));
  vRingY = position.y;
`;
const RING_FRAGMENT = /* glsl */ `
  varying vec3 vInward;
  varying float vRingY;
  uniform float uSunAxial;      // the Sun's direction along the Ring's axis
  uniform float uGlowGain;      // how bright the lit windows are
  uniform vec3 uGlowColour;
  float ringSunOn() {
    #if NUM_DIR_LIGHTS > 0
      return step(0.001, dot(directionalLights[0].color, vec3(1.0)));
    #else
      return 0.0;
    #endif
  }
  vec3 ringSunDir() {
    #if NUM_DIR_LIGHTS > 0
      return directionalLights[0].direction;
    #else
      return vec3(0.0, 0.0, 1.0);
    #endif
  }
  // in the rims' shadow: 0 in shade, 1 in sun (for a point on the floor or near it)
  float ringRimShade() {
    float sIn = dot(normalize(vInward), ringSunDir());
    if (sIn <= 0.0) return 0.0;
    float rise = ${(RING.floor - RING.rim).toFixed(1)};
    float hit = vRingY + rise * uSunAxial / max(sIn, 0.02);
    return 1.0 - smoothstep(${(INNER - 6).toFixed(1)}, ${(INNER + 6).toFixed(1)}, abs(hit));
  }
`;

// A MeshStandardMaterial for a painted surface, patched: glow from the mask's red channel (or the
// albedo's alpha), brighter out of the Sun; and where `floor`, the rims' shadow.
function surface({ maps = {}, color = 0xffffff, roughness = 1, metalness = 1, side = THREE.FrontSide, floor = false,
  glowInAlpha = false, vertexColors = false, shared, normalScale = 1 }) {
  const m = new THREE.MeshStandardMaterial({
    color, roughness, metalness, side, vertexColors,
    map: maps.map || null, normalMap: maps.normalMap || null,
    roughnessMap: maps.mask || null, metalnessMap: maps.mask || null,
  });
  if (maps.normalMap) m.normalScale.set(normalScale, normalScale);
  const glowSource = glowInAlpha ? 'sampledDiffuseColor.a' : maps.mask ? 'texelRoughness.r' : '0.0';
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uSunAxial = shared.uSunAxial;
    shader.uniforms.uGlowGain = shared.uGlowGain;
    shader.uniforms.uGlowColour = shared.uGlowColour;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${RING_VERTEX}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${RING_VERTEX_MAIN}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <lights_pars_begin>', `#include <lights_pars_begin>\n${RING_FRAGMENT}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float ringShade = ${floor ? 'ringRimShade()' : '1.0'};
        float ringDay = ringSunOn() * clamp(dot(${floor ? 'normalize(vInward)' : 'normalize(vNormal)'}, ringSunDir()) * 5.0, 0.0, 1.0) * ringShade;
        totalEmissiveRadiance += uGlowColour * uGlowGain * ${glowSource} * mix(1.0, 0.1, ringDay);`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        ${floor ? 'reflectedLight.directDiffuse *= ringShade; reflectedLight.directSpecular *= ringShade;' : ''}`);
  };
  m.customProgramCacheKey = () => `ring-surface-${floor}-${glowSource}`;
  return m;
}

// The roof: glass on frames. The frames are drawn in the shader, filtered to the pixel, so at 25 km
// their lattice greys the glass as it should rather than shimmering; the glass is all reflection
// (Fresnel's, of the Sun and of what the environment map holds) over what shows through it.
function glass(shared, frames) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.08, metalness: 0, transparent: true, depthWrite: false });
  m.blending = THREE.CustomBlending;
  m.blendEquation = THREE.AddEquation;
  m.blendSrc = THREE.OneFactor;
  m.blendDst = THREE.OneMinusSrcAlphaFactor;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uFrame = shared.uFrame;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vRoof;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRoof = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec2 vRoof;
        uniform vec3 uFrame;
        // the share of a pixel a periodic bar of width w covers, the pixel fw wide
        float bars(float x, float w, float fw) {
          float a = x - 0.5 * fw, b = x + 0.5 * fw;
          float ia = floor(a) * w + min(fract(a), w), ib = floor(b) * w + min(fract(b), w);
          return clamp((ib - ia) / max(fw, 1e-5), 0.0, 1.0);
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 fw = fwidth(vRoof);
        float frameU = max(bars(vRoof.x + ${(frames.u / 2).toFixed(4)}, ${frames.u.toFixed(4)}, fw.x),
                           bars(vRoof.x / 4.0 + ${(frames.u / 2).toFixed(4)}, ${frames.u.toFixed(4)}, fw.x / 4.0));
        float frameV = bars(vRoof.y + ${(frames.v / 2).toFixed(4)}, ${frames.v.toFixed(4)}, fw.y);
        float frame = 1.0 - (1.0 - frameU) * (1.0 - frameV);
        diffuseColor.rgb = uFrame * frame;`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        roughnessFactor = mix(0.07, 0.55, frame);
        metalnessFactor = mix(0.0, 0.6, frame);`)
      .replace('#include <opaque_fragment>', `
        float glassF = 0.04 + 0.96 * pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 5.0);
        diffuseColor.a = mix(min(1.0, glassF + 0.05), 1.0, frame);
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'ring-glass';
  return m;
}

// ---- the Ring ------------------------------------------------------------------------------------

export class Ring {
  // quality: a tier's settings (quality.js); without one, the medium tier's ring.
  constructor(quality = null) {
    this.group = new THREE.Group();
    this.spin = new THREE.Group();   // everything that turns with the Ring; other parts of the page add to it
    this.group.add(this.spin);
    this.shared = {
      uSunAxial: { value: -0.4 }, uGlowGain: { value: 2.2 }, uGlowColour: { value: new THREE.Color(1.0, 0.74, 0.46) },
      uFrame: { value: new THREE.Color(0.32, 0.34, 0.37) }, uTime: { value: 0 }, uPixelRatio: { value: 1 }, uDaylight: { value: 1 },
    };
    this.envMap = null;
    this.sunLocal = new THREE.Vector3(0, -0.4, 0.9);
    this.setQuality(quality || DEFAULT);
  }

  // Builds (or rebuilds, for another tier) everything this module draws; what other parts of the page
  // have added to spin is left where it is.
  setQuality(quality) {
    this.dispose();
    const q = quality.ring || quality, aniso = quality.anisotropy || 4;
    this.quality = q;
    this.body = new THREE.Group();
    this.body.name = 'ring.body';
    this.spin.add(this.body);
    this.mast = new THREE.Group();
    this.mast.name = 'ring.mast';
    this.group.add(this.mast);
    const S = this.shared, T = q.texture, segs = q.around;
    const add = (g, m, parent = this.body) => { const mesh = new THREE.Mesh(g, m); parent.add(mesh); this.owned.push(mesh); return mesh; };

    const hull = textures(paintHull(T, 11), q, aniso, { normal: 2 });
    const wall = textures(paintWall(T, 12), q, aniso, { normal: 2.5 });
    const inner = textures(paintInner(T, 13), q, aniso, { normal: 2 });
    const hub = textures(paintHub(T, 14), q, aniso, { normal: 2 });
    const rad = textures(paintRadiator(T, 15), q, aniso, { normal: 3 });
    const cells = textures(paintArray(T, 16), q, aniso, { normal: 1 });
    const plan = town();
    const floorMaps = textures(paintFloor(T, plan, 17), q, aniso, { normal: 1.5, glowInAlpha: true });
    this.textures = [hull, wall, inner, hub, rad, cells, floorMaps].flatMap((t) => [t.map, t.normalMap, t.mask]).filter(Boolean);

    const hullM = surface({ maps: hull, shared: S });
    const wallM = surface({ maps: wall, shared: S });
    const innerM = surface({ maps: inner, shared: S });
    const hubM = surface({ maps: hub, shared: S });
    const floorM = surface({ maps: floorMaps, shared: S, floor: true, glowInAlpha: true, normalScale: 0.6 });
    const metal = new THREE.MeshStandardMaterial({ color: 0xc4c8ce, roughness: 0.5, metalness: 0.55, vertexColors: true });
    const plain = new THREE.MeshStandardMaterial({ color: 0xb4b8be, roughness: 0.45, metalness: 0.6 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x3a3f47, roughness: 0.6, metalness: 0.4 });
    const radM = surface({ maps: rad, shared: S });
    const cellM = surface({ maps: cells, shared: S });
    const glassM = glass(S, { u: 0.035, v: 0.025 });
    const lightM = lightsMaterial(S);
    this.materials = [hullM, wallM, innerM, hubM, floorM, metal, plain, dark, radM, cellM, glassM, lightM];

    // the band: hull, end walls inside and out, the rims' inner faces, the floor, the glazed roof
    add(cylinder({ r: RING.hull, y0: -HALF, y1: HALF, segs, uTiles: 120 }), hullM);
    for (const side of [-1, 1]) {
      add(annulus({ r0: RING.rim, r1: RING.hull, y: side * HALF, segs, facing: side, uTiles: 120 }), wallM);
      add(annulus({ r0: RING.rim, r1: RING.floor, y: side * INNER, segs, facing: -side, uTiles: 120 }), innerM);
      add(cylinder({ r: RING.rim, y0: side > 0 ? INNER : -HALF, y1: side > 0 ? HALF : -INNER, segs, inward: true, uTiles: 240, vTiles: 0.12 }), hullM);
    }
    // the floor, but for the deck's sector and its bulkheads; the roof, but for the deck
    const open = DECK_HALF + DECK_WALL;
    add(cylinder({ r: RING.floor, y0: -INNER, y1: INNER, segs, inward: true, uTiles: TILES, a0: DECK_A + open, a1: DECK_A - open + TAU }), floorM);
    const roof = add(cylinder({ r: RING.roof, y0: -INNER, y1: INNER, segs: segs * 2, inward: true, uTiles: Math.round((TAU * RING.roof) / 50), vTiles: (2 * INNER) / 94, a0: DECK_A + DECK_HALF, a1: DECK_A - DECK_HALF + TAU }), glassM);
    roof.renderOrder = 1;
    // the flight deck, open to space, and the bulkheads that seal the town from it
    const deck = textures(paintDeck(T, 19), q, aniso, { normal: 1.5 });
    const door = textures(paintBulkhead(T, 20), q, aniso, { normal: 2 });
    this.textures.push(...[deck, door].flatMap((t) => [t.map, t.normalMap, t.mask]).filter(Boolean));
    const deckM = surface({ maps: deck, shared: S, floor: true });
    const doorM = surface({ maps: door, shared: S });
    this.materials.push(deckM, doorM);
    add(cylinder({ r: RING.floor, y0: -INNER, y1: INNER, segs: segs * 4, inward: true, a0: DECK_A - open, a1: DECK_A + open, local: true }), deckM);
    for (const b of bulkheads()) {
      // the face toward the deck, with its door: a quad standing radially, across the band
      const f = b.face, n = [-b.side * Math.cos(f), 0, b.side * Math.sin(f)];
      const P = (radius, y) => [radius * Math.sin(f), y, radius * Math.cos(f)];
      const pos = [...P(b.r0, -INNER), ...P(b.r0, INNER), ...P(b.r1, INNER), ...P(b.r1, -INNER)];
      const g = build(pos, [...n, ...n, ...n, ...n], [0, 0, 1, 0, 1, 1, 0, 1], b.side > 0 ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]);
      add(g, doorM);
    }
    // the bulkheads' bodies, standing a few metres back from the door faces so the two do not fight
    const bodies = bulkheads().map((b) => {
      const a = b.face + b.side * (12 / RING.floor), rm = (b.r0 + b.r1) / 2;
      const radial = [Math.sin(a), 0, Math.cos(a)];
      return { a: [rm * radial[0], -b.y, rm * radial[2]], b: [rm * radial[0], b.y, rm * radial[2]], w: b.r1 - b.r0, t: DECK.bulkhead - 2, up: radial, shade: 0.8 };
    });
    add(membersGeometry(bodies, 0), plain);

    // the town's buildings, standing up toward the axis, where the tier builds them
    if (q.city >= 2) {
      const b = buildingsGeometry(standing(plan));
      const facade = textures(paintFacade(18), { normalMaps: false }, aniso, { glowInAlpha: true });
      this.textures.push(facade.map, facade.mask);
      const facadeM = surface({ maps: { map: facade.map }, shared: S, floor: true, glowInAlpha: true });
      const roofM = surface({ maps: {}, color: 0x6d6a66, roughness: 0.8, metalness: 0.1, shared: S, floor: true });
      this.materials.push(facadeM, roofM);
      add(b.walls, facadeM);
      add(b.roofs, roofM);
    }

    // trusses, ribs, yokes, the lift tubes and their towers
    const st = structure(q);
    const members = [...st.yokes, ...st.ribs, ...st.stringers, ...st.rims, ...st.hub, ...(q.struts ? st.spokes : [])];
    add(membersGeometry(members), metal);
    if (!q.struts) {   // the spokes as boxes with the truss painted on, its gaps cut out
      const lattice = paintLattice();
      const tex = dataTexture(lattice.bytes, lattice.w, lattice.h, { anisotropy: aniso });
      this.textures.push(tex);
      const latticeM = new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.5, metalness: 0.5, alphaMap: tex, alphaTest: 0.5, side: THREE.DoubleSide });
      this.materials.push(latticeM);
      add(membersGeometry(st.spokes), latticeM);
    }
    const tubes = [], towers = [];
    for (let k = 0; k < RING.spokes; k++) {
      const a = spokeAngle(k), len = RING.roof - COLLAR.r;
      const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
      const tube = new THREE.CylinderGeometry(9, 9, len, 16, 1, true).rotateX(Math.PI / 2).rotateY(a);
      tube.translate(...dir.clone().multiplyScalar(COLLAR.r + len / 2).toArray());
      tubes.push(tube);
      const tower = new THREE.CylinderGeometry(22, 16, RING.floor - RING.roof + 10, 16, 1, false).rotateX(Math.PI / 2).rotateY(a);
      tower.translate(...dir.clone().multiplyScalar((RING.floor + RING.roof) / 2).toArray());
      towers.push(tower);
    }
    add(mergeGeometries(tubes.map(strip)), dark);
    add(mergeGeometries(towers.map(strip)), plain);
    // the lift cars, two a spoke, one going each way
    this.cars = [];
    const carG = new THREE.BoxGeometry(14, 14, 22);
    const carM = new THREE.MeshStandardMaterial({ color: 0xd0d4da, roughness: 0.4, metalness: 0.3, emissive: 0xffd9a0, emissiveIntensity: 0.6 });
    this.materials.push(carM);
    for (let k = 0; k < RING.spokes; k++) for (const j of [0, 1]) {
      const car = add(carG, carM);
      car.rotation.y = spokeAngle(k);
      this.cars.push({ car, a: spokeAngle(k), phase: k * 0.37 + j * 0.5, dir: j ? 1 : -1 });
    }

    // the hub: barrel, collar, the two faces, hoops, the port as the sketch has always drawn it
    add(cylinder({ r: RING.hub, y0: -HUB_PORT_M, y1: HUB_PORT_M, segs: 96, uTiles: 8, vTiles: 4 }), hubM);
    add(cylinder({ r: COLLAR.r, y0: -COLLAR.half, y1: COLLAR.half, segs: 96, uTiles: 10, vTiles: 0.7 }), hubM);
    for (const s of [-1, 1]) add(annulus({ r0: RING.hub, r1: COLLAR.r, y: s * COLLAR.half, segs: 96, facing: s, uTiles: 10, vTiles: 0.25 }), hubM);
    add(annulus({ r0: PORT.torus + PORT.tube, r1: RING.hub, y: -HUB_PORT_M, segs: 96, facing: -1, uTiles: 8, vTiles: 0.7 }), hubM);
    add(annulus({ r0: MAST.r + 2, r1: RING.hub, y: HUB_PORT_M, segs: 96, facing: 1, uTiles: 8, vTiles: 0.8 }), hubM);
    for (const y of [-300, -200, -100, 100, 200, 300]) add(new THREE.TorusGeometry(RING.hub + 1.5, 2.5, 6, 96).rotateX(Math.PI / 2).translate(0, y, 0), plain);
    const portM = new THREE.MeshStandardMaterial({ color: 0x9fe8ff, roughness: 0.3, metalness: 0.2, emissive: 0x2a6f88, emissiveIntensity: 0.6 });
    const mouthM = new THREE.MeshBasicMaterial({ color: 0x050608 });
    this.materials.push(portM, mouthM);
    const port = add(new THREE.TorusGeometry(PORT.torus, PORT.tube, 12, 48), portM);
    port.rotation.x = Math.PI / 2;
    port.position.y = -HUB_PORT_M - 1;
    const mouth = add(new THREE.CircleGeometry(PORT.mouth, 32), mouthM);
    mouth.rotation.x = Math.PI / 2;
    mouth.position.y = -HUB_PORT_M - 0.5;
    // radiators between the spokes, beyond the collar
    for (const r of planRadiators()) {
      const panel = new THREE.BoxGeometry(r.r1 - r.r0, r.y1 - r.y0, 2);
      // the box's x is out along the panel, y along the axis, z its thickness: turn x to the angle
      panel.translate((r.r0 + r.r1) / 2, (r.y0 + r.y1) / 2, 0).rotateY(r.a - Math.PI / 2);
      const uv = panel.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * 1);
      add(panel, radM);
    }

    // the mast and its arrays, held still and turned to the Sun (update)
    add(new THREE.CylinderGeometry(MAST.r, MAST.r, MAST.y1 - MAST.y0, 16).translate(0, (MAST.y0 + MAST.y1) / 2, 0), plain, this.mast);
    add(new THREE.CylinderGeometry(MAST.r * 3, MAST.r * 3, 30, 24).translate(0, MAST.y0 + 15, 0), dark, this.mast);
    this.wings = [];
    for (const y of ARRAYS.at) {
      const pair = new THREE.Group();
      pair.position.y = y;
      this.mast.add(pair);
      for (const s of [-1, 1]) {
        const g = new THREE.BoxGeometry(ARRAYS.span, ARRAYS.chord, 1.2).translate(s * (ARRAYS.root + ARRAYS.span / 2), 0, 0);
        const uv = g.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (ARRAYS.span / 40), uv.getY(i) * (ARRAYS.chord / 40));
        add(g, cellM, pair);
        add(new THREE.BoxGeometry(ARRAYS.span + ARRAYS.root, 3, 3).translate(s * (ARRAYS.span + ARRAYS.root) / 2, 0, 0), dark, pair);
      }
      this.wings.push(pair);
    }

    // the lights
    const L = planLights(q);
    this.lightPoints = lightPoints(L.spin, lightM);
    this.body.add(this.lightPoints);
    this.owned.push(this.lightPoints);
    const mastPoints = lightPoints(L.still, lightM);
    this.mast.add(mastPoints);
    this.owned.push(mastPoints);
    this.lights = this.lightPoints;   // the name the sketch has always had

    // the hub, its port and its collar take the craft's shadow, where the tier casts one (docked there)
    for (const m of this.owned) if (m.material === hubM || m.material === portM || m.material === mouthM) m.receiveShadow = true;

    if (this.envMap) this.setEnvMap(this.envMap);
  }

  // The reflected sky, for the metal and the glass: a cube texture (main.js renders it), or null.
  setEnvMap(texture, intensity = 1) {
    this.envMap = texture;
    for (const m of this.materials || []) {
      if (!m.isMeshStandardMaterial) continue;
      m.envMap = texture;
      m.envMapIntensity = intensity;
      m.needsUpdate = true;
    }
  }

  // rel: the Ring's centre from the eye, three.js axes; axis and ref: unit, three.js axes, ref turning
  // with the Ring; t: seconds, for the lights; sun: unit, three.js axes (optional); daylight: 1 in the
  // Sun, 0 in the Earth's shadow; pixelRatio: the drawing buffer's.
  update(rel, axis, ref, t, sun = null, daylight = 1, pixelRatio = null) {
    const y = new THREE.Vector3(axis[0], axis[1], axis[2]);
    const x = new THREE.Vector3(ref[0], ref[1], ref[2]);
    const z = new THREE.Vector3().crossVectors(x, y);
    this.group.position.set(rel[0], rel[1], rel[2]);
    this.group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    const S = this.shared;
    S.uTime.value = t;
    S.uDaylight.value = daylight;
    if (pixelRatio) S.uPixelRatio.value = pixelRatio;
    if (sun) {
      const s = new THREE.Vector3(sun[0], sun[1], sun[2]);
      S.uSunAxial.value = s.dot(y);
      this.sunLocal.set(s.dot(x), s.dot(y), s.dot(z));
    }
    // the mast turns against the spin to keep its arrays square to the Sun
    const sl = this.sunLocal;
    this.mast.rotation.set(0, Math.atan2(sl.x, sl.z), 0);
    const el = Math.atan2(sl.y, Math.hypot(sl.x, sl.z));
    for (const w of this.wings) w.rotation.x = -el;
    // the lift cars, up and down their tubes, a few minutes a trip
    for (const c of this.cars) {
      const f = 0.5 + 0.5 * Math.sin(t * 0.012 * c.dir + c.phase * TAU);
      const r = COLLAR.r + 40 + f * (RING.roof - COLLAR.r - 80);
      c.car.position.set(Math.sin(c.a) * r, 0, Math.cos(c.a) * r);
    }
  }

  dispose() {
    for (const o of this.owned || []) { o.parent?.remove(o); o.geometry?.dispose(); }
    for (const m of this.materials || []) m.dispose();
    for (const t of this.textures || []) t.dispose();
    if (this.body) this.spin.remove(this.body);
    if (this.mast) this.group.remove(this.mast);
    this.owned = [];
    this.materials = [];
    this.textures = [];
  }
}

function strip(g) {
  const n = g.index ? g.toNonIndexed() : g;
  for (const name of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(name)) n.deleteAttribute(name);
  return n;
}

const DEFAULT = { ring: { around: 384, texture: 1024, normalMaps: true, struts: true, bay: 140, rimBay: 120, ribs: 240, lights: 360, lightRings: 4, city: 2 }, anisotropy: 8 };
