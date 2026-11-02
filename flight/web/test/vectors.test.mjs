// The debrief's aircraft in vectors is carried by its parts: each part's lines go where the part goes and hide when
// it hides, as a retracting gear does; the painted surfaces are off while they show, and back after; a part an edge
// finder cannot draw gets the lines it is given. The parts are three.js objects: the tests skip, saying so, where
// flight/web's packages are not installed. GPLv3.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const three = await import('three').then(() => true, () => false);
const needsThree = !three && 'three.js is not installed here (npm ci in flight/web)';
const THREE = three ? await import('three') : null;
const { linesShown, showVectors, vectorize } = three ? await import('../src/vectors.js') : {};

// a body, a gear leg that swings and hides as the airliner's does, and a cockpit the vectors pass over
function model() {
  const root = new THREE.Group();
  const paint = new THREE.MeshBasicMaterial(), strut = new THREE.MeshBasicMaterial();
  const body = new THREE.Mesh(new THREE.BoxGeometry(10, 2, 2), paint);
  const leg = new THREE.Group();
  const legMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2, 8), strut);
  leg.add(legMesh);
  leg.position.set(2, -1, 0);
  const cockpit = new THREE.Group();
  cockpit.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()));
  root.add(body, leg, cockpit);
  return { root, body, leg, legMesh, cockpit, paint, strut };
}

test('each part carries its own lines: they go where it goes and hide when it hides', { skip: needsThree }, () => {
  const m = model();
  const v = vectorize(m.root, new THREE.LineBasicMaterial(), { skip: (o) => Boolean(m.cockpit.getObjectById(o.id)) });
  assert.equal(v.lines.length, 2, 'the body and the leg; the cockpit passed over');
  assert.deepEqual(new Set(v.materials), new Set([m.paint, m.strut]));
  assert.deepEqual(linesShown(v), { shown: 0, total: 2 }, 'hidden until the debrief shows them');
  showVectors(v, true);
  assert.deepEqual(linesShown(v), { shown: 2, total: 2 });
  assert.ok(!m.paint.visible && !m.strut.visible, 'the paint off');
  // the gear retracts: its leg swings up, then hides, and its lines with it
  m.leg.rotation.x = -1.5;
  m.root.updateMatrixWorld(true);
  const legLines = m.legMesh.children[0];
  assert.ok(legLines.matrixWorld.equals(m.legMesh.matrixWorld), 'the lines where the leg is');
  m.leg.visible = false;
  assert.deepEqual(linesShown(v), { shown: 1, total: 2 }, 'gear up: its lines gone with it');
  m.leg.visible = true;
  assert.deepEqual(linesShown(v), { shown: 2, total: 2 }, 'gear down again: back');
  showVectors(v, false);
  assert.ok(m.paint.visible && m.strut.visible, 'the paint back');
  assert.deepEqual(linesShown(v), { shown: 0, total: 2 }, 'the lines off');
});

test('a part an edge finder cannot draw gets the lines it is given, in its own frame', { skip: needsThree }, () => {
  const m = model();
  const given = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 5, 0, 0], 3));
  const v = vectorize(m.root, new THREE.LineBasicMaterial(), { extra: [[m.body, given]] });
  assert.equal(v.lines.length, 4, 'the body, the leg, the cockpit box, and the lines given');
  const extra = v.lines[3];
  assert.equal(extra.parent, m.body);
  assert.equal(extra.geometry, given);
});
