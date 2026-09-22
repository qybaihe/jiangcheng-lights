import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCharacter } from '../src/characters.js';
import { updatePlayerOcclusion } from '../src/exploration.js';

function actor() {
  const group = createCharacter(null, '#fff', '#000', true, 'player');
  group.updateMatrixWorld(true);
  group.userData.characterMesh.skeleton.update();
  return group;
}

function surfaceColor(group, x, y, back = false) {
  const mesh = group.userData.characterMesh;
  const ray = new THREE.Raycaster(new THREE.Vector3(x, y, back ? -1 : 1), new THREE.Vector3(0, 0, back ? 1 : -1));
  const hit = ray.intersectObject(mesh)[0];
  assert.ok(hit, `No visible character surface at ${x}, ${y}, ${back ? 'back' : 'front'}`);
  return new THREE.Color().fromBufferAttribute(mesh.geometry.attributes.color, hit.face.a);
}

const luminance = color => color.r * .2126 + color.g * .7152 + color.b * .0722;

test('redesigned avatar retains one skinned draw, the animation hierarchy and physical height', () => {
  const group = actor(), mesh = group.userData.characterMesh, meshes = [];
  group.traverse(object => { if (object.isMesh) meshes.push(object); });
  assert.deepEqual(meshes, [mesh]);
  assert.equal(mesh.isSkinnedMesh, true);
  assert.equal(mesh.geometry.groups.length, 0);
  assert.equal(mesh.material.isMeshToonMaterial, true);
  assert.equal(mesh.material.vertexColors, true);
  assert.deepEqual(mesh.skeleton.bones.map(bone => bone.name), [
    'pelvis', 'spine', 'head', 'left eye', 'right eye', 'ponytail root', 'ponytail tip',
    'left shoulder', 'left elbow', 'left wrist', 'right shoulder', 'right elbow', 'right wrist',
    'canvas backpack', 'left hip', 'left knee', 'left ankle', 'right hip', 'right knee', 'right ankle',
  ]);
  for (const bone of mesh.skeleton.bones) {
    if (bone.name === 'head') continue;
    assert.deepEqual(bone.scale.toArray(), [1, 1, 1], `Unexpected rest scaling on ${bone.name}`);
  }
  mesh.geometry.computeBoundingBox();
  assert.ok(Math.abs(mesh.geometry.boundingBox.min.y) < .001);
  assert.ok(mesh.geometry.boundingBox.max.y > 1.83 && mesh.geometry.boundingBox.max.y < 1.88);
  assert.equal(group.scale.y, 1, 'Adult proportions must come from anatomy, not stretching the whole actor');
  const rig=group.userData.rig;
  assert.ok(rig.hipHeight/group.userData.height > .54, 'The hip must sit above half the total height');
  assert.ok(Math.abs(rig.hipHeight-rig.upperLeg-rig.lowerLeg-rig.ankleHeight)<1e-8);
  for(let side=0;side<2;side++) {
    const hip=group.userData.legs[side].getWorldPosition(new THREE.Vector3());
    const knee=rig.knees[side].getWorldPosition(new THREE.Vector3());
    const ankle=rig.ankles[side].getWorldPosition(new THREE.Vector3());
    assert.ok(Math.abs(hip.distanceTo(knee)-rig.upperLeg)<1e-8);
    assert.ok(Math.abs(knee.distanceTo(ankle)-rig.lowerLeg)<1e-8);
    assert.ok(Math.abs(ankle.y-rig.ankleHeight)<1e-8);
  }
  assert.ok(mesh.geometry.attributes.position.count / 3 < 30000, 'Silhouette refinement should not multiply mesh cost');
  for (const key of ['position', 'normal', 'skinWeight']) {
    assert.ok(mesh.geometry.attributes[key].array.every(Number.isFinite), `Nonfinite ${key}`);
  }
});

test('rear head has continuous dark hair coverage below the ears rather than exposed scalp', () => {
  const group = actor();
  // Actual front-facing triangle intersections reproduce the third-person
  // defect; a full cap with inverted faces would also fail these probes.
  for (const x of [-.099, -.05, 0, .05, .099]) {
    for (const y of [1.546, 1.591, 1.645, 1.717]) {
      const color = surfaceColor(group, x, y, true);
      assert.ok(luminance(color) < .18, `Exposed scalp at ${x}, ${y}: ${color.getHexString()}`);
    }
  }
  for (const x of [-.0621, .0621]) {
    assert.ok(luminance(surfaceColor(group, x, group.userData.eyeHeight)) < .10, 'Both pupils must remain visible in front of the face');
  }
});

