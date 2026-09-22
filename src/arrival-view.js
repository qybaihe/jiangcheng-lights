import * as THREE from 'three';
import {START} from './story.js';
import {EXPLORATION,updateThirdPerson,cameraBoomDistance} from './exploration.js';

const views=new WeakMap();
const DURATION=3.8;
const MOVEMENT_KEYS=['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright',' '];
export const ARRIVAL_LANDMARKS=Object.freeze([
  Object.freeze({id:'jianghanguan',name:'江汉关',point:Object.freeze([-30,16.22,-36.8])}),
  Object.freeze({id:'yangtze-bridge',name:'武汉长江大桥',point:Object.freeze([39,10.2,-58])}),
  Object.freeze({id:'river',name:'长江江面',point:Object.freeze([1,0,-43])}),
]);
const clamp=THREE.MathUtils.clamp;
const ease=t=>t*t*t*(t*(t*6-15)+10);
const hidden=()=>typeof document!=='undefined'&&document.hidden;
const rendered=(world,point,out=new THREE.Vector3())=>world.curvedWorld?.point?.(point,out)??out.copy(point);
const logical=(world,point,out=new THREE.Vector3())=>world.curvedWorld?.inverse?.(point,out)??out.copy(point);
const hasMovement=world=>MOVEMENT_KEYS.some(key=>world.keys?.[key]);
const barriers=world=>[...(world.colliders??[]),...(world.cameraOccluders??[])].filter(c=>c.solid!==false);
function cubic(points,t,out=new THREE.Vector3()) {
  const u=1-t;return out.copy(points[0]).multiplyScalar(u*u*u).addScaledVector(points[1],3*u*u*t).addScaledVector(points[2],3*u*t*t).addScaledVector(points[3],t*t*t);
}
function clearRoute(world,points) {
  const obstacles=barriers(world);let previous=logical(world,points[0]);
  for(let i=1;i<=128;i++){
    const next=logical(world,cubic(points,i/128)),distance=previous.distanceTo(next);
    if(cameraBoomDistance(previous,next,obstacles,.32)<distance-.0001)return false;
    previous=next;
  }
  return true;
}
function sceneChecks(world,camera) {
  return ARRIVAL_LANDMARKS.map(landmark=>{
    const p=rendered(world,new THREE.Vector3(...landmark.point)).project(camera);
    return {id:landmark.id,name:landmark.name,ndc:p.toArray(),inFrustum:p.z>=-1&&p.z<=1&&Math.abs(p.x)<=.93&&Math.abs(p.y)<=.90};
  });
}
function finish(world,reason='complete') {
  const view=views.get(world);if(!view?.active)return false;
  view.active=false;view.reason=reason;view.phase=reason==='complete'||reason==='reduced'?'complete':'cancelled';
  if(view.phase==='complete')view.elapsed=view.duration;
  world.controls.enabled=view.controlsEnabled;
  if(world.cameraMode==='street'){
    world.camera.fov=view.finalFov;world.camera.near=view.finalNear;world.camera.updateProjectionMatrix();
    // Re-evaluate the ordinary safe boom at the current player, never restore a
    // position snapshot or move the player back after an interrupting input.
    updateThirdPerson(world,0,true);world.thirdCameraReady=true;
  }else if(world.cameraMode==='first')world.syncFirstPersonCamera?.();
  return true;
}
function apply(world,view) {
  const p=clamp(view.elapsed/view.duration,0,1),t=ease(p);
  cubic(view.path,t,world.camera.position);
  const target=view.startTarget.clone().lerp(view.endTarget,ease(clamp((p-.08)/.70,0,1)));
  world.controls.target.copy(target);world.camera.fov=THREE.MathUtils.lerp(view.startFov,view.finalFov,t);
  world.camera.updateProjectionMatrix();world.camera.lookAt(target);world.camera.updateMatrixWorld(true);
  world.playerCameraDistance=world.camera.position.distanceTo(world.player.position);
  view.phase=p<.28?'establishing':p<.82?'descending':'handing-over';
}

