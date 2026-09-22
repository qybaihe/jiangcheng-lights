import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {POIS} from '../src/story.js';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1600,height:1000}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const report={started:new Date().toISOString(),checks:[],positions:{},errors};
try {
 await page.goto(process.env.GAME_URL||'http://localhost:4173');await page.locator('#boot').waitFor({state:'hidden',timeout:60000});await page.locator('#start').click();
 assert.equal(await page.evaluate(()=>window.__JIANGCHENG__.canWalk(28,.9)),false);
 assert.equal(await page.evaluate(()=>window.__JIANGCHENG__.canWalk(26,1)),true);
 report.checks.push('Water hazard is blocked; observation point is dry and reachable');
 for(const id of ['granny','chef','riskCable','dock']){
  await page.locator('#map').click();await page.locator(`[data-place="${id}"]`).click();await page.locator('#map-go').click();
  await page.waitForFunction(id=>window.__JIANGCHENG__.getNearest()===id&&window.__JIANGCHENG__.getWorld().remainingRoute===0,id,{timeout:60000});
  await page.waitForTimeout(900);const world=await page.evaluate(()=>window.__JIANGCHENG__.getWorld()),poi=POIS.find(p=>p.id===id);
  const distance=Math.hypot(world.position.x-poi.x,world.position.z-poi.z);assert.ok(distance>=.9&&distance<2.7,`${id}: stopping distance ${distance}`);
  report.positions[id]={position:world.position,distance,camera:world.camera};
  await page.screenshot({path:`output/qa/final-${id}.png`});report.checks.push(id+' approach stops beside its interaction point');
 }
 await page.locator('#brand').click();await page.setViewportSize({width:390,height:844});await page.waitForTimeout(500);await page.screenshot({path:'output/qa/final-mobile-title.png'});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);report.checks.push('Refined mobile title fits within the viewport');
 assert.deepEqual(errors,[]);report.completed=new Date().toISOString();console.log(JSON.stringify(report));
} catch(error){report.failure=error.stack;process.exitCode=1;console.error(error);await page.screenshot({path:'output/qa/final-scene-failure.png'});}
finally{await writeFile('output/qa/final-scene-report.json',JSON.stringify(report,null,2));await browser.close();}
