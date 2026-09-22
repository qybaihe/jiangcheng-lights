import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {World,findWalkPath,walkableSegment} from '../src/world.js';

function fixture(colliders=[]){
 const world=Object.create(World.prototype);
 Object.assign(world,{colliders,hazards:[],cameraOccluders:[],path:[],npcs:[],active:true,blocked:false,cameraMode:'street',firstYaw:0,firstPitch:0,eyeHeight:1.65,lookSensitivity:.0024});
 world.player=new THREE.Group();world.player.userData.legs=[];world.player.position.set(0,.13,20);
 world.camera=new THREE.PerspectiveCamera(40,16/9,.3,380);world.camera.position.set(10,10,30);
 world.controls={target:new THREE.Vector3(0,2,20),minDistance:9,maxDistance:110,enableDamping:true,enabled:true,update(){}};
 world.releasePointerLock=()=>{};
 return world;
}

test('a floating-point route bends around a wall and every simplified segment is walkable',()=>{
 const world=fixture([{x:1,X:5,z:8,Z:22,height:7}]);
 const from={x:-1.31,z:17.19},to={x:8.37,z:17.83};
 const path=findWalkPath(world,from,to);
 assert.ok(path.length>=3);assert.deepEqual(path[0],from);assert.deepEqual(path.at(-1),to);
 for(let i=1;i<path.length;i++)assert.ok(walkableSegment(world,path[i-1],path[i]));
 assert.equal(walkableSegment(world,from,to),false);
});

test('thin obstacles cannot be crossed between route nodes',()=>{
 const world=fixture([{x:2.42,X:2.45,z:5,Z:24,height:2}]);
 assert.equal(walkableSegment(world,{x:1,z:15},{x:4,z:15}),false);
 const path=findWalkPath(world,{x:1,z:15},{x:4,z:15});
 assert.ok(path&&path.length>2);
 for(let i=1;i<path.length;i++)assert.ok(walkableSegment(world,path[i-1],path[i]));
});

test('raised courtyard routes use a graded entrance instead of climbing the dais edge',()=>{
 const world=fixture();
 assert.equal(walkableSegment(world,{x:-17,z:7},{x:-17,z:3}),false);
 const path=findWalkPath(world,{x:-17,z:7},{x:-17,z:.7});
 assert.ok(path);assert.ok(path.some(p=>p.x>-11||p.x<-20.1),'route must reach the eastern stairs or western ramp');
 for(let i=1;i<path.length;i++){
  assert.ok(walkableSegment(world,path[i-1],path[i]));
  const a=path[i-1],b=path[i],steps=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.025);
  let previous=world.heightAt(a.x,a.z);
  for(let n=1;n<=steps;n++){
   const y=world.heightAt(a.x+(b.x-a.x)*n/steps,a.z+(b.z-a.z)*n/steps);
   assert.ok(Math.abs(y-previous)<=.23,'route never climbs an unwalkable height discontinuity');previous=y;
  }
 }
});

test('western courtyard ramp joins both landings continuously and does not flatten the dais edge',()=>{
 const world=fixture(),x=-21.45;
 assert.equal(world.heightAt(x,10.65),.13);assert.equal(world.heightAt(x,4.99),.6);
 assert.ok(walkableSegment(world,{x,z:11},{x,z:4.5}));
 let previous=world.heightAt(x,11);
 for(let z=10.975;z>=4.5;z-=.025){
  const y=world.heightAt(x,z);assert.ok(y>=previous-1e-8);assert.ok(y-previous<.0021);previous=y;
 }
 assert.equal(walkableSegment(world,{x:-19,z:6},{x:-19,z:4}),false);
 assert.equal(walkableSegment(world,{x:-22.9,z:5.4},{x:-21.45,z:5.4}),false);
});

