import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {canDriveCarPose,buildDriveableCars,findCarDismount,updateCarCollider,updateCarRig,CAR_DEFINITIONS} from '../src/driveable-cars.js';
import {WorldInteractions} from '../src/world-interactions.js';
import {createCharacter} from '../src/characters.js';
import {PLAYABLE_BOUNDS,isInsidePlayableBounds} from '../src/wuhan-district-layout.js';
const pose=(x=0,z=0,yaw=0)=>({x,z,yaw});
function world(){const w={scene:new THREE.Group(),static:new THREE.Group(),heightAt:()=>.13,colliders:[],cameraOccluders:[],hazards:[],npcs:[],mat:color=>new THREE.MeshStandardMaterial({color})};w.canWalk=(x,z)=>isInsidePlayableBounds(x,z,.35)&&!w.colliders.some(c=>x>c.x-.35&&x<c.X+.35&&z>c.z-.35&&z<c.Z+.35);return w;}
function car(w){const d=CAR_DEFINITIONS[0],group=new THREE.Group();group.position.y=.13;const c={id:d.id,definition:d,group,collider:{}};updateCarCollider(c);w.colliders.push(c.collider);return c;}

test('car full-chassis sweep blocks thin pole, reverse obstacle and rotating bumper arc',()=>{
 const w=world();assert(canDriveCarPose(w,pose(),pose(0,4)));
 w.colliders=[{x:.73,X:.738,z:2.4,Z:2.405}];assert(!canDriveCarPose(w,pose(),pose(0,4)),'off-center thin pole');
 w.colliders=[{x:-.1,X:.1,z:-3,Z:-2.99}];assert(!canDriveCarPose(w,pose(),pose(0,-4)),'reverse swept bumper');
 w.colliders=[{x:1.70,X:1.73,z:-.02,Z:.02}];assert(canDriveCarPose(w,pose(),pose()));assert(!canDriveCarPose(w,pose(),pose(0,0,Math.PI/2)),'turning arc');
});

test('car footprint includes both boundaries, water hazards and visible neighbours',()=>{
 const w=world();assert(!canDriveCarPose(w,pose(0,-21),pose(0,-23)));
 assert(!canDriveCarPose(w,pose(PLAYABLE_BOUNDS.maxX-2,0,Math.PI/2),pose(PLAYABLE_BOUNDS.maxX-1.9,0,Math.PI/2)));
 w.hazards=[{x:1.05,z:2.8,r:.4}];assert(!canDriveCarPose(w,pose(),pose(0,2)));
 w.hazards=[];w.npcs=[{group:{visible:true,position:{x:.90,z:2.5}}}];assert(!canDriveCarPose(w,pose(),pose(0,1)));
 w.npcs[0].group.visible=false;assert(canDriveCarPose(w,pose(),pose(0,1)));
});

test('cars allow continuous gentle ramps but reject stair straddling, climb and low roofs',()=>{
 const w=world();w.heightAt=(x,z)=>.13+z*.125;assert(canDriveCarPose(w,pose(),pose(0,.6)));
 w.heightAt=(x,z)=>z>1?.25:.13;assert(!canDriveCarPose(w,pose(),pose()),'a stationary chassis cannot straddle a stair');
 w.heightAt=(x,z)=>z>2.02?.25:.13;assert(!canDriveCarPose(w,pose(),pose(0,.45)),'do not climb a 12cm stair');
 w.heightAt=()=>.13;w.cameraOccluders=[{x:-2,X:2,z:2,Z:3,y:1.65,height:2}];assert(!canDriveCarPose(w,pose(),pose(0,1)));
 w.cameraOccluders[0].solid=false;assert(canDriveCarPose(w,pose(),pose(0,1)));
});

test('parked cars are obstacles while only a supplied own collider is ignored',()=>{
 const w=world(),c=car(w);assert(!canDriveCarPose(w,pose(),pose()));assert(canDriveCarPose(w,pose(),pose(),{ignore:c.collider}));
 const other={x:-.8,X:.8,z:3,Z:6,kind:'car',carId:'other-car'};w.colliders.push(other);assert(!canDriveCarPose(w,pose(),pose(0,2),{carId:c.id}));
});

test('safe exits lie outside parked AABB at every heading, on flat land, away from neighbours',()=>{
 const w=world(),c=car(w);
 for(let i=0;i<24;i++){c.group.rotation.y=i*Math.PI/12;const p=findCarDismount(w,c);assert(p,'exit at heading '+i);assert(w.canWalk(p.x,p.z));const b=c.collider;assert(!(p.x>b.x-.35&&p.x<b.X+.35&&p.z>b.z-.35&&p.z<b.Z+.35));}
 c.group.rotation.y=0;const first=findCarDismount(w,c);w.npcs=[{group:{visible:true,position:first}}];const second=findCarDismount(w,c);assert(second);assert(Math.hypot(first.x-second.x,first.z-second.z)>=.76);
 w.canWalk=()=>false;assert.equal(findCarDismount(w,c,{wide:true,fallback:{x:5,z:5}}),null,'invalid fallback is never blindly used');
});

test('dismount does not cross enclosing walls to an otherwise valid destination',()=>{
 const w=world(),c=car(w);w.colliders.push({x:-1.20,X:-1.1,z:-2.3,Z:2.3},{x:1.1,X:1.2,z:-2.3,Z:2.3},{x:-1.2,X:1.2,z:2.2,Z:2.3},{x:-1.2,X:1.2,z:-2.3,Z:-2.2});
 assert.equal(findCarDismount(w,c),null);assert.equal(findCarDismount(w,c,{wide:true}),null);
 assert.equal(findCarDismount(w,c,{wide:true,fallback:{x:5,z:5}}),null,'fallback cannot teleport through an enclosing wall');
});

