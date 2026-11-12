// The graphics tiers: what a phone, a laptop's own graphics and a desktop card each draw, which of the
// three a device gets from what it reports about itself, and when a slow start steps it down. No
// three.js and no browser here, so the tests can read all of it. GPLv3.
//
// A tier is chosen once from the device's report (chooseTier), overridden by ?q=low|medium|high in the
// address or by the page's control (F, or the GFX button), which is remembered. Left to itself, the
// page also times its first frames and steps down when they come slowly (probeVerdict): it never steps
// up, because a display's refresh hides how much faster a device could go.

export const TIERS = ['low', 'medium', 'high'];
export const CHOICES = ['auto', ...TIERS];

// What each tier sets. Every tier has every key (a test holds that), and no cost falls as the tier
// rises (the same test; the few settings where a smaller number costs more say so).
//
//   pixelRatio, pixels   caps on the drawing buffer: device pixels per CSS pixel, and its whole area
//   msaa                 samples of the off-screen target the scene is drawn into (0: none)
//   hdr                  draw into a half-float target and tone-map once at the end; bloom needs it
//   bloom                strength of the glow round the Sun, the lights and the plume (0: none)
//   bloomDivide          the glow is blurred at 1/bloomDivide of the picture's size (smaller costs more)
//   shadowMap            side of the Sun's shadow map round the craft, texels (0: none)
//   envMap               side of the reflected sky's cube faces, texels (0: no reflections)
//   envEvery             frames between redrawing it (smaller costs more)
//   anisotropy           texture filtering at glancing angles
//   stars                how many
//   earth.mask           the land mask's width, texels (its height is half)
//   earth.cities         the night lights' map's width
//   earth.viewSteps      samples of the air along each pixel's ray
//   earth.sunSteps       samples of the air toward the Sun from each of those
//   earth.octaves        octaves of the made-up detail: land, coast, clouds
//   earth.cloudShadows   0 none, 1 the clouds' shadows on the ground
//   earth.relief         the land's made-up relief, shaded by the Sun
//   earth.ozone          ozone's absorption: the blue band over an orbital sunset
//   earth.glitter        the Sun's glint on the sea broken into wave facets
//   ring.around          segments round the Ring
//   ring.texture         the Ring's painted textures' longer side, texels
//   ring.normalMaps      relief on the hull, the walls and the hub
//   ring.struts          the spokes' and rims' trusses built member by member (false: painted lattices)
//   ring.bay, rimBay     a bay of the spokes' and the rims' trusses, m (smaller costs more)
//   ring.ribs            ribs round each end wall
//   ring.lights          lights round each ring of them on the end walls
//   ring.lightRings      rings of lights on each end wall
//   ring.city            the town under the roof: 1 painted, 2 with its buildings standing
//   craft.stations, craft.around   the fuselage's loft
//   craft.texture        the tiles' and panels' texture side
//   craft.normalMaps     relief of the tiles and panel lines
//   craft.plumeSteps     samples through each plume
export const SETTINGS = {
  low: {
    name: 'low', label: 'LOW', device: 'phones, integrated graphics',
    pixelRatio: 1.5, pixels: 1.3e6,
    msaa: 0, hdr: false, bloom: 0, bloomDivide: 4,
    shadowMap: 0, envMap: 0, envEvery: 0, anisotropy: 2, stars: 2500,
    earth: { mask: 2048, cities: 2048, viewSteps: 6, sunSteps: 3, octaves: 3, cloudShadows: 0, relief: false, ozone: false, glitter: false },
    ring: { around: 192, texture: 512, normalMaps: false, struts: false, bay: 280, rimBay: 240, ribs: 120, lights: 180, lightRings: 2, city: 1 },
    craft: { stations: 28, around: 20, texture: 256, normalMaps: false, plumeSteps: 6 },
  },
  medium: {
    name: 'medium', label: 'MEDIUM', device: 'a recent laptop, an older card',
    pixelRatio: 2, pixels: 2.4e6,
    msaa: 4, hdr: true, bloom: 0.4, bloomDivide: 2,
    shadowMap: 0, envMap: 64, envEvery: 45, anisotropy: 8, stars: 5000,
    earth: { mask: 4096, cities: 4096, viewSteps: 10, sunSteps: 4, octaves: 5, cloudShadows: 1, relief: true, ozone: true, glitter: true },
    ring: { around: 384, texture: 1024, normalMaps: true, struts: true, bay: 140, rimBay: 120, ribs: 240, lights: 360, lightRings: 4, city: 2 },
    craft: { stations: 44, around: 32, texture: 512, normalMaps: true, plumeSteps: 12 },
  },
  high: {
    name: 'high', label: 'HIGH', device: 'a desktop card',
    pixelRatio: 2, pixels: 6.0e6,
    msaa: 4, hdr: true, bloom: 0.5, bloomDivide: 1,
    shadowMap: 2048, envMap: 128, envEvery: 15, anisotropy: 16, stars: 9000,
    earth: { mask: 8192, cities: 4096, viewSteps: 16, sunSteps: 6, octaves: 6, cloudShadows: 1, relief: true, ozone: true, glitter: true },
    ring: { around: 512, texture: 2048, normalMaps: true, struts: true, bay: 70, rimBay: 60, ribs: 240, lights: 720, lightRings: 5, city: 2 },
    craft: { stations: 64, around: 48, texture: 1024, normalMaps: true, plumeSteps: 24 },
  },
};

