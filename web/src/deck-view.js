// deck-view.js — the Ring's flight deck, on the page. LAND DECK (C) starts the crew's deck landing where it
// makes sense and says why where it does not; 6 gives a hand-flying pilot the deck hold (the hover's unified
// control); taking the controls from the crew over the deck gives the pilot that hold, not the plain one. It
// adds the pads, their lights and the deck's markings, which turn with the Ring; the swivelling nozzles, the
// lift jet's and the roll posts' glow on the craft; the deck's lines on the HUD and the status line; the
// approach display (the deck's ILS needles, the flight director, the hover's plan and a height tape); a chase
// view that rides with the deck, its up the Ring's axis-ward, so that the floor rises ahead like a ramp; and
// the touchdown's and the swivel's sounds. The deck itself is the core's (core/deck.cpp, orbit_deck.h); the
// words and the display's layout are deck-hud.js's. The deck's structure (the roof's gap, the bulkheads, the
// deck's surface) is the Ring's drawing's. GPLv3.

import * as THREE from 'three';
import { AUTO, RING, SAS } from './core.js';
import { add, cross, dot, scale, sub, three, unit } from './frames.js';
import {
  DECK, DECK_OUT, DECK_PH, DECK_V, WITHIN_M, approachLayout, deckCommand, deckHoldMakesSense, deckLines, deckStatus, engagedText, padName, touchdownText,
} from './deck-hud.js';

const D = RING.deck;
const D2R = Math.PI / 180;
const PAD_R = D.padRadius;
const FLOOR = RING.floor - 0.35;   // m from the axis: the markings, just proud of the floor

const padAngle = (k) => D.angle * D2R + ((k - (D.pads - 1) / 2) * D.padSpacing) / RING.floor;
// a point over the deck, in the Ring's frame (x ref, y axis, z = x cross y): at angle a, r from the axis, c across
const at = (a, r, c) => new THREE.Vector3(Math.sin(a) * r, c, Math.cos(a) * r);

