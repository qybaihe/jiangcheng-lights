// Numerical deformation and contact QA; deliberately independent of the game.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import * as THREE from 'three';
import { createCharacter } from '../src/characters.js';
import { updateTownLife } from '../src/town-life.js';

const report = { phases: {}, residents: [], limits: {} };
const actor = createCharacter(null, '#eee', '#789', true, 'player');
let stepCount = 0, time = 0;
const world = {
  player: actor, npcs: [], active: true, suspended: false, blocked: false,
  reduced: false, walking: false, moveSpeed: 0, movementDistance: 0,
  heightAt: () => 0, canWalk: () => true, storyFlags: new Set(),
  playerMotion: { grounded: true, phase: 'grounded', acceleration: 0 },
  callbacks: { onFootstep: () => stepCount++ },
};
const mesh = actor.userData.characterMesh, rig = actor.userData.rig;
const position = mesh.geometry.attributes.position;
const skinIndex = mesh.geometry.attributes.skinIndex, weights = mesh.geometry.attributes.skinWeight;
const ankleIndices = new Set(rig.ankles.map(bone => mesh.skeleton.bones.indexOf(bone)));
const shoeVertices = [], point = new THREE.Vector3();
let blended = 0;
for (let i = 0; i < position.count; i++) {
  const sum = weights.getX(i) + weights.getY(i) + weights.getZ(i) + weights.getW(i);
  assert.ok(Math.abs(sum - 1) < 1e-6, `Unnormalized skin weight at vertex ${i}`);
  if (weights.getY(i) > 0 && weights.getY(i) < 1) blended++;
  if (ankleIndices.has(skinIndex.getX(i))) shoeVertices.push(i);
}
function sync(target) {
  target.updateMatrixWorld(true);
  target.userData.characterMesh.skeleton.update();
  assert.ok(target.userData.characterMesh.skeleton.boneMatrices.every(Number.isFinite));
}
function tick(dt = 1 / 120) {
  time += dt; updateTownLife(world, dt, time); sync(actor);
}
function soleHeight() {
  let height = Infinity;
  for (const i of shoeVertices) {
    point.fromBufferAttribute(position, i);
    mesh.applyBoneTransform(i, point).applyMatrix4(mesh.matrixWorld);
    height = Math.min(height, point.y);
  }
  return height;
}
function phase(name, frames, action) {
  const before = stepCount;
  for (let i = 0; i < frames; i++) { action?.(i, frames); tick(); }
  report.phases[name] = { frames, footsteps: stepCount - before };
}
phase('idle', 120);
assert.equal(report.phases.idle.footsteps, 0);
world.walking = true; world.moveSpeed = 5.6; world.movementDistance = 5.6 / 120;
let lowestSole = Infinity, largestKnee = 0, lowestPelvis = Infinity, largestSupportingKnee = 0, flightFrames = 0;
phase('running', 600, () => {
  const life = actor.userData.townLife;
  if (life && life.feet.every(f => !f.planted)) flightFrames++;
  lowestSole = Math.min(lowestSole, soleHeight());
  largestKnee = Math.max(largestKnee, ...rig.knees.map(b => b.rotation.x));
  lowestPelvis = Math.min(lowestPelvis, rig.root.position.y);
  life.feet.forEach((foot, i) => { if (foot.planted) largestSupportingKnee = Math.max(largestSupportingKnee, rig.knees[i].rotation.x); });
});
assert.ok(report.phases.running.footsteps >= 17 && report.phases.running.footsteps <= 21);
assert.ok(flightFrames > 80, 'A running stride must include true flight phases');
assert.ok(lowestSole >= -.002, `Rendered shoe penetrates floor by ${-lowestSole}`);
assert.ok(lowestPelvis >= -.14, 'Longer strides must not force a deep crouch');
assert.ok(largestSupportingKnee < 1, 'A supporting leg must not fold into a deep squat');
phase('airborne', 72, i => {
  const t = (i + 1) / 120;
  world.playerMotion = { grounded: false, phase: t <= .3 ? 'rising' : 'falling', takeoffTime: t, verticalVelocity: 6.6 - 22 * t, acceleration: 0 };
  actor.position.y = Math.max(0, 6.6 * t - 11 * t * t);
});
assert.equal(report.phases.airborne.footsteps, 0);
actor.position.y = 0;
phase('landing', 28, i => {
  world.playerMotion = { grounded: true, phase: 'landing', landingTime: (i + 1) / 120, impactSpeed: 6.6, acceleration: 0 };
});
assert.equal(report.phases.landing.footsteps, 0);
assert.ok(soleHeight() >= -.002);
world.playerMotion = { grounded: true, phase: 'grounded', acceleration: 0 };
phase('runningAfterLanding', 240);
assert.ok(report.phases.runningAfterLanding.footsteps > 5);
world.moveSpeed = 3.4; world.movementDistance = 3.4 / 120;
phase('walkingTransition', 120);
phase('walkingSteady', 600);
assert.ok(report.phases.walkingSteady.footsteps >= 14 && report.phases.walkingSteady.footsteps <= 16);
world.reduced = true;
phase('reducedMotion', 120);
assert.equal(report.phases.reducedMotion.footsteps, 0);
world.reduced = false; world.blocked = true;
phase('blocked', 120);
assert.equal(report.phases.blocked.footsteps, 0);
world.blocked = false; world.walking = false; world.moveSpeed = 0; world.movementDistance = 0;
phase('stopped', 120);
assert.equal(report.phases.stopped.footsteps, 0);
world.suspended = true;
const frozenMatrices = Array.from(mesh.skeleton.boneMatrices);
phase('suspended', 120);
assert.deepEqual(Array.from(mesh.skeleton.boneMatrices), frozenMatrices);
world.suspended = false;

