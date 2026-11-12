// The inside of the ring, drawn in its own frame at a person's scale: the rim floor and its plan (grass, paths,
// the canal and its bridges, the spokes' plazas), the low blocks, the rim walls, the roof's lattice, the spokes
// and the hub, the lifts, and the hub's lobby. Built once from the core's plan (oc_walk_boxes); each frame the
// view moves the cars, the doors and the light. Everything is painted by code. GPLv3.
//
// The scene's world axes are the ring's frame (walk-math.js). Each part of the floor is built about its own
// middle and placed there, so near the walker the numbers the GPU sees are small.

import * as THREE from 'three';
import { RING } from './core.js';
import { BOX, WALK, WHERE } from './walk-core.js';
import { HALF, RF, RIM_R, ROOF_R, SECTOR, STREET, outward, spinward } from './walk-math.js';

const SECTORS = WALK.streets;         // the floor in sixty parts, each centred on its cross street
const RL = WALK.lobby;
const CC = WALK.liftC, CAR = WALK.car / 2, SHAFT = CAR + WALK.shaftWall, DOOR = WALK.door / 2;
const HOUSING = WALK.carTall + WALK.shaftWall;
const SPOKE = RING.spoke / 2;
const WATER = -1.4;                   // the canal's water: h below the floor (chosen)
const RIBS = 1200;                    // the roof's ribs round the ring: one every 24.6 m (chosen)
const f = (x) => Number(x).toFixed(4);   // a number as GLSL reads a float

// ---- the light, shared by every surface ---------------------------------------------------------

const COMMON = /* glsl */ `
  const float RF = ${RF.toFixed(1)};
  const float ROOF = ${ROOF_R.toFixed(1)};
  const float RIM = ${RIM_R.toFixed(1)};
  const float HALF = ${HALF.toFixed(1)};
  const float HUB = ${RING.hub.toFixed(1)};
  const float PORT = ${RING.port.toFixed(1)};
  const float RL = ${RL.toFixed(1)};
  uniform vec3 uSun;          // toward the Sun, ring frame
  uniform vec3 uSunLight;     // its light: colour and strength, nothing in the Earth's shadow
  uniform vec3 uFillSky;      // the roof's lamps and the sky's light, from up
  uniform vec3 uFillGround;   // and what the floor gives back, from down
  uniform vec3 uLobbyLight;   // the lobby's lamp along its axis
  uniform vec3 uEarth;        // toward the Earth's centre, ring frame
  uniform vec3 uEarthLight;   // its light: the part of its face the Sun lights, as the ring sees it
  uniform vec3 uHaze;         // the band's air, lit
  uniform float uHazeDist;    // m: the air's thickness, for one part in e

  // How much of the Sun reaches p along d: over the rim walls' tops (the roof is glass), not through the
  // floor and hull, a rim wall or the hub. walk-math.js's sunReach says the same in JavaScript.
  float sunReach(vec3 p, vec3 d) {
    float rp = length(p.xz);
    if (rp < HUB + 1.0 && abs(p.y) < PORT) return 0.0;
    if (abs(d.y) < 1e-6) return 0.0;
    float a = dot(d.xz, d.xz), b = dot(p.xz, d.xz), c = rp * rp - RF * RF;
    float tHull = a > 1e-9 ? (-b + sqrt(max(0.0, b * b - a * c))) / a : 1e9;
    float tSide = ((d.y > 0.0 ? HALF : -HALF) - p.y) / d.y;
    if (tSide <= 0.0 || tSide >= tHull) return 0.0;
    float r = length(p.xz + tSide * d.xz);
    float soft = 0.00465 * tSide / max(abs(d.y), 0.2);
    return smoothstep(-soft, soft, RIM - r);
  }

  // A bar of half-width w every period along x, seen through a window blur wide: the part of it that is bar.
  float bars(float x, float period, float w, float blur) {
    float d = abs(x - period * floor(x / period + 0.5));
    float b = max(blur, 1e-3);
    float one = clamp((min(d + b * 0.5, w) - max(d - b * 0.5, -w)) / b, 0.0, 1.0);
    return mix(one, 2.0 * w / period, smoothstep(period * 0.25, period, b));
  }
  // The roof's lattice at (s round the roof, c): ribs across the band every 24.6 m, beams along it every 125 m.
  float lattice(vec2 sc, float blur) {
    float ribs = bars(sc.x, ${f((2 * Math.PI * ROOF_R) / RIBS)}, 0.6, blur), beams = bars(sc.y + HALF, 125.0, 1.0, blur);
    return 1.0 - (1.0 - ribs) * (1.0 - beams);
  }
  // The lattice's shadow where the light from the Sun crosses the roof on its way to p in the band: soft, as a
  // beam 300 m up is narrower than the Sun's disc there.
  float roofShade(vec3 p, vec3 d) {
    float rp = length(p.xz);
    if (rp <= ROOF) return 1.0;
    float a = dot(d.xz, d.xz), b = dot(p.xz, d.xz), c = rp * rp - ROOF * ROOF;
    float disc = b * b - a * c;
    if (a < 1e-9 || disc <= 0.0) return 1.0;
    float t = (-b - sqrt(disc)) / a;
    if (t <= 0.0) return 1.0;
    vec3 q = p + t * d;
    if (abs(q.y) > HALF) return 1.0;
    return 1.0 - 0.85 * lattice(vec2(atan(q.x, q.z) * ROOF, q.y), 0.0093 * t + 0.2);
  }
  // The part of the line from a to b that is in the band's air, between the roof and the floor.
  float airPath(vec3 a, vec3 b) {
    vec3 d = b - a;
    float L = length(d), A = dot(d.xz, d.xz), B = dot(a.xz, d.xz), C = dot(a.xz, a.xz) - ROOF * ROOF;
    float inside = C < 0.0 ? 1.0 : 0.0;
    if (A > 1e-6) {
      float disc = B * B - A * C;
      inside = 0.0;
      if (disc > 0.0) {
        float q = sqrt(disc);
        inside = max(0.0, min((-B + q) / A, 1.0) - max((-B - q) / A, 0.0));
      }
    }
    return L * (1.0 - inside);
  }
  vec3 upAt(vec3 p) {
    float r = length(p.xz);
    return r > 0.01 ? vec3(-p.x, 0.0, -p.z) / r : vec3(0.0, 1.0, 0.0);
  }
  bool inHub(vec3 p) { return length(p.xz) < HUB + 0.5 && abs(p.y) < PORT; }
  // Sunlight and the soft fill, on a surface of this colour at p facing n; shaded by the roof's lattice or not.
  vec3 litBy(vec3 albedo, vec3 p, vec3 n, bool lattice) {
    vec3 up = upAt(p);
    float ndu = dot(n, up);
    if (inHub(p)) return albedo * (uLobbyLight * (0.55 + 0.45 * ndu) + vec3(0.02));
    vec3 light = mix(uFillGround, uFillSky, 0.5 + 0.5 * ndu);
    // the Earth's light, from a disc 136 degrees wide, where it stands above the level of the floor here
    light += uEarthLight * (0.4 + 0.6 * max(dot(n, uEarth), 0.0)) * smoothstep(-0.35, 0.35, dot(up, uEarth));
    float ndl = dot(n, uSun);
    if (ndl > 0.0 && uSunLight.r + uSunLight.g > 0.0) {
      float reach = sunReach(p + n * 0.05, uSun);
      if (reach > 0.0 && lattice) reach *= roofShade(p, uSun);
      light += uSunLight * ndl * reach;
    }
    return albedo * light;
  }
  vec3 lit(vec3 albedo, vec3 p, vec3 n) { return litBy(albedo, p, n, true); }
  vec3 hazed(vec3 colour, vec3 p) {
    float a = 1.0 - exp(-airPath(cameraPosition, p) / uHazeDist);
    return mix(colour, uHaze, a);
  }
  float hash(vec2 p) {
    p = fract(p * vec2(0.3183099, 0.3678794) + vec2(0.71, 0.113));
    p *= 17.0;
    return fract(p.x * p.y * (p.x + p.y));
  }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  // A thin line of half-width w every period along x, faded to its average where it is finer than a pixel.
  float lines(float x, float period, float w, float fw) { return bars(x, period, w, fw * 1.5); }
`;

