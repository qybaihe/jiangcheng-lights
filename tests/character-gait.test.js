import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createCharacter} from '../src/characters.js';
import {updateTownLife} from '../src/town-life.js';

function scene(heightAt){
  const actor=createCharacter(null,'#fff','#000',true,'player');
  const world={player:actor,npcs:[],active:true,suspended:false,blocked:false,reduced:false,
    walking:true,moveSpeed:0,movementDistance:0,heightAt,canWalk:()=>true,storyFlags:new Set(),
    playerMotion:{grounded:true,phase:'grounded',acceleration:0},callbacks:{}};
  return {actor,world};
}

for(const speed of[3.4,5.6])for(const slope of[0,1/8])test(`long-leg stance stays planted at ${speed}m/s on ${slope?'a 1:8 slope':'level ground'}`,()=>{
  const {actor,world}=scene((x,z)=>z*slope),rig=actor.userData.rig;
  let stableSamples=0,maximumSlip=0,lowestPelvis=0,previous=[null,null];
  world.moveSpeed=speed;
  for(let frame=0;frame<600;frame++){
    const dt=1/120;world.movementDistance=speed*dt;actor.position.z+=world.movementDistance;
    actor.position.y=world.heightAt(actor.position.x,actor.position.z);
    updateTownLife(world,dt,frame*dt);actor.updateMatrixWorld(true);
    const life=actor.userData.townLife;
    for(let side=0;side<2;side++){
      const position=rig.ankles[side].getWorldPosition(new THREE.Vector3()),foot=life.feet[side];
      const stable=frame>240&&foot.planted&&Math.abs(foot.gaitPitch)<1e-6;
      if(stable&&previous[side]?.stable){stableSamples++;maximumSlip=Math.max(maximumSlip,position.distanceTo(previous[side].position));}
      previous[side]={position,stable};
    }
    lowestPelvis=Math.min(lowestPelvis,rig.root.position.y);
    assert.ok(rig.knees.every(knee=>Number.isFinite(knee.rotation.x)));
  }
  assert.ok(stableSamples>35,'must measure real, mid-stance intervals');
  assert.ok(maximumSlip<.002,`steady stance slipped ${(maximumSlip*1000).toFixed(3)}mm/frame`);
  assert.ok(lowestPelvis>-.18,'a longer leg must not be cancelled by a deep crouch');
});

test('longer stride does not generate footsteps during a jump or blocked dialogue',()=>{
  const {world}=scene(()=>0);let steps=0;world.callbacks.onFootstep=()=>steps++;world.moveSpeed=5.6;
  for(let i=0;i<360;i++){world.movementDistance=5.6/120;updateTownLife(world,1/120,i/120);}
  assert.ok(steps>=8&&steps<=12,'natural running cadence must remain between 2.7 and 4 steps/s');
  const before=steps;
  world.playerMotion={grounded:false,phase:'rising',verticalVelocity:3,takeoffTime:.15};
  for(let i=0;i<72;i++)updateTownLife(world,1/120,3+i/120);
  assert.equal(steps,before);
  world.playerMotion={grounded:true,phase:'landing',impactSpeed:6.6,landingTime:.05};world.blocked=true;
  for(let i=0;i<120;i++)updateTownLife(world,1/120,4+i/120);
  assert.equal(steps,before);
});
