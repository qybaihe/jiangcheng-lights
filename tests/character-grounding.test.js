import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createCharacter} from '../src/characters.js';
import {updateTownLife} from '../src/town-life.js';

function fixture(id,heading,heightAt){
  const actor=createCharacter(null,'#fff','#000',id==='player',id);actor.rotation.y=heading;
  const world={player:id==='player'?actor:new THREE.Group(),npcs:id==='player'?[]:[{id,group:actor}],active:true,suspended:false,blocked:false,reduced:false,walking:false,
    moveSpeed:0,movementDistance:0,heightAt,canWalk:()=>true,storyFlags:new Set(),playerMotion:{grounded:true,phase:'grounded',acceleration:0},callbacks:{}};
  const mesh=actor.userData.characterMesh,rig=actor.userData.rig,index=mesh.geometry.attributes.skinIndex;
  const feet=rig.ankles.map(bone=>{const slot=mesh.skeleton.bones.indexOf(bone),vertices=[];for(let i=0;i<index.count;i++)if(index.getX(i)===slot)vertices.push(i);return vertices;});
  function update(time){updateTownLife(world,1/120,time);actor.updateMatrixWorld(true);mesh.skeleton.update();}
  function clearances(){const p=new THREE.Vector3();return feet.map(vertices=>{
    let min=Infinity;for(const i of vertices){p.fromBufferAttribute(mesh.geometry.attributes.position,i);mesh.applyBoneTransform(i,p).applyMatrix4(mesh.matrixWorld);min=Math.min(min,p.y-heightAt(p.x,p.z));}return min;
  });}
  return {actor,world,rig,update,clearances};
}

for(const[id,heading]of[['player',0],['player',Math.PI],['player',Math.PI/2],['player',Math.PI/4],['granny',Math.PI/4],['community',-Math.PI/4]]){
  test(`${id} both rendered soles meet a 1:8 ramp at heading ${heading.toFixed(2)}`,()=>{
    const f=fixture(id,heading,(x,z)=>z/8);
    for(let i=0;i<240;i++)f.update(i/120);
    for(const[side,gap]of f.clearances().entries()){
      assert.ok(gap>=-.002&&gap<.003,`foot ${side}: rendered clearance ${(gap*1000).toFixed(2)}mm`);
    }
  });
}

test('each supporting shoe stays above the ramp through an actual moving stride',()=>{
  const f=fixture('player',Math.PI/4,(x,z)=>z/8),speed=3.4;f.world.walking=true;f.world.moveSpeed=speed;
  let checked=0;
  for(let i=0;i<300;i++){
    f.world.movementDistance=speed/120;f.actor.position.x+=Math.sin(Math.PI/4)*speed/120;f.actor.position.z+=Math.cos(Math.PI/4)*speed/120;f.actor.position.y=f.world.heightAt(f.actor.position.x,f.actor.position.z);f.update(i/120);
    if(i%5!==0)continue;
    for(const[side,gap]of f.clearances().entries()){
      assert.ok(gap>=-.002,`moving foot ${side} penetrates slope by ${-gap}m`);
      if(f.actor.userData.townLife.feet[side].planted){checked++;assert.ok(gap<.003,`supporting foot ${side} floats ${gap}m`);}
    }
  }
  assert.ok(checked>20);
});

test('a step discontinuity does not twist ankles into a false steep slope',()=>{
  const f=fixture('player',0,(x,z)=>z>.055?.12:0);
  for(let i=0;i<240;i++)f.update(i/120);
  for(const ankle of f.rig.ankles)assert.ok(Math.abs(ankle.rotation.z)<.001);
  for(const gap of f.clearances())assert.ok(gap>=-.002&&gap<.003);
});
