import {isInsidePlayableBounds} from './wuhan-district-layout.js';
import * as THREE from 'three';
import {updateBicycleRig} from './bicycle.js';
import {resetPlayerMotion} from './traversal.js';
import {angleDelta,updateThirdPerson} from './exploration.js';
import {NEWSPAPER_EDITIONS} from './newspaper-data.js';
import {CAR_IDS,normalizeCarProgress} from './car-progress.js';
import {buildDriveableCars,canDriveCarPose,findCarDismount,updateCarCollider,updateCarRig,carOverlapsCircle} from './driveable-cars.js';
import {ROWBOAT_ANCHOR,ROWBOAT_DOCK,ROWBOAT_SETTINGS,ROWBOAT_WATER_BOUNDS,NEIGHBORHOOD_RACE_ANCHOR,buildRowboat,buildRowboatLanding,stepRowboat,updateRowboatRig,createBoatLifeJacket,updateBoatLifeJacket} from './rowboat.js';

export const PROP_IDS=Object.freeze({bicycle:'prop-bicycle',newspaper:'prop-newspaper',ferry:'prop-ferry',boat:ROWBOAT_ANCHOR.id,...CAR_IDS});
export const PROP_ANCHORS=Object.freeze([
 {id:PROP_IDS.bicycle,name:'巷口旧单车',label:'借骑自行车',x:-20.05,z:20,kind:'prop',propType:'bicycle',icon:'bike'},
 {id:PROP_IDS.newspaper,name:'修理铺竹椅',label:'坐下读报',x:-15.1,z:18.6,kind:'prop',propType:'newspaper',icon:'newspaper'},
 {id:PROP_IDS.ferry,name:'晴川里小渡船',label:'坐船看江',x:27,z:-23.1,kind:'prop',propType:'ferry',icon:'ferry'},
]);
const SEAT={x:-15.4,z:17.1,yaw:.18},DOCK={x:27,z:-35},BIKE_SCALE=.74,TRIP_SECONDS=26;
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const finitePoint=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z);
const clamp=THREE.MathUtils.clamp;
const smooth=t=>t*t*(3-2*t);

// A complete swept bicycle footprint: not a faster point-sized walker.
export function canCyclePose(world,from,to,{ignore=null}={}){
 const distance=Math.hypot(to.x-from.x,to.z-from.z),turn=Math.abs(angleDelta(from.yaw,to.yaw));
 const count=Math.max(1,Math.ceil(distance/.10),Math.ceil(turn/.055));
 for(let i=0;i<=count;i++){
  const t=i/count,x=THREE.MathUtils.lerp(from.x,to.x,t),z=THREE.MathUtils.lerp(from.z,to.z,t),yaw=from.yaw+angleDelta(from.yaw,to.yaw)*t;
  const floor=world.heightAt(x,z),sin=Math.sin(yaw),cos=Math.cos(yaw);
  if(!Number.isFinite(floor))return false;
  for(const along of[-1.06,-.72,-.36,0,.36,.72,1.06])for(const across of[-.26,0,.26]){
   const xx=x+sin*along+cos*across,zz=z+cos*along-sin*across;
   if(!isInsidePlayableBounds(xx,zz,.35)||world.hazards?.some(h=>Math.hypot(xx-h.x,zz-h.z)<h.r+.12))return false;
   const sampleFloor=world.heightAt(xx,zz),oldX=from.x+Math.sin(from.yaw)*along+Math.cos(from.yaw)*across,oldZ=from.z+Math.cos(from.yaw)*along-Math.sin(from.yaw)*across;
   // Gradual slopes are rideable. A single paving/step rise over 8cm is not.
   if(Math.abs(sampleFloor-world.heightAt(oldX,oldZ))>.08+Math.hypot(xx-oldX,zz-oldZ)*.23)return false;
   if(world.colliders?.some(c=>c!==ignore&&xx>c.x-.13&&xx<c.X+.13&&zz>c.z-.13&&zz<c.Z+.13))return false;
   if(world.cameraOccluders?.some(c=>c.solid!==false&&(c.y??0)>.1&&floor+2>c.y&&floor<(c.height??11)&&xx>c.x-.1&&xx<c.X+.1&&zz>c.z-.1&&zz<c.Z+.1))return false;
   if(world.npcs?.some(({group})=>group.visible&&Math.hypot(xx-group.position.x,zz-group.position.z)<.59))return false;
  }
 }
 return true;
}

// Geometric two-bone IK keeps both imported male/female feet on the pedals.
export function solveLimb(upper,lower,end,targetInParent,bendInParent){
 const start=upper.position.clone(),delta=targetInParent.clone().sub(start),a=lower.position.length(),b=end.position.length();
 if(a<.001||b<.001)return;
 const d=clamp(delta.length(),Math.abs(a-b)+.001,a+b-.001),direction=delta.normalize();
 const reach=(a*a-b*b+d*d)/(2*d),lift=Math.sqrt(Math.max(0,a*a-reach*reach));
 const bend=bendInParent.clone().addScaledVector(direction,-bendInParent.dot(direction));
 if(bend.lengthSq()<.00001)bend.set(0,0,1).addScaledVector(direction,-direction.z);bend.normalize();
 const knee=start.clone().addScaledVector(direction,reach).addScaledVector(bend,lift);
 upper.quaternion.setFromUnitVectors(lower.position.clone().normalize(),knee.clone().sub(start).normalize());
 const inverse=upper.quaternion.clone().invert();
 lower.quaternion.setFromUnitVectors(end.position.clone().normalize(),targetInParent.clone().sub(knee).applyQuaternion(inverse).normalize());
 end.quaternion.copy(upper.quaternion).multiply(lower.quaternion).invert();
}

