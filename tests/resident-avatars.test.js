import test from 'node:test';
import fs from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {VRMLoaderPlugin} from '@pixiv/three-vrm';
import {createCharacter} from '../src/characters.js';
import {updateTownLife} from '../src/town-life.js';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {RESIDENT_AVATARS,getResidentAvatarOption} from '../src/resident-avatar-catalog.js';
import {createResidentAvatarManager,loadResidentAvatars,updateResidentAvatars,disposeResidentAvatars,getResidentAvatarStatus} from '../src/resident-avatars.js';

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function fixture(ids=['granny','chef','dock','community','walker0','walker1','walker2','walker3','walker4']) {
  const scene=new THREE.Scene(),player=new THREE.Group();scene.add(player);
  const npcs=ids.map((id,index)=>{
    const group=new THREE.Group();group.name=id;group.scale.setScalar(id==='granny'?.915:id.startsWith('walker')?.85:1);
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(.4,1.6,.2),new THREE.MeshBasicMaterial());group.add(mesh);
    group.userData={characterId:id,characterMesh:mesh,characterMeshes:[mesh],height:1.6,rig:{},restBodyTilt:.04};
    group.position.set(index*2,0,3);scene.add(group);return {id,group};
  });
  const catalog=ids.map(id=>({...getResidentAvatarOption(id),id,url:'/models/shared.vrm',height:id==='granny'?1.56:1.74}));
  const world={scene,npcs,player,active:true,suspended:false,reduced:false,elapsed:0,firstFrameRendered:true,renderer:{capabilities:{getMaxAnisotropy:()=>4}},curvedWorld:{attach(){}}};
  return {world,catalog};
}
function spyDispose(item) {const original=item.dispose?.bind(item);item.disposals=0;item.dispose=()=>{item.disposals++;original?.();};return item;}
function asset(url) {
  const scene=new THREE.Group(),texture=spyDispose(new THREE.Texture());
  texture.image={width:1,height:1,close(){this.closed=(this.closed??0)+1;}};
  const material=spyDispose(new THREE.MeshBasicMaterial({map:texture})),geometry=spyDispose(new THREE.BoxGeometry(.4,1.7,.2));
  const mesh=new THREE.Mesh(geometry,material);scene.add(mesh);
  const bones=[new THREE.Bone(),new THREE.Bone()];bones[0].add(bones[1]);scene.add(bones[0]);
  mesh.skeleton=spyDispose(new THREE.Skeleton(bones));
  const spring={updates:0,resets:0,update(){this.updates++;},reset(){this.resets++;}};
  const vrm={scene,humanoid:{bones},springBoneManager:spring,updates:[],update(dt){this.updates.push(dt);this.springBoneManager?.update(dt);}};
  return {scene,userData:{vrm},parser:{associations:new Map([[texture,{textures:0}]])},texture,material,geometry,mesh,spring,url};
}
function serviceFixture(overrides={}) {
  const assets=[],installs=[],fetches=[];
  const services={
    fetch:async url=>{fetches.push(url);return {ok:true,status:200,arrayBuffer:async()=>new ArrayBuffer(1)};},
    parse:async(bytes,url)=>{const gltf=asset(url);assets.push(gltf);return gltf;},
    rotate(){},optimize(){return {before:{meshes:2,estimatedDrawCalls:3},after:{meshes:1,estimatedDrawCalls:1},savedDrawCalls:2};},
    install(actor,vrm,{targetHeight}) {
      const fields=['characterMeshes','characterMesh','height','avatarRig','avatarRenderRoot'].map(key=>({key,present:Object.hasOwn(actor.userData,key),value:actor.userData[key]}));
      const previous=actor.userData.characterMeshes,visible=previous.map(mesh=>mesh.visible);
      previous.forEach(mesh=>mesh.visible=false);
      const visualRoot=new THREE.Group();visualRoot.add(vrm.scene);actor.add(visualRoot);
      const meshes=[];vrm.scene.traverse(mesh=>{if(mesh.isMesh)meshes.push(mesh);});
      let disposed=false;
      const rig={meshes,metrics:{height:targetHeight,eyeHeight:targetHeight-.13,sideMap:['left','right']},visualRoot,updates:[],
        update(dt,time,options){this.updates.push({dt,time,options});vrm.update(dt);},
        dispose(){if(disposed)return;disposed=true;visualRoot.removeFromParent();previous.forEach((mesh,i)=>mesh.visible=visible[i]);for(const{key,present,value}of fields){if(present)actor.userData[key]=value;else delete actor.userData[key];}},
      };
      actor.userData.characterMeshes=meshes;actor.userData.characterMesh=meshes[0];actor.userData.height=targetHeight;actor.userData.avatarRig=rig;actor.userData.avatarRenderRoot=visualRoot;
      installs.push({actor,vrm,rig,scale:actor.scale.clone()});return rig;
    },...overrides,
  };
  return {services,assets,installs,fetches};
}

