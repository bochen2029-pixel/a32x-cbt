// The spaceplane: a blended delta lifting body 34 m long and 18 m across, the core's sixty tonnes. White
// above with its panel lines, black tiles below, dark leading edges; the cockpit's windows; two bells
// for the one fictional drive and its plume; the small thrusters in four quads; red, green and white
// lights. The shape is craft-shape.js's; every texture is painted by code (paint.js); how much is
// drawn is the tier's (quality.js). Built in its own frame: x forward, y up, z to the right wing; the
// gear's wheels touch where the core's contact points are (orbit_core.cpp, GEAR). GPLv3.

import * as THREE from 'three';
import {
  BELL, BELLY, ENGINES, FIN, GEAR, GROUND, NOSE, SPAN, TAIL, WINDOWS, base, finRoot, halfSpan, loft, navLights, plume, surfaces,
  thrusterQuads,
} from './craft-shape.js';
import { lightPoints, lightsMaterial } from './glow.js';
import { Paint, rng } from './paint.js';

export { section } from './craft-shape.js';

const L = NOSE - TAIL;

function dataTexture(bytes, w, h, { srgb = false, anisotropy = 4 } = {}) {
  const t = new THREE.DataTexture(bytes, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = anisotropy;
  t.needsUpdate = true;
  return t;
}

// The planform's texel for (x, z): u along x, v across the span, as the loft's uvs.
const texel = (x, z, w, h) => [((x - TAIL) / L) * w, (z / SPAN + 0.5) * h];

// The upper skin: white panels, a few grey ones, their seams; the leading edges and the nose cap in
// dark grey carbon; a dark surround to the cockpit's windows.
function paintTop(T, seed) {
  const w = T, h = T / 2, r = rng(seed);
  const sx = w / L, sz = h / SPAN;
  const p = new Paint(w, h, { base: [0.8, 0.8, 0.79], rough: 0.42, metal: 0.05 });
  for (let x = 0; x < w; ) {
    const pw = Math.round(sx * (1.2 + r() * 1.2));
    for (let y = 0; y < h; ) {
      const ph = Math.round(sz * (0.9 + r() * 0.9));
      const v = r() < 0.08 ? 0.66 + r() * 0.06 : 0.77 + r() * 0.06;
      p.rect(x, y, x + pw, y + ph, { albedo: [v, v, v * 0.985], height: 0.2, rough: 0.36 + r() * 0.12 });
      p.seam(x, y, x + pw, y + ph, 1, 0.5, 0.86);
      if (r() < 0.06) p.seam(x + pw * 0.2, y + ph * 0.2, x + pw * 0.8, y + ph * 0.8, 1, 0.3, 0.9);   // an access panel
      y += ph;
    }
    x += pw;
  }
  // rows of fasteners along the major seams
  for (let x = 0; x < w; x += Math.round(sx * 4)) for (let y = 0; y < h; y += 3) p.rect(x, y, x + 1, y + 1, { tint: 0.85 });
  // carbon at the leading edges and the nose, and round the cockpit's windows
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const x = TAIL + (i / w) * L, z = (j / h - 0.5) * SPAN;
    const edge = halfSpan(x) - Math.abs(z);
    if ((edge >= -0.2 && edge < 0.32 && x < 10) || x > NOSE - 1.1) p.rect(i, j, i + 1, j + 1, { albedo: [0.12, 0.12, 0.13], rough: 0.55, height: 0.1 });
  }
  const [ax, ay] = texel(8.8, -1.82, w, h), [bx, by] = texel(11.75, 1.82, w, h);
  p.rect(ax, ay, bx, by, { albedo: [0.08, 0.085, 0.09], rough: 0.3 });
  // the elevons' hinge lines and the body flap's
  for (const x of [-13.4]) {
    const [i] = texel(x, 0, w, h);
    p.rect(i, 0, i + 2, h, { raise: -0.6, tint: 0.6 });
  }
  p.grain(r, 0.02, 0.03);
  return p;
}

