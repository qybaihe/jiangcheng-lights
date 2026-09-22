import test from 'node:test';
import assert from 'node:assert/strict';
import {CAR_IDS,CAR_DEFAULTS,normalizeCarProgress} from '../src/car-progress.js';
import {WorldInteractions} from '../src/world-interactions.js';
import {buildDriveableCars} from '../src/driveable-cars.js';
import * as THREE from 'three';

test('car saves are independent, defensive, versioned and free from quest state',()=>{
 for(const bad of[undefined,null,[],false,42,{vehicles:[]}])assert.deepEqual(normalizeCarProgress(bad),{version:1,vehicles:CAR_DEFAULTS});
 const input={version:50,flags:['ending'],vehicles:{[CAR_IDS.sedan]:{x:1,z:2,yaw:Math.PI*5,cheat:true},unknown:{x:2,z:4,yaw:0}}};const saved=normalizeCarProgress(input);
 assert.equal(saved.version,1);assert.deepEqual(Object.keys(saved),['version','vehicles']);assert.deepEqual(Object.keys(saved.vehicles),Object.values(CAR_IDS));assert(Math.abs(Math.abs(saved.vehicles[CAR_IDS.sedan].yaw)-Math.PI)<1e-12);assert.equal(saved.vehicles[CAR_IDS.sedan].cheat,undefined);input.vehicles[CAR_IDS.sedan].x=100;assert.equal(saved.vehicles[CAR_IDS.sedan].x,1);
 for(const p of[{x:Infinity,z:1,yaw:0},{x:1,z:NaN,yaw:0},{x:1,z:1,yaw:Infinity},{x:1,z:1},{x:200,z:1,yaw:0},{x:1,z:-30,yaw:0}])assert.deepEqual(normalizeCarProgress({vehicles:{[CAR_IDS.sedan]:p}}).vehicles[CAR_IDS.sedan],CAR_DEFAULTS[CAR_IDS.sedan]);
});

test('restore validates physical footprint, retains distinct vehicles and never mounts',()=>{
 const w={scene:new THREE.Group(),heightAt:()=>.13,colliders:[],cameraOccluders:[],hazards:[],npcs:[],mat:color=>new THREE.MeshStandardMaterial({color})},controller=Object.create(WorldInteractions.prototype);Object.assign(controller,{world:w,mode:'walk',cars:buildDriveableCars(w),carSpeed:4});
 const saved={vehicles:{[CAR_IDS.sedan]:{x:0,z:0,yaw:1.1},[CAR_IDS.van]:{x:10,z:12,yaw:-1.3}}};controller.restoreCarProgress(saved);assert.equal(controller.mode,'walk');assert.equal(controller.carSpeed,0);assert.deepEqual(controller.getCarProgress(),normalizeCarProgress(saved));
 w.colliders.push({x:-.1,X:.1,z:-.1,Z:.1});const restored=controller.restoreCarProgress(saved);assert.deepEqual(restored.vehicles[CAR_IDS.sedan],CAR_DEFAULTS[CAR_IDS.sedan]);assert.equal(w.colliders.filter(c=>c.kind==='car').length,2);assert.equal(new Set(w.colliders.filter(c=>c.kind==='car').map(c=>c.carId)).size,2);
});
