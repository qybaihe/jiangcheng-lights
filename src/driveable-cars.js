import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {CAR_IDS,CAR_DEFAULTS} from './car-progress.js';
import {isInsidePlayableBounds,PLAYABLE_BOUNDS} from './wuhan-district-layout.js';

const UP=new THREE.Vector3(0,1,0),clamp=THREE.MathUtils.clamp;
const yawDelta=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
export const CAR_DEFINITIONS=Object.freeze([
 Object.freeze({id:CAR_IDS.sedan,name:'暖黄小轿车',label:'驾驶暖黄小轿车',type:'sedan',paint:'#dbb35e',bodyHalfWidth:.88,halfWidth:1.05,halfLength:1.96,height:1.73,wheelbase:2.54,wheelRadius:.31,seat:{x:-.39,y:.74,z:-.04},wheel:{x:-.39,y:1.12,z:.35},...CAR_DEFAULTS[CAR_IDS.sedan]}),
 Object.freeze({id:CAR_IDS.van,name:'青绿社区小货车',label:'驾驶青绿社区小货车',type:'van',paint:'#689d8e',bodyHalfWidth:.91,halfWidth:1.08,halfLength:2.12,height:1.99,wheelbase:2.72,wheelRadius:.32,seat:{x:-.40,y:.89,z:.53},wheel:{x:-.40,y:1.29,z:.92},...CAR_DEFAULTS[CAR_IDS.van]}),
]);
const localPoint=(pose,x,z)=>({x:pose.x+Math.cos(pose.yaw)*x+Math.sin(pose.yaw)*z,z:pose.z-Math.sin(pose.yaw)*x+Math.cos(pose.yaw)*z});
const pointLocal=(pose,x,z)=>({x:(x-pose.x)*Math.cos(pose.yaw)-(z-pose.z)*Math.sin(pose.yaw),z:(x-pose.x)*Math.sin(pose.yaw)+(z-pose.z)*Math.cos(pose.yaw)});

// Exact rectangle-vs-AABB SAT, including walls smaller than the terrain grid.
export function carOverlapsBox(pose,c,halfWidth=.88,halfLength=1.96,margin=.055){
 const dx=(c.x+c.X)/2-pose.x,dz=(c.z+c.Z)/2-pose.z,rx=(c.X-c.x)/2+margin,rz=(c.Z-c.z)/2+margin;
 const sin=Math.sin(pose.yaw),cos=Math.cos(pose.yaw),s=Math.abs(sin),co=Math.abs(cos);
 return Math.abs(dx)<rx+co*halfWidth+s*halfLength&&Math.abs(dz)<rz+s*halfWidth+co*halfLength
  &&Math.abs(dx*cos-dz*sin)<halfWidth+co*rx+s*rz&&Math.abs(dx*sin+dz*cos)<halfLength+s*rx+co*rz;
}
export function carOverlapsCircle(pose,x,z,r,halfWidth=.88,halfLength=1.96){
 const p=pointLocal(pose,x,z),dx=Math.max(0,Math.abs(p.x)-halfWidth),dz=Math.max(0,Math.abs(p.z)-halfLength);
 return dx*dx+dz*dz<r*r;
}

/** Complete swept chassis, not a fast point-sized walker. A short motion step
 * and conservative 5.5cm SAT margin also cover the intervening rotating arc. */