// The belly: black tiles, a few grey ones put back, the gaps between; carbon at the edges and the nose;
// the gear doors' outlines.
function paintBelly(T, seed) {
  const w = T, h = T / 2, r = rng(seed);
  const sx = w / L, sz = h / SPAN;
  const tile = Math.max(2, Math.round(sx * (T >= 1024 ? 0.3 : 0.6)));
  const p = new Paint(w, h, { base: [0.035, 0.035, 0.037], rough: 0.82, metal: 0 });
  for (let x = 0; x < w; x += tile) {
    const shift = ((x / tile) % 2) * Math.floor(tile / 2);
    for (let y = -shift; y < h; y += tile) {
      const v = r() < 0.04 ? 0.09 + r() * 0.04 : 0.028 + r() * 0.03;
      p.rect(x, y, x + tile, y + tile, { albedo: [v, v * 0.98, v * 0.96], height: 0.3 + r() * 0.1, rough: 0.75 + r() * 0.15 });
      p.rect(x, y, x + tile, y + 1, { albedo: [0.015, 0.015, 0.016], height: 0 });
      p.rect(x, y, x + 1, y + tile, { albedo: [0.015, 0.015, 0.016], height: 0 });
    }
  }
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const x = TAIL + (i / w) * L, z = (j / h - 0.5) * SPAN;
    const edge = halfSpan(x) - Math.abs(z);
    if ((edge >= -0.2 && edge < 0.4 && x < 10) || x > NOSE - 1.4) p.rect(i, j, i + 1, j + 1, { albedo: [0.13, 0.13, 0.14], rough: 0.55, height: 0.35 });
  }
  for (const g of GEAR) {
    const [ax, ay] = texel(g.x + 2.4, g.z - (g.z ? 1.0 : 0.6), w, h), [bx, by] = texel(g.x - 2.4, g.z + (g.z ? 1.0 : 0.6), w, h);
    p.seam(bx, ay, ax, by, 1, 0.8, 0.5);
  }
  return p;
}

function bodyMaterial(top, belly, settings, aniso) {
  const maps = {
    top: dataTexture(top.albedoBytes(), top.w, top.h, { srgb: true, anisotropy: aniso }),
    belly: dataTexture(belly.albedoBytes(), belly.w, belly.h, { srgb: true, anisotropy: aniso }),
    topMask: dataTexture(top.maskBytes(), top.w, top.h, { anisotropy: aniso }),
    bellyMask: dataTexture(belly.maskBytes(), belly.w, belly.h, { anisotropy: aniso }),
    topNormal: settings.normalMaps ? dataTexture(top.normalBytes(2), top.w, top.h, { anisotropy: aniso }) : null,
    bellyNormal: settings.normalMaps ? dataTexture(belly.normalBytes(2), belly.w, belly.h, { anisotropy: aniso }) : null,
  };
  const m = new THREE.MeshStandardMaterial({
    map: maps.top, roughnessMap: maps.topMask, metalnessMap: maps.topMask, normalMap: maps.topNormal, roughness: 1, metalness: 1,
  });
  const uniforms = { uBelly: { value: maps.belly }, uBellyMask: { value: maps.bellyMask }, uBellyNormal: { value: maps.bellyNormal } };
  const normalChunk = THREE.ShaderChunk.normal_fragment_maps;
  const sample = 'texture2D( normalMap, vNormalMapUv ).xyz';
  if (maps.topNormal && !normalChunk.includes(sample)) throw new Error('three.js\'s normal map chunk has changed: the belly\'s tiles have nowhere to go');
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSkin;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSkin = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vSkin;
        uniform sampler2D uBelly;
        uniform sampler2D uBellyMask;
        ${maps.bellyNormal ? 'uniform sampler2D uBellyNormal;' : ''}`)
      .replace('#include <map_fragment>', `
        float belly = smoothstep(-0.1, -0.3, normalize(vSkin).y);
        vec4 sampledDiffuseColor = mix(texture2D(map, vMapUv), texture2D(uBelly, vMapUv), belly);
        diffuseColor *= sampledDiffuseColor;`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        vec4 bellyMask = texture2D(uBellyMask, vRoughnessMapUv);
        roughnessFactor = mix(roughnessFactor, bellyMask.g, belly);
        metalnessFactor = mix(metalnessFactor, bellyMask.b, belly);`)
      .replace('#include <normal_fragment_maps>', maps.bellyNormal
        ? normalChunk.replace(sample, `mix(${sample}, texture2D(uBellyNormal, vNormalMapUv).xyz, belly)`)
        : '#include <normal_fragment_maps>');
  };
  m.customProgramCacheKey = () => `craft-skin-${Boolean(maps.topNormal)}`;
  return { material: m, textures: Object.values(maps).filter(Boolean) };
}

