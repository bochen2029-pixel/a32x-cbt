// map.js — a map to fly by: the orbit seen from above the Ring's plane, the rendezvous seen from the Ring in
// the frame that turns with its orbit, and the ground track. A 2D canvas over the view, drawn ten times a
// second and only while shown; N or MAP shows and hides it, shift-N or its tabs change what it shows. The
// arithmetic is map-math.js's. It reads the core and writes nothing to it. GPLv3.

import { LAKES, LAND, SCALE } from '../data/land.js';
import { HUB_PORT_M, RING, START, STANDOFF_M } from './core.js';
import { RE, WE, add, cross, dot, length, scale, sub, unit } from './frames.js';
import { fmtClock, fmtDistance } from './hud.js';
import { decodePoints, ringsOf } from './land.js';
import { closest, conicPoint, ecefToEci, elements, groundTrack, hillAxes, phaseAhead, relativePath, ringState, siteFrame, splitTrack, subPoint, toHill } from './map-math.js';

const VIEWS = ['orbit', 'ring', 'ground'];
const TITLES = { orbit: 'ORBIT', ring: 'RING', ground: 'GROUND' };
const SPANS_KM = [0.5, 1, 2, 3, 5, 7.5, 10, 15, 20, 30, 40, 50, 75, 100, 150, 250, 500, 1000, 2500];   // the close view's half-widths
const EVERY_MS = 100;            // ten drawings a second
const PAST_EVERY_S = 5;          // the track flown, a point every 5 s of flight
const PAST_MAX = 3000;
const HUD_PARTS = ['top', 'readouts', 'buttons', 'stick', 'throttle', 'help', 'status'];
const ESSENTIAL = ['top', 'stick', 'throttle', 'status'];   // what the map never covers: on a small touch screen it may cover the rest
const D2R = Math.PI / 180;

const st = {
  ctx: null, canvas: null, g: null, button: null, shown: false, view: 'orbit', chosen: false,
  drawnAt: -1e9, laidAt: -1e9, dpr: 1, cssW: 0, cssH: 0, laidFor: '', box: null, tabs: [], close: null, small: false, touch: false,
  ptr: 0, frame: null, failed: '', colours: null, land: null, landKey: '', coast: null,
  past: { lat: [], lon: [], t: -1 },
};

// ---- where the panel goes: the largest free space between the page's other parts ------------------------
// The rectangles the HUD's parts take, then the largest rectangle (for the aspect wanted) clear of them all,
// its sides taken from their edges and the screen's. A few parts, so the search is small.
export function freeBox(W, H, obstacles, aspect, pad = 8) {
  const xs = [0, W], ys = [0, H];
  for (const o of obstacles) { xs.push(o.left - pad, o.right + pad); ys.push(o.top - pad, o.bottom + pad); }
  const X = xs.filter((x) => x >= 0 && x <= W).sort((a, b) => a - b), Y = ys.filter((y) => y >= 0 && y <= H).sort((a, b) => a - b);
  let best = null, score = -1;
  for (let i = 0; i < X.length; i++) for (let j = i + 1; j < X.length; j++) {
    for (let k = 0; k < Y.length; k++) for (let l = k + 1; l < Y.length; l++) {
      const x0 = X[i], x1 = X[j], y0 = Y[k], y1 = Y[l], w = x1 - x0, h = y1 - y0;
      if (w < 60 || h < 60) continue;
      if (obstacles.some((o) => o.left - pad < x1 && o.right + pad > x0 && o.top - pad < y1 && o.bottom + pad > y0)) continue;
      const fit = Math.min(w, h * aspect), sc = fit * (fit / aspect) + 1e-3 * w * h;   // the aspect's area, then the whole
      if (sc > score) { score = sc; best = { x: x0, y: y0, w, h }; }
    }
  }
  return best || { x: 0, y: 0, w: W, h: H };
}

