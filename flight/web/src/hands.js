// The pilot's hands: a joystick or gamepad through the Gamepad API, first; the keyboard as the
// fallback. Each device's mapping and calibration are kept between sessions, by the device's own id.
// GPLv3.
//
//   M   learn this device's mapping, control by control (Enter confirms, Escape skips)
//   C   calibrate: stir every control to its ends, then C again
//   H   the keys, on screen

import { calibrate, learn, readAxes, readButtons, standardGamepad, startLearning, STEPS, unknownDevice } from './mapping.js';

// The keyboard, when nothing better is plugged in. Held keys drive the stick and pedals at a rate and
// let them spring back; the rest are the same actions a button can have.
const KEY_ACTIONS = {
  KeyB: 'brakes', KeyP: 'parkingBrake', KeyS: 'speedbrake', KeyA: 'spoilersArm', KeyR: 'flapsUp',
  KeyF: 'flapsDown', KeyG: 'gear', PageUp: 'thrustUp', PageDown: 'thrustDown', KeyT: 'rudderTrimLeft',
  KeyY: 'rudderTrimRight', KeyU: 'rudderTrimReset', Home: 'pitchTrimDown', End: 'pitchTrimUp',
};
const KEY_AXES = {
  pitch: { plus: 'ArrowDown', minus: 'ArrowUp' },      // down arrow pulls
  roll: { plus: 'ArrowRight', minus: 'ArrowLeft' },
  pedals: { plus: 'KeyZ', minus: 'KeyX' },             // Z left rudder, the core's +
};
const KEY_RATE = 1.5, KEY_RETURN = 4;  // stick travel per second while held, and springing back

export const KEY_HELP = [
  'arrows  stick (down pulls)', 'Z X  rudder', 'PgUp PgDn  thrust levers', 'R F  flaps up / down',
  'G  gear', 'B  brakes (held)', 'P  parking brake', 'S  speedbrake', 'A  ground spoilers arm',
  'T Y  RUD TRIM left / right', 'U  RUD TRIM RESET', 'Home End  pitch trim wheel, nose down / up', 'M  map the joystick', 'C  calibrate it', 'H  hide this',
];

const STORE = 'a32x.flight.device:';

function load(id) {
  try {
    const text = globalThis.localStorage?.getItem(STORE + id);
    return text ? JSON.parse(text) : null;
  } catch {
    return null;  // no storage (a private window, a blocked file:// origin): the defaults, each session
  }
}

function save(id, mapping) {
  try {
    globalThis.localStorage?.setItem(STORE + id, JSON.stringify(mapping));
    return true;
  } catch {
    return false;
  }
}

export class Hands {
  constructor(target) {
    this.keys = new Set();
    this.keysPressed = new Set();
    this.kb = { pitch: 0, roll: 0, pedals: 0 };
    this.pad = null;          // {id, index, mapping, standard}
    this.lastButtons = [];
    this.mode = 'fly';        // 'learn', 'calibrate'
    this.learning = null;
    this.cal = null;
    this.help = false;
    this.message = '';
    target.addEventListener('keydown', (e) => {
      if (!e.repeat) {
        this.keys.add(e.code);
        this.keysPressed.add(e.code);
      }
      if (e.code in KEY_ACTIONS || e.code.startsWith('Arrow') || e.code.startsWith('Page')) e.preventDefault();
    });
    target.addEventListener('keyup', (e) => this.keys.delete(e.code));
    target.addEventListener('blur', () => this.keys.clear());
  }

  // The device: the first connected gamepad. A new one brings its kept mapping, or a default.
  findPad() {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? [...navigator.getGamepads()] : [];
    const pad = pads.find((p) => p && p.connected) || null;
    if (!pad) {
      this.pad = null;
      return null;
    }
    if (!this.pad || this.pad.id !== pad.id) {
      const standard = pad.mapping === 'standard';
      const kept = load(pad.id);
      this.pad = { id: pad.id, standard, mapping: kept || (standard ? standardGamepad() : unknownDevice()), kept: Boolean(kept) };
      this.lastButtons = [];
      this.message = kept ? 'its mapping, as kept' : standard ? 'a standard gamepad: the default mapping' : 'press M to map it';
    }
    return pad;
  }

