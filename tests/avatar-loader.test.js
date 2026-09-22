import test,{beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createCharacter} from '../src/characters.js';
import {loadHeroAvatar,HERO_ASSET_TIMEOUT_MS} from '../src/avatar.js';
import {updatePlayerOcclusion} from '../src/exploration.js';

const originalFetch=globalThis.fetch,originalParse=GLTFLoader.prototype.parseAsync,originalError=console.error;
let fetchImpl,parseImpl,errors,parsed;
const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function response(url) {
  const bytes=fs.readFileSync(new URL('../public'+url,import.meta.url));
  return {ok:true,status:200,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};
}
async function parseReal(loader,bytes,path) {
  loader.register(()=>({name:'OfflineTextureStub',loadTexture:()=>{
    const texture=new THREE.Texture();texture.image={width:1,height:1,data:new Uint8Array([255,255,255,255]),close(){this.closed=(this.closed??0)+1;}};
    return Promise.resolve(texture);
  }}));
  const gltf=await originalParse.call(loader,bytes,path);parsed.push(gltf);return gltf;
}
beforeEach(()=>{
  errors=[];parsed=[];fetchImpl=async url=>response(url);parseImpl=parseReal;
  globalThis.fetch=(...args)=>fetchImpl(...args);
  GLTFLoader.prototype.parseAsync=function(...args){return parseImpl(this,...args);};
  console.error=(...args)=>errors.push(args);
});
afterEach(()=>{globalThis.fetch=originalFetch;GLTFLoader.prototype.parseAsync=originalParse;console.error=originalError;});

function worldFixture() {
  const player=createCharacter(null,'#fff','#000',true,'player');player.position.set(13,.85,-9);player.rotation.y=1.2;
  return {player,renderer:{capabilities:{getMaxAnisotropy:()=>4}},curvedWorld:{attach(){},patchMaterial(){}},
    eyeHeight:1.65,elapsed:7.3,walking:false,blocked:false,reduced:false,active:true,suspended:false,
    playerMotion:{grounded:false,phase:'falling',verticalVelocity:-2.1},path:[{x:12,z:8}],cameraMode:'street',playerCameraDistance:2,
    firstFrameRendered:true};
}
function watchResources(scene) {
  const set=new Set(),images=new Set();
  scene.traverse(node=>{
    if(node.geometry)set.add(node.geometry);if(node.skeleton)set.add(node.skeleton);
    for(const material of(Array.isArray(node.material)?node.material:[node.material]))if(material){
      set.add(material);for(const value of Object.values(material))if(value?.isTexture){set.add(value);if(value.image?.close)images.add(value.image);}
    }
  });
  const calls=new Map();for(const item of set){calls.set(item,0);const dispose=item.dispose;item.dispose=function(){calls.set(item,calls.get(item)+1);return dispose.call(this);};}
  return {calls,images};
}
function shellState(world) {return {position:world.player.position.toArray(),rotation:world.player.quaternion.toArray(),motion:world.playerMotion,path:world.path,active:world.active,suspended:world.suspended};}
function checkShell(world,before) {
  assert.deepEqual(world.player.position.toArray(),before.position);assert.deepEqual(world.player.quaternion.toArray(),before.rotation);
  assert.ok(world.playerMotion===before.motion);assert.ok(world.path===before.path);
  assert.equal(world.active,before.active);assert.equal(world.suspended,before.suspended);
}

