// A stand-in for Web Audio, for the sound's tests (sound*.test.mjs): not a test itself. GPLv3.
import assert from 'node:assert/strict';

// A stand-in for Web Audio: enough to build the instrument and watch what it is told. It keeps the graph (each
// node's kind, what it is connected to) and each parameter's latest value, so that a test can follow the sound
// from a voice to the speakers and see which gains it passes.
export function fakeAudio() {
  const sent = [], nodes = [];
  const param = (value = 0) => ({
    value, setTargetAtTime(v, t, tau) { sent.push(['target', v, t, tau]); this.value = v; }, setValueAtTime(v, t) { sent.push(['value', v, t]); this.value = v; },
    linearRampToValueAtTime(v, t) { sent.push(['ramp', v, t]); }, exponentialRampToValueAtTime(v, t) { sent.push(['exp', v, t]); assert.ok(v > 0, 'an exponential ramp to zero'); },
    cancelScheduledValues() {},
  });
  const node = (kind, extra = {}) => {
    const n = Object.assign({ kind, to: [], connect(d) { assert.ok(d, 'connected to nothing'); if (d.kind) this.to.push(d); return d; }, disconnect() {}, start() {}, stop() {} }, extra);
    for (const v of Object.values(extra)) if (v && typeof v === 'object' && 'setTargetAtTime' in v) v.owner = n;
    nodes.push(n);
    return n;
  };
  const ac = {
    sampleRate: 48000, currentTime: 0, destination: node('destination'), nodes,
    createGain: () => node('gain', { gain: param(1) }),
    createBiquadFilter: () => node('filter', { type: 'lowpass', frequency: param(350), Q: param(1) }),
    createBuffer: (ch, n, fs = 48000) => { const data = Array.from({ length: ch }, () => new Float32Array(n)); return { duration: n / fs, length: n, getChannelData: (c) => data[c] }; },
    createBufferSource: () => node('source', { buffer: null, loop: false }),
    createOscillator: () => node('source', { type: 'sine', frequency: param(440) }),
    createWaveShaper: () => node('shaper', { curve: null, oversample: 'none' }),
    createStereoPanner: () => node('pan', { pan: param(0) }),
    createPanner: () => node('pan', { positionX: param(0), positionY: param(0), positionZ: param(0) }),
    createDelay: () => node('delay', { delayTime: param(0) }),
    createDynamicsCompressor: () => node('compressor', { threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }),
    createConvolver: () => node('convolver', { buffer: null, normalize: true }),
  };
  return { ac, sent };
}

// The most a sound from `from` can reach the speakers by, through the graph as it stands: the largest product of
// the gains along any path (a filter, a panner, a delay or a room passes it as it is).
export function reach(from, to, seen = new Map()) {
  if (from === to) return 1;
  if (seen.has(from)) return seen.get(from);
  seen.set(from, 0);
  let best = 0;
  for (const d of from.to) best = Math.max(best, reach(d, to, seen));
  const g = from.kind === 'gain' ? Math.abs(from.gain.value) : 1;
  seen.set(from, g * best);
  return g * best;
}
// The gain node a followed key leads, by the parameter's owner.
export const voice = (e, key) => e.params.filter((p, i) => e.keys[i] === key).map((p) => p.owner).find((n) => n && n.kind === 'gain');
