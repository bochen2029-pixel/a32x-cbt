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
    // the recording (recording()): what the flight was started from, and the inputs that flew each step
    this.scenario = scenario || '';
    this.airframe = mod.UTF8ToString(mod._flight_airframe());
    this.build = mod.UTF8ToString(mod._flight_build());  // the commit this module was built from (core.h)
    this.rows = new Float64Array(1024 * this.inputNames.length);
    this.steps = 0;
  }

  // One row of the recording: the inputs that flew a step.
  record(values) {
    const n = this.inputNames.length;
    if ((this.steps + 1) * n > this.rows.length) {
      const grown = new Float64Array(this.rows.length * 2);
      grown.set(this.rows);
      this.rows = grown;
    }
    this.rows.set(values, this.steps * n);
    ++this.steps;
  }

  // The flight so far as law_harness --replay reads it (flight/harness/main.cpp, Recording): what it was
  // started from, who flew it - the scripted crew, or hands at the page's controls - and on which build,
  // then the input names, then the inputs that flew each step, a row a step, then the judge's verdict as
  // it stands, a "# judged: " line for each line of its debrief. extra adds lines the caller knows, by
  // name: the page gives {hands: the device, flown: the wall-clock time}. Saved, it is what a pilot hands
  // in: law_harness from the same build judges it as the page's judge did (--repeatable), and a later
  // build says which bands it would judge otherwise (--rejudge).
  recording(extra = {}) {
    const n = this.inputNames.length;
    const lines = [`# scenario: ${this.scenario}`, `# airframe: ${this.airframe}`, `# crew: ${this.scripted ? 'script' : 'hands'}`,
                   `# build: ${this.build}`];
    for (const [key, value] of Object.entries(extra)) {
      const ours = ['scenario', 'airframe', 'crew', 'build', 'judged'];
      if (!/^[a-z][a-z0-9_-]*$/.test(key) || ours.includes(key)) throw new Error(`no header line called ${key}`);
      lines.push(`# ${key}: ${String(value).replace(/[\r\n]+/g, ' ')}`);
    }
    lines.push(this.inputNames.join(','));
    for (let k = 0; k < this.steps; ++k) lines.push(Array.from(this.rows.subarray(k * n, (k + 1) * n), String).join(','));
    for (const line of this.debrief().split('\n')) if (line) lines.push(`# judged: ${line}`);
    return lines.join('\n') + '\n';
  }

  // The gate's judge as text (core.h, flight_debrief): a line a band, then STABLE, NOT STABLE or flying.
  debrief() {
    return this.mod.UTF8ToString(this.mod._flight_debrief());
  }

  // The inputs as the core holds them: the caller's last, or the scripted crew's own.
  inputs() {
    const at = this.mod._flight_inputs() / 8;
    return this.mod.HEAPF64.slice(at, at + this.inputNames.length);
  }

  // Runs ticks steps of 20 ms, and records the inputs that flew each. values, if given, are written to
  // the inputs first: an array in the core's input order, or an object by name; a scripted crew ignores
  // them, and is stepped one tick at a time so that what it did each tick is recorded.
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
    if (this.scripted) {
      let ran = 0;
      for (let k = 0; k < ticks; ++k) {
        ran += this.mod._flight_step(1);
        this.record(this.inputs());
      }
      return ran;
    }
    const row = this.inputs();  // what flies every one of these ticks
    const ran = this.mod._flight_step(ticks);
    for (let k = 0; k < ran; ++k) this.record(row);
    return ran;
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
