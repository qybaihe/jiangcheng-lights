import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {ROWBOAT_DOCK,buildRowboat,rowboatPoseWithinBounds} from '../src/rowboat.js';
import {WorldInteractions} from '../src/world-interactions.js';
import {createRaceSession,recordRaceResult} from '../src/neighborhood-races.js';

test('all eight boat gates are completable through normal WorldInteractions physics, not position/result injection',()=>{
 const w={scene:new THREE.Scene(),static:new THREE.Group(),active:true,suspended:false,blocked:false,storyFlags:new Set(),keys:{},path:[],player:new THREE.Group(),callbacks:{},cameraMode:'street',elapsed:0,thirdYaw:Math.PI/2,lastManualLook:0};
 const boat=buildRowboat(w),controller=Object.create(WorldInteractions.prototype);Object.assign(controller,{world:w,boat,mode:'boat',currentId:'prop-rowboat',boatSpeed:0,boatStrokePhase:0,paperEdition:'beforeRain',completedFerryTrips:0});
 assert.equal(boat.position.x,ROWBOAT_DOCK.x);assert.equal(boat.position.z,ROWBOAT_DOCK.z);
 const session=createRaceSession('boat');let state=session.snapshot(),steps=0,boundaryHits=0;
 while(!['finished','cancelled'].includes(state.status)&&steps++<5000){
  const cp=state.nextCheckpoint,yaw=Math.atan2(cp.x-boat.position.x,cp.z-boat.position.z),difference=Math.atan2(Math.sin(yaw-boat.rotation.y),Math.cos(yaw-boat.rotation.y)),running=state.status==='running';
  w.keys={w:running&&Math.abs(difference)<.30,a:running&&difference>.047,d:running&&difference<-.047};w.elapsed+=.025;
  controller.update(.025,w.elapsed);boundaryHits+=controller.boatBoundaryHit?1:0;
  assert(rowboatPoseWithinBounds({x:boat.position.x,z:boat.position.z,yaw:boat.rotation.y}));
  state=session.update(.025,{mode:controller.mode,x:boat.position.x,z:boat.position.z});
 }
 assert.equal(state.status,'finished');assert.equal(state.checkpointsPassed,8);assert(state.elapsed>30&&state.elapsed<60);assert.equal(boundaryHits,0);assert.equal(controller.completedFerryTrips,0);
 const result=recordRaceResult(null,state.result);assert.equal(result.courses.boat.completions,1);assert.equal(result.courses.car.completions,0);
});