test('catalog has nine story identities, adult dimensions and distinct resident descriptions',()=>{
  assert.deepEqual(RESIDENT_AVATARS.map(entry=>entry.id),['granny','chef','dock','community','walker0','walker1','walker2','walker3','walker4']);
  assert.equal(new Set(RESIDENT_AVATARS.map(entry=>entry.variant)).size,9);
  assert.ok(RESIDENT_AVATARS.every(entry=>entry.height>=1.5&&entry.height<1.9));
  assert.equal(RESIDENT_AVATARS.filter(entry=>entry.age==='elder').length,2);
  assert.ok(RESIDENT_AVATARS.some(entry=>entry.gender==='male')&&RESIDENT_AVATARS.some(entry=>entry.gender==='female'));
  assert.equal(getResidentAvatarOption('../../remote.vrm'),null);
});

test('loads main four first with bounded jobs, without replacing gameplay identities',async()=>{
  const f=fixture(['walker0','community','walker1','chef','dock','granny','walker2','walker3','walker4']),events=[];
  const s=serviceFixture({parse:async(bytes,url)=>{await sleep(2);return asset(url);}});
  const before=f.world.npcs.map(npc=>({group:npc.group,position:npc.group.position.clone(),id:npc.id,mesh:npc.group.userData.characterMesh,scale:npc.group.scale.clone()}));
  const manager=createResidentAvatarManager(f.world,{catalog:f.catalog,concurrency:2,services:s.services,onInstalled:({npc})=>{events.push(npc.id);}});
  const status=await manager.load();
  assert.equal(status.state,'ready');assert.equal(status.loaded,9);assert.equal(status.peakConcurrent,2);
  assert.deepEqual(new Set(events.slice(0,4)),new Set(['granny','chef','dock','community']));
  assert.ok(events.slice(4).every(id=>id.startsWith('walker')));
  assert.equal(s.fetches.length,1,'same URL should be fetched once');assert.equal(status.parses,9,'every actor gets an independent VRM parse');
  for(let i=0;i<before.length;i++){
    assert.ok(f.world.npcs[i].group===before[i].group);assert.equal(f.world.npcs[i].id,before[i].id);
    assert.ok(f.world.npcs[i].group.position.equals(before[i].position));assert.equal(before[i].mesh.visible,false);
    assert.deepEqual(f.world.npcs[i].group.scale.toArray(),[1,1,1]);
    assert.equal(f.world.npcs[i].group.userData.height,f.catalog[i].height);
  }
  assert.ok(s.installs.every(item=>item.scale.equals(new THREE.Vector3(1,1,1))),'scale normalized before calibration');
  manager.dispose();manager.dispose();
  for(let i=0;i<before.length;i++){
    assert.ok(before[i].mesh.visible);assert.ok(before[i].group.scale.equals(before[i].scale));
    assert.equal(before[i].group.userData.avatarRig,undefined);assert.equal(before[i].group.userData.residentAvatar,undefined);
  }
});

