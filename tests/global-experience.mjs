import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const BASE=process.env.GAME_URL||'http://localhost:4173',dir='output/qa/global/final';await fs.mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:1440,height:900}});
const report={date:new Date().toISOString(),base:BASE,checks:[],errors:[],assets:[]};
page.on('pageerror',e=>report.errors.push(e.message));page.on('response',r=>{if(r.request().resourceType()==='script')report.assets.push(r.url());});
const check=(name,data={})=>{report.checks.push({name,...data});console.log('PASS',name);};
const world=()=>page.evaluate(()=>window.__JIANGCHENG__.getWorld());
const close=()=>page.locator('.close').click();
async function go(id){await page.locator('#map').click();await page.locator('#map-destination').selectOption(id);await page.locator('#map-go').click();await page.waitForFunction(id=>window.__JIANGCHENG__.getNearest()===id&&window.__JIANGCHENG__.getWorld().remainingRoute===0,id,{timeout:45000});await page.waitForTimeout(200);}
async function snap(name){await page.waitForTimeout(450);await page.screenshot({path:`${dir}/${name}.png`});}
try{
 await page.goto(BASE);await page.locator('#boot').waitFor({state:'hidden',timeout:60000});await page.locator('#start').click();await page.waitForTimeout(1500);
 await page.locator('#map').click();await page.locator('#map-destination').selectOption('granny');
 assert.match(await page.locator('#map-distance').innerText(),/米/);assert((await page.locator('#map-route path').first().getAttribute('d')).includes('L'));
 const full=await page.locator('#map-svg').getAttribute('viewBox');await page.locator('#map-plus').click();assert.notEqual(await page.locator('#map-svg').getAttribute('viewBox'),full);await page.locator('#map-reset').click();assert.equal(await page.locator('#map-svg').getAttribute('viewBox'),full);
 await snap('01-map-desktop');const before=(await world()).position;await page.locator('#map-guide').click();await page.waitForTimeout(1050);assert.deepEqual((await world()).position,before);assert.equal(await page.locator('#route-guide').isVisible(),true);check('illustrated map shows real route; zoom/reset work; manual guidance does not take control');
 await page.locator('#first-person').click();const first=await world();assert.equal(first.cameraMode,'first');assert(Math.abs(first.camera[0]-first.position.x)<1e-7);assert(Math.abs(first.camera[2]-first.position.z)<1e-7);
 await page.mouse.move(700,400);await page.mouse.down();await page.mouse.move(900,440,{steps:8});await page.mouse.up();await page.waitForTimeout(200);const looked=await world();assert(Math.abs(looked.heading-first.heading)>.2);assert.deepEqual(looked.position,first.position);check('first-person drag changes gaze at the same eye position');
 await page.locator('#map').click();await close();assert.equal((await world()).heading,looked.heading);assert.equal((await world()).cameraMode,'first');check('map opens and returns to the same first-person gaze');
 await page.locator('#route-stop').click();assert.equal(await page.locator('#route-guide').isVisible(),false);check('guidance can be dismissed');
 await go('box');await page.locator('#interact').click();assert.match(await page.locator('#dialogue-text').innerText(),/委托|蔡姨|留言/);assert.equal((await page.evaluate(()=>window.__JIANGCHENG__.getState())).supplies.length,0);await page.keyboard.press('Escape');check('unrequested supplies explain the missing authorization and remain uncollected');
 const timeBefore=await page.evaluate(()=>window.__JIANGCHENG__.getState().seconds);await page.evaluate(()=>{const until=performance.now()+520;while(performance.now()<until){};});await page.waitForTimeout(100);const elapsed=await page.evaluate(()=>window.__JIANGCHENG__.getState().seconds)-timeBefore;assert(elapsed>.5);check('playtime records foreground elapsed time even during a slow frame',{elapsed});
 await go('shop');await page.locator('#interact').click();await page.waitForTimeout(1800);assert.equal(await page.locator('.story.in-world').isVisible(),true);await snap('02-first-person-conversation');await page.keyboard.press('Escape');assert.equal((await world()).cameraMode,'first');await snap('03-first-person');
 await page.setViewportSize({width:390,height:844});await snap('04-mobile-world');await page.locator('#map').click();await page.locator('#map-destination').selectOption('chef');await snap('05-mobile-map');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);const tools=await page.locator('.map-tools button').evaluateAll(els=>els.map(e=>({w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height})));assert(tools.every(r=>r.w>=44&&r.h>=44));await close();check('mobile map and world stay within the screen; map controls have 44-pixel targets');
 const completed=JSON.parse(await fs.readFile('output/qa/global/walkthrough/completed-save.json','utf8'));completed.settings.cameraMode='street';
 // Install the isolated fixture after pagehide has saved the previous test state.
 await page.addInitScript(save=>localStorage.setItem('jiangcheng-lights-v1',JSON.stringify(save)),completed);await page.reload();await page.locator('#boot').waitFor({state:'hidden',timeout:60000});assert((await page.evaluate(()=>window.__JIANGCHENG__.getState())).flags.includes('ending'));await page.locator('#start').click();await page.setViewportSize({width:1440,height:900});
 const afterRain={granny:/社区回来/,chef:/箱子也收拾好了/,dock:/信封看过了吧/,community:/大家都平安回来了/};
 for(const id of ['granny','chef','dock','community']){await go(id);await page.locator('#interact').click();const text=await page.locator('#dialogue-text').innerText();assert.match(text,afterRain[id],id+' acknowledges the ending');assert(!/会按社区安排提前|昨[天地]|今晚.*早点回屋/.test(text),id+' stale pre-rain reply');await page.keyboard.press('Escape');}check('all four residents acknowledge the post-rain ending during return visits');
 await page.locator('#journal').click();await page.locator('[data-tab="tasks"]').click();await snap('06-help-network');assert.equal(await page.locator('.network-list .ready').count(),3);assert.match(await page.locator('.network-list').innerText(),/已向社区报平安/);await close();check('journal delivery state and three-person help network match the ending');
 assert.deepEqual(report.errors,[]);report.status='passed';
}catch(e){report.status='failed';report.failure=e.stack;await snap('failure');process.exitCode=1;console.error(e);}finally{await fs.writeFile(`${dir}/report.json`,JSON.stringify(report,null,2));await browser.close();}
