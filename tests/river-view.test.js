import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createCurvedWorld,STREET_RADIUS,RIVER_VIEW_RADIUS} from '../src/curved-world.js';

test('river horizon opens only for rowing and shader/inverse use the same radius',()=>{
 const world={player:{position:new THREE.Vector3(42,0,-38.3)},cameraMode:'street',scene:new THREE.Scene(),static:new THREE.Group(),propInteractions:{mode:'walk'}};
 world.scene.add(world.static);const curve=createCurvedWorld(world),material=new THREE.MeshBasicMaterial();curve.patchMaterial(material);
 const shader={uniforms:{},vertexShader:'#include <project_vertex>'};material.onBeforeCompile(shader,{});
 assert.equal(curve.radius,STREET_RADIUS);
 const point=new THREE.Vector3(95,0,-52),onFoot=curve.point(point,new THREE.Vector3());
 world.propInteractions.mode='boat';curve.update();
 assert.equal(curve.radius,RIVER_VIEW_RADIUS);assert.equal(shader.uniforms.streetBendRadius.value,RIVER_VIEW_RADIUS);
 const afloat=curve.point(point,new THREE.Vector3());assert.ok(afloat.y>onFoot.y,'wider river horizon has less falloff');
 assert.ok(curve.inverse(afloat,new THREE.Vector3()).distanceTo(point)<1e-8);
 world.cameraMode='overview';curve.update();assert.equal(curve.enabled,false);assert.ok(curve.point(point,new THREE.Vector3()).equals(point));
 world.cameraMode='street';world.propInteractions.mode='walk';curve.update();assert.equal(curve.radius,STREET_RADIUS);assert.equal(shader.uniforms.streetBendRadius.value,STREET_RADIUS);
 assert.deepEqual(world.player.position.toArray(),[42,0,-38.3],'rendering does not move the player');
});
