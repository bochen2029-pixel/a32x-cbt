// The walk's geometry and words, without a browser: the ring's frame in the site's, the walker's view, where
// the Sun reaches inside the band, the floor's plan as the page paints it, and the readouts' lines. GPLv3.
//
// The ring's frame (orbit_walk.h): x along ref, y along the axis, z along ref x axis, turning with the ring. At
// angle th round the ring the outward radius is (sin th, 0, cos th) and spinward (cos th, 0, -sin th); up is
// toward the axis. The interior is drawn in this frame, so three.js's world axes are its axes.

import { RING } from './core.js';
import { add, cross, dot, length, scale } from './frames.js';
import { fmtClock, fmtDistance } from './hud.js';
import { BALL, LIFT, USE, WALK, WHERE } from './walk-core.js';

export const W = RING.spin;
export const RF = RING.floor;                  // the rim floor, from the axis
export const ROOF_R = RING.roof;               // the roof
export const RIM_R = RING.rim;                 // the rim walls' inner edge: their tops, seen from the floor
export const HALF = RING.width / 2;            // the band's half-width along the axis
export const SECTOR = (2 * Math.PI) / RING.spokes;
export const S_RIM = 2 * Math.PI * RF;         // once round the floor
export const STREET = S_RIM / WALK.streets;    // from one cross street to the next
export const G0 = 9.80665;
export const SUN_RADIUS = 0.00465;             // rad: half the Sun's width
export const TURN = (2 * Math.PI) / W;         // s: once round

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export const outward = (th) => [Math.sin(th), 0, Math.cos(th)];
export const spinward = (th) => [Math.cos(th), 0, -Math.sin(th)];
export function wrapPi(a) {
  const b = (a + Math.PI) % (2 * Math.PI);
  return (b < 0 ? b + 2 * Math.PI : b) - Math.PI;
}
// A vector turned by phi about the axis, spinward: (sin th, 0, cos th) becomes (sin (th + phi), 0, cos (th + phi)).
export function turnAboutAxis(v, phi) {
  const c = Math.cos(phi), s = Math.sin(phi);
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
}

// ---- the ring's frame in the site frame ----------------------------------------------------------

// From the flight core's readouts: the ring's centre and its three axes, site frame.
export function ringFrame(s) {
  const x = [s.ringRefE, s.ringRefN, s.ringRefU], y = [s.ringAxE, s.ringAxN, s.ringAxU];
  return { centre: [s.ringE, s.ringN, s.ringU], x, y, z: cross(x, y) };
}
export const ringDirToSite = (f, v) => add(add(scale(f.x, v[0]), scale(f.y, v[1])), scale(f.z, v[2]));
export const ringToSite = (f, p) => add(f.centre, ringDirToSite(f, p));
export const siteDirToRing = (f, v) => [dot(v, f.x), dot(v, f.y), dot(v, f.z)];

// ---- the walker's view ------------------------------------------------------------------------

// Ring frame: forward along the heading (0 spinward, pi/2 along the axis) raised by the pitch, and up, from
// the angle whose inward radius is the walker's up. right = forward x up.
export function viewAxes(upTheta, heading, pitch) {
  const up0 = scale(outward(upTheta), -1);
  const level = add(scale(spinward(upTheta), Math.cos(heading)), [0, Math.sin(heading), 0]);
  const fwd = add(scale(level, Math.cos(pitch)), scale(up0, Math.sin(pitch)));
  const up = add(scale(level, -Math.sin(pitch)), scale(up0, Math.cos(pitch)));
  return { fwd, up, right: cross(fwd, up) };
}

// Which way is up for the walker's body, ring frame: against the felt gravity (its readouts are along spinward,
// the axis and up at upTheta), or the floor's up when nothing is felt.
export function feltUp(o) {
  const up0 = scale(outward(o.upTheta), -1), g = Math.hypot(o.feltS, o.feltC, o.feltH);
  if (g < 1e-6) return up0;
  const felt = add(add(scale(spinward(o.upTheta), o.feltS), [0, o.feltC, 0]), scale(up0, o.feltH));
  return scale(felt, -1 / g);
}

