// Fewer draw calls, the same picture: static meshes that share a material, a parent and the way they are
// drawn (order, shadows, culling, visibility) are merged into one mesh, each one's own transform baked
// into its copy of the geometry. A Ring of sixty-odd parts in a dozen materials becomes a mesh a material;
// the craft's quads of nozzles, its gear's wheels and struts, the same. Points, lines, instanced meshes,
// meshes with morphs or a part of their geometry drawn, and any mesh asked to be kept (one that moves on
// its own) are left as they are. MIT.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// The key two meshes must share to be merged.
function keyOf(m) {
  const mat = m.material;
  return [m.parent ? m.parent.id : -1, mat.id, m.renderOrder, m.castShadow, m.receiveShadow, m.frustumCulled, m.visible, m.layers.mask].join('|');
}

// A mirrored transform would turn its triangles' winding over once baked in: such a mesh is left alone.
// (A geometry's groups matter only to a mesh with a material for each; with one, it is drawn whole.)
function mergeable(m, keep) {
  if (!(m.isMesh && !m.isInstancedMesh && !m.isSkinnedMesh && !Array.isArray(m.material) && !keep.has(m) && m.parent)) return false;
  if (!m.geometry || Object.keys(m.geometry.morphAttributes).length > 0 || m.geometry.drawRange.count !== Infinity || m.geometry.drawRange.start !== 0) return false;
  m.updateMatrix();
  return m.matrix.determinant() > 0;
}

// meshes: candidates (any order, any parents); keep: meshes to leave alone. Each set of two or more that
// may be merged is replaced, in its parent, by one mesh. Returns { merged, removed }: the new meshes, and
// the ones taken out (their geometries are the caller's to dispose of, where nothing else uses them).
export function mergeStatic(meshes, { keep = [] } = {}) {
  const hold = new Set(keep);
  const sets = new Map();
  for (const m of meshes) {
    if (!mergeable(m, hold)) continue;
    const k = keyOf(m);
    if (!sets.has(k)) sets.set(k, []);
    sets.get(k).push(m);
  }
  const merged = [], removed = [];
  for (const list of sets.values()) {
    if (list.length < 2) continue;
    // the attributes all of them have, and which of the two forms (indexed or not) all can take
    const names = Object.keys(list[0].geometry.attributes).filter((n) => list.every((m) => m.geometry.attributes[n]));
    const indexed = list.every((m) => m.geometry.index);
    const parts = list.map((m) => {
      m.updateMatrix();
      let g = m.geometry.clone();
      g.clearGroups();
      if (!indexed && g.index) g = g.toNonIndexed();
      for (const n of Object.keys(g.attributes)) if (!names.includes(n)) g.deleteAttribute(n);
      g.applyMatrix4(m.matrix);
      return g;
    });
    const geometry = mergeGeometries(parts, false);
    for (const g of parts) g.dispose();
    if (!geometry) continue;
    const first = list[0];
    const mesh = new THREE.Mesh(geometry, first.material);
    for (const k of ['renderOrder', 'castShadow', 'receiveShadow', 'frustumCulled', 'visible']) mesh[k] = first[k];
    mesh.layers.mask = first.layers.mask;
    mesh.name = first.name ? `${first.name}+${list.length - 1}` : `merged ${list.length}`;
    const parent = first.parent;
    for (const m of list) { parent.remove(m); removed.push(m); }
    parent.add(mesh);
    merged.push(mesh);
  }
  return { merged, removed };
}

// The triangles a set of meshes draws, by material, in the frame of `root`: for the tests, which hold a merge
// to drawing exactly what it drew before.
export function trianglesByMaterial(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const out = new Map();
  const v = new THREE.Vector3();
  root.traverse((m) => {
    if (!m.isMesh || m.isInstancedMesh) return;
    const pos = m.geometry.attributes.position, idx = m.geometry.index;
    const to = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld);
    const n = idx ? idx.count : pos.count;
    const list = out.get(m.material.id) || [];
    for (let i = 0; i < n; i += 3) {
      const tri = [];
      for (let j = 0; j < 3; j++) {
        v.fromBufferAttribute(pos, idx ? idx.getX(i + j) : i + j).applyMatrix4(to);
        tri.push(v.x, v.y, v.z);
      }
      list.push(tri);
    }
    out.set(m.material.id, list);
  });
  return out;
}