function obstacles(ids) {
  const out = [];
  for (const id of ids) {
    const el = document.getElementById(id);
    if (!el || (id === 'status' && !el.textContent)) continue;   // the status line is there only while it says something
    const r = el.getBoundingClientRect();
    if (r.width > 1 && r.height > 1 && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden') out.push(r);
  }
  return out;
}

// ---- the land, painted once for a size ----------------------------------------------------------------
function paintLand(w, h, c) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d');
  g.fillStyle = c.sea;
  g.fillRect(0, 0, w, h);
  const fill = (set, colour) => {
    const pts = decodePoints(set.points);
    g.fillStyle = colour;
    g.beginPath();
    let k = 0;
    for (const n of set.rings) {
      for (let i = 0; i < n; i++, k++) {
        const x = ((pts[2 * k] / SCALE + 180) / 360) * w, y = ((90 - pts[2 * k + 1] / SCALE) / 180) * h;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.closePath();
    }
    g.fill('evenodd');
  };
  fill(LAND, c.land);
  fill(LAKES, c.sea);
  return cv;
}

// The coastlines as unit vectors, Earth-fixed, for drawing the globe from any side.
function coastlines() {
  if (st.coast) return st.coast;
  st.coast = [];
  for (const ring of ringsOf(LAND)) {
    if (ring.length < 8) continue;
    const a = new Float64Array(ring.length * 3);
    ring.forEach(([lon, lat], i) => {
      const la = lat * D2R, lo = lon * D2R;
      a[3 * i] = Math.cos(la) * Math.cos(lo); a[3 * i + 1] = Math.cos(la) * Math.sin(lo); a[3 * i + 2] = Math.sin(la);
    });
    st.coast.push(a);
  }
  return st.coast;
}

// ---- what the map shows, from the core -------------------------------------------------------------------
function readState(ctx) {
  const m = ctx.core.m, s = ctx.s;
  if (!st.ptr) return null;
  m._oc_eci(st.ptr, st.ptr + 24);
  const h = m.HEAPF64, p = st.ptr / 8;
  const r = [h[p], h[p + 1], h[p + 2]], v = [h[p + 3], h[p + 4], h[p + 5]];
  if (!r.every(Number.isFinite) || !v.every(Number.isFinite) || length(r) < 1) return null;
  const el = elements(r, v), ring = ringState(s, s.t, r, v, st.frame);
  return { s, t: s.t, r, v, el, ring };
}

function remember(s) {
  const p = st.past;
  if (s.t < p.t - 1) { p.lat.length = 0; p.lon.length = 0; p.t = -1; }   // started again
  if (p.t >= 0 && s.t - p.t < PAST_EVERY_S) return;
  p.lat.push(s.lat);
  p.lon.push(s.lon);
  p.t = s.t;
  if (p.lat.length > PAST_MAX) { p.lat.splice(0, 500); p.lon.splice(0, 500); }
}

// ---- drawing helpers -----------------------------------------------------------------------------------
function text(g, str, x, y, colour, align = 'left', size = 11.5, weight = 500) {
  g.font = `${weight} ${size}px ${st.colours.mono}`;
  g.textAlign = align;
  g.fillStyle = 'rgba(0,0,0,0.75)';
  g.fillText(str, x + 1, y + 1);
  g.fillStyle = colour;
  g.fillText(str, x, y);
}

function marker(g, x, y, kind, colour, size = 6, angle = 0) {
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  g.beginPath();
  if (kind === 'craft') { g.moveTo(size * 1.5, 0); g.lineTo(-size, size); g.lineTo(-size * 0.5, 0); g.lineTo(-size, -size); g.closePath(); }
  else if (kind === 'ring') { g.moveTo(0, -size); g.lineTo(size, 0); g.lineTo(0, size); g.lineTo(-size, 0); g.closePath(); }
  else if (kind === 'site') g.rect(-size * 0.6, -size * 0.6, size * 1.2, size * 1.2);
  else g.arc(0, 0, size * 0.6, 0, 2 * Math.PI);
  g.fillStyle = colour;
  g.strokeStyle = 'rgba(0,0,0,0.8)';
  g.lineWidth = 1.5;
  g.fill();
  g.stroke();
  g.restore();
}

function polyline(g, pts, colour, width = 1.6, dash = null, alpha = 1) {
  if (pts.length < 2) return;
  g.save();
  g.globalAlpha = alpha;
  g.strokeStyle = colour;
  g.lineWidth = width;
  g.lineJoin = 'round';
  if (dash) g.setLineDash(dash);
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.stroke();
  g.restore();
}

const signed = (v, digits = 1) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(digits)}`;
const height = (rad) => (rad === Infinity ? 'escape' : fmtDistance(rad - RE));

// ---- the three views -------------------------------------------------------------------------------------
// Each draws into the area a = { x, y, w, h } and returns the numbers to print beside it.

// The orbit, seen from above the Ring's plane (fixed among the stars), north up: the Earth, the Ring's round
// orbit, the craft's conic with its highest and lowest points, KDFW where the Earth has carried it.
function drawOrbit(g, a, d, c) {
  const { el, ring, r, v, t, s } = d;
  const n = ring.nHat, northUp = sub([0, 0, 1], scale(n, n[2]));
  const ey = length(northUp) > 0.1 ? unit(northUp) : unit(sub([1, 0, 0], scale(n, n[0]))), ex = cross(ey, n);
  const fitR = Math.max(RE + 450000, ring.R, el.ra < 6 * RE ? el.ra : el.e < 1 ? 6 * RE : RE + 450000) * 1.1;
  const k = Math.min(a.w, a.h) / 2 / fitR, cx = a.x + a.w / 2, cy = a.y + a.h / 2;
  const at = (p) => [cx + dot(p, ex) * k, cy - dot(p, ey) * k];
  // labels away from the Earth's centre, each pushed further out until it clears those already placed
  const placed = [];
  const label = (x, y, str, colour, inward = false) => {
    const dx = x - cx, dy = y - cy, l = Math.hypot(dx, dy) || 1, ux = (inward ? -dx : dx) / l, uy = (inward ? -dy : dy) / l, w = str.length * 6.6;
    for (let off = 12; off < 80; off += 13) {
      const lx = x + ux * off, ly = y + uy * off, left = ux >= 0 ? lx : lx - w, box = [left, ly - 9, left + w, ly + 4];
      if (off + 13 < 80 && placed.some((q) => q[0] < box[2] && q[2] > box[0] && q[1] < box[3] && q[3] > box[1])) continue;
      placed.push(box);
      text(g, str, lx, ly + 3, colour, ux >= 0 ? 'left' : 'right', 10.5);
      return;
    }
  };
  // the Earth and the top of its air
  const grad = g.createRadialGradient(cx - RE * k * 0.3, cy - RE * k * 0.3, RE * k * 0.1, cx, cy, RE * k);
  grad.addColorStop(0, c.earthLit);
  grad.addColorStop(1, c.earth);
  g.fillStyle = grad;
  g.beginPath(); g.arc(cx, cy, RE * k, 0, 2 * Math.PI); g.fill();
  // the coastlines on the side of the Earth that faces this view, turned as the Earth has turned
  const cw = Math.cos(WE * t), sw = Math.sin(WE * t);
  g.strokeStyle = c.coast; g.lineWidth = 0.8;
  g.beginPath();
  for (const ring of coastlines()) {
    let pen = false;
    for (let i = 0; i < ring.length; i += 3) {
      const x = cw * ring[i] - sw * ring[i + 1], y = sw * ring[i] + cw * ring[i + 1], z = ring[i + 2];
      if (x * n[0] + y * n[1] + z * n[2] < 0) { pen = false; continue; }
      const X = cx + (x * ex[0] + y * ex[1] + z * ex[2]) * RE * k, Y = cy - (x * ey[0] + y * ey[1] + z * ey[2]) * RE * k;
      if (pen) g.lineTo(X, Y); else g.moveTo(X, Y);
      pen = true;
    }
  }
  g.stroke();
  g.strokeStyle = c.air; g.lineWidth = 1;
  g.beginPath(); g.arc(cx, cy, (RE + 100000) * k, 0, 2 * Math.PI); g.stroke();
  // the Ring's orbit, a circle in this view
  g.save(); g.setLineDash([5, 5]); g.strokeStyle = c.target; g.globalAlpha = 0.55; g.lineWidth = 1.3;
  g.beginPath(); g.arc(cx, cy, ring.R * k, 0, 2 * Math.PI); g.stroke(); g.restore();
  // the craft's conic, dim where it runs under the ground (parked, it all does: none)
  const lim = s.onGround > 0.5 ? 0 : el.e < 1 ? Math.PI : Math.acos(-1 / el.e) - 1e-3;
  let run = [], under = null;
  const flush = () => { if (run.length > 1) polyline(g, run, c.vector, under ? 1.2 : 2, under ? [3, 4] : null, under ? 0.45 : 1); run = []; };
  for (let i = 0; lim > 0 && i <= 360; i++) {
    const nu = -lim + (2 * lim * i) / 360, p = conicPoint(el, nu);
    if (!p || length(p) > 7 * RE) { flush(); continue; }
    const u = length(p) < RE;
    if (under !== null && u !== under) { const last = run[run.length - 1]; flush(); if (last) run.push(last); }
    under = u;
    run.push(at(p));
  }
  flush();
  // the highest and lowest points
  if (el.e > 2e-4 && s.onGround < 0.5) {
    const ap = el.e < 1 ? conicPoint(el, Math.PI) : null, pe = conicPoint(el, 0);
    if (ap && length(ap) < 7 * RE) { const [x, y] = at(ap); marker(g, x, y, 'dot', c.vector, 6); placed.push([x - 6, y - 6, x + 6, y + 6]); label(x, y, `Ap ${height(el.ra)}`, c.ink); }
    if (pe && length(pe) >= RE) { const [x, y] = at(pe); marker(g, x, y, 'dot', c.vector, 6); placed.push([x - 6, y - 6, x + 6, y + 6]); label(x, y, `Pe ${height(el.rp)}`, c.ink); }
  }
  // KDFW, where the Earth has turned it to
  const site = ecefToEci(st.frame.point([0, 0, 0]), t), [sx, sy] = at(site), seen = dot(site, n) >= -0.2 * RE;
  g.globalAlpha = seen ? 0.9 : 0.4; marker(g, sx, sy, 'site', c.ink, 4); label(sx, sy, 'KDFW', c.dim, true); g.globalAlpha = 1;
  // the Ring and the craft
  const [rx, ry] = at(ring.r);
  marker(g, rx, ry, 'ring', c.target, 6);
  const [x, y] = at(r), [vx, vy] = at(add(r, scale(v, 1000)));
  marker(g, x, y, 'craft', c.vector, 6, Math.atan2(vy - y, vx - x));
  label(rx, ry, 'Ring', c.target);
  const ahead = phaseAhead(r, ring);
  return [
    ['Ap', `${height(el.ra)}${Number.isFinite(s.tApo) && el.e < 1 ? `   in ${fmtClock(s.tApo)}` : ''}`],
    ['Pe', s.peri < -1e5 ? 'below ground' : height(el.rp)],
    ['inc', `${el.inc.toFixed(2)}°${el.e < 1 && el.rp > RE ? `   period ${fmtClock(el.period)}` : ''}`],
    ['Ring', `${fmtDistance(s.ringRange)}   ${s.ringRate <= 0 ? 'closing' : 'opening'} ${Math.abs(s.ringRate).toFixed(1)} m/s`],
    ['phase', `the Ring ${Math.abs(ahead).toFixed(2)}° ${ahead >= 0 ? 'ahead' : 'behind'}`],
  ];
}

// The rendezvous, seen from the Ring in the frame that turns with its orbit: ahead to the right, up to the
// top; the Ring's band as it stands to that frame, the hold point off its hub, the craft and where its path
// will carry it over the next revolution, with the nearest it comes.
function drawRing(g, a, d, c) {
  const { el, ring, r, v, s } = d;
  const ax = hillAxes(ring.r, ring.nHat), me = toHill(sub(r, ring.r), ax);
  const period = Math.min(7200, Math.max(el.e < 1 ? el.period : 0, (2 * Math.PI) / ring.n) * 1.05);
  const path = relativePath(r, v, ring, period, period / 240);
  const near = closest(path), ends = path.length ? path[path.length - 1][3] : 0, falls = ends < period * (1 - 1.5 / 240);
  const reach = Math.max(Math.abs(me[0]), (Math.abs(me[1]) * a.w) / a.h) / 0.8 / 1000;
  const half = (SPANS_KM.find((km) => km >= reach) || SPANS_KM[SPANS_KM.length - 1]) * 1000;
  const k = a.w / 2 / half, cx = a.x + a.w / 2, cy = a.y + a.h / 2;
  const at = (q) => [cx + q[0] * k, cy - q[1] * k];
  g.save();
  g.beginPath(); g.rect(a.x, a.y, a.w, a.h); g.clip();
  // the frame's axes
  g.strokeStyle = c.grid; g.lineWidth = 1;
  g.beginPath(); g.moveTo(a.x, cy); g.lineTo(a.x + a.w, cy); g.moveTo(cx, a.y); g.lineTo(cx, a.y + a.h); g.stroke();
  text(g, 'ahead →', a.x + a.w - 6, cy - 6, c.dim, 'right', 10.5);
  text(g, '↑ up', cx + 6, a.y + 14, c.dim, 'left', 10.5);
  // the Ring: its floor's circle, square to its axis, as it stands to this frame
  const u1 = unit(cross(ring.axis, Math.abs(ring.axis[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0])), u2 = cross(ring.axis, u1);
  const band = [];
  for (let i = 0; i <= 64; i++) {
    const th = (2 * Math.PI * i) / 64;
    band.push(at(toHill(add(scale(u1, RING.floor * Math.cos(th)), scale(u2, RING.floor * Math.sin(th))), ax)));
  }
  polyline(g, band, c.target, Math.max(1.5, Math.min(4, (RING.width * k) / 2)), null, 0.85);
  marker(g, cx, cy, 'ring', c.target, 5);
  // the hold point, OC_STANDOFF_M off the hub's port
  const hold = toHill(scale(ring.axis, -(HUB_PORT_M + STANDOFF_M)), ax), [hx, hy] = at(hold);
  if (half <= 25000) { marker(g, hx, hy, 'dot', c.ink, 5); text(g, 'hold', hx + 7, hy - 5, c.dim, 'left', 10.5); }
  // the path ahead, and the nearest it comes
  polyline(g, path.map(at), c.vector, 1.6, [4, 4], 0.85);
  if (near.dt > 0 && Number.isFinite(near.range)) {
    let j = path.findIndex((p) => p[3] >= near.dt);
    if (j < 0) j = path.length - 1;
    const [nx, ny] = at(path[j]);
    g.strokeStyle = c.vector; g.lineWidth = 1.2; g.beginPath(); g.arc(nx, ny, 5, 0, 2 * Math.PI); g.stroke();
  }
  // the craft, pointing where it moves in this frame
  const vrel = ecefToEci(st.frame.dir([s.vrelE, s.vrelN, s.vrelU]), s.t), dv = toHill(vrel, ax);
  const [x, y] = at(me);
  const inside = x > a.x + 6 && x < a.x + a.w - 6 && y > a.y + 6 && y < a.y + a.h - 6;
  if (inside) marker(g, x, y, 'craft', c.vector, 6, Math.hypot(dv[0], dv[1]) > 0.05 ? Math.atan2(-dv[1], dv[0]) : 0);
  else {                                                    // off the view: an arrow at its edge, toward the craft
    const ang = Math.atan2(y - cy, x - cx), ex = cx + Math.cos(ang) * (a.w / 2 - 14), ey = cy + Math.sin(ang) * (a.h / 2 - 14);
    marker(g, ex, ey, 'craft', c.vector, 6, ang);
  }
  // the scale
  const bar = (half / 2) * k, bx = a.x + a.w - bar - 12, by = a.y + a.h - 12;
  g.strokeStyle = c.ink; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(bx, by - 4); g.lineTo(bx, by); g.lineTo(bx + bar, by); g.lineTo(bx + bar, by - 4); g.stroke();
  text(g, fmtDistance(half / 2), bx + bar / 2, by - 6, c.ink, 'center', 10.5);
  g.restore();
  const where = (v0, pos, neg) => `${fmtDistance(Math.abs(v0))} ${v0 >= 0 ? pos : neg}`;
  return [
    ['Ring', `${fmtDistance(s.ringRange)}   ${s.ringRate <= 0 ? 'closing' : 'opening'} ${Math.abs(s.ringRate).toFixed(1)} m/s`],
    ['you', `${where(me[0], 'ahead', 'behind')}  ${where(me[1], 'up', 'down')}  ${fmtDistance(Math.abs(me[2]))} aside`],
    ['rel', `${Math.hypot(...dv).toFixed(1)} m/s  ahead ${signed(dv[0])}  up ${signed(dv[1])}  aside ${signed(dv[2])}`],
    ['closest', s.onGround > 0.5 || !Number.isFinite(near.range) ? '—'
      : `${fmtDistance(near.range)} in ${fmtClock(near.dt)}${falls ? `; the path meets the ground in ${fmtClock(ends)}` : ''}`],
    ['hold', `${fmtDistance(s.portRange)} to the hold point`],
  ];
}

// The ground, equirectangular: the coastlines, KDFW, the track flown and the track to come with the Earth
// turning under it, and the Ring's.
function drawGround(g, a, d, c) {
  const { el, ring, r, v, t, s } = d;
  const w = Math.min(a.w, a.h * 2), h = w / 2, x0 = a.x + (a.w - w) / 2, y0 = a.y + (a.h - h) / 2;
  const key = `${Math.round(w * st.dpr)}x${Math.round(h * st.dpr)}`;
  if (st.landKey !== key) { st.land = paintLand(Math.round(w * st.dpr), Math.round(h * st.dpr), c); st.landKey = key; }
  g.drawImage(st.land, x0, y0, w, h);
  const at = (lat, lon) => [x0 + ((lon + 180) / 360) * w, y0 + ((90 - lat) / 180) * h];
  g.strokeStyle = c.grid; g.lineWidth = 1;
  g.beginPath();
  for (let lon = -150; lon <= 150; lon += 30) { const [x] = at(0, lon); g.moveTo(x, y0); g.lineTo(x, y0 + h); }
  for (let lat = -60; lat <= 60; lat += 30) { const [, y] = at(lat, 0); g.moveTo(x0, y); g.lineTo(x0 + w, y); }
  g.stroke();
  g.strokeStyle = c.line; g.strokeRect(x0, y0, w, h);
  g.save(); g.beginPath(); g.rect(x0, y0, w, h); g.clip();
  // the Ring's track for a revolution, then the craft's: flown, and to come
  const ringTrack = groundTrack(ring.r, ring.v, t, (2 * Math.PI) / ring.n, 60);
  for (const run of splitTrack(ringTrack)) polyline(g, run.map(([la, lo]) => at(la, lo)), c.target, 1.2, [3, 5], 0.6);
  const past = [];
  for (let i = 0; i < st.past.lat.length; i++) past.push([st.past.lat[i], st.past.lon[i]]);
  past.push([s.lat, s.lon]);
  for (const run of splitTrack(past)) polyline(g, run.map(([la, lo]) => at(la, lo)), c.vector, 2, null, 0.9);
  if (s.onGround < 0.5) {
    const span = Math.min(3 * 3600, el.e < 1 ? 1.5 * el.period : 3600);
    for (const run of splitTrack(groundTrack(r, v, t, span, 30))) polyline(g, run.map(([la, lo]) => at(la, lo)), c.vector, 1.4, [5, 4], 0.75);
  }
  const [kx, ky] = at(START.lat, START.lon);
  marker(g, kx, ky, 'site', c.ink, 4);
  text(g, 'KDFW', kx - 6, ky + 15, c.dim, 'right', 10.5);
  const [rl, ro] = subPoint(ring.r, t), [rx, ry] = at(rl, ro);
  marker(g, rx, ry, 'ring', c.target, 6);
  const [x, y] = at(s.lat, s.lon);
  const [la2, lo2] = subPoint(add(r, scale(v, 30)), t + 30), [x2, y2] = at(la2, lo2);
  marker(g, x, y, 'craft', c.vector, 6, Math.abs(x2 - x) < w / 2 ? Math.atan2(y2 - y, x2 - x) : 0);
  g.restore();
  const ns = s.lat >= 0 ? 'N' : 'S', ew = s.lon >= 0 ? 'E' : 'W';
  return [
    ['at', `${Math.abs(s.lat).toFixed(2)}°${ns}  ${Math.abs(s.lon).toFixed(2)}°${ew}   ${fmtDistance(s.alt)} up`],
    ['Ap Pe', `${height(el.ra)}  ×  ${s.peri < -1e5 ? 'below ground' : height(el.rp)}`],
    ['inc', `${el.inc.toFixed(2)}°${el.e < 1 && el.rp > RE ? `   period ${fmtClock(el.period)}` : ''}`],
    ['Ring', `${fmtDistance(s.ringRange)}   ${s.ringRate <= 0 ? 'closing' : 'opening'} ${Math.abs(s.ringRate).toFixed(1)} m/s`],
  ];
}

// ---- the panel ---------------------------------------------------------------------------------------
// The panel's place: the largest space the page's other parts leave free; on a touch screen where that is too
// small for a map, the largest that leaves the status line, the stick and the throttle free, covering the
// readouts and the buttons (the panel prints its own numbers and has its own close button).
function layout() {
  const W = window.innerWidth, H = window.innerHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
  const aspect = st.view === 'ground' ? 1.7 : 1.1;
  let b = freeBox(W, H, obstacles(HUD_PARTS), aspect);
  if (st.touch && Math.min(b.w, b.h) < 330) b = freeBox(W, H, obstacles(ESSENTIAL), aspect);
  const m = 6, x = Math.round(b.x + m), y = Math.round(b.y + m), w = Math.round(Math.max(120, b.w - 2 * m)), h = Math.round(Math.max(120, b.h - 2 * m));
  Object.assign(st.canvas.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
  if (st.canvas.width !== Math.round(w * dpr) || st.canvas.height !== Math.round(h * dpr)) {
    st.canvas.width = Math.round(w * dpr);
    st.canvas.height = Math.round(h * dpr);
  }
  st.dpr = dpr; st.cssW = w; st.cssH = h;
  st.box = { x: 0, y: 0, w, h };
  st.laidFor = `${W}x${H}:${st.view}`;
  st.laidAt = performance.now();
  st.small = w < 430;
}

function draw(ctx) {
  const g = st.g, c = st.colours;
  // laid out again on a new size or view, and every second besides: the help, a message, may have moved
  if (st.laidFor !== `${window.innerWidth}x${window.innerHeight}:${st.view}` || performance.now() - st.laidAt > 1000) layout();
  g.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
  g.clearRect(0, 0, st.cssW, st.cssH);
  const b = st.box;
  g.fillStyle = c.panel;
  g.strokeStyle = c.line;
  g.lineWidth = 1;
  g.beginPath(); g.roundRect ? g.roundRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1, 8) : g.rect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1); g.fill(); g.stroke();
  g.save();
  g.beginPath(); g.rect(b.x, b.y, b.w, b.h); g.clip();
  // the tabs
  st.tabs = [];
  let tx = b.x + 8;
  for (const v of VIEWS) {
    g.font = `600 11px ${c.sans}`;
    const tw = g.measureText(TITLES[v]).width + 18;
    const on = v === st.view;
    g.fillStyle = on ? 'rgba(124,199,255,0.18)' : 'rgba(255,255,255,0.04)';
    g.strokeStyle = on ? c.vector : c.line;
    g.beginPath(); g.roundRect ? g.roundRect(tx, b.y + 7, tw, 22, 4) : g.rect(tx, b.y + 7, tw, 22); g.fill(); g.stroke();
    g.fillStyle = on ? c.ink : c.dim;
    g.textAlign = 'center';
    g.fillText(TITLES[v], tx + tw / 2, b.y + 22);
    st.tabs.push({ v, x: tx, y: b.y + 7, w: tw, h: 22 });
    tx += tw + 6;
  }
  // the close button, and on a keyboard the key
  const xb = { x: b.x + b.w - 30, y: b.y + 7, w: 22, h: 22 };
  g.strokeStyle = c.line; g.lineWidth = 1;
  g.beginPath(); g.roundRect ? g.roundRect(xb.x, xb.y, xb.w, xb.h, 4) : g.rect(xb.x, xb.y, xb.w, xb.h); g.stroke();
  g.strokeStyle = c.ink; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(xb.x + 7, xb.y + 7); g.lineTo(xb.x + 15, xb.y + 15); g.moveTo(xb.x + 15, xb.y + 7); g.lineTo(xb.x + 7, xb.y + 15); g.stroke();
  st.close = xb;
  if (!st.touch && xb.x - tx > 90) text(g, 'N closes', xb.x - 8, b.y + 22, c.dim, 'right', 10.5, 400);
  const d = st.failed ? null : readState(ctx);
  if (!d) {
    text(g, st.failed || 'The map has no state from the flight core yet', b.x + 12, b.y + 52, c.alarm, 'left', 12, 600);
    g.restore();
    return;
  }
  // the diagram and its numbers: beside it on a wide panel, under it on a tall one
  const inner = { x: b.x + 8, y: b.y + 36, w: b.w - 16, h: b.h - 44 };
  const lines = 5, lh = 16, side = inner.w > 520 && inner.w >= inner.h * (st.view === 'ground' ? 2.6 : 1.45);
  const numW = side ? Math.min(330, inner.w * 0.34) : inner.w, numH = side ? inner.h : lines * lh + 10;
  const area = side ? { x: inner.x + numW + 8, y: inner.y, w: inner.w - numW - 8, h: inner.h } : { x: inner.x, y: inner.y, w: inner.w, h: inner.h - numH - 4 };
  const nums = { x: inner.x, y: side ? inner.y : area.y + area.h + 4, w: numW, h: numH };
  const rows = st.view === 'ring' ? drawRing(g, area, d, c) : st.view === 'ground' ? drawGround(g, area, d, c) : drawOrbit(g, area, d, c);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(nums.x, nums.y, nums.w, Math.min(nums.h, rows.length * lh + 10));
  rows.forEach(([label, value], i) => {
    const y = nums.y + 16 + i * lh;
    text(g, label, nums.x + 8, y, c.dim, 'left', st.small ? 10 : 11, 600);
    text(g, value, nums.x + (st.small ? 66 : 84), y, c.ink, 'left', st.small ? 10.5 : 11.5, 500);
  });
  g.restore();
}

function show(on) {
  st.shown = on;
  st.canvas.style.display = on ? 'block' : 'none';
  if (st.button) st.button.setAttribute('aria-pressed', on ? 'true' : 'false');
  if (on) {
    if (!st.chosen) { const s = st.ctx.s; st.view = s.ringRange < 60000 ? 'ring' : 'orbit'; }
    st.laidFor = '';
    st.drawnAt = -1e9;
  }
}

function next() {
  st.view = VIEWS[(VIEWS.indexOf(st.view) + 1) % VIEWS.length];
  st.chosen = true;
  st.laidFor = '';
  st.drawnAt = -1e9;
  if (!st.shown) show(true);
}

export const map = {
  name: 'map',

  init(ctx) {
    st.ctx = ctx;
    st.frame = siteFrame(START.lat, START.lon);
    const css = getComputedStyle(document.documentElement), v = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
    st.colours = {
      vector: v('--vector', '#7cc7ff'), target: v('--target', '#ffb35c'), ink: v('--ink', '#e8eef4'), dim: v('--dim', '#94a3b3'),
      alarm: v('--alarm', '#ff6b5e'), line: v('--line', 'rgba(160,190,220,0.2)'), mono: v('--mono', 'monospace'), sans: v('--sans', 'sans-serif'),
      panel: 'rgba(6,10,16,0.97)', grid: 'rgba(160,190,220,0.12)', air: 'rgba(124,199,255,0.25)',
      earth: '#0d2236', earthLit: '#1d4a6b', sea: '#0b1b2b', land: '#2c3d33', coast: 'rgba(150,200,160,0.55)',
    };
    const m = ctx.core.m;
    if (typeof m._malloc === 'function' && typeof m._oc_eci === 'function') st.ptr = m._malloc(48);
    else st.failed = 'The map needs the flight core\'s oc_eci and malloc: rebuild the core';
    const hud = document.getElementById('hud');
    const style = document.createElement('style');
    style.textContent = '#buttons button[aria-pressed="true"] { border-color: var(--vector, #7cc7ff); }';
    document.head.appendChild(style);
    const cv = document.createElement('canvas');
    cv.id = 'map';
    cv.setAttribute('aria-label', 'Map: the orbit, the rendezvous and the ground track');
    Object.assign(cv.style, { position: 'absolute', left: '0', top: '0', display: 'none', pointerEvents: 'auto', touchAction: 'none', zIndex: '3' });
    if (hud) hud.appendChild(cv); else document.body.appendChild(cv);
    st.touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    st.canvas = cv;
    st.g = cv.getContext('2d');
    cv.addEventListener('pointerdown', (e) => {
      const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      const inside = (t) => t && x >= t.x - 3 && x <= t.x + t.w + 3 && y >= t.y - 4 && y <= t.y + t.h + 4;
      const hit = st.tabs.find(inside);
      if (inside(st.close)) show(false);
      else if (hit) { st.view = hit.v; st.chosen = true; st.laidFor = ''; st.drawnAt = -1e9; }
      e.stopPropagation();
    });
    const grid = document.getElementById('buttons');
    if (grid) {
      const b = document.createElement('button');
      b.type = 'button';
      b.id = 'btn-map';
      b.dataset.cmd = 'map';
      b.textContent = 'MAP';
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', (e) => { show(!st.shown); e.stopPropagation(); });
      const help = document.getElementById('btn-help');   // with the page's own buttons, before HELP
      (help ? help.parentNode : grid).insertBefore(b, help);
      st.button = b;
    }
    window.addEventListener('keydown', (e) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || (e.target && e.target.tagName === 'INPUT')) return;
      if (e.key === 'n') show(!st.shown);
      else if (e.key === 'N') next();
    });
    window.addEventListener('resize', () => { st.laidFor = ''; });
  },

  command(c) {
    if (c !== 'map') return false;
    show(!st.shown);
    return true;
  },

  update(ctx) {
    const s = ctx.s;
    remember(s);
    if (!st.shown || ctx.now - st.drawnAt < EVERY_MS) return;
    st.drawnAt = ctx.now;
    draw(ctx);
  },
};