// The readouts the drawing moves with, between two steps a and b, f of the way (0..1): the eye, the angle of
// its up, the cars and the ball. The angle goes the short way round.
export const DRAWN = ['eyeX', 'eyeY', 'eyeZ', 'upTheta', 'carR0', 'carR1', 'carR2', 'carR3', 'carR4', 'carR5', 'ballX', 'ballY', 'ballZ'];
export function between(a, b, f) {
  const o = { ...b };
  for (const k of DRAWN) {
    if (k === 'upTheta') o[k] = a[k] + wrapPi(b[k] - a[k]) * f;
    else o[k] = a[k] + (b[k] - a[k]) * f;
  }
  return o;
}

// ---- the Sun inside the band -----------------------------------------------------------------

// How much of the Sun reaches the point p (ring frame) along d (unit, ring frame, toward the Sun). The band is
// closed but for its roof, which is glass: its floor and the hull under it, its rim walls, and the hub stand
// in the way, and the light gets in over the rim walls' tops. Soft over the Sun's width at those tops. The
// spokes and the roof's lattice are left to the drawing.
export function sunReach(p, d) {
  const [px, py, pz] = p;
  const rp = Math.hypot(px, pz);
  if (rp < RING.hub + 1 && Math.abs(py) < RING.port) return 0;   // inside the hub
  if (Math.abs(d[1]) < 1e-9) return 0;                           // in the ring's plane: the far side's floor
  const a = d[0] * d[0] + d[2] * d[2], b = px * d[0] + pz * d[2], c = rp * rp - RF * RF;
  const tHull = a > 1e-12 ? (-b + Math.sqrt(Math.max(0, b * b - a * c))) / a : Infinity;
  const tSide = ((d[1] > 0 ? HALF : -HALF) - py) / d[1];
  if (tSide <= 0 || tSide >= tHull) return 0;
  const r = Math.hypot(px + tSide * d[0], pz + tSide * d[2]);
  const soft = (SUN_RADIUS * tSide) / Math.max(Math.abs(d[1]), 0.2);
  return smooth(-soft, soft, RIM_R - r);
}

// The same by marching along the ray, for the tests: a step at a time, blocked inside the floor or the hub or a
// rim wall, through once it is past the band's sides above the walls' tops, or far away.
export function sunReachMarched(p, d, step = 0.5) {
  for (let t = step; t < 30000; t += step) {
    const x = p[0] + t * d[0], y = p[1] + t * d[1], z = p[2] + t * d[2], r = Math.hypot(x, z);
    if (Math.abs(y) <= HALF && r >= RF) return 0;                         // the floor and the hull
    if (Math.abs(y) >= HALF && Math.abs(y) <= HALF + Math.abs(d[1]) * step && r >= RIM_R && r <= RF + 40) return 0;   // a rim wall
    if (r < RING.hub && Math.abs(y) < RING.port) return 0;                // the hub
    if (Math.abs(y) > HALF + 1) return 1;                                 // out past a side
  }
  return 1;
}

// Where the Sun stands for the walker: its elevation above the level of their floor, its bearing (0 spinward,
// pi/2 along the axis), how much of it reaches their eye, and in how many seconds that changes, for a walker
// who stays where they are while the ring turns (null: not within a turn).
export function sunFor(o, d) {
  const up = scale(outward(o.upTheta), -1), sp = spinward(o.upTheta), eye = [o.eyeX, o.eyeY, o.eyeZ];
  const reach = sunReach(eye, d), now = reach > 0.5;
  let next = null;
  for (let t = 1; t <= TURN && next === null; t += 1) if ((sunReach(eye, turnAboutAxis(d, -W * t)) > 0.5) !== now) next = t;
  return { el: Math.asin(clamp(dot(d, up), -1, 1)), bearing: Math.atan2(d[1], dot(d, sp)), reach, next };
}

// ---- the floor's plan, as the core lays it out (walk.cpp, plan()) --------------------------------

