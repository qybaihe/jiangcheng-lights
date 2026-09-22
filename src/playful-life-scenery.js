import * as THREE from 'three';
import {MEAL_ROUNDS,MEAL_STOPS,normalizeMealProgress,mealSummary} from './meal-relay.js';

/** Retained low-poly props, lit by the existing scene. No new lights/shadow pass. */
export function createMealScenery(world){
 const root=new THREE.Group();root.name='热食接力 · 保温篮与回执';world.scene.add(root);
 const materials=['#b59967','#e9d7a5','#faf0d5','#bf6650','#608c77'].map(color=>new THREE.MeshStandardMaterial({color,roughness:.92}));
 const geometry=new THREE.BoxGeometry(1,1,1),parcelGeometry=new THREE.CylinderGeometry(.22,.18,.16,12);
 const box=(parent,x,y,z,w,h,d,index)=>{const mesh=new THREE.Mesh(geometry,materials[index]);mesh.position.set(x,y,z);mesh.scale.set(w,h,d);parent.add(mesh);return mesh;};
 const makeParcel=()=>{const g=new THREE.Group();const body=new THREE.Mesh(parcelGeometry,materials[2]);body.position.y=.1;g.add(body);box(g,0,.20,0,.45,.05,.41,3);box(g,0,.231,0,.16,.008,.15,2);return g;};
 const basket=new THREE.Group();root.add(basket);
 box(basket,0,0,0,.65,.25,.43,0);box(basket,0,.13,0,.67,.035,.45,1);
 for(const x of [-.285,.285])box(basket,x,.32,0,.035,.4,.035,0);
 box(basket,0,.52,0,.61,.04,.045,0);
 for(let i=0;i<6;i++)box(basket,-.28+i*.11,0,.22,.02,.21,.018,1);
 const carried=Array.from({length:3},(_,i)=>{const g=makeParcel();g.scale.setScalar(.52);g.position.set((i-1)*.20,.145,0);basket.add(g);return g;});
 const piles=Object.fromEntries(Object.values(MEAL_STOPS).map(stop=>{const group=new THREE.Group();group.position.set(stop.x+(stop.id==='west'?1.1:1.5),world.heightAt(stop.x,stop.z),stop.z+1.1);root.add(group);box(group,0,.28,0,.9,.10,.55,0);for(const x of[-.36,.36])for(const z of[-.2,.2])box(group,x,.13,z,.045,.3,.045,0);const parcels=Array.from({length:3},(_,i)=>{const g=makeParcel();g.position.set(i*.28-.28,.34,0);g.scale.setScalar(.65);group.add(g);return g;});group.visible=false;return [stop.id,{group,parcels}];}));
 const passing=makeParcel();root.add(passing);passing.visible=false;
 world.curvedWorld?.attach(root);
 let flight=null,lastSignature='',chenSaved=null,visibleCount=0;
 function restoreChen(){const npc=world.npcs.find(n=>n.id==='walker0');if(npc&&chenSaved){npc.group.position.copy(chenSaved.position);npc.group.rotation.y=chenSaved.yaw;delete npc.activityAnchor;if(npc.group.userData.townLife){npc.group.userData.townLife.homeX=chenSaved.homeX;npc.group.userData.townLife.homeZ=chenSaved.homeZ;}}chenSaved=null;}
 function update(state,round){
  const progress=normalizeMealProgress(state.meals),known=round??(mealSummary(progress,'morning').started?'morning':mealSummary(progress,'evening').started?'evening':null);
  root.visible=Boolean(world.active&&known);
  if(!known){visibleCount=0;basket.visible=false;restoreChen();return;}
  // Chen waits outside the courtyard during this errand instead of walking away.
  const chen=world.npcs.find(n=>n.id==='walker0');
  if(chen&&!chenSaved){const actor=chen.group,life=actor.userData.townLife;chenSaved={position:actor.position.clone(),yaw:actor.rotation.y,homeX:life?.homeX??actor.position.x,homeZ:life?.homeZ??actor.position.z};chen.activityAnchor={x:-15.8,z:.7};actor.position.set(-15.8,world.heightAt(-15.8,.7),.7);actor.rotation.y=.7;}
  const summary=mealSummary(progress,known),sig=known+JSON.stringify(progress.rounds[known]);
  if(lastSignature!==sig){lastSignature=sig;const boxes=progress.rounds[known].boxes;visibleCount=MEAL_ROUNDS[known].orders.filter(o=>boxes[o.id].sealed&&!boxes[o.id].delivered).length;carried.forEach((g,i)=>g.visible=i<visibleCount);
   for(const [id,pile]of Object.entries(piles)){const total=MEAL_ROUNDS[known].orders.filter(o=>o.stopId===id&&boxes[o.id].delivered).length;pile.group.visible=total>0;pile.parcels.forEach((g,i)=>g.visible=i<total);}
  }
  const mode=world.getPropState().mode;
  basket.visible=visibleCount>0&&world.cameraMode!=='first'&&!['ferry','boat'].includes(mode);
  const p=world.player.position,yaw=world.player.rotation.y;
  // Carried at the hip; moves with the avatar and remains visible on a bicycle.
  const side=.48,behind=mode==='bicycle'?-.28:0;
  basket.position.set(p.x+Math.cos(yaw)*side+Math.sin(yaw)*behind,p.y+.70,p.z-Math.sin(yaw)*side+Math.cos(yaw)*behind);basket.rotation.y=yaw;basket.scale.setScalar(.7);
  if(flight){const t=Math.min(1,(performance.now()-flight.start)/700);passing.position.lerpVectors(flight.from,flight.to,t);passing.position.y+=Math.sin(t*Math.PI)*.25;passing.rotation.y=t*.6;passing.visible=t<1;if(t===1)flight=null;}
 }
 return {update,handover(stop){const p=world.player.position;flight={start:performance.now(),from:new THREE.Vector3(p.x,p.y+1,p.z),to:new THREE.Vector3(stop.x,world.heightAt(stop.x,stop.z)+.9,stop.z)};passing.visible=true;},snapshot:()=>({carried:visibleCount,receiverWaiting:Boolean(chenSaved),handover:Boolean(flight)}),dispose(){restoreChen();root.removeFromParent();geometry.dispose();parcelGeometry.dispose();materials.forEach(m=>m.dispose());}};
}