test('dismount compares both usable doors and prefers the side with room to continue walking',()=>{
 const w=world(),c=car(w);w.colliders.push({x:-2.40,X:-2.35,z:-4,Z:4,height:3});
 // Left of the car has a reachable grid point, but little space beyond the
 // door; right of it opens onto the street. A first-valid exit is not enough.
 assert(w.canWalk(-2,0));
 const exit=findCarDismount(w,c);assert(exit);assert(exit.x>0,'open right-hand door is preferred');
 assert(!w.canWalk(0,0),'own car collider remains active after exit search');
});

test('detailed cars are dynamic pickable rigs, batch fixed meshes and never cast cached shadows',()=>{
 const w=world(),cars=buildDriveableCars(w);assert.equal(cars.length,2);
 for(const car of cars){let meshes=0;assert.equal(car.group.parent,w.scene);car.group.traverse(o=>{if(o.isMesh){meshes++;assert.equal(o.castShadow,false);assert.equal(o.userData.propId,car.id);}});assert(meshes<65,'bounded meshes: '+meshes);const r=car.group.userData.rig;assert.equal(r.wheels.length,4);assert.equal(r.frontWheels.length,2);updateCarRig(car.group,{distance:r.wheelRadius,steering:.3,driving:true});assert(r.wheels.every(w=>Math.abs(w.rotation.x-1)<1e-8));assert(r.frontWheels.every(w=>w.rotation.y===.3));assert(r.roofMaterial.opacity<.3);updateCarRig(car.group);assert.equal(r.roofMaterial.opacity,1);}
});

test('driver sits above the seat and both hands remain on steering grips under turning',()=>{
 for(const definition of CAR_DEFINITIONS){const w=world();const cars=buildDriveableCars(w),car=cars.find(c=>c.id===definition.id),d=car.definition,p=createCharacter(null,'#fff','#000',true,'player');w.player=p;const local=new THREE.Vector3(d.seat.x,0,d.seat.z).applyAxisAngle(new THREE.Vector3(0,1,0),car.group.rotation.y);p.position.copy(car.group.position).add(local);p.rotation.y=car.group.rotation.y;
 const ctrl=Object.create(WorldInteractions.prototype);Object.assign(ctrl,{world:w,cars,currentId:car.id,mode:'car',paper:{visible:false},restingPaper:{visible:true}});
 for(const steering of[-.4,0,.4]){updateCarRig(car.group,{steering,driving:true});ctrl.pose(0,0);p.updateMatrixWorld(true);car.group.updateMatrixWorld(true);for(let i=0;i<2;i++){const target=car.group.userData.rig.steering.localToWorld(new THREE.Vector3((i?1:-1)*.188,.058,-.007)),hand=p.userData.rig.hands[i].getWorldPosition(new THREE.Vector3());assert(hand.distanceTo(target)<.015,'grip deviation '+hand.distanceTo(target));}assert(Math.abs(p.userData.rig.root.position.y+p.userData.rig.hipHeight-d.seat.y)<1e-9);}
 }
});

function drivingController(){
 const w=world();w.player=createCharacter(null,'#fff','#000',true,'player');Object.assign(w,{active:true,blocked:false,suspended:false,keys:{},path:[],callbacks:{},setPosition(p){this.player.position.set(p.x,this.heightAt(p.x,p.z),p.z);}});
 const cars=buildDriveableCars(w),c=Object.create(WorldInteractions.prototype);Object.assign(c,{world:w,cars,currentId:cars[0].id,mode:'car',carSpeed:0,carSteering:0,paperEdition:'beforeRain',paper:{visible:false},restingPaper:{visible:true}});c.removeCarCollider(cars[0]);return {w,c,car:cars[0]};
}

test('WASD drives real wheel/steering state with speed limit, reverse and immediate map braking',()=>{
 const {w,c,car}=drivingController(),before=car.group.position.clone();w.keys.w=true;
 for(let i=0;i<180;i++)c.update(1/60,i/60);assert(c.carSpeed>7.7&&c.carSpeed<7.8);assert(car.group.position.distanceTo(before)>18);assert(car.group.userData.rig.wheels[0].rotation.x>50);
 w.keys.a=true;const yaw=car.group.rotation.y;for(let i=0;i<20;i++)c.update(1/60,3+i/60);assert(car.group.rotation.y>yaw+.15);assert(car.group.userData.rig.frontWheels.every(wheel=>wheel.rotation.y>.3));
 w.blocked=true;const held=car.group.position.clone();c.update(1/60,4);assert.equal(c.carSpeed,0);for(let i=0;i<60;i++)c.update(1/60,4+i/60);assert(car.group.position.equals(held));assert.equal(c.mode,'car');
 w.blocked=false;w.keys={s:true};for(let i=0;i<150;i++)c.update(1/60,5+i/60);assert(c.carSpeed< -2.6&&c.carSpeed>=-2.7);
});

test('suspended modal safely parks, reveals full roof and restores walking motion',()=>{
 const {w,c,car}=drivingController();c.update(0,0);const safe=c.safeSavePosition();assert(safe&&w.canWalk(safe.x,safe.z));w.suspended=true;c.update(1/60,1);
 assert.equal(c.mode,'walk');assert.equal(c.carSpeed,0);assert(w.canWalk(w.player.position.x,w.player.position.z));assert.equal(w.playerMotion.grounded,true);assert(w.colliders.includes(car.collider));assert.equal(car.group.userData.rig.roofMaterial.opacity,1);
});