function drawPaper(canvas,edition){
 const e=NEWSPAPER_EDITIONS[edition],c=canvas.getContext('2d');c.fillStyle='#e9dfbc';c.fillRect(0,0,1024,720);c.fillStyle='#344d44';
 c.font='bold 75px "Songti SC",serif';c.textAlign='center';c.fillText(e.title,512,112);
 c.font='24px "Songti SC",serif';c.fillText(e.issueLabel+'  ·  武汉晴川里',512,157);
 c.fillRect(45,182,934,4);c.font='bold 43px "Songti SC",serif';c.fillText(e.headline,512,245,910);
 c.textAlign='left';c.font='25px "Songti SC",serif';
 const columns=[e.news[0].body[0],e.news[1].body[0]];
 columns.forEach((text,col)=>{const lines=Array.from(text.matchAll(/.{1,15}/gu),m=>m[0]);lines.slice(0,6).forEach((line,i)=>c.fillText(line,65+col*482,320+i*46));});
 c.fillRect(490,278,2,305);c.font='22px "Songti SC",serif';c.fillText(e.fictionNotice,65,670,920);
}
function makePaper(world){
 const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=720;drawPaper(canvas,'beforeRain');
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
 const material=new THREE.MeshStandardMaterial({map:texture,color:'#fff8dd',roughness:1,side:THREE.DoubleSide});
 const g=new THREE.Group();g.name='手里的晴川里街坊小报';g.userData.paperCanvas=canvas;g.userData.paperTexture=texture;
 for(const side of[-1,1]){
  const geometry=new THREE.PlaneGeometry(.34,.46,1,2),uv=geometry.attributes.uv;
  for(let i=0;i<uv.count;i++)uv.setX(i,uv.getX(i)*.5+(side>0?.5:0));
  const page=new THREE.Mesh(geometry,material);page.position.x=side*.169;page.rotation.y=side*-.10;page.castShadow=false;page.receiveShadow=true;g.add(page);
 }
 return g;
}

function makeSmallFerry(world){
 const g=new THREE.Group();g.name='晴川里 · 近岸观江渡船';world.scene.add(g);g.position.set(DOCK.x,0,DOCK.z);g.rotation.y=-Math.PI/2;
 const mat=color=>world.mat(color,{roughness:.83});
 const box=(w,h,d,color,x,y,z)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(color));m.position.set(x,y,z);m.receiveShadow=true;g.add(m);return m;};
 const beam=(a,b,r,color)=>{const va=V(...a),vb=V(...b),m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,va.distanceTo(vb),8),mat(color));m.position.copy(va).add(vb).multiplyScalar(.5);m.quaternion.setFromUnitVectors(V(0,1,0),vb.sub(va).normalize());g.add(m);return m;};
 const hull=new THREE.Shape();hull.moveTo(-1.24,-2.1);hull.quadraticCurveTo(-1.12,-3.0,0,-3.15);hull.quadraticCurveTo(1.12,-3.0,1.24,-2.1);hull.lineTo(1.24,2.1);hull.quadraticCurveTo(1,2.9,0,3.1);hull.quadraticCurveTo(-1,2.9,-1.24,2.1);hull.closePath();
 const shell=new THREE.Mesh(new THREE.ExtrudeGeometry(hull,{depth:.53,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.1,bevelThickness:.13}),mat('#47756d'));shell.rotation.x=-Math.PI/2;shell.position.y=.04;g.add(shell);
 box(2.2,.09,4.75,'#cfb984',0,.65,0);for(let i=-7;i<=7;i++)box(2.17,.018,.015,'#967f57',0,.707,i*.30);
 for(const x of[-1.03,1.03]){
  for(const z of[-2.13,-.72,.72,2.13])beam([x,.72,z],[x,1.52,z],.035,'#e4dcc2');
  beam([x,1.52,-2.13],[x,1.52,2.13],.033,'#eadfc0');beam([x,1.12,-2.13],[x,1.12,2.13],.022,'#c8d0b7');
 }
 for(const z of[-1.1,.82]){
  for(const x of[-.67,.67])box(.08,.44,.08,'#496d60',x,.93,z);
  for(const zz of[-.18,0,.18])box(1.69,.075,.16,'#b69a67',0,1.17,z+zz);
  box(1.7,.21,.075,'#bd9e6a',0,1.45,z-.28);
 }
 for(const side of[-1,1]){
  const ring=new THREE.Mesh(new THREE.TorusGeometry(.26,.078,8,22),mat('#d28a56'));ring.position.set(side*1.13,1.02,-1.55);ring.rotation.y=Math.PI/2;g.add(ring);
 }
 for(const x of[-.94,.94])for(const z of[-1.8,1.65])beam([x,.73,z],[x,2.3,z],.045,'#dfd8b9');
 box(2.18,.075,3.8,'#587e70',0,2.36,-.08);box(2.24,.035,3.84,'#eadabc',0,2.4,-.08);
 const name=world.label('晴川里 · 观江船',1.45,.25,'#47756d','#f3e4b8',g);name.position.set(1.25,.52,.1);name.rotation.y=Math.PI/2;
 // A visible captain, not an apparently autonomous passenger ferry.
 const skipper=world.character('#d6d2b6','#53695e',false,'crew');skipper.name='当班船员';skipper.position.set(.15,.72,1.82);skipper.rotation.y=0;skipper.scale.setScalar(.89);g.add(skipper);skipper.traverse(o=>{if(o.isMesh)o.castShadow=false;});
 box(.72,.6,.38,'#5c7f70',.15,1.01,2.15);
 const wheel=new THREE.Mesh(new THREE.TorusGeometry(.18,.018,6,16),mat('#8c704c'));wheel.position.set(.15,1.43,2.10);wheel.rotation.x=.35;g.add(wheel);
 // Gangway joins the existing quay to the side of the docked hull.
 world.box(1.5,.11,3.1,'#b7a57b',27,.58,-32.25);
 for(const x of[26.26,27.74]){world.beam([x,.66,-30.8],[x,.66,-33.7],.035,'#e0d7b8');for(const z of[-30.8,-33.6])world.beam([x,.6,z],[x,1.42,z],.03,'#56786d');world.beam([x,1.42,-30.8],[x,1.42,-33.6],.035,'#56786d');}
 const sign=world.label('晴川里渡口 · 晴日观江',3.1,.4);sign.position.set(27,2.95,-25.55);
 g.traverse(o=>{if(o.isMesh)o.castShadow=false;});return g;
}

