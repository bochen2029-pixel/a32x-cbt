// The browser's module, the very file the page loads into its worker, run under node: the scripted
// crew flies it to a landing, its inputs replayed into a second instance give the same state on every
// tick, and a tick costs far less than the 20 ms it has; a recording the page saves opens again in the
// page and replays to the identical debrief, as law_harness judges it. GPLv3.
//
// FLIGHT_CORE_JS names the module (flight_core.js from the WebAssembly build). Without it these tests
// are skipped, and say so.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { CoreSession, Replay, UNNAMED_BUILD } from '../src/core-session.js';

const path = process.env.FLIGHT_CORE_JS;
const skip = !path || !existsSync(path) ? 'FLIGHT_CORE_JS does not name a built flight_core.js' : false;
const createFlightCore = skip ? null : createRequire(import.meta.url)(path);
const airframe = process.env.FLIGHT_AIRFRAME || '';  // as for every other case: the default, or the 737

const kTicks = 18 * 60 * 50;  // eighteen minutes: the scripted circuit's first landing comes at about 17

// FNV-1a over a Float64Array's bytes, folded into a running hash.
function fold(h, values) {
  const bytes = new Uint8Array(values.buffer, values.byteOffset, values.byteLength);
  for (const b of bytes) h = Math.imul(h ^ b, 16777619) >>> 0;
  return h;
}

// Steps a session tick by tick; returns the state hash, the first touchdown and what each tick cost.
// The hash leaves out the phase, which only the scripted crew keeps; everything the aircraft does is in.
function fly(session, inputsFor) {
  const f = session.field;
  let hash = 2166136261, airborne = false, lastVs = 0, touchdown = null, ms = 0;
  const recorded = [];
  for (let k = 0; k < kTicks; ++k) {
    const t0 = performance.now();
    session.step(1, inputsFor ? inputsFor(k) : undefined);
    ms += performance.now() - t0;
    if (!inputsFor) recorded.push(session.inputs());
    const s = session.state();
    s[f.phase] = 0;
    hash = fold(hash, s);
    if (!s[f.on_ground]) airborne = true;
    if (airborne && s[f.on_ground] && !touchdown) {
      touchdown = { t: s[f.t_s], sinkFpm: lastVs, pitch: s[f.pitch_deg], cas: s[f.cas_kn] };
    }
    if (!s[f.on_ground]) lastVs = s[f.vs_fpm];
    assert.equal(s[f.crashed], 0, `the airframe went into the ground at ${s[f.t_s]} s`);
  }
  return { hash, touchdown, msPerTick: ms / kTicks, recorded };
}

test('the module names its slots and refuses a second flight', { skip }, async () => {
  const mod = await createFlightCore();
  const s = new CoreSession(mod, airframe, false);
  assert.ok(s.inputNames.includes('pitch') && s.inputNames.includes('rudder_trim'));
  assert.ok(s.stateNames.includes('lat_deg') && s.stateNames.includes('pitch_law'));
  assert.throws(() => new CoreSession(mod, airframe, false), /refused/);
  s.step(150);
  assert.equal(s.state()[s.field.healthy], 1, 'every computer healthy after three seconds');
  assert.equal(s.stateTexts().phase, 'crew');
});

test('the scripted crew lands it, and a replay into a second instance matches tick for tick', { skip }, async () => {
  const scripted = new CoreSession(await createFlightCore(), airframe, true);
  const a = fly(scripted);
  assert.ok(a.touchdown, 'a landing within eighteen minutes');
  assert.ok(a.touchdown.sinkFpm > -360, `touched down at ${a.touchdown.sinkFpm.toFixed(0)} fpm`);
  console.log(`  scripted: touchdown at ${a.touchdown.t.toFixed(2)} s, ${a.touchdown.sinkFpm.toFixed(1)} fpm, ` +
              `pitch ${a.touchdown.pitch.toFixed(2)} deg, ${a.touchdown.cas.toFixed(1)} kt; ` +
              `${(a.msPerTick * 1000).toFixed(0)} us a tick`);

  const replay = new CoreSession(await createFlightCore(), airframe, false);
  const b = fly(replay, (k) => a.recorded[k]);
  assert.deepEqual(b.touchdown, a.touchdown, 'the same touchdown');
  assert.equal(b.hash, a.hash, 'the same state, every tick, to the last bit');
  assert.ok(a.msPerTick < 5, `a tick costs ${a.msPerTick.toFixed(3)} ms of its 20`);
});

