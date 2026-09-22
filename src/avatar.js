import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {VRMLoaderPlugin,VRMUtils} from '@pixiv/three-vrm';
import {installAvatarRig} from './avatar-retarget.js';
import {addAvatarAccessories} from './avatar-accessories.js';
import {optimizeAvatarMeshes} from './avatar-optimization.js';
import {getAvatarOption} from './avatar-catalog.js';
import {updatePlayerOcclusion} from './exploration.js';

const requests=new WeakMap();
const FADE_FIELDS=['playerFadeBindings','playerFadeStates','playerFadeMaterial'];
export const HERO_ASSET_TIMEOUT_MS=60000;

function statusFor(avatar,state='ready',extra={}) {
  return {id:avatar?.id??null,state,source:avatar?.source??'procedural',url:avatar?.url??null,
    ...(avatar?.rig?.metrics??{}),...(avatar?.optimization?{optimization:avatar.optimization}:{}),...extra};
}

// Loaded VRMs own their textures. Dispose each resource once, including the
// decoded ImageBitmaps which Three's texture.dispose() does not close.
function releaseScene(scene) {
  if(!scene)return;
  const geometries=new Set(),skeletons=new Set(),materials=new Set(),textures=new Set(),images=new Set();
  scene.traverse(node=>{
    if(node.geometry)geometries.add(node.geometry);
    if(node.skeleton)skeletons.add(node.skeleton);
    for(const material of(Array.isArray(node.material)?node.material:[node.material]))if(material)materials.add(material);
  });
  const collect=value=>{if(value?.isTexture)textures.add(value);else if(Array.isArray(value))value.forEach(collect);};
  for(const material of materials){Object.values(material).forEach(collect);for(const uniform of Object.values(material.uniforms??{}))collect(uniform.value);}
  for(const texture of textures){const image=texture.source?.data??texture.image;for(const item of(Array.isArray(image)?image:[image]))if(item?.close)images.add(item);}
  for(const resource of [...geometries,...skeletons,...materials,...textures])try{resource.dispose();}catch{/* Continue releasing the other independent resources. */}
  for(const image of images)try{image.close();}catch{/* An already closed bitmap needs no further work. */}
  scene.removeFromParent();
}

function releaseAvatar(avatar) {
  if(!avatar)return;
  const scene=avatar.vrm?.scene??avatar.scene;
  try{avatar.rig?.dispose();}catch{/* Disposal must not interrupt a committed replacement. */}
  try{releaseScene(scene);}catch{/* A cleanup failure must not undo a committed replacement. */}
  avatar.vrm=null;avatar.rig=null;avatar.accessories=null;avatar.scene=null;
}

/**
 * Load or replace the hero while preserving the gameplay Group. Downloads and
 * parsing leave the current avatar live; installation/rollback is synchronous.
 * A failed request returns the retained hero (or null), with an error status.
 */