/** Camera-only, optional 3.8 s establishing shot. No story/save/player writes. */
export function beginArrivalView(world,{duration=DURATION}={}) {
  if(views.get(world)?.active||!world.player||!world.camera||!world.controls||!world.active||world.blocked||world.suspended||world.conversation||world.cameraReturn||
    world.cameraMode!=='street'||(world.propInteractions?.mode??'walk')!=='walk'||world.path?.length||world.walking||Math.abs(world.moveSpeed??0)>.01||hasMovement(world)||world.playerMotion?.grounded===false||
    Math.hypot(world.player.position.x-START.x,world.player.position.z-START.z)>1)return false;
  updateThirdPerson(world,0,true);
  const endpoint=world.camera.position.clone(),endTarget=world.controls.target.clone();
  const view={active:true,phase:'establishing',reason:null,elapsed:0,duration:Number.isFinite(duration)?clamp(duration,3.5,4):DURATION,
    anchor:world.player.position.clone(),finalFov:world.camera.fov||EXPLORATION.fov,finalNear:world.camera.near,controlsEnabled:world.controls.enabled,
    endTarget,startTarget:rendered(world,new THREE.Vector3(3,5,-38)),startFov:52,path:null,landmarks:[]};
  // Look across the *existing* modeled river, Customs House and bridge. The
  // route stays south of the roofs, then descends along the safe player boom.
  for(const lift of[0,10,20]){
    const start=new THREE.Vector3(17,34+lift,39),path=[start,new THREE.Vector3(14,29+lift,36),endpoint.clone().add(new THREE.Vector3(1.8,9+lift*.4,3)),endpoint];
    if(clearRoute(world,path)){view.path=path;break;}
  }
  if(!view.path)return false;
  const probe=new THREE.PerspectiveCamera(view.startFov,world.camera.aspect,world.camera.near,world.camera.far);
  probe.position.copy(view.path[0]);probe.lookAt(view.startTarget);probe.updateMatrixWorld(true);view.landmarks=sceneChecks(world,probe);
  views.set(world,view);
  if(world.reduced){finish(world,'reduced');return true;}
  world.controls.enabled=false;apply(world,view);return true;
}
export function cancelArrivalView(world,reason='skip'){return finish(world,String(reason));}
export function isArrivalViewActive(world){return Boolean(views.get(world)?.active);}
export function updateArrivalView(world,dt=0) {
  const view=views.get(world);if(!view?.active)return false;
  if(world.reduced){finish(world,'reduced');return false;}
  if(world.conversation||world.blocked||(world.propInteractions?.mode??'walk')!=='walk'||world.cameraMode!=='street'||!world.active){finish(world,'interrupted');return false;}
  if(hasMovement(world)||world.path?.length||Math.hypot(world.player.position.x-view.anchor.x,world.player.position.z-view.anchor.z)>.04||world.playerMotion?.grounded===false){finish(world,'movement');return false;}
  if(world.suspended||hidden())return true;
  view.elapsed=Math.min(view.duration,view.elapsed+clamp(Number(dt)||0,0,.1));
  if(view.elapsed>=view.duration-1e-8){finish(world);return false;}
  apply(world,view);return true;
}
export function getArrivalView(world) {
  const view=views.get(world);
  if(!view)return {active:false,phase:'idle',progress:0,elapsed:0,duration:DURATION,reason:null};
  return {active:view.active,phase:view.active&&(world.suspended||hidden())?'paused':view.phase,progress:clamp(view.elapsed/view.duration,0,1),elapsed:view.elapsed,duration:view.duration,reason:view.reason,
    startCamera:view.path?.[0].toArray(),finalCamera:view.path?.[3].toArray(),landmarks:view.landmarks.map(item=>({...item,ndc:item.ndc.slice()}))};
}
