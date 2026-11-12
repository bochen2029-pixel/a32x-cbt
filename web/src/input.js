// The pilot's hands: keyboard, a gamepad, or the screen's own stick and buttons. Every source ends in
// one set of controls for the core and a few commands for the page. GPLv3.

export const HELP = [
  ['Space', 'crew on / take the controls'],
  ['W S / ↑ ↓', 'pitch down / up'],
  ['A D / ← →', 'bank left / right'],
  ['Q E', 'yaw (nose wheel on the ground)'],
  ['Shift Ctrl', 'throttle up / down;  Z full, X cut'],
  ['I K  J L  U M', 'small thrusters: fore/aft, left/right, up/down'],
  ['1 2 3 4 5 6', 'attitude hold, prograde, retrograde, the Ring, the hub\'s port, the deck (hover)'],
  ['G  B', 'gear;  brakes'],
  ['T', 'in orbit: the crew flies the approach'],
  ['P', 'the crew docks at the hub; docked: let go'],
  ['C', 'the crew lands on the Ring\'s flight deck'],
  ['6, on the deck', 'hover: W S A D fly against the deck, let go to hold; Shift Ctrl climb, sink (the middle holds)'],
  ['R', 'the crew flies home to KDFW'],
  ['Enter', 'docked: go aboard the Ring and walk'],
  ['O', 'skip ahead to orbit (crew)'],
  [', .', 'time slower / faster'],
  ['V', 'view: chase, cockpit, from the Ring'],
  ['N', 'the map: orbit, the Ring close up, the ground track (Shift-N to switch)'],
  ['Y', 'sound off / on (it starts with your first key or tap)'],
  ['drag, wheel', 'look around the craft, zoom'],
  ['H', 'this help'],
  ['Backspace', 'start again'],
];

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
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (down && !e.repeat) {
      const map = {
        ' ': 'crew', g: 'gear', b: 'brake', v: 'view', h: 'help', t: 'approach', o: 'orbit', ',': 'slower', '.': 'faster',
        1: 'sas0', 2: 'sas1', 3: 'sas2', 4: 'sas3', 5: 'sas4', 6: 'sas5', c: 'deck', z: 'full', x: 'cut', Backspace: 'reset', p: 'dock', r: 'return', Enter: 'walk',
      };
      if (map[k] !== undefined) this.commands.push(map[k]);
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
    let throttleRate = (on('Shift') ? 0.6 : 0) - (on('Control') ? 0.6 : 0);
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
      const edges = [[0, 'crew'], [1, 'view'], [2, 'sas-next'], [3, 'gear'], [4, 'slower'], [5, 'faster'], [9, 'orbit']];
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