test('the page records its flight as law_harness reads it, and the recording replays to the same verdict', { skip }, async () => {
  const scenario = 'approach;distance=5';  // the 1,000 ft window entered with the FAC's VLS valid
  const flown = new CoreSession(await createFlightCore(), airframe, true, scenario);
  const ticks = 220 * 50;  // to the stop
  for (let done = 0; done < ticks; done += 50) flown.step(50);
  const text = flown.recording();
  const lines = text.split('\n');
  assert.equal(lines.pop(), '', 'ends with a newline');
  assert.equal(lines[0], `# scenario: ${scenario}`);
  assert.match(lines[1], /^# airframe: (a320|737)$/, 'the airframe the core flew, the default resolved');
  if (airframe) assert.equal(lines[1], `# airframe: ${airframe}`);
  assert.equal(lines[2], '# crew: script', 'and who flew it');
  assert.match(lines[3], /^# build: ([0-9a-f]{7}(\+dirty)?|unknown)$/, 'on which build: the commit it was built from');
  assert.equal(lines[3], `# build: ${flown.build}`);
  assert.equal(lines[4], flown.inputNames.join(','));
  const verdict = flown.debrief();
  assert.match(verdict, /\nSTABLE\n$/, `the scripted crew's approach is stable:\n${verdict}`);
  const judged = verdict.split('\n').filter(Boolean).map((l) => `# judged: ${l}`);
  assert.deepEqual(lines.slice(-judged.length), judged, 'and it ends with the judge\'s verdict, a line of the debrief each');
  const rows = lines.slice(5, -judged.length);
  assert.equal(rows.length, ticks, 'a row a step between them');
  assert.equal(flown.steps, ticks);

  // into a fresh instance, as a pilot's: on the airframe and from the start the header names
  const replay = new CoreSession(await createFlightCore(), lines[1].slice(12), false, lines[0].slice(12));
  for (const line of rows) replay.step(1, line.split(',').map(Number));
  const a = flown.state(), b = replay.state();
  a[flown.field.phase] = b[replay.field.phase] = 0;  // only the scripted crew keeps a phase
  assert.deepEqual(Array.from(b), Array.from(a), 'the same state, slot for slot');
  assert.equal(replay.debrief(), verdict, 'and the same verdict from the gate\'s judge');
  assert.equal(replay.recording(), text.replace('# crew: script', '# crew: hands'),
               'and its own recording is the same file, flown by the caller this time');
  const saved = replay.recording({ hands: 'a joystick', flown: '2026-11-01T18:30Z' }).split('\n');
  assert.deepEqual(saved.slice(2, 6), ['# crew: hands', `# build: ${replay.build}`, '# hands: a joystick', '# flown: 2026-11-01T18:30Z'],
                   'with what the page knows: the device and when');
  assert.throws(() => replay.recording({ crew: 'script' }), /no header line called crew/, 'and nobody rewrites who flew it');
  assert.throws(() => replay.recording({ build: 'abcdef0' }), /no header line called build/, 'nor on which build');
  assert.throws(() => replay.recording({ judged: 'STABLE' }), /no header line called judged/, 'nor what was judged');
});

// A recording saved by the page, opened again in the page (core-session.js, Replay): its rows flown through a fresh
// instance as law_harness --replay flies them, to the debrief it was saved with, line for line, and the same state
// (house rule 7). Then the same file judged by the law_harness built beside this module, of the same build.
test('a recording saved by the page replays in the page to the identical debrief, and law_harness agrees', { skip }, async (t) => {
  const scenario = 'approach;distance=5';
  const flown = new CoreSession(await createFlightCore(), airframe, true, scenario);
  for (let done = 0; done < 220 * 50; done += 50) flown.step(50);
  const extra = { hands: 'a joystick', flown: '2026-11-01T22:40Z' };
  const text = flown.recording(extra);

  const replay = new Replay(await createFlightCore(), text);
  const info = replay.info();
  assert.deepEqual([info.scenario, info.airframe, info.crew, info.hands, info.flown, info.steps],
                   [scenario, flown.airframe, 'script', extra.hands, extra.flown, flown.steps],
                   'it says where, on what and by whom it was flown, and for how long');
  assert.equal(info.build, flown.build);
  assert.equal(info.sameBuild, true, 'flown on this very build');
  assert.equal(info.judged, true, 'and saved with its verdict');
  assert.equal(replay.progress().ended, false);
  const sizes = [1, 7, 50, 333];  // flown in pieces of every size the page might ask for
  for (let k = 0; !replay.ended; ++k) replay.step(sizes[k % sizes.length]);
  assert.equal(replay.at, flown.steps, 'to the last row');
  assert.equal(replay.step(25), 0, 'and no further: nothing flies once the recording has ended');
  const v = replay.progress().verdict;
  assert.equal(v.same, true, `the debrief it was saved with, line for line:\n${v.replayed.join('\n')}`);
  assert.deepEqual(v.changed, []);
  assert.equal(replay.session.debrief(), flown.debrief(), 'the judge saying it in the same words');
  const a = flown.state(), b = replay.session.state();
  a[flown.field.phase] = b[replay.session.field.phase] = 0;  // only the scripted crew keeps a phase
  assert.deepEqual(Array.from(b), Array.from(a), 'and it ends in the same state, slot for slot');

  // another build's copy opens and says so; one older than build lines counts as v0.1.0's, with no verdict to compare
  const other = new Replay(await createFlightCore(), text.replace(`# build: ${flown.build}\n`, '# build: 0000000\n'));
  assert.equal(other.info().sameBuild, false);
  assert.equal(other.info().note.warn, true);
  assert.match(other.info().note.text, /0000000.*not the gate's/);
  const bare = text.split('\n').filter((l) => !l.startsWith('# build: ') && !l.startsWith('# judged: ')).join('\n');
  const old = new Replay(await createFlightCore(), bare);
  assert.deepEqual([old.info().build, old.info().judged], [UNNAMED_BUILD, false]);

  // another core's columns: refused before the core starts, the instance it was given left unflown
  const mod = await createFlightCore();
  assert.throws(() => new Replay(mod, text.replace('pitch,roll,', 'roll,pitch,')), /columns are not this core's inputs/);
  assert.doesNotThrow(() => new CoreSession(mod, airframe, false, scenario), 'the instance is still unflown');

  // the same file judged by the law_harness built beside this module: every band word for word, the same verdict
  const lawHarness = join(dirname(path), 'law_harness.js');
  if (!existsSync(lawHarness)) {
    t.diagnostic(`no ${lawHarness}: the cross-check with law_harness is skipped`);
    return;
  }
  const file = join(tmpdir(), `replay-${process.pid}.csv`);
  writeFileSync(file, text);
  try {
    const run = spawnSync(process.execPath, [lawHarness, '--replay', file, '--expect', 'ils'], { encoding: 'utf8', timeout: 300000 });
    assert.equal(run.error, undefined, String(run.error));
    const out = run.stdout.split('\n');
    for (const line of v.saved.filter((l) => /^ {2}(pass|FAIL) {2}/.test(l))) {
      assert.ok(out.includes(line), `law_harness --replay judges it so too: ${line}\n${run.stdout}`);
    }
    const word = v.saved[v.saved.length - 1];
    assert.ok(out.some((l) => l.startsWith(`judge: ${word}`)), `and gives the same verdict, ${word}:\n${run.stdout}`);
  } finally {
    rmSync(file, { force: true });
  }
});

test('from an approach start the scripted crew flies the ILS onto the runway it reports', { skip }, async () => {
  const s = new CoreSession(await createFlightCore(), airframe, true, 'approach;wind=270/15');
  const f = s.field;
  let state = s.state();
  assert.equal(state[f.rwy_heading_deg], 180.3, 'KDFW 17C, the main airport');
  assert.ok(Math.abs(state[f.thr_along_m] / 1852 - 10) < 0.01 && state[f.loc_valid] && state[f.gs_valid], 'on both beams at 10 nm');
  let touchdown = null, worstLoc = 0, worstGs = 0, lastVs = 0;
  for (let k = 0; k < 6 * 60 * 50 && !touchdown; ++k) {
    s.step(1);
    state = s.state();
    const ft = state[f.thr_height_ft];
    if (ft <= 1000 && ft >= 50) {
      worstLoc = Math.max(worstLoc, Math.abs(state[f.loc_dots]));
      worstGs = Math.max(worstGs, Math.abs(state[f.gs_dots]));
    }
    if (state[f.on_ground]) touchdown = { past: -state[f.thr_along_m], off: state[f.thr_right_m], sinkFpm: lastVs };
    lastVs = state[f.vs_fpm];
  }
  assert.ok(touchdown, 'it lands within six minutes');
  console.log(`  ILS in a 15 kt crosswind: worst ${worstLoc.toFixed(2)} dots LOC, ${worstGs.toFixed(2)} dots G/S from 1,000 ft to ` +
              `50 ft; touchdown ${touchdown.past.toFixed(0)} m past the threshold, ${touchdown.off.toFixed(1)} m off the ` +
              `centreline, ${touchdown.sinkFpm.toFixed(0)} fpm`);
  assert.ok(worstLoc <= 1 && worstGs <= 1, 'within a dot of both beams');
  assert.ok(touchdown.past >= 300 && touchdown.past <= 900 && Math.abs(touchdown.off) <= 5, 'in the touchdown zone, on the centreline');
  assert.ok(touchdown.sinkFpm > -360, 'at a normal sink rate');
});
