// law_harness --pipe, driven as a driver outside the harness drives it (main.cpp, pipeFrame; the Jev landing
// experiment, flight/README.md): in lockstep, a frame every tenth of a second, the flare commanded once the true
// height is below 31 ft. The formula takes no part, the command is taken once, the judge's verdict comes in the end
// line, the recording says who flew it, and the same answers give the same bytes. GPLv3.
//
//   node pipe_test.mjs <law_harness> <a scratch directory>

import { spawn } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

const [exe, scratch] = process.argv.slice(2);
let failures = 0;
const check = (ok, what, value = '') => {
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${what}${value === '' ? '' : ` (${value})`}`);
  if (!ok) ++failures;
};

// One flight through the pipe. answers: the answer to each frame when replaying a run; otherwise the driver
// decides. Returns everything law_harness printed, the frames, and the answers it was given.
async function fly(record, answers = null) {
  const child = spawn(exe, ['--scenario', 'approach;flare=external;driver=jev', '--pipe', '--minutes', '6', '--record', record]);
  const lines = [];  // the protocol's, header to end line: the report after it carries wall-clock time
  const frames = [];
  const given = [];
  let header = null, end = null, commandedAt = -1;
  for await (const line of createInterface({ input: child.stdout })) {
    if (end) continue;  // the report, as text
    lines.push(line);
    const f = JSON.parse(line);
    if (!header) {
      header = f;
      continue;
    }
    if (f.end) {
      end = f;
      continue;
    }
    frames.push(f);
    let answer = 'go';
    if (answers) {
      answer = answers[frames.length - 1];
    } else if (f.judge_stable !== null) {
      answer = 'quit';
    } else if (commandedAt < 0 && f.height_true_ft < 31) {
      answer = 'flare';
      commandedAt = frames.length - 1;
    } else if (commandedAt >= 0 && frames.length - 1 === commandedAt + 3) {
      answer = 'flare';  // again, once flaring: not taken
    }
    given.push(answer);
    child.stdin.write(`${answer}\n`);
  }
  const code = await new Promise((resolve) => child.on('close', resolve));
  return { text: lines.join('\n'), header, frames, end, given, code };
}

const recordA = join(scratch, `pipe-a-${process.pid}.csv`), recordB = join(scratch, `pipe-b-${process.pid}.csv`);
try {
  const a = await fly(recordA);
  const h = a.header;
  check(h.pipe === 1 && h.crew === 'jev' && h.every === 5 && h.dt === 0.02, 'the header: the pipe, its driver, a frame every 5 ticks of 20 ms',
        `${h.crew}, ${h.every}, ${h.dt}`);
  check(h.runway === 'KDFW 17C' && h.glide_deg === 3 && h.tch_ft === 50 && h.tdze_ft === 562,
        'and the runway it is judged on: its glide, threshold crossing height and touchdown zone elevation', h.runway);
  check(a.frames.every((f, k) => Math.abs(f.t_s - 0.1 * k) < 1e-9), 'a frame every tenth of a second, from the start', a.frames.length);
  const f0 = a.frames[0];
  check(['ra_ft', 'ra2_ft', 'height_true_ft', 'vs_fpm', 'gamma_deg', 'gs_kn', 'loc_dots', 'gs_dots', 'wind_head_kn', 'wind_cross_kn']
    .every((k) => typeof f0[k] === 'number'), 'each frame the state by name: the heights, the beams, the wind', Object.keys(f0).length);
  const f1 = a.frames[300];
  check(f0.phase === 'approach' && f0.pitch_law === 'none' && f1.pitch_law === 'normal' && f1.flare_by === 'none',
        'and the names as words: no law before the computers have run, normal law at 30 s', f1.pitch_law);
  const passing = a.frames.filter((f) => f.height_true_ft < 33 && f.height_true_ft >= 31);
  check(passing.length > 0 && passing.every((f) => f.flare_by === 'none'), 'the formula takes no part: no flare from 33 ft to 31',
        passing.length);
  const k = a.given.indexOf('flare');
  const after = a.frames[k + 1];
  check(k > 0 && a.frames[k].height_true_ft < 31 && after.command_taken === true && after.flare_by === 'command' && after.flaring === 1,
        'the flare commanded below 31 ft is taken, and has begun by the next frame', a.frames[k]?.height_true_ft);
  const again = a.given.indexOf('flare', k + 1);
  check(again > k && a.frames[again + 1].command_taken === false, 'a second command, once flaring, is not taken', again);
  check(a.end?.flare_by === 'command' && a.end.judge === 'STABLE' && a.end.touchdown_t_s > 0 && a.end.touchdown_past_m > 300,
        'the end line: what began the flare, the touchdown and the judge\'s verdict', `${a.end?.judge}, ${a.end?.touchdown_past_m}`);
  check(a.given[a.given.length - 1] === 'quit' && a.code === 0, 'quit ends it, the report after the end line', a.code);
  check(/^# crew: jev$/m.test(readFileSync(recordA, 'utf8')), 'the recording says the scripted crew\'s flare was jev\'s', '# crew: jev');

  const b = await fly(recordB, a.given);
  check(b.text === a.text, 'the same answers give the same bytes, header to end line', `${a.text.length} characters`);
  check(readFileSync(recordB, 'utf8') === readFileSync(recordA, 'utf8'), 'and the same recording');
} finally {
  rmSync(recordA, { force: true });
  rmSync(recordB, { force: true });
}
console.log(failures ? 'FAILED' : 'PASSED');
process.exit(failures ? 1 : 0);
