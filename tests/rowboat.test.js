import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {ROWBOAT_DOCK,ROWBOAT_ANCHOR,ROWBOAT_SETTINGS,ROWBOAT_WATER_BOUNDS,NEIGHBORHOOD_RACE_ANCHOR,rowboatExtents,rowboatPoseWithinBounds,constrainRowboatPose,stepRowboat,buildRowboat,updateRowboatRig,createBoatLifeJacket,updateBoatLifeJacket} from '../src/rowboat.js';
import {WorldInteractions,PROP_IDS} from '../src/world-interactions.js';
import {requestJump} from '../src/traversal.js';

const fresh=()=>({...ROWBOAT_DOCK,speed:0,strokePhase:0});
const fakeWorld=()=>({scene:new THREE.Scene(),static:new THREE.Group()});
test('the rowboat uses an independent ID and safe river bay east of the passenger ferry',()=>{
 assert.equal(PROP_IDS.boat,'prop-rowboat');assert.equal(ROWBOAT_ANCHOR.id,PROP_IDS.boat);
 assert.notEqual(PROP_IDS.boat,PROP_IDS.ferry);assert.equal(ROWBOAT_ANCHOR.x,35);assert.equal(ROWBOAT_ANCHOR.z,-21.8);
 assert(ROWBOAT_WATER_BOUNDS.minX>35);assert(rowboatPoseWithinBounds(ROWBOAT_DOCK));
 assert(ROWBOAT_WATER_BOUNDS.maxZ<=-35);assert.equal(NEIGHBORHOOD_RACE_ANCHOR.id,'race-car');
 assert.equal(requestJump({active:true,blocked:false,suspended:false,player:{},propInteractions:{mode:'boat'}}),false);
});
test('W accelerates real metres per second and S first brakes before slow reverse',()=>{
 let state=fresh();for(let i=0;i<80;i++)state=stepRowboat(state,{forward:true},.025);
 assert(state.x>ROWBOAT_DOCK.x+5);assert(Math.abs(state.z-ROWBOAT_DOCK.z)<1e-8);assert(state.speed>4.4&&state.speed<=ROWBOAT_SETTINGS.maxSpeed);
 state=stepRowboat(state,{backward:true},.025);assert(state.speed>0,'first backward stroke brakes, never reverses instantly');
 for(let i=0;i<100;i++)state=stepRowboat(state,{backward:true},.025);
 assert(state.speed<0);assert(state.speed>=-ROWBOAT_SETTINGS.reverseSpeed);
 for(let i=0;i<150;i++)state=stepRowboat(state,{},.025);assert.equal(state.speed,0);
});
test('differential oars turn from a standstill without a throttle or mouse steering',()=>{
 const start={...fresh(),x:65,z:-45};const left=stepRowboat(start,{left:true},.05),right=stepRowboat(start,{right:true},.05);
 assert(left.yaw>start.yaw);assert(right.yaw<start.yaw);assert.equal(left.x,start.x);assert.equal(left.z,start.z);assert.equal(left.speed,0);
 assert(left.rowing);assert(left.strokePhase>0);
});
test('the entire rotating hull stays inside the bay at all headings and cannot cross thin boundaries',()=>{
 for(let i=0;i<180;i++){
  const yaw=i*Math.PI/90,e=rowboatExtents(yaw);
  const pose=constrainRowboatPose({x:1e5,z:-1e5,yaw});assert(rowboatPoseWithinBounds(pose));
  assert(pose.x+e.x<=ROWBOAT_WATER_BOUNDS.maxX+1e-8);assert(pose.z-e.z>=ROWBOAT_WATER_BOUNDS.minZ-1e-8);
 }
 let state={...fresh(),x:98.85,z:-43,speed:4.8};let hits=0;
 for(let i=0;i<2000;i++){state=stepRowboat(state,{forward:true,left:i>400&&i<800,right:i>1200},.05);assert(rowboatPoseWithinBounds(state));hits+=state.boundaryHit?1:0;}
 assert(hits>0);
});
test('pause and malformed frame values do not advance controls or leak NaN into transforms',()=>{
 const start={...fresh(),speed:4};const paused=stepRowboat(start,{forward:true,left:true,blocked:true},.05);
 assert.equal(paused.x,start.x);assert.equal(paused.z,start.z);assert.equal(paused.yaw,start.yaw);assert.equal(paused.speed,0);assert.equal(paused.strokePhase,0);
 for(const dt of[NaN,Infinity,-1]){const same=stepRowboat(start,{forward:true},dt);assert.equal(same.x,start.x);assert.equal(same.distance,0);}
 const recovered=stepRowboat({x:NaN,z:Infinity,yaw:NaN,speed:Infinity,strokePhase:NaN},{forward:true},.05);assert(rowboatPoseWithinBounds(recovered));assert(Number.isFinite(recovered.speed));
});
test('detailed boat batches geometry, keeps both oars articulated and adds no light/shadow refresh cost',()=>{
 const w=fakeWorld(),boat=buildRowboat(w),rig=boat.userData.rig;assert.equal(boat.parent,w.scene);assert.equal(rig.oars.length,2);assert.equal(rig.wakes.count,24);
 let meshes=0,triangles=0;boat.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;assert.equal(o.castShadow,false);}assert(!o.isLight);});
 assert(meshes<27,`parts must be batched, got ${meshes} meshes`);assert(triangles>4500,'trim, ribs, separate planks, rope coil, oars and life ring have actual geometry');
 const before=rig.oars.map(o=>o.pivot.rotation.y);updateRowboatRig(boat,{time:1,strokePhase:1,speed:3,rowing:true});
 assert.notEqual(rig.oars[0].pivot.rotation.y,before[0]);assert.equal(rig.oars[0].pivot.rotation.y,-rig.oars[1].pivot.rotation.y);assert(rig.wakes.visible);
 boat.updateWorldMatrix(true,true);for(const o of rig.oars){const hand=o.handle.getWorldPosition(new THREE.Vector3());assert([hand.x,hand.y,hand.z].every(Number.isFinite));}
 updateRowboatRig(boat,{reduced:true});assert.equal(rig.wakes.visible,false);assert.equal(boat.position.y,0);assert.equal(boat.rotation.z,0);
});
test('saving a rowboat stores the original shore point, never the water position or a forged ferry completion',()=>{
 const c=Object.create(WorldInteractions.prototype);c.mode='boat';c.safePosition={x:34.7,z:-21.3};c.world={player:{position:{x:84,z:-49}}};c.completedFerryTrips=2;
 const saved=c.safeSavePosition();assert.deepEqual(saved,{x:34.7,z:-21.3});saved.x=9;assert.equal(c.safePosition.x,34.7);assert.equal(c.completedFerryTrips,2);
});
test('normal and forced boat exits reset to the shore, clear inputs and preserve passenger trip count',()=>{
 for(const immediate of[false,true]){
  const calls=[],boat=buildRowboat(fakeWorld()),w={keys:{w:true},path:[{x:80,z:-50}],player:{position:new THREE.Vector3(80,-.18,-50),rotation:{z:0}},heightAt:()=>.13,setPosition(p){calls.push({...p});this.player.position.set(p.x,.13,p.z);}};
  const c=Object.create(WorldInteractions.prototype);Object.assign(c,{world:w,mode:'boat',currentId:'prop-rowboat',safePosition:{x:34.7,z:-21.3},cameraRestore:null,boat,boatSpeed:4,boatStrokePhase:2,boatBoundaryHit:true,pedalPhase:0,completedFerryTrips:3,bike:{userData:{}},ferry:{position:new THREE.Vector3(27,0,-35),rotation:{y:0}},addBikeCollider(){},clearPose(){},updateFraming(){}});
  const result=c.end({immediate});assert.equal(result.ok,true);assert.equal(c.mode,'walk');assert.deepEqual(calls[0],{x:34.7,z:-21.3});assert.equal(c.boatSpeed,0);assert.equal(c.currentId,null);assert.equal(c.completedFerryTrips,3);assert.equal(c.boat.position.x,ROWBOAT_DOCK.x);assert.equal(c.boat.position.z,ROWBOAT_DOCK.z);assert.deepEqual(w.keys,{});assert.deepEqual(w.path,[]);
 }
});
test('storm/inactive/conversation returns boat to shore while pause only freezes it',()=>{
 for(const condition of[{rainy:true,ended:false},{active:false},{conversation:{}}]){
  const c=Object.create(WorldInteractions.prototype);let ended=0;c.mode='boat';c.paperEdition='beforeRain';c.world={active:true,storyFlags:new Set(),...condition};c.end=({immediate})=>{ended+=immediate?1:0;};c.update(.05,1);assert.equal(ended,1);
 }
 const c=Object.create(WorldInteractions.prototype);c.mode='boat';c.paperEdition='beforeRain';c.boatSpeed=4;c.world={active:true,suspended:true,keys:{w:true},storyFlags:new Set()};c.update(.05,1);assert.equal(c.mode,'boat');assert.equal(c.boatSpeed,0);assert.deepEqual(c.world.keys,{});
});
test('invalid/remote/rainy board attempts cannot start boat or turn the race board into a ferry',()=>{
 const c=Object.create(WorldInteractions.prototype);c.mode='walk';c.anchors=()=>[ROWBOAT_ANCHOR,NEIGHBORHOOD_RACE_ANCHOR];c.world={active:true,player:{position:{x:35,z:-21.8}},rainy:true,ended:false};
 assert.equal(c.start(ROWBOAT_ANCHOR.id).ok,false);assert.equal(c.mode,'walk');c.world.rainy=false;c.world.player.position={x:0,z:0};assert.equal(c.start(ROWBOAT_ANCHOR.id).ok,false);
 c.world.player.position={x:54,z:23};assert.equal(c.start(NEIGHBORHOOD_RACE_ANCHOR.id).ok,false);assert.equal(c.mode,'walk');
});
test('safety vest follows the torso outside the VRM ownership tree and only shows while boating',()=>{
 const world=fakeWorld(),player=new THREE.Group(),body=new THREE.Bone();body.position.set(0,1.09,0);player.add(body);world.scene.add(player);
 const arms=[new THREE.Bone(),new THREE.Bone()];arms[0].position.set(-.18,.30,0);arms[1].position.set(.18,.30,0);body.add(...arms);
 player.userData={body,arms,rig:{},avatarRig:{}};Object.assign(world,{player,cameraMode:'street',avatarStatus:{id:'female'}});
 const vest=createBoatLifeJacket(world);assert.equal(vest.root.parent,world.scene);assert.equal(vest.root.visible,false);
 updateBoatLifeJacket(vest,world,{active:true});assert.equal(vest.root.visible,true);assert(vest.meshes.length<=5);assert.equal(vest.fit.avatarId,'female');
 for(const mesh of vest.meshes)assert.equal(mesh.castShadow,false);
 player.position.set(8,-.18,-40);body.rotation.x=.10;updateBoatLifeJacket(vest,world,{active:true});assert(vest.root.position.distanceTo(body.getWorldPosition(new THREE.Vector3()))<1e-9);assert(vest.root.quaternion.angleTo(body.getWorldQuaternion(new THREE.Quaternion()))<1e-8);
 const before=vest.meshes.slice();player.userData.avatarRig={};world.avatarStatus.id='male';arms[0].position.x=-.20;arms[1].position.x=.20;updateBoatLifeJacket(vest,world,{active:true});assert.equal(vest.fit.avatarId,'male');assert(before.every(m=>m.parent===null));assert(vest.fit.width>.36);
 world.cameraMode='first';updateBoatLifeJacket(vest,world,{active:true});assert.equal(vest.root.visible,false);
 world.cameraMode='street';updateBoatLifeJacket(vest,world,{active:false});assert.equal(vest.root.visible,false);
});