export class WorldInteractions{
 constructor(world){
  this.world=world;this.mode='walk';this.currentId=null;this.bike=world.streetBicycle;this.bikeCollider=world.bicycleCollider;this.pedalPhase=0;this.bikeSpeed=0;this.completedFerryTrips=0;this.ferryProgress=0;this.ferryPhase='docked';
  this.paper=makePaper(world);this.paper.visible=false;world.scene.add(this.paper);
  const folded=makePaper(world);folded.scale.setScalar(.62);folded.rotation.x=-Math.PI/2;folded.position.set(-16.35,.78,17.1);world.scene.add(folded);this.restingPaper=folded;this.paperEdition='beforeRain';
  world.box(.75,.07,.64,'#a48d63',-16.35,.72,17.1);for(const x of[-16.64,-16.06])for(const z of[16.87,17.33])world.box(.052,.55,.052,'#6d765d',x,.42,z);
  world.cyl(.085,.068,.15,'#d9dcc2',-16.55,.82,17.12);world.colliders.push({x:-16.74,X:-15.96,z:16.77,Z:17.43,height:.79,kind:'newspaper-table'});
  this.ferry=makeSmallFerry(world);this.boat=buildRowboat(world);this.boatLanding=buildRowboatLanding(world);this.boatSpeed=0;this.boatStrokePhase=0;this.boatBoundaryHit=false;this.updateBikeCollider();this.cars=buildDriveableCars(world);this.carSpeed=0;this.carSteering=0;
 }
 anchors(){
  const list=[...PROP_ANCHORS,ROWBOAT_ANCHOR,NEIGHBORHOOD_RACE_ANCHOR].map(p=>({...p})),b=this.bike?.position;
  if(b){const yaw=this.bike.rotation.y;let anchor={x:b.x+Math.cos(yaw)*.98,z:b.z-Math.sin(yaw)*.98};
   if(!this.world.canWalk(anchor.x,anchor.z))anchor={x:b.x-Math.cos(yaw)*.98,z:b.z+Math.sin(yaw)*.98};Object.assign(list[0],anchor);}
  for(const car of this.cars??[]){const p=car.group.position,exit=findCarDismount(this.world,car);list.push({id:car.id,name:car.name,label:car.definition.label,x:exit?.x??p.x,z:exit?.z??p.z,kind:'prop',propType:'car',icon:'car'});}
  return list;
 }
 get activeCar(){return this.cars?.find(c=>c.id===this.currentId)??null;}
 carObjects(){return (this.cars??[]).map(c=>c.group);}
 getCarProgress(){return normalizeCarProgress({vehicles:Object.fromEntries((this.cars??[]).map(c=>[c.id,{x:c.group.position.x,z:c.group.position.z,yaw:c.group.rotation.y}]))});}
 restoreCarProgress(value){
  if(this.mode==='car')this.end({immediate:true});const progress=normalizeCarProgress(value),w=this.world;
  for(const car of this.cars??[]){const d=car.definition;car.group.position.set(d.x,w.heightAt(d.x,d.z),d.z);car.group.rotation.y=d.yaw;this.addCarCollider(car);updateCarRig(car.group);}
  for(const car of this.cars??[]){const p=progress.vehicles[car.id];this.removeCarCollider(car);if(canDriveCarPose(w,p,p,{...car.definition,ignore:car.collider,carId:car.id})){car.group.position.set(p.x,w.heightAt(p.x,p.z),p.z);car.group.rotation.y=p.yaw;}this.addCarCollider(car);}
  this.carSpeed=0;this.carSteering=0;return this.getCarProgress();
 }
 state(){const car=this.activeCar,speed=this.mode==='car'?this.carSpeed:this.mode==='boat'?this.boatSpeed:this.bikeSpeed;return {mode:this.mode,currentId:this.currentId,carId:this.mode==='car'?car?.id??null:null,carName:this.mode==='car'?car?.name??null:null,name:this.mode==='car'?car?.name??null:this.mode==='boat'?ROWBOAT_ANCHOR.name:null,cars:(this.cars??[]).map(c=>({id:c.id,name:c.name,x:c.group.position.x,z:c.group.position.z,yaw:c.group.rotation.y})),bikePosition:{x:this.bike.position.x,z:this.bike.position.z,yaw:this.bike.rotation.y},boatPosition:this.boat?{x:this.boat.position.x,z:this.boat.position.z}:null,boatYaw:this.boat?.rotation.y??ROWBOAT_DOCK.yaw,boatBoundaryHit:Boolean(this.boatBoundaryHit),boatWaterBounds:{...ROWBOAT_WATER_BOUNDS},signedSpeed:speed,speed:Math.abs(speed),ferryProgress:this.ferryProgress,ferryPhase:this.ferryPhase,returning:Boolean(this.returnRequest),remainingSeconds:this.mode==='ferry'?Math.max(0,TRIP_SECONDS-this.ferryProgress*TRIP_SECONDS):0,completedFerryTrips:this.completedFerryTrips,props:this.anchors(),anchors:this.anchors()};}
 nearby(){if(this.mode!=='walk')return this.anchors().find(p=>p.id===this.currentId)??null;
  const w=this.world,p=w.player.position;return this.anchors().filter(a=>Math.hypot(p.x-a.x,p.z-a.z)<2.35&&Math.abs(p.y-w.heightAt(a.x,a.z))<.45).sort((a,b)=>Math.hypot(p.x-a.x,p.z-a.z)-Math.hypot(p.x-b.x,p.z-b.z))[0]??null;
 }
 clearInput(){const w=this.world;w.keys={};w.path=[];w.moveSpeed=0;w.walking=false;w.releasePointerLock?.();if(w.playerMotion){w.playerMotion.bufferedTime=0;w.playerMotion.verticalVelocity=0;w.playerMotion.grounded=true;}}
 updateFraming(){const w=this.world,camera=w.camera;if(!camera?.setViewOffset)return;if(this.mode==='reading'||this.mode==='ferry'){const width=w.canvas?.clientWidth||window.innerWidth,height=w.canvas?.clientHeight||window.innerHeight;camera.setViewOffset(width,height,width*(this.mode==='reading'?.18:.13),0,width,height);}else camera.clearViewOffset();}
 blocksNpc(x,z){if(this.cars?.some(c=>carOverlapsCircle({x:c.group.position.x,z:c.group.position.z,yaw:c.group.rotation.y},x,z,.72,c.definition.halfWidth,c.definition.halfLength)))return true;const b=this.bike.position,yaw=this.bike.rotation.y,dx=x-b.x,dz=z-b.z;return Math.abs(dx*Math.cos(yaw)-dz*Math.sin(yaw))<.63&&Math.abs(dx*Math.sin(yaw)+dz*Math.cos(yaw))<1.44;}
 removeCarCollider(car){const index=this.world.colliders.indexOf(car.collider);if(index>=0)this.world.colliders.splice(index,1);}
 addCarCollider(car){updateCarCollider(car);if(!this.world.colliders.includes(car.collider))this.world.colliders.push(car.collider);}
 updateBikeCollider(){if(!this.bikeCollider)return;const p=this.bike.position,yaw=this.bike.rotation.y,dx=Math.abs(Math.sin(yaw))*1.08+Math.abs(Math.cos(yaw))*.27,dz=Math.abs(Math.cos(yaw))*1.08+Math.abs(Math.sin(yaw))*.27;Object.assign(this.bikeCollider,{x:p.x-dx,X:p.x+dx,z:p.z-dz,Z:p.z+dz,height:1.3});}
 removeBikeCollider(){const list=this.world.colliders,index=list.indexOf(this.bikeCollider);if(index>=0)list.splice(index,1);}
 addBikeCollider(){this.updateBikeCollider();if(this.bikeCollider&&!this.world.colliders.includes(this.bikeCollider))this.world.colliders.push(this.bikeCollider);}
 clearPose(){if(this.lifeJacket)this.lifeJacket.root.visible=false;const p=this.world.player,r=p.userData.rig;if(r){r.root.position.y=0;for(const bone of[...p.userData.legs,...p.userData.arms,...r.knees,...r.ankles,...r.elbows,...r.hands,p.userData.body,p.userData.head])bone?.quaternion.identity();p.userData.body?.position.set(0,r.bodyRestY,0);delete p.userData.townLife;}this.paper.visible=false;this.restingPaper.visible=true;p.rotation.z=0;}
 updateSafetyWear(){if(this.mode==='boat'&&!this.lifeJacket)this.lifeJacket=createBoatLifeJacket(this.world);updateBoatLifeJacket(this.lifeJacket,this.world,{active:this.mode==='boat'});}
 start(id){
  const w=this.world,anchor=this.anchors().find(p=>p.id===id);
  if(!anchor)return {ok:false,reason:'没有找到这件街坊物件。'};
  if(this.mode!=='walk')return {ok:false,reason:'先结束眼前的活动。'};
  if(!w.active||w.suspended||w.conversation)return {ok:false,reason:'等眼前这件事忙完，再来坐一会儿。'};
  if(w.playerMotion?.grounded===false)return {ok:false,reason:'先站稳，再使用它。'};
  if(Math.hypot(w.player.position.x-anchor.x,w.player.position.z-anchor.z)>2.65)return {ok:false,reason:'走近一点，就可以使用了。'};
  if(anchor.propType==='race')return {ok:false,reason:'先看看街坊的计时赛邀请。'};
  if((id===PROP_IDS.ferry||id===PROP_IDS.boat)&&w.rainy&&!w.ended)return {ok:false,reason:'雨天停航，等渡口确认复航后再来。'};
  this.safePosition={x:w.player.position.x,z:w.player.position.z};this.cameraRestore={mode:w.cameraMode,yaw:w.thirdYaw,pitch:w.thirdPitch,distance:w.thirdDistance};
  if(id===PROP_IDS.bicycle){const p=this.bike.position,pose={x:p.x,z:p.z,yaw:this.bike.rotation.y};this.removeBikeCollider();if(!canCyclePose(w,pose,pose)){this.addBikeCollider();return {ok:false,reason:'车旁有街坊或障碍，等道路空出来再骑。'};}this.mode='bicycle';this.bikeSpeed=0;}
  else if(anchor.propType==='car'){const car=this.cars.find(c=>c.id===id),p=car.group.position,pose={x:p.x,z:p.z,yaw:car.group.rotation.y};this.removeCarCollider(car);if(!canDriveCarPose(w,pose,pose,{...car.definition,ignore:car.collider,carId:car.id})){this.addCarCollider(car);return {ok:false,reason:'车旁有街坊或障碍，等道路空出来再开。'};}this.mode='car';this.carSpeed=0;this.carSteering=0;}
  else if(id===PROP_IDS.newspaper){this.mode='reading';w.player.position.set(SEAT.x,w.heightAt(SEAT.x,SEAT.z),SEAT.z);w.player.rotation.y=SEAT.yaw;}
  else if(id===PROP_IDS.boat){this.mode='boat';this.boatSpeed=0;this.boatStrokePhase=0;this.boatBoundaryHit=false;this.boat.position.set(ROWBOAT_DOCK.x,0,ROWBOAT_DOCK.z);this.boat.rotation.set(0,ROWBOAT_DOCK.yaw,0);}
  else{this.mode='ferry';this.ferryProgress=0;this.ferryPhase='outbound';this.returnRequest=null;this.ferry.position.set(DOCK.x,0,DOCK.z);this.ferry.rotation.y=-Math.PI/2;}
  this.currentId=id;this.clearInput();w.cameraReturn=null;w.setCameraMode?.('street');this.updateFraming();
  if(this.mode==='reading'){w.thirdYaw=.48;w.thirdPitch=.15;w.thirdDistance=3.3;}
  if(this.mode==='ferry'){w.thirdYaw=-1.05;w.thirdPitch=.13;w.thirdDistance=4.4;}
  if(this.mode==='car'){w.thirdYaw=Math.PI-this.activeCar.group.rotation.y-.92;w.thirdPitch=.31;w.thirdDistance=6.8;}
  if(this.mode==='boat'){w.thirdYaw=Math.PI-this.boat.rotation.y-.25;w.thirdPitch=.25;w.thirdDistance=6.8;}
  this.update(0,w.elapsed||0);this.pose(0,w.elapsed||0);w.heroAvatar?.update(0,w.elapsed||0);this.updateSafetyWear();updateThirdPerson(w,0,true);
  return {ok:true};
 }
 safeSavePosition(){if(this.mode==='boat')return {...(this.safePosition??ROWBOAT_ANCHOR)};if(this.mode==='car')return findCarDismount(this.world,this.activeCar,{wide:true,fallback:this.safePosition})??this.safePosition;if(this.mode==='reading')return {x:PROP_ANCHORS[1].x,z:PROP_ANCHORS[1].z};if(this.mode==='ferry')return {x:PROP_ANCHORS[2].x,z:PROP_ANCHORS[2].z};if(this.mode==='bicycle')return this.findDismount()??this.safePosition??{x:-20.05,z:20};return {x:this.world.player.position.x,z:this.world.player.position.z};}
 findDismount(){const w=this.world,b=this.bike.position,yaw=this.bike.rotation.y;this.updateBikeCollider();const c=this.bikeCollider;for(const side of[1,-1])for(const along of[-.28,.35,-1.55,1.55]){const x=b.x+Math.cos(yaw)*side*.97+Math.sin(yaw)*along,z=b.z-Math.sin(yaw)*side*.97+Math.cos(yaw)*along;const insideParkedBike=c&&x>c.x-.35&&x<c.X+.35&&z>c.z-.35&&z<c.Z+.35;if(!insideParkedBike&&w.canWalk(x,z)&&!w.npcs.some(n=>n.group.visible&&Math.hypot(x-n.group.position.x,z-n.group.position.z)<.70)&&Math.abs(w.heightAt(x,z)-b.y)<.24)return {x,z};}return null;}
 end({immediate=false}={}){
  if(this.mode==='walk')return {ok:true};
  if(this.mode==='car'){
   const car=this.activeCar;this.carSpeed=0;this.addCarCollider(car);const point=findCarDismount(this.world,car,{wide:immediate,fallback:this.safePosition});
   if(!point){this.removeCarCollider(car);return {ok:false,reason:'这里太挤了，往空一点的地方开，再下车。'};}
   this.mode='walk';this.currentId=null;this.carSteering=0;this.clearInput();this.clearPose();this.updateFraming();updateCarRig(car.group);
   const w=this.world;w.setPosition(point);resetPlayerMotion(w);if(this.cameraRestore){w.thirdYaw=this.cameraRestore.yaw;w.thirdPitch=this.cameraRestore.pitch;w.thirdDistance=this.cameraRestore.distance;w.setCameraMode?.(this.cameraRestore.mode??'street');this.cameraRestore=null;}
   return {ok:true};
  }
  if(this.mode==='ferry'&&!immediate){if(!this.returnRequest)this.returnRequest={elapsed:0,position:this.ferry.position.clone(),yaw:this.ferry.rotation.y};this.ferryPhase='returning';this.clearInput();return {ok:true,returning:true};}
  const was=this.mode;this.addBikeCollider();const point=was==='bicycle'?this.findDismount():this.safeSavePosition();
  if(!point&&was==='bicycle'&&!immediate){this.removeBikeCollider();return {ok:false,reason:'这里太挤了，往空一点的地方骑，再下车。'};}
  this.mode='walk';this.currentId=null;this.bikeSpeed=0;this.boatSpeed=0;this.boatBoundaryHit=false;this.ferryPhase='docked';this.returnRequest=null;this.clearInput();this.clearPose();this.updateFraming();
  const w=this.world;w.setPosition(point??this.safePosition??PROP_ANCHORS[0]);resetPlayerMotion(w);updateBicycleRig(this.bike,{pedalPhase:this.pedalPhase,riding:false});
  this.ferry.position.set(DOCK.x,0,DOCK.z);this.ferry.rotation.y=-Math.PI/2;
  if(was==='boat'){this.boat.position.set(ROWBOAT_DOCK.x,0,ROWBOAT_DOCK.z);this.boat.rotation.set(0,ROWBOAT_DOCK.yaw,0);this.boatStrokePhase=0;updateRowboatRig(this.boat,{reduced:true});}
  if(this.cameraRestore){w.thirdYaw=this.cameraRestore.yaw;w.thirdPitch=this.cameraRestore.pitch;w.thirdDistance=this.cameraRestore.distance;w.setCameraMode?.(this.cameraRestore.mode??'street');this.cameraRestore=null;}
  return {ok:true};
 }
 restore(progress={}){
  if(this.mode!=='walk')this.end({immediate:true});this.removeBikeCollider();
  const desired=progress.bikePosition,fallback={x:-21,z:20,yaw:0},candidate=finitePoint(desired)?{x:desired.x,z:desired.z,yaw:Number.isFinite(desired.yaw)?desired.yaw:0}:fallback;
  const pose=canCyclePose(this.world,candidate,candidate)?candidate:fallback;this.bike.position.set(pose.x,this.world.heightAt(pose.x,pose.z),pose.z);this.bike.rotation.y=pose.yaw;this.addBikeCollider();
  this.ferryProgress=0;this.ferryPhase='docked';this.completedFerryTrips=0;this.boatSpeed=0;this.boatStrokePhase=0;this.boatBoundaryHit=false;this.boat?.position.set(ROWBOAT_DOCK.x,0,ROWBOAT_DOCK.z);if(this.boat){this.boat.rotation.set(0,ROWBOAT_DOCK.yaw,0);updateRowboatRig(this.boat,{reduced:true});}this.clearPose();
 }
 update(dt,time){
  const w=this.world;const edition=w.storyFlags?.has('postlude')?'afterRain':'beforeRain';if(edition!==this.paperEdition){this.paperEdition=edition;for(const paper of[this.paper,this.restingPaper]){drawPaper(paper.userData.paperCanvas,edition);paper.userData.paperTexture.needsUpdate=true;}}
  if(this.mode==='car'&&(!w.active||w.suspended||w.conversation)){this.end({immediate:true});return;}
  if(this.mode==='boat'&&(!w.active||w.conversation||(w.rainy&&!w.ended))){this.end({immediate:true});return;}
  if(this.mode==='boat'&&w.suspended){this.boatSpeed=0;w.keys={};return;}
  if(this.mode==='walk'||!w.active||w.suspended)return;
  if(this.mode==='car'){
   const car=this.activeCar,d=car.definition,p=car.group.position,yaw=car.group.rotation.y,keys=w.keys,step=Math.min(.10,Math.max(0,dt));
   const up=!w.blocked&&(keys.w||keys.arrowup),down=!w.blocked&&(keys.s||keys.arrowdown),left=!w.blocked&&(keys.a||keys.arrowleft),right=!w.blocked&&(keys.d||keys.arrowright);
   w.path=[];if(w.blocked)this.carSpeed=0;
   const desired=up?7.8:down?-2.7:0,targetSteering=((left?1:0)-(right?1:0))*.53;
   this.carSpeed=THREE.MathUtils.lerp(this.carSpeed,desired,1-Math.exp(-step*(desired?2.0:5.5)));this.carSteering=THREE.MathUtils.lerp(this.carSteering,targetSteering,1-Math.exp(-step*7));
   const distance=this.carSpeed*step,turn=Math.tan(this.carSteering)*distance/d.wheelbase,nextYaw=yaw+turn;
   const next={x:p.x+Math.sin(yaw+turn*.5)*distance,z:p.z+Math.cos(yaw+turn*.5)*distance,yaw:nextYaw};let travelled=0;
   if(canDriveCarPose(w,{x:p.x,z:p.z,yaw},next,{...d,ignore:car.collider,carId:car.id})){p.set(next.x,w.heightAt(next.x,next.z),next.z);car.group.rotation.y=nextYaw;travelled=distance;}else this.carSpeed=0;
   updateCarCollider(car);updateCarRig(car.group,{distance:travelled,steering:this.carSteering,driving:true});
   const local=V(d.seat.x,0,d.seat.z).applyAxisAngle(V(0,1,0),car.group.rotation.y);w.player.position.copy(p).add(local);w.player.rotation.y=car.group.rotation.y;w.moveSpeed=0;w.walking=false;w.movementDistance=Math.abs(travelled);if(travelled)w.callbacks.onMove?.(w.player.position);
  }else if(this.mode==='bicycle'){
   const b=this.bike.position,yaw=this.bike.rotation.y,keys=w.keys;
   if(w.blocked)this.bikeSpeed=0;
   const up=!w.blocked&&(keys.w||keys.arrowup),down=!w.blocked&&(keys.s||keys.arrowdown),left=!w.blocked&&(keys.a||keys.arrowleft),right=!w.blocked&&(keys.d||keys.arrowright);
   let desired=up?6.8:down?-2.2:0,steer=(left?1:0)-(right?1:0),routeEnd=false;
   if(!up&&!down&&!left&&!right&&w.path.length&&!w.blocked){const target=w.path[0],d=Math.hypot(target.x-b.x,target.z-b.z);if(d<.65){w.path.shift();routeEnd=!w.path.length;}else{const difference=angleDelta(yaw,Math.atan2(target.x-b.x,target.z-b.z));steer=clamp(difference*1.8,-1,1);desired=Math.abs(difference)>1.15?1.2:Math.min(6.8,d*2.2);}}
   if(up||down||left||right)w.path=[];
   if(routeEnd)desired=0;this.bikeSpeed=THREE.MathUtils.lerp(this.bikeSpeed,desired,1-Math.exp(-dt*(desired?3.2:6.5)));
   const turn=steer*1.28*clamp(Math.abs(this.bikeSpeed)/1.2,0,1)*(this.bikeSpeed<0?-1:1)*dt,nextYaw=yaw+turn;
   const distance=this.bikeSpeed*dt,next={x:b.x+Math.sin(nextYaw)*distance,z:b.z+Math.cos(nextYaw)*distance,yaw:nextYaw};
   if(canCyclePose(w,{x:b.x,z:b.z,yaw},next)){b.set(next.x,w.heightAt(next.x,next.z),next.z);this.bike.rotation.y=nextYaw;this.pedalPhase+=distance/1.18;updateBicycleRig(this.bike,{distance,pedalPhase:this.pedalPhase,riding:true});w.movementDistance=Math.abs(distance);w.callbacks.onMove?.(w.player.position);}
   else{this.bikeSpeed=0;w.path=[];}
   const local=V(0,0,-.405*BIKE_SCALE).applyAxisAngle(V(0,1,0),this.bike.rotation.y);w.player.position.copy(b).add(local);w.player.rotation.y=this.bike.rotation.y;w.moveSpeed=0;w.walking=false;
  }else if(this.mode==='boat'){
   const b=this.boat,keys=w.keys;w.path=[];
   const next=stepRowboat({x:b.position.x,z:b.position.z,yaw:b.rotation.y,speed:this.boatSpeed,strokePhase:this.boatStrokePhase},{forward:keys.w||keys.arrowup,backward:keys.s||keys.arrowdown,left:keys.a||keys.arrowleft,right:keys.d||keys.arrowright,blocked:w.blocked},dt);
   b.position.x=next.x;b.position.z=next.z;b.rotation.y=next.yaw;this.boatSpeed=next.speed;this.boatStrokePhase=next.strokePhase;this.boatBoundaryHit=next.boundaryHit;
   updateRowboatRig(b,{time,strokePhase:next.strokePhase,speed:next.speed,rowing:next.rowing,steering:next.steering,reduced:w.reduced});
   b.updateWorldMatrix(true,true);w.player.position.copy(b.localToWorld(V(0,ROWBOAT_SETTINGS.playerY,ROWBOAT_SETTINGS.playerZ)));w.player.rotation.y=b.rotation.y;w.moveSpeed=0;w.walking=false;w.movementDistance=next.distance;
   if(next.distance)w.callbacks.onMove?.(w.player.position);
   if(!w.blocked&&w.cameraMode==='street'&&!w.lookDrag&&(w.elapsed-(w.lastManualLook??-100))>2.2){w.thirdYaw+=angleDelta(w.thirdYaw,Math.PI-b.rotation.y-.18)*(1-Math.exp(-Math.max(0,dt)*1.45));}
  }else if(this.mode==='reading'){w.player.position.set(SEAT.x,w.heightAt(SEAT.x,SEAT.z),SEAT.z);w.player.rotation.y=SEAT.yaw;}
  else{
   if(this.returnRequest){const r=this.returnRequest;r.elapsed+=dt;const t=smooth(clamp(r.elapsed/3,0,1));this.ferry.position.lerpVectors(r.position,V(DOCK.x,0,DOCK.z),t);this.ferry.rotation.y=r.yaw+angleDelta(r.yaw,-Math.PI/2)*t;if(t>=1){this.end({immediate:true});return;}}
   else{this.ferryProgress=Math.min(1,this.ferryProgress+dt/TRIP_SECONDS);const a=this.ferryProgress*Math.PI*2;this.ferry.position.set(DOCK.x-8*Math.sin(a),0,DOCK.z-8*(1-Math.cos(a)));this.ferry.rotation.y=-Math.PI/2-a;this.ferryPhase=this.ferryProgress<.5?'outbound':'returning';if(this.ferryProgress>=1){this.completedFerryTrips++;this.end({immediate:true});return;}}
   this.ferry.position.y=w.reduced?0:Math.sin(time*1.3)*.022;this.ferry.rotation.z=w.reduced?0:Math.sin(time*.8)*.005;
   this.ferry.updateWorldMatrix(true,true);w.player.position.copy(this.ferry.localToWorld(V(-.36,.71,.87)));w.player.rotation.y=this.ferry.rotation.y;
  }
 }
 pose(dt,time){
  if(this.mode==='walk')return;const w=this.world,p=w.player,rig=p.userData.rig;if(!rig)return;
  if(this.mode==='car'){
   const car=this.activeCar,d=car.definition;rig.root.position.y=d.seat.y-rig.hipHeight;p.userData.body.position.set(0,rig.bodyRestY,0);p.userData.body.rotation.set(.035,0,0);p.userData.head.rotation.set(-.035,0,0);this.paper.visible=false;this.restingPaper.visible=true;
   for(let i=0;i<2;i++){const side=i?1:-1,target=V(side*.15,(d.type==='van'?.39:.28)+rig.ankleHeight,.52);target.y-=rig.root.position.y;solveLimb(p.userData.legs[i],rig.knees[i],rig.ankles[i],target,V(0,0,1));}
   p.updateWorldMatrix(true,true);car.group.updateWorldMatrix(true,true);const wheel=car.group.userData.rig.steering;
   for(let i=0;i<2;i++){const side=i?1:-1,worldTarget=wheel.localToWorld(V(side*.188,.058,-.007)),target=p.userData.body.worldToLocal(worldTarget);solveLimb(p.userData.arms[i],rig.elbows[i],rig.hands[i],target,V(side*.16,-1,0));}
   return;
  }
  if(this.mode==='boat'){
   const boat=this.boat;rig.root.position.y=ROWBOAT_SETTINGS.seatY-rig.hipHeight;p.userData.body.position.set(0,rig.bodyRestY,0);
   const rowing=!w.blocked&&(w.keys.w||w.keys.arrowup||w.keys.s||w.keys.arrowdown||w.keys.a||w.keys.arrowleft||w.keys.d||w.keys.arrowright);
   p.userData.body.rotation.set(rowing&&!w.reduced?.045+Math.sin(this.boatStrokePhase)*.055:.025,0,0);p.userData.head.rotation.set(-.025,0,0);this.paper.visible=false;this.restingPaper.visible=true;
   for(let i=0;i<2;i++){const side=i?1:-1,target=V(side*.17,.20+rig.ankleHeight,.65);target.y-=rig.root.position.y;solveLimb(p.userData.legs[i],rig.knees[i],rig.ankles[i],target,V(0,0,1));}
   p.updateWorldMatrix(true,true);boat.updateWorldMatrix(true,true);
   for(let i=0;i<2;i++){const oar=boat.userData.rig.oars[i],target=p.userData.body.worldToLocal(oar.handle.getWorldPosition(V()));solveLimb(p.userData.arms[i],rig.elbows[i],rig.hands[i],target,V(oar.side*.18,-1,0));}
   return;
  }
  const cycling=this.mode==='bicycle',reading=this.mode==='reading';const hipY=cycling?1.438*BIKE_SCALE+.10:reading?.61:.56;
  rig.root.position.y=hipY-rig.hipHeight;p.userData.body.position.set(0,rig.bodyRestY,0);p.userData.body.rotation.set(cycling?.35:reading?.065:.015,0,0);p.userData.head.rotation.set(reading?.18:cycling?-.11:0,0,0);
  const feet=[];
  if(cycling){for(const side of[-1,1]){const yy=side*.13,zz=-side*.095,a=this.pedalPhase;feet.push(V(side*.235*BIKE_SCALE,(.43+yy*Math.cos(a)-zz*Math.sin(a))*BIKE_SCALE+rig.ankleHeight+.021,(-.08+yy*Math.sin(a)+zz*Math.cos(a)+.405)*BIKE_SCALE-.045));}}
  else for(const side of[-1,1])feet.push(V(side*.12,rig.ankleHeight, .43));
  for(let i=0;i<2;i++){const target=feet[i].clone();target.y-=rig.root.position.y;solveLimb(p.userData.legs[i],rig.knees[i],rig.ankles[i],target,V(0,0,1));}
  this.paper.visible=reading;this.restingPaper.visible=!reading;p.updateWorldMatrix(true,true);this.paper.position.copy(p.localToWorld(V(0,.90,.39)));this.paper.rotation.set(-.48,p.rotation.y,0,'YXZ');
  p.updateWorldMatrix(true,true);
  for(let i=0;i<2;i++){
   const side=i?1:-1,target=cycling?V(side*.34*BIKE_SCALE,1.69*BIKE_SCALE+.055,(.21+.405)*BIKE_SCALE):reading?V(side*.30,.80,.44):V(side*.21,.67,.36);
   const local=p.userData.body.worldToLocal(p.localToWorld(target.clone()));solveLimb(p.userData.arms[i],rig.elbows[i],rig.hands[i],local,V(side*.18,-1,0));
   if(reading)rig.hands[i].quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(V(1,0,0),-.545));
  }
 }
}