for (const id of ['granny', 'chef', 'dock', 'community']) {
  const resident = createCharacter(null, '#ddd', '#789', false, id), rig = resident.userData.rig;
  world.npcs = [{ id, group: resident }];
  phase(`${id}Idle`, 160);
  sync(resident);
  const mesh = resident.userData.characterMesh, geometry = mesh.geometry;
  const idx = geometry.attributes.skinIndex, weight = geometry.attributes.skinWeight;
  const slot = rig.held.findIndex(Boolean), hand = rig.hands[slot];
  const handIndex = mesh.skeleton.bones.indexOf(hand), inverse = hand.matrixWorld.clone().invert();
  const handPoints = [];
  for (let i = 0; i < idx.count; i++) {
    if (idx.getX(i) !== handIndex || weight.getX(i) !== 1) continue;
    const local = new THREE.Vector3().fromBufferAttribute(geometry.attributes.position, i);
    mesh.applyBoneTransform(i, local).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse);
    handPoints.push({ i, local });
  }
  assert.ok(handPoints.length > 100, `${id} is missing wrist-bound prop geometry`);
  let drift = 0, cupTilt = 0;
  phase(`${id}Gesture`, 240, () => {
    sync(resident); inverse.copy(hand.matrixWorld).invert();
    // Sample the whole wrist/prop mesh, not only the bone pivot.
    for (let k = 0; k < handPoints.length; k += 7) {
      const { i, local } = handPoints[k];
      point.fromBufferAttribute(geometry.attributes.position, i);
      mesh.applyBoneTransform(i, point).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse);
      drift = Math.max(drift, point.distanceTo(local));
    }
    if (id === 'dock') {
      point.set(0, 1, 0).transformDirection(hand.matrixWorld);
      cupTilt = Math.max(cupTilt, Math.acos(THREE.MathUtils.clamp(point.y, -1, 1)));
    }
  });
  assert.ok(drift < 1e-5, `${id} prop drifts from wrist: ${drift}`);
  assert.ok(cupTilt < .15, `Cup leans more than 8.6 degrees: ${cupTilt}`);
  assert.equal(report.phases[`${id}Gesture`].footsteps, 0);
  report.residents.push({ id, held: rig.held[slot], wristVertices: handPoints.length, maximumDrift: drift, maximumCupTilt: cupTilt, finite: true });
}
report.limits = { lowestRenderedSole: lowestSole, largestKnee, lowestPelvis, largestSupportingKnee, runningFlightFrames: flightFrames, triangles: position.count / 3, bones: mesh.skeleton.bones.length, blendedVertices: blended };
report.passed = true;
const output = new URL('../output/qa/character-motion-v2/', import.meta.url);
await mkdir(output, { recursive: true });
await writeFile(new URL('numerical-report.json', output), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
