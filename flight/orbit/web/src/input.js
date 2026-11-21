// The pilot's hands: keyboard, a gamepad, or the screen's own stick and buttons. Every source ends in
// one set of controls for the core and a few commands for the page. MIT.

export const HELP = [
  ['0, TOUR', 'the tour: the whole loop flown by the crew, with words; any key takes over'],
  ['Space', 'crew on / take the controls'],
  ['W S / ↑ ↓', 'pitch down / up'],
  ['A D / ← →', 'bank left / right'],
  ['Q E', 'yaw (nose wheel on the ground)'],
  ['= −', 'throttle up / down, held (+ and the keypad\'s + − too);  Z full, X cut'],
  ['I K  J L  U M', 'small thrusters: fore/aft, left/right, up/down'],
  ['1 2 3 4 5 6', 'attitude hold, prograde, retrograde, the Ring, the hub\'s port, the deck (hover)'],
  ['G  B', 'gear;  brakes'],
  ['T', 'in orbit: the crew flies the approach'],
  ['P', 'the crew docks at the hub; docked: let go'],
  ['C', 'the crew lands on the Ring\'s flight deck'],
  ['6, on the deck', 'hover: W S A D fly against the deck, let go to hold; = − climb, sink (the middle holds)'],
  ['7', 'on the deck: the crew takes off, out through the roof\'s gap to the hold point (then R flies home)'],
  ['R', 'the crew flies home to KDFW'],
  ['Enter', 'docked: go aboard the Ring and walk'],
  ['O', 'skip ahead to orbit (crew)'],
  [', .', 'time slower / faster'],
  ['V', 'view: chase, cockpit, from the Ring'],
  ['N', 'the map: orbit, the Ring close up, the ground track (Shift-N to switch)'],
  ['F', 'the Moon through a telescope, and back'],
  ['Y', 'sound off / on (it starts with your first key or tap)'],
  ['8', 'the flight director: shown while you fly, while the crew flies too, off'],
  ['9', 'graphics: auto, low, medium, high (also GFX)'],
  ['`', 'the frame meter: frame rate and time, the tier, what is drawn (to measure your machine)'],
  ['drag, wheel', 'look around the craft, zoom'],
  ['H', 'this help'],
  ['Backspace', 'start again'],
];

// The same on a touch screen, by what is under the thumbs and the buttons' names.
export const HELP_TOUCH = [
  ['TOUR', 'the whole loop flown by the crew, with words; any button takes over'],
  ['CREW', 'the crew on / take the controls'],
  ['the stick', 'left thumb: pitch and bank'],
  ['THR', 'right thumb: the throttle, slid up and down'],
  ['TO ORBIT', 'skip ahead to orbit (the crew)'],
  ['VIEW', 'chase, cockpit, from the Ring'],
  ['TIME + −', 'time faster / slower'],
  ['MORE', 'the rest of the buttons; any of them closes it'],
  ['APPROACH', 'in orbit: the crew flies the approach'],
  ['DOCK', 'the crew docks at the hub; docked: let go'],
  ['LAND DECK', 'the crew lands on the Ring\'s flight deck'],
  ['WALK', 'docked: go aboard the Ring and walk'],
  ['RETURN', 'the crew flies home to KDFW; again: skip the wait'],
  ['HOLD', 'attitude hold, prograde, retrograde, the Ring, the hub\'s port, the deck (hover), in turn'],
  ['GEAR, BRAKES', 'the gear; the brakes'],
  ['GFX', 'graphics: auto, low, medium, high'],
  ['MAP', 'the orbit, the Ring close up, the ground track'],
  ['SOUND', 'sound off / on'],
  ['drag', 'look around the craft'],
  ['RESTART', 'start again'],
  ['', 'a tap on this help puts it away'],
];

// The help's rows as the panel shows them: a key, and what it does.
export function helpHtml(rows) {
  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return rows.map(([k, v]) => `<div><b>${esc(k)}</b><span>${esc(v)}</span></div>`).join('');
}

