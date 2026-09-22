import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const base=process.env.GAME_URL||'http://127.0.0.1:4173';
const dir=path.resolve(process.env.QA_DIR||'output/qa/character-choice/final');
await fs.mkdir(dir,{recursive:true});
const report={base,method:'Native browser UI, keyboard and mouse; read-only game diagnostics. One intentional HTTP 503 checks model-switch recovery.',shots:[],errors:[],expectedFailures:[],checks:[]};
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1920,height:1080}});
let injectingFailure=false;
page.on('pageerror',e=>report.errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')(injectingFailure?report.expectedFailures:report.errors).push(m.text());});
const read=()=>page.evaluate(()=>({world:window.__JIANGCHENG__.getWorld(),state:window.__JIANGCHENG__.getState(),modal:window.__JIANGCHENG__.getModal()}));
async function shot(name){await page.screenshot({path:path.join(dir,name+'.png')});report.shots.push({name,...await read()});}
async function ready(id){await page.waitForFunction(id=>window.__JIANGCHENG__.getWorld().avatar?.id===id&&window.__JIANGCHENG__.getWorld().avatar?.state==='ready',id,{timeout:60000});await page.waitForFunction(()=>[...document.querySelectorAll('[data-avatar-picker]')].every(p=>p.getAttribute('aria-busy')!=='true'));}
async function select(context,id){await page.locator(`[data-avatar-picker="${context}"] [data-avatar-option="${id}"]`).click();await ready(id);}
async function face(yaw){for(let i=0;i<7;i++){const {world:w}=await read();const d=Math.atan2(Math.sin(yaw-w.heading),Math.cos(yaw-w.heading));if(Math.abs(d)<.03)break;await page.mouse.move(960,430);await page.mouse.down();await page.mouse.move(960+Math.max(-520,Math.min(520,d/.0024)),430,{steps:12});await page.mouse.up();await page.waitForTimeout(180);}}
try{
 await page.goto(base);await page.locator('#boot').waitFor({state:'hidden',timeout:60000});await ready('female');
 report.assets=await page.locator('script[src],link[rel="stylesheet"]').evaluateAll(nodes=>nodes.map(n=>n.src||n.href));
 if(process.env.EXPECTED_BUILD_ASSET)assert(report.assets.some(u=>new URL(u).pathname===process.env.EXPECTED_BUILD_ASSET));
 assert(await page.locator('#welcome-avatar img').evaluateAll(imgs=>imgs.length===2&&imgs.every(img=>img.complete&&img.naturalWidth>0)),'both model portraits must load');
 await shot('01-welcome-female');
 await select('welcome','male');assert.equal((await read()).state.settings.avatarId,'male');await shot('02-welcome-male');
 await page.locator('#start').click();await page.waitForTimeout(700);await face(Math.atan2(10.5,-4));await shot('03-male-front');
 await face(0);const start=(await read()).world.position;await page.keyboard.down('w');await page.keyboard.down('Shift');await page.waitForTimeout(500);await page.keyboard.press('Space');await page.waitForTimeout(180);assert.equal((await read()).world.playerMotion.grounded,false);await shot('04-male-run-jump');await Promise.all(['w','Shift'].map(key=>page.keyboard.up(key)));
 await page.waitForFunction(()=>window.__JIANGCHENG__.getWorld().playerMotion.grounded&&window.__JIANGCHENG__.getWorld().moveSpeed<.03);assert(Math.hypot((await read()).world.position.x-start.x,(await read()).world.position.z-start.z)>.5);
 await page.locator('#map').click();await page.locator('#map-destination').selectOption('shop');await page.locator('#map-go').click();await page.waitForFunction(()=>window.__JIANGCHENG__.getWorld().remainingRoute===0&&window.__JIANGCHENG__.getWorld().moveSpeed<.03,null,{timeout:60000});
 await page.locator('#interact').click();await page.waitForTimeout(800);await page.locator('#story-next').click();await shot('05-male-dialogue');
 for(let i=0;i<25&&(await read()).modal==='story';i++)await page.locator('#story-next').click();
 assert((await read()).state.flags.includes('received'));await page.keyboard.press('Escape');await page.waitForTimeout(800);
 await page.locator('#first-person').click();assert.equal((await read()).world.cameraMode,'first');
 await page.locator('#settings').click();const progress=(await read()).state,position=(await read()).world.position;
 await select('settings','female');await shot('06-settings-female');
 const after=(await read());assert.equal(after.world.cameraMode,'first');assert.deepEqual(after.state.flags,progress.flags);assert.deepEqual(after.state.lore,progress.lore);assert.deepEqual(after.state.supplies,progress.supplies);assert.deepEqual(after.world.position,position);
 await select('settings','male');await shot('07-settings-male');
 injectingFailure=true;await page.route('**/models/ayao.vrm',route=>route.fulfill({status:503,body:'Intentional avatar QA failure'}));
 await page.locator('[data-avatar-picker="settings"] [data-avatar-option="female"]').click();
 await page.waitForFunction(()=>document.querySelector('[data-avatar-picker="settings"]').classList.contains('has-error'));
 const failed=await read();assert.equal(failed.world.avatar.id,'male');assert.equal(failed.state.settings.avatarId,'male');assert.deepEqual(failed.state.flags,progress.flags);await shot('08-recoverable-load-error');
 await page.unroute('**/models/ayao.vrm');injectingFailure=false;
 await select('settings','female');await select('settings','male');await page.keyboard.press('Escape');
 await page.reload();await page.locator('#boot').waitFor({state:'hidden',timeout:60000});await ready('male');assert.equal((await read()).state.settings.avatarId,'male');assert.deepEqual((await read()).state.flags,progress.flags);
 await page.locator('#start').click();await page.waitForTimeout(400);assert.equal((await read()).world.cameraMode,'first');await shot('09-male-saved-first-person');
 await page.locator('#first-person').click();await page.waitForTimeout(800);assert.equal((await read()).world.playerVisible,true);await shot('10-male-return-third-person');
 await page.locator('#brand').click();
 for(const viewport of [{width:1366,height:768},{width:390,height:844}]){
  await page.setViewportSize(viewport);await page.waitForTimeout(200);await page.locator('#welcome-avatar').scrollIntoViewIfNeeded();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal page overflow');
  await shot(`11-welcome-${viewport.width}`);
 }
 report.checks=['female and male thumbnails','welcome selection','male walk and jump','3D conversation','settings switching preserves earned flag and position','first-person eye-height switch','HTTP 503 retains old character and saved selection','retry succeeds','reload retains male choice and first-person mode','return to third person','1920, 1366 and 390 pixel layouts'];
 assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.failure=error.stack;process.exitCode=1;console.error(error);await shot('failure').catch(()=>{});}
finally{await browser.close();await fs.writeFile(path.join(dir,'report.json'),JSON.stringify(report,null,2));console.log(report.status);}