test('female → male → female keeps the gameplay shell and frees every replaced GPU resource',async()=>{
  const world=worldFixture(),before=shellState(world);
  const female=await loadHeroAvatar(world,'female');assert.equal(female?.id,'female');assert.equal(world.avatarStatus.state,'ready');
  const femaleScene=female.vrm.scene,oldRig=female.rig,oldMeshes=new Set(world.player.userData.characterMeshes),watch=watchResources(femaleScene);
  const oldBindings=world.playerFadeBindings,oldStates=world.playerFadeStates;
  assert.ok(oldBindings.size>0);assert.ok(oldStates.size>0);
  const male=await loadHeroAvatar(world,'male');
  assert.equal(male?.id,'male');assert.equal(world.avatarStatus.id,'male');assert.equal(world.avatarStatus.state,'ready');
  assert.ok(Math.abs(world.player.userData.height-1.82)<1e-5);assert.equal(world.eyeHeight,world.player.userData.eyeHeight);
  assert.ok(world.player.userData.avatarRig===male.rig);assert.equal(femaleScene.parent,null);
  assert.equal(female.rig,null);assert.equal(female.vrm,null);assert.equal(female.accessories,null);
  assert.equal(oldBindings.size,0);assert.equal(oldStates.size,0);
  for(const count of watch.calls.values())assert.equal(count,1,'each retired resource must be disposed once');
  for(const image of watch.images)assert.equal(image.closed,1,'decoded textures must be closed once');
  for(const mesh of world.playerFadeBindings.keys())assert.ok(!oldMeshes.has(mesh));
  oldRig.dispose();assert.ok(world.player.userData.avatarRig===male.rig,'disposing an already retired rig must not remove the new one');
  const next=await loadHeroAvatar(world,'female');assert.equal(next?.id,'female');assert.ok(next!==female);
  assert.equal(world.player.children.filter(child=>child.name==='阿遥 · VRM visual').length,1);
  assert.ok(Math.abs(world.player.userData.height-1.78)<1e-5);assert.equal(world.firstFrameRendered,false);
  checkShell(world,before);assert.equal(errors.length,0);
});

test('selecting the currently installed hero does not download or rebuild it',async()=>{
  const world=worldFixture(),hero=await loadHeroAvatar(world,'female');
  fetchImpl=()=>{throw new Error('unexpected download');};
  const result=await loadHeroAvatar(world,'female');assert.ok(result===hero);assert.equal(world.avatarStatus.state,'ready');assert.equal(errors.length,0);
});

test('initial hero fetch has foreground priority and a slow-network budget',async()=>{
  const world=worldFixture();let options;
  fetchImpl=async(url,value)=>{options=value;return response(url);};
  await loadHeroAvatar(world,'female');
  assert.equal(options.priority,'high');assert.ok(options.signal instanceof AbortSignal);
  assert.equal(HERO_ASSET_TIMEOUT_MS,60000);assert.equal(world.avatarStatus.state,'ready');
});

test('a failed first-load avatar can be retried without restarting or changing the save',async()=>{
  const world=worldFixture(),before=shellState(world);let failures=1;
  fetchImpl=async url=>failures-- > 0?{ok:false,status:503}:response(url);
  assert.equal(await loadHeroAvatar(world,'female'),null);assert.equal(world.avatarStatus.state,'fallback');
  assert.equal((await loadHeroAvatar(world,'female')).id,'female');
  assert.equal(world.avatarStatus.state,'ready');checkShell(world,before);
});

for(const stage of ['download','parse'])test(`${stage} failure retains the live hero, eye height and fade caches`,async()=>{
  const world=worldFixture(),hero=await loadHeroAvatar(world,'female'),height=world.eyeHeight;
  const bindings=world.playerFadeBindings,states=world.playerFadeStates,watch=watchResources(hero.vrm.scene),before=shellState(world);
  if(stage==='download')fetchImpl=async()=>({ok:false,status:503});else parseImpl=async()=>{throw new Error('invalid model');};
  const result=await loadHeroAvatar(world,'male');
  assert.ok(result===hero);assert.ok(world.heroAvatar===hero);assert.equal(world.avatarStatus.id,'female');assert.equal(world.avatarStatus.requestedId,'male');assert.equal(world.avatarStatus.state,'error');
  assert.equal(world.eyeHeight,height);assert.ok(world.playerFadeBindings===bindings);assert.ok(world.playerFadeStates===states);
  for(const count of watch.calls.values())assert.equal(count,0);
  hero.update(1/60,8);checkShell(world,before);assert.equal(errors.length,1);
});