export function canDriveCarPose(world,from,to,{halfWidth=.88,halfLength=1.96,height=1.73,ignore=null,carId=null}={}){
 if(![from.x,from.z,from.yaw,to.x,to.z,to.yaw].every(Number.isFinite))return false;
 const distance=Math.hypot(to.x-from.x,to.z-from.z),turn=yawDelta(from.yaw,to.yaw);
 const count=Math.max(1,Math.ceil(distance/.075),Math.ceil(Math.abs(turn)/.022));
 const nx=Math.ceil(halfWidth*2/.16),nz=Math.ceil(halfLength*2/.16),sx=halfWidth*2/nx,sz=halfLength*2/nz;
 let oldFloors=null,previousPose=null;
 for(let step=0;step<=count;step++){
  const t=step/count,pose={x:from.x+(to.x-from.x)*t,z:from.z+(to.z-from.z)*t,yaw:from.yaw+turn*t};
  const floor=world.heightAt(pose.x,pose.z);if(!Number.isFinite(floor))return false;
  const radiusX=Math.abs(Math.cos(pose.yaw))*halfWidth+Math.abs(Math.sin(pose.yaw))*halfLength;
  const radiusZ=Math.abs(Math.sin(pose.yaw))*halfWidth+Math.abs(Math.cos(pose.yaw))*halfLength;
  if(!isInsidePlayableBounds(pose.x-radiusX,pose.z-radiusZ,.35)||!isInsidePlayableBounds(pose.x+radiusX,pose.z+radiusZ,.35))return false;
  for(const c of world.colliders??[])if(c!==ignore&&c.carId!==carId&&c.solid!==false&&carOverlapsBox(pose,c,halfWidth,halfLength))return false;
  for(const c of world.cameraOccluders??[])if(c.solid!==false&&floor+height>(c.y??0)&&floor<(c.height??11)&&carOverlapsBox(pose,c,halfWidth,halfLength))return false;
  for(const h of world.hazards??[])if(carOverlapsCircle(pose,h.x,h.z,h.r+.12,halfWidth,halfLength))return false;
  for(const n of world.npcs??[])if(n.group.visible&&carOverlapsCircle(pose,n.group.position.x,n.group.position.z,.61,halfWidth,halfLength))return false;
  const floors=[];
  for(let iz=0;iz<=nz;iz++)for(let ix=0;ix<=nx;ix++){
   const lx=-halfWidth+sx*ix,lz=-halfLength+sz*iz,p=localPoint(pose,lx,lz),y=world.heightAt(p.x,p.z),index=iz*(nx+1)+ix;
   if(!Number.isFinite(y))return false;
   // Flat chassis cannot straddle a kerb/stair; genuinely continuous ramps can.
   if(ix&&Math.abs(y-floors[index-1])>.035+sx*.23)return false;
   if(iz&&Math.abs(y-floors[index-nx-1])>.035+sz*.23)return false;
   if(oldFloors){const old=localPoint(previousPose,lx,lz);if(Math.abs(y-oldFloors[index])>.055+Math.hypot(p.x-old.x,p.z-old.z)*.23)return false;}
   floors.push(y);
  }
  previousPose=pose;oldFloors=floors;
 }
 return true;
}

export function updateCarCollider(car){
 const p=car.group.position,yaw=car.group.rotation.y,{halfWidth,halfLength,height}=car.definition;
 const dx=Math.abs(Math.sin(yaw))*halfLength+Math.abs(Math.cos(yaw))*halfWidth,dz=Math.abs(Math.cos(yaw))*halfLength+Math.abs(Math.sin(yaw))*halfWidth;
 Object.assign(car.collider,{x:p.x-dx,X:p.x+dx,z:p.z-dz,Z:p.z+dz,y:p.y,height:p.y+height,kind:'car',carId:car.id});return car.collider;
}

function validExit(world,car,p){
 if(!Number.isFinite(p?.x)||!Number.isFinite(p?.z)||!isInsidePlayableBounds(p.x,p.z,.5)||!world.canWalk(p.x,p.z))return false;
 const floor=world.heightAt(p.x,p.z),c=car.collider;
 if(!Number.isFinite(floor)||Math.abs(floor-car.group.position.y)>.23)return false;
 if(p.x>c.x-.36&&p.x<c.X+.36&&p.z>c.z-.36&&p.z<c.Z+.36)return false;
 for(const n of world.npcs??[])if(n.group.visible&&Math.hypot(p.x-n.group.position.x,p.z-n.group.position.z)<.76)return false;
 for(const h of world.hazards??[])if(Math.hypot(p.x-h.x,p.z-h.z)<h.r+.35)return false;
 for(let i=0;i<8;i++){
  const x=p.x+Math.cos(i*Math.PI/4)*.29,z=p.z+Math.sin(i*Math.PI/4)*.29;
  if(Math.abs(world.heightAt(x,z)-floor)>.075)return false;
  if((world.colliders??[]).some(c=>c.solid!==false&&x>c.x&&x<c.X&&z>c.z&&z<c.Z))return false;
 }
 return true;
}

