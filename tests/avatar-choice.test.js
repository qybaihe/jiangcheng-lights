import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {VRMLoaderPlugin,VRMUtils} from '@pixiv/three-vrm';
import {AVATARS,getAvatarOption} from '../src/avatar-catalog.js';
import {createCharacter} from '../src/characters.js';
import {updateTownLife} from '../src/town-life.js';
import {installAvatarRig} from '../src/avatar-retarget.js';
import {optimizeAvatarMeshes} from '../src/avatar-optimization.js';
import {addAvatarAccessories} from '../src/avatar-accessories.js';

// Use the shipped geometry, skin, springs and expressions. This deliberately
// omits texture pixels; alpha-cut clothing and accessory appearance need visual QA.
async function loadAvatar(id) {
  const option=getAvatarOption(id),loader=new GLTFLoader();
  loader.register(()=>({name:'OfflineTextureStub',loadTexture:()=>Promise.resolve(new THREE.Texture())}));
  loader.register(parser=>new VRMLoaderPlugin(parser));
  const bytes=fs.readFileSync(new URL(`../public${option.url}`,import.meta.url));
  const gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const vrm=gltf.userData.vrm;VRMUtils.rotateVRM0(vrm);
  return {option,vrm};
}

function meshesOf(root) {const result=[];root.traverse(node=>{if(node.isMesh)result.push(node);});return result;}
function worldFor(actor,heightAt=()=>0) {
  return {player:actor,npcs:[],active:true,suspended:false,blocked:false,reduced:false,walking:false,
    moveSpeed:0,movementDistance:0,heightAt,canWalk:()=>true,storyFlags:new Set(),
    playerMotion:{grounded:true,phase:'grounded',acceleration:0},callbacks:{}};
}
function step(world,rig,time,accessories) {
  updateTownLife(world,1/120,time);rig.update(1/120,time);
  accessories?.update(1/120,time,{moving:world.walking});world.player.updateMatrixWorld(true);
}
function shoeClearance(rig,heightAt) {
  let lowest=Infinity;const point=new THREE.Vector3();
  for(const mesh of rig.meshes) {
    if(!(Array.isArray(mesh.material)?mesh.material:[mesh.material]).some(m=>/shoe|boot|footwear|sneaker/i.test(m.name)))continue;
    mesh.skeleton?.update();
    const {geometry}=mesh,vertices=new Set(geometry.index?.array??Array.from({length:geometry.attributes.position.count},(_,i)=>i));
    for(const index of vertices){mesh.getVertexPosition(index,point).applyMatrix4(mesh.matrixWorld);assert.ok(Number.isFinite(point.x+point.y+point.z));lowest=Math.min(lowest,point.y-heightAt(point.x,point.z));}
  }
  assert.ok(Number.isFinite(lowest),'the selected asset must contain measurable footwear');return lowest;
}
function snapshotShell(actor,bones) {
  return {rig:{...actor.userData.rig},fields:Object.fromEntries(['characterMesh','characterMeshes','height','eyeHeight','avatarRig','avatarRenderRoot','driverMesh','townLife','ownedMaterials'].map(key=>[key,actor.userData[key]])),
    bones:bones.map(node=>({node,position:node.position.clone(),quaternion:node.quaternion.clone(),scale:node.scale.clone()}))};
}
function assertShell(actor,snapshot) {
  assert.deepEqual(Object.keys(actor.userData.rig).sort(),Object.keys(snapshot.rig).sort());
  for(const [key,value] of Object.entries(snapshot.rig))assert.equal(actor.userData.rig[key],value,`restore controller field ${key}`);
  for(const [key,value] of Object.entries(snapshot.fields))assert.equal(actor.userData[key],value,`restore player field ${key}`);
  for(const {node,position,quaternion,scale} of snapshot.bones){assert.ok(node.position.distanceTo(position)<1e-9);assert.ok(1-Math.abs(node.quaternion.dot(quaternion))<1e-9);assert.ok(node.scale.distanceTo(scale)<1e-9);}
}

test('avatar choices resolve only to the two packaged characters, with legacy saves retaining the original',()=>{
  assert.deepEqual(AVATARS.map(option=>option.id),['female','male']);
  assert.notEqual(getAvatarOption('male').url,getAvatarOption('female').url);
  for(const id of [undefined,null,'','unknown','https://example.com/avatar.vrm','__proto__'])assert.equal(getAvatarOption(id),getAvatarOption('female'));
  assert.equal(getAvatarOption('male').name,getAvatarOption('female').name,'both appearances share the same story identity');
});