for(const stage of ['rig','curvature','fade'])test(`${stage} setup failure rolls back the exact previous pose and visibility`,async()=>{
  const world=worldFixture(),hero=await loadHeroAvatar(world,'female');
  world.player.userData.body.rotation.x=.13;world.player.userData.rig.root.position.y=-.025;hero.update(1/60,9);
  updatePlayerOcclusion(world,0);
  const height=world.eyeHeight,bindings=world.playerFadeBindings,states=world.playerFadeStates,bindingSize=bindings.size,stateSize=states.size;
  const opacity=world.playerOpacity,visible=world.player.visible,before=shellState(world),watch=watchResources(hero.vrm.scene);
  if(stage==='rig')parseImpl=async(...args)=>{const gltf=await parseReal(...args),humanoid=gltf.userData.vrm.humanoid,lookup=humanoid.getNormalizedBoneNode.bind(humanoid);humanoid.getNormalizedBoneNode=name=>name==='rightFoot'?null:lookup(name);return gltf;};
  if(stage==='curvature')world.curvedWorld.attach=()=>{throw new Error('failed shader attachment');};
  if(stage==='fade')world.curvedWorld.patchMaterial=()=>{throw new Error('failed fade material');};
  const result=await loadHeroAvatar(world,'male');
  assert.ok(result===hero);assert.ok(world.heroAvatar===hero);assert.ok(world.player.userData.avatarRig===hero.rig);
  assert.equal(world.avatarStatus.state,'error');assert.equal(world.avatarStatus.id,'female');assert.equal(world.eyeHeight,height);
  assert.equal(world.playerOpacity,opacity);assert.equal(world.player.visible,visible);
  assert.ok(world.playerFadeBindings===bindings);assert.ok(world.playerFadeStates===states);assert.equal(bindings.size,bindingSize);assert.equal(states.size,stateSize);
  assert.ok(Math.abs(world.player.userData.body.rotation.x-.13)<1e-12);assert.equal(world.player.userData.rig.root.position.y,-.025);
  for(const count of watch.calls.values())assert.equal(count,0);
  assert.equal(world.player.children.filter(child=>child.name==='阿遥 · VRM visual').length,1);
  hero.update(1/60,10);checkShell(world,before);assert.equal(errors.length,1);
});

test('a late parsed request cannot replace the newer hero and releases its discarded model',async()=>{
  const world=worldFixture(),hold=defer(),started=defer();let count=0,discardedWatch;
  parseImpl=async(...args)=>{
    const gltf=await parseReal(...args);
    if(++count===1){discardedWatch=watchResources(gltf.scene);started.resolve();await hold.promise;}
    return gltf;
  };
  const male=loadHeroAvatar(world,'male');await started.promise;
  const female=await loadHeroAvatar(world,'female');assert.equal(female?.id,'female');
  hold.resolve();const staleResult=await male;
  assert.ok(staleResult===female);assert.ok(world.heroAvatar===female);assert.equal(world.avatarStatus.id,'female');assert.equal(world.avatarStatus.state,'ready');
  for(const count of discardedWatch.calls.values())assert.equal(count,1);
  assert.equal(errors.length,0);
});

test('the old hero stays usable during a pending download and selecting it cancels that download',async()=>{
  const world=worldFixture(),hero=await loadHeroAvatar(world,'female'),started=defer();let signal;
  fetchImpl=async(url,options)=>{signal=options.signal;started.resolve();return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Cancelled','AbortError')),{once:true}));};
  const request=loadHeroAvatar(world,'male');await started.promise;
  assert.ok(world.heroAvatar===hero);assert.equal(world.avatarStatus.state,'loading');assert.equal(world.avatarStatus.activeId,'female');hero.update(1/60,8);
  const retained=await loadHeroAvatar(world,'female');assert.ok(retained===hero);assert.equal(signal.aborted,true);
  assert.ok(await request===hero);assert.equal(world.avatarStatus.id,'female');assert.equal(world.avatarStatus.state,'ready');assert.equal(errors.length,0);
});

test('first-load failure keeps the procedural player and an invalid choice uses the catalog default',async()=>{
  const world=worldFixture(),mesh=world.player.userData.characterMesh,height=world.eyeHeight;let requested;
  fetchImpl=async url=>{requested=url;return {ok:false,status:404};};
  const result=await loadHeroAvatar(world,'../../untrusted');
  assert.equal(result,null);assert.equal(requested,'/models/ayao.vrm');assert.equal(world.avatarStatus.state,'fallback');assert.equal(world.avatarStatus.id,null);assert.equal(world.avatarStatus.requestedId,'female');
  assert.ok(world.player.userData.characterMesh===mesh);assert.equal(mesh.visible,true);assert.equal(world.eyeHeight,height);assert.equal(errors.length,1);
});