export async function loadHeroAvatar(world,id='female') {
  const option=getAvatarOption(id),previousRequest=requests.get(world);
  previousRequest?.abort?.abort();
  const request={sequence:(previousRequest?.sequence??0)+1,abort:new AbortController()};
  requests.set(world,request);
  const current=()=>requests.get(world)===request;
  if(world.heroAvatar?.id===option.id&&world.heroAvatar.rig){
    world.avatarStatus=statusFor(world.heroAvatar,'ready',{requestedId:option.id});request.abort=null;return world.heroAvatar;
  }
  world.avatarStatus={id:option.id,requestedId:option.id,activeId:world.heroAvatar?.id??null,state:'loading',source:option.source,url:option.url};
  let candidate=null,previous=null,transaction=null;
  try {
    const loader=new GLTFLoader();loader.register(parser=>new VRMLoaderPlugin(parser));
    const timeout=setTimeout(()=>request.abort?.abort(),HERO_ASSET_TIMEOUT_MS);
    let bytes;
    try{
      const response=await fetch(option.url,{signal:request.abort.signal,priority:'high'});
      if(!response.ok)throw new Error(`Character download returned ${response.status}`);
      bytes=await response.arrayBuffer();
    }finally{clearTimeout(timeout);}
    if(!current())return world.heroAvatar??null;
    const gltf=await loader.parseAsync(bytes,option.url.slice(0,option.url.lastIndexOf('/')+1));
    const vrm=gltf.userData.vrm;
    candidate={id:option.id,source:option.source,url:option.url,height:option.height,vrm,scene:gltf.scene,rig:null,accessories:null};
    if(!current()){releaseAvatar(candidate);return world.heroAvatar??null;}
    if(!vrm?.humanoid)throw new Error('Character has no humanoid skeleton');
    VRMUtils.rotateVRM0(vrm);
    const optimization=optimizeAvatarMeshes(vrm);
    candidate.optimization={before:optimization.before,after:optimization.after,savedDrawCalls:optimization.savedDrawCalls};
    vrm.scene.traverse(mesh=>{
      if(!mesh.isMesh)return;
      mesh.castShadow=false;mesh.receiveShadow=true;mesh.frustumCulled=false;
      for(const material of(Array.isArray(mesh.material)?mesh.material:[mesh.material])){
        material.userData.illustration='preserve';
        if(material.isMToonMaterial&&material.name.includes('CLOTH')){
          material.shadingShiftFactor=-.12;material.shadingToonyFactor=.65;
          material.shadeColorFactor.setRGB(.78,.85,.80);material.giEqualizationFactor=.84;
        }
        for(const texture of[material.map,material.shadeMultiplyTexture,material.normalMap])if(texture)texture.anisotropy=Math.min(4,world.renderer.capabilities.getMaxAnisotropy());
      }
    });

    // No await below this point: another request/frame cannot observe the
    // procedural shell between detaching the old rig and committing the new.
    previous=world.heroAvatar??null;
    transaction={eyeHeight:world.eyeHeight,visible:world.player.visible,opacity:world.playerOpacity,
      fade:FADE_FIELDS.map(key=>({key,present:Object.hasOwn(world,key),value:world[key]}))};
    previous?.rig.detach();
    candidate.rig=installAvatarRig(world.player,vrm,{targetHeight:option.height});
    candidate.accessories=addAvatarAccessories(vrm,{height:option.height});
    world.player.userData.characterMeshes=[...candidate.rig.meshes,...candidate.accessories.meshes];
    world.player.userData.ownedMaterials=true;
    candidate.update=function(dt,time){
      this.rig?.update(dt,time,{reduced:world.reduced,talking:world.speakingId==='player'&&Boolean(world.conversation),handPose:world.propInteractions?.mode??'relaxed'});
      this.accessories?.update(dt,time,{moving:world.walking&&!world.blocked,reduced:world.reduced});
    };
    candidate.update(0,world.elapsed);
    world.curvedWorld?.attach(vrm.scene);
    // Keep the prior maps intact until commit so a failed material setup can
    // restore the exact faded old avatar without retaining new mesh references.
    for(const key of FADE_FIELDS)delete world[key];
    updatePlayerOcclusion(world,0);
    world.eyeHeight=world.player.userData.eyeHeight;
    world.heroAvatar=candidate;world.firstFrameRendered=false;
    world.avatarStatus=statusFor(candidate,'ready',{requestedId:option.id});
    for(const {value} of transaction.fade)value?.clear?.();
    releaseAvatar(previous);
    transaction=null;
    return candidate;
  }catch(error){
    releaseAvatar(candidate);
    if(transaction){
      for(const {key,value} of transaction.fade)if(world[key]!==value)world[key]?.clear?.();
      previous?.rig.restore();
      world.heroAvatar=previous;world.eyeHeight=transaction.eyeHeight;
      world.player.visible=transaction.visible;world.playerOpacity=transaction.opacity;
      for(const {key,present,value} of transaction.fade){if(present)world[key]=value;else delete world[key];}
    }
    if(!current())return world.heroAvatar??null;
    const retained=world.heroAvatar??null;
    world.avatarStatus=statusFor(retained,retained?'error':'fallback',{requestedId:option.id,message:String(error.message??error)});
    console.error('Character asset could not be loaded:',error);
    return retained;
  }finally{
    if(current())request.abort=null;
  }
}