test('progressive residents wait for the protagonist and an idle slice before any download',async()=>{
  const f=fixture(),hero=defer(),idle=defer(),entered=defer(),events=[],requests=[];
  for(const entry of f.catalog)entry.url=`/models/${entry.id}.vrm`;
  f.world.player.position.copy(f.world.npcs.find(n=>n.id==='community').group.position);
  const s=serviceFixture({
    fetch:async(url,options)=>{requests.push({url,priority:options.priority});return {ok:true,arrayBuffer:async()=>new ArrayBuffer(1)};},
    yield:async initial=>{events.push(initial?'startup-idle':'between-jobs');if(initial){entered.resolve();await idle.promise;}},
  });
  const manager=createResidentAvatarManager(f.world,{catalog:f.catalog,services:s.services,startAfter:hero.promise,progressive:true,concurrency:1});
  const loading=manager.load();await sleep(0);
  assert.equal(requests.length,0,'hero owns the initial connection budget');assert.equal(manager.status().loaded,0);
  hero.resolve();await entered.promise;
  assert.equal(requests.length,0,'boot can finish before the background queue starts');
  idle.resolve();const status=await loading;
  assert.equal(requests[0].url,'/models/community.vrm','nearest principal in the current save gets priority');
  assert.ok(requests.every(request=>request.priority==='low'));
  assert.equal(status.loaded,9);assert.equal(status.peakConcurrent,1);assert.equal(status.progressive,true);
  assert.ok(events.filter(event=>event==='between-jobs').length>=9,'parses yield to user input/rendering');
  manager.dispose();
});

test('disposing a deferred town never starts background downloads or installs late residents',async()=>{
  const f=fixture(),hero=defer(),s=serviceFixture({yield:async()=>{}});
  const manager=createResidentAvatarManager(f.world,{catalog:f.catalog,services:s.services,startAfter:hero.promise,progressive:true});
  const loading=manager.load();manager.dispose();hero.resolve();
  assert.equal((await loading).state,'disposed');assert.equal(s.fetches.length,0);assert.equal(s.installs.length,0);
});

test('a failed hero does not abandon detailed resident models',async()=>{
  const f=fixture(['chef']),hero=defer(),s=serviceFixture({yield:async()=>{}});
  const manager=createResidentAvatarManager(f.world,{catalog:f.catalog,services:s.services,startAfter:hero.promise,progressive:true});
  const loading=manager.load();hero.reject(new Error('interrupted hero request'));
  assert.equal((await loading).loaded,1);manager.dispose();
});

test('HTTP failure keeps original mesh/scale and does not stop other residents',async()=>{
  const f=fixture(['granny','chef']);f.catalog[0].url='/models/fail.vrm';
  const s=serviceFixture({fetch:async url=>({ok:!url.includes('fail'),status:url.includes('fail')?503:200,arrayBuffer:async()=>new ArrayBuffer(1)}),retryWait:async()=>{}});
  const original=f.world.npcs[0].group.userData.characterMesh,scale=f.world.npcs[0].group.scale.clone();
  const manager=createResidentAvatarManager(f.world,{catalog:f.catalog,services:s.services}),status=await manager.load();
  assert.equal(status.state,'partial');assert.equal(status.loaded,1);assert.equal(status.fallback,1);
  assert.equal(status.residents[0].state,'fallback');assert.match(status.residents[0].message,/503/);
  assert.ok(original.visible);assert.ok(f.world.npcs[0].group.scale.equals(scale));manager.dispose();
});

for(const code of [408,429,500,503])test(`transient HTTP ${code} retries once at low priority before a single parse/install`,async()=>{
  const f=fixture(['walker1']),requests=[],delays=[];
  const s=serviceFixture({yield:async()=>{},retryWait:async delay=>delays.push(delay),fetch:async(url,options)=>{
    requests.push(options);return {ok:requests.length>1,status:requests.length===1?code:200,arrayBuffer:async()=>new ArrayBuffer(1)};
  }});
  const manager=createResidentAvatarManager(f.world,{catalog:f.catalog,progressive:true,concurrency:3,services:s.services});
  const result=await manager.load();
  assert.equal(result.state,'ready');assert.equal(result.fetches,2);assert.equal(result.retries,1);assert.equal(result.parses,1);
  assert.equal(result.activeJobs,0);assert.equal(result.peakConcurrent,1);assert.equal(result.concurrency,1);
  assert.equal(s.installs.length,1);assert.equal(result.textureLeases,1);assert.deepEqual(delays,[600]);
  assert.ok(requests.every(r=>r.priority==='low'));assert.notEqual(requests[0].signal,requests[1].signal,'retry gets a fresh timeout controller');
  manager.dispose();assert.equal(manager.status().textureLeases,0);assert.equal(s.assets[0].texture.disposals,1);
});