export const isPlaza = (street) => street % (WALK.streets / RING.spokes) === 0;
// The cross street nearest s (m of arc from spoke 0, spinward), 0..streets-1, and s from its line.
export function nearestStreet(s) {
  const j = Math.floor(s / STREET + 0.5), n = WALK.streets;
  return { street: ((j % n) + n) % n, ds: s - j * STREET };
}
// Whether a cross street or a plaza decks the canal at s.
export function decked(s) {
  const { street, ds } = nearestStreet(s);
  return Math.abs(ds) < (isPlaza(street) ? WALK.plazaDeck : WALK.street);
}
// What the floor is at s, c: 'water', 'deck' (over the canal), 'bank' (between the parapet and the promenade),
// 'promenade', 'street', 'plaza', 'lane', 'wallpath', 'grass'.
export function surfaceAt(s, c) {
  const a = Math.abs(c), { street, ds } = nearestStreet(s);
  if (a < WALK.canal) return decked(s) ? 'deck' : 'water';
  if (isPlaza(street) && Math.abs(ds) < WALK.plaza && a < WALK.plaza) return 'plaza';
  if (Math.abs(ds) < WALK.street) return 'street';
  if (a < WALK.promenade - WALK.promenadeW / 2) return 'bank';
  if (a < WALK.promenade + WALK.promenadeW / 2) return 'promenade';
  if (Math.abs(a - WALK.lane) < WALK.laneW / 2) return 'lane';
  if (Math.abs(a - WALK.wallpath) < WALK.wallpathW / 2) return 'wallpath';
  return 'grass';
}

// ---- words for the readouts -------------------------------------------------------------------

const deg = (rad) => `${Math.round((rad * 180) / Math.PI)}°`;

// A bearing (0 spinward, pi/2 along +c) in eight words: round the ring, and toward one rim wall or the other.
export function bearingName(b) {
  const names = ['spinward', 'spinward and the +c wall', 'the +c wall', 'antispinward and the +c wall', 'antispinward',
    'antispinward and the −c wall', 'the −c wall', 'spinward and the −c wall'];
  return names[(((Math.round(b / (Math.PI / 4)) % 8) + 8) % 8)];
}
const signed = (v, digits = 0) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(digits)}`;
export const spokeName = (k) => `${(Math.round(k) % RING.spokes) + 1}`;   // the spokes are numbered 1 to 6 for people

// Where on the rim floor: from the nearest spoke, round the ring, and across the band.
export function floorPlace(s, c) {
  const k = Math.round(s / (S_RIM / RING.spokes)) % RING.spokes;
  const ds = wrapPi(s / RF - k * SECTOR) * RF;
  const along = Math.abs(ds) < WALK.plaza ? `at spoke ${spokeName(k)}'s plaza` : `${fmtDistance(Math.abs(ds))} ${ds > 0 ? 'spinward' : 'antispinward'} of spoke ${spokeName(k)}`;
  const what = { water: 'in the canal', deck: 'over the canal', bank: 'by the canal', promenade: 'on the canal\'s promenade', street: 'on a cross street', plaza: '', lane: 'on a lane', wallpath: 'under the rim wall', grass: '' }[surfaceAt(s, c)];
  return `${along}, c ${signed(c)} m${what ? ` ${what}` : ''}`;
}

// What the walker could do with E, said as the key's hint.
export function useHint(o, touch = false) {
  const key = touch ? 'USE' : 'E';
  const u = Math.round(o.use);
  if (u === USE.hatch) return `${key}: go back aboard the craft`;
  if (u === USE.call) return `${key}: call the lift`;
  if (u === USE.ride) return `${key}: ride ${Math.round(o.lift) === LIFT.atHub ? 'down to the floor' : 'up to the hub'}`;
  return '';
}

export const moving = (o) => Math.round(o.where) === WHERE.lift && (Math.round(o.lift) === LIFT.down || Math.round(o.lift) === LIFT.up);

// The status line and its hint: where the walker is, and what they can do next.
export function walkStatus(o, warp = 1, touch = false) {
  const g = `${o.g.toFixed(o.g < 0.1 ? 3 : 2)} g`;
  const where = Math.round(o.where), lift = Math.round(o.lift);
  let line;
  if (o.aboard > 0.5) line = 'WALK · BACK ABOARD';
  else if (where === WHERE.hub) line = `WALK · THE HUB · ${g}`;
  else if (where === WHERE.floor) line = `WALK · THE FLOOR · ${g}`;
  else if (lift === LIFT.down || lift === LIFT.up) line = `WALK · LIFT ${spokeName(o.spoke)} · ${lift === LIFT.down ? 'DOWN' : 'UP'} · ${fmtDistance(o.liftR)} from the axis · ${g}`;
  else line = `WALK · LIFT ${spokeName(o.spoke)} · AT THE ${lift === LIFT.atHub ? 'HUB' : 'FLOOR'} · ${g}`;
  const use = useHint(o, touch);
  const faster = touch ? 'TIME +: faster' : '.: time faster';
  let hint;
  if (moving(o)) hint = `holding the rail${warp < 10 ? ` · ${faster}` : ''}`;
  else if (use) hint = use;
  else hint = touch ? 'stick: walk · drag: look · JUMP · RUN' : 'W A S D: walk · drag or click: look · Shift: run · Space: jump';
  return { line, hint };
}

