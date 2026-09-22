import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {World} from '../src/world.js';
import {DIALOGUES,START} from '../src/story.js';
import {presentationFor} from '../src/dialogue-presentation.js';
import {bendPoint,unbendPoint} from '../src/curved-world.js';

function fixture(){
 const world=Object.create(World.prototype);
 Object.assign(world,{colliders:[
  // The repair shop lies between the start and granny's courtyard.
  {x:-18.15,X:-7.85,z:7.75,Z:15.05,height:8.1},
  {x:-4.175,X:-3.125,z:19,Z:20.6,height:4.76},
  {x:3.125,X:4.175,z:19,Z:20.6,height:4.76},
 ],cameraOccluders:[{x:-4.72,X:4.72,z:18.4,Z:21.2,y:4.35,height:7.65}],hazards:[],path:[],active:true,blocked:true,suspended:false,reduced:false,cameraMode:'street',firstYaw:0,firstPitch:0,eyeHeight:1.65,lookSensitivity:.0024});
 world.player=new THREE.Group();world.player.position.set(START.x,.13,START.z);world.player.rotation.y=-1.7;world.player.userData={legs:[],height:1.78,eyeHeight:1.65};
 const granny=new THREE.Group();granny.position.set(-17,.6,.7);granny.rotation.y=.41;granny.userData={height:1.52,eyeHeight:1.4};world.npcs=[{id:'granny',group:granny}];
 world.canvas={clientWidth:1440,clientHeight:900};world.camera=new THREE.PerspectiveCamera(54,1.6,.08,380);world.camera.position.set(5,3.4,26);
 world.controls=new OrbitControls(world.camera,null);world.controls.target.set(1,1.1,21);Object.assign(world.controls,{minDistance:9,maxDistance:110,minPolarAngle:.35,maxPolarAngle:1.25});
 world.releasePointerLock=()=>{};
 world.curvedWorld={update(){},enabled:true,center:world.player.position,radius:145,point:(p,out)=>bendPoint(p,world.player.position,145,out),inverse:(p,out)=>unbendPoint(p,world.player.position,145,out)};
 return world;
}
function settle(world){
 world.fitConversationCamera();world.camera.position.copy(world.conversation.position);world.controls.target.copy(world.conversation.target);world.controls.update();world.camera.updateMatrixWorld(true);
}

test('remote granny memory frames the present player on this side of the shop wall without moving anyone',()=>{
 const world=fixture(),granny=world.npcs[0].group,before={player:world.player.position.clone(),granny:granny.position.clone(),yaw:world.player.rotation.y,npcYaw:granny.rotation.y};
 const result=presentationFor('grannyMemory',0,{replay:true});assert.equal(result.placeId,'granny');
 world.beginConversation(result.placeId,{replay:true});settle(world);
 const c=world.conversation;assert.equal(c.placeId,'granny');assert.equal(c.replay,true);assert.equal(c.framingMode,'solo-memory');assert.equal(c.npc,null);assert.equal(c.eyes.length,2);
 assert.equal(c.framingTarget.x,before.player.x);assert.equal(c.framingTarget.z,before.player.z);assert.ok(c.position.distanceTo(before.player)<10);
 assert.ok(world.conversationSightline(world.camera.position,c.eyes),'rendered camera must see the present player, not just project them through a wall');
 assert.ok(world.player.position.equals(before.player));assert.ok(granny.position.equals(before.granny));assert.equal(world.player.rotation.y,before.yaw);assert.equal(granny.rotation.y,before.npcYaw);
 for(const y of[world.player.position.y,world.player.position.y+world.player.userData.height]){
  const p=world.project(world.player.position.x,world.player.position.z,y);assert.ok(p.visible&&p.x>=24&&p.x<=1416&&p.y>=168&&p.y<659,JSON.stringify(p));
 }
});

test('every replay sentence keeps the same local composition and does not animate the distant speaker',()=>{
 const world=fixture(),granny=world.npcs[0].group,yaw=granny.rotation.y;let first;
 for(const[index,line]of DIALOGUES.grannyMemory.entries()){
  world.beginConversation(presentationFor('grannyMemory',index,{replay:true}).placeId,{replay:true});world.setConversationSpeaker(line.who);
  first??=world.conversation;assert.equal(world.conversation,first);assert.equal(world.conversation.npc,null);
  assert.equal(world.speakingId,line.who==='阿遥'?'player':null);assert.equal(granny.rotation.y,yaw);
 }
});

test('a replay is not a physical visit even when the resident happens to be nearby',()=>{
 const world=fixture(),granny=world.npcs[0].group;granny.position.copy(world.player.position).add(new THREE.Vector3(2,0,0));
 world.beginConversation('granny',{replay:true});const replay=world.conversation;assert.equal(replay.npc,null);
 // The same story address with a different intent must not hit the place-only cache.
 world.beginConversation('granny');world.setConversationSpeaker('林婆婆');
 assert.notEqual(world.conversation,replay);assert.equal(world.conversation.replay,false);assert.equal(world.conversation.npc,granny);assert.equal(world.conversation.framingMode,'two-person');assert.equal(world.speakingId,'granny');
});