  // One frame of hands: {axes, held, pressed}, ready for controls.apply. dt: seconds since the last.
  read(dt) {
    const pad = this.findPad();
    const snapshot = pad ? { axes: [...pad.axes], buttons: pad.buttons.map((b) => b.pressed || b.value > 0.5) } : null;
    const padPressed = snapshot ? snapshot.buttons.flatMap((b, i) => (b && !this.lastButtons[i] ? [i] : [])) : [];
    if (snapshot) this.lastButtons = snapshot.buttons;
    const typed = this.keysPressed;
    this.keysPressed = new Set();

    if (typed.has('KeyH')) this.help = !this.help;
    if (typed.has('KeyM') && snapshot && this.mode === 'fly') {
      this.mode = 'learn';
      this.learning = startLearning();
    } else if (typed.has('KeyC') && snapshot) {
      this.toggleCalibration(snapshot);
    }

    // While the device is being learned or calibrated the aircraft gets no hands: a button pressed to
    // answer the wizard must not also drop the gear.
    if (this.mode === 'learn') {
      this.learning = learn(this.learning, snapshot || { axes: [], buttons: [] }, padPressed,
                            { confirm: typed.has('Enter'), skip: typed.has('Escape') });
      if (this.learning.done) {
        this.pad.mapping = this.learning.mapping;
        this.pad.kept = save(this.pad.id, this.pad.mapping);
        this.message = this.pad.kept ? 'mapped, and kept for next time' : 'mapped (this browser keeps nothing)';
        this.mode = 'fly';
      }
      return { axes: {}, held: new Set(), pressed: new Set() };
    }
    if (this.mode === 'calibrate') {
      snapshot.axes.forEach((v, i) => {
        this.cal.lows[i] = Math.min(this.cal.lows[i], v);
        this.cal.highs[i] = Math.max(this.cal.highs[i], v);
      });
      return { axes: {}, held: new Set(), pressed: new Set() };
    }

    const axes = snapshot ? readAxes(this.pad.mapping, snapshot) : {};
    const held = snapshot ? readButtons(this.pad.mapping, snapshot) : new Set();
    const pressed = new Set();
    if (snapshot) {
      for (const [action, index] of Object.entries(this.pad.mapping.buttons)) if (padPressed.includes(index)) pressed.add(action);
    }
    for (const [code, action] of Object.entries(KEY_ACTIONS)) {
      if (this.keys.has(code)) held.add(action);
      if (typed.has(code)) pressed.add(action);
    }
    // keyboard axes: a held key wins over the device's axis; otherwise the device has it
    for (const [name, k] of Object.entries(KEY_AXES)) {
      const want = (this.keys.has(k.plus) ? 1 : 0) - (this.keys.has(k.minus) ? 1 : 0);
      const v = this.kb[name];
      this.kb[name] = want ? Math.max(-1, Math.min(1, v + want * KEY_RATE * dt))
                           : Math.sign(v) * Math.max(0, Math.abs(v) - KEY_RETURN * dt);
      if (want || axes[name] === undefined) axes[name] = this.kb[name];
    }
    return { axes, held, pressed };
  }

  toggleCalibration(snapshot) {
    if (this.mode !== 'calibrate') {
      this.mode = 'calibrate';
      this.cal = { centres: snapshot.axes.slice(), lows: snapshot.axes.slice(), highs: snapshot.axes.slice() };
      return;
    }
    this.pad.mapping = calibrate(this.pad.mapping, this.cal.centres, this.cal.lows, this.cal.highs);
    this.pad.kept = save(this.pad.id, this.pad.mapping);
    this.message = this.pad.kept ? 'calibrated, and kept for next time' : 'calibrated (this browser keeps nothing)';
    this.mode = 'fly';
  }

  // What the pilot should be told now.
  prompt() {
    if (this.mode === 'learn') {
      const step = STEPS[this.learning.step];
      return `MAP ${this.learning.step + 1}/${STEPS.length}: ${step.ask}${this.learning.note ? `\n  ${this.learning.note}` : ''}`;
    }
    if (this.mode === 'calibrate') return 'CALIBRATE: move every control to both ends, centre the stick, then press C';
    if (!this.pad) return 'keyboard (H for keys); press a button on a joystick to use it';
    return `${this.pad.id.slice(0, 48)} — ${this.message}`;
  }
}
