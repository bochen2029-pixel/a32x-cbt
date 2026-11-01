// One flight in one instance of the flight core's WebAssembly module (flight/harness/core.h): start
// it, step it with inputs, read its state. The worker routes messages here, and the module's tests in
// node call it directly. GPLv3.
//
// Slots are found by name, never by number: the names come from the module itself.

export class CoreSession {
  // mod: an instance from the module's factory (createFlightCore). airframe: 'a320', '737' or '' for the
  // default. scripted: the harness's own crew flies, or the caller's inputs do. scenario: where the
  // flight starts (core.h, flight_start_scenario: "approach;distance=10;wind=227/15"), or '' for the
  // runway.
  constructor(mod, airframe, scripted, scenario = '') {
    const rc = mod.ccall('flight_start_scenario', 'number', ['string', 'number', 'string'],
                         [airframe || '', scripted ? 1 : 0, scenario || '']);
    if (rc === -3) throw new Error(`the scenario '${scenario}' was not understood`);
    if (rc !== 0) throw new Error(`flight_start refused: ${rc} (one flight per module instance)`);
    this.mod = mod;
    this.scripted = Boolean(scripted);
    const list = (count, nameOf) => Array.from({ length: count() }, (_, i) => mod.UTF8ToString(nameOf(i)));
    this.inputNames = list(mod._flight_input_count, mod._flight_input_name);
    this.stateNames = list(mod._flight_state_count, mod._flight_state_name);
    this.input = Object.fromEntries(this.inputNames.map((n, i) => [n, i]));
    this.field = Object.fromEntries(this.stateNames.map((n, i) => [n, i]));
    this.texts = ['pitch_law', 'lateral_law', 'phase'];
  }

  // The inputs as the core holds them: the caller's last, or the scripted crew's own.
  inputs() {
    const at = this.mod._flight_inputs() / 8;
    return this.mod.HEAPF64.slice(at, at + this.inputNames.length);
  }

  // Runs ticks steps of 20 ms. values, if given, are written to the inputs first: an array in the
  // core's input order, or an object by name; a scripted crew ignores them.
  step(ticks, values) {
    if (values && !this.scripted) {
      const at = this.mod._flight_inputs() / 8;
      const heap = this.mod.HEAPF64;
      if (Array.isArray(values) || ArrayBuffer.isView(values)) {
        for (let i = 0; i < this.inputNames.length; ++i) heap[at + i] = values[i];
      } else {
        for (const [name, v] of Object.entries(values)) {
          if (!(name in this.input)) throw new Error(`no input called ${name}`);
          heap[at + this.input[name]] = v;
        }
      }
    }
    return this.mod._flight_step(ticks);
  }

  // The state after the last step, as numbers in the core's order.
  state() {
    const at = this.mod._flight_state() / 8;
    return this.mod.HEAPF64.slice(at, at + this.stateNames.length);
  }

  // The fields that are names: laws and phase.
  stateTexts() {
    const out = {};
    for (const n of this.texts) out[n] = this.mod.UTF8ToString(this.mod._flight_state_text(this.field[n]));
    return out;
  }
}