test('remote replay restores exact first-person eyes, direction, player pose and lens',()=>{
 const world=fixture();world.setCameraMode('first');world.setLookDelta(115,-35);
 const before={position:world.player.position.clone(),camera:world.camera.position.clone(),yaw:world.firstYaw,pitch:world.firstPitch,playerYaw:world.player.rotation.y,near:world.camera.near,fov:world.camera.fov};
 world.beginConversation('granny',{replay:true});settle(world);assert.equal(world.player.visible,true);
 world.endConversation();assert.equal(world.cameraMode,'first');assert.equal(world.player.visible,false);assert.equal(world.controls.enabled,false);assert.equal(world.cameraReturn,null);
 assert.ok(world.player.position.equals(before.position));assert.ok(world.camera.position.equals(before.camera));assert.equal(world.firstYaw,before.yaw);assert.equal(world.firstPitch,before.pitch);assert.equal(world.player.rotation.y,before.playerYaw);assert.equal(world.camera.near,before.near);assert.equal(world.camera.fov,before.fov);
});

test('remote replay restores the exact third-person boom without rotating the player',()=>{
 const world=fixture();world.setCameraMode('street');
 const before={position:world.player.position.clone(),camera:world.camera.position.clone(),target:world.controls.target.clone(),yaw:world.player.rotation.y,thirdYaw:world.thirdYaw,thirdPitch:world.thirdPitch,thirdDistance:world.thirdDistance,fov:world.camera.fov};
 world.beginConversation('shop',{replay:true});settle(world);assert.equal(world.conversation.target.x,before.position.x,'shop recollection must not look toward the distant workbench');
 world.endConversation();for(let i=0;i<300;i++)world.updateConversation(1/60);
 assert.ok(world.player.position.equals(before.position));assert.equal(world.player.rotation.y,before.yaw);assert.ok(world.camera.position.equals(before.camera));assert.ok(world.controls.target.equals(before.target));assert.equal(world.cameraReturn,null);assert.equal(world.thirdYaw,before.thirdYaw);assert.equal(world.thirdPitch,before.thirdPitch);assert.equal(world.thirdDistance,before.thirdDistance);assert.equal(world.camera.fov,before.fov);
});

test('nearby live dialogue still frames both actors, assigns speech and restores the resident heading',()=>{
 const world=fixture(),granny=world.npcs[0].group;world.player.position.set(-15,.6,.7);world.camera.position.set(-10,4.2,4.7);world.controls.target.set(-15,1.4,.7);const yaw=granny.rotation.y;
 world.beginConversation('granny');world.setConversationSpeaker('林婆婆');settle(world);
 assert.equal(world.conversation.npc,granny);assert.equal(world.conversation.replay,false);assert.equal(world.conversation.eyes.length,4);assert.equal(world.speakingId,'granny');assert.ok(world.conversationSightline(world.camera.position,world.conversation.eyes));
 world.endConversation();assert.equal(granny.rotation.y,yaw);assert.equal(world.speakingId,null);
});

test('solo replay in a narrow enclosed courtyard tries a shorter clear boom before an overhead fallback',()=>{
 const world=fixture();world.player.position.set(0,.13,20);world.camera.position.set(1,2,22);world.controls.target.set(0,1.1,20);world.cameraOccluders=[];
 world.colliders=[{x:-4.2,X:-3.95,z:15.8,Z:24.2,height:10},{x:3.95,X:4.2,z:15.8,Z:24.2,height:10},{x:-4.2,X:4.2,z:15.8,Z:16.05,height:10},{x:-4.2,X:4.2,z:23.95,Z:24.2,height:10}];
 world.beginConversation('granny',{replay:true});settle(world);
 assert.ok(world.conversationSightline(world.camera.position,world.conversation.eyes));assert.ok(Math.hypot(world.camera.position.x,world.camera.position.z-20)<5);assert.equal(world.conversation.npc,null);
});

test('the replay flag survives the good-ending after-memory handoff in the actual nextLine handler',()=>{
 const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8'),handler=source.match(/function nextLine\(\)\{[^\n]+\}/)?.[0];assert.ok(handler);
 const calls=[],context={dialogue:{key:'ending',lines:[{},{}],afterMemory:'endingGood',onDone:()=>{},replay:true},storyIndex:0,MEMORY_BOUNDARIES:{ending:{endExclusive:1}},playDialogue:(...args)=>calls.push(args),renderLine:()=>assert.fail('handoff should switch scene'),closeModal:()=>assert.fail('handoff should not finish')};
 vm.runInNewContext(handler+'\nnextLine();',context);assert.equal(calls[0][0],'endingGood');assert.equal(calls[0][2].replay,true);
});