test('the real male skin calibrates its own proportions, arms and expressions',async()=>{
  const {option,vrm}=await loadAvatar('male'),actor=createCharacter(null,'#fff','#000',true,'player');
  optimizeAvatarMeshes(vrm);const rig=installAvatarRig(actor,vrm,{targetHeight:option.height});
  assert.ok(Math.abs(rig.metrics.height-option.height)<1e-5);
  assert.ok(rig.metrics.eyeHeight>option.height*.86&&rig.metrics.eyeHeight<option.height*.95);
  for(const side of ['left','right']) {
    const arm=vrm.humanoid.getRawBoneNode(side+'UpperArm').getWorldPosition(new THREE.Vector3());
    const hand=vrm.humanoid.getRawBoneNode(side+'Hand').getWorldPosition(new THREE.Vector3());
    assert.ok(arm.y-hand.y>.4,'hands should hang below the shoulders');
    assert.ok(Math.abs(hand.x-arm.x)<.12,'arms should not retain a T pose');
  }
  actor.userData.rig.eyes[0].scale.y=.06;rig.update(1/60,1,{talking:true});
  assert.ok(vrm.expressionManager.getValue('blink')>.99);assert.ok(vrm.expressionManager.getValue('aa')>0);
  rig.update(1/60,1,{talking:true,reduced:true});
  assert.equal(vrm.expressionManager.getValue('blink'),0);assert.equal(vrm.expressionManager.getValue('aa'),0);
  rig.dispose();
});

test('male mesh optimization preserves topology, facial expressions and spring attachments',async()=>{
  const {vrm}=await loadAvatar('male'),original=meshesOf(vrm.scene);
  const morphs=original.filter(mesh=>Object.values(mesh.geometry.morphAttributes).some(list=>list.length));
  const springs=[...vrm.springBoneManager.joints],expressions=vrm.expressionManager.expressions.map(expression=>({expression,binds:[...expression.binds]}));
  const result=optimizeAvatarMeshes(vrm),live=new Set(meshesOf(vrm.scene));
  assert.equal(result.after.triangles,result.before.triangles);assert.ok(result.after.meshes<=result.before.meshes);
  assert.ok(result.after.estimatedDrawCalls<=result.before.estimatedDrawCalls);
  for(const mesh of morphs)assert.ok(live.has(mesh),'expression targets must survive batching');
  for(const joint of springs){assert.ok(vrm.springBoneManager.joints.has(joint));assert.ok(joint.bone.parent);}
  for(const {expression,binds} of expressions)for(const [i,bind] of binds.entries())assert.equal(expression.binds[i],bind);
  for(const annotation of vrm.firstPerson.meshAnnotations)for(const mesh of annotation.meshes)assert.ok(live.has(mesh));
  vrm.expressionManager.setValue('blink',1);vrm.update(0);
  assert.ok(morphs.some(mesh=>mesh.morphTargetInfluences.some(value=>value>0)));
  assert.equal(optimizeAvatarMeshes(vrm).removedMeshes,0,'a second pass must be idempotent');
});

test('male footwear stays on the floor through heading changes, a 1:8 ramp, running and landing',async()=>{
  const {option,vrm}=await loadAvatar('male'),actor=createCharacter(null,'#fff','#000',true,'player');
  optimizeAvatarMeshes(vrm);const rig=installAvatarRig(actor,vrm,{targetHeight:option.height});
  const world=worldFor(actor,()=>.83);
  for(const heading of [0,Math.PI/2,Math.PI,-Math.PI/3]){
    actor.position.set(21.5,.83,-8.7);actor.rotation.y=heading;
    for(let i=0;i<60;i++)step(world,rig,i/120);
    const clearance=shoeClearance(rig,world.heightAt);
    assert.ok(clearance>=-.003&&clearance<.009,`heading ${heading}: ${clearance} m clearance`);
  }
  world.heightAt=(x,z)=>z/8;world.walking=true;world.moveSpeed=5.6;
  actor.rotation.y=Math.PI/4;actor.position.set(2.1,1.7/8,1.7);
  for(let i=0;i<240;i++){
    world.movementDistance=5.6/120;
    actor.position.x+=Math.sin(actor.rotation.y)*world.movementDistance;
    actor.position.z+=Math.cos(actor.rotation.y)*world.movementDistance;
    actor.position.y=world.heightAt(actor.position.x,actor.position.z);step(world,rig,1+i/120);
    if(i%8===0)assert.ok(shoeClearance(rig,world.heightAt)>-.006,`male running frame ${i} penetrates the floor`);
  }
  world.playerMotion={grounded:false,phase:'rising',takeoffTime:.18,verticalVelocity:3.5};actor.position.y+=.5;
  for(let i=0;i<24;i++)step(world,rig,3+i/120);
  assert.ok(shoeClearance(rig,world.heightAt)>.2);
  world.playerMotion={grounded:true,phase:'landing',landingTime:.08,impactSpeed:3.5};
  actor.position.y=world.heightAt(actor.position.x,actor.position.z);world.walking=false;world.moveSpeed=0;world.movementDistance=0;
  for(let i=0;i<24;i++)step(world,rig,3.2+i/120);
  assert.ok(shoeClearance(rig,world.heightAt)>-.006);rig.dispose();
});

