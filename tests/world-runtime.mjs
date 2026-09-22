import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

// Isolated world harness: no game save, main.js, or user browser tab is touched.
const BASE=process.env.GAME_URL||'http://127.0.0.1:5173';
const output=fileURLToPath(new URL('../output/qa/',import.meta.url));
const report={suite:'world-runtime',date:new Date().toISOString(),base:BASE,scope:process.env.SKIP_ROUTE_WALKS?'rendering and input regression; actual route walks omitted':'full world regression including actual route walks',checks:[],errors:[]};
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1});
page.on('pageerror',error=>report.errors.push(error.message));
await page.route('**/__world-runtime',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}canvas{width:100%;height:100%;display:block;touch-action:none}button{position:fixed;top:10px;left:10px;z-index:2}</style><canvas id="world"></canvas><button id="lock">Lock view</button><script type="module">import * as THREE from '/node_modules/three/build/three.module.js';import {World,walkableSegment} from '/src/world.js';window.THREE=THREE;import {POIS} from '/src/story.js';window.world=new World(document.querySelector('canvas'));window.walkableSegment=walkableSegment;window.pois=POIS;world.start();document.querySelector('button').onclick=()=>world.requestPointerLock();window.ready=true;</script>`}));
const check=(name,data={})=>report.checks.push({name,status:'passed',...data});
const afterFrames=async count=>{const frame=await page.evaluate(()=>world.getShadowStats().renderedFrames);await page.waitForFunction(frame=>world.getShadowStats().renderedFrames>=frame,frame+count,{timeout:20000});};
try{
 await mkdir(output,{recursive:true});await page.goto(BASE+'/__world-runtime');await page.waitForFunction(()=>window.ready,{timeout:60000});
 await page.waitForFunction(()=>world.getShadowStats().updates>=1,{timeout:30000});
 const before=await page.evaluate(()=>world.getShadowStats());await afterFrames(45);
 const after=await page.evaluate(()=>world.getShadowStats());assert.equal(after.updates,before.updates);check('static shadows remain cached across 45 rendered frames',{before,after});
 await page.evaluate(()=>{let texture=[...world.shadowTextures.keys()][0];if(!texture){texture=new THREE.Texture();world.shadowTextures.set(texture,texture.version);window.syntheticShadowTexture=texture;}texture.needsUpdate=true;});await afterFrames(4);
 const textureReady=await page.evaluate(()=>world.getShadowStats());assert.equal(textureReady.updates,after.updates+1);assert.equal(textureReady.lastReason,'alpha-textures-ready');check('alpha texture version tracking invalidates cache once (synthetic texture when scene is fully opaque)',{textureReady});await page.evaluate(()=>{if(window.syntheticShadowTexture){world.shadowTextures.delete(syntheticShadowTexture);syntheticShadowTexture.dispose();}});

 const actors=await page.evaluate(()=>{
  const roots=[world.player,...world.npcs.map(n=>n.group),world.ferry];let casts=0;for(const root of roots)root.traverse(o=>{if(o.isMesh&&o.castShadow)casts++;});
  return {casts,contacts:world.contactShadows.length,maxContactError:Math.max(...world.contactShadows.map(({actor,shadow})=>Math.hypot(actor.group.position.x-shadow.position.x,actor.group.position.z-shadow.position.z)))};
 });assert.equal(actors.casts,0);assert.equal(actors.maxContactError,0);check('moving actors excluded from static shadow map; contact shadows follow feet',actors);

 const routes=await page.evaluate(()=>{world.setPosition({x:1,z:21});return pois.map(p=>{const start=performance.now(),route=world.getNavigation(p.id);return {id:p.id,reachable:route.reachable,distance:route.distance,ms:performance.now()-start,segmentsWalkable:route.path.slice(1).every((point,i)=>walkableSegment(world,route.path[i],point))};});});
 assert.ok(routes.every(r=>r.reachable&&r.segmentsWalkable));check('all 16 POIs have walkable routes from the starting square',{routes});
 const guidance=await page.evaluate(()=>{world.setGuidance(world.getNavigation('granny'));return {count:world.guidance.count,shadows:world.getShadowStats()};});assert.ok(guidance.count>0&&guidance.count<=12);check('guidance uses a bounded set of ground dots',guidance);

 await page.evaluate(()=>{world.setGuidance(null);world.setPosition({x:0,z:20});world.setCameraMode('first');});
 const first=await page.evaluate(()=>({eye:world.camera.position.toArray(),body:world.player.position.toArray(),visible:world.player.visible,mode:world.cameraMode,fov:world.camera.fov,heading:world.getHeading(),eyeHeight:world.eyeHeight}));
 assert.equal(first.visible,false);assert.equal(first.mode,'first');assert.ok(Math.abs(first.eye[1]-first.body[1]-first.eyeHeight)<1e-8);
 await page.mouse.move(680,360);await page.mouse.down();await page.mouse.move(820,405,{steps:7});await page.mouse.up();
 const turned=await page.evaluate(()=>({heading:world.getHeading(),eye:world.camera.position.toArray(),pitch:world.firstPitch}));assert.ok(turned.heading-first.heading>.2);assert.deepEqual(turned.eye,first.eye);check('first-person eye camera turns by mouse drag without orbiting',{first,turned});
 await page.evaluate(()=>{world.firstYaw=Math.PI/2;world.firstPitch=0;world.syncFirstPersonCamera();});
 const moveFrom=await page.evaluate(()=>({x:world.player.position.x,z:world.player.position.z}));await page.keyboard.down('w');await page.waitForTimeout(350);await page.keyboard.up('w');
 const moveTo=await page.evaluate(()=>({x:world.player.position.x,z:world.player.position.z}));assert.ok(moveTo.x-moveFrom.x>.5);assert.ok(Math.abs(moveTo.z-moveFrom.z)<.01);check('W moves relative to first-person heading',{from:moveFrom,to:moveTo});

 const wall=await page.evaluate(()=>{const c=world.colliders.find(c=>-13>c.x&&-13<c.X&&11.4>c.z&&11.4<c.Z&&c.height>5);world.setPosition({x:c.X+.5,z:(c.z+c.Z)/2});world.firstYaw=Math.PI*1.5;world.syncFirstPersonCamera();return c;});
 await page.keyboard.down('w');await page.waitForTimeout(450);await page.keyboard.up('w');
 const collision=await page.evaluate(()=>({x:world.player.position.x,z:world.player.position.z,walking:world.walking}));assert.ok(collision.x>=wall.X+.35-1e-8);check('first-person movement stops at the building footprint',{wall,position:collision});
 await page.evaluate(()=>{world.setPosition({x:8.5,z:12});world.firstYaw=Math.PI/2;world.syncFirstPersonCamera();});await page.keyboard.down('w');await page.waitForTimeout(600);await page.keyboard.up('w');
 const actorGap=await page.evaluate(()=>Math.hypot(world.player.position.x-10,world.player.position.z-12));assert.ok(actorGap>=.52-1e-6);assert.ok(actorGap<.8);check('first-person movement cannot enter a resident body',{gap:actorGap});

 await page.evaluate(()=>{world.setPosition({x:1,z:21});world.firstYaw=0;world.firstPitch=.04;world.syncFirstPersonCamera();});await afterFrames(2);await page.screenshot({path:output+'world-first-person.png'});
 await page.locator('#lock').click();await page.waitForFunction(()=>document.pointerLockElement===world.canvas,{timeout:3000});await page.keyboard.press('Escape');await page.waitForFunction(()=>document.pointerLockElement===null);check('user gesture enters pointer lock and Escape releases it');

 const saved=await page.evaluate(()=>{world.setPosition({x:8,z:12});world.firstYaw=1.13;world.firstPitch=-.12;world.syncFirstPersonCamera();const result={p:world.player.position.toArray(),yaw:world.firstYaw,pitch:world.firstPitch};world.beginConversation('chef');world.blocked=true;return result;});
 await afterFrames(50);assert.equal(await page.evaluate(()=>world.player.visible&&Boolean(world.conversation)),true);await page.screenshot({path:output+'world-first-conversation.png'});
 const restored=await page.evaluate(()=>{world.endConversation();world.blocked=false;return {p:world.player.position.toArray(),yaw:world.firstYaw,pitch:world.firstPitch,visible:world.player.visible,mode:world.cameraMode,eye:world.camera.position.toArray(),restoring:Boolean(world.cameraReturn)};});
 assert.deepEqual(restored.p,saved.p);assert.equal(restored.yaw,saved.yaw);assert.equal(restored.pitch,saved.pitch);assert.equal(restored.visible,false);assert.equal(restored.restoring,false);check('live 3D conversation restores first-person position and gaze exactly',{saved,restored});

 await page.evaluate(()=>{world.setCameraMode('street');world.setPosition({x:1,z:21});world.keys.shift=true;});
 for(const source of(process.env.SKIP_ROUTE_WALKS?[]:['granny','battery'])){
  const routeToSource=await page.evaluate(id=>{const route=world.getNavigation(id);world.navigateRoute(route);return route;},source);assert.ok(routeToSource.reachable);
  await page.waitForFunction(()=>world.path.length===0,null,{timeout:25000});
  const sourcePosition=await page.evaluate(()=>world.player.position.toArray());
  const routeToChef=await page.evaluate(()=>{const route=world.getNavigation('chef');world.navigateRoute(route);return route;});assert.ok(routeToChef.reachable);
  await page.waitForFunction(()=>world.path.length===0,null,{timeout:25000});
  await page.evaluate(()=>{world.keys={};world.beginConversation('chef');world.blocked=true;});await afterFrames(65);
  const framing=await page.evaluate(()=>({position:world.player.position.toArray(),camera:world.camera.position.toArray(),safe:world.conversationSightline(world.camera.position,world.conversation.eyes),lampClearances:world.cameraOccluders.filter(b=>b.kind==='lamp-head').map(b=>Math.hypot(Math.max(b.x-world.camera.position.x,0,world.camera.position.x-b.X),Math.max(b.y-world.camera.position.y,0,world.camera.position.y-b.height),Math.max(b.z-world.camera.position.z,0,world.camera.position.z-b.Z)))}));
  assert.ok(framing.safe);assert.ok(Math.min(...framing.lampClearances)>.45);
  await page.screenshot({path:output+`world-chef-from-${source}.png`});check(`chef dialogue after actually walking from ${source}`,{sourcePosition,routeDistance:routeToChef.distance,framing});
  await page.evaluate(()=>{world.endConversation();world.blocked=false;world.keys.shift=true;});
 }

 const props=await page.evaluate(()=>{world.keys={};world.collectedSupplies=new Set(['box','water','battery']);world.storyFlags=new Set(['chef']);world.updateStoryProps();const result={supplies:Object.fromEntries(Object.entries(world.supplyGroups).map(([id,g])=>[id,g.visible])),packed:world.deliveredFood.visible,atStall:world.deliveredFood.position.toArray()};world.storyFlags.add('checked');world.updateStoryProps();result.atCommunity=world.deliveredFood.position.toArray();return result;});
 assert.ok(Object.values(props.supplies).every(v=>!v));assert.equal(props.packed,true);assert.notDeepEqual(props.atStall,props.atCommunity);check('collected supplies leave their shelves and packed food moves to the community',props);

 await page.evaluate(()=>{world.reduced=true;});await afterFrames(2);const resting=await page.evaluate(()=>world.npcs.map(n=>n.group.position.toArray()));await afterFrames(12);assert.deepEqual(await page.evaluate(()=>world.npcs.map(n=>n.group.position.toArray())),resting);check('reduced motion keeps residents stationary');
 await page.evaluate(()=>world.setQuality(true));await afterFrames(3);const low=await page.evaluate(()=>world.getShadowStats());
 await page.evaluate(()=>world.setQuality(false));await afterFrames(8);const high=await page.evaluate(()=>world.getShadowStats());assert.equal(high.updates,low.updates+1);await afterFrames(15);const final=await page.evaluate(()=>world.getShadowStats());assert.equal(final.updates,high.updates);check('restoring high quality refreshes static shadows once',{low,high,final});
 assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.failure={message:error.message,stack:error.stack};report.failure.world=await page.evaluate(()=>({position:world.player.position.toArray(),path:world.path.map(p=>p.toArray()),walking:world.walking,keys:world.keys,stuck:world.routeStuckTime,npcs:world.npcs.map(n=>({id:n.id,position:n.group.position.toArray()}))})).catch(()=>null);throw error;}
finally{await writeFile(output+'world-runtime-report.json',JSON.stringify(report,null,2));await writeFile(output+`world-runtime-report-${report.date.replace(/[:.]/g,'-')}.json`,JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify(report,null,2));}
