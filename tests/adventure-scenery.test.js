import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { World, walkableSegment, findWalkPath } from '../src/world.js';
import { POIS } from '../src/story.js';
import { addAdventureScenery, updateAdventureScenery } from '../src/adventure-scenery.js';
import { adventureHeightAt, ADVENTURE_LAYOUT, ADVENTURE_MAP, ADVENTURE_ROUTES } from '../src/adventure-layout.js';

function fixture(){
  const world=Object.create(World.prototype);
  Object.assign(world,{static:new THREE.Group(),scene:new THREE.Scene(),materials:new Map(),colliders:[],cameraOccluders:[],npcs:[],hazards:[{x:28,z:.9,r:1.65}],reduced:false,suspended:false});
  world.scene.add(world.static);
  // Real nearby footprints that a new path must go around, not through.
  world.colliders.push({x:27,X:35,z:3.5,Z:12.5,height:10,kind:'existing-teahouse'},
    {x:11,X:23,z:-15,Z:-6,height:8.2,kind:'existing-community'},
    {x:33.622,X:34.378,z:-19.378,Z:-18.622,height:5.32,kind:'existing-tree'});
  // Text rasterization is irrelevant to terrain/collision tests. Keep actual
  // geometry, transformations and materials, with only the canvas text omitted.
  world.label=(text,w,h,bg,fg,parent=world.static)=>{
    const m=world.mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshStandardMaterial({color:bg,side:THREE.DoubleSide}),0,0,0,parent,false);
    m.userData.testLabel=text;return m;
  };
  addAdventureScenery(world);world.scene.updateMatrixWorld(true);return world;
}

const close=(a,b,eps=1e-7)=>assert(Math.abs(a-b)<=eps,`${a} differs from ${b}`);

test('adventure terrain is bounded, continuous at the ramp mouth and rises 1.8m',()=>{
  close(adventureHeightAt(33.6,-.3),.13);close(adventureHeightAt(33.6,-7.5),1.03);close(adventureHeightAt(33.6,-14.7),1.93);
  close(adventureHeightAt(33,-16.2),1.93);close(adventureHeightAt(33.6,-14.7+1e-7),1.93,2e-8);
  for(const p of[[29,-15],[31.99,-7],[35.21,-7],[33,.01],[NaN,0],[33,Infinity]])assert.equal(adventureHeightAt(...p),null);
  assert.equal(ADVENTURE_MAP.find(x=>x.id==='wind-ramp').passable,true);
  assert.equal(ADVENTURE_MAP.filter(x=>x.kind==='pillar').length,4);
});

test('actual ramp triangles match the navigation surface across its width and length',()=>{
  const world=fixture(),ramp=world.scene.getObjectByName('adventure-ramp-surface');
  const ray=new THREE.Raycaster(),direction=new THREE.Vector3(0,-1,0);let count=0;
  for(let x=32.3;x<34.91;x+=.37)for(let z=-14.55;z<-.4;z+=.39){
    ray.set(new THREE.Vector3(x,20,z),direction);const hit=ray.intersectObject(ramp)[0];
    assert(hit,`no ramp at ${x},${z}`);close(hit.point.y,adventureHeightAt(x,z),1e-7);count++;
  }
  assert(count>250);
  const platform=world.scene.getObjectByName('adventure-platform-surface');
  ray.set(new THREE.Vector3(33,20,-16.2),direction);close(ray.intersectObject(platform)[0].point.y,1.93);
});

