import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {VRMLoaderPlugin,VRMUtils} from '@pixiv/three-vrm';
import {installAvatarRig} from './avatar-retarget.js';
import {optimizeAvatarMeshes} from './avatar-optimization.js';
import {RESIDENT_AVATARS,getResidentAvatarOption} from './resident-avatar-catalog.js';

const managers=new WeakMap();
const MAJOR_IDS=new Set(['granny','chef','dock','community']);
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const materialList=mesh=>Array.isArray(mesh.material)?mesh.material:[mesh.material];
const textureList=value=>value?.isTexture?[value]:Array.isArray(value)?value.flatMap(textureList):[];
const imagesOf=texture=>new Set((Array.isArray(texture.source?.data??texture.image)?texture.source?.data??texture.image:[texture.source?.data??texture.image]).filter(image=>typeof image?.close==='function'));
const quietDispose=value=>{try{value?.dispose?.();}catch{/* Keep freeing independent resources. */}};
const closeImage=value=>{try{value.close();}catch{/* A browser can have already released the bitmap. */}};

// Release the welcome screen before non-critical downloads, and give rendering
// and input an idle slice between VRM parses. Aborting settles the wait too.
function backgroundYield(signal,initial=false) {
  return new Promise(resolve=>{
    let timer,idle,finished=false;
    const done=()=>{
      if(finished)return;finished=true;clearTimeout(timer);
      if(idle!==undefined)globalThis.cancelIdleCallback?.(idle);
      signal.removeEventListener('abort',done);resolve();
    };
    signal.addEventListener('abort',done,{once:true});
    if(signal.aborted){done();return;}
    timer=setTimeout(()=>{
      if(typeof globalThis.requestIdleCallback==='function')idle=globalThis.requestIdleCallback(done,{timeout:750});
      else done();
    },initial?600:40);
  });
}

function residentRetryWait(delay,signal) {
  return new Promise((resolve,reject)=>{
    let timer;
    const cleanup=()=>{clearTimeout(timer);signal.removeEventListener('abort',cancel);};
    const cancel=()=>{cleanup();reject(signal.reason??new DOMException('Resident loading cancelled','AbortError'));};
    signal.addEventListener('abort',cancel,{once:true});
    if(signal.aborted){cancel();return;}
    timer=setTimeout(()=>{cleanup();resolve();},delay);
  });
}
const retryableResidentFailure=(error,timedOut)=>{
  if(timedOut)return true;
  if(error?.name==='AbortError')return false;
  if(Number.isInteger(error?.residentHTTPStatus))return error.residentHTTPStatus===408||error.residentHTTPStatus===429||error.residentHTTPStatus>=500&&error.residentHTTPStatus<=599;
  return error instanceof TypeError||error?.name==='NetworkError'||['ECONNRESET','ECONNREFUSED','ETIMEDOUT','ENOTFOUND','EAI_AGAIN'].includes(error?.code);
};

function gatherResources(scene,into={geometries:new Set(),skeletons:new Set(),materials:new Set(),textures:new Set()}) {
  scene?.traverse(node=>{
    if(node.geometry)into.geometries.add(node.geometry);
    if(node.skeleton)into.skeletons.add(node.skeleton);
    for(const material of materialList(node))if(material)into.materials.add(material);
  });
  for(const material of into.materials){
    for(const value of Object.values(material))for(const texture of textureList(value))into.textures.add(texture);
    for(const uniform of Object.values(material.uniforms??{}))for(const texture of textureList(uniform.value))into.textures.add(texture);
  }
  return into;
}

// Only explicitly associated glTF textures can be shared. Color space, UV
// transform and sampler state are part of the key; materials/bones never are.
function textureKey(texture,url,parser) {
  const index=parser?.associations?.get(texture)?.textures;
  if(!Number.isInteger(index))return null;
  return JSON.stringify([url,index,texture.colorSpace,texture.channel,texture.flipY,texture.wrapS,texture.wrapT,
    texture.magFilter,texture.minFilter,texture.generateMipmaps,texture.anisotropy,texture.premultiplyAlpha,
    texture.offset?.toArray(),texture.repeat?.toArray(),texture.center?.toArray(),texture.rotation]);
}

