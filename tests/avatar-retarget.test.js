import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {VRMLoaderPlugin,VRMUtils} from '@pixiv/three-vrm';
import {createCharacter} from '../src/characters.js';
import {updateTownLife} from '../src/town-life.js';
import {installAvatarRig} from '../src/avatar-retarget.js';

// Retain the real shipped skin, joints and morphs. Textures are unnecessary
// for these numerical tests; rendered appearance is checked in the browser.
async function fixture({heading=0,x=0,z=0,heightAt=()=>0}={}) {
  const loader=new GLTFLoader();
  loader.register(()=>({name:'OfflineTextureStub',loadTexture:()=>Promise.resolve(new THREE.Texture())}));
  loader.register(parser=>new VRMLoaderPlugin(parser));
  const bytes=fs.readFileSync(new URL('../public/models/ayao.vrm',import.meta.url));
  const gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const vrm=gltf.userData.vrm;VRMUtils.rotateVRM0(vrm);
  const actor=createCharacter(null,'#fff','#000',true,'player');
  actor.position.set(x,heightAt(x,z),z);actor.rotation.y=heading;
  const originalMesh=actor.userData.characterMesh;
  const originalRig={...actor.userData.rig};
  const controller=installAvatarRig(actor,vrm);
  const world={player:actor,npcs:[],active:true,suspended:false,blocked:false,reduced:false,walking:false,
    moveSpeed:0,movementDistance:0,heightAt,canWalk:()=>true,storyFlags:new Set(),
    playerMotion:{grounded:true,phase:'grounded',acceleration:0},callbacks:{}};
  const shoes=controller.meshes.filter(mesh=>(Array.isArray(mesh.material)?mesh.material:[mesh.material]).some(material=>/shoe|boot|footwear|sneaker/i.test(material.name)));
  assert.ok(shoes.length,'shipped avatar must retain a measurable footwear primitive');
  const shoeVertices=shoes.map(mesh=>[mesh,[...new Set(mesh.geometry.index?.array??Array.from({length:mesh.geometry.attributes.position.count},(_,i)=>i))]]);
  function update(time,options={}) {
    updateTownLife(world,1/120,time);controller.update(1/120,time,options);actor.updateMatrixWorld(true);
  }
  function clearances() {
    let minimum=Infinity;const p=new THREE.Vector3();
    for(const [mesh,vertices] of shoeVertices){mesh.skeleton.update();for(const i of vertices){
      mesh.getVertexPosition(i,p).applyMatrix4(mesh.matrixWorld);
      assert.ok(Number.isFinite(p.x+p.y+p.z),'skinned shoe vertex must be finite');
      minimum=Math.min(minimum,p.y-heightAt(p.x,p.z));
    }}
    return minimum;
  }
  return {actor,vrm,controller,world,update,clearances,originalMesh,originalRig};
}

test('shipped VRM0 installs at 1.78 m with natural arms and footwear dimensions',async()=>{
  const f=await fixture(),m=f.controller.metrics;
  assert.ok(Math.abs(m.height-1.78)<1e-5);
  assert.ok(m.eyeHeight>1.55&&m.eyeHeight<1.68);
  assert.ok(m.soleFront>.12&&m.soleFront<.22);
  assert.ok(m.soleBack>-.1&&m.soleBack<0);
  assert.ok(m.soleHalfWidth>.03&&m.soleHalfWidth<.08);
  assert.equal(f.originalMesh.visible,false);
  assert.equal(f.controller.visualRoot.parent,f.actor);
  for(const side of ['left','right']){
    const arm=f.vrm.humanoid.getRawBoneNode(side+'UpperArm').getWorldPosition(new THREE.Vector3());
    const hand=f.vrm.humanoid.getRawBoneNode(side+'Hand').getWorldPosition(new THREE.Vector3());
    assert.ok(arm.y-hand.y>.45,'hands should hang below the shoulder');
    assert.ok(Math.abs(hand.x-arm.x)<.1,'arms should not remain in the T pose');
  }
});

