import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createWorldParticles,particlesMayMove,WORLD_PARTICLE_BUDGET} from '../src/world-particles.js';
const fakeWorld=()=>({scene:new THREE.Scene(),active:true,player:{position:new THREE.Vector3(1,0,21)},heightAt:()=>0,canWalk:()=>true,curvedWorld:{attach(object){object.userData.patched=true;}}});
test('street particles have a fixed two-draw budget and use the curved world',()=>{
 const world=fakeWorld(),fx=createWorldParticles(world),root=world.scene.children[0];
 assert.equal(root.children.length,2);assert.equal(root.userData.patched,true);assert.equal(root.children[0].material.forceSinglePass,true);
 assert.equal(root.children[0].count,WORLD_PARTICLE_BUDGET.leaves);
 assert.equal(root.children[1].count,WORLD_PARTICLE_BUDGET.motes+WORLD_PARTICLE_BUDGET.burst);
 for(const mesh of root.children){assert.equal(mesh.castShadow,false);assert.equal(mesh.receiveShadow,false);assert.equal(mesh.material.depthTest,true);}
 for(let i=0;i<240;i++)fx.update(1/60,{hidden:false});
 assert.equal(fx.stats().updates,240);assert.equal(root.children.length,2);assert.equal(fx.stats().maxDrawCalls,2);
 fx.dispose();assert.equal(world.scene.children.length,0);fx.dispose();
});
test('reduced motion, modals, inactive scene and background tabs freeze particles',()=>{
 for(const flag of ['reduced','blocked','suspended']){
  const world=fakeWorld(),fx=createWorldParticles(world);fx.update(.016,{hidden:false});world[flag]=true;fx.update(.016,{hidden:false});
  assert.equal(fx.stats().updates,1);assert.equal(fx.stats().visible,false);fx.dispose();
 }
 assert.equal(particlesMayMove({active:false}),false);assert.equal(particlesMayMove({active:true,hidden:true}),false);
 const world=fakeWorld(),fx=createWorldParticles(world);fx.update(.016,{hidden:true});assert.equal(fx.stats().updates,0);fx.dispose();
});
test('collection bursts expire, pause never accumulates a burst queue, disposal is final',()=>{
 const world=fakeWorld(),fx=createWorldParticles(world);fx.update(.016,{hidden:false});fx.pulse();assert.equal(fx.stats().burstActive,true);
 for(let i=0;i<80;i++)fx.update(.02,{hidden:false});assert.equal(fx.stats().burstActive,false);
 fx.pulse();fx.update(.1,{hidden:true});assert.equal(fx.stats().burstActive,false);
 fx.dispose();fx.update(1);fx.pulse();assert.equal(fx.stats().disposed,true);assert.equal(fx.stats().burstActive,false);
});


test('ordinary leaves return after the rain even when the narrative retains its checked flag',()=>{
 const world=fakeWorld(),fx=createWorldParticles(world),leaves=world.scene.children[0].children[0];
 const visibleCount=()=>{const data=leaves.instanceMatrix.array;let count=0;for(let i=0;i<leaves.count;i++)if(Math.hypot(data[i*16],data[i*16+1],data[i*16+2])>.001)count++;return count;};
 fx.update(.016,{hidden:false});assert.ok(visibleCount()>0);
 world.rainy=true;fx.update(.016,{hidden:false});assert.equal(visibleCount(),0);
 world.ended=true;fx.update(.016,{hidden:false});assert.ok(visibleCount()>0);fx.dispose();
});