function createResourcePool() {
  const textures=new Map(),images=new Map();
  const retainImages=list=>{for(const image of list)images.set(image,(images.get(image)??0)+1);};
  const releaseImages=list=>{for(const image of list){const refs=(images.get(image)??1)-1;if(refs>0)images.set(image,refs);else{images.delete(image);closeImage(image);}}};
  return {
    acquire(resources,url,parser){
      const leases=new Set(),owned=new Set(),replacements=new Map(),duplicates=new Set();
      for(const texture of resources.textures){
        const key=textureKey(texture,url,parser);
        if(key===null){owned.add(texture);continue;}
        let pooled=textures.get(key);
        if(!pooled){const imageSet=imagesOf(texture);retainImages(imageSet);pooled={texture,refs:0,images:imageSet};textures.set(key,pooled);}
        if(!leases.has(key)){pooled.refs++;leases.add(key);}
        if(texture!==pooled.texture){replacements.set(texture,pooled.texture);duplicates.add(texture);}
      }
      const ownedImages=new Set([...owned].flatMap(texture=>[...imagesOf(texture)]));retainImages(ownedImages);
      const replace=value=>value?.isTexture?(replacements.get(value)??value):Array.isArray(value)?value.map(replace):value;
      for(const material of resources.materials){
        for(const key of Object.keys(material))if(textureList(material[key]).length)material[key]=replace(material[key]);
        for(const uniform of Object.values(material.uniforms??{}))uniform.value=replace(uniform.value);
      }
      const duplicateImages=new Set([...duplicates].flatMap(texture=>[...imagesOf(texture)]));
      for(const texture of duplicates)quietDispose(texture);
      for(const image of duplicateImages)if(!images.has(image))closeImage(image);
      let released=false;
      return {release(){
        if(released)return;released=true;
        for(const item of [...resources.geometries,...resources.skeletons,...resources.materials,...owned])quietDispose(item);
        releaseImages(ownedImages);
        for(const key of leases){const pooled=textures.get(key);if(pooled&&--pooled.refs===0){textures.delete(key);quietDispose(pooled.texture);releaseImages(pooled.images);}}
      }};
    },
    stats(){return {sharedTextures:textures.size,textureLeases:[...textures.values()].reduce((sum,item)=>sum+item.refs,0),decodedImages:images.size};},
  };
}

function prepareMaterials(vrm,world) {
  const anisotropy=Math.min(4,world.renderer?.capabilities?.getMaxAnisotropy?.()??1);
  vrm.scene.traverse(mesh=>{
    if(!mesh.isMesh)return;
    mesh.castShadow=false;mesh.receiveShadow=true;mesh.frustumCulled=false;
    for(const material of materialList(mesh))if(material){
      material.userData.illustration='preserve';
      if(material.isMToonMaterial){
        material.shadingToonyFactor=.67;material.giEqualizationFactor=.86;
        // The authored texture remains the color source; no whole-face tint.
        material.outlineWidthFactor=Math.min(material.outlineWidthFactor??0,.0013);
      }
      for(const value of Object.values(material))for(const texture of textureList(value))texture.anisotropy=anisotropy;
    }
  });
}

async function parseResident(bytes,url) {
  const loader=new GLTFLoader();loader.register(parser=>new VRMLoaderPlugin(parser));
  return loader.parseAsync(bytes,url.slice(0,url.lastIndexOf('/')+1));
}
const restoreFields=(actor,fields)=>{for(const{key,present,value}of fields){if(present)actor.userData[key]=value;else delete actor.userData[key];}};
const actorExists=(world,record)=>world.npcs?.some(npc=>npc.id===record.id&&npc.group===record.actor);
const hierarchyVisible=actor=>{for(let node=actor;node;node=node.parent)if(!node.visible)return false;return true;};

