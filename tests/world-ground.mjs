import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

const output=fileURLToPath(new URL('../output/qa/',import.meta.url));
const label=process.env.CASE_LABEL||'after',diagnose=process.env.DIAGNOSE==='1';
const report={date:new Date().toISOString(),case:label,errors:[],variants:[]};
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
page.on('pageerror',error=>report.errors.push(error.message));
await page.route('**/__ground-check',r=>r.fulfill({contentType:'text/html',body:'<style>html,body{margin:0}canvas{width:100vw;height:100vh}</style><canvas></canvas><script type="module">import{World}from"/src/world.js";window.world=new World(document.querySelector("canvas"));world.start();world.blocked=true;world.setCameraMode("overview");world.controls.enableDamping=false;world.camera.position.set(-6,14,26);world.controls.target.set(-13,.7,17);world.controls.update();window.ready=true;</script>'}));
try{
 await mkdir(output,{recursive:true});await page.goto((process.env.GAME_URL||'http://127.0.0.1:5173')+'/__ground-check');await page.waitForFunction(()=>window.ready);await page.waitForTimeout(1500);
 const capture=async name=>{await page.screenshot({path:output+`world-ground-${label}-${name}.png`});report.variants.push({name,shadow:await page.evaluate(()=>world.getShadowStats()),camera:await page.evaluate(()=>world.camera.position.toArray())});};
 await capture('normal');
 if(diagnose){
  await page.evaluate(()=>{world.renderer.shadowMap.enabled=false;world.ao.enabled=false;});await page.waitForTimeout(300);await capture('no-shadows-no-ao');
  report.floorBatch=await page.evaluate(()=>{const floor=world.static.children.find(m=>m.material?.map?.repeat.x===45&&m.material?.map?.repeat.y===32);if(!floor)return null;floor.visible=false;return {uuid:floor.uuid,castShadow:floor.castShadow,receiveShadow:floor.receiveShadow};});await page.waitForTimeout(300);await capture('coplanar-underlay-hidden');
 }else{
  const before=await page.evaluate(()=>world.getShadowStats());await page.waitForTimeout(750);const after=await page.evaluate(()=>world.getShadowStats());report.cachedAcrossRenderedFrames=after.renderedFrames-before.renderedFrames;report.extraShadowUpdates=after.updates-before.updates;
  report.groundFlags=await page.evaluate(()=>world.static.children.filter(m=>m.material?.map?.repeat.x===45||m.material?.map?.repeat.x===17).map(m=>({castShadow:m.castShadow,receiveShadow:m.receiveShadow})));
  assert.ok(report.groundFlags.length>=2&&report.groundFlags.every(m=>m.castShadow===false&&m.receiveShadow===true));assert.equal(report.extraShadowUpdates,0);
 }
}finally{await writeFile(output+`world-ground-${label}.json`,JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify(report,null,2));}
