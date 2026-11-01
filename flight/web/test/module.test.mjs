// The browser's module, the very file the page loads into its worker, run under node: the scripted
// crew flies it to a landing, its inputs replayed into a second instance give the same state on every
// tick, and a tick costs far less than the 20 ms it has. GPLv3.
//
// FLIGHT_CORE_JS names the module (flight_core.js from the WebAssembly build). Without it these tests
// are skipped, and say so.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { CoreSession } from '../src/core-session.js';

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
