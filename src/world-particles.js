import * as THREE from 'three';

export const WORLD_PARTICLE_BUDGET=Object.freeze({leaves:30,motes:20,burst:12,drawCalls:2});
const GROVES=[[-19,17],[-34,1],[22,18],[-7,-15],[9,28],[51,21]];
const LAMPS=[[-9.5,17],[10,12],[12,-3],[51,21],[72,-13]];
export function particlesMayMove({active,reduced,suspended,hidden,blocked}={}) {
 return Boolean(active&&!reduced&&!suspended&&!hidden&&!blocked);
}

// Two fixed instanced pools: ordinary plane-tree leaves and dust in warm light.
// No new light, shadow, texture download, timer, RAF or per-frame object allocation.
export function createWorldParticles(world) {
 const root=new THREE.Group();root.name='jiangfeng-small-things';root.visible=false;world.scene.add(root);
 const shape=new THREE.Shape();shape.moveTo(0,.14);
 for(const [x,y] of [[.035,.055],[.11,.085],[.075,.015],[.13,-.025],[.035,-.038],[0,-.12],[-.035,-.04],[-.12,-.015],[-.073,.024],[-.095,.077],[-.035,.054]])shape.lineTo(x,y);
 shape.closePath();
 const leafMat=new THREE.MeshBasicMaterial({color:'#b4bc7e',side:THREE.DoubleSide,forceSinglePass:true,transparent:true,opacity:.75,depthWrite:false});
 const moteMat=new THREE.MeshBasicMaterial({color:'#efd59d',transparent:true,opacity:.44,depthWrite:false});
 const leaves=new THREE.InstancedMesh(new THREE.ShapeGeometry(shape),leafMat,WORLD_PARTICLE_BUDGET.leaves);
 const motes=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.035,0),moteMat,WORLD_PARTICLE_BUDGET.motes+WORLD_PARTICLE_BUDGET.burst);
 for(const mesh of [leaves,motes]){mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;mesh.castShadow=false;mesh.receiveShadow=false;root.add(mesh);}
 world.curvedWorld?.attach(root);
 const dummy=new THREE.Object3D(),color=new THREE.Color();let seed=91,time=0,updates=0,disposed=false,burstTime=0;
 const random=()=>((seed=seed*16807%2147483647)-1)/2147483646;
 const data=Array.from({length:WORLD_PARTICLE_BUDGET.leaves},(_,i)=>{
  const [cx,cz]=GROVES[i%GROVES.length],x=cx+(random()-.5)*4,z=cz+(random()-.5)*3,y=world.heightAt(x,z);
  const valid=[-1,0,1].every(d=>world.canWalk(x+d*.4,z+d*.3)&&Math.abs(world.heightAt(x+d*.4,z+d*.3)-y)<.2);
  leaves.setColorAt(i,color.set(['#b5ac72','#80a381','#c4ac78'][i%3]));
  return {x,z,y,valid,phase:random(),pace:.07+random()*.04,scale:.7+random()*.8};
 });
 const glow=Array.from({length:WORLD_PARTICLE_BUDGET.motes},(_,i)=>{const [x,z]=LAMPS[i%LAMPS.length];return{x,z,y:world.heightAt(x,z),phase:random()*6.28};});
 const burstOrigin={x:0,y:0,z:0},systemMotion=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
 function matrix(mesh,i,x,y,z,scale,rx=0,ry=0,rz=0){dummy.position.set(x,y,z);dummy.rotation.set(rx,ry,rz);dummy.scale.setScalar(scale);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);}
 function update(dt,{hidden=globalThis.document?.hidden??false}={}) {
  if(disposed)return;
  root.visible=particlesMayMove({active:world.active,reduced:world.reduced||systemMotion?.matches,suspended:world.suspended,blocked:world.blocked,hidden});
  if(!root.visible){burstTime=0;return;}
  dt=Math.min(.05,Math.max(0,dt));time+=dt;updates++;burstTime=Math.max(0,burstTime-dt);
  const p=world.player.position,low=world.lowQuality===true;
  for(let i=0;i<data.length;i++){
   const d=data[i],phase=(time*d.pace+d.phase)%1,angle=time*.8+d.phase*6.28;
   const visible=d.valid&&(!low||i<16)&&Math.hypot(p.x-d.x,p.z-d.z)<25&&(!world.rainy||world.ended);
   const fade=Math.min(1,phase*9,(1-phase)*9);
   matrix(leaves,i,d.x+Math.sin(angle)*.35,d.y+.06+(1-phase)*3.4,d.z+Math.cos(angle*.8)*.25,visible?d.scale*fade:0,angle*.7,angle,.6+Math.sin(angle));
  }
  for(let i=0;i<glow.length;i++){
   const d=glow[i],angle=time*.3+d.phase,visible=Math.hypot(p.x-d.x,p.z-d.z)<18&&(!world.rainy||world.ended);
   matrix(motes,i,d.x+Math.sin(angle)*.75,d.y+.65+((time*.09+d.phase)%1)*1.2,d.z+Math.cos(angle)*.65,visible?.45+.4*Math.sin(angle)**2:0);
  }
  for(let i=0;i<WORLD_PARTICLE_BUDGET.burst;i++){
   const age=1-burstTime/1.1,angle=i*2.3999;
   matrix(motes,glow.length+i,burstOrigin.x+Math.cos(angle)*age*.65,burstOrigin.y+.2+age*.8,burstOrigin.z+Math.sin(angle)*age*.65,burstTime>0?(1-age)*1.5:0);
  }
  leaves.instanceMatrix.needsUpdate=true;motes.instanceMatrix.needsUpdate=true;
 }
 return {
  update,
  pulse(position=world.player.position){if(disposed||!particlesMayMove({active:world.active,reduced:world.reduced||systemMotion?.matches,suspended:world.suspended,blocked:world.blocked,hidden:globalThis.document?.hidden}))return;burstOrigin.x=position.x;burstOrigin.y=position.y;burstOrigin.z=position.z;burstTime=1.1;},
  stats(){return {visible:root.visible,updates,time,burstActive:burstTime>0,leaves:data.length,motes:glow.length,burst:WORLD_PARTICLE_BUDGET.burst,maxDrawCalls:2,castsShadows:false,disposed};},
  dispose(){if(disposed)return;disposed=true;root.removeFromParent();for(const mesh of [leaves,motes]){mesh.geometry.dispose();mesh.material.dispose();mesh.dispose();}},
 };
}