test('main spine, all three cross-street mouths and old POI coordinates stay open to new geometry',()=>{
  const world=fixture(),added=world.colliders.filter(c=>c.kind?.startsWith('adventure-'));
  const intersects=(x,z)=>added.some(c=>x>c.x-.35&&x<c.X+.35&&z>c.z-.35&&z<c.Z+.35);
  for(let z=-23;z<=30;z+=.125)assert(!intersects(0,z),`spine blocked at ${z}`);
  for(const z0 of[7,23,-9])for(let x=-6;x<=6;x+=.13)for(const offset of[-2,0,2])assert(!intersects(x,z0+offset),`cross street blocked at ${x},${z0+offset}`);
  for(const p of POIS)assert(!intersects(p.x,p.z),`new obstacle on old POI ${p.id}`);
  for(const g of ADVENTURE_LAYOUT.gates){
    assert(g.pierX*2-g.pierWidth-.7>=4.8);
    for(let x=-2.40;x<=2.40;x+=.20){
      const ray=new THREE.Raycaster(new THREE.Vector3(x,.131,g.z),new THREE.Vector3(0,1,0));
      const hit=ray.intersectObject(world.adventureScenery.root,true)[0];
      assert(hit&&hit.distance>=4.1,`headroom ${hit?.distance} at gate ${g.id}/${x}`);
    }
  }
});

test('real movement and pathfinding reach the elevated platform through the open ramp',()=>{
  const world=fixture();
  for(const route of[ADVENTURE_ROUTES.windPlatform,ADVENTURE_ROUTES.platformToFerry]){
    for(let i=1;i<route.length;i++)assert(walkableSegment(world,route[i-1],route[i]),`unwalkable route segment ${JSON.stringify([route[i-1],route[i]])}`);
  }
  const path=findWalkPath(world,{x:25,z:-3},ADVENTURE_LAYOUT.destinations.lookout);
  assert(path?.length>=3,'path must enter the ramp, not teleport up a deck side');
  for(let i=1;i<path.length;i++)assert(walkableSegment(world,path[i-1],path[i]));
  close(world.heightAt(33,-16.2),1.93);
  assert(!world.canWalk(32,-7.5));assert(!world.canWalk(35.2,-7.5));
  assert(!world.canWalk(29.5,-16));assert(!world.canWalk(33,-18));
  assert(world.canWalk(33.6,-14.7),'railing must not close the upper ramp exit');
  assert(world.canWalk(33.6,1.2));assert(world.canWalk(29,-15),'old ferry lore stays on the ground');
  for(const p of Object.values(ADVENTURE_LAYOUT.destinations))assert(world.canWalk(p.x,p.z));
});

test('sloping rail obstacles follow local rail height instead of a 3m wall at the foot',()=>{
  const world=fixture(),rail=world.colliders.filter(c=>c.kind.startsWith('adventure-wind-ramp-'));
  assert.equal(rail.length,16);
  for(const c of rail){
    close(c.y,adventureHeightAt(33,c.Z));close(c.height,adventureHeightAt(33,c.z)+1.06);
    assert(c.height-c.y<1.30);
  }
});

test('wind uses independent non-shadowing geometry, respects reduced motion and survives static batching',()=>{
  const world=fixture(),state=world.adventureScenery,initial=state.kite.position.clone();
  const colliders=world.colliders.length,occluders=world.cameraOccluders.length;
  assert.equal(addAdventureScenery(world),state.summary);assert.equal(world.colliders.length,colliders);assert.equal(world.cameraOccluders.length,occluders);
  updateAdventureScenery(world,.1,1);assert(state.kite.position.distanceTo(initial)>0);
  world.reduced=true;updateAdventureScenery(world,.1,999);assert(state.kite.position.equals(initial));
  let lights=0;world.scene.traverse(o=>{if(o.isLight)lights++;});assert.equal(lights,0);
  state.moving.traverse(o=>{if(o.isMesh)assert.equal(o.castShadow,false);});
  const before=state.time;world.reduced=false;world.suspended=true;updateAdventureScenery(world,.1,1000);assert.equal(state.time,before);
  assert(state.summary.staticTriangles<60000);
  world.optimize();assert(world.static.children.length>0);assert(state.moving.parent===world.scene);
  assert(world.scene.getObjectByName('工具棚燕子 · 两条蓝布尾巴'));
  assert(world.scene.getObjectByName('街坊风铃 · 蓝布长签'));
  updateAdventureScenery(world,1/60,1001);
});
