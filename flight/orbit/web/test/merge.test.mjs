// Fewer draw calls, the same picture (merge.js): merged meshes draw exactly the triangles they drew before,
// in the same places and materials; only meshes that share a material, a parent and the way they are drawn
// merge; what moves, mirrors or is kept stays as it was. Runs with flight/web's three.js. GPLv3.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { register } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const three = join(here, '..', '..', '..', 'web', 'node_modules', 'three');
const why = !existsSync(join(three, 'build', 'three.module.js')) && `three.js is not at ${three}: npm ci in flight/web`;
let THREE, mergeStatic, trianglesByMaterial;
if (!why) {
  const main = pathToFileURL(join(three, 'build', 'three.module.js')).href, addons = pathToFileURL(join(three, 'examples', 'jsm')).href;
  register(`data:text/javascript,export async function resolve(s, c, next) {
    if (s === 'three') return { url: ${JSON.stringify(main)}, shortCircuit: true };
    if (s.startsWith('three/addons/')) return { url: ${JSON.stringify(addons)} + s.slice('three/addons'.length), shortCircuit: true };
    return next(s, c);
  }`);
  THREE = await import('three');
  ({ mergeStatic, trianglesByMaterial } = await import('../src/merge.js'));
}

const key = (tri) => tri.map((x) => x.toFixed(4)).join(',');
// the triangles each material draws, as a sorted list, for comparing before and after
function drawn(root) {
  const out = {};
  for (const [id, tris] of trianglesByMaterial(root)) out[id] = tris.map(key).sort();
  return out;
}
const meshes = (root) => { const out = []; root.traverse((m) => { if (m.isMesh) out.push(m); }); return out; };

function scene() {
  const root = new THREE.Group(), body = new THREE.Group(), gear = new THREE.Group();
  root.add(body, gear);
  body.position.set(10, -3, 4);
  body.rotation.set(0.3, 1.1, -0.2);
  const a = new THREE.MeshStandardMaterial(), b = new THREE.MeshStandardMaterial();
  const put = (parent, g, m, p, r) => { const x = new THREE.Mesh(g, m); x.position.set(...p); x.rotation.set(...r); parent.add(x); return x; };
  put(body, new THREE.BoxGeometry(1, 2, 3), a, [1, 2, 3], [0.1, 0.2, 0.3]);
  put(body, new THREE.CylinderGeometry(1, 2, 3, 12), a, [-4, 0, 1], [1.2, 0, 0]);
  put(body, new THREE.BoxGeometry(2, 2, 2).toNonIndexed(), a, [0, 5, 0], [0, 0, 0.7]);   // indexed and not, together
  put(body, new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(2, 0), new THREE.Vector2(1, 2)]), { depth: 0.3 }), a, [3, 3, 3], [0, 0.5, 0]);
  put(body, new THREE.TorusGeometry(3, 0.5, 6, 24), b, [0, 0, 0], [0.5, 0, 0]);
  put(body, new THREE.SphereGeometry(1, 8, 6), b, [6, 0, 0], [0, 0, 0]);
  const unlit = put(body, new THREE.BoxGeometry(1, 1, 1), a, [0, -6, 0], [0, 0, 0]);
  unlit.castShadow = true;   // drawn differently: kept apart from the others
  put(gear, new THREE.CylinderGeometry(0.5, 0.5, 0.3, 16), b, [1, -2, 0], [Math.PI / 2, 0, 0]);
  put(gear, new THREE.CylinderGeometry(0.5, 0.5, 0.3, 16), b, [1, -2, 1], [Math.PI / 2, 0, 0]);
  return { root, body, gear, a, b, unlit };
}

test('merged, the meshes draw the same triangles in the same places, a mesh for each material, parent and way of drawing', { skip: why }, () => {
  const { root, body, gear, a, b, unlit } = scene();
  const before = drawn(root);
  const all = meshes(root);
  const { merged, removed } = mergeStatic(all);
  assert.deepEqual(drawn(root), before);
  assert.equal(removed.length, 8);
  // body: a (four), b (two), a with a shadow (one, left as it was); gear: b (two)
  assert.equal(merged.length, 3);
  assert.equal(body.children.length, 3);
  assert.ok(body.children.includes(unlit));
  assert.equal(gear.children.length, 1);
  assert.deepEqual(body.children.filter((m) => m !== unlit).map((m) => m.material).sort((x, y) => x.id - y.id), [a, b]);
});

test('what moves, what is kept, what is mirrored, points and instanced meshes are left alone', { skip: why }, () => {
  const parent = new THREE.Group(), m = new THREE.MeshBasicMaterial();
  const one = new THREE.Mesh(new THREE.BoxGeometry(), m), two = new THREE.Mesh(new THREE.BoxGeometry(), m), mirrored = new THREE.Mesh(new THREE.BoxGeometry(), m);
  two.position.x = 3;
  mirrored.scale.x = -1;
  const pts = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3)), new THREE.PointsMaterial());
  const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(), m, 3);
  parent.add(one, two, mirrored, pts, inst);
  const kept = mergeStatic([one, two, mirrored, pts, inst], { keep: [two] });
  assert.equal(kept.merged.length, 0, 'with one of the two kept, nothing is left to merge with');
  assert.equal(parent.children.length, 5);
  const free = mergeStatic([one, two, mirrored, pts, inst]);
  assert.equal(free.merged.length, 1);
  assert.deepEqual(free.removed, [one, two]);
  assert.ok(parent.children.includes(mirrored) && parent.children.includes(pts) && parent.children.includes(inst));
});