test('the male satchel fits its own skeleton and the shoulder strap deforms during walking',async()=>{
  const {option,vrm}=await loadAvatar('male'),actor=createCharacter(null,'#fff','#000',true,'player');
  optimizeAvatarMeshes(vrm);const rig=installAvatarRig(actor,vrm,{targetHeight:option.height}),accessories=addAvatarAccessories(vrm,{height:option.height});
  const world=worldFor(actor),strap=accessories.meshes.find(mesh=>mesh.name==='贴身胸背斜挎肩带');
  assert.equal(accessories.root.parent,vrm.humanoid.getRawBoneNode('hips'));
  assert.equal(addAvatarAccessories(vrm,{height:option.height}),accessories,'do not duplicate bag geometry for one asset');
  assert.ok(accessories.root.userData.avatarAccessory.bodySamples>0);
  assert.ok(accessories.root.userData.avatarAccessory.surfaceRayHits>0);
  assert.ok(strap);const before=Float32Array.from(strap.geometry.attributes.position.array);
  world.walking=true;world.moveSpeed=3.2;world.movementDistance=3.2/120;
  for(let i=0;i<45;i++){actor.position.z+=world.movementDistance;step(world,rig,i/120,accessories);}
  const after=strap.geometry.attributes.position.array;
  assert.ok(after.some((value,i)=>Math.abs(value-before[i])>1e-4),'strap must deform with the torso, beyond whole-character translation');
  for(const mesh of accessories.meshes){
    for(const value of mesh.geometry.attributes.position.array)assert.ok(Number.isFinite(value));
    assert.ok(new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3()).length()<1.5,'accessory geometry must remain near the body');
  }
  rig.dispose();
});

test('female to male to female restores live rig state and detached disposal cannot damage the current avatar',async()=>{
  const female=await loadAvatar('female'),male=await loadAvatar('male'),actor=createCharacter(null,'#fff','#000',true,'player');
  actor.position.set(8,.6,-3);actor.rotation.y=1.2;
  const bones=[];actor.traverse(node=>{if(node.isBone)bones.push(node);});const baseline=snapshotShell(actor,bones),world=worldFor(actor,()=>.6);
  optimizeAvatarMeshes(female.vrm);const first=installAvatarRig(actor,female.vrm,{targetHeight:female.option.height});
  const firstBag=addAvatarAccessories(female.vrm,{height:female.option.height});actor.userData.characterMeshes=[...first.meshes,...firstBag.meshes];actor.userData.ownedMaterials=true;
  for(let i=0;i<20;i++)step(world,first,i/120,firstBag);
  const activeFemale=snapshotShell(actor,bones);first.detach();assertShell(actor,baseline);
  optimizeAvatarMeshes(male.vrm);const second=installAvatarRig(actor,male.vrm,{targetHeight:male.option.height});
  const secondBag=addAvatarAccessories(male.vrm,{height:male.option.height});actor.userData.characterMeshes=[...second.meshes,...secondBag.meshes];actor.userData.ownedMaterials=true;
  for(let i=0;i<20;i++)step(world,second,1+i/120,secondBag);
  assert.equal(actor.userData.avatarRig,second);assert.equal(first.visualRoot.parent,null);
  assert.ok(Math.abs(first.metrics.bodyRestY/first.metrics.height-second.metrics.bodyRestY/second.metrics.height)>.01,'choices must retain distinct body proportions, not just recolor or resize one mesh');
  assert.ok(Math.abs(actor.userData.height-male.option.height)<1e-5);assert.throws(()=>first.restore(),/another installed rig/);
  second.detach();first.restore();assertShell(actor,activeFemale);
  assert.equal(first.visualRoot.parent,actor);assert.equal(second.visualRoot.parent,null);
  assert.equal(firstBag.root.parent,female.vrm.humanoid.getRawBoneNode('hips'));
  second.update(1/60,10,{talking:true});second.dispose();second.dispose();assertShell(actor,activeFemale);
  for(let i=0;i<20;i++)step(world,first,2+i/120,firstBag);
  assert.ok(shoeClearance(first,world.heightAt)>-.003);
  assert.ok(actor.userData.characterMeshes.every(mesh=>first.meshes.includes(mesh)||firstBag.meshes.includes(mesh)));
  first.dispose();first.dispose();assertShell(actor,baseline);assert.equal(baseline.fields.characterMesh.visible,true);
  assert.deepEqual(actor.position.toArray(),[8,.6,-3]);assert.equal(actor.rotation.y,1.2);
});