test('navigation is read-only until accepted and rejects an invalid destination',()=>{
 const world=fixture([{x:4,X:7,z:15,Z:23,height:8}]);
 const oldPath=world.path,route=world.getNavigation({x:10.25,z:20.12},{approach:false});
 assert.ok(route.reachable);assert.equal(world.path,oldPath);assert.ok(route.distance>10.25);
 assert.equal(world.navigateRoute(route),true);assert.ok(world.path.length);
 assert.equal(world.getNavigation({x:5,z:19},{approach:false}).reachable,false);
 assert.equal(world.getNavigation('missing').reason,'unknown-target');
 assert.equal(world.canWalk(NaN,0),false);
});

test('a route replanned beside a resident still goes around the resident',()=>{
 const world=fixture(),npc=new THREE.Group();npc.position.set(2,.13,20);world.npcs=[{id:'chef',group:npc}];world.player.position.set(1.46,.13,20);
 const route=world.getNavigation({x:4,z:20},{approach:false});assert.ok(route.reachable);assert.ok(route.path.length>2);
 for(let i=1;i<route.path.length;i++){const a=route.path[i-1],b=route.path[i];for(let n=0;n<=100;n++){const f=n/100;assert.ok(Math.hypot(a.x+(b.x-a.x)*f-2,a.z+(b.z-a.z)*f-20)>=.52);}}
});

test('first-person camera is at the eyes, turns without an orbit, and preserves its mode at start',()=>{
 const world=fixture();world.setCameraMode('first');
 assert.ok(world.camera.position.distanceTo(new THREE.Vector3(0,1.78,20))<1e-9);assert.equal(world.player.visible,false);
 assert.equal(world.controls.enabled,false);assert.equal(world.camera.fov,68);
 const position=world.camera.position.clone();world.setLookDelta(100,40);
 assert.ok(Math.abs(world.getHeading()-.24)<1e-9);assert.ok(world.firstPitch<0);
 assert.ok(world.camera.position.equals(position),'looking must not orbit around a target');
 world.start();assert.equal(world.cameraMode,'first');assert.ok(Math.abs(world.firstYaw-.24)<1e-9);
 world.setLookDelta(0,100000);assert.equal(world.firstPitch,-1.2);
});

test('live dialogue reveals both actors and restores the exact first-person position and angles',()=>{
 const world=fixture();world.player.position.set(8,.13,12);const npc=new THREE.Group();npc.position.set(10,.13,12);world.npcs=[{id:'chef',group:npc}];
 world.setCameraMode('first');world.setLookDelta(225,-30);
 const before={position:world.player.position.clone(),camera:world.camera.position.clone(),yaw:world.firstYaw,pitch:world.firstPitch};
 world.beginConversation('chef');world.blocked=true;
 assert.equal(world.player.visible,true);assert.equal(world.conversation.npc,npc);assert.equal(world.camera.fov,40);
 world.updateConversation(.05);world.endConversation();world.blocked=false;
 assert.equal(world.cameraMode,'first');assert.equal(world.player.visible,false);assert.equal(world.cameraReturn,null);
 assert.ok(world.player.position.equals(before.position));assert.ok(world.camera.position.equals(before.camera));
 assert.equal(world.firstYaw,before.yaw);assert.equal(world.firstPitch,before.pitch);assert.equal(world.camera.fov,68);
 assert.equal(world.controls.enabled,false);
});

test('static batching preserves different shadow intents even with a shared material',()=>{
 const world=fixture();world.static=new THREE.Group();world.scene=new THREE.Scene();world.scene.add(world.static);
 const material=new THREE.MeshStandardMaterial(),ground=new THREE.Mesh(new THREE.BoxGeometry(8,.1,8),material),post=new THREE.Mesh(new THREE.BoxGeometry(.2,3,.2),material);
 ground.castShadow=false;ground.receiveShadow=true;post.castShadow=true;post.receiveShadow=false;world.static.add(ground,post);world.optimize();
 assert.equal(world.static.children.length,2);assert.ok(world.static.children.some(mesh=>!mesh.castShadow&&mesh.receiveShadow));assert.ok(world.static.children.some(mesh=>mesh.castShadow&&!mesh.receiveShadow));
});