/**
 * One manager owns the imported assets, not the original procedural fallback.
 * Every resident has an independently parsed humanoid/skeleton/expression state.
 * URL bytes share one request promise (including one transient-error retry);
 * matching immutable textures have counted leases.
 * Hooks own their attachment resources: return {meshes,update?,dispose,metrics?}.
 * This factory accepts services so lifecycle tests can use in-memory assets.
 */
export function createResidentAvatarManager(world,{catalog=RESIDENT_AVATARS,concurrency=2,onInstalled,onDisposed,services={},startAfter,progressive=false}={}) {
  const limit=progressive?1:clamp(Math.floor(Number(concurrency)||2),1,3),abort=new AbortController(),pool=createResourcePool(),bytesCache=new Map();
  const parse=services.parse??parseResident,fetchAsset=services.fetch??((...args)=>fetch(...args));
  const install=services.install??installAvatarRig,optimize=services.optimize??optimizeAvatarMeshes,rotate=services.rotate??VRMUtils.rotateVRM0;
  const yieldWork=services.yield??(initial=>backgroundYield(abort.signal,initial));
  const retryWait=services.retryWait??residentRetryWait;
  const records=(world.npcs??[]).map(npc=>({id:npc.id,npc,actor:npc.group,entry:getResidentAvatarOption(npc.id,catalog),state:'queued',
    candidate:null,updates:0,lod:'pending',springActive:false,accumulator:0,wasOnScreen:false,wasConversational:false,lastVisible:false}));
  for(const record of records)if(!record.entry)record.state='fallback';
  const stats={fetches:0,retries:0,parses:0,activeJobs:0,peakConcurrent:0,totalUpdates:0,skippedUpdates:0};
  const temp=new THREE.Vector3(),sphere=new THREE.Sphere(),matrix=new THREE.Matrix4(),frustum=new THREE.Frustum();
  let disposed=false,ready=null;
  const current=record=>!disposed&&actorExists(world,record);
  const fetchBytes=url=>{
    if(!bytesCache.has(url)){
      const promise=(async()=>{
        for(let attempt=0;attempt<2;attempt++){
          if(abort.signal.aborted)throw abort.signal.reason;
          const localAbort=new AbortController(),onAbort=()=>localAbort.abort(abort.signal.reason);
          let timedOut=false,failure;
          abort.signal.addEventListener('abort',onAbort,{once:true});
          // Cold CDN edges may spend the first budget filling a multi-MB VRM.
          // This timeout covers both response headers and body download.
          const timeout=setTimeout(()=>{timedOut=true;localAbort.abort();},60000);
          stats.fetches++;if(attempt)stats.retries++;
          try{
            const response=await fetchAsset(url,{signal:localAbort.signal,...(progressive||attempt?{priority:'low'}:{})});
            if(!response.ok){const error=new Error(`Resident asset returned HTTP ${response.status}`);error.residentHTTPStatus=response.status;throw error;}
            return await response.arrayBuffer();
          }catch(error){failure=error;}
          finally{clearTimeout(timeout);abort.signal.removeEventListener('abort',onAbort);}
          // Cancellation is terminal, including a disposal that races a timeout.
          // Only the byte-fetch phase retries: a VRM is parsed/leased just once.
          if(abort.signal.aborted||attempt===1||!retryableResidentFailure(failure,timedOut))throw failure;
          await retryWait(600*2**attempt,abort.signal);
        }
      })();
      bytesCache.set(url,promise);
    }
    return bytesCache.get(url);
  };
  function releaseCandidate(record,candidate) {
    if(!candidate||candidate.released)return;candidate.released=true;
    quietDispose(candidate.attachments);
    quietDispose(candidate.rig);
    if(candidate.baseline){record.actor.scale.copy(candidate.baseline.scale);restoreFields(record.actor,candidate.baseline.fields);record.actor.updateMatrixWorld(true);}
    if(candidate.resources){candidate.resources.release();candidate.resources=null;}
    else if(candidate.scene){const resources=gatherResources(candidate.scene,candidate.rawResources);pool.acquire(resources,record.entry.url,null).release();}
    candidate.scene?.removeFromParent();
    candidate.vrm=null;candidate.rig=null;candidate.attachments=null;candidate.scene=null;
  }
  async function loadOne(record) {
    if(!current(record)){if(!disposed)record.state='detached';return;}
    record.state='loading';stats.activeJobs++;stats.peakConcurrent=Math.max(stats.peakConcurrent,stats.activeJobs);
    let candidate=null;
    try {
      const entry=record.entry;
      if(!/^\/(?!\/).+\.vrm(?:\?[^#]*)?$/i.test(entry.url)||!Number.isFinite(entry.height)||entry.height<1.2||entry.height>2.2)throw new Error('Invalid resident catalog entry');
      const bytes=await fetchBytes(entry.url);
      if(progressive)await yieldWork(false);
      if(!current(record)){if(!disposed)record.state='detached';return;}
      stats.parses++;const gltf=await parse(bytes,entry.url);
      const vrm=gltf?.userData?.vrm;
      candidate={vrm,scene:vrm?.scene??gltf?.scene,rig:null,resources:null,attachments:null,baseline:null};
      if(!current(record)){releaseCandidate(record,candidate);if(!disposed)record.state='detached';return;}
      if(!vrm?.humanoid||!vrm.scene)throw new Error('Resident asset has no VRM humanoid');
      // Capture pre-batch geometry too: batching can detach the original meshes.
      const resources=gatherResources(vrm.scene);candidate.rawResources=resources;
      rotate(vrm);candidate.optimization=optimize(vrm);gatherResources(vrm.scene,resources);prepareMaterials(vrm,world);
      candidate.resources=pool.acquire(resources,entry.url,gltf.parser);
      if(record.actor.userData.avatarRig)throw new Error('Resident already has an installed avatar');
      candidate.baseline={scale:record.actor.scale.clone(),fields:['ownedMaterials','restBodyTilt','residentAvatar'].map(key=>({key,present:Object.hasOwn(record.actor.userData,key),value:record.actor.userData[key]}))};
      // Old granny/walkers were scaled gameplay shells. Height is calibrated in
      // metres by the new rig exactly once; keeping .85 here would shorten legs.
      record.actor.scale.set(1,1,1);record.actor.updateMatrixWorld(true);
      candidate.rig=install(record.actor,vrm,{targetHeight:entry.height});
      candidate.rig.visualRoot.name=`${entry.name??record.id} · VRM resident`;
      record.actor.userData.ownedMaterials=true;
      record.actor.userData.restBodyTilt=Number(entry.posture)||0;
      record.actor.userData.residentAvatar={id:record.id,variant:entry.variant??record.id,source:entry.source,url:entry.url};
      candidate.attachments=onInstalled?.({actor:record.actor,npc:record.npc,entry,vrm,rig:candidate.rig})??null;
      if(candidate.attachments?.then)throw new Error('Resident attachment hook must be synchronous');
      record.actor.userData.characterMeshes=[...candidate.rig.meshes,...(candidate.attachments?.meshes??[])];
      world.curvedWorld?.attach(candidate.rig.visualRoot);
      candidate.rig.update(0,world.elapsed??0,{reduced:true,handPose:entry.handPose??'relaxed'});
      record.candidate=candidate;record.state='ready';record.lod='initial';record.lastVisible=hierarchyVisible(record.actor);
      record.message=null;world.firstFrameRendered=false;
    }catch(error){
      releaseCandidate(record,candidate);
      if(current(record)){record.state='fallback';record.message=String(error?.message??error);}
    }finally{stats.activeJobs--;}
  }
  async function runStage(stage) {
    const pending=[...stage];
    await Promise.all(Array.from({length:Math.min(limit,stage.length)},async()=>{
      while(!disposed&&pending.length){
        if(progressive){
          // Recheck the live position at each job: a returning save or a player
          // driving towards someone should not wait behind distant residents.
          const player=world.player?.position??{x:0,z:0};
          const score=record=>world.conversation?.npc===record.actor?-1:Math.hypot(record.actor.position.x-player.x,record.actor.position.z-player.z);
          pending.sort((a,b)=>score(a)-score(b));
        }
        await loadOne(pending.shift());
        if(progressive)await yieldWork(false);else await new Promise(resolve=>setTimeout(resolve,0));
      }
    }));
  }
  function snapshot() {
    const residents=records.map(record=>({id:record.id,name:record.entry?.name??record.id,state:record.state,source:record.entry?.source??'procedural',
      url:record.entry?.url??null,variant:record.entry?.variant??null,base:record.entry?.base??null,description:record.entry?.description??null,targetHeight:record.entry?.height??null,
      ...(record.message?{message:record.message}:{}),metrics:record.candidate?.rig?structuredClone(record.candidate.rig.metrics):null,
      optimization:record.candidate?.optimization?{before:{...record.candidate.optimization.before},after:{...record.candidate.optimization.after},savedDrawCalls:record.candidate.optimization.savedDrawCalls}:null,
      attachments:record.candidate?.attachments?.metrics?{...record.candidate.attachments.metrics}:null,
      updates:record.updates,lod:record.lod,springActive:record.springActive,springJoints:record.candidate?.vrm?.springBoneManager?.joints?.size??0,visible:hierarchyVisible(record.actor),scale:record.actor.scale.toArray()}));
    const loaded=residents.filter(item=>item.state==='ready').length,failed=residents.filter(item=>item.state==='fallback'||item.state==='detached').length;
    return {state:disposed?'disposed':residents.some(item=>item.state==='queued'||item.state==='loading')?'loading':failed?'partial':'ready',
      loaded,total:records.length,fallback:failed,concurrency:limit,progressive,...stats,...pool.stats(),residents};
  }
  const controller={
    get disposed(){return disposed;},
    load(){
      if(!ready)ready=(async()=>{
        // A missing hero should not remove the rest of the town. Its loader
        // retains the procedural fallback, and residents still finish loading.
        if(startAfter)await Promise.resolve(startAfter).catch(()=>{});
        if(progressive)await yieldWork(true);
        if(disposed)return snapshot();
        const eligible=records.filter(record=>record.entry);
        // Complete the four principal characters before starting walkers.
        await runStage(eligible.filter(record=>MAJOR_IDS.has(record.id)));
        await runStage(eligible.filter(record=>!MAJOR_IDS.has(record.id)));
        bytesCache.clear();return snapshot();
      })();
      return ready;
    },
    update(dt=0,time=0){
      if(disposed||world.suspended||world.active===false)return;
      const delta=clamp(Number(dt)||0,0,.1),player=world.player?.position??{x:0,y:0,z:0};
      let useFrustum=false;
      if(world.camera?.isCamera){world.camera.updateMatrixWorld();matrix.multiplyMatrices(world.camera.projectionMatrix,world.camera.matrixWorldInverse);frustum.setFromProjectionMatrix(matrix);useFrustum=true;}
      const active=[];
      for(const record of records){
        if(record.state!=='ready'||!record.candidate)continue;
        if(!actorExists(world,record)){releaseCandidate(record,record.candidate);record.candidate=null;record.state='detached';record.springActive=false;continue;}
        const visible=hierarchyVisible(record.actor);record.lastVisible=visible;
        if(!visible){record.lod='hidden';record.springActive=false;record.accumulator=0;record.wasOnScreen=false;record.wasConversational=false;stats.skippedUpdates++;continue;}
        const point=record.actor.position,height=record.actor.userData.height??record.entry.height;
        const distance=Math.hypot(point.x-player.x,point.z-player.z);
        const talking=Boolean(world.conversation&&world.speakingId===record.id);
        const conversational=world.conversation?.npc===record.actor;
        let onScreen=true;
        if(useFrustum){temp.set(point.x,point.y+height*.5,point.z);world.curvedWorld?.point?.(temp,temp);sphere.set(temp,height*.7+.3);onScreen=frustum.intersectsSphere(sphere);}
        record.candidate.rig.visualRoot.visible=onScreen||conversational;
        const near=distance<14,medium=distance<28;
        const hz=world.reduced?6:conversational?30:!onScreen?3:near?30:medium?15:8;
        record.accumulator+=delta;
        active.push({record,distance,talking,conversational,onScreen,hz});
      }
      // Only two visible nearby heads simulate spring hair. Bone poses/root
      // motion keep updating independently; speaking expression is not disabled.
      const springIds=new Set(world.reduced?[]:active.filter(item=>item.onScreen&&item.distance<14&&(item.record.candidate.vrm.springBoneManager?.joints?.size??1)>0).sort((a,b)=>Number(b.conversational)-Number(a.conversational)||a.distance-b.distance).slice(0,2).map(item=>item.record.id));
      for(const{record,talking,conversational,onScreen,hz}of active){
        const candidate=record.candidate,springActive=springIds.has(record.id);
        const force=onScreen&&!record.wasOnScreen||conversational&&!record.wasConversational||springActive!==record.springActive;
        record.lod=world.reduced?'reduced':conversational?'conversation':!onScreen?'offscreen':`${hz}hz`;
        if(!force&&record.accumulator+1e-7<1/hz){stats.skippedUpdates++;continue;}
        const updateDelta=record.accumulator;record.accumulator=0;record.wasOnScreen=onScreen;record.wasConversational=conversational;
        const spring=candidate.vrm.springBoneManager,wasSpring=record.springActive;
        // three-vrm owns all state on this VRM; temporarily omit ONLY its spring
        // pass. Never mutate a shared skeleton or silence blink/speech for LOD.
        if(!springActive)candidate.vrm.springBoneManager=undefined;
        try{candidate.rig.update(updateDelta,time,{reduced:Boolean(world.reduced),talking,handPose:record.entry.handPose??'relaxed'});candidate.attachments?.update?.(updateDelta,time,{talking,reduced:Boolean(world.reduced),moving:(record.actor.userData.townLife?.speed??0)>.05});}
        finally{candidate.vrm.springBoneManager=spring;}
        if(springActive!==wasSpring)spring?.reset();
        record.springActive=springActive;record.updates++;stats.totalUpdates++;
      }
    },
    dispose(){
      if(disposed)return;disposed=true;abort.abort();bytesCache.clear();
      for(const record of records){
        if(record.candidate){const candidate=record.candidate;releaseCandidate(record,candidate);try{onDisposed?.({actor:record.actor,npc:record.npc,entry:record.entry});}catch{/* A notification never holds the resource cleanup hostage. */}}
        record.candidate=null;record.state='disposed';record.springActive=false;record.lod='disposed';
      }
    },
    status:snapshot,
  };
  return controller;
}

export function loadResidentAvatars(world,options={}) {
  let manager=managers.get(world);
  if(!manager||manager.disposed){manager=createResidentAvatarManager(world,options);managers.set(world,manager);}
  return manager.load();
}
export function updateResidentAvatars(world,dt,time){managers.get(world)?.update(dt,time);}
export function disposeResidentAvatars(world){managers.get(world)?.dispose();}
export function getResidentAvatarStatus(world){return managers.get(world)?.status()??{state:'idle',loaded:0,total:world.npcs?.length??0,residents:[]};}