function clearExitPath(world,car,end){
 const origin=localPoint({x:car.group.position.x,z:car.group.position.z,yaw:car.group.rotation.y},car.definition.seat?.x??0,car.definition.seat?.z??0);
 const count=Math.max(1,Math.ceil(Math.hypot(end.x-origin.x,end.z-origin.z)/.10));let last=world.heightAt(origin.x,origin.z);
 for(let i=1;i<=count;i++){
  const p={x:origin.x+(end.x-origin.x)*i/count,z:origin.z+(end.z-origin.z)*i/count},floor=world.heightAt(p.x,p.z);
  if(!Number.isFinite(floor)||Math.abs(floor-last)>.09)return false;last=floor;
  if((world.colliders??[]).some(c=>c!==car.collider&&c.solid!==false&&p.x>c.x-.30&&p.x<c.X+.30&&p.z>c.z-.30&&p.z<c.Z+.30))return false;
  if((world.npcs??[]).some(n=>n.group.visible&&Math.hypot(p.x-n.group.position.x,p.z-n.group.position.z)<.70))return false;
  if((world.hazards??[]).some(h=>Math.hypot(p.x-h.x,p.z-h.z)<h.r+.30))return false;
 }
 return true;
}

/** A legal standing point is not necessarily a usable navigation origin.
 * Match findWalkPath's seed contract: an integer grid point within 1.55m,
 * joined by .18m standing-footprint samples and the same 23cm step limit.
 * This keeps a 30cm strip between a parked car and wall from becoming a
 * dismount trap, without weakening either collision envelope.
 */
function hasExitNavigationEntry(world,point){
 const candidates=[];
 for(let x=Math.floor(point.x)-1;x<=Math.ceil(point.x)+1;x++)for(let z=Math.floor(point.z)-1;z<=Math.ceil(point.z)+1;z++){
  const distance=Math.hypot(x-point.x,z-point.z);
  if(distance<=1.55&&world.canWalk(x,z))candidates.push({x,z,distance});
 }
 candidates.sort((a,b)=>a.distance-b.distance);
 return candidates.some(target=>{
  const steps=Math.max(1,Math.ceil(target.distance/.18));let previous=world.heightAt(point.x,point.z);
  for(let i=0;i<=steps;i++){
   const f=i/steps,x=point.x+(target.x-point.x)*f,z=point.z+(target.z-point.z)*f,y=world.heightAt(x,z);
   if(!world.canWalk(x,z)||!Number.isFinite(y)||Math.abs(y-previous)>.23)return false;
   previous=y;
  }
  return true;
 });
}

// Own-car proximity is expected at a door. Measure room on the street side,
// considering all other solid furniture, standing-height roofs and people.
function exitStreetClearance(world,car,point){
 let clearance=Math.min(point.x-PLAYABLE_BOUNDS.minX,PLAYABLE_BOUNDS.maxX-point.x,point.z-PLAYABLE_BOUNDS.minZ,PLAYABLE_BOUNDS.maxZ-point.z)-.35;
 const floor=world.heightAt(point.x,point.z),head=floor+(world.player?.userData?.height??1.78);
 for(const c of [...(world.colliders??[]),...(world.cameraOccluders??[])]){
  if(c===car.collider||c.carId===car.id||c.solid===false||(c.y??0)>=head||(c.height??11)<=floor)continue;
  const dx=Math.max(c.x-.35-point.x,0,point.x-c.X-.35),dz=Math.max(c.z-.35-point.z,0,point.z-c.Z-.35);
  clearance=Math.min(clearance,Math.hypot(dx,dz));
 }
 for(const h of world.hazards??[])clearance=Math.min(clearance,Math.hypot(point.x-h.x,point.z-h.z)-h.r-.35);
 for(const n of world.npcs??[])if(n.group.visible)clearance=Math.min(clearance,Math.hypot(point.x-n.group.position.x,point.z-n.group.position.z)-.76);
 return clearance;
}