// Settings where a smaller number is the dearer one.
export const INVERSE = ['bloomDivide', 'envEvery', 'ring.bay', 'ring.rimBay'];

const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|basic render|lavapipe/i;
const PHONE_GPU = /adreno|mali|powervr|xclipse|immortalis|videocore|vivante|tegra|maleoon/i;
const NVIDIA = /nvidia|geforce|quadro|\brtx\b|\bgtx\b/i;
const NVIDIA_OLD = /\b(gt|mx)\s?\d{3,4}\b|\bgtx\s?[4-7]\d{2}\b|\bgtx\s?9[0-6]0\b|\bgtx\s?10[0-5]0\b|\b[89]\d{2}m\b|quadro\s?[kmp]?\d{3,4}\b/i;
const RADEON_CARD = /\brx\s?(vega\s?)?\d{2,4}\b|radeon\s?vii\b/i;
const RADEON_MIDDLE = /radeon\s?pro|firepro|\b\d{3}m\b|vangogh|custom gpu|\bw\d{4}\b|\br9\b/i;

// What a device says of itself, read by the page (deviceReport in main.js fills it):
//   renderer        WEBGL_debug_renderer_info's unmasked renderer, or '' when the browser withholds it
//   maxTextureSize  the largest texture side
//   width, height   the screen's, CSS pixels
//   touch           a coarse pointer: a finger
//   cores, memory   navigator.hardwareConcurrency and deviceMemory (GB), 0 when withheld
//   halfFloat       a half-float target can be drawn into (EXT_color_buffer_half_float or _float)
// Returns { tier, why }: why is a short phrase for the page to show.
export function chooseTier(report = {}) {
  const r = String(report.renderer || '');
  const short = Math.min(report.width || 0, report.height || 0);
  const phone = Boolean(report.touch) && short > 0 && short < 700;
  const capped = (tier, why) => {
    // above low the page draws into a half-float target and reads a 4096 mask; high wants memory too
    if (tier !== 'low' && report.halfFloat === false) return { tier: 'low', why: `${why}, no half-float target` };
    if (tier !== 'low' && report.maxTextureSize > 0 && report.maxTextureSize < 4096) return { tier: 'low', why: `${why}, small textures only` };
    if (tier === 'high' && report.memory > 0 && report.memory < 8) return { tier: 'medium', why: `${why}, ${report.memory} GB of memory` };
    return { tier, why };
  };
  if (SOFTWARE.test(r)) return { tier: 'low', why: 'drawn in software' };
  if (PHONE_GPU.test(r)) return { tier: 'low', why: 'a phone\'s or tablet\'s graphics' };
  const silicon = r.match(/apple\s+m\d+(\s*(pro|max|ultra))?/i);
  if (silicon) return silicon[2] ? capped('high', 'Apple silicon, a Pro or better') : capped('medium', 'Apple silicon');
  if (NVIDIA.test(r)) {
    const old = NVIDIA_OLD.test(r) && !/\brtx\b/i.test(r);
    return capped(old ? 'medium' : 'high', old ? 'an older NVIDIA card' : 'an NVIDIA card');
  }
  if (/intel/i.test(r)) {
    if (!/\barc\b/i.test(r)) return { tier: 'low', why: 'Intel integrated graphics' };
    return /\b[ab]\d{3}\b/i.test(r) ? capped('high', 'an Intel Arc card') : capped('medium', 'Intel Arc graphics');
  }
  if (/radeon|\bamd\b|\bati\b/i.test(r)) {
    if (RADEON_CARD.test(r)) return capped('high', 'a Radeon card');
    if (RADEON_MIDDLE.test(r)) return capped('medium', 'Radeon graphics');
    return { tier: 'low', why: 'AMD integrated graphics' };
  }
  // Safari says only "Apple GPU", and some browsers nothing at all: go by the rest
  if (phone) return { tier: 'low', why: 'a phone' };
  if (report.touch) return capped('medium', 'a tablet');
  if (/apple/i.test(r)) return capped('medium', 'a Mac');
  if (report.cores > 0 && report.cores <= 4) return { tier: 'low', why: 'an unnamed renderer, four cores or fewer' };
  return capped('medium', 'an unnamed renderer');
}

