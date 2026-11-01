// The aircraft in vectors for the debrief, carried by its parts: each mesh of the model gets its edges (where its
// faces turn by EDGE_DEG or more) as lines of its own, a child of the mesh, so that in the debrief the gear, the flaps,
// the surfaces, the fans and the reversers' doors move and hide as they do outside, from the same state; while the
// vectors show, the painted surfaces are switched off (showVectors). A still outline taken once, as the debrief had,
// kept the gear down whatever the aircraft did. Plain three.js: node tests it. GPLv3.

import * as THREE from 'three';

export const EDGE_DEG = 28;   // the turn between two faces that makes an edge a line

// The edges of every mesh under root but those skip passes over, each a LineSegments child of its mesh, hidden until
// shown; extra: [mesh, geometry] pairs, lines an edge finder cannot give (a smooth fuselage's), in that mesh's frame.
// Returns { lines, materials }: the lines made, and the meshes' materials, which showVectors switches off.
export function vectorize(root, material, { skip = () => false, extra = [] } = {}) {
  const meshes = [], materials = new Set(), lines = [];
  root.traverse((o) => {
    if (o.isMesh && !skip(o)) meshes.push(o);
  });
  const add = (mesh, geometry) => {
    const l = new THREE.LineSegments(geometry, material);
    l.visible = false;
    mesh.add(l);
    lines.push(l);
  };
  for (const o of meshes) {   // collected first: the lines are added after, not met by the traversal
    materials.add(o.material);
    add(o, new THREE.EdgesGeometry(o.geometry, EDGE_DEG));
  }
  for (const [mesh, geometry] of extra) add(mesh, geometry);
  return { lines, materials: [...materials] };
}

// The vectors shown and the painted surfaces hidden (on), or the other way round.
export function showVectors({ lines, materials }, on) {
  for (const l of lines) l.visible = on;
  for (const m of materials) m.visible = !on;
}

// How many of the lines are drawn now, every one of their ancestors visible, of all: a retracted gear's are not.
export function linesShown({ lines }) {
  let shown = 0;
  for (const l of lines) {
    let v = l.visible;
    for (let a = l.parent; v && a; a = a.parent) v = a.visible;
    if (v) ++shown;
  }
  return { shown, total: lines.length };
}
