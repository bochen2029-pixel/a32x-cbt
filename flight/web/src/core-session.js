// One flight in one instance of the flight core's WebAssembly module (flight/harness/core.h): start
// it, step it with inputs, read its state; or open a recording and fly it again (Replay). The worker
// routes messages here, and the module's tests in node call it directly. GPLv3.
//
// Slots are found by name, never by number: the names come from the module itself.

// The build a recording was flown on when it does not say: v0.1.0's, the last release whose recordings had no
// build line (fbw-parent's ruling, 2026-11-01; flight/harness/main.cpp, kUnnamedBuild).
export const UNNAMED_BUILD = '1a672e9';

// A recording (CoreSession.recording; flight/harness/main.cpp, Recording) read back as law_harness --replay reads
// it: the "# key: value" lines before the column names, the column names, a row of inputs a step, and among or
// after the rows the judge's verdict when it was saved, its "# judged: " lines; other lines that begin with '#'
// are passed over, as law_harness passes over them. Throws, saying which line and why, for what law_harness would
// not replay either: no column names, a row with another number of values, a value that is not a number. Blank
// lines may end the text, not interrupt the rows; a line may end in CR LF.
export function parseRecording(text) {
  const lines = String(text).split('\n').map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l));
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  const header = Object.create(null);
  let at = 0;
  for (; at < lines.length && lines[at].startsWith('#'); ++at) {
    const m = /^# ([a-z][a-z0-9_-]*): ?(.*)$/.exec(lines[at]);
    if (m) header[m[1]] = m[2];
  }
  if (at >= lines.length || !lines[at]) throw new Error('it has no column names: it is not a recording');
  const columns = lines[at].split(',');
  const n = columns.length;
  const judged = [];
  let rows = new Float64Array(1024 * n), count = 0;
  for (let k = at + 1; k < lines.length; ++k) {
    const l = lines[k];
    if (l.startsWith('#')) {
      if (l.startsWith('# judged: ')) judged.push(l.slice(10));
      continue;
    }
    if (!l) throw new Error(`line ${k + 1} is blank, among the rows`);
    const values = l.split(',');
    if (values.length !== n) throw new Error(`line ${k + 1} has ${values.length} values where the columns name ${n}`);
    if ((count + 1) * n > rows.length) {
      const grown = new Float64Array(rows.length * 2);
      grown.set(rows);
      rows = grown;
    }
    for (let i = 0; i < n; ++i) {
      const v = Number(values[i]);
      if (!Number.isFinite(v) || !values[i].trim()) throw new Error(`line ${k + 1}: '${values[i]}' is not a number`);
      rows[count * n + i] = v;
    }
    ++count;
  }
  return { header, columns, rows: rows.subarray(0, count * n), count, judged };
}

// What a replay says of the build it flies on, beside the page's own (flight.js, buildNote). Flown and replayed on
// the same build, a commit's, the replay is the very flight. Another build may fly it otherwise, and its verdict
// is not the gate's, which judges a recording by the law_harness of the recording's own commit (flight/README.md,
// Flying the gate); nor is that of a build made from uncommitted changes or unable to name its commit. named:
// whether the recording has a build line; without one it counts as v0.1.0's.
export function replayNote(build, here, named = true) {
  const clean = (b) => String(b).replace(/[^A-Za-z0-9.+_-]/g, '');
  const was = clean(build), is = clean(here);
  const flownOn = named ? `build ${was}` : `build ${was} (it has no build line: v0.1.0's)`;
  if (build !== here) {
    return { text: `flown on ${flownOn}, replayed on build ${is}: it may fly otherwise here, and this verdict is not the gate's`, warn: true };
  }
  if (/\+dirty$|^unknown$/.test(was)) return { text: `flown and replayed on build ${was}, not a commit's: not for the gate`, warn: true };
  return { text: `flown on this build, ${was}: the replay is the flight itself`, warn: false };
}

// A band's verdict in a line of the judge's debrief (judge.cpp; main.cpp, bandLine): pass, FAIL or '....' while
// it cannot be judged yet, two spaces, then the band's name, up to " - ".
function bandOf(line) {
  const m = /^\s*(pass|FAIL|\.\.\.\.) {2}(.+?)(?: - .*)?$/.exec(line);
  return m ? { status: m[1], name: m[2] } : null;
}

