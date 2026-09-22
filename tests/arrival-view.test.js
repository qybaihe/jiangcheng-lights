import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {World} from '../src/world.js';
import {START} from '../src/story.js';
import {bendPoint,unbendPoint} from '../src/curved-world.js';
import {updateThirdPerson} from '../src/exploration.js';
import {beginArrivalView,cancelArrivalView,getArrivalView,updateArrivalView} from '../src/arrival-view.js';
function fixture(){
 const w=Object.create(World.prototype);w.player=new THREE.Group();w.player.position.set(START.x,.13,START.z);w.player.userData={height:1.78,eyeHeight:1.64,legs:[]};
 w.camera=new THREE.PerspectiveCamera(54,16/9,.08,380);w.controls={target:new THREE.Vector3(),enabled:false,minDistance:9,maxDistance:110,update(){}};
 Object.assign(w,{active:true,blocked:false,suspended:false,reduced:false,walking:false,moveSpeed:0,elapsed:0,cameraMode:'street',path:[],keys:{},npcs:[],colliders:[],cameraOccluders:[],firstYaw:0,firstPitch:0,eyeHeight:1.64,lookSensitivity:.0024,callbacks:{},playerMotion:{grounded:true},propInteractions:{mode:'walk',start:()=>({ok:false})},storyFlags:new Set(['received']),shadowStats:{requests:1,updates:1},thirdYaw:-1.206817,thirdPitch:.16,thirdDistance:4.6,releasePointerLock(){}});
 w.curvedWorld={enabled:true,center:w.player.position,radius:145,point:(p,out)=>bendPoint(p,w.player.position,145,out),inverse:(p,out)=>unbendPoint(p,w.player.position,145,out),update(){}};
 updateThirdPerson(w,0,true);return w;
}
const storySnapshot=w=>({position:w.player.position.toArray(),rotation:w.player.quaternion.toArray(),flags:[...w.storyFlags],shadow:{...w.shadowStats},yaw:w.thirdYaw,pitch:w.thirdPitch,distance:w.thirdDistance});

test('3.8-second arrival frames the existing Wuhan landmarks and hands back to the same player',()=>{
 const w=fixture(),before=storySnapshot(w),end=w.camera.position.clone();assert.ok(beginArrivalView(w));
 const initial=getArrivalView(w);assert.equal(initial.duration,3.8);assert.ok(w.camera.position.y>30);
 assert.deepEqual(initial.landmarks.map(x=>x.id),['jianghanguan','yangtze-bridge','river']);assert.ok(initial.landmarks.every(x=>x.inFrustum),JSON.stringify(initial.landmarks));
 let previous=0;for(let i=0;i<76;i++){updateArrivalView(w,.05);const state=getArrivalView(w);assert.ok(state.progress>=previous);previous=state.progress;assert.deepEqual(storySnapshot(w),before);assert.ok(w.camera.position.toArray().every(Number.isFinite));}
 const result=getArrivalView(w);assert.equal(result.active,false);assert.equal(result.phase,'complete');assert.equal(result.progress,1);assert.ok(w.camera.position.distanceTo(end)<1e-8);assert.equal(w.camera.fov,54);assert.equal(w.controls.enabled,false);
});

test('reduced motion goes straight to the follow view with no delayed hold',()=>{
 const w=fixture();w.reduced=true;const end=w.camera.position.clone(),before=storySnapshot(w);
 assert.ok(w.beginArrivalView());assert.equal(w.getArrivalView().active,false);assert.equal(w.getArrivalView().phase,'complete');assert.equal(w.getArrivalView().reason,'reduced');assert.ok(w.camera.position.equals(end));assert.deepEqual(storySnapshot(w),before);
});