for(const code of [400,401,403,404])test(`permanent HTTP ${code} keeps fallback without retry`,async()=>{
  const f=fixture(['walker1']);let attempts=0,waits=0;
  const s=serviceFixture({yield:async()=>{},retryWait:async()=>waits++,fetch:async()=>{attempts++;return {ok:false,status:code};}});
  const manager=createResidentAvatarManager(f.world,{catalog:f.catalog,progressive:true,services:s.services});
  const result=await manager.load();assert.equal(result.state,'partial');assert.equal(attempts,1);assert.equal(waits,0);
  assert.equal(result.fetches,1);assert.equal(result.retries,0);assert.equal(result.parses,0);assert.equal(result.activeJobs,0);manager.dispose();
});

test('network/body failure retries the cached bytes once without duplicate actor parses or texture leases',async()=>{
  const f=fixture(['granny','chef']);let attempts=0;
  const s=serviceFixture({yield:async()=>{},retryWait:async()=>{},fetch:async()=>{
    attempts++;return {ok:true,status:200,arrayBuffer:async()=>{if(attempts===1)throw new TypeError('network body interrupted');return new ArrayBuffer(1);}};
  }});
  const manager=createResidentAvatarManager(f.world,{catalog:f.catalog,progressive:true,concurrency:3,services:s.services});
  const result=await manager.load();assert.equal(result.loaded,2);assert.equal(attempts,2,'both actors share the retried byte request');
  assert.equal(result.fetches,2);assert.equal(result.retries,1);assert.equal(result.parses,2);assert.equal(s.installs.length,2);
  assert.equal(result.activeJobs,0);assert.equal(result.peakConcurrent,1);assert.equal(result.textureLeases,2);
  manager.dispose();assert.equal(manager.status().textureLeases,0);assert.equal(manager.status().decodedImages,0);
  for(const item of s.assets){assert.equal(item.texture.disposals,1);assert.equal(item.material.disposals,1);}
});

test('a second network failure exhausts the shared retry budget and never parses corrupt bytes',async()=>{
  const f=fixture(['granny','chef']);let attempts=0;
  const s=serviceFixture({yield:async()=>{},retryWait:async()=>{},fetch:async()=>{attempts++;throw new TypeError('Failed to fetch');}});
  const manager=createResidentAvatarManager(f.world,{catalog:f.catalog,progressive:true,services:s.services});
  const result=await manager.load();assert.equal(result.fallback,2);assert.equal(attempts,2);assert.equal(result.retries,1);
  assert.equal(result.parses,0);assert.equal(result.activeJobs,0);assert.equal(result.textureLeases,0);manager.dispose();
});

test('a cold-edge request receives 60 seconds, then retries exactly once with a fresh signal',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const f=fixture(['walker1']),entered=defer(),signals=[];let aborted=0;
  const s=serviceFixture({yield:async()=>{},retryWait:async()=>{},fetch:async(url,{signal})=>{
    signals.push(signal);
    if(signals.length===1)return new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>{aborted++;reject(new DOMException('Request timed out','AbortError'));},{once:true});entered.resolve();});
    return {ok:true,status:200,arrayBuffer:async()=>new ArrayBuffer(1)};
  }});
  const manager=createResidentAvatarManager(f.world,{catalog:f.catalog,progressive:true,services:s.services});
  const loading=manager.load();await entered.promise;t.mock.timers.tick(59999);await Promise.resolve();
  assert.equal(aborted,0);assert.equal(signals.length,1);assert.equal(manager.status().activeJobs,1);
  t.mock.timers.tick(1);const result=await loading;
  assert.equal(aborted,1);assert.equal(signals.length,2);assert.notEqual(signals[0],signals[1]);
  assert.equal(signals[1].aborted,false);assert.equal(result.state,'ready');assert.equal(result.parses,1);
  assert.equal(result.fetches,2);assert.equal(result.activeJobs,0);manager.dispose();
});

test('explicit fetch cancellation is terminal rather than a transient network retry',async()=>{
  const f=fixture(['walker1']);let attempts=0,waits=0;
  const s=serviceFixture({yield:async()=>{},retryWait:async()=>waits++,fetch:async()=>{attempts++;throw new DOMException('Cancelled','AbortError');}});
  const manager=createResidentAvatarManager(f.world,{catalog:f.catalog,progressive:true,services:s.services});
  const result=await manager.load();assert.equal(attempts,1);assert.equal(waits,0);assert.equal(result.retries,0);assert.equal(result.parses,0);
  assert.equal(result.activeJobs,0);manager.dispose();
});

