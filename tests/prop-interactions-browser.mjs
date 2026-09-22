import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {freshState,SAVE_KEY} from '../src/story.js';

const BASE=process.env.GAME_URL||'http://127.0.0.1:4186';
const out=new URL(process.env.PROP_QA_DIR||'../output/qa/props-v1/integration/',import.meta.url);await mkdir(out,{recursive:true});
const report={scope:'isolated browser: actual map routes, actual world props, real save/reload; preconfigured completed radio only',checks:[],errors:[],failedRequests:[]};
const browser=await chromium.launch({headless:true,channel:'chrome'}),context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage();
const fixture=freshState();Object.assign(fixture,{started:true,flags:['storyV3','received','radio']});fixture.settings.quality='low';
await context.addInitScript(({key,fixture})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(fixture));},{key:SAVE_KEY,fixture});
page.on('pageerror',error=>report.errors.push(error.message));page.on('response',response=>{if(response.status()>=400)report.failedRequests.push({url:response.url(),status:response.status()});});
const state=()=>page.evaluate(()=>__JIANGCHENG__.getState());
const runtime=()=>page.evaluate(()=>__JIANGCHENG__.getProps().runtime);
const check=(name,detail={})=>{report.checks.push({name,status:'passed',...detail});console.log('PASS',name);};
async function ready(){await page.waitForFunction(()=>window.__JIANGCHENG__&&document.querySelector('#boot').hidden&&__JIANGCHENG__.getProps().anchors.length===5,null,{timeout:90000});}
async function go(id){
 await page.locator('#map').click();await page.locator('#map-destination').selectOption(id);assert.equal(await page.locator('#map-go').isDisabled(),false,id+' reachable');await page.locator('#map-go').click();
 await page.waitForFunction(id=>__JIANGCHENG__.getWorld().remainingRoute===0&&__JIANGCHENG__.getProps().nearby?.id===id,id,{timeout:60000});
}
async function shot(name){await page.screenshot({path:fileURLToPath(new URL(name+'.png',out))});}
try{
 await page.goto(BASE);await ready();assert.equal(await page.locator('.hero-game-logo').evaluate(img=>img.complete&&img.naturalWidth>1000),true);await shot('welcome');await page.locator('#start').click();
 const initial=await state();
 await page.locator('#prop-guide').click();assert.equal(await page.locator('[data-prop-route]').count(),5);await shot('guide');await page.locator('.close').click();check('generated logo and five illustrated route cards are live');
 await go('prop-bicycle');await page.keyboard.press('f');await page.waitForFunction(()=>__JIANGCHENG__.getProps().runtime.mode==='bicycle',null,{timeout:7000});assert.equal((await state()).props.bicycleUnlocked,true);
 await page.locator('#map').click();assert.equal((await runtime()).mode,'bicycle');await page.locator('.close').click();assert.equal((await runtime()).mode,'bicycle');
 const before=await page.evaluate(()=>__JIANGCHENG__.getWorld().position);await page.keyboard.down('w');await page.waitForTimeout(1000);const peak=(await runtime()).speed;
 await page.locator('#map').click();await page.waitForTimeout(150);const mapStop=await page.evaluate(()=>__JIANGCHENG__.getWorld().position);await page.waitForTimeout(350);const mapLater=await page.evaluate(()=>__JIANGCHENG__.getWorld().position);
 assert.equal((await runtime()).mode,'bicycle');assert.equal((await runtime()).speed,0,'opening the map brakes a moving bicycle');assert.ok(Math.hypot(mapLater.x-mapStop.x,mapLater.z-mapStop.z)<.02,'no drift underneath the map');await page.keyboard.up('w');await page.locator('.close').click();
 const after=await page.evaluate(()=>__JIANGCHENG__.getWorld().position);assert.ok(peak>3.4,'bicycle develops a faster-than-walk speed');assert.ok(Math.hypot(after.x-before.x,after.z-before.z)>2.8,'real displacement');await shot('bicycle');
 const bellBefore=await page.evaluate(()=>__JIANGCHENG__.getProps().bellCount);await page.keyboard.press('Space');await page.waitForTimeout(150);assert.equal((await runtime()).mode,'bicycle');assert.equal(await page.evaluate(()=>__JIANGCHENG__.getProps().bellCount),bellBefore+1);
 await page.keyboard.press('f');await page.waitForFunction(()=>__JIANGCHENG__.getProps().runtime.mode==='walk');const parked=(await runtime()).bikePosition;check('bicycle moves, rings rather than jumps, map brakes without dismounting, and F safely parks',{peakMetresPerSecond:peak,parked});
 await page.reload();await ready();await page.locator('#start').click();const restored=(await runtime()).bikePosition;assert.ok(Math.hypot(restored.x-parked.x,restored.z-parked.z)<.05);assert.ok(Math.abs(restored.yaw-parked.yaw)<.01);assert.equal((await runtime()).mode,'walk');check('parked bicycle position and heading survive reload without auto-mount');
 await go('prop-newspaper');assert.match(await page.locator('#route-instruction').innerText(),/F/);await page.keyboard.press('f');await page.waitForFunction(()=>__JIANGCHENG__.getProps().runtime.mode==='reading');assert.equal(await page.locator('.newspaper-reader').isVisible(),true);assert.deepEqual((await state()).props.readEditions,[]);
 await page.keyboard.press('ArrowRight');assert.deepEqual((await state()).props.readEditions,['beforeRain']);await page.locator('#newspaper-note').click();assert.deepEqual((await state()).props.notes,['window-corner']);await shot('newspaper');
 await page.reload();await ready();await page.locator('#start').click();assert.equal((await runtime()).mode,'walk');assert.deepEqual((await state()).props.notes,['window-corner']);const seatedSave=(await state()).position;assert.ok(await page.evaluate(p=>__JIANGCHENG__.canWalk(p.x,p.z),seatedSave));check('actual chair reading uses page keys, records only explicit note, and reload stands on a legal point');
 await go('prop-ferry');await page.keyboard.press('f');await page.locator('#ferry-board').click();await page.waitForFunction(()=>__JIANGCHENG__.getProps().runtime.mode==='ferry');const vesselStart=await page.evaluate(()=>__JIANGCHENG__.getWorld().position);await page.waitForFunction(()=>__JIANGCHENG__.getProps().runtime.ferryProgress>.18,null,{timeout:30000});await shot('ferry');const vesselLater=await page.evaluate(()=>__JIANGCHENG__.getWorld().position);assert.ok(Math.hypot(vesselLater.x-vesselStart.x,vesselLater.z-vesselStart.z)>1);
 await page.waitForFunction(()=>__JIANGCHENG__.getProps().runtime.mode==='walk'&&__JIANGCHENG__.getModal()===null,null,{timeout:90000});assert.equal((await state()).props.ferryRides,1);check('real boat moves through its full 26-second roundtrip, returns to shore, and records exactly once');
 await page.keyboard.press('f');await page.locator('#ferry-board').click();await page.waitForFunction(()=>__JIANGCHENG__.getProps().runtime.ferryProgress>.06);await page.locator('#ferry-return').click();assert.equal(await page.locator('#ferry-return').isDisabled(),true);await page.waitForFunction(()=>__JIANGCHENG__.getProps().runtime.mode==='walk'&&__JIANGCHENG__.getModal()===null,null,{timeout:20000});assert.equal((await state()).props.ferryRides,1);check('early return visibly docks and does not award another completed voyage');
 await page.keyboard.press('f');await page.locator('#ferry-board').click();await page.waitForTimeout(800);await page.reload();await ready();await page.locator('#start').click();const dockSave=await page.evaluate(()=>__JIANGCHENG__.getWorld().position);assert.equal((await runtime()).mode,'walk');assert.ok(await page.evaluate(p=>__JIANGCHENG__.canWalk(p.x,p.z),dockSave));assert.equal((await state()).props.ferryRides,1);check('reload during a voyage restores the land-side dock, not water');
 const final=await state();assert.deepEqual(final.flags,initial.flags);assert.deepEqual(final.supplies,initial.supplies);assert.deepEqual(final.lore,initial.lore);assert.deepEqual(final.storyChoices||{},initial.storyChoices||{});check('all prop activities leave main-story flags, inventory, lore and ending choices unchanged');
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.failedRequests,[]);report.status='passed';
}catch(error){report.status='failed';report.failure=error.stack;await shot('failure').catch(()=>{});throw error;}
finally{await writeFile(new URL('report.json',out),JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify(report,null,2));}