for(const setup of [w=>w.active=false,w=>w.blocked=true,w=>w.suspended=true,w=>w.conversation={},w=>w.propInteractions.mode='car',w=>w.propInteractions.mode='bicycle',w=>w.path.push(new THREE.Vector3(2,0,21)),w=>w.keys.w=true,w=>w.moveSpeed=.1,w=>w.playerMotion.grounded=false,w=>w.cameraMode='first',w=>w.player.position.x=22])test(`unsafe entry retains the current state: ${setup}`,()=>{
 const w=fixture();setup(w);const before=storySnapshot(w),camera=w.camera.position.clone();assert.equal(w.beginArrivalView(),false);assert.deepEqual(storySnapshot(w),before);assert.ok(w.camera.position.equals(camera));assert.equal(w.getArrivalView().active,false);
});

test('input and new interactions cancel immediately, without rewinding position or story',()=>{
 for(const action of [w=>w.setLookDelta(3,2),w=>w.beginConversation('shop'),w=>w.startPropInteraction('missing'),w=>w.setCameraMode('overview'),w=>w.navigateRoute({reachable:false})]){
  const w=fixture();assert.ok(w.beginArrivalView());updateArrivalView(w,.05);const before=storySnapshot(w);action(w);assert.equal(w.getArrivalView().active,false, String(action));assert.deepEqual(w.player.position.toArray(),before.position);assert.deepEqual([...w.storyFlags],before.flags);assert.deepEqual(w.shadowStats,before.shadow);
 }
 const w=fixture();w.beginArrivalView();w.keys.w=true;updateArrivalView(w,.05);assert.equal(w.getArrivalView().reason,'movement');assert.equal(w.keys.w,true,'the input continues into normal movement, rather than being swallowed');
});

test('background/suspension pause elapsed time, and resizing keeps normalized progress',()=>{
 const w=fixture();w.beginArrivalView();updateArrivalView(w,.1);const progress=w.getArrivalView().progress,position=w.camera.position.clone();
 const old=globalThis.document;globalThis.document={hidden:true};try{updateArrivalView(w,100);assert.equal(w.getArrivalView().phase,'paused');assert.equal(w.getArrivalView().progress,progress);assert.ok(w.camera.position.equals(position));}finally{if(old===undefined)delete globalThis.document;else globalThis.document=old;}
 w.suspended=true;updateArrivalView(w,100);assert.equal(w.getArrivalView().progress,progress);w.suspended=false;
 w.camera.aspect=1366/768;w.camera.updateProjectionMatrix();updateArrivalView(w,0);assert.equal(w.getArrivalView().progress,progress);assert.ok(w.camera.position.equals(position));
 updateArrivalView(w,100);assert.ok(w.getArrivalView().elapsed<=.201,'a resumed wall-clock gap cannot jump the whole flight');
});

test('skip is idempotent and later movement does not get pulled back to START',()=>{
 const w=fixture();w.beginArrivalView();updateArrivalView(w,.1);w.player.position.x+=.3;
 assert.ok(cancelArrivalView(w,'skip'));assert.equal(cancelArrivalView(w,'skip'),false);assert.equal(w.player.position.x,START.x+.3);const before=w.camera.position.clone();updateArrivalView(w,100);assert.ok(w.camera.position.equals(before));assert.equal(w.getArrivalView().phase,'cancelled');
});

test('a blocked flight corridor is skipped rather than crossing a roof or wall',()=>{
 const w=fixture();w.cameraOccluders.push({x:8,X:25,z:25,Z:50,y:0,height:150});const before=storySnapshot(w);
 assert.equal(w.beginArrivalView(),false);assert.deepEqual(storySnapshot(w),before);assert.equal(w.getArrivalView().phase,'idle');
});

test('diagnostics are copies and repeated begin cannot restart an active shot',()=>{
 const w=fixture();assert.ok(w.beginArrivalView());updateArrivalView(w,.1);const snapshot=w.getArrivalView();snapshot.landmarks[0].ndc[0]=999;snapshot.startCamera[0]=999;
 assert.equal(w.beginArrivalView(),false);assert.equal(w.getArrivalView().elapsed,.1);assert.notEqual(w.getArrivalView().landmarks[0].ndc[0],999);assert.notEqual(w.getArrivalView().startCamera[0],999);
 w.cancelArrivalView();assert.ok(w.beginArrivalView({duration:100}));assert.equal(w.getArrivalView().duration,4);w.cancelArrivalView();
});