// The readouts' lines. sun: sunFor's answer, or null.
export function walkLines(o, warp, sun) {
  const where = Math.round(o.where), lift = Math.round(o.lift);
  let place;
  if (where === WHERE.hub) place = `the hub's lobby, ${o.r.toFixed(0)} m from the axis`;
  else if (where === WHERE.lift) place = `lift ${spokeName(o.spoke)}'s car, ${fmtDistance(o.liftR)} from the axis`;
  else place = `the floor, ${floorPlace(o.s, o.c)}`;
  const felt = Math.hypot(o.feltS, o.feltC, o.feltH);
  const tilt = felt > 1e-6 ? Math.acos(clamp(-o.feltH / felt, -1, 1)) : 0;
  const weight = o.ground > 0.5 ? `${o.g.toFixed(3)} g   ω²r ${o.centrifugal.toFixed(3)} m/s²   ${deg(tilt)} off the floor's up` : `in the air   ω²r ${o.centrifugal.toFixed(3)} m/s²`;
  const lines = [
    `WALK   T+${fmtClock(o.t)}   TIME ${warp}×   the ring turns once in ${TURN.toFixed(0)} s`,
    `PLACE  ${place}`,
    `WEIGHT ${weight}`,
    `SPEED  ${o.speed.toFixed(2)} m/s   spinward ${signed(o.vs, 2)}   along the axis ${signed(o.vc, 2)}${Math.abs(o.vh) > 0.05 ? `   up ${signed(o.vh, 2)}` : ''}`,
  ];
  const cor = Math.hypot(o.corS, o.corC, o.corH);
  if (cor > 1e-4) {
    let say;
    if (Math.abs(o.corH) >= Math.abs(o.corS)) {
      const part = o.ground > 0.5 && o.centrifugal > 0 ? `: ${o.corH < 0 ? 'heavier' : 'lighter'} by ${((100 * Math.abs(o.corH)) / o.centrifugal).toFixed(1)} %` : '';
      say = `${o.corH < 0 ? 'down' : 'up'}${part}`;
    } else say = o.corS > 0 ? 'spinward' : 'antispinward';
    lines.push(`CORIOLIS ${cor.toFixed(3)} m/s² ${say}`);
  } else lines.push('CORIOLIS none: at rest in the ring');
  if (where === WHERE.lift || lift === LIFT.down || lift === LIFT.up) {
    const state = { [LIFT.atHub]: 'at the hub', [LIFT.down]: 'going down', [LIFT.atFloor]: 'at the floor', [LIFT.up]: 'going up' }[lift];
    lines.push(`LIFT   ${spokeName(o.spoke)}: ${state}, ${fmtDistance(o.liftR)} from the axis, ${Math.abs(o.liftV).toFixed(1)} m/s`);
  }
  if (o.jumps > 0) lines.push(`JUMP   ${o.jumpRise.toFixed(2)} m up, ${o.jumpT.toFixed(2)} s, came down ${(Math.abs(o.jumpDs) * 1000).toFixed(0)} mm ${o.jumpDs >= 0 ? 'spinward' : 'antispinward'}`);
  if (o.ballFalls > 0 || Math.round(o.ball) === BALL.flying) {
    lines.push(o.ballFalls > 0
      ? `BALL   fell ${o.ballT.toFixed(2)} s, came down ${(Math.abs(o.ballDs) * 1000).toFixed(0)} mm ${o.ballDs >= 0 ? 'spinward' : 'antispinward'} of straight below`
      : 'BALL   falling');
  }
  if (sun) {
    const shines = sun.reach > 0.5;
    const where2 = sun.el < 0 ? `${deg(-sun.el)} below the level` : `${deg(sun.el)} up, toward ${bearingName(sun.bearing)}`;
    const when = sun.next === null ? '' : ` · ${shines ? 'sets' : 'shines in'} in ${sun.next} s`;
    lines.push(`SUN    ${where2}: ${shines ? 'shining in' : sun.el < 0 ? 'the ring\'s night' : 'in shade'}${when}`);
  }
  return lines;
}

export { clamp, length };