test('disposing during fetch cancels the request without retry, parse or leaked active job',async()=>{
  const f=fixture(['walker1']),entered=defer();let attempts=0,waits=0;
  const s=serviceFixture({yield:async()=>{},retryWait:async()=>waits++,fetch:async(url,{signal})=>{
    attempts++;return new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(signal.reason),{once:true});entered.resolve();});
  }});
  const manager=createResidentAvatarManager(f.world,{catalog:f.catalog,progressive:true,services:s.services});
  const loading=manager.load();await entered.promise;manager.dispose();const result=await loading;
  assert.equal(result.state,'disposed');assert.equal(attempts,1);assert.equal(waits,0);assert.equal(result.parses,0);
  assert.equal(result.activeJobs,0);assert.equal(result.textureLeases,0);assert.equal(s.installs.length,0);
});

test('disposing during the real backoff timer settles loading promptly and prevents the second request',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const f=fixture(['walker1']);let attempts=0;
  const s=serviceFixture({yield:async()=>{},fetch:async()=>{attempts++;throw new TypeError('Failed to fetch');}});
  const manager=createResidentAvatarManager(f.world,{catalog:f.catalog,progressive:true,services:s.services});
  const loading=manager.load();for(let i=0;i<12;i++)await Promise.resolve();
  assert.equal(attempts,1);assert.equal(manager.status().activeJobs,1);
  manager.dispose();const result=await loading;
  assert.equal(result.state,'disposed');assert.equal(result.activeJobs,0);assert.equal(result.retries,0);assert.equal(attempts,1);
  t.mock.timers.tick(60000);assert.equal(attempts,1);
});

test('parse errors are never retried as fetch failures',async()=>{
  const f=fixture(['walker1']);let parses=0;
  const s=serviceFixture({yield:async()=>{},retryWait:async()=>assert.fail('parse is not a retriable phase'),parse:async()=>{parses++;throw new TypeError('Malformed VRM');}});
  const manager=createResidentAvatarManager(f.world,{catalog:f.catalog,progressive:true,services:s.services});
  const result=await manager.load();assert.equal(result.state,'partial');assert.equal(result.fetches,1);assert.equal(result.retries,0);
  assert.equal(parses,1);assert.equal(result.parses,1);assert.equal(result.activeJobs,0);assert.equal(result.textureLeases,0);manager.dispose();
});

for(const failAt of ['rig','hook','curvature'])test(`${failAt} setup failure restores dimensions and fallback without leaking textures`,async()=>{
  const f=fixture(['granny']),s=serviceFixture(),original=f.world.npcs[0].group.userData.characterMesh,scale=f.world.npcs[0].group.scale.clone();
  if(failAt==='rig')s.services.install=()=>{throw new Error('bad rig');};
  if(failAt==='curvature')f.world.curvedWorld.attach=()=>{throw new Error('bad curve');};
  const manager=createResidentAvatarManager(f.world,{catalog:f.catalog,services:s.services,onInstalled:failAt==='hook'?()=>{throw new Error('bad hook');}:undefined});
  assert.equal((await manager.load()).residents[0].state,'fallback');
  assert.ok(original.visible);assert.ok(f.world.npcs[0].group.scale.equals(scale));
  assert.equal(f.world.npcs[0].group.userData.avatarRig,undefined);assert.equal(f.world.npcs[0].group.userData.height,1.6);
  for(const item of s.assets){assert.equal(item.texture.disposals,1);assert.equal(item.texture.image.closed,1);assert.equal(item.material.disposals,1);assert.equal(item.geometry.disposals,1);}
  assert.equal(manager.status().textureLeases,0);manager.dispose();
});