test('jacket, trousers and shoes read as separate large colour shapes', () => {
  const group = actor();
  const jacket = surfaceColor(group, .075, 1.21);
  const trousers = surfaceColor(group, .099, .6);
  const shoe = surfaceColor(group, .099, .10);
  assert.ok(luminance(jacket) > luminance(trousers) * 5, 'Cream jacket must separate from dark trousers');
  assert.ok(trousers.g > trousers.r && trousers.g > trousers.b, 'Trousers keep their ink-green identity');
  assert.ok(shoe.r > shoe.g * 1.6 && shoe.g > shoe.b, 'Warm shoes remain distinct from the trousers');
});

test('older residents keep their own build while the young community worker has longer legs',()=>{
  const granny=createCharacter(null,'#fff','#000',false,'granny');
  const chef=createCharacter(null,'#fff','#000',false,'chef');
  const community=createCharacter(null,'#fff','#000',false,'community');
  assert.equal(granny.userData.rig.hipHeight,.87);
  assert.equal(chef.userData.rig.hipHeight,.87);
  assert.ok(granny.userData.height<1.65);
  assert.equal(community.userData.rig.hipHeight,.94);
  assert.ok(community.userData.height>1.8);
});

test('real skinned avatar keeps shared NPC material intact through first-person fading', () => {
  const player = actor(), resident = createCharacter(null, '#fff', '#000', false, 'chef');
  const shared = resident.userData.characterMesh.material;
  assert.equal(player.userData.characterMesh.material, shared);
  const world = { player, cameraMode: 'first', conversation: null };
  updatePlayerOcclusion(world, 1 / 60);
  assert.equal(player.visible, false);
  assert.notEqual(player.userData.characterMesh.material, shared);
  assert.equal(shared.opacity, 1);
  assert.equal(shared.transparent, false);
  assert.equal(player.userData.characterMesh.material.gradientMap, shared.gradientMap);
  assert.equal(player.userData.characterMesh.material.vertexColors, true);
  world.conversation = {};
  updatePlayerOcclusion(world, 1 / 60);
  assert.equal(player.visible, true);
  assert.equal(player.userData.characterMesh.material.opacity, 1);
  assert.equal(player.userData.characterMesh.material.depthWrite, true);
});

test('imported multi-material avatar fades every surface and preserves expression material identity',()=>{
  const player=new THREE.Group();
  const cloth=new THREE.MeshStandardMaterial(),hair=new THREE.MeshStandardMaterial({alphaTest:.5}),lace=new THREE.MeshStandardMaterial({transparent:true,opacity:.7,depthWrite:false});
  const body=new THREE.Mesh(new THREE.BoxGeometry(),[cloth,hair]);
  const trim=new THREE.Mesh(new THREE.BoxGeometry(),lace);
  player.add(body,trim);player.userData.characterMeshes=[body,trim];player.userData.ownedMaterials=true;
  const world={player,cameraMode:'street',playerCameraDistance:1.8};
  updatePlayerOcclusion(world,1/60);
  assert.ok(world.playerOpacity>0&&world.playerOpacity<1);
  assert.equal(body.material[0],cloth);assert.equal(body.material[1],hair);assert.equal(trim.material,lace);
  assert.equal(cloth.opacity,world.playerOpacity);assert.equal(lace.opacity,.7*world.playerOpacity);assert.equal(hair.alphaTest,.5*world.playerOpacity);
  world.cameraMode='first';updatePlayerOcclusion(world,1/60);assert.equal(player.visible,false);
  world.conversation={};updatePlayerOcclusion(world,1/60);
  assert.equal(player.visible,true);assert.equal(cloth.opacity,1);assert.equal(cloth.transparent,false);assert.equal(cloth.depthWrite,true);
  assert.equal(lace.opacity,.7);assert.equal(lace.transparent,true);assert.equal(lace.depthWrite,false);
});

test('a saved first-person start restores every primitive sharing an imported cutout material',()=>{
  const player=new THREE.Group(),shared=new THREE.MeshStandardMaterial({alphaTest:.5});
  player.userData.characterMeshes=Array.from({length:4},()=>new THREE.Mesh(new THREE.PlaneGeometry(),shared));
  player.add(...player.userData.characterMeshes);player.userData.ownedMaterials=true;
  const world={player,cameraMode:'first',playerCameraDistance:5};
  updatePlayerOcclusion(world,1/60);assert.equal(shared.opacity,0);assert.equal(player.visible,false);
  world.cameraMode='street';for(let i=0;i<120;i++)updatePlayerOcclusion(world,1/60);
  assert.ok(shared.opacity>.999);assert.ok(shared.alphaTest>.499);assert.equal(player.visible,true);
  assert.equal(world.playerFadeStates.size,1);
  for(const mesh of player.userData.characterMeshes)assert.equal(mesh.material,shared);
});