/** Prefer a connected, open door-side exit. A parked AABB stays conservative
 * for walkers, and every selected point still has a swept route from the seat.
 * Door candidates are inexpensive in the common case; longer searches run
 * only when both nearby sides are obstructed or uncomfortably narrow.
 */
export function findCarDismount(world,car,{fallback=null,wide=false}={}){
 updateCarCollider(car);const p=car.group.position,pose={x:p.x,z:p.z,yaw:car.group.rotation.y},d=car.definition;
 const seen=new Set();let best=null;
 const inspect=q=>{
  const key=`${q.x.toFixed(6)},${q.z.toFixed(6)}`;if(seen.has(key))return;seen.add(key);
  if(!validExit(world,car,q)||!clearExitPath(world,car,q)||!hasExitNavigationEntry(world,q))return;
  const clearance=exitStreetClearance(world,car,q),distance=Math.hypot(q.x-p.x,q.z-p.z);
  if(!best||clearance>best.clearance+.02||(Math.abs(clearance-best.clearance)<=.02&&distance<best.distance))best={point:q,clearance,distance};
 };
 // Compare left/right before choosing; the previous left-first early return
 // was the source of the narrow strip trap beside the market warehouse.
 for(const side of[-1,1])inspect(localPoint(pose,side*(d.halfWidth+.52),d.seat?.z??0));
 if(best?.clearance>=.70)return best.point;
 for(const extra of[.52,.82,1.16]){
  for(const side of[-1,1])for(const along of[d.seat?.z??0,-.55,.7,-d.halfLength-.6,d.halfLength+.6])inspect(localPoint(pose,side*(d.halfWidth+extra),along));
  if(best?.clearance>=.70)return best.point;
 }
 if(best)return best.point;
 if(wide){
  for(let radius=2.8;radius<=7.6;radius+=.6){
   for(let i=0;i<32;i++)inspect({x:p.x+Math.cos(i*Math.PI/16)*radius,z:p.z+Math.sin(i*Math.PI/16)*radius});
   if(best)return best.point;
  }
  if(fallback)inspect({x:fallback.x,z:fallback.z});
 }
 return best?.point??null;
}

function batchDirectMeshes(group){
 const batches=new Map();
 for(const child of [...group.children])if(child.isMesh&&!child.userData.keepSeparate){
  child.updateMatrix();const geometry=child.geometry.index?child.geometry.toNonIndexed():child.geometry.clone();geometry.applyMatrix4(child.matrix);
  const list=batches.get(child.material)??[];list.push({child,geometry});batches.set(child.material,list);
 }
 for(const[material,list]of batches){const geometry=mergeGeometries(list.map(v=>v.geometry),false);if(geometry){const m=new THREE.Mesh(geometry,material);m.receiveShadow=true;group.add(m);for(const{child}of list)group.remove(child);}for(const{geometry}of list)geometry.dispose();}
}