test('same-source textures are shared but humanoids, skins and materials remain independent; resources release once',async()=>{
  const f=fixture(['granny','chef']),s=serviceFixture(),manager=createResidentAvatarManager(f.world,{catalog:f.catalog,services:s.services});
  await manager.load();const [a,b]=s.assets;
  assert.ok(a.userData.vrm!==b.userData.vrm);assert.ok(a.mesh.skeleton!==b.mesh.skeleton);assert.ok(a.mesh.skeleton.bones[0]!==b.mesh.skeleton.bones[0]);
  assert.ok(a.material!==b.material);assert.ok(a.material.map===b.material.map);
  assert.equal(manager.status().sharedTextures,1);assert.equal(manager.status().textureLeases,2);
  assert.equal(b.texture.disposals,1);assert.equal(b.texture.image.closed,1,'duplicate decoded image closes after pooling');
  f.world.npcs.shift();manager.update(1/60,1);
  assert.equal(manager.status().residents[0].state,'detached');assert.equal(manager.status().textureLeases,1);
  assert.equal(a.texture.disposals,0,'the remaining resident still owns a lease');
  manager.dispose();manager.dispose();
  assert.equal(a.texture.disposals,1);assert.equal(a.texture.image.closed,1);
  assert.equal(manager.status().textureLeases,0);assert.equal(manager.status().decodedImages,0);
  for(const item of [a,b])for(const resource of [item.material,item.geometry,item.mesh.skeleton])assert.equal(resource.disposals,1);
});

test('texture sampler/color-space differences do not alias pooled textures',async()=>{
  const f=fixture(['granny','chef']),assets=[];
  const s=serviceFixture({parse:async(bytes,url)=>{const item=asset(url);item.texture.colorSpace=assets.length?THREE.SRGBColorSpace:THREE.LinearSRGBColorSpace;assets.push(item);return item;}});
  const manager=createResidentAvatarManager(f.world,{catalog:f.catalog,services:s.services});await manager.load();
  assert.ok(assets[0].material.map!==assets[1].material.map);assert.equal(manager.status().sharedTextures,2);manager.dispose();
});

test('attachment hook receives actual actor and owns resources until disposal',async()=>{
  const f=fixture(['granny']),s=serviceFixture(),attachment=spyDispose(new THREE.Mesh(new THREE.BoxGeometry(.1,.1,.1),new THREE.MeshBasicMaterial()));
  let disposed=0,updated=0,hookInput=null;
  const manager=createResidentAvatarManager(f.world,{catalog:f.catalog,services:s.services,onInstalled:input=>{hookInput=input;input.vrm.scene.add(attachment);return {meshes:[attachment],metrics:{count:1},update(){updated++;},dispose(){disposed++;attachment.removeFromParent();attachment.dispose();}};}});
  await manager.load();assert.ok(hookInput.actor===f.world.npcs[0].group);assert.equal(hookInput.npc.id,'granny');
  assert.ok(f.world.npcs[0].group.userData.characterMeshes.includes(attachment));assert.equal(manager.status().residents[0].attachments.count,1);
  manager.update(1/30,1);assert.ok(updated>0);manager.dispose();manager.dispose();assert.equal(disposed,1);assert.equal(attachment.disposals,1);
});

test('disposing during parse prevents late installation and frees returned resources',async()=>{
  const f=fixture(['granny']),gate=defer(),entered=defer(),late=asset('/models/shared.vrm');
  const s=serviceFixture({parse:async()=>{entered.resolve();await gate.promise;return late;}}),manager=createResidentAvatarManager(f.world,{catalog:f.catalog,services:s.services});
  const loading=manager.load();await entered.promise;manager.dispose();gate.resolve();await loading;
  assert.equal(manager.status().state,'disposed');assert.equal(s.installs.length,0);
  assert.ok(f.world.npcs[0].group.userData.characterMesh.visible);assert.equal(late.texture.disposals,1);assert.equal(late.texture.image.closed,1);
});

test('a removed/replaced NPC is never overwritten by an in-flight asset',async()=>{
  const f=fixture(['granny']),gate=defer(),entered=defer();
  const s=serviceFixture({parse:async(bytes,url)=>{entered.resolve();await gate.promise;return asset(url);}}),manager=createResidentAvatarManager(f.world,{catalog:f.catalog,services:s.services});
  const loading=manager.load();await entered.promise;const other=new THREE.Group();f.world.npcs[0]={id:'granny',group:other};gate.resolve();await loading;
  assert.equal(s.installs.length,0);assert.equal(manager.status().residents[0].state,'detached');assert.equal(other.children.length,0);manager.dispose();
});