const VERTEX = /* glsl */ `
  attribute vec4 aPlan;     // the floor: s from the sector's cross street, c, what it is, which street
  attribute float aKind;    // a box: what it is
  attribute vec3 color;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec4 vPlan;
  varying float vKind;
  varying vec3 vColour;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vPlan = aPlan;
    vKind = aKind;
    vColour = color;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

// The rim floor: its plan painted from s and c, the canal's water and walls.
const FLOOR_FRAGMENT = /* glsl */ `
  ${COMMON}
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec4 vPlan;
  const vec3 GRASS = vec3(0.055, 0.15, 0.03);
  const vec3 STONE = vec3(0.50, 0.46, 0.37);
  const vec3 TARMAC = vec3(0.07, 0.075, 0.08);
  const vec3 PLAZA = vec3(0.44, 0.38, 0.29);
  const vec3 GRAVEL = vec3(0.30, 0.27, 0.20);

  vec3 tiles(vec2 q, float size, vec3 base, float fw) {
    vec2 id = floor(q / size);
    float joint = max(lines(q.x, size, 0.025, fw), lines(q.y, size, 0.025, fw));
    return base * (0.86 + 0.24 * hash(id + 7.0)) * (1.0 - 0.45 * joint);
  }

  vec3 plan(float s, float c, float street, float fw) {
    float a = abs(c);
    bool plaza = mod(street + 0.5, ${(WALK.streets / RING.spokes).toFixed(1)}) < 1.0;
    vec2 q = vec2(s, c) + vec2(street * 37.0, street * 11.0);
    float fine = 1.0 - smoothstep(0.08, 0.5, fw);
    if (plaza && abs(s) < ${WALK.plaza.toFixed(1)} && a < ${WALK.plaza.toFixed(1)}) {
      vec3 p = tiles(vec2(s, c), 3.0, PLAZA, fw);
      float ring = lines(length(vec2(s, c)), 20.0, 0.4, fw);
      return mix(p, p * 0.6, ring * step(36.0, length(vec2(s, c))));
    }
    if (a < ${WALK.canal.toFixed(1)}) return tiles(vec2(s, c), 1.0, TARMAC * 1.6, fw);   // a bridge's deck
    if (abs(s) < ${WALK.street.toFixed(1)}) {
      vec3 t = TARMAC * (0.85 + 0.3 * noise(q * 3.0) * fine);
      float kerb = lines(abs(s) - ${f(WALK.street - 0.15)}, 1000.0, 0.15, fw);
      float dash = lines(s, 1000.0, 0.06, fw) * step(0.5, fract(c / 6.0));
      return mix(t, STONE * 0.9, max(kerb, dash * 0.8));
    }
    if (a < ${(WALK.promenade - WALK.promenadeW / 2).toFixed(1)}) return tiles(vec2(s, c), 0.5, STONE * 1.1, fw);   // the bank's coping
    if (a < ${(WALK.promenade + WALK.promenadeW / 2).toFixed(1)}) return tiles(vec2(s, c), 1.5, STONE, fw);
    if (abs(a - ${WALK.lane.toFixed(1)}) < ${(WALK.laneW / 2).toFixed(1)}) return GRAVEL * (0.8 + 0.4 * noise(q * 2.0) * fine);
    if (abs(a - ${WALK.wallpath.toFixed(1)}) < ${(WALK.wallpathW / 2).toFixed(1)}) return tiles(vec2(s, c), 2.0, STONE * 0.85, fw);
    if (a > ${(WALK.wallpath + WALK.wallpathW / 2).toFixed(1)}) return GRAVEL * (0.7 + 0.3 * noise(q * 1.5) * fine);
    // grass: meadows in patches, mown in stripes, with a finer grain close to
    float big = noise(q / 47.0), mid = noise(q / 6.3), small = noise(q * 1.7);
    vec3 g = GRASS * (0.7 + 0.6 * big) * (0.85 + 0.3 * mid) * mix(1.0, 0.8 + 0.4 * small, fine);
    g = mix(g, vec3(0.13, 0.15, 0.05), 0.35 * smoothstep(0.6, 0.85, big));
    g *= 0.94 + 0.06 * step(0.5, fract(c / 9.0));
    return g;
  }

  void main() {
    float s = vPlan.x, c = vPlan.y, kind = vPlan.z, street = vPlan.w;
    vec3 n = normalize(vNormal);
    float fw = length(vec2(fwidth(s), fwidth(c)));
    vec3 albedo;
    if (kind < 0.5) albedo = plan(s, c, street, fw);
    else if (kind < 1.5) albedo = vec3(0.006, 0.03, 0.04);                              // the canal's water
    else albedo = tiles(vec2(s + c, RF - length(vWorld.xz)), 0.6, vec3(0.22, 0.21, 0.19), fw);   // its walls, a deck's edge
    vec3 colour = lit(albedo, vWorld, n);
    if (kind > 0.5 && kind < 1.5) {   // water: the sky's light and the Sun's glint off it
      vec3 v = normalize(cameraPosition - vWorld);
      float fres = 0.02 + 0.98 * pow(1.0 - max(dot(v, n), 0.0), 5.0);
      colour += uFillSky * 0.3 * fres;
      vec3 rv = reflect(-v, n);
      colour += uSunLight * 6.0 * pow(max(dot(rv, uSun), 0.0), 400.0) * sunReach(vWorld + n * 0.05, uSun);
    }
    gl_FragColor = vec4(hazed(colour, vWorld), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// Boxes and walls: the blocks, parapets, rim walls, spokes, the hub, the lifts, the lobby. Their colour comes
// with them; their kind adds a pattern from where they are.
const BOX_FRAGMENT = /* glsl */ `
  ${COMMON}
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vKind;
  varying vec3 vColour;
  void main() {
    vec3 n = normalize(vNormal);
    vec3 p = vWorld;
    float r = length(p.xz), th = atan(p.x, p.z);
    vec3 albedo = vColour;
    vec3 emit = vec3(0.0);
    int kind = int(vKind + 0.5);
    if (kind == 1 || kind == 2) {   // a block (storeys and windows) or a rim wall (panels and galleries)
      float h = RF - r;
      float u = abs(n.y) > 0.5 ? th * RF : p.y;      // along the face
      float fu = fwidth(u), fh = fwidth(h);
      if (kind == 1) {
        if (dot(n, upAt(p)) > 0.6) albedo *= 0.55 + 0.25 * noise(vec2(u, p.y) * 0.7);   // the roof
        else {
          float storey = fract(h / 3.5), bay = fract(u / 3.2);
          float fade = 1.0 - smoothstep(0.3, 1.2, max(fu, fh));
          float win = smoothstep(0.26, 0.30, storey) * (1.0 - smoothstep(0.80, 0.84, storey)) * smoothstep(0.16, 0.2, bay) * (1.0 - smoothstep(0.8, 0.84, bay));
          albedo = mix(albedo, mix(albedo, vec3(0.05, 0.065, 0.08), 0.42), (1.0 - fade) * 0.9);
          albedo = mix(albedo, vec3(0.04, 0.05, 0.065), win * fade);
          albedo *= 1.0 - 0.3 * lines(h, 3.5, 0.06, fh) * fade;
          albedo *= 0.7 + 0.3 * smoothstep(0.0, 1.2, h);   // darker where it meets the ground
        }
      } else {
        albedo *= 1.0 - 0.35 * max(lines(u, 20.0, 0.12, fu), lines(h, 12.5, 0.12, fh));
        albedo *= 1.0 - 0.45 * lines(h - 25.0, 50.0, 1.5, fh);   // galleries
      }
    } else if (kind == 3) {         // a spoke, the hub: rings round it and grooves along it
      float along = abs(n.y) > 0.5 ? r : p.y + r;
      float fa = fwidth(along);
      albedo *= 1.0 - 0.3 * lines(along, 20.0, 0.3, fa);
      albedo *= 0.92 + 0.08 * noise(vec2(along * 0.05, th * 40.0));
    } else if (kind == 4) {         // a lamp
      emit = vColour * 2.5;
      albedo = vec3(0.0);
    } else if (kind == 5) {         // the lobby's grip floor: rubber tiles and guide lines
      float s = th * RL, fs = fwidth(s), fc = fwidth(p.y);
      albedo *= 0.85 + 0.15 * hash(floor(vec2(s, p.y)));
      albedo *= 1.0 - 0.4 * max(lines(s, 1.0, 0.02, fs), lines(p.y, 1.0, 0.02, fc));
      float guide = lines(s, ${f(SECTOR * RL)}, 0.25, fs);
      albedo = mix(albedo, vec3(0.6, 0.45, 0.05), guide * step(${f(CC + SHAFT + 0.5)}, p.y));
      albedo = mix(albedo, vec3(0.6, 0.45, 0.05), lines(p.y - 30.0, 1000.0, 0.25, fc));
    } else if (kind == 6) {         // the lobby's end walls: rings and rays
      float fr = fwidth(r), ray = 6.2831853 / 12.0;
      float off = abs(th - ray * floor(th / ray + 0.5)) * r;
      albedo *= 1.0 - 0.35 * max(lines(r, 15.0, 0.15, fr), lines(off, 1000.0, 0.15, fr) * step(20.0, r));
    }
    vec3 colour = kind == 4 ? emit : lit(albedo, p, n);
    gl_FragColor = vec4(hazed(colour, p), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// The roof: glazing on its lattice, the lamps along its beams; the sky shows through.
const ROOF_FRAGMENT = /* glsl */ `
  ${COMMON}
  varying vec3 vWorld;
  varying vec3 vNormal;
  void main() {
    vec3 p = vWorld;
    vec2 sc = vec2(atan(p.x, p.z) * ROOF, p.y);
    float blur = max(fwidth(sc.x), fwidth(sc.y)) * 1.5;
    float cover = lattice(sc, blur);
    float lamp = bars(sc.y + HALF + 125.0, 250.0, 0.35, blur) * (1.0 - bars(sc.x, 12.5, 2.0, blur));
    vec3 n = upAt(p);
    if (dot(n, cameraPosition - p) < 0.0) n = -n;   // the side the eye sees
    vec3 beam = litBy(vec3(0.16, 0.17, 0.19), p, n, false);
    vec3 colour = beam * cover + vec3(1.0, 0.92, 0.8) * 3.0 * lamp;
    float alpha = clamp(cover + lamp + 0.07, 0.0, 1.0);
    colour = hazed(colour, p);
    gl_FragColor = vec4(colour, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// Glass: the lifts' cars and their shafts through the band. A tint, the fill's light off it, and the Sun's.
const GLASS_FRAGMENT = /* glsl */ `
  ${COMMON}
  varying vec3 vWorld;
  varying vec3 vNormal;
  void main() {
    vec3 n = normalize(vNormal);
    vec3 v = normalize(cameraPosition - vWorld);
    if (dot(n, v) < 0.0) n = -n;
    float fres = 0.04 + 0.96 * pow(1.0 - max(dot(v, n), 0.0), 5.0);
    vec3 colour = vec3(0.5, 0.6, 0.65) * lit(vec3(0.12), vWorld, n) + uFillSky * fres * 0.6;
    colour += uSunLight * 3.0 * pow(max(dot(reflect(-v, n), uSun), 0.0), 300.0) * sunReach(vWorld + n * 0.05, uSun);
    gl_FragColor = vec4(hazed(colour, vWorld), clamp(0.1 + fres * 0.6, 0.0, 0.85));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function makeLight() {
  return {
    uSun: { value: new THREE.Vector3(0, 1, 0) },
    uSunLight: { value: new THREE.Vector3(0, 0, 0) },
    uFillSky: { value: new THREE.Vector3(0.3, 0.33, 0.37) },
    uFillGround: { value: new THREE.Vector3(0.1, 0.1, 0.09) },
    uLobbyLight: { value: new THREE.Vector3(0.9, 0.88, 0.82) },
    uEarth: { value: new THREE.Vector3(0, -1, 0) },
    uEarthLight: { value: new THREE.Vector3(0, 0, 0) },
    uHaze: { value: new THREE.Vector3(0.3, 0.34, 0.4) },
    uHazeDist: { value: 14000 },
  };
}

function material(fragment, light, extra = {}) {
  return new THREE.ShaderMaterial({ vertexShader: VERTEX, fragmentShader: fragment, uniforms: { ...light }, ...extra });
}

// ---- building: triangles with the attributes the shaders read ----------------------------------

class Mesher {
  constructor() { this.pos = []; this.nor = []; this.col = []; this.kind = []; this.plan = []; }
  // a triangle a b c, wound to face n; each corner its own normal if ns is given
  tri(a, b, c, n, colour, kind, plans) {
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const x = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const flip = x[0] * n[0] + x[1] * n[1] + x[2] * n[2] < 0;
    const order = flip ? [0, 2, 1] : [0, 1, 2];
    const v = [a, b, c];
    for (const i of order) {
      this.pos.push(v[i][0], v[i][1], v[i][2]);
      this.nor.push(n[0], n[1], n[2]);
      this.col.push(colour[0], colour[1], colour[2]);
      this.kind.push(kind);
      const p = plans ? plans[i] : [0, 0, 0, 0];
      this.plan.push(p[0], p[1], p[2], p[3]);
    }
  }
  quad(a, b, c, d, n, colour = [1, 1, 1], kind = 0, plans = null) {
    this.tri(a, b, c, n, colour, kind, plans && [plans[0], plans[1], plans[2]]);
    this.tri(a, c, d, n, colour, kind, plans && [plans[0], plans[2], plans[3]]);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aKind', new THREE.Float32BufferAttribute(this.kind, 1));
    g.setAttribute('aPlan', new THREE.Float32BufferAttribute(this.plan, 4));
    g.computeBoundingSphere();
    return g;
  }
  get empty() { return this.pos.length === 0; }
}

// A sector's frame: its middle on the floor at angle th0; x spinward there, y the axis, z outward. A place
// (s, c, h), s from the middle along the floor of radius R, h above it, in that frame.
function bender(R) {
  return {
    at: (s, c, h) => { const t = s / R, r = R - h; return [r * Math.sin(t), c, r * Math.cos(t) - R]; },
    up: (s) => { const t = s / R; return [-Math.sin(t), 0, -Math.cos(t)]; },
    spin: (s) => { const t = s / R; return [Math.cos(t), 0, -Math.sin(t)]; },
  };
}

// A box standing on a curved floor, bent to it: s0..s1 along it, c0..c1 across, h0..h1 above it.
function bentBox(m, B, s0, s1, c0, c1, h0, h1, colour, kind, ends = true) {
  const n = Math.max(1, Math.ceil((s1 - s0) / 6));
  for (let i = 0; i < n; i++) {
    const a = s0 + ((s1 - s0) * i) / n, b = s0 + ((s1 - s0) * (i + 1)) / n, mid = (a + b) / 2;
    m.quad(B.at(a, c0, h1), B.at(b, c0, h1), B.at(b, c1, h1), B.at(a, c1, h1), B.up(mid), colour, kind);
    m.quad(B.at(a, c0, h0), B.at(b, c0, h0), B.at(b, c0, h1), B.at(a, c0, h1), [0, -1, 0], colour, kind);
    m.quad(B.at(a, c1, h0), B.at(b, c1, h0), B.at(b, c1, h1), B.at(a, c1, h1), [0, 1, 0], colour, kind);
  }
  if (!ends) return;
  const sa = B.spin(s0), sb = B.spin(s1);
  m.quad(B.at(s0, c0, h0), B.at(s0, c1, h0), B.at(s0, c1, h1), B.at(s0, c0, h1), [-sa[0], 0, -sa[2]], colour, kind);
  m.quad(B.at(s1, c0, h0), B.at(s1, c1, h0), B.at(s1, c1, h1), B.at(s1, c0, h1), sb, colour, kind);
}

// A straight box in some frame: x0..x1, y0..y1, z0..z1, all six faces.
function straightBox(m, x0, x1, y0, y1, z0, z1, colour, kind) {
  const P = (x, y, z) => [x, y, z];
  m.quad(P(x0, y0, z0), P(x0, y1, z0), P(x0, y1, z1), P(x0, y0, z1), [-1, 0, 0], colour, kind);
  m.quad(P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1), [1, 0, 0], colour, kind);
  m.quad(P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1), [0, -1, 0], colour, kind);
  m.quad(P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1), [0, 1, 0], colour, kind);
  m.quad(P(x0, y0, z0), P(x1, y0, z0), P(x1, y1, z0), P(x0, y1, z0), [0, 0, -1], colour, kind);
  m.quad(P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1), [0, 0, 1], colour, kind);
}

// The frame turned to angle th about the axis: x spinward, y the axis, z outward there.
function placeAt(obj, th, r) {
  obj.position.set(r * Math.sin(th), 0, r * Math.cos(th));
  obj.rotation.set(0, th, 0);
  return obj;
}

const BLOCK_COLOURS = [[0.50, 0.48, 0.45], [0.58, 0.56, 0.51], [0.46, 0.48, 0.51], [0.62, 0.58, 0.52], [0.54, 0.52, 0.56], [0.42, 0.42, 0.40]];
const KIND = { plain: 0, block: 1, wall: 2, spoke: 3, lamp: 4, lobbyFloor: 5, lobbyWall: 6 };

// ---- the band: floor, canal, blocks, walls, roof, sector by sector -------------------------------

function buildSector(j, boxes, mats) {
  const B = bender(RF), mid = j * STREET, plaza = j % (WALK.streets / RING.spokes) === 0;
  const half = STREET / 2, deck = plaza ? WALK.plazaDeck : WALK.street, steps = 96, ds = STREET / steps;
  const cuts = [...new Set([...Array.from({ length: steps + 1 }, (_, i) => -half + i * ds), -deck, deck])].sort((x, y) => x - y);
  const floor = new Mesher(), solid = new Mesher(), roof = new Mesher();
  const up = (s) => B.up(s);
  const P = (s, c, kind) => [s, c, kind, j];
  // the floor's top, either side of the canal, and over it on the deck
  for (let i = 0; i + 1 < cuts.length; i++) {
    const a = cuts[i], b = cuts[i + 1], n = up((a + b) / 2);
    for (const [c0, c1] of [[-HALF, -WALK.canal], [WALK.canal, HALF]]) {
      floor.quad(B.at(a, c0, 0), B.at(b, c0, 0), B.at(b, c1, 0), B.at(a, c1, 0), n, [1, 1, 1], 0, [P(a, c0, 0), P(b, c0, 0), P(b, c1, 0), P(a, c1, 0)]);
    }
  }
  for (const [a, b] of [[-deck, 0], [0, deck]]) {
    floor.quad(B.at(a, -WALK.canal, 0), B.at(b, -WALK.canal, 0), B.at(b, WALK.canal, 0), B.at(a, WALK.canal, 0), up((a + b) / 2), [1, 1, 1], 0,
      [P(a, -WALK.canal, 0), P(b, -WALK.canal, 0), P(b, WALK.canal, 0), P(a, WALK.canal, 0)]);
  }
  // the canal: water, its walls, the decks' edges
  const h = WATER;
  for (let i = 0; i + 1 < cuts.length; i++) {
    const a = cuts[i], b = cuts[i + 1], n = up((a + b) / 2);
    floor.quad(B.at(a, -WALK.canal, h), B.at(b, -WALK.canal, h), B.at(b, WALK.canal, h), B.at(a, WALK.canal, h), n, [1, 1, 1], 0,
      [P(a, -WALK.canal, 1), P(b, -WALK.canal, 1), P(b, WALK.canal, 1), P(a, WALK.canal, 1)]);
    if (b <= -deck || a >= deck) {
      for (const side of [-1, 1]) {
        const c = side * WALK.canal;
        floor.quad(B.at(a, c, 0), B.at(b, c, 0), B.at(b, c, h), B.at(a, c, h), [0, -side, 0], [1, 1, 1], 0, [P(a, c, 2), P(b, c, 2), P(b, c, 2), P(a, c, 2)]);
      }
    }
  }
  for (const side of [-1, 1]) {
    const s = side * deck, sp = B.spin(s);
    floor.quad(B.at(s, -WALK.canal, 0), B.at(s, WALK.canal, 0), B.at(s, WALK.canal, -0.8), B.at(s, -WALK.canal, -0.8), [side * sp[0], 0, side * sp[2]], [1, 1, 1], 0,
      [P(s, -WALK.canal, 2), P(s, WALK.canal, 2), P(s, WALK.canal, 2), P(s, -WALK.canal, 2)]);
  }
  // the solid things whose middle is in this sector
  let n = 0;
  for (const b of boxes) {
    if (b.zone !== WHERE.floor || b.kind === BOX.pylon || b.kind === BOX.shaft) continue;
    let rel = b.s - mid;
    rel -= Math.round(rel / (2 * Math.PI * RF)) * 2 * Math.PI * RF;
    if (rel < -half || rel >= half) continue;
    const colour = b.kind === BOX.block ? BLOCK_COLOURS[n++ % BLOCK_COLOURS.length] : [0.5, 0.47, 0.42];
    bentBox(solid, B, rel - b.half, rel + b.half, b.c0, b.c1, b.h0 - (b.kind === BOX.block ? 0.3 : 0), b.h1, colour, b.kind === BOX.block ? KIND.block : KIND.plain);
  }
  // the rim walls, from the floor to their tops
  for (let i = 0; i < steps / 4; i++) {
    const a = -half + i * ds * 4, b = a + ds * 4;
    for (const side of [-1, 1]) {
      const c = side * HALF;
      solid.quad(B.at(a, c, 0), B.at(b, c, 0), B.at(b, c, RF - RIM_R), B.at(a, c, RF - RIM_R), [0, -side, 0], [0.36, 0.37, 0.39], KIND.wall);
    }
  }
  // the roof: one piece across, finely round
  const R = bender(RF);
  for (let i = 0; i < steps / 2; i++) {
    const a = -half + i * ds * 2, b = a + ds * 2, rh = RF - ROOF_R;
    roof.quad(R.at(a, -HALF, rh), R.at(b, -HALF, rh), R.at(b, HALF, rh), R.at(a, HALF, rh), up((a + b) / 2));
  }
  const group = placeAt(new THREE.Group(), mid / RF, RF);
  group.add(new THREE.Mesh(floor.geometry(), mats.floor));
  group.add(new THREE.Mesh(solid.geometry(), mats.box));
  const r = new THREE.Mesh(roof.geometry(), mats.roof);
  r.renderOrder = 2;
  group.add(r);
  group.userData.plaza = plaza;
  return group;
}

// ---- the spokes, the hub, the lifts' tubes and cars -------------------------------------------

function buildSpoke(k, mats) {
  const m = new Mesher(), r0 = RING.hub, r1 = RF, mid = (r0 + r1) / 2;
  straightBox(m, -SPOKE, SPOKE, -SPOKE, SPOKE, r0 - mid, r1 - mid, [0.44, 0.45, 0.46], KIND.spoke);
  // the lift's tube beside it: four corner posts and a frame every 25 m, from under the hub to the roof
  const t0 = RING.hub, t1 = ROOF_R, post = 0.25;
  for (const x of [-SHAFT, SHAFT]) for (const c of [CC - SHAFT, CC + SHAFT]) straightBox(m, x - post, x + post, c - post, c + post, t0 - mid, t1 - mid, [0.1, 0.11, 0.12], KIND.plain);
  for (let r = t0 + 25, i = 0; r < t1; r += 25, i++) {
    straightBox(m, -SHAFT, SHAFT, CC - SHAFT - 0.15, CC - SHAFT + 0.15, r - mid - 0.15, r - mid + 0.15, [0.12, 0.13, 0.14], KIND.plain);
    straightBox(m, -SHAFT, SHAFT, CC + SHAFT - 0.15, CC + SHAFT + 0.15, r - mid - 0.15, r - mid + 0.15, [0.12, 0.13, 0.14], KIND.plain);
    for (const x of [-SHAFT, SHAFT]) straightBox(m, x - 0.15, x + 0.15, CC - SHAFT, CC + SHAFT, r - mid - 0.15, r - mid + 0.15, [0.12, 0.13, 0.14], KIND.plain);
    if (i % 4 === 0) straightBox(m, -0.4, 0.4, CC - SHAFT - 0.2, CC - SHAFT, r - mid - 0.4, r - mid + 0.4, [1, 0.85, 0.6], KIND.lamp);
  }
  // through the hub's shell, from the lobby's floor: a shaft with walls, lit
  const s0 = RL, s1 = RING.hub + 2;
  for (const x of [-SHAFT, SHAFT]) straightBox(m, x - 0.25, x + 0.25, CC - SHAFT, CC + SHAFT, s0 - mid, s1 - mid, [0.3, 0.31, 0.33], KIND.plain);
  for (const c of [CC - SHAFT, CC + SHAFT]) straightBox(m, -SHAFT, SHAFT, c - 0.25, c + 0.25, s0 - mid, s1 - mid, [0.3, 0.31, 0.33], KIND.plain);
  const g = new THREE.Mesh(m.geometry(), mats.box);
  const o = placeAt(new THREE.Group(), k * SECTOR, mid);
  o.add(g);
  return o;
}

function buildHub(mats) {
  const m = new Mesher(), seg = 96;
  const ring = (R, c0, c1, colour, kind) => {
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * 2 * Math.PI, b = ((i + 1) / seg) * 2 * Math.PI, n = outward((a + b) / 2);
      m.quad([R * Math.sin(a), c0, R * Math.cos(a)], [R * Math.sin(b), c0, R * Math.cos(b)], [R * Math.sin(b), c1, R * Math.cos(b)], [R * Math.sin(a), c1, R * Math.cos(a)], n, colour, kind);
    }
  };
  ring(RING.hub, -RING.port, RING.port, [0.5, 0.51, 0.52], KIND.spoke);
  ring(RING.hub + 25, -45, 45, [0.18, 0.19, 0.2], KIND.plain);
  for (const c of [-45, 45]) {   // the collar's faces
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * 2 * Math.PI, b = ((i + 1) / seg) * 2 * Math.PI, R0 = RING.hub, R1 = RING.hub + 25;
      m.quad([R0 * Math.sin(a), c, R0 * Math.cos(a)], [R0 * Math.sin(b), c, R0 * Math.cos(b)], [R1 * Math.sin(b), c, R1 * Math.cos(b)], [R1 * Math.sin(a), c, R1 * Math.cos(a)], [0, Math.sign(c), 0], [0.18, 0.19, 0.2], KIND.plain);
    }
  }
  for (const c of [-RING.port, RING.port]) {   // the ends
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * 2 * Math.PI, b = ((i + 1) / seg) * 2 * Math.PI, R = RING.hub;
      m.tri([0, c, 0], [R * Math.sin(a), c, R * Math.cos(a)], [R * Math.sin(b), c, R * Math.cos(b)], [0, Math.sign(c), 0], [0.5, 0.51, 0.52], KIND.spoke);
    }
  }
  return new THREE.Mesh(m.geometry(), mats.box);
}

// A car, in its own frame: x spinward, y up (toward the axis), z along the axis; its floor's middle at the origin.
function buildCar(mats) {
  const frame = new Mesher(), glass = new Mesher(), metal = [0.22, 0.23, 0.25], H = WALK.carTall;
  straightBox(frame, -CAR, CAR, -0.25, 0, -CAR, CAR, [0.3, 0.3, 0.32], KIND.plain);               // the floor
  straightBox(frame, -CAR, CAR, H, H + 0.25, -CAR, CAR, metal, KIND.plain);                       // the roof
  for (const x of [-CAR, CAR]) for (const z of [-CAR, CAR]) straightBox(frame, x - 0.08, x + 0.08, 0, H, z - 0.08, z + 0.08, metal, KIND.plain);
  for (const x of [-DOOR, DOOR]) straightBox(frame, x - 0.06, x + 0.06, 0, H, CAR - 0.06, CAR + 0.06, metal, KIND.plain);   // the door's jambs
  straightBox(frame, -DOOR, DOOR, WALK.doorTall, WALK.doorTall + 0.1, CAR - 0.06, CAR + 0.06, metal, KIND.plain);
  for (const [x0, x1, z0, z1] of [[-CAR + 0.1, -CAR + 0.15, -CAR, CAR], [CAR - 0.15, CAR - 0.1, -CAR, CAR], [-CAR, CAR, -CAR + 0.1, -CAR + 0.15]]) {
    straightBox(frame, x0, x1, 0.98, 1.04, z0, z1, [0.3, 0.3, 0.29], KIND.plain);              // the rail
  }
  straightBox(frame, -1.0, 1.0, H - 0.03, H, -1.0, 1.0, [1, 0.95, 0.85], KIND.lamp);            // its lamp
  const pane = (a, b, c, d, n) => glass.quad(a, b, c, d, n);
  pane([-CAR, 0, -CAR], [-CAR, 0, CAR], [-CAR, H, CAR], [-CAR, H, -CAR], [-1, 0, 0]);
  pane([CAR, 0, -CAR], [CAR, 0, CAR], [CAR, H, CAR], [CAR, H, -CAR], [1, 0, 0]);
  pane([-CAR, 0, -CAR], [CAR, 0, -CAR], [CAR, H, -CAR], [-CAR, H, -CAR], [0, 0, -1]);
  for (const [x0, x1] of [[-CAR, -DOOR], [DOOR, CAR]]) pane([x0, 0, CAR], [x1, 0, CAR], [x1, H, CAR], [x0, H, CAR], [0, 0, 1]);
  pane([-DOOR, WALK.doorTall, CAR], [DOOR, WALK.doorTall, CAR], [DOOR, H, CAR], [-DOOR, H, CAR], [0, 0, 1]);
  const group = new THREE.Group();
  group.add(new THREE.Mesh(frame.geometry(), mats.box));
  const g = new THREE.Mesh(glass.geometry(), mats.glass);
  g.renderOrder = 3;
  group.add(g);
  // its door: two leaves that part
  const leaf = new Mesher();
  straightBox(leaf, -DOOR / 2, DOOR / 2, 0, WALK.doorTall, -0.03, 0.03, [0.35, 0.36, 0.38], KIND.plain);
  const leafGeometry = leaf.geometry();
  group.userData.leaves = [-1, 1].map((side) => {
    const l = new THREE.Mesh(leafGeometry, mats.box);
    l.position.set((side * DOOR) / 2, 0, CAR + 0.12);
    l.userData.side = side;
    group.add(l);
    return l;
  });
  return group;
}

// A station's door, in the shaft's +c wall: two leaves in a frame like the car's.
function buildStationDoor(mats) {
  const leaf = new Mesher();
  straightBox(leaf, -DOOR / 2, DOOR / 2, 0, WALK.doorTall, -0.04, 0.04, [0.55, 0.42, 0.12], KIND.plain);
  const g = leaf.geometry(), group = new THREE.Group();
  group.userData.leaves = [-1, 1].map((side) => {
    const l = new THREE.Mesh(g, mats.box);
    l.position.set((side * DOOR) / 2, 0, 0);
    l.userData.side = side;
    group.add(l);
    return l;
  });
  return group;
}

// The shafts' walls through the band, from the core's plan: glass in a frame.
function buildShafts(boxes, mats) {
  const group = new THREE.Group();
  for (let k = 0; k < RING.spokes; k++) {
    const frame = new Mesher(), glass = new Mesher(), B = bender(RF), mid = k * SECTOR * RF;
    for (const b of boxes) {
      if (b.zone !== WHERE.floor || b.kind !== BOX.shaft) continue;
      let rel = b.s - mid;
      rel -= Math.round(rel / (2 * Math.PI * RF)) * 2 * Math.PI * RF;
      if (Math.abs(rel) > 20) continue;
      const s0 = rel - b.half, s1 = rel + b.half;
      // glass on its faces, and a frame at its edges and every 25 m up
      const faces = [
        [B.at(s0, b.c0, b.h0), B.at(s1, b.c0, b.h0), B.at(s1, b.c0, b.h1), B.at(s0, b.c0, b.h1), [0, -1, 0]],
        [B.at(s0, b.c1, b.h0), B.at(s1, b.c1, b.h0), B.at(s1, b.c1, b.h1), B.at(s0, b.c1, b.h1), [0, 1, 0]],
        [B.at(s0, b.c0, b.h0), B.at(s0, b.c1, b.h0), B.at(s0, b.c1, b.h1), B.at(s0, b.c0, b.h1), [-1, 0, 0]],
        [B.at(s1, b.c0, b.h0), B.at(s1, b.c1, b.h0), B.at(s1, b.c1, b.h1), B.at(s1, b.c0, b.h1), [1, 0, 0]],
      ];
      for (const [p, q, r, s, n] of faces) glass.quad(p, q, r, s, n);
      for (const [x, c] of [[s0, b.c0], [s0, b.c1], [s1, b.c0], [s1, b.c1]]) bentBox(frame, B, x - 0.1, x + 0.1, c - 0.1, c + 0.1, b.h0, b.h1, [0.12, 0.13, 0.14], KIND.plain);
      for (let h = Math.max(b.h0, 2.5); h < b.h1; h += h < 10 ? 2.5 : 25) bentBox(frame, B, s0 - 0.05, s1 + 0.05, b.c0 - 0.05, b.c1 + 0.05, h - 0.06, h + 0.06, [0.12, 0.13, 0.14], KIND.plain, true);
    }
    const o = placeAt(new THREE.Group(), k * SECTOR, RF);
    o.add(new THREE.Mesh(frame.geometry(), mats.box));
    const g = new THREE.Mesh(glass.geometry(), mats.glass);
    g.renderOrder = 3;
    o.add(g);
    group.add(o);
  }
  return group;
}

// ---- the hub's lobby ----------------------------------------------------------------------------

function buildLobby(boxes, mats) {
  const group = new THREE.Group(), floor = new Mesher(), walls = new Mesher(), solid = new Mesher();
  // the floor: a drum about the axis, with a hole where each lift goes down
  const holes = [];
  for (let k = 0; k < RING.spokes; k++) holes.push([k * SECTOR - SHAFT / RL, k * SECTOR + SHAFT / RL]);
  const breaks = new Set();
  for (let i = 0; i <= 240; i++) breaks.add((i / 240) * 2 * Math.PI);
  for (const [a, b] of holes) { breaks.add((a + 2 * Math.PI) % (2 * Math.PI)); breaks.add(b); }
  const ths = [...breaks].sort((x, y) => x - y);
  const cs = [WALK.lobbyC0, CC - SHAFT, CC + SHAFT, WALK.lobbyC1];
  const inHole = (th, c) => c > CC - SHAFT && c < CC + SHAFT && holes.some(([a, b]) => {
    const d = ((th - (a + b) / 2 + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
    return Math.abs(d) < (b - a) / 2;
  });
  const P = (th, c, r = RL) => [r * Math.sin(th), c, r * Math.cos(th)];
  for (let i = 0; i < ths.length; i++) {
    const a = ths[i], b = i + 1 < ths.length ? ths[i + 1] : 2 * Math.PI;
    if (b - a < 1e-9) continue;
    for (let j = 0; j + 1 < cs.length; j++) {
      const c0 = cs[j], c1 = cs[j + 1];
      if (inHole((a + b) / 2, (c0 + c1) / 2)) continue;
      const inward = outward((a + b) / 2).map((v) => -v);
      floor.quad(P(a, c0), P(b, c0), P(b, c1), P(a, c1), inward, [0.2, 0.21, 0.22], KIND.lobbyFloor);
      floor.quad(P(a, c0, RL + 1), P(b, c0, RL + 1), P(b, c1, RL + 1), P(a, c1, RL + 1), outward((a + b) / 2), [0.25, 0.26, 0.27], KIND.plain);   // its underside
    }
  }
  // the end walls: discs
  const seg = 120;
  for (const [c, facing] of [[WALK.lobbyC0, 1], [WALK.lobbyC1, -1]]) {
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * 2 * Math.PI, b = ((i + 1) / seg) * 2 * Math.PI;
      for (const [r0, r1] of [[0, 50], [50, 100], [100, RL]]) {
        walls.quad(P(a, c, r0), P(b, c, r0), P(b, c, r1), P(a, c, r1), [0, facing, 0], [0.34, 0.35, 0.37], KIND.lobbyWall);
      }
    }
  }
  // lamps in the end walls: rings of them
  for (const [c, facing] of [[WALK.lobbyC0, 1], [WALK.lobbyC1, -1]]) {
    for (const [r, n] of [[40, 12], [85, 24], [128, 36]]) {
      for (let i = 0; i < n; i++) {
        const a = ((i + 0.5) / n) * 2 * Math.PI, w = 2.2 / r, cc = c + facing * 0.05;
        walls.quad(P(a - w, cc, r - 1.2), P(a + w, cc, r - 1.2), P(a + w, cc, r + 1.2), P(a - w, cc, r + 1.2), [0, facing, 0], [1, 0.93, 0.8], KIND.lamp);
      }
    }
  }
  // its lamp: a rod along the axis
  const rod = 1.2;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * 2 * Math.PI, b = ((i + 1) / 24) * 2 * Math.PI;
    walls.quad(P(a, WALK.lobbyC0, rod), P(b, WALK.lobbyC0, rod), P(b, WALK.lobbyC1, rod), P(a, WALK.lobbyC1, rod), outward((a + b) / 2), [1, 0.97, 0.9], KIND.lamp);
  }
  // the hatch to the craft, in the near end wall at spoke 1's angle: its frame lit
  const B = bender(RL);
  const hatchFrame = [0.62, 0.9, 1.0];
  for (const [s0, s1, h0, h1] of [[-1.6, -1.4, 0, 2.7], [1.4, 1.6, 0, 2.7], [-1.6, 1.6, 2.5, 2.7]]) {
    bentBox(solid, B, s0, s1, WALK.lobbyC0, WALK.lobbyC0 + 0.1, h0, h1, hatchFrame, KIND.lamp);
  }
  bentBox(solid, B, -1.4, 1.4, WALK.lobbyC0, WALK.lobbyC0 + 0.02, 0, 2.5, [0.03, 0.035, 0.04], KIND.plain, false);
  // the lifts' housings, from the core's plan
  for (const b of boxes) {
    if (b.zone !== WHERE.hub) continue;
    bentBox(solid, B, b.s - b.half, b.s + b.half, b.c0, b.c1, b.h0, b.h1, [0.7, 0.7, 0.68], KIND.plain);
  }
  // a lamp over each lift's door
  for (let k = 0; k < RING.spokes; k++) {
    const s = k * SECTOR * RL;
    bentBox(solid, B, s - 0.8, s + 0.8, CC + SHAFT, CC + SHAFT + 0.05, WALK.doorTall + 0.3, WALK.doorTall + 0.5, [1, 0.8, 0.3], KIND.lamp);
  }
  const placed = new THREE.Group();   // the lobby is built about the axis: a bender's frame placed at radius RL, angle 0
  placed.position.set(0, 0, RL);
  placed.add(new THREE.Mesh(solid.geometry(), mats.box));
  placed.add(sign('THE CRAFT', B, 0, WALK.lobbyC0 + 0.06, 2.85, 2.4));
  for (let k = 0; k < RING.spokes; k++) placed.add(sign(`LIFT ${k + 1} · DOWN`, B, k * SECTOR * RL, CC + SHAFT + 0.06, 3.2, 2.4));
  group.add(new THREE.Mesh(floor.geometry(), mats.box), new THREE.Mesh(walls.geometry(), mats.box), placed);
  return group;
}

// A sign on a wall facing +c, in a bender's frame: words lit on a dark plate, s and h its middle, w wide.
function sign(text, B, s, c, h, w) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const g = canvas.getContext('2d');
  g.fillStyle = '#10161d';
  g.fillRect(0, 0, 512, 96);
  g.fillStyle = '#ffd36b';
  g.font = '600 52px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 50);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(w, (w * 96) / 512), new THREE.MeshBasicMaterial({ map }));
  plate.position.set(...B.at(s, c, h));
  // the plate's x along the floor (spinward at s), its y up there, its face toward +c
  const sp = B.spin(s), up = B.up(s);
  plate.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(...sp), new THREE.Vector3(...up), new THREE.Vector3(0, 1, 0)));
  return plate;
}

// ---- the whole --------------------------------------------------------------------------------

export class WalkWorld {
  // boxes: the core's plan (WalkCore.boxes())
  constructor(boxes) {
    this.light = makeLight();
    const mats = {
      floor: material(FLOOR_FRAGMENT, this.light),
      box: material(BOX_FRAGMENT, this.light),
      roof: material(ROOF_FRAGMENT, this.light, { transparent: true, depthWrite: false, side: THREE.DoubleSide }),
      glass: material(GLASS_FRAGMENT, this.light, { transparent: true, depthWrite: false, side: THREE.DoubleSide }),
    };
    this.mats = mats;
    this.scene = new THREE.Scene();
    this.band = new THREE.Group();          // the rim floor and all that stands in the band
    for (let j = 0; j < SECTORS; j++) this.band.add(buildSector(j, boxes, mats));
    this.band.add(buildShafts(boxes, mats));
    this.outside = new THREE.Group();       // what is seen from outside the hub: the spokes and tubes, the hub
    for (let k = 0; k < RING.spokes; k++) this.outside.add(buildSpoke(k, mats));
    this.outside.add(buildHub(mats));
    this.lobby = buildLobby(boxes, mats);
    this.cars = [];
    this.doors = [];
    for (let k = 0; k < RING.spokes; k++) {
      const car = buildCar(mats);
      car.userData.open = 0;
      this.cars.push(car);
      this.scene.add(car);
      for (const [R, zone] of [[RL, WHERE.hub], [RF, WHERE.floor]]) {
        const d = buildStationDoor(mats);
        const holder = placeAt(new THREE.Group(), k * SECTOR, R);
        const B = bender(R);
        d.position.set(...B.at(0, CC + SHAFT - 0.25, 0));
        // in the holder's frame x is spinward and z outward: the leaves' own frame is x spinward, y up, z along the axis
        d.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0)));
        holder.add(d);
        if (zone === WHERE.floor) holder.add(sign(`LIFT ${k + 1} · UP TO THE HUB`, B, 0, CC + SHAFT + 0.06, 2.8, 2.4));
        holder.userData = { k, zone, door: d, open: 0 };
        this.doors.push(holder);
        (zone === WHERE.hub ? this.lobby : this.band).add(holder);
      }
    }
    // the ball, and a mark on the floor straight below where it was let go
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(WALK.ball, 16, 12), new THREE.MeshBasicMaterial({ color: 0xff7a1a }));
    this.ball.visible = false;
    this.mark = new THREE.Mesh(new THREE.RingGeometry(0.06, 0.1, 24), new THREE.MeshBasicMaterial({ color: 0xffd36b, side: THREE.DoubleSide }));
    this.mark.visible = false;
    this.scene.add(this.band, this.outside, this.lobby, this.ball, this.mark);
  }

  // o: the walk's readouts; dt: s since the last frame (for the doors)
  update(o, dt) {
    const where = Math.round(o.where), inLobby = where === WHERE.hub || (where === WHERE.lift && o.liftR < RL + 1);
    this.lobby.visible = where === WHERE.hub || (where === WHERE.lift && o.liftR < RL + 400);
    this.band.visible = !inLobby;
    this.outside.visible = !inLobby;
    for (let k = 0; k < RING.spokes; k++) {
      const car = this.cars[k], r = o[`carR${k}`], th = k * SECTOR;
      const up = outward(th).map((v) => -v), sp = spinward(th);
      car.position.set(r * Math.sin(th), CC, r * Math.cos(th));
      car.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(...sp), new THREE.Vector3(...up), new THREE.Vector3(0, 1, 0)));
      const atHub = Math.abs(r - RL) < 1e-6, atFloor = Math.abs(r - RF) < 1e-6;
      car.visible = this.band.visible || atHub || r < RL + 400;
      car.userData.open = approach(car.userData.open, atHub || atFloor ? 1 : 0, dt * 1.2);
      for (const l of car.userData.leaves) l.position.x = l.userData.side * (DOOR / 2 + car.userData.open * DOOR * 0.95);
    }
    for (const d of this.doors) {
      const r = o[`carR${d.userData.k}`], here = d.userData.zone === WHERE.hub ? RL : RF;
      d.userData.open = approach(d.userData.open, Math.abs(r - here) < 1e-6 ? 1 : 0, dt * 1.2);
      for (const l of d.userData.door.userData.leaves) l.position.x = l.userData.side * (DOOR / 2 + d.userData.open * DOOR * 0.95);
    }
    const ball = Math.round(o.ball);
    this.ball.visible = ball !== 0;
    if (this.ball.visible) this.ball.position.set(o.ballX, o.ballY, o.ballZ);
  }

  // Where the last ball was let go, on the floor straight below it (ring frame), or null.
  markAt(p, up) {
    this.mark.visible = !!p;
    if (!p) return;
    this.mark.position.set(...p);
    this.mark.lookAt(p[0] + up[0], p[1] + up[1], p[2] + up[2]);
  }
}

function approach(v, target, step) { return v < target ? Math.min(target, v + step) : Math.max(target, v - step); }
