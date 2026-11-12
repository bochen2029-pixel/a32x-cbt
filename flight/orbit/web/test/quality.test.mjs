// The graphics tiers: which one a device gets from what it reports, that each tier says everything,
// and that a slow start steps down. GPLv3.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHOICES, INVERSE, PROBE, SETTINGS, TIERS, chooseTier, flatten, nextChoice, pixelRatioFor, probeVerdict, resolveTier,
} from '../src/quality.js';

const desk = { width: 1920, height: 1080, touch: false, cores: 12, memory: 8, maxTextureSize: 16384, halfFloat: true };
const phone = { width: 390, height: 844, touch: true, cores: 6, memory: 4, maxTextureSize: 8192, halfFloat: true };
const tablet = { width: 820, height: 1180, touch: true, cores: 8, memory: 0, maxTextureSize: 16384, halfFloat: true };

// renderer strings as browsers give them (WEBGL_debug_renderer_info), and the tier each should get
const DEVICES = [
  ['low', desk, 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)'],
  ['low', desk, 'llvmpipe (LLVM 15.0.7, 256 bits)'],
  ['low', desk, 'ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0, D3D11)'],
  ['low', phone, 'Adreno (TM) 740'],
  ['low', phone, 'ANGLE (ARM, Mali-G715-Immortalis MC11, OpenGL ES 3.2)'],
  ['low', phone, 'PowerVR Rogue GE8320'],
  ['low', phone, 'ANGLE (Samsung Xclipse 940) on Vulkan 1.3.279'],
  ['low', phone, 'Apple GPU'],
  ['low', phone, ''],
  ['low', desk, 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)'],
  ['low', desk, 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)'],
  ['low', desk, 'ANGLE (Intel, Mesa Intel(R) UHD Graphics 620 (KBL GT2), OpenGL 4.6)'],
  ['low', desk, 'ANGLE (Apple, ANGLE Metal Renderer: Intel(R) Iris(TM) Plus Graphics 655, Unspecified Version)'],
  ['low', desk, 'ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)'],
  ['low', desk, 'ANGLE (AMD, AMD Radeon(TM) Vega 8 Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)'],
  ['low', { ...desk, cores: 4 }, ''],
  ['medium', desk, 'ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)'],
  ['medium', desk, 'Apple M2'],
  ['medium', desk, 'Apple GPU'],
  ['medium', tablet, 'Apple GPU'],
  ['medium', desk, 'ANGLE (Apple, ANGLE Metal Renderer: AMD Radeon Pro 5500M, Unspecified Version)'],
  ['medium', desk, 'ANGLE (Intel, Intel(R) Arc(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)'],
  ['medium', desk, 'ANGLE (AMD, AMD Radeon(TM) 780M Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)'],
  ['medium', desk, 'ANGLE (AMD, AMD Custom GPU 0405 (radeonsi, vangogh, LLVM 15.0.7, DRM 3.54), OpenGL 4.6)'],
  ['medium', desk, 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1050 Ti Direct3D11 vs_5_0 ps_5_0, D3D11)'],
  ['medium', desk, 'ANGLE (NVIDIA, NVIDIA GeForce MX450 Direct3D11 vs_5_0 ps_5_0, D3D11)'],
  ['medium', desk, 'ANGLE (NVIDIA, NVIDIA GeForce GT 1030 Direct3D11 vs_5_0 ps_5_0, D3D11)'],
  ['medium', desk, 'ANGLE (NVIDIA, NVIDIA Quadro P620 Direct3D11 vs_5_0 ps_5_0, D3D11)'],
  ['medium', desk, ''],
  ['medium', desk, 'Generic Renderer'],
  ['high', desk, 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)'],
  ['high', desk, 'ANGLE (NVIDIA, NVIDIA GeForce RTX 5090 Direct3D11 vs_5_0 ps_5_0, D3D11)'],
  ['high', desk, 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 SUPER Direct3D11 vs_5_0 ps_5_0, D3D11)'],
  ['high', desk, 'ANGLE (NVIDIA, NVIDIA GeForce GTX 980 Direct3D11 vs_5_0 ps_5_0)'],
  ['high', desk, 'ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 3080/PCIe/SSE2, OpenGL 4.5.0)'],
  ['high', desk, 'ANGLE (NVIDIA, NVIDIA RTX A2000 Direct3D11 vs_5_0 ps_5_0, D3D11)'],
  ['high', desk, 'ANGLE (NVIDIA, NVIDIA Quadro RTX 4000 Direct3D11 vs_5_0 ps_5_0, D3D11)'],
  ['high', desk, 'ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)'],
  ['high', desk, 'ANGLE (AMD, Radeon RX 580 Series Direct3D11 vs_5_0 ps_5_0, D3D11)'],
  ['high', desk, 'ANGLE (AMD, AMD Radeon RX Vega 64 Direct3D11 vs_5_0 ps_5_0, D3D11)'],
  ['high', desk, 'ANGLE (Intel, Intel(R) Arc(TM) A770 Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)'],
  ['high', desk, 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Pro, Unspecified Version)'],
  ['high', desk, 'ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Max, Unspecified Version)'],
];