// The plume: a volume marched along each ray through it. A hot core as wide as the bell's mouth that
// spreads and fades downstream; in the air the shock diamonds, bright where the flow recompresses,
// spaced by how far the exhaust is from the pressure round it; above the air a broad soft glow. Its
// light is brighter than white so the glow pass catches it. Drawn into a unit cylinder along -x scaled
// to the plume's size; the march is in metres.
function plumeMaterial(steps, shared) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uThrottle: { value: 0 }, uDiamonds: { value: 0 }, uSpacing: { value: 2.5 }, uLength: { value: 10 }, uRadius: { value: 1 },
      uVacuum: { value: 0 }, uTime: shared.uTime, uExit: { value: BELL.exit },
      uCore: { value: new THREE.Color(2.4, 3.2, 5.2) }, uSheath: { value: new THREE.Color(0.45, 0.75, 2.0) }, uDiamond: { value: new THREE.Color(7.0, 5.6, 6.4) },
    },
    defines: { STEPS: steps },
    vertexShader: /* glsl */ `
      varying vec3 vLocal;
      varying vec3 vEye;
      void main() {
        vLocal = position;
        vEye = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uThrottle, uDiamonds, uSpacing, uLength, uRadius, uVacuum, uTime, uExit;
      uniform vec3 uCore, uSheath, uDiamond;
      varying vec3 vLocal;
      varying vec3 vEye;
      void main() {
        vec3 k = vec3(uLength, uRadius, uRadius);
        vec3 o = vEye * k, p = vLocal * k;
        vec3 d = normalize(p - o);
        float tOut = length(p - o);
        // where the ray enters the cylinder (radius uRadius, x from -uLength to 0), if before tOut
        float a = dot(d.yz, d.yz), b = dot(o.yz, d.yz), c = dot(o.yz, o.yz) - uRadius * uRadius;
        float tIn = 0.0;
        if (a > 1e-6) { float disc = b * b - a * c; if (disc > 0.0) tIn = max(tIn, (-b - sqrt(disc)) / a); }
        if (abs(d.x) > 1e-6) { float t0 = (0.0 - o.x) / d.x, t1 = (-uLength - o.x) / d.x; tIn = max(tIn, min(t0, t1)); }
        tIn = clamp(tIn, 0.0, tOut);
        float dt = (tOut - tIn) / float(STEPS);
        float jitter = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
        vec3 sum = vec3(0.0);
        for (int i = 0; i < STEPS; i++) {
          vec3 q = o + d * (tIn + (float(i) + jitter) * dt);
          float x = max(-q.x, 0.0), xi = x / uLength, r2 = dot(q.yz, q.yz);
          float w = uExit * (0.85 + xi * (0.9 + 7.0 * uVacuum));
          float core = exp(-r2 / (w * w)) * exp(-xi * (3.0 + 1.0 * uVacuum)) * (uExit * uExit) / (w * w);
          float n = x / uSpacing;
          float knot = pow(0.5 + 0.5 * cos(6.2832 * n), 10.0) * exp(-n * 0.32) * smoothstep(0.3, 0.9, n) * uDiamonds;
          float kr = uExit * (0.5 + 0.08 * n);
          float sheath = exp(-r2 / (3.5 * w * w)) * exp(-xi * 2.2) * 0.2;
          sum += (uCore * core + uDiamond * knot * exp(-r2 / (kr * kr)) + uSheath * sheath) * dt;
        }
        float flicker = 1.0 + 0.05 * sin(uTime * 61.0) + 0.04 * sin(uTime * 23.0 + 1.3);
        gl_FragColor = vec4(sum * uThrottle * flicker, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide,
  });
}

// The bells' insides: dark metal, glowing toward the throat when the drive is lit.
function bellInside(shared) {
  return new THREE.ShaderMaterial({
    uniforms: { uHeat: { value: 0 } },
    vertexShader: /* glsl */ `
      varying float vT;
      void main() { vT = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uHeat;
      varying float vT;
      void main() {
        vec3 hot = mix(vec3(9.0, 6.0, 4.5), vec3(1.6, 0.5, 0.18), smoothstep(0.0, 1.0, vT));
        gl_FragColor = vec4(vec3(0.02) + hot * uHeat * (1.0 - 0.7 * vT), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
  });
}

