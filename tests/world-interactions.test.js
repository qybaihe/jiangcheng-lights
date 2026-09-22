import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildStreetBicycle,updateBicycleRig} from '../src/bicycle.js';
import {canCyclePose,solveLimb,PROP_ANCHORS,WorldInteractions} from '../src/world-interactions.js';
import {requestJump} from '../src/traversal.js';

const groundWorld=()=>({heightAt:()=>.13,colliders:[],cameraOccluders:[],hazards:[],npcs:[]});
const pose=(x=0,z=0,yaw=0)=>({x,z,yaw});
test('bicycle collision sweeps wheels, middle frame and lateral turning arc',()=>{
 const w=groundWorld();assert(canCyclePose(w,pose(),pose(0,3)));
 w.colliders=[{x:-.045,X:.045,z:1.80,Z:1.85}];assert(!canCyclePose(w,pose(),pose(0,4)),'thin pole at frame center must block');
 w.colliders=[{x:1.1,X:1.14,z:-.08,Z:.08}];assert(canCyclePose(w,pose(),pose()));assert(!canCyclePose(w,pose(),pose(0,0,Math.PI/2)),'front wheel turning arc must not cut wall');
 w.colliders=[];assert(!canCyclePose(w,pose(0,-22),pose(0,-23.3)),'river boundary includes front wheel');
});
test('bicycle collision allows ordinary slopes but not stairs, hazards or neighbours',()=>{
 const w=groundWorld();w.heightAt=(x,z)=>.13+z*.125;assert(canCyclePose(w,pose(),pose(0,.32)));
 w.heightAt=(x,z)=>z>1.08?.33:.13;assert(!canCyclePose(w,pose(),pose(0,.34)));
 w.heightAt=()=>.13;w.hazards=[{x:0,z:1.6,r:.35}];assert(!canCyclePose(w,pose(),pose(0,.5)));
 w.hazards=[];w.npcs=[{group:{visible:true,position:{x:0,z:2.2}}}];assert(!canCyclePose(w,pose(),pose(0,1)));
 w.npcs[0].group.visible=false;assert(canCyclePose(w,pose(),pose(0,1)));
});
test('bicycle overhead check retains canopy clearance rather than riding through roofs',()=>{
 const w=groundWorld();w.cameraOccluders=[{x:-2,X:2,z:1,Z:3,y:1.8,height:2.0}];assert(!canCyclePose(w,pose(),pose(0,2)));
 w.cameraOccluders[0].solid=false;assert(canCyclePose(w,pose(),pose(0,2)));
});
test('bicycle dynamic rig preserves wheel radius, opposed pedals and flat pedal surfaces without shadow updates',()=>{
 const w={static:new THREE.Group(),scene:new THREE.Group(),heightAt:()=>.13,mat:color=>new THREE.MeshStandardMaterial({color})};
 const b=buildStreetBicycle(w,{dynamic:true,scale:.74,x:0,z:0}),rig=b.userData.rig;
 assert.equal(b.parent,w.scene);assert.equal(rig.wheels.length,2);assert.equal(rig.pedals.length,2);
 let count=0;b.traverse(o=>{if(o.isMesh){count++;assert.equal(o.castShadow,false);}});assert(count<50,`dynamic bike must batch meshes, got ${count}`);
 const center=new THREE.Vector3();b.updateMatrixWorld(true);rig.crank.getWorldPosition(center);
 updateBicycleRig(b,{distance:.55*.74,pedalPhase:Math.PI/3,riding:true});b.updateMatrixWorld(true);
 assert(Math.abs(rig.wheels[0].rotation.x-1)<1e-9);assert.equal(rig.kickstand.visible,false);
 const a=rig.pedals[0].getWorldPosition(new THREE.Vector3()).sub(center),c=rig.pedals[1].getWorldPosition(new THREE.Vector3()).sub(center);assert(a.clone().add(c).length()<1e-8,'opposed pedals share a crank center');
 for(const p of rig.pedals){const up=new THREE.Vector3(0,1,0).applyQuaternion(p.getWorldQuaternion(new THREE.Quaternion()));assert(up.distanceTo(new THREE.Vector3(0,1,0))<1e-8);}
 updateBicycleRig(b,{riding:false});assert.equal(rig.kickstand.visible,true);
});
test('two-bone IK puts either leg length onto a complete pedal revolution',()=>{
 for(const[a,b]of[[.4148,.4633],[.451,.470]])for(let i=0;i<32;i++){
  const upper=new THREE.Bone(),lower=new THREE.Bone(),foot=new THREE.Bone();upper.position.set(.09,1.16,0);lower.position.set(0,-a,0);foot.position.set(0,-b,0);upper.add(lower);lower.add(foot);
  const phase=i*Math.PI/16,target=new THREE.Vector3(.174,(.43-.13*Math.cos(phase)-.095*Math.sin(phase))*.74+.106+.021,(-.13*Math.sin(phase)+.095*Math.cos(phase)+.325)*.74-.045);
  solveLimb(upper,lower,foot,target,new THREE.Vector3(0,0,1));upper.updateMatrixWorld(true);assert(foot.getWorldPosition(new THREE.Vector3()).distanceTo(target)<1e-6);
 }
});
test('props have distinct navigable anchor IDs and jump input remains blocked in every seated mode',()=>{
 assert.deepEqual(PROP_ANCHORS.map(a=>a.id),['prop-bicycle','prop-newspaper','prop-ferry']);
 for(const mode of['bicycle','reading','ferry'])assert.equal(requestJump({active:true,blocked:false,suspended:false,player:{},propInteractions:{mode}}),false);
});
test('forced modal dismount succeeds at a safe ground fallback even with no neighbouring spot',()=>{
 const calls=[],controller=Object.create(WorldInteractions.prototype),w={keys:{},path:[],player:{position:new THREE.Vector3(),rotation:{z:0}},setPosition:p=>calls.push(p),heightAt:()=>.13};
 Object.assign(controller,{world:w,mode:'bicycle',safePosition:{x:-20,z:20},cameraRestore:null,bikeSpeed:3,addBikeCollider(){},removeBikeCollider(){},findDismount:()=>null,clearPose(){},bike:{userData:{}},ferry:{position:new THREE.Vector3(),rotation:{y:0}},pedalPhase:0});
 assert.equal(controller.end().ok,false);assert.equal(controller.mode,'bicycle');
 assert.equal(controller.end({immediate:true}).ok,true);assert.equal(controller.mode,'walk');assert.deepEqual(calls[0],{x:-20,z:20});
});
test('saving while riding selects a spot outside the later parked collider at every heading',()=>{
 const w=groundWorld();w.canWalk=()=>true;const controller=Object.create(WorldInteractions.prototype);controller.world=w;controller.bike={position:new THREE.Vector3(0,.13,0),rotation:{y:0}};controller.bikeCollider={};
 for(let i=0;i<16;i++){controller.bike.rotation.y=i*Math.PI/8;const point=controller.findDismount(),c=controller.bikeCollider;assert(point);assert(!(point.x>c.x-.35&&point.x<c.X+.35&&point.z>c.z-.35&&point.z<c.Z+.35));}
});