test('a device gets the tier its graphics can draw', () => {
  for (const [tier, report, renderer] of DEVICES) {
    const got = chooseTier({ ...report, renderer });
    assert.equal(got.tier, tier, `${renderer || '(no renderer named)'} on a ${report.width}-wide ${report.touch ? 'touch ' : ''}screen: ${got.why}`);
    assert.ok(got.why.length > 3, 'and says why');
  }
});

test('what a tier needs and the device lacks holds it down', () => {
  const rtx = 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)';
  assert.equal(chooseTier({ ...desk, renderer: rtx, halfFloat: false }).tier, 'low', 'no half-float target');
  assert.equal(chooseTier({ ...desk, renderer: rtx, maxTextureSize: 2048 }).tier, 'low', 'small textures');
  assert.equal(chooseTier({ ...desk, renderer: rtx, memory: 4 }).tier, 'medium', '4 GB of memory');
  assert.equal(chooseTier({ ...desk, renderer: rtx, memory: 0 }).tier, 'high', 'memory withheld is not memory lacking');
  assert.equal(chooseTier({}).tier, 'medium', 'an empty report');
  assert.equal(chooseTier().tier, 'medium', 'no report');
});

test('the address beats the saved choice, which beats the device', () => {
  const report = { ...desk, renderer: 'Apple M1' };
  assert.deepEqual(resolveTier({ report }), { choice: 'auto', tier: 'medium', why: 'Apple silicon' });
  assert.equal(resolveTier({ saved: 'high', report }).tier, 'high');
  assert.equal(resolveTier({ saved: 'high', report }).choice, 'high');
  assert.equal(resolveTier({ query: 'low', saved: 'high', report }).tier, 'low');
  assert.equal(resolveTier({ query: 'LOW', report }).tier, 'low', 'any case');
  for (const junk of ['ultra', '', 'auto', null, undefined, 3]) {
    assert.equal(resolveTier({ query: junk, saved: junk, report }).choice, 'auto', `${junk} is no tier`);
  }
});

test('the control goes round auto, low, medium, high', () => {
  assert.deepEqual(CHOICES, ['auto', 'low', 'medium', 'high']);
  let c = 'auto';
  const seen = [];
  for (let k = 0; k < 5; k++) { c = nextChoice(c); seen.push(c); }
  assert.deepEqual(seen, ['low', 'medium', 'high', 'auto', 'low']);
  assert.equal(nextChoice('nonsense'), 'low');
});