// A bell's contour, throat to exit, for a lathe about the x axis: [radius, x] from the throat aft.
function bellProfile(n = 14) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push(new THREE.Vector2(BELL.throat + (BELL.exit - BELL.throat) * Math.pow(t, 0.62), -t * BELL.length));
  }
  return pts;
}

export class Craft {
  constructor(quality = null) {
    this.group = new THREE.Group();
    this.shared = { uTime: { value: 0 }, uPixelRatio: { value: 1 }, uDaylight: { value: 1 } };
    this.envMap = null;
    this.setQuality(quality || { craft: { stations: 44, around: 32, texture: 512, normalMaps: true, plumeSteps: 12 }, anisotropy: 8 });
  }

  setQuality(quality) {
    this.dispose();
    const q = quality.craft || quality, aniso = quality.anisotropy || 4;
    this.body = new THREE.Group();
    this.body.name = 'craft.body';
    this.group.add(this.body);
    const add = (g, m, parent = this.body) => {
      const mesh = new THREE.Mesh(g, m);
      mesh.castShadow = mesh.receiveShadow = true;
      parent.add(mesh);
      this.owned.push(mesh);
      return mesh;
    };

    // the skin: body and wing as one loft, the fins, the base
    const skin = bodyMaterial(paintTop(q.texture, 21), paintBelly(q.texture, 22), q, aniso);
    this.textures.push(...skin.textures);
    const shape = loft(q.stations, q.around);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(shape.positions, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(shape.uvs, 2));
    g.setIndex(shape.indices);
    g.computeVertexNormals();
    add(g, skin.material);
    for (const side of [-1, 1]) {
      const outline = new THREE.Shape(FIN.outline.map(([a, b]) => new THREE.Vector2(a, b)));
      const fin = new THREE.ExtrudeGeometry(outline, { depth: FIN.thickness, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.1, bevelSegments: 3, curveSegments: 4 });
      fin.translate(0, 0, -FIN.thickness / 2).rotateX(side * FIN.cant).translate(0, finRoot(), side * FIN.z);
      const pos = fin.attributes.position, uv = fin.attributes.uv;
      for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) - TAIL) / L, 0.5 + pos.getY(i) / SPAN);
      add(fin, skin.material);
    }
    const pts = base(Math.max(16, q.around));
    const bp = [], bi = [];
    for (const [z, lo, hi] of pts) bp.push(TAIL, lo, z, TAIL, hi, z);
    for (let j = 0; j < pts.length - 1; j++) { const a = j * 2; bi.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
    bg.setIndex(bi);
    bg.computeVertexNormals();
    const baseM = new THREE.MeshStandardMaterial({ color: 0x2c2e33, roughness: 0.6, metalness: 0.5, side: THREE.DoubleSide });
    const metal = new THREE.MeshStandardMaterial({ color: 0x3b3e44, roughness: 0.32, metalness: 0.9 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x05080c, roughness: 0.04, metalness: 0.0, envMapIntensity: 1.6 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1c1d20, roughness: 0.7, metalness: 0.2 });
    const strutM = new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.35, metalness: 0.8 });
    const tyreM = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9, metalness: 0 });
    this.materials.push(skin.material, baseM, metal, glass, dark, strutM, tyreM);
    add(bg, baseM);
    // the body flap under the bells
    add(new THREE.BoxGeometry(1.5, 0.24, 6.4).translate(TAIL - 0.7, BELLY + 0.2, 0), dark);

    // the cockpit's windows: panes laid on the skin, a hand's breadth proud of it
    const panes = [], ppos = [], pidx = [];
    for (const [x0, x1, z0, z1] of WINDOWS) {
      const n = 4, base0 = ppos.length / 3;
      for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
        const x = x0 + ((x1 - x0) * i) / n, z = z0 + ((z1 - z0) * j) / n;
        ppos.push(x, surfaces(x, z).top + 0.03, z);
      }
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const a = base0 + i * (n + 1) + j, b = a + 1, c = a + n + 1, d = c + 1;
        pidx.push(a, b, c, b, d, c);
      }
      panes.push(1);
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.Float32BufferAttribute(ppos, 3));
    pg.setIndex(pidx);
    pg.computeVertexNormals();
    add(pg, glass).castShadow = false;

    // the drive: a thrust frame, two bells, their hot insides, and the plumes
    add(new THREE.BoxGeometry(0.4, 1.6, 4.6).translate(TAIL - 0.2, 0.05, 0), dark);
    this.bellHeat = bellInside(this.shared);
    this.materials.push(this.bellHeat);
    this.plumes = [];
    const plumeM = plumeMaterial(q.plumeSteps, this.shared);
    this.plumeMaterial = plumeM;
    this.materials.push(plumeM);
    const profile = bellProfile();
    const unitCylinder = new THREE.CylinderGeometry(1, 1, 1, 20, 1, false).rotateZ(Math.PI / 2).translate(-0.5, 0, 0);
    this.geometries.push(unitCylinder);
    for (const e of ENGINES) {
      // the lathe turns about y, the throat at 0 and the mouth at -length; laid along x, mouth aft
      const outer = new THREE.LatheGeometry(profile, 28).rotateZ(-Math.PI / 2);
      const bell = add(outer, metal);
      bell.position.set(BELL.at, e.y, e.z);
      const inner = add(new THREE.LatheGeometry(profile.map((v) => new THREE.Vector2(v.x - 0.03, v.y)), 28).rotateZ(-Math.PI / 2), this.bellHeat);
      inner.position.copy(bell.position);
      inner.castShadow = false;
      const p = new THREE.Mesh(unitCylinder, plumeM);
      p.position.set(BELL.at - BELL.length + 0.1, e.y, e.z);
      p.renderOrder = 3;
      p.frustumCulled = false;
      this.group.add(p);
      this.owned.push(p);
      this.plumes.push(p);
    }

    // the small thrusters: a block and four nozzles a quad
    for (const t of thrusterQuads()) {
      const block = add(new THREE.BoxGeometry(0.7, 0.42, 0.18), dark);
      block.position.set(t.x, t.y, t.z + t.side * 0.06);
      for (const [dx, dy] of [[0.18, 0.1], [-0.18, 0.1], [0.18, -0.1], [-0.18, -0.1]]) {
        const nozzle = add(new THREE.CylinderGeometry(0.07, 0.035, 0.14, 8).rotateX(t.side * Math.PI / 2), metal);
        nozzle.position.set(t.x + dx, t.y + dy, t.z + t.side * 0.2);
        nozzle.castShadow = false;
      }
    }

    // the gear: the core's contact points, a strut and paired wheels at each
    this.gear = new THREE.Group();
    this.body.add(this.gear);
    for (const leg of GEAR) {
      const top = surfaces(leg.x, leg.z).bottom + 0.1, axle = GROUND + leg.wheel;
      const strut = add(new THREE.CylinderGeometry(0.13, 0.13, top - axle), strutM, this.gear);
      strut.position.set(leg.x, (top + axle) / 2, leg.z);
      for (const dz of [-0.28, 0.28]) {
        const wheel = add(new THREE.CylinderGeometry(leg.wheel, leg.wheel, 0.32, 20).rotateX(Math.PI / 2), tyreM, this.gear);
        wheel.position.set(leg.x, axle, leg.z + dz);
        const hub = add(new THREE.CylinderGeometry(leg.wheel * 0.55, leg.wheel * 0.55, 0.34, 12).rotateX(Math.PI / 2), strutM, this.gear);
        hub.position.copy(wheel.position);
      }
      const door = add(new THREE.BoxGeometry(2.0, 0.05, 0.8), dark, this.gear);
      door.position.set(leg.x, top - 0.25, leg.z + (leg.z >= 0 ? 0.75 : -0.75));
      door.rotation.x = leg.z >= 0 ? 1.2 : -1.2;
    }

    // the lights
    const lightM = lightsMaterial(this.shared);
    this.materials.push(lightM);
    this.navLights = lightPoints(navLights().map((l) => ({ ...l, size: 2.4 })), lightM);
    this.group.add(this.navLights);
    this.owned.push(this.navLights);

    if (this.envMap) this.setEnvMap(this.envMap);
  }

  setEnvMap(texture, intensity = 1) {
    this.envMap = texture;
    for (const m of this.materials) {
      if (!m.isMeshStandardMaterial) continue;
      m.envMap = texture;
      m.envMapIntensity = m.color && m.color.getHex() === 0x05080c ? 1.6 * intensity : intensity;
      m.needsUpdate = true;
    }
  }

  // rel: the CG from the eye, three.js axes; fwd, up, right: the body's axes, three.js axes;
  // s: the core's readouts; t: seconds, for the flicker and the blinking.
  update(rel, fwd, up, right, s, t, pixelRatio = null) {
    this.group.position.set(rel[0], rel[1], rel[2]);
    const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(...fwd), new THREE.Vector3(...up), new THREE.Vector3(...right));
    this.group.quaternion.setFromRotationMatrix(m);
    this.gear.visible = s.gear > 0.5;
    this.shared.uTime.value = t;
    if (pixelRatio) this.shared.uPixelRatio.value = pixelRatio;
    const thrust = s.throttle;
    const vacuum = Math.min(1, Math.max(0, (s.alt - 15000) / 45000));
    const shape = plume(thrust, vacuum);
    const u = this.plumeMaterial.uniforms;
    u.uThrottle.value = thrust;
    u.uDiamonds.value = shape.diamonds;
    u.uSpacing.value = shape.spacing;
    u.uLength.value = shape.length;
    u.uRadius.value = shape.radius * 2.2;
    u.uVacuum.value = vacuum;
    for (const p of this.plumes) {
      p.visible = thrust > 0.01;
      p.scale.set(shape.length, shape.radius * 2.2, shape.radius * 2.2);
    }
    this.bellHeat.uniforms.uHeat.value = Math.min(1, thrust * 1.4);
  }

  dispose() {
    for (const o of this.owned || []) { o.parent?.remove(o); if (o.geometry && !this.geometries?.includes(o.geometry)) o.geometry.dispose(); }
    for (const g of this.geometries || []) g.dispose();
    for (const m of this.materials || []) m.dispose();
    for (const t of this.textures || []) t.dispose();
    if (this.body) this.group.remove(this.body);
    this.owned = [];
    this.materials = [];
    this.textures = [];
    this.geometries = [];
  }
}
