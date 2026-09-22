import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const dir=process.env.QA_DIR||'output/qa/curved-street/final';await mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
const report={method:'Actual game UI and native keyboard/mouse; read-only state diagnostics',shots:[],errors:[]};page.on('pageerror',e=>report.errors.push(e.stack));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
const read=()=>page.evaluate(()=>window.__JIANGCHENG__.getWorld());
async function shot(name){await page.screenshot({path:dir+'/'+name+'.png'});report.shots.push({name,state:await read()});}
async function face(yaw){for(let i=0;i<6;i++){const w=await read(),d=Math.atan2(Math.sin(yaw-w.heading),Math.cos(yaw-w.heading));if(Math.abs(d)<.03)break;await page.mouse.move(960,430);await page.mouse.down();await page.mouse.move(960+Math.max(-520,Math.min(520,d/.0024)),430,{steps:12});await page.mouse.up();await page.waitForTimeout(180);}}
try{
 await page.goto(process.env.GAME_URL||'http://127.0.0.1:4173');await page.locator('#boot').waitFor({state:'hidden',timeout:60000});report.assets=await page.locator('script[src],link[rel="stylesheet"]').evaluateAll(ns=>ns.map(n=>n.src||n.href));
 if(process.env.EXPECT_AVATAR)assert.equal((await read()).avatar?.state,'ready','the imported avatar must be active, not the fallback');
 await page.locator('#start').click();await page.waitForTimeout(1200);await shot('01-arrival');
 await face(Math.atan2(10.5,-4));await page.waitForTimeout(250);await shot('02-front');
 await face(0);await page.keyboard.down('w');await page.waitForTimeout(2650);await page.keyboard.up('w');await page.waitForTimeout(500);await shot('03-street');
 await page.locator('#map').click();await page.locator('#map-destination').selectOption('shop');await page.locator('#map-go').click();await page.waitForFunction(()=>window.__JIANGCHENG__.getWorld().remainingRoute===0&&window.__JIANGCHENG__.getWorld().moveSpeed<.02,null,{timeout:30000});
 await page.locator('#interact').click();await page.waitForTimeout(1600);const state=await read(),box=await page.locator('.dialogue-box').boundingBox();assert.ok(state.conversation&&box);assert.ok(state.conversation.actors.every(a=>a.head.y>120&&a.feet.y<box.y-5));await shot('04-live-dialogue');
 await page.keyboard.press('Escape');await page.waitForTimeout(800);await page.locator('#first-person').click();await page.waitForTimeout(150);assert.equal((await read()).cameraMode,'first');await shot('05-first-person');await page.locator('#first-person').click();await page.waitForTimeout(150);assert.equal((await read()).cameraMode,'street');
 if(process.env.EXPECT_AVATAR){
  await page.locator('#first-person').click();await page.reload();await page.locator('#boot').waitFor({state:'hidden',timeout:60000});
  assert.equal((await read()).avatar?.state,'ready');await page.locator('#start').click();await page.waitForTimeout(300);assert.equal((await read()).cameraMode,'first');
  await page.locator('#first-person').click();await page.waitForTimeout(800);assert.equal((await read()).cameraMode,'street');assert.equal((await read()).playerVisible,true);await shot('06-saved-first-person-return');
 }
 assert.deepEqual(report.errors,[]);report.status='passed';
}catch(e){report.status='failed';report.failure=e.stack;process.exitCode=1;console.error(e);await shot('failure').catch(()=>{});}
finally{await browser.close();await writeFile(dir+'/report.json',JSON.stringify(report,null,2));console.log(report.status);}
