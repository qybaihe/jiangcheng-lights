import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {World} from '../src/world.js';
import {addWuhanDistrict} from '../src/wuhan-district.js';
import {CAR_DEFINITIONS, canDriveCarPose} from '../src/driveable-cars.js';
import {RACE_COURSES, createRaceSession} from '../src/neighborhood-races.js';
import {createRaceMarkers} from '../src/race-markers.js';
import {ROWBOAT_WATER_BOUNDS, rowboatPoseWithinBounds} from '../src/rowboat.js';

function district() {
 const w = Object.create(World.prototype);
 Object.assign(w, {static: new THREE.Group(), scene: new THREE.Scene(), materials: new Map(), colliders: [], cameraOccluders: [], npcs: [], hazards: [], reduced: false, suspended: false}); w.scene.add(w.static);
 w.mat = (color, opts = {}) => {const key = color + JSON.stringify(opts); if (!w.materials.has(key)) w.materials.set(key, new THREE.MeshStandardMaterial({color, ...opts})); return w.materials.get(key);};
 w.label = (text, width, height, bg, fg, parent = w.static) => w.mesh(new THREE.PlaneGeometry(width, height), w.mat(bg || '#ffffff'), 0, 0, 0, parent, false);
 w.canopy = (x, z, width = 7, depth = 2.8, color, height = 3.5) => {w.cameraOccluders.push({x: x - width / 2, X: x + width / 2, z: z - depth / 2, Z: z + depth / 2, y: height - .5, height}); return w.box(width, .065, depth, color, x, height, z);};
 addWuhanDistrict(w); w.scene.updateMatrixWorld(true); return w;
}

test('both actual car chassis fit every timed-route leg and turning footprint, including ticket posts and photo frame', () => {
 const w = district(), points = [RACE_COURSES.car.start, ...RACE_COURSES.car.checkpoints];
 for (let i = 1; i < points.length; i++) {
  const a = points[i - 1], b = points[i], yaw = Math.atan2(b.x - a.x, b.z - a.z);
  for (const d of CAR_DEFINITIONS) {
   assert.ok(canDriveCarPose(w, {...a, yaw}, {...b, yaw}, d), `${d.id} leg ${i}: ${JSON.stringify([a, b])}`);
   if (i < points.length - 1) {
    const next = points[i + 1], nextYaw = Math.atan2(next.x - b.x, next.z - b.z);
    assert.ok(canDriveCarPose(w, {...b, yaw}, {...b, yaw: nextYaw}, d), `${d.id} turn ${i}`);
   }
  }
 }
});

test('boat checkpoints leave the actual complete hull clear at every turning angle', () => {
 for (const p of [RACE_COURSES.boat.start, ...RACE_COURSES.boat.checkpoints]) {
  for (let i = 0; i < 36; i++) assert.ok(rowboatPoseWithinBounds({...p, yaw: i * Math.PI / 18}, ROWBOAT_WATER_BOUNDS), JSON.stringify({point: p, heading: i}));
 }
});

test('continuous street-corner arcs fit both vehicles at practical turning radii, not only stationary yaw sweeps', () => {
 const w = district(), cps = RACE_COURSES.car.checkpoints;
 const turns = [
  {at: cps[1], inX: -1, inZ: 0, outX: 0, outZ: -1, a: Math.PI / 2, b: 0},
  {at: cps[3], inX: 0, inZ: 1, outX: -1, outZ: 0, a: 0, b: -Math.PI / 2},
  {at: cps[4], inX: 1, inZ: 0, outX: 0, outZ: 1, a: -Math.PI / 2, b: -Math.PI},
  {at: {x: 73.5, z: 23}, inX: 0, inZ: -1, outX: -1, outZ: 0, a: 0, b: Math.PI / 2},
 ];
 for (const radius of [4.7, 5, 5.5]) for (const turn of turns) {
  const center = {x: turn.at.x + (turn.inX + turn.outX) * radius, z: turn.at.z + (turn.inZ + turn.outZ) * radius};
  let previous = null;
  for (let i = 0; i <= 80; i++) {
   const angle = turn.a + (turn.b - turn.a) * i / 80, sign = Math.sign(turn.b - turn.a);
   const pose = {x: center.x + Math.cos(angle) * radius, z: center.z + Math.sin(angle) * radius, yaw: Math.atan2(-Math.sin(angle) * sign, Math.cos(angle) * sign)};
   for (const d of CAR_DEFINITIONS) assert.ok(canDriveCarPose(w, previous ?? pose, pose, d), `${d.id}, radius ${radius}, turn ${turn.at.x}/${turn.at.z}, arc ${i}`);
   previous = pose;
  }
 }
});

test('one marker allocation is reused across frames and gates, without lights, shadow refresh or collision changes', () => {
 const scene = new THREE.Scene(); let attaches = 0;
 const world = {scene, water: {position: {y: -.35}}, heightAt: () => .13, curvedWorld: {attach: () => attaches++}, colliders: []};
 const view = createRaceMarkers(world), root = scene.children[0], s = createRaceSession('boat');
 assert.equal(attaches, 1); assert.equal(root.visible, false);
 const meshes = []; root.traverse(o => {if (o.isMesh) meshes.push(o); assert.equal(o.isLight, undefined);});
 const geometry = meshes.map(m => m.geometry), materials = meshes.map(m => m.material), count = meshes.length;
 for (let i = 0; i < 100; i++) view.update({...s.snapshot(), elapsed: i / 10});
 assert.equal(root.visible, true); assert.equal(root.position.y, -.31); assert.equal(world.colliders.length, 0);
 assert.equal(attaches, 1); const after = []; root.traverse(o => {if (o.isMesh) after.push(o);});
 assert.equal(after.length, count); assert.deepEqual(after.map(m => m.geometry), geometry); assert.deepEqual(after.map(m => m.material), materials);
 for (const m of meshes) {assert.equal(m.castShadow, false); assert.equal(m.receiveShadow, false);}
 view.update({...s.snapshot(), nextCheckpointIndex: 1, nextCheckpoint: RACE_COURSES.boat.checkpoints[1]});
 assert.equal(root.position.x, RACE_COURSES.boat.checkpoints[1].x);
 view.clear(); assert.equal(root.visible, false); view.update(s.snapshot()); assert.equal(root.visible, true);
 view.update({...s.snapshot(), status: 'cancelled'}); assert.equal(root.visible, false);
 let disposed = 0; for (const g of new Set(geometry)) g.addEventListener('dispose', () => disposed++);
 view.dispose(); view.dispose(); assert.equal(scene.children.length, 0); assert.equal(disposed, new Set(geometry).size);
 view.update(s.snapshot()); assert.equal(scene.children.length, 0);
});
