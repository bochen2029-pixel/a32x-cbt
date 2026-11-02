// A saved recording opened in the page and replayed through the core: chosen with Ctrl+O or the panel's button, or
// dropped on the page; carried across a reload of the page, which then starts the flight from the recording's own
// scenario and airframe (the worker's replay, core-session.js) and draws that flight's runway, as it would its own;
// flown at a dozen times its pace, then the debrief over the whole of it, the replay's verdict set against the one
// saved with the recording. Plain functions: node tests them. GPLv3.

import { heightFt } from './scene-math.js';

export const STORE = 'a32x-replay';      // sessionStorage: the recording, packed (pack), and its file's name
export const REPLAY_TICKS = 13;           // the ticks a frame asks for in a replay, 0.26 s of the flight: a dozen times
                                          // its pace at 50 frames a second, and every frame a sample for the view,
                                          // which keeps one each quarter second of the flight (view.js, record)
export const REPLAY_FLARE_FT = 60;        // below this, in the air, a replay steps a tick a frame (replayTicks)

// The ticks a replay's frame asks for, given the state it last flew: REPLAY_TICKS; but one, as the flight itself was
// seen, in the air below REPLAY_FLARE_FT, so that the log's touchdown, whose sink and pitch are the last sample's in
// the air (events.js), is the touchdown's own and not a quarter second before it, and while a reverser's doors move,
// so that its deployed and stowed lines fall where the flight's did. The flare plays at its own pace; the doors take
// two seconds each way. A state not known yet flies REPLAY_TICKS.
export function replayTicks(s) {
  if (!s) return REPLAY_TICKS;
  const transit = (v) => v > 0.001 && v < 0.999;
  const flare = !(s.on_ground > 0.5) && heightFt(s) < REPLAY_FLARE_FT;   // the true height: an RA may have failed
  return flare || transit(s.reverser_1) || transit(s.reverser_2) ? 1 : REPLAY_TICKS;
}

// Whether a text is a recording as the page saves one (core-session.js, recording): its header's first line names the
// scenario, and a line of input names follows the header lines.
export function looksLikeRecording(text) {
  if (typeof text !== 'string') return false;
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (!/^# scenario:/.test(lines[0] ?? '')) return false;
  const names = lines.find((l) => l && !l.startsWith('#'));
  return Boolean(names) && /^[a-z_0-9]+(,[a-z_0-9]+)+$/.test(names.trim());
}

// bytes to base64 and back, in pieces, so that a recording of an hour does not overflow the argument list
function toBase64(bytes) {
  let s = '';
  for (let k = 0; k < bytes.length; k += 0x8000) s += String.fromCharCode(...bytes.subarray(k, k + 0x8000));
  return btoa(s);
}

function fromBase64(b64) {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let k = 0; k < s.length; ++k) bytes[k] = s.charCodeAt(k);
  return bytes;
}

async function through(bytes, stream) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}

// The recording gzipped and in base64, for sessionStorage, which holds some millions of characters: an approach's
// recording packs to about a tenth of itself; and back.
export async function pack(text) {
  return toBase64(await through(new TextEncoder().encode(text), new CompressionStream('gzip')));
}

export async function unpack(packed) {
  return new TextDecoder().decode(await through(fromBase64(packed), new DecompressionStream('gzip')));
}

// The address that opens the page on a replay: the view's own choices kept (the hour, the tier, the camera,
// antialiasing), the flight's left to the recording (scenario, airframe, crew) and the debrief to its end.
export function replayUrl(href) {
  const url = new URL(href);
  const kept = new URLSearchParams();
  for (const k of ['time', 'hour', 'tier', 'cam', 'aa']) if (url.searchParams.has(k)) kept.set(k, url.searchParams.get(k));
  kept.set('replay', '1');
  url.search = kept.toString();
  return url.href;
}

// What the status line says of a replay, a line each with whether it is said in amber: the recording's file, who
// flew it and when (its # crew, # hands and # flown), how far the replay has flown, and the worker's note on the
// build it was flown on against this one (Replay.info, replayNote), amber where the verdict is not the gate's.
export function replayStatus(info, progress, name = '') {
  const lines = [[`replay${name ? `: ${name}` : ''}`, false]];
  if (!info) return [...lines, ['reading the recording', false]];
  const when = /^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(info.flown || '') ? `flown ${info.flown.slice(0, 16).replace('T', ' ')} UTC` : '';
  const who = info.crew === 'script' ? 'by the scripted crew' : info.hands ? `by ${info.hands}` : '';
  if (when || who) lines.push([[when, who].filter(Boolean).join(', '), false]);
  const steps = progress?.steps ?? info.steps;
  const s = (n) => `${(n * 0.02).toFixed(1)} s`;   // a step is a fiftieth of a second
  lines.push([progress?.ended ? `replayed to its end, ${s(steps)}` : `replaying, ${s(progress?.at ?? 0)} of ${s(steps)}`, false]);
  if (info.note?.text) for (const l of wrap(info.note.text, 60)) lines.push([l, Boolean(info.note.warn)]);
  return lines;
}

// A text in lines of at most width characters, broken at spaces.
export function wrap(text, width) {
  const out = [];
  let line = '';
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    if (line && line.length + 1 + word.length > width) {
      out.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) out.push(line);
  return out;
}

// What the panel says of a replay's verdict against the one its recording was saved with, once the replay has ended
// (Replay.progress, compareVerdicts): the same line for line, as on the build that flew it; else each band whose
// verdict changed, as law_harness --rejudge names them; nothing to compare with a recording saved before 0.1.1.
export function replayVerdict(verdict) {
  if (!verdict) return '';
  if (!verdict.comparable) return 'the recording was saved without a verdict: nothing to set this one against';
  if (verdict.same) return 'the same, line for line, as the verdict saved with the recording';
  if (!verdict.changed?.length) return 'the same bands as when it was saved, their figures otherwise';
  return ['not as when it was saved:', ...verdict.changed.map((c) => `  ${c}`)].join('\n');
}

// What a recording's header says, made safe to show in the page's markup: a file's text is never markup.
export function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