function buildCar(world,definition){
 const d=definition,van=d.type==='van',g=new THREE.Group();g.name=`晴川里 · ${d.name}`;g.position.set(d.x,world.heightAt(d.x,d.z),d.z);g.rotation.y=d.yaw;world.scene.add(g);
 const mat=(color,opts={})=>world.mat(color,{roughness:.7,...opts});
 const paint=mat(d.paint),cream=mat('#f1e2ba'),trim=mat('#47655e'),rubber=mat('#39463f'),chrome=mat('#bbc9b8',{metalness:.28,roughness:.4}),black=mat('#31433d'),seatMat=mat('#8a7760'),rear=mat('#c67556',{emissive:'#4c1509',emissiveIntensity:.2}),lamp=mat('#ffe8af',{emissive:'#d2a853',emissiveIntensity:.15});
 const glass=new THREE.MeshStandardMaterial({color:'#b1d6cb',roughness:.2,metalness:.03,transparent:true,opacity:.23,depthWrite:false,side:THREE.DoubleSide});
 const roofMaterial=new THREE.MeshStandardMaterial({color:van?'#e7dcc0':d.paint,roughness:.7,transparent:true,opacity:1,depthWrite:true});
 const mesh=(geo,material,at=[0,0,0],parent=g,rotation)=>{const m=new THREE.Mesh(geo,material);m.position.set(...at);if(rotation)m.rotation.set(...rotation);m.receiveShadow=true;parent.add(m);return m;};
 const box=(size,material,at,parent=g,radius=.035)=>mesh(radius?new RoundedBoxGeometry(...size,2,Math.min(radius,...size.map(n=>n*.3))):new THREE.BoxGeometry(...size),material,at,parent);
 const rod=(a,b,r,material,parent=g)=>{const p=new THREE.Vector3(...a),q=new THREE.Vector3(...b),delta=q.clone().sub(p);const m=mesh(new THREE.CylinderGeometry(r,r,delta.length(),8),material,p.add(q).multiplyScalar(.5).toArray(),parent);m.quaternion.setFromUnitVectors(UP,delta.normalize());return m;};
 const bodyHalfWidth=d.bodyHalfWidth??d.halfWidth,w=bodyHalfWidth*2-.12,length=d.halfLength*2-.12;
 box([w,.16,length-.24],black,[0,.27,0]);box([w,.54,length],paint,[0,.59,0],g,.10);
 box([w+.035,.13,length-.17],cream,[0,.44,0],g,.04);
 box([w+.08,.14,.14],chrome,[0,.46,d.halfLength-.015]);box([w+.08,.14,.14],chrome,[0,.46,-d.halfLength+.015]);
 box([w-.12,.22,van?.52:1.0],paint,[0,van?1.0:.90,van?1.78:1.30],g,.08);
 // Open window apertures, real pillars and translucent windscreens expose the driver.
 const cabinRear=van?-1.70:-1.15,cabinFront=van?1.47:.86,roofY=van?1.89:1.63,windowBottom=van?1.02:.94;
 box([w-.09,.10,cabinFront-cabinRear+.08],roofMaterial,[0,roofY,(cabinRear+cabinFront)/2],g,.06);
 for(const side of[-1,1]){
  const x=side*(w/2-.025);
  for(const z of[cabinRear,van?.07:-.48,cabinFront])rod([x,windowBottom,z],[x*.90,roofY-.03,z-(z===cabinFront?.16:0)],.042,paint);
  rod([x*.90,roofY-.025,cabinRear],[x*.90,roofY-.025,cabinFront-.16],.032,paint);
  rod([x,windowBottom,cabinRear],[x,windowBottom,cabinFront],.028,chrome);
  box([.028,.46,van?1.06:.95],paint,[x,.79,van?.68:.12],g,.008);
  for(const z of[van?.05:-.48,cabinFront])box([.014,.50,.015],trim,[x+side*.012,.74,z],g,0);
  box([.045,.045,.18],chrome,[x+side*.024,windowBottom-.11,van?.18:-.32],g,.016);
  // Side mirrors have separate dark stems and inset reflective faces.
  rod([x,windowBottom+.14,cabinFront-.08],[side*(bodyHalfWidth+.11),windowBottom+.18,cabinFront-.03],.019,black);
  box([.14,.13,.25],paint,[side*(bodyHalfWidth+.09),windowBottom+.18,cabinFront-.015],g,.025);
  box([.012,.092,.18],chrome,[side*(bodyHalfWidth+.167),windowBottom+.18,cabinFront-.015],g,.009);
  if(van){
   box([.036,.90,1.59],paint,[x,1.32,-.88],g,.025);
   box([.012,.36,.81],glass,[x+side*.023,1.53,-.76],g,.03);
   box([.012,.055,1.45],cream,[x+side*.025,1.18,-.87],g,.01);
  }
 }
 for(const z of[cabinRear,cabinFront-.16])rod([-w*.45,roofY-.025,z],[w*.45,roofY-.025,z],.029,paint);
 const windshield=box([w-.18,roofY-windowBottom-.03,.019],glass,[0,(roofY+windowBottom)/2,cabinFront-.06],g,.008);windshield.rotation.x=-.17;
 box([w-.20,roofY-windowBottom-.06,.018],glass,[0,(roofY+windowBottom)/2,cabinRear+.01],g,.008);
 if(!van)box([w-.08,.17,.65],paint,[0,.88,-1.51],g,.07);
 else{box([w-.1,.95,.06],paint,[0,1.1,-1.85],g,.02);box([.021,.94,.016],trim,[0,1.13,-1.887],g,0);box([.14,.06,.023],chrome,[.11,1.11,-1.89]);}
 box([w-.10,.18,.29],black,[0,van?1.09:.95,cabinFront-.17],g,.035);
 // Instrument binnacle, amber dials, dashboard radio and gear lever.
 box([.47,.18,.18],trim,[d.seat.x,van?1.20:1.065,cabinFront-.26]);
 for(const x of[-.10,.08])mesh(new THREE.CircleGeometry(.047,16),cream,[d.seat.x+x,van?1.205:1.07,cabinFront-.356],g,[0,Math.PI,0]);
 box([.18,.058,.018],chrome,[.18,van?1.12:.98,cabinFront-.323]);rod([.06,.69,.36],[.06,.92,.40],.015,chrome);box([.065,.055,.065],black,[.06,.94,.40]);
 for(const side of[-1,1]){
  const sx=side*.39,sz=d.seat.z;
  box([.57,.13,.59],seatMat,[sx,d.seat.y-.085,sz],g,.08);const back=box([.57,.52,.12],seatMat,[sx,d.seat.y+.20,sz-.31],g,.055);back.rotation.x=-.10;
  box([.31,.20,.10],seatMat,[sx,d.seat.y+.51,sz-.35],g,.055);
  for(const offset of[-.17,0,.17])box([.012,.32,.009],cream,[sx+offset,d.seat.y+.18,sz-.241],g,0);
 }
 if(!van){box([1.34,.14,.53],seatMat,[0,.70,-.94],g,.075);box([1.34,.48,.13],seatMat,[0,.91,-1.19],g,.06);}
 else for(const x of[-.42,.38]){box([.56,.42,.61],mat('#bda775'),[x,.90,-1.21],g,.025);for(const z of[-1.39,-1.05])box([.57,.035,.04],cream,[x,1.10,z]);}
 for(const x of[-.58,.58]){
  box([.35,van?.22:.16,.041],lamp,[x,van?.89:.70,d.halfLength-.042],g,.04);
  box([.15,.12,.025],rear,[x,.78,-d.halfLength+.039],g,.02);
  box([.15,.065,.029],mat('#d99e57'),[x,.62,d.halfLength-.031],g,.01);
 }
 box([.62,.15,.022],black,[0,.68,d.halfLength-.023],g,.02);
 for(const x of[-.21,-.07,.07,.21])box([.025,.10,.012],chrome,[x,.685,d.halfLength-.006],g,.004);
 for(const z of[-d.halfLength-.006,d.halfLength+.006]){
  const plate=world.label?.(van?'晴川 · 便民':'晴川 · 06',.54,.13,'#426f6a','#f5e2ac',g);
  if(plate){plate.position.set(0,.46,z);if(z<0)plate.rotation.y=Math.PI;plate.userData.keepSeparate=true;}
 }
 if(van&&world.label)for(const side of[-1,1]){const sign=world.label('晴川里 · 街坊便民',1.22,.22,'#689d8e','#f5e6bc',g);sign.position.set(side*(w/2+.021),1.14,-.87);sign.rotation.y=side*Math.PI/2;sign.userData.keepSeparate=true;}
 const steering=new THREE.Group();steering.position.set(d.wheel.x,d.wheel.y,d.wheel.z);steering.rotation.x=-.38;g.add(steering);
 mesh(new THREE.TorusGeometry(.205,.019,7,24),black,[0,0,0],steering);
 for(const angle of[0,Math.PI*2/3,Math.PI*4/3])rod([0,0,0],[Math.sin(angle)*.19,Math.cos(angle)*.19,0],.012,chrome,steering);
 box([.09,.08,.045],paint,[0,0,0],steering,.017);rod([d.wheel.x,d.wheel.y-.10,d.wheel.z+.08],[d.wheel.x,d.wheel.y,d.wheel.z],.028,black);
 const wheels=[],frontWheels=[];
 for(const side of[-1,1])for(const along of[-1,1]){
  const pivot=new THREE.Group();pivot.position.set(side*(w/2-.02),d.wheelRadius,d.wheelbase/2*along);g.add(pivot);const wheel=new THREE.Group();pivot.add(wheel);wheels.push(wheel);if(along>0)frontWheels.push(pivot);
  mesh(new THREE.CylinderGeometry(d.wheelRadius,d.wheelRadius,.19,24),rubber,[0,0,0],wheel,[0,0,Math.PI/2]);
  mesh(new THREE.CylinderGeometry(d.wheelRadius*.65,d.wheelRadius*.65,.198,20),chrome,[0,0,0],wheel,[0,0,Math.PI/2]);
  mesh(new THREE.CylinderGeometry(.081,.081,.205,16),paint,[0,0,0],wheel,[0,0,Math.PI/2]);
  for(let i=0;i<8;i++){const a=i*Math.PI/4;rod([side*.105,Math.sin(a)*.095,Math.cos(a)*.095],[side*.105,Math.sin(a)*.178,Math.cos(a)*.178],.023,cream,wheel);}
  for(const dz of[-.38,.38])box([.075,.09,.09],trim,[side*(w/2+.008),.54,d.wheelbase/2*along+dz]);
  batchDirectMeshes(wheel);
 }
 batchDirectMeshes(g);batchDirectMeshes(steering);
 g.userData.rig={wheels,frontWheels,steering,wheelRadius:d.wheelRadius,roofMaterial,glass,seat:{...d.seat},wheel:{...d.wheel}};
 g.userData.propId=d.id;g.userData.carId=d.id;g.userData.propType='car';g.userData.dynamic=true;
 g.traverse(o=>{if(o.isMesh){o.castShadow=false;o.userData.propId=d.id;o.userData.carId=d.id;o.userData.propType='car';}});
 const car={id:d.id,name:d.name,definition:d,group:g,collider:{}};updateCarCollider(car);world.colliders.push(car.collider);return car;
}

export function buildDriveableCars(world){return CAR_DEFINITIONS.map(d=>buildCar(world,d));}
export function updateCarRig(group,{distance=0,steering=0,driving=false}={}){
 const rig=group.userData.rig;if(!rig)return;
 for(const wheel of rig.wheels)wheel.rotation.x+=distance/rig.wheelRadius;
 for(const wheel of rig.frontWheels)wheel.rotation.y=steering;
 rig.steering.rotation.z=-steering*1.8;
 // The gently faded roof is a visibility cutaway, never a disappearing driver.
 rig.roofMaterial.opacity=driving?.15:1;rig.roofMaterial.depthWrite=!driving;
 rig.glass.opacity=driving?.13:.23;
}
