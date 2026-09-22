import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {PLAYABLE_BOUNDS,CORE_BOUNDS,WUHAN_EXTENSION_BOUNDS,WUHAN_DISTRICT_STOPS,WUHAN_DRIVE_LOOP,WUHAN_BUILDINGS,WUHAN_REGIONS,isInsidePlayableBounds,nearestWuhanStop,wuhanDistrictRegionAt} from '../src/wuhan-district-layout.js';
import {MAP_BOUNDS,mapPoint,pathMarkup,streetMapArtwork} from '../src/street-map.js';
import {POIS,START,SAVE_KEY,freshState,loadState} from '../src/story.js';
import {normalizeCarProgress,CAR_IDS,CAR_DEFAULTS} from '../src/car-progress.js';
import {normalizePropProgress} from '../src/prop-progress.js';
import {World,findWalkPath,walkableSegment} from '../src/world.js';
import {canDriveCarPose,CAR_DEFINITIONS,findCarDismount,updateCarCollider} from '../src/driveable-cars.js';
import {canCyclePose} from '../src/world-interactions.js';

const ORIGINAL_POIS={shop:[-9.5,17],granny:[-17,.7],chef:[10,12],dock:[22,-20],community:[12,-3],box:[-28,15],water:[25,24],battery:[-27,-13],riskWater:[4,-23],riskCable:[26,1],clock:[-23,-22],noodles:[13,21],ferry:[29,-15],bridge:[0,-18],brick:[-25,5],photo:[-8,26]};
function fixture(){
 const world=Object.create(World.prototype);
 Object.assign(world,{colliders:WUHAN_BUILDINGS.filter(b=>b.collide!==false).map(b=>({x:b.x-b.w/2,X:b.x+b.w/2,z:b.z-b.d/2,Z:b.z+b.d/2,height:b.h})),hazards:[],cameraOccluders:[],npcs:[]});
 return world;
}
const pose=(x,z,yaw=Math.PI/2)=>({x,z,yaw});
const samePoint=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z)<1e-9;

test('east-side extension preserves all original quest/lore coordinates and start',()=>{
 assert.deepEqual(START,{x:1,z:21});
 for(const [id,[x,z]]of Object.entries(ORIGINAL_POIS)){const p=POIS.find(p=>p.id===id);assert.ok(p,id);assert.equal(p.x,x,id);assert.equal(p.z,z,id);}
 assert.deepEqual(CORE_BOUNDS,{minX:-37,maxX:37,minZ:-24.3,maxZ:31});
 assert.equal(PLAYABLE_BOUNDS.minX,CORE_BOUNDS.minX);assert.equal(PLAYABLE_BOUNDS.minZ,CORE_BOUNDS.minZ);assert.equal(PLAYABLE_BOUNDS.maxZ,CORE_BOUNDS.maxZ);
 assert.equal(WUHAN_EXTENSION_BOUNDS.minX,CORE_BOUNDS.maxX);assert.ok(PLAYABLE_BOUNDS.maxX>=100);
 assert.ok((PLAYABLE_BOUNDS.maxX-PLAYABLE_BOUNDS.minX)/(CORE_BOUNDS.maxX-CORE_BOUNDS.minX)>1.8);
});

test('single playable boundary rejects nonfinite coordinates and applies footprint margins',()=>{
 for(const p of [START,{x:37.01,z:23},{x:100,z:0}])assert.ok(isInsidePlayableBounds(p.x,p.z));
 for(const [x,z]of [[NaN,0],[Infinity,0],[0,-Infinity],[PLAYABLE_BOUNDS.maxX+.01,0],[PLAYABLE_BOUNDS.minX-.01,0],[0,PLAYABLE_BOUNDS.minZ-.01],[0,PLAYABLE_BOUNDS.maxZ+.01]])assert.equal(isInsidePlayableBounds(x,z),false);
 assert.equal(isInsidePlayableBounds(PLAYABLE_BOUNDS.maxX,0,.35),false);
 assert.equal(isInsidePlayableBounds(PLAYABLE_BOUNDS.maxX-.35,0,.35),true);
 assert.equal(isInsidePlayableBounds(0,0,-.1),false);
});

test('new stop identities, memories and spatial regions are distinct and legible',()=>{
 assert.equal(WUHAN_DISTRICT_STOPS.length,5);assert.equal(new Set(WUHAN_DISTRICT_STOPS.map(s=>s.id)).size,5);
 assert.equal(new Set(WUHAN_DISTRICT_STOPS.map(s=>s.memoryId)).size,5);assert.ok(WUHAN_REGIONS.length>=4);
 for(const s of WUHAN_DISTRICT_STOPS){
  assert.ok(s.x>CORE_BOUNDS.maxX&&isInsidePlayableBounds(s.x,s.z,.35));assert.ok(s.name&&s.label&&s.routeHint&&s.hint&&s.lines.length>=3,s.id);
  assert.ok(s.lines.every(l=>typeof l.who==='string'&&typeof l.text==='string'&&l.text.length));
  assert.equal(nearestWuhanStop(s.x,s.z)?.id,s.id);assert.ok(wuhanDistrictRegionAt(s.x,s.z),s.id);
 }
 assert.equal(nearestWuhanStop(START.x,START.z),null);assert.equal(wuhanDistrictRegionAt(START.x,START.z),null);
});