// ?q= in the address, else what the page's control saved, else the device's own tier.
// Returns { choice, tier, why }: choice is what was asked ('auto' or a tier).
export function resolveTier({ query = null, saved = null, report = {} } = {}) {
  const pick = (v) => (typeof v === 'string' && TIERS.includes(v.toLowerCase()) ? v.toLowerCase() : null);
  const q = pick(query);
  if (q) return { choice: q, tier: q, why: 'asked for in the address' };
  const s = pick(saved);
  if (s) return { choice: s, tier: s, why: 'chosen on this page before' };
  const auto = chooseTier(report);
  return { choice: 'auto', tier: auto.tier, why: auto.why };
}

// The control's next choice: auto, low, medium, high, and round again.
export function nextChoice(choice) {
  return CHOICES[(Math.max(0, CHOICES.indexOf(choice)) + 1) % CHOICES.length];
}

// The drawing buffer's device pixels per CSS pixel: the device's own, under the tier's two caps (and
// scale, which the timing probe lowers on a device that is slow even at low).
export function pixelRatioFor(settings, width, height, devicePixelRatio = 1, scale = 1) {
  const area = Math.max(1, width * height);
  const byArea = Math.sqrt(settings.pixels / area);
  return Math.max(0.5, Math.min(devicePixelRatio || 1, settings.pixelRatio, byArea) * scale);
}

export const PROBE = { skip: 30, frames: 60, slowMs: 40 };

// After the first frames at a tier the page chose itself: frames is their times in milliseconds (the
// first PROBE.skip, where shaders compile, already dropped). Slow, by the median, means a tier down, or
// at low a coarser drawing buffer. Returns { tier, scale, slow, medianMs }.
export function probeVerdict(tier, frames, scale = 1) {
  const sorted = frames.filter((f) => f > 0 && f < 2000).sort((a, b) => a - b);
  const medianMs = sorted.length ? sorted[sorted.length >> 1] : 0;
  const slow = sorted.length >= PROBE.frames / 2 && medianMs > PROBE.slowMs;
  if (!slow) return { tier, scale, slow, medianMs };
  const at = TIERS.indexOf(tier);
  if (at > 0) return { tier: TIERS[at - 1], scale, slow, medianMs };
  return { tier, scale: Math.max(0.5, scale * 0.75), slow, medianMs };
}

// Every leaf of a tier's settings as 'a.b' -> value, for the tests and for the page's report.
export function flatten(settings, prefix = '') {
  const out = {};
  for (const [k, v] of Object.entries(settings)) {
    if (v && typeof v === 'object') Object.assign(out, flatten(v, `${prefix}${k}.`));
    else out[`${prefix}${k}`] = v;
  }
  return out;
}
