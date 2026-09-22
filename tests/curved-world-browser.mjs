import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';

// Isolated integration harness. Position fixtures exercise the new renderer;
// the separate curved-street-views run records actual travel without fixtures.
const base=process.env.GAME_URL||'http://127.0.0.1:5173';
const dir='output/qa/curved-street/integration';await mkdir(dir,{recursive:true});
const report={started:new Date().toISOString(),scope:'Isolated rendering integration fixtures, not an earned playthrough',checks:[],errors:[]};
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
page.on('pageerror',e=>report.errors.push(e.stack));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
await page.route('**/__curve-test',route=>route.fulfill({contentType:'text/html',body:`<style>html,body{margin:0;overflow:hidden}canvas{width:100vw;height:100vh}</style><canvas></canvas><script type="module">import * as THREE from '/node_modules/three/build/three.module.js';import {World} from '/src/world.js';window.THREE=THREE;window.world=new World(document.querySelector('canvas'));world.start();window.ready=true;</script>`}));
const check=(name,details)=>{report.checks.push({name,details});console.log('PASS',name);};
try{
 await page.goto(base+'/__curve-test');await page.waitForFunction(()=>window.ready&&world.firstFrameRendered,{timeout:60000});await page.waitForTimeout(800);
 const shader=await page.evaluate(()=>({programs:world.renderer.info.programs.map(p=>({name:p.name,runnable:p.diagnostics?.runnable??true})),curvature:world.curvedWorld.stats(),shadow:world.getShadowStats()}));
 assert.ok(shader.programs.every(p=>p.runnable));check('all curved material shaders compile, including sprites and player fade',shader);
 const target={x:-1.4,z:21};const projected=await page.evaluate(p=>world.project(p.x,p.z,world.heightAt(p.x,p.z)),target);
 assert.ok(projected.visible);await page.mouse.dblclick(projected.x,projected.y);
 await page.waitForFunction(()=>world.path.length===0&&world.moveSpeed<.01,null,{timeout:10000});
 const picked=await page.evaluate(()=>world.player.position.toArray());assert.ok(Math.hypot(picked[0]-target.x,picked[2]-target.z)<.07);check('native double click reaches the curved point shown on screen',{target,projected,picked});
 const bounds=await page.evaluate(()=>{
  const misses=[];let samples=0;world.scene.updateMatrixWorld(true);
  for(const center of[{x:1,z:21},{x:33,z:-16.2},{x:-30,z:0}]){
   world.setPosition(center);world.curvedWorld.update();
   world.static.traverse(mesh=>{if(!mesh.isMesh||!mesh.boundingSphere)return;const s=mesh.boundingSphere.clone().applyMatrix4(mesh.matrixWorld),p=mesh.geometry.attributes.position,v=new THREE.Vector3();
    for(let i=0;i<p.count;i+=Math.max(1,Math.floor(p.count/12))){v.fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld);if(!s.containsPoint(v))misses.push('flat');world.curvedWorld.point(v,v);if(v.distanceTo(s.center)>s.radius+.001)misses.push('curved');samples++;}
   });
  }
  return {samples,misses};
 });assert.equal(bounds.misses.length,0);check('static culling bounds include both shadow and curved geometry across the district',bounds);
 await page.evaluate(()=>{world.setPosition({x:33,z:-16.2});world.setCameraMode('first');world.firstYaw=0;world.firstPitch=.04;world.syncFirstPersonCamera();});await page.waitForTimeout(150);await page.screenshot({path:dir+'/first-person-lookout.png'});
 const first=await page.evaluate(()=>({mode:world.cameraMode,visible:world.player.visible,eye:world.camera.position.y-world.player.position.y,expectedEye:world.player.userData.eyeHeight,shadow:world.getShadowStats()}));
 assert.equal(first.mode,'first');assert.equal(first.visible,false);assert.ok(Math.abs(first.eye-first.expectedEye)<1e-8);check('first person remains at eye height on raised curved platform',first);
 await page.evaluate(()=>{world.setPosition({x:8,z:12});world.beginConversation('chef');world.blocked=true;world.fitConversationCamera();});await page.waitForTimeout(1400);
 const dialogue=await page.evaluate(()=>({safe:world.conversationSightline(world.camera.position,world.conversation.eyes),visible:world.player.visible,camera:world.camera.position.toArray(),actors:[world.player,world.conversation.npc].map(p=>({feet:world.project(p.position.x,p.position.z,p.position.y),head:world.project(p.position.x,p.position.z,p.position.y+p.userData.height)}))}));
 assert.equal(dialogue.safe,true);assert.ok(dialogue.visible&&dialogue.actors.every(p=>p.feet.visible&&p.head.visible));await page.screenshot({path:dir+'/curved-live-dialogue.png'});check('live 3D conversation uses curved visibility and actor projection',dialogue);
 await page.evaluate(()=>{world.endConversation();world.blocked=false;world.setCameraMode('overview');});await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>world.curvedWorld.enabled),false);check('overview remains flat and readable');
 await page.evaluate(()=>{world.setPosition({x:1,z:21});world.setCameraMode('street');world.thirdYaw=0;world.setPosition({x:1,z:21});world.setGuidance(world.getNavigation('dock'));});
 const before=await page.evaluate(()=>world.getShadowStats().updates);await page.keyboard.down('w');await page.waitForTimeout(700);await page.keyboard.up('w');await page.keyboard.press('Space');await page.waitForTimeout(1300);
 const after=await page.evaluate(()=>({shadow:world.getShadowStats().updates,guidance:world.guidance.count,grounded:world.playerMotion.grounded,finite:world.player.position.toArray().every(Number.isFinite)}));
 assert.equal(after.shadow,before);assert.ok(after.guidance>0&&after.grounded&&after.finite);check('movement, jump and runtime guidance keep shadows cached',after);
 assert.deepEqual(report.errors,[]);report.status='passed';
}catch(e){report.status='failed';report.failure=e.stack;process.exitCode=1;await page.screenshot({path:dir+'/failure.png'}).catch(()=>{});console.error(e);}
finally{await browser.close();report.finished=new Date().toISOString();await writeFile(dir+'/report.json',JSON.stringify(report,null,2));}
