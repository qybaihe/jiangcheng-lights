import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {pickSceneTarget,isSceneTap} from '../src/scene-picking.js';
import {bendPoint,unbendPoint} from '../src/curved-world.js';
const box=(x,y,z,X,Y,Z)=>new THREE.Box3(new THREE.Vector3(x,y,z),new THREE.Vector3(X,Y,Z));
test('scene click picks the closest visible actual body and not through a thin wall',()=>{
 const ray=new THREE.Ray(new THREE.Vector3(0,1,6),new THREE.Vector3(0,0,-1));
 const person={id:'walker0',kind:'resident',box:box(-.3,0,-.3,.3,1.8,.3)};
 assert.equal(pickSceneTarget(ray,[person],[],null).id,'walker0');
 assert.equal(pickSceneTarget(ray,[person],[box(-2,0,3,2,4,3.02)],null),null);
 assert.equal(pickSceneTarget(ray,[{...person,visible:false}],[],null),null);
 const car={id:'prop-car-sedan',kind:'prop',box:box(-1,0,2,1,2,4)};
 assert.equal(pickSceneTarget(ray,[person,car],[],null).id,car.id);
});
test('picking follows the drawn curved street rather than unbent screen coordinates',()=>{
 const center={x:0,z:0},radius=145,origin=bendPoint(new THREE.Vector3(0,5,9),center,radius),target=bendPoint(new THREE.Vector3(0,1.0,-24),center,radius);
 const ray=new THREE.Ray(origin,target.sub(origin).normalize());
 const person={id:'walker2',kind:'resident',box:box(-.3,0,-24.3,.3,1.8,-23.7)};
 assert.equal(pickSceneTarget(ray,[person],[],{inverse:(p,out)=>unbendPoint(p,center,radius,out)}).id,person.id);
});
test('camera dragging, right-clicking and missing starts never initiate a greeting',()=>{
 assert.equal(isSceneTap({x:10,y:10,button:0},{clientX:12,clientY:12}),true);
 assert.equal(isSceneTap({x:10,y:10,button:0},{clientX:24,clientY:10}),false);
 assert.equal(isSceneTap({x:10,y:10,button:2},{clientX:10,clientY:10}),false);
 assert.equal(isSceneTap({x:10,y:10,button:0,dragged:true},{clientX:10,clientY:10}),false,'dragging out and back to the start is still not a click');
 assert.equal(isSceneTap(null,{clientX:10,clientY:10}),false);
});
