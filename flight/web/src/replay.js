// A saved recording opened in the page and replayed through the core: chosen with Ctrl+O or the panel's button, or
// dropped on the page; carried across a reload of the page, which then starts the flight from the recording's own
// scenario and airframe (the worker's replay, core-session.js) and draws that flight's runway, as it would its own;
// flown at about ten times its pace, then the debrief over the whole of it. Plain functions: node tests them. GPLv3.

export const STORE = 'a32x-replay';      // sessionStorage: the recording, packed (pack), and its file's name
export const REPLAY_TICKS = 12;           // the ticks a frame asks for in a replay: about ten times the flight's pace,
                                          // and the view still keeps a sample every quarter second of it

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

// The recording's build against the page's: the same, said plainly; another, in amber, since this build's laws and
// judge fly it now, as law_harness --rejudge judges a recording on a later build.
export function buildCompare(recorded, page) {
  if (!recorded) return { text: 'recorded on a build it does not name', warn: true };
  if (recorded === page) return { text: `recorded on this build, ${recorded}`, warn: false };
  return { text: `recorded on build ${recorded}, flown here by ${page || 'a build that does not name itself'}`, warn: true };
}

// What a recording's header says, made safe to show in the page's markup: a file's text is never markup.
export function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// The verdict saved with the recording: the last of its "# judged:" lines that gives one (STABLE, NOT STABLE), or none.
export function savedVerdict(judged) {
  for (let k = (judged?.length ?? 0) - 1; k >= 0; --k) if (/^(NOT )?STABLE\b/.test(judged[k])) return judged[k];
  return '';
}