// A pad, painted: the deck's grey, a white circle at its edge, the touchdown zone's ring (the crew's tolerance),
// a broad cross along and across the deck, and its number toward the antispinward end, upright to a craft that
// comes in along the deck.
function paintPad(g, n, number) {
  const c = n / 2, m = c / PAD_R;
  const ring = (r, w, colour) => { g.beginPath(); g.arc(c, c, r * m, 0, Math.PI * 2); g.lineWidth = w * m; g.strokeStyle = colour; g.stroke(); };
  g.clearRect(0, 0, n, n);
  g.beginPath(); g.arc(c, c, PAD_R * m, 0, Math.PI * 2); g.fillStyle = '#3b4148'; g.fill();
  ring(PAD_R - 0.6, 1.0, '#f2f4f6');
  ring(DECK.tolOff, 0.6, '#ffd23f');
  g.fillStyle = '#f2f4f6';
  g.fillRect(c - 0.5 * m, c - 18 * m, 1.0 * m, 36 * m);   // along the deck
  g.fillRect(c - 12 * m, c - 0.5 * m, 24 * m, 1.0 * m);   // across it
  g.save();
  g.translate(c, c + 12.5 * m);
  g.fillStyle = '#ffd23f';
  g.font = `bold ${Math.round(9 * m)}px sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(number), 0, 0);
  g.restore();
}

// The deck's markings, in the Ring's turning frame: the pads with lights round them, the centreline dashed
// from end to end, the edges along the rim walls, hazard stripes at the bulkheads' feet, and a row of lead-in
// lights from the spinward end to the pads that flash in sequence toward them, the way the craft comes in.
function deckMarks() {
  const group = new THREE.Group();
  const inward = (a) => new THREE.Vector3(-Math.sin(a), 0, -Math.cos(a));
  const lay = (mesh, a, r, c) => {   // a flat thing in its own xy plane, its +z to the axis, its +y spinward
    mesh.position.copy(at(a, r, c));
    const z = inward(a), y = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a)), x = new THREE.Vector3().crossVectors(y, z);
    mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    return mesh;
  };
  const lights = [];
  for (let k = 0; k < D.pads; k++) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 512;
    paintPad(canvas.getContext('2d'), 512, k + 1);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const paint = new THREE.MeshStandardMaterial({
      map: tex, transparent: true, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.25, roughness: 0.8, metalness: 0.05,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8,
    });
    group.add(lay(new THREE.Mesh(new THREE.PlaneGeometry(PAD_R * 2, PAD_R * 2), paint), padAngle(k), FLOOR, 0));
    for (let j = 0; j < 16; j++) {   // edge lights: green, the one toward the craft's coming white
      const b = (j / 16) * Math.PI * 2, along = Math.cos(b) * (PAD_R + 0.8), across = Math.sin(b) * (PAD_R + 0.8);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 6), new THREE.MeshBasicMaterial({ color: j === 0 ? 0xffffff : 0x5dff8a }));
      lamp.position.copy(at(padAngle(k) + along / RING.floor, FLOOR - 0.2, across));
      group.add(lamp);
      lights.push({ mesh: lamp, pad: k, kind: 'edge' });
    }
  }
  const white = new THREE.MeshBasicMaterial({ color: 0xe9edf1 }), yellow = new THREE.MeshBasicMaterial({ color: 0xffd23f }), black = new THREE.MeshBasicMaterial({ color: 0x15181c });
  const half = D.arc / 2;
  for (let s = -half + 15; s < half - 10; s += 30) {   // the centreline, dashed, clear of the pads
    let onPad = false;
    for (let k = 0; k < D.pads; k++) if (Math.abs(s - (k - (D.pads - 1) / 2) * D.padSpacing) < PAD_R + 8) onPad = true;
    if (onPad) continue;
    group.add(lay(new THREE.Mesh(new THREE.PlaneGeometry(1.2, 14), white), D.angle * D2R + s / RING.floor, FLOOR, 0));
  }
  for (const c of [-RING.width / 2 + 25, RING.width / 2 - 25]) {   // the deck's edges along the rim walls
    for (let s = -half + 10; s < half - 5; s += 20) group.add(lay(new THREE.Mesh(new THREE.PlaneGeometry(0.8, 18), white), D.angle * D2R + s / RING.floor, FLOOR, c));
  }
  for (const end of [-1, 1]) {   // hazard stripes at the bulkheads' feet
    const a = D.angle * D2R + (end * (half - 6)) / RING.floor;
    for (let c = -RING.width / 2 + 10; c < RING.width / 2 - 5; c += 10) {
      group.add(lay(new THREE.Mesh(new THREE.PlaneGeometry(5, 8), (Math.round(c / 10) % 2 ? yellow : black)), a, FLOOR, c));
    }
  }
  const lead = [];   // lead-in lights: from the spinward end toward the pads
  for (let i = 0; i < 14; i++) {
    const s = half - 30 - i * 25;
    if (s < (D.pads - 1) / 2 * D.padSpacing + PAD_R + 20) break;
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 6), new THREE.MeshBasicMaterial({ color: 0xfff1c2, transparent: true }));
    lamp.position.copy(at(D.angle * D2R + s / RING.floor, FLOOR - 0.4, 0));
    group.add(lamp);
    lead.push(lamp);
  }
  return { group, lights, lead };
}

// The craft's jet-borne parts, in its drawing's frame (x forward, y up, z right): a swivelling duct behind
// each of the drive's bells, turning about the craft's pitch axis from aft (0) to straight down (90), with its
// own plume, which stands in for the bells' while the swivel is off aft; the lift jet's door under the nose
// and the roll posts under the wings, which glow while the craft is jet-borne.
function jetParts() {
  const group = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x4a4e55, roughness: 0.35, metalness: 0.85, side: THREE.DoubleSide });
  const ducts = [];
  for (const z of [-1.3, 1.3]) {
    const pivot = new THREE.Group();
    pivot.position.set(-17.6, 0.15, z);
    const duct = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.15, 1.8, 24, 1, true).rotateZ(Math.PI / 2).translate(-0.9, 0, 0), metal);
    const plume = new THREE.Group();
    const outer = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 24, 1, true).rotateZ(Math.PI / 2).translate(-0.5, 0, 0),
      new THREE.MeshBasicMaterial({ color: 0x7fb2ff, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1, 16, 1, true).rotateZ(Math.PI / 2).translate(-0.5, 0, 0),
      new THREE.MeshBasicMaterial({ color: 0xe8f1ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    plume.add(outer, inner);
    plume.position.set(-1.8, 0, 0);
    pivot.add(duct, plume);
    group.add(pivot);
    ducts.push({ pivot, duct, plume });
  }
  const glow = (x, y, z, r) => {
    const g = new THREE.Group();
    const door = new THREE.Mesh(new THREE.CircleGeometry(r, 20).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffb070, transparent: true, opacity: 0, side: THREE.DoubleSide }));
    const jet = new THREE.Mesh(new THREE.ConeGeometry(r * 1.4, 1, 16, 1, true).translate(0, -0.5, 0),
      new THREE.MeshBasicMaterial({ color: 0x9cc6ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    g.add(door, jet);
    g.position.set(x, y, z);
    group.add(g);
    return { door, jet };
  };
  const liftJet = glow(9.0, -1.15, 0, 0.9);
  const posts = [glow(-6.0, -0.75, -4.6, 0.35), glow(-6.0, -0.75, 4.6, 0.35)];
  return { group, ducts, liftJet, posts };
}

// The approach display, on the HUD's own canvas: the ILS box (needles), the plan (nose up) and the height tape.
const GREEN = '#6fe08a', AMBER = '#ffb35c', INK = 'rgba(232, 238, 244, 0.85)', FAINT = 'rgba(232, 238, 244, 0.28)', CYAN = '#7cc7ff', MAGENTA = '#ff7ce0';

// live: the glide path still applies (the glide; or the pilot short of the pad); else the needles are greyed.
function drawApproach(g, x0, y0, R, d, glide, live) {
  const L = approachLayout(d, R);
  const line = (a, b, c, e) => { g.beginPath(); g.moveTo(a, b); g.lineTo(c, e); g.stroke(); };
  const circle = (x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke(); };
  g.save();
  g.font = '600 11px ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';
  g.textAlign = 'center';
  g.textBaseline = 'top';
  const panel = (cx, w, title) => {
    g.fillStyle = 'rgba(6, 10, 16, 0.55)';
    g.fillRect(cx - w / 2, y0 - R - 18, w, 2 * R + 34);
    g.fillStyle = INK;
    g.fillText(title, cx, y0 - R - 15);
  };
  // the ILS: dots at half and full scale, the needles in magenta, green while on the path
  const ilsX = x0 - R * 2.4;
  panel(ilsX, 2 * R + 16, glide ? 'DECK ILS' : 'ILS');
  g.strokeStyle = FAINT;
  g.lineWidth = 1;
  for (const f of [-1, -0.5, 0.5, 1]) { circle(ilsX + f * R, y0, 2.5); circle(ilsX, y0 + f * R, 2.5); }
  g.strokeStyle = INK;
  line(ilsX - 8, y0, ilsX + 8, y0);
  line(ilsX, y0 - 8, ilsX, y0 + 8);
  g.strokeStyle = !live ? FAINT : L.needles.ok ? GREEN : MAGENTA;
  g.lineWidth = 3;
  line(ilsX + L.needles.loc, y0 - R, ilsX + L.needles.loc, y0 + R);
  line(ilsX - R, y0 + L.needles.gs, ilsX + R, y0 + L.needles.gs);
  g.fillStyle = INK;
  g.fillText(`${d.loc >= 0 ? '+' : ''}${d.loc.toFixed(0)} m   ${d.gs >= 0 ? '+' : ''}${d.gs.toFixed(0)} m`, ilsX, y0 + R + 3);
  // the plan, nose up: the pad (a ring), the craft's velocity (a line from the centre) and the director's (a circle)
  panel(x0, 2 * R + 16, 'PLAN');
  g.strokeStyle = FAINT;
  g.lineWidth = 1;
  circle(x0, y0, R);
  circle(x0, y0, R / 2);
  const [px, py] = L.plan.pad;
  g.strokeStyle = Math.hypot(d.s, d.c) <= DECK.tolOff ? GREEN : AMBER;
  g.lineWidth = 2;
  circle(x0 + px, y0 + py, Math.max(4, L.plan.padRadius * 0.4));
  g.strokeStyle = INK;
  line(x0 - 6, y0, x0 + 6, y0);
  line(x0, y0 - 9, x0, y0 + 4);
  const [vx, vy] = L.plan.velocity, [fx, fy] = L.plan.director;
  g.strokeStyle = CYAN;
  g.lineWidth = 2.5;
  line(x0, y0, x0 + vx, y0 + vy);
  g.strokeStyle = MAGENTA;
  g.lineWidth = 2;
  circle(x0 + fx, y0 + fy, 6);
  g.fillStyle = INK;
  g.fillText(`${padName(Math.round(d.pad))} ${Math.hypot(d.s, d.c) < 1000 ? `${Math.hypot(d.s, d.c).toFixed(0)} m` : `${(Math.hypot(d.s, d.c) / 1000).toFixed(1)} km`}`, x0, y0 + R + 3);
  // the tape: the height, the vertical speed's arrow, the director's mark
  const tx = x0 + R * 1.9;
  panel(tx, 54, 'H');
  g.strokeStyle = FAINT;
  g.lineWidth = 1;
  line(tx, y0 - R, tx, y0 + R);
  const vs = (v) => (R * v) / (Math.abs(v) + 3);
  g.strokeStyle = L.tape.ok ? CYAN : AMBER;
  g.lineWidth = 6;
  line(tx, y0, tx, y0 - vs(d.vertical));
  g.strokeStyle = MAGENTA;
  g.lineWidth = 2;
  line(tx - 10, y0 - vs(d.fdVertical), tx + 10, y0 - vs(d.fdVertical));
  g.fillStyle = INK;
  g.fillText(`${d.height < 1000 ? d.height.toFixed(1) : (d.height / 1000).toFixed(2) + 'k'}`, tx, y0 + R + 3);
  g.restore();
}

export const deck = {
  name: 'deck',

  init(ctx) {
    this.d = ctx.core.addBlock('deck', '_oc_deck_out', '_oc_deck_out_len', DECK_OUT);
    this.seen = { tdT: this.d.tdT, nozzle: this.d.nozzle, moving: 0, phase: Math.round(this.d.phase) };
    this.touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    this.marks = deckMarks();
    ctx.ring.spin.add(this.marks.group);
    this.jet = jetParts();
    ctx.craft.group.add(this.jet.group);
    const hud = document.getElementById('hud');
    if (!hud) throw new Error('the page has no #hud for the deck\'s approach display');
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'deck-approach';
    this.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
    hud.prepend(this.canvas);
    this.g = this.canvas.getContext('2d');
    this.drawn = false;
    const grid = document.getElementById('buttons');
    if (grid) {   // LAND DECK, beside DOCK
      const b = document.createElement('button');
      b.type = 'button';
      b.id = 'btn-deck';
      b.dataset.cmd = 'deck';
      b.textContent = 'LAND DECK';
      b.addEventListener('click', (e) => { ctx.input.commands.push('deck'); e.stopPropagation(); });
      const dockButton = document.getElementById('btn-dock');
      if (dockButton && dockButton.nextSibling) grid.insertBefore(b, dockButton.nextSibling);
      else grid.appendChild(b);
    }
  },

  // The deck hold, from the craft as it is: the throttle at its middle, which holds the height.
  toHold(ctx, say) {
    ctx.core.auto(AUTO.off);
    ctx.core.sas(SAS.deck);
    Object.assign(ctx.input.hands, { throttle: 0.5, gear: ctx.s.gear > 0.5, brake: this.d.onDeck > 0.5 ? 1 : 0 });
    ctx.say(say);
  },

  command(c, ctx) {
    const s = ctx.core.read(), d = this.d, dock = ctx.core.dock;
    const auto = Math.round(s.auto), sas = Math.round(s.sas);
    if (c === 'deck') {
      const act = deckCommand(s, d, dock);
      if (act.action !== 'engage') { ctx.say(act.say); return true; }
      ctx.core.auto(AUTO.deck);
      ctx.core.read();
      ctx.say(engagedText(ctx.core.s, d));
      return true;
    }
    if (c === 'sas5' || (c === 'sas-next' && sas === SAS.port && deckHoldMakesSense(s, dock))) {
      if (!deckHoldMakesSense(s, dock)) { ctx.say('The deck hold is for flying over the deck: within the Ring\'s reach'); return true; }
      this.toHold(ctx, 'Deck hold: the stick flies against the deck, the throttle climbs and sinks, the middle holds');
      return true;
    }
    if (c === 'sas-next' && sas === SAS.deck) { ctx.core.sas(SAS.hold); ctx.say('Hold: attitude'); return true; }
    if (c === 'crew') {
      // over the deck, the pilot's hands go to the deck hold and the crew's to the deck landing
      if (auto === AUTO.deck) { this.toHold(ctx, 'Your controls: the deck hold, the throttle\'s middle holds the height'); return true; }
      const near = s.ringRange < WITHIN_M && (sas === SAS.deck || d.onDeck > 0.5) && s.crashed === 0;
      if (auto === AUTO.off && near) {
        const act = deckCommand(s, d, dock);
        if (act.action !== 'engage') { ctx.say(act.say); return true; }
        ctx.core.auto(AUTO.deck);
        ctx.core.read();
        ctx.say(engagedText(ctx.core.s, d));
        return true;
      }
    }
    return false;
  },

  update(ctx) {
    const s = ctx.s, d = this.d, now = ctx.now / 1000;
    const phase = Math.round(d.phase), auto = Math.round(s.auto);
    // the touchdown, and the crew handing the craft over on the deck
    if (d.tdT !== this.seen.tdT) {
      if (d.tdT > 0 && Math.round(d.tdVerdict) !== DECK_V.crashed) {
        ctx.say(touchdownText(d));
        if (ctx.sound && ctx.sound.cue) ctx.sound.cue('touchdown', { strength: Math.min(1, 0.25 + d.tdSink / 2), screech: 0 });
      }
      this.seen.tdT = d.tdT;
    }
    if (phase !== this.seen.phase) {
      if (phase === DECK_PH.landed && auto === AUTO.off) {
        ctx.input.hands.throttle = 0.5;   // the deck hold's middle: stay down until the pilot opens it
        ctx.input.hands.brake = 1;
        ctx.say(`On ${padName(Math.round(d.pad))}: the drive idle, the brakes on. Yours, held on the deck`);
      }
      this.seen.phase = phase;
    }
    // the swivel's actuators, heard as they start
    const turning = Math.abs(d.nozzle - this.seen.nozzle) > 0.05;
    if (turning && !this.seen.moving && ctx.sound && ctx.sound.cue && ctx.state.warp <= 2) ctx.sound.cue('hiss', { seconds: 0.6, strength: 0.25 });
    this.seen.moving = turning ? 1 : 0;
    this.seen.nozzle = d.nozzle;
    // the swivel and the jets on the craft
    const nz = d.nozzle * D2R, thrust = s.throttle, jet = thrust * Math.sin(nz);
    const swivelled = d.nozzle > 2;
    for (const [k, duct] of this.jet.ducts.entries()) {
      duct.pivot.rotation.z = nz;   // about the craft's pitch axis: aft through down
      duct.pivot.visible = swivelled;
      duct.plume.visible = swivelled && thrust > 0.01;
      const flicker = 1 + 0.06 * Math.sin(now * 61 + k * 2.1);
      const len = (5 + 22 * thrust) * flicker, wide = 1.4 + 0.5 * thrust;
      duct.plume.scale.set(len, wide, wide);
      duct.plume.children[0].material.opacity = 0.3 * thrust;
      duct.plume.children[1].material.opacity = 0.75 * thrust;
    }
    if (swivelled && ctx.craft.plumes) for (const p of ctx.craft.plumes) p.visible = false;   // the ducts' plumes stand in for the bells'
    const glow = (part, k) => {
      part.door.material.opacity = Math.min(0.9, jet * 2.2 * k);
      part.jet.material.opacity = Math.min(0.6, jet * 1.2 * k);
      part.jet.scale.set(1, 2 + 9 * jet * k, 1);
      part.jet.visible = jet > 0.02;
    };
    glow(this.jet.liftJet, 1);
    for (const post of this.jet.posts) glow(post, 0.5);
    // the deck's lights: the pads' steady, the chosen pad's brighter; the lead-in lights running toward the pads
    for (const L of this.marks.lights) L.mesh.material.color.setHex(L.pad === Math.round(d.pad) ? 0x9dffb8 : 0x3fbf63);
    const run = Math.floor(now * 8) % (this.marks.lead.length + 4);
    this.marks.lead.forEach((lamp, i) => { lamp.material.opacity = i === run ? 1 : 0.25; });
    this.view(ctx);
    this.display(ctx);
  },

  // The chase view, while the deck matters: behind the craft on its track against the deck, which is spinward of
  // it (the deck overtakes the craft, so it comes in tail first), looking past it along the deck toward the pad,
  // the camera's up the Ring's axis-ward, so that the deck runs ahead and rises like a ramp. Dragging turns the
  // camera round the craft as ever. Main.js has placed the scene from its own eye; this moves the eye, and what
  // main.js drew from it, by the difference.
  view(ctx) {
    const s = ctx.s, d = this.d;
    const auto = Math.round(s.auto), sas = Math.round(s.sas);
    const deckOn = (auto === AUTO.deck && Math.round(d.phase) >= DECK_PH.depart) || d.onDeck > 0.5 || (auto === AUTO.off && sas === SAS.deck && s.ringRange < WITHIN_M);
    if (ctx.VIEWS[ctx.state.view] !== 'chase' || !deckOn || s.crashed > 0) return;
    const P = ctx.P, R = [s.ringE, s.ringN, s.ringU], axis = [s.ringAxE, s.ringAxN, s.ringAxU];
    const rel = sub(P, R), along = scale(axis, dot(rel, axis)), out = unit(sub(rel, along));
    const upDeck = scale(out, -1), spin = unit(cross(axis, out));   // toward the axis; spinward, the way the deck moves
    const look = ctx.input.look;
    const dir = add(scale(spin, Math.cos(look.az)), scale(axis, Math.sin(look.az)));
    const dist = Math.max(30, look.dist * 1.3);
    const eye = add(P, add(scale(dir, dist * Math.cos(look.el)), scale(upDeck, dist * Math.sin(look.el) + 6)));
    const shift = three(sub(ctx.cam, eye));
    for (const obj of [ctx.craft.group, ctx.ring.group, ctx.airport.group]) obj.position.add(new THREE.Vector3(...shift));
    ctx.cam = eye;
    ctx.rel = (p) => three(sub(p, eye));
    ctx.camera.up.set(...three(upDeck));
    ctx.camera.lookAt(new THREE.Vector3(...ctx.rel(add(P, scale(upDeck, 2.5)))));
    ctx.camera.updateMatrixWorld();
  },

  display(ctx) {
    const s = ctx.s, d = this.d;
    const auto = Math.round(s.auto), sas = Math.round(s.sas), phase = Math.round(d.phase);
    const show = s.crashed === 0 && d.pad >= 0 &&
      ((auto === AUTO.deck && phase >= DECK_PH.wait) || (auto === AUTO.off && sas === SAS.deck && s.ringRange < WITHIN_M && d.height < 1500));
    const w = window.innerWidth, h = window.innerHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (!show) {
      if (this.drawn) { this.g.setTransform(1, 0, 0, 1, 0, 0); this.g.clearRect(0, 0, this.canvas.width, this.canvas.height); this.drawn = false; }
      return;
    }
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.g.clearRect(0, 0, w, h);
    // on a desk, at the left between the status line and the readouts; on a phone, above the stick and throttle
    const R = Math.max(34, Math.min(56, Math.min(w, h) * 0.08));
    const x0 = w < 560 ? w / 2 + R * 0.4 : 24 + R * 3.4, y0 = w < 560 ? h - R - 200 : Math.min(h * 0.52, h - 300) + R * 0.2;
    const live = phase === DECK_PH.glide || (auto === AUTO.off && d.onDeck < 0.5 && Math.hypot(d.s, d.c) > 30 && d.height > DECK.hover + 5);
    drawApproach(this.g, x0, y0, R, d, phase === DECK_PH.glide, live);
    this.drawn = true;
  },

  hud(ctx) { return deckLines(ctx.s, this.d, window.innerWidth < 560); },

  status(ctx) { return deckStatus(ctx.s, this.d, this.touch); },
};