test('LOD limits springs to two nearby heads, skips hidden actors, and preserves speech at reduced cadence',async()=>{
  const f=fixture(['granny','chef','dock','community','walker0']),s=serviceFixture(),manager=createResidentAvatarManager(f.world,{catalog:f.catalog,services:s.services});
  await manager.load();f.world.npcs[4].group.position.z=40;f.world.npcs[3].group.visible=false;
  f.world.conversation={npc:f.world.npcs[2].group};f.world.speakingId='dock';
  for(let i=0;i<60;i++)manager.update(1/60,i/60);
  const status=manager.status(),near=status.residents[0],far=status.residents[4];
  assert.ok(status.residents.filter(item=>item.springActive).length<=2);assert.ok(status.residents[2].springActive);
  assert.equal(status.residents[3].updates,0);assert.equal(status.residents[3].lod,'hidden');
  assert.ok(near.updates>20&&near.updates<=32);assert.ok(far.updates>4&&far.updates<=9);
  const dock=s.installs.find(item=>item.actor===f.world.npcs[2].group);assert.ok(dock.rig.updates.some(call=>call.options.talking));assert.ok(dock.rig.updates.every(call=>call.options.handPose==='reading'),'cup holder uses gently curled fingers');
  assert.ok(far.updates<near.updates/2);assert.equal(s.assets[4].spring.updates,1,'far actor only has the installation update');
  const springs=s.assets.map(item=>item.spring.updates);f.world.reduced=true;
  for(let i=0;i<60;i++)manager.update(1/60,1+i/60);
  assert.equal(manager.status().residents.filter(item=>item.springActive).length,0);
  s.assets.forEach((item,index)=>assert.equal(item.spring.updates,springs[index]));manager.dispose();
});

test('diagnostic metrics are copies, and public load/dispose API is idempotent',async()=>{
  const f=fixture(['granny']),s=serviceFixture();
  const a=loadResidentAvatars(f.world,{catalog:f.catalog,services:s.services}),b=loadResidentAvatars(f.world,{catalog:f.catalog,services:s.services});
  assert.ok(a===b);await a;const status=getResidentAvatarStatus(f.world);status.residents[0].metrics.sideMap[0]='changed';
  assert.equal(getResidentAvatarStatus(f.world).residents[0].metrics.sideMap[0],'left');
  updateResidentAvatars(f.world,1/30,1);assert.ok(getResidentAvatarStatus(f.world).totalUpdates>0);
  disposeResidentAvatars(f.world);disposeResidentAvatars(f.world);assert.equal(getResidentAvatarStatus(f.world).state,'disposed');
  await loadResidentAvatars(f.world,{catalog:f.catalog,services:s.services});assert.equal(getResidentAvatarStatus(f.world).loaded,1);disposeResidentAvatars(f.world);
});

test('invalid catalogs cannot request external URLs or stretch bodies outside adult limits',async()=>{
  const f=fixture(['granny','chef']),s=serviceFixture();f.catalog[0].url='https://untrusted.example/model.vrm';f.catalog[1].height=100;
  const manager=createResidentAvatarManager(f.world,{catalog:f.catalog,concurrency:100,services:s.services});const status=await manager.load();
  assert.equal(status.concurrency,3);assert.equal(status.fallback,2);assert.equal(s.fetches.length,0);manager.dispose();
});


test('curved-frustum culling hides only visual roots, restores immediately, and keeps conversation partners visible',async()=>{
  const f=fixture(['granny']),s=serviceFixture(),manager=createResidentAvatarManager(f.world,{catalog:f.catalog,services:s.services});
  f.world.camera=new THREE.PerspectiveCamera(50,16/9,.1,120);f.world.camera.position.set(0,3,8);f.world.camera.lookAt(0,1,0);
  let curved=0;f.world.curvedWorld.point=(point,out)=>{curved++;return out.copy(point);};
  await manager.load();const actor=f.world.npcs[0].group,root=s.installs[0].rig.visualRoot;
  manager.update(1/60,0);assert.ok(root.visible);assert.ok(curved>0);
  actor.position.x=100;manager.update(1/60,.016);assert.equal(root.visible,false);assert.ok(actor.visible,'logical visibility remains owned by weather');
  const updates=manager.status().residents[0].updates;
  actor.position.x=0;manager.update(.001,.017);assert.ok(root.visible);assert.ok(manager.status().residents[0].updates>updates,'reentry refreshes pose without waiting for LOD interval');
  actor.position.x=100;manager.update(.001,.018);assert.equal(root.visible,false);
  const beforeConversation=manager.status().residents[0].updates;
  f.world.conversation={npc:actor};f.world.speakingId='granny';manager.update(.001,.019);
  assert.ok(root.visible,'actual conversation partner must remain visible through a camera transition');assert.ok(manager.status().residents[0].updates>beforeConversation);
  assert.ok(s.installs[0].rig.updates.at(-1).options.talking);manager.dispose();
});