for(const heading of [0,Math.PI/2,Math.PI,-Math.PI/3])test(`real shoe skin is grounded at actor heading ${heading}`,async()=>{
  const f=await fixture({heading,x:21.5,z:-8.7,heightAt:()=>.83});
  for(let i=0;i<120;i++)f.update(i/120);
  const clearance=f.clearances();
  assert.ok(clearance>=-.003&&clearance<.008,`shoe floor clearance ${clearance} m`);
  for(const side of ['left','right'])for(const part of ['UpperLeg','LowerLeg','Foot','UpperArm','LowerArm','Hand']){
    const normal=f.vrm.humanoid.getNormalizedBoneNode(side+part).getWorldPosition(new THREE.Vector3());
    const raw=f.vrm.humanoid.getRawBoneNode(side+part).getWorldPosition(new THREE.Vector3());
    assert.ok(normal.distanceTo(raw)<1e-5,`${side+part} normalized/raw disagreement`);
  }
});

test('installation is invariant to the existing gameplay shell position and rotation',async()=>{
  const a=await fixture(),b=await fixture({heading:1.9,x:19,z:-27,heightAt:()=>1.3});
  assert.deepEqual(a.controller.metrics,b.controller.metrics);
  assert.deepEqual(b.actor.position.toArray(),[19,1.3,-27]);
  assert.equal(b.actor.rotation.y,1.9);
  for(const name of ['hips','spine','head','leftHand','rightHand','leftFoot','rightFoot']){
    const local=f=>f.actor.worldToLocal(f.vrm.humanoid.getRawBoneNode(name).getWorldPosition(new THREE.Vector3()));
    assert.ok(local(a).distanceTo(local(b))<1e-5,`${name} should not double-apply the actor transform`);
  }
});

test('real footwear remains above a 1:8 ramp through running and landing',async()=>{
  const f=await fixture({heading:Math.PI/4,x:2.1,z:1.7,heightAt:(x,z)=>z/8});
  f.world.walking=true;f.world.moveSpeed=5.6;
  for(let i=0;i<240;i++){
    f.world.movementDistance=5.6/120;
    f.actor.position.x+=Math.sin(f.actor.rotation.y)*5.6/120;
    f.actor.position.z+=Math.cos(f.actor.rotation.y)*5.6/120;
    f.actor.position.y=f.world.heightAt(f.actor.position.x,f.actor.position.z);
    f.update(i/120);
    if(i%8===0)assert.ok(f.clearances()>-.006,`running frame ${i} penetrates the floor`);
  }
  f.world.playerMotion={grounded:false,phase:'rising',takeoffTime:.18,verticalVelocity:3.5};
  f.actor.position.y+=.5;
  for(let i=0;i<24;i++)f.update(2+i/120);
  assert.ok(f.clearances()>.2,'jumping shoes should lift with the player shell');
  f.world.playerMotion={grounded:true,phase:'landing',landingTime:.08,impactSpeed:3.5};
  f.actor.position.y=f.world.heightAt(f.actor.position.x,f.actor.position.z);
  f.world.walking=false;f.world.moveSpeed=0;f.world.movementDistance=0;
  for(let i=0;i<24;i++)f.update(2.2+i/120);
  assert.ok(f.clearances()>-.006,'landing should not put the shoes underground');
});

test('blink uses morph expressions and disposal restores the procedural controller',async()=>{
  const f=await fixture();
  f.actor.userData.rig.eyes[0].scale.y=.06;
  f.controller.update(1/60,1,{talking:true});
  assert.ok(f.vrm.expressionManager.getValue('blink')>.99);
  assert.ok(f.vrm.expressionManager.getValue('aa')>0);
  f.controller.update(1/60,1,{reduced:true,talking:true});
  assert.equal(f.vrm.expressionManager.getValue('blink'),0);
  assert.equal(f.vrm.expressionManager.getValue('aa'),0);
  f.controller.dispose();f.controller.dispose();
  assert.equal(f.actor.userData.characterMesh,f.originalMesh);
  assert.equal(f.originalMesh.visible,true);
  assert.equal(f.actor.userData.avatarRig,undefined);
  assert.deepEqual(Object.keys(f.actor.userData.rig).sort(),Object.keys(f.originalRig).sort());
  for(const key of Object.keys(f.originalRig))assert.equal(f.actor.userData.rig[key],f.originalRig[key],`restore ${key}`);
});
