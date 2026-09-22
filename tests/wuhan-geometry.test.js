import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {World,findWalkPath,walkableSegment} from '../src/world.js';
import {addWuhanDistrict} from '../src/wuhan-district.js';
import {WUHAN_DISTRICT_STOPS,WUHAN_DRIVE_LOOP} from '../src/wuhan-district-layout.js';
import {CAR_DEFINITIONS,canDriveCarPose,findCarDismount,updateCarCollider} from '../src/driveable-cars.js';
import {canCyclePose} from '../src/world-interactions.js';

let cached;
function district(){
 if(cached)return cached;
 const w=Object.create(World.prototype);
 Object.assign(w,{static:new THREE.Group(),scene:new THREE.Scene(),materials:new Map(),colliders:[],cameraOccluders:[],npcs:[],hazards:[],reduced:false,suspended:false});w.scene.add(w.static);
 // Keep actual geometry and collision definitions. Only texture rasterization
 // and cloth canopy drawing are removed; the canopy's real clearance is kept.
 w.mat=(color,opts={})=>{const key=color+JSON.stringify(opts);if(!w.materials.has(key))w.materials.set(key,new THREE.MeshStandardMaterial({color,...opts}));return w.materials.get(key);};
 w.label=(text,width,height,bg,fg,parent=w.static)=>{const m=w.mesh(new THREE.PlaneGeometry(width,height),w.mat(bg||'#ffffff'),0,0,0,parent,false);m.userData.testText=text;return m;};
 w.canopy=(x,z,width=7,depth=2.8,color,height=3.5)=>{w.cameraOccluders.push({x:x-width/2,X:x+width/2,z:z-depth/2,Z:z+depth/2,y:height-.5,height});return w.box(width,.065,depth,color,x,height,z);};
 addWuhanDistrict(w);w.scene.updateMatrixWorld(true);cached=w;return w;
}

test('actual expanded buildings, props, bridge piers and trees leave all five observed entrances walkable',()=>{
 const w=district();assert.ok(w.wuhanDistrict.addedColliders>20);assert.ok(w.wuhanDistrict.groundTriangles>7000);
 for(const stop of WUHAN_DISTRICT_STOPS){assert.ok(w.canWalk(stop.x,stop.z),stop.id);const path=findWalkPath(w,{x:35,z:23},stop);assert.ok(path,stop.id);for(let i=1;i<path.length;i++)assert.ok(walkableSegment(w,path[i-1],path[i]),stop.id);}
});

test('both complete car chassis and bicycle swept volumes traverse every new district loop leg',()=>{
 const w=district();let legs=0;
 for(let i=1;i<WUHAN_DRIVE_LOOP.length;i++){
  const a=WUHAN_DRIVE_LOOP[i-1],b=WUHAN_DRIVE_LOOP[i];if(Math.max(a.x,b.x)<35)continue;
  const yaw=Math.atan2(b.x-a.x,b.z-a.z),from={...a,yaw},to={...b,yaw};
  for(const d of CAR_DEFINITIONS)assert.ok(canDriveCarPose(w,from,to,d),d.id+' '+JSON.stringify([a,b]));
  assert.ok(canCyclePose(w,from,to),'bicycle '+JSON.stringify([a,b]));legs++;
 }
 assert.ok(legs>=6);
});

test('actual bridge roof has continuous six metre clearance and new paving supports foot level',()=>{
 const w=district(),down=new THREE.Vector3(0,-1,0),up=new THREE.Vector3(0,1,0);let samples=0;
 for(const z of [-20,3,23])for(let x=70.5;x<=81.5;x+=.5){
  const hits=new THREE.Raycaster(new THREE.Vector3(x,.14,z),up).intersectObject(w.static,true).filter(h=>h.point.y>1);
  if(x>=71&&x<=81){assert.ok(hits.length,'bridge ray '+x+'/'+z);assert.ok(hits[0].point.y-.13>=6.1,'bridge underside at '+x+'/'+z);}
 }
 for(let x=40;x<=104;x+=2)for(const z of [-20,3,23]){
  if(!w.canWalk(x,z))continue;
  const ground=new THREE.Raycaster(new THREE.Vector3(x,.40,z),down).intersectObject(w.static,true)[0];assert.ok(ground,'ground '+x+'/'+z);
  assert.ok(Math.abs(ground.point.y-w.heightAt(x,z))<.045,'walk height '+x+'/'+z);samples++;
 }
 assert.ok(samples>70);
});


test('parking beside the market selects an open connected door, not the legal 30cm navigation trap',()=>{
 const w=district(),definition=CAR_DEFINITIONS[0],group=new THREE.Group();
 group.position.set(93.15644392316745,.13,23.8);group.rotation.y=Math.PI/2;
 const car={id:definition.id,definition,group,collider:{}};updateCarCollider(car);w.colliders.push(car.collider);
 try{
  const oldExit={x:93.11644392316745,z:25.37};
  assert.ok(w.canWalk(oldExit.x,oldExit.z),'the reported strip really is a legal standing point');
  assert.equal(findWalkPath(w,oldExit,WUHAN_DISTRICT_STOPS[0]),null,'old left-first exit has no integer navigation entry');
  const exit=findCarDismount(w,car);assert.ok(exit,'a safe alternative door exists');
  assert.ok(exit.z<23.8,'select the open street side, not the warehouse side');
  assert.ok(w.canWalk(exit.x,exit.z));
  for(const stop of WUHAN_DISTRICT_STOPS){
   const path=findWalkPath(w,exit,stop);assert.ok(path,'reachable after dismount: '+stop.id);
   for(let i=1;i<path.length;i++)assert.ok(walkableSegment(w,path[i-1],path[i]),'walkable '+stop.id);
  }
  assert.ok(!w.canWalk(car.group.position.x,car.group.position.z),'the parked car is still a solid obstacle');
 }finally{w.colliders.splice(w.colliders.indexOf(car.collider),1);}
});