// A replay's verdict against the one its recording was saved with, a debrief line each: the same line for line
// when the replay flew the very flight (house rule 7); and every band whose verdict differs, as law_harness
// --rejudge names them, and the verdict line if it differs. A band not judged on either side is passed over.
// comparable: the recording was saved with a verdict (recordings older than 0.1.1 were not).
export function compareVerdicts(saved, replayed) {
  const same = saved.length > 0 && saved.length === replayed.length && saved.every((l, i) => l === replayed[i]);
  const statuses = (lines) => {
    const m = new Map();
    for (const l of lines) {
      const b = bandOf(l);
      if (b) m.set(b.name, b.status);
    }
    return m;
  };
  const now = statuses(replayed), changed = [];
  for (const [name, was] of statuses(saved)) {
    const is = now.get(name);
    if (is !== undefined && was !== '....' && is !== '....' && is !== was) changed.push(`${name}: ${was} when flown, ${is} here`);
  }
  const last = (lines) => (lines.length ? lines[lines.length - 1] : '');
  if (saved.length && last(saved) !== last(replayed)) changed.push(`the verdict: ${last(saved)} when flown, ${last(replayed)} here`);
  return { comparable: saved.length > 0, same, changed, saved, replayed };
}

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
    // who flies it (core.h, flight_crew): script, hands, or a driver's name when the scripted crew's flare waits for
    // one (flare=external;driver=NAME); a module older than flight_crew knows only the first two
    this.crew = mod._flight_crew ? mod.UTF8ToString(mod._flight_crew()) : scripted ? 'script' : 'hands';
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
    const lines = [`# scenario: ${this.scenario}`, `# airframe: ${this.airframe}`, `# crew: ${this.crew}`,
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

  // A command to the scripted crew (core.h, flight_command): "flare" begins its flare at the next step, where the
  // flare waits for one (flare=external). Whether it was taken.
  command(name) {
    return this.mod.ccall('flight_command', 'number', ['string'], [String(name)]) === 1;
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

// A recording flown again in a fresh instance of the module, as law_harness --replay flies one: the core started
// from the recording's scenario and airframe, its rows the crew, a row a tick, nothing from the page's hands. Its
// session is an ordinary CoreSession, read as any other. Refused before the core starts when its columns are not
// this core's inputs, so the instance it was given is left unflown.
export class Replay {
  constructor(mod, text) {
    this.text = String(text);  // as it was opened: what a replay hands back when asked for its recording
    this.recording = parseRecording(this.text);
    const names = Array.from({ length: mod._flight_input_count() }, (_, i) => mod.UTF8ToString(mod._flight_input_name(i)));
    if (this.recording.columns.join(',') !== names.join(',')) {
      throw new Error(`its columns are not this core's inputs (${names.join(',')})`);
    }
    const h = this.recording.header;
    // a recording older than its scenario and airframe lines flies from the runway on the default airframe, as
    // law_harness --replay flies one without --scenario and FLIGHT_AIRFRAME
    this.session = new CoreSession(mod, h.airframe || '', false, h.scenario || '');
    this.build = 'build' in h ? h.build : UNNAMED_BUILD;
    this.at = 0;
  }

  get steps() {
    return this.recording.count;
  }

  get ended() {
    return this.at >= this.recording.count;
  }

  // Flies up to ticks rows, a tick each; returns how many it flew: none once the recording has ended.
  step(ticks) {
    const n = this.recording.columns.length, rows = this.recording.rows;
    let ran = 0;
    while (ran < ticks && this.at < this.recording.count) {
      this.session.step(1, rows.subarray(this.at * n, (this.at + 1) * n));
      ++this.at;
      ++ran;
    }
    return ran;
  }

  // What the recording says of itself, for the page: where and on what it was flown, by whom, on which build, how
  // many steps, whether it was saved with a verdict, and a plain note on the build (replayNote).
  info() {
    const h = this.recording.header;
    return {
      scenario: h.scenario || '', airframe: this.session.airframe, crew: h.crew || '', hands: h.hands || '',
      flown: h.flown || '', build: this.build, sameBuild: this.build === this.session.build, steps: this.steps,
      judged: this.recording.judged.length > 0, note: replayNote(this.build, this.session.build, 'build' in h),
    };
  }

  // The verdict as the replay stands against the one the recording was saved with (compareVerdicts).
  verdict() {
    return compareVerdicts(this.recording.judged, this.session.debrief().split('\n').filter(Boolean));
  }

  // How far it has flown; once it has ended, its verdict too.
  progress() {
    return { at: this.at, steps: this.steps, ended: this.ended, ...(this.ended ? { verdict: this.verdict() } : {}) };
  }
}