test('all nine shipped resident skins install at metre-scale and keep real shoes grounded while walking',async()=>{
  const scene=new THREE.Scene(),player=createCharacter(null,'#fff','#888',true,'player');scene.add(player);player.position.set(-20,0,-20);
  const heightAt=(x,z)=>(x+z*.25)/50;
  const npcs=RESIDENT_AVATARS.map((entry,index)=>{const group=createCharacter(null,'#fff','#888',false,entry.id);group.position.set(index*2,0,4);group.position.y=heightAt(group.position.x,group.position.z);group.rotation.y=index%2?0:1.2;scene.add(group);return {id:entry.id,group};});
  const world={scene,player,npcs,active:true,suspended:false,blocked:false,reduced:false,walking:false,moveSpeed:0,movementDistance:0,heightAt,canWalk:()=>true,storyFlags:new Set(),playerMotion:{grounded:true,phase:'grounded',acceleration:0},callbacks:{},renderer:{capabilities:{getMaxAnisotropy:()=>1}},elapsed:0};
  const installed=new Map(),point=new THREE.Vector3();
  const manager=createResidentAvatarManager(world,{services:{
    fetch:async url=>{const bytes=fs.readFileSync(new URL('../public'+url,import.meta.url));return {ok:true,status:200,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};},
    parse:async(bytes,url)=>{const loader=new GLTFLoader();loader.register(()=>({name:'OfflineTextureStub',loadTexture:()=>Promise.resolve(new THREE.Texture())}));loader.register(parser=>new VRMLoaderPlugin(parser));return loader.parseAsync(bytes,'');},
  },onInstalled:({entry,actor,rig})=>{
    const shoes=rig.meshes.filter(mesh=>(Array.isArray(mesh.material)?mesh.material:[mesh.material]).some(material=>/shoe|boot|footwear|sneaker/i.test(material?.name??'')));
    assert.ok(shoes.length,`${entry.id} must contain authored footwear`);
    installed.set(entry.id,{actor,rig,start:actor.position.clone(),vertices:shoes.map(mesh=>[mesh,[...new Set(mesh.geometry.index?.array??Array.from({length:mesh.geometry.attributes.position.count},(_,i)=>i))]])});
  }});
  const loaded=await manager.load();assert.equal(loaded.loaded,9,JSON.stringify(loaded.residents.filter(item=>item.state!=='ready')));
  for(const entry of RESIDENT_AVATARS){const item=installed.get(entry.id);assert.ok(Math.abs(item.rig.metrics.height-entry.height)<1e-5,`${entry.id} height`);assert.deepEqual(item.actor.scale.toArray(),[1,1,1]);}
  let samples=0;
  for(let frame=0;frame<240;frame++){
    updateTownLife(world,1/60,frame/60);
    if(frame===0)for(const npc of npcs)if(npc.id.startsWith('walker'))npc.group.userData.townLife.pause=0;
    manager.update(1/60,frame/60);scene.updateMatrixWorld(true);
    if(frame%12===0)for(const[id,item]of installed){
      let min=Infinity;
      for(const[mesh,indices]of item.vertices){mesh.skeleton?.update();for(const index of indices){mesh.getVertexPosition(index,point).applyMatrix4(mesh.matrixWorld);assert.ok(Number.isFinite(point.x+point.y+point.z));min=Math.min(min,point.y-heightAt(point.x,point.z));}}
      assert.ok(min>=-.01&&min<.025,`${id} frame ${frame} floor clearance ${min}`);samples++;
    }
  }
  assert.equal(samples,180);
  for(const[id,item]of installed)if(id.startsWith('walker'))assert.ok(item.actor.position.distanceTo(item.start)>1.5,`${id} actually walked`);
  assert.ok(manager.status().residents.every(item=>item.optimization.after.estimatedDrawCalls<=24),'each resident is bounded to 24 material draws');
  manager.dispose();assert.equal(manager.status().textureLeases,0);assert.equal(manager.status().decodedImages,0);
});