// The command keys (key()'s map) by the physical key, for when Shift, held for + (the throttle's key with Shift on
// some layouts) or from habit, makes them another character: Shift-. is >, Shift-1 is !.
const SHIFTED = {
  Comma: ',', Period: '.', Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4', Digit5: '5', Digit6: '6', Digit8: '8', Digit9: '9',
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export class Input {
  constructor(target) {
    this.held = new Set();
    this.commands = [];
    this.hands = { pitch: 0, roll: 0, yaw: 0, throttle: 0, tx: 0, ty: 0, tz: 0, gear: true, brake: 1 };
    this.touch = { pitch: 0, roll: 0, active: false };
    this.look = { az: 0, el: 0.2, dist: 70, dragging: false };
    this.pads = [];
    window.addEventListener('keydown', (e) => this.key(e, true));
    window.addEventListener('keyup', (e) => this.key(e, false));
    window.addEventListener('blur', () => this.held.clear());
    target.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' || e.isPrimary) {
        this.look.dragging = true;
        this.look.x = e.clientX;
        this.look.y = e.clientY;
        target.setPointerCapture(e.pointerId);
      }
    });
    target.addEventListener('pointermove', (e) => {
      if (!this.look.dragging) return;
      this.look.az -= (e.clientX - this.look.x) * 0.005;
      this.look.el = clamp(this.look.el + (e.clientY - this.look.y) * 0.004, -1.2, 1.4);
      this.look.x = e.clientX;
      this.look.y = e.clientY;
    });
    target.addEventListener('pointerup', () => { this.look.dragging = false; });
    target.addEventListener('wheel', (e) => {
      this.look.dist = clamp(this.look.dist * Math.exp(e.deltaY * 0.001), 25, 4000);
      e.preventDefault();
    }, { passive: false });
  }

  key(e, down) {
    if (e.target && e.target.tagName === 'INPUT') return;
    // a button with the keyboard's focus (reached by Tab) takes Enter and Space itself, as a click; a button
    // clicked by a mouse or a finger keeps no focus (hud.js), so for them these stay the page's keys
    if (down && e.target && e.target.tagName === 'BUTTON' && (e.key === 'Enter' || e.key === ' ')) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (down && !e.repeat) {
      const map = {
        ' ': 'crew', g: 'gear', b: 'brake', v: 'view', h: 'help', t: 'approach', o: 'orbit', ',': 'slower', '.': 'faster',
        1: 'sas0', 2: 'sas1', 3: 'sas2', 4: 'sas3', 5: 'sas4', 6: 'sas5', 7: 'takeoff', c: 'deck', z: 'full', x: 'cut', Backspace: 'reset', p: 'dock', r: 'return', Enter: 'walk',
        f: 'moon', 9: 'quality', 8: 'fd',
      };
      const c = map[k] ?? (e.shiftKey && SHIFTED[e.code] ? map[SHIFTED[e.code]] : undefined);   // Shift held, for + or from habit
      if (c !== undefined) this.commands.push(c);
    }
    if (down) this.held.add(k);
    else this.held.delete(k);
    if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace'].includes(k)) e.preventDefault();
  }

  // The screen's controls: a stick under the left thumb, a throttle under the right, buttons.
  bindTouch(stick, knob, throttle, fill, buttons) {
    const centre = () => { const r = stick.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2, r.width / 2]; };
    const move = (e) => {
      const [cx, cy, r] = centre();
      const dx = clamp((e.clientX - cx) / r, -1, 1), dy = clamp((e.clientY - cy) / r, -1, 1);
      this.touch = { roll: dx, pitch: dy, active: true };
      knob.style.transform = `translate(${dx * r * 0.6}px, ${dy * r * 0.6}px)`;
    };
    stick.addEventListener('pointerdown', (e) => { stick.setPointerCapture(e.pointerId); move(e); e.stopPropagation(); });
    stick.addEventListener('pointermove', (e) => { if (this.touch.active) move(e); });
    const release = () => { this.touch = { pitch: 0, roll: 0, active: false }; knob.style.transform = ''; };
    stick.addEventListener('pointerup', release);
    stick.addEventListener('pointercancel', release);
    const setThrottle = (e) => {
      const r = throttle.getBoundingClientRect();
      this.hands.throttle = clamp(1 - (e.clientY - r.top) / r.height, 0, 1);
      this.commands.push('hand-throttle');
    };
    throttle.addEventListener('pointerdown', (e) => { throttle.setPointerCapture(e.pointerId); this.throttleDrag = true; setThrottle(e); e.stopPropagation(); });
    throttle.addEventListener('pointermove', (e) => { if (this.throttleDrag) setThrottle(e); });
    throttle.addEventListener('pointerup', () => { this.throttleDrag = false; });
    for (const b of buttons) b.addEventListener('click', (e) => { this.commands.push(b.dataset.cmd); e.stopPropagation(); });
    this.throttleFill = fill;
  }

  // Once a frame: the controls for the core, and the commands since the last frame.
  poll(dt) {
    const h = this.held, on = (...keys) => keys.some((k) => h.has(k));
    let pitch = (on('s', 'ArrowDown') ? 1 : 0) - (on('w', 'ArrowUp') ? 1 : 0);
    let roll = (on('d', 'ArrowRight') ? 1 : 0) - (on('a', 'ArrowLeft') ? 1 : 0);
    let yaw = (on('e') ? 1 : 0) - (on('q') ? 1 : 0);
    let tx = (on('i') ? 1 : 0) - (on('k') ? 1 : 0), ty = (on('l') ? 1 : 0) - (on('j') ? 1 : 0), tz = (on('m') ? 1 : 0) - (on('u') ? 1 : 0);
    // the throttle: = and − (Shift turns = into +; the keypad's + and − are the same keys), held, as the stick is.
    // Not Shift or Ctrl, as it once was: Ctrl held with the flying keys gives the browser Ctrl-W, which closes the
    // tab whatever a page asks, and Shift alone with no Ctrl to pair it would be half a throttle (2026-11-21).
    let throttleRate = (on('=', '+') ? 0.6 : 0) - (on('-') ? 0.6 : 0);
    if (this.touch.active) { pitch += this.touch.pitch; roll += this.touch.roll; }
    let pads = [];
    try { pads = navigator.getGamepads ? navigator.getGamepads() : []; } catch { pads = []; }   // a frame may refuse gamepads
    for (const pad of pads) {
      if (!pad || pad.mapping !== 'standard') continue;
      const dz = (v) => (Math.abs(v) < 0.12 ? 0 : v);
      roll += dz(pad.axes[0]);
      pitch += dz(pad.axes[1]);
      yaw += dz(pad.axes[2]);
      throttleRate += 0.8 * ((pad.buttons[7]?.value || 0) - (pad.buttons[6]?.value || 0));
      tx += (pad.buttons[12]?.pressed ? 1 : 0) - (pad.buttons[13]?.pressed ? 1 : 0);
      ty += (pad.buttons[15]?.pressed ? 1 : 0) - (pad.buttons[14]?.pressed ? 1 : 0);
      // Back (8) is the brakes: without it a pad's pilot, handed the craft parked, could never roll
      const edges = [[0, 'crew'], [1, 'view'], [2, 'sas-next'], [3, 'gear'], [4, 'slower'], [5, 'faster'], [8, 'brake'], [9, 'orbit']];
      const was = this.pads[pad.index] || [];
      for (const [i, cmd] of edges) if (pad.buttons[i]?.pressed && !was[i]) this.commands.push(cmd);
      this.pads[pad.index] = pad.buttons.map((b) => b.pressed);
    }
    const c = this.hands;
    c.pitch = clamp(pitch, -1, 1);
    c.roll = clamp(roll, -1, 1);
    c.yaw = clamp(yaw, -1, 1);
    c.tx = clamp(tx, -1, 1);
    c.ty = clamp(ty, -1, 1);
    c.tz = clamp(tz, -1, 1);
    c.throttle = clamp(c.throttle + throttleRate * dt, 0, 1);
    if (this.throttleFill) this.throttleFill.style.height = `${(c.throttle * 100).toFixed(0)}%`;
    const commands = this.commands;
    this.commands = [];
    return commands;
  }
}