test('every tier sets every setting, and no cost falls as the tier rises', () => {
  const keys = Object.keys(flatten(SETTINGS.low)).sort();
  assert.ok(keys.length > 25, `${keys.length} settings`);
  for (const t of TIERS) {
    assert.equal(SETTINGS[t].name, t);
    assert.deepEqual(Object.keys(flatten(SETTINGS[t])).sort(), keys, `${t} has the same settings as low`);
    for (const [k, v] of Object.entries(flatten(SETTINGS[t]))) {
      assert.ok(v !== undefined && v !== null && !(typeof v === 'number' && !Number.isFinite(v)), `${t}.${k} is set`);
    }
  }
  assert.deepEqual(Object.keys(SETTINGS), TIERS);
  const cost = (v) => (typeof v === 'boolean' ? Number(v) : v);
  for (const k of keys) {
    if (['name', 'label', 'device', 'pixelRatio'].includes(k)) continue;
    const [lo, mid, hi] = TIERS.map((t) => cost(flatten(SETTINGS[t])[k]));
    if (INVERSE.includes(k)) assert.ok(lo >= mid && mid >= hi || (k === 'envEvery' && lo === 0), `${k}: ${lo}, ${mid}, ${hi}`);
    else assert.ok(lo <= mid && mid <= hi, `${k}: ${lo}, ${mid}, ${hi}`);
  }
  assert.equal(SETTINGS.low.hdr, false, 'low draws straight to the screen');
  assert.equal(SETTINGS.low.msaa + SETTINGS.low.bloom + SETTINGS.low.shadowMap + SETTINGS.low.envMap, 0, 'and pays for none of the extras');
  assert.equal(SETTINGS.low.ring.struts || SETTINGS.low.ring.normalMaps || SETTINGS.low.craft.normalMaps, false, 'nor for relief and trusses');
  for (const t of TIERS) assert.ok(!SETTINGS[t].bloom || SETTINGS[t].hdr, `${t}: bloom needs the half-float target`);
});

test('the drawing buffer keeps under the tier\'s pixels', () => {
  const px = (t, w, h, dpr, scale) => { const r = pixelRatioFor(SETTINGS[t], w, h, dpr, scale); return [r, w * h * r * r]; };
  let [r, area] = px('low', 390, 844, 3);
  assert.equal(r, 1.5, 'a phone at low: the ratio\'s cap');
  assert.ok(area < 0.8e6, `${area} pixels`);
  [r, area] = px('low', 1920, 1080, 1);
  assert.ok(r < 1 && Math.abs(area - SETTINGS.low.pixels) < 1, 'a full-HD laptop at low draws fewer pixels than its screen has');
  [r] = px('medium', 1920, 1080, 1);
  assert.equal(r, 1, 'and at medium all of them');
  [r, area] = px('high', 3840, 2160, 2);
  assert.ok(area <= SETTINGS.high.pixels + 1, '4K at high keeps to the budget');
  [r] = px('high', 2560, 1440, 1);
  assert.equal(r, 1);
  assert.equal(px('low', 390, 844, 3, 0.5)[0], 0.75, 'the probe\'s scale multiplies it');
  assert.equal(px('low', 4000, 4000, 1, 0.5)[0], 0.5, 'never under a half');
});

test('a slow start steps down a tier; at low it draws fewer pixels; a fast one changes nothing', () => {
  const frames = (ms) => Array.from({ length: PROBE.frames }, (_, i) => ms + (i % 3));
  assert.deepEqual(probeVerdict('high', frames(60)), { tier: 'medium', scale: 1, slow: true, medianMs: 61 });
  assert.equal(probeVerdict('medium', frames(60)).tier, 'low');
  assert.deepEqual(probeVerdict('low', frames(60)), { tier: 'low', scale: 0.75, slow: true, medianMs: 61 });
  assert.equal(probeVerdict('low', frames(60), 0.75).scale, 0.5625);
  assert.equal(probeVerdict('low', frames(60), 0.5).scale, 0.5, 'and no coarser than a half');
  assert.deepEqual(probeVerdict('high', frames(16)), { tier: 'high', scale: 1, slow: false, medianMs: 17 });
  assert.equal(probeVerdict('high', frames(33)).tier, 'high', '30 frames a second is enough');
  // one long frame (a shader compiling, a tab coming back) is not a slow device; nor are too few frames
  assert.equal(probeVerdict('high', [...frames(16), 900, 5000]).tier, 'high');
  assert.equal(probeVerdict('high', [70, 70, 70]).tier, 'high');
});