test('new building footprints leave old POIs, eastern road joins, and every new stop open',()=>{
 const w=fixture();
 for(const p of [...POIS,...WUHAN_DISTRICT_STOPS])assert.ok(w.canWalk(p.x,p.z),p.id);
 for(const z of [-20,23])assert.ok(walkableSegment(w,{x:35,z},{x:103,z}),'east entry '+z);
 const origin={x:35,z:23};
 for(const stop of WUHAN_DISTRICT_STOPS){const path=findWalkPath(w,origin,stop);assert.ok(path?.length>=2,stop.id);for(let i=1;i<path.length;i++)assert.ok(walkableSegment(w,path[i-1],path[i]),stop.id+' segment '+i);}
});

test('drive loop closes and both real car footprints and bicycle sweep cross former eastern limit',()=>{
 const w=fixture();assert.ok(WUHAN_DRIVE_LOOP.length>=8);assert.ok(samePoint(WUHAN_DRIVE_LOOP[0],WUHAN_DRIVE_LOOP.at(-1)));
 assert.ok(Math.max(...WUHAN_DRIVE_LOOP.map(p=>p.x))>=95);
 for(const z of [-20,23]){
  for(const definition of CAR_DEFINITIONS)assert.ok(canDriveCarPose(w,pose(35,z),pose(100,z),definition),definition.id+' east join '+z);
  assert.ok(canCyclePose(w,pose(35,z),pose(100,z)),'bicycle east join '+z);
 }
 // The footprint, not its centre, must remain inside the new boundary.
 for(const definition of CAR_DEFINITIONS){assert.equal(canDriveCarPose(w,pose(103,23),pose(106,23),definition),false);assert.equal(canDriveCarPose(w,pose(99,-21,0),pose(99,-24,0),definition),false);}
 assert.equal(canCyclePose(w,pose(104,23),pose(106,23)),false);
});

test('new district keeps collision sweep against narrow obstacles and graded ground',()=>{
 const w=fixture();w.colliders.push({x:74.1,X:74.11,z:23.0,Z:23.01,height:3});
 assert.equal(canDriveCarPose(w,pose(71,23),pose(78,23)),false);assert.equal(canCyclePose(w,pose(71,23),pose(78,23)),false);
 assert.equal(walkableSegment(w,{x:71,z:23},{x:78,z:23}),false);
 const path=findWalkPath(w,{x:71,z:23},{x:78,z:23});assert.ok(path?.length>=3);
 for(let i=1;i<path.length;i++)assert.ok(walkableSegment(w,path[i-1],path[i]));
});

test('new region car exits land outside their own chassis without teleporting through walls',()=>{
 const w=fixture();
 for(const definition of CAR_DEFINITIONS)for(const yaw of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
  const group=new THREE.Group();group.position.set(98,.13,9);group.rotation.y=yaw;
  const car={id:definition.id,definition,group,collider:{}};updateCarCollider(car);w.colliders.push(car.collider);
  const exit=findCarDismount(w,car);assert.ok(exit,definition.id+'/'+yaw);assert.ok(w.canWalk(exit.x,exit.z));assert.ok(Math.hypot(exit.x-group.position.x,exit.z-group.position.z)<4);
  w.colliders.pop();
 }
});

test('old saves remain bit-for-bit located while new car and bicycle parking persists',()=>{
 const old=freshState();old.started=true;old.flags=['storyV3','received','radio'];old.position={x:13.5,z:20.5};old.cars=normalizeCarProgress();
 const restored=loadState({getItem:key=>key===SAVE_KEY?JSON.stringify(old):null});
 assert.deepEqual(restored.position,old.position);assert.deepEqual(restored.flags,old.flags);assert.deepEqual(restored.cars,old.cars);
 for(const p of [pose(54,23),pose(99,8,-1.2),pose(89,-15)]){
  const car=normalizeCarProgress({vehicles:{[CAR_IDS.sedan]:p}});assert.deepEqual(car.vehicles[CAR_IDS.sedan],p);
  const bike=normalizePropProgress({bikePosition:p,bicycleUnlocked:true});assert.deepEqual(bike.bikePosition,p);assert.equal(bike.bicycleUnlocked,true);
  const state={...old,position:{x:p.x,z:p.z},cars:car,props:bike};const again=loadState({getItem:()=>JSON.stringify(state)});
  assert.deepEqual(again.position,state.position);assert.deepEqual(again.cars,car);assert.deepEqual(again.props,bike);
 }
 assert.deepEqual(normalizeCarProgress({vehicles:{[CAR_IDS.sedan]:pose(200,0)}}).vehicles[CAR_IDS.sedan],CAR_DEFAULTS[CAR_IDS.sedan]);
 assert.equal(normalizePropProgress({bikePosition:pose(200,0)}).bikePosition,null);
});

test('full map includes new stops and original coordinates retain the same survey transform',()=>{
 assert.ok(MAP_BOUNDS.width>=1480);assert.equal(MAP_BOUNDS.height,640);assert.equal(MAP_BOUNDS.scale,10);assert.equal(MAP_BOUNDS.minX,-40);assert.equal(MAP_BOUNDS.minZ,-31);
 assert.deepEqual(mapPoint(START),{x:410,y:520});
 for(const p of [...POIS,...WUHAN_DISTRICT_STOPS,...WUHAN_DRIVE_LOOP]){const m=mapPoint(p);assert.ok(m.x>=0&&m.x<=MAP_BOUNDS.width&&m.y>=0&&m.y<=MAP_BOUNDS.height,p.id||JSON.stringify(p));}
 const artwork=streetMapArtwork('wuhan-test');for(const term of ['燕归','滨江','桥','渡'])assert.ok(artwork.includes(term),'mapped detail '+term);
 const path=pathMarkup({reachable:true,path:WUHAN_DRIVE_LOOP});assert.ok(path.includes('1390.0'),'loop reaches the far eastern map');
});
