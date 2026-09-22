import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';

const dir='output/qa/messenger-overhaul/third-person';
await mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1920,height:1080}});
const report={started:new Date().toISOString(),base:'http://127.0.0.1:4173',checks:[],screenshots:[],errors:[],measurements:[]};
page.on('pageerror',e=>report.errors.push(e.message));
const data=()=>page.evaluate(()=>window.__JIANGCHENG__.getWorld());
const check=name=>{report.checks.push(name);console.log('PASS',name);};
async function snap(name){await page.screenshot({path:`${dir}/${name}.png`});report.screenshots.push(name+'.png');}
async function go(id){
 await page.locator('#map').click();await page.locator(`[data-place="${id}"]`).click();await page.locator('#map-go').click();
 await page.waitForFunction(id=>window.__JIANGCHENG__.getNearest()===id&&window.__JIANGCHENG__.getWorld().remainingRoute===0,id,{timeout:60000});
 await page.waitForTimeout(600);
}
async function measure(label){
 const result=await page.evaluate(async()=>{
  const frames=[];let last=performance.now(),start=last;
  await new Promise(resolve=>{function frame(t){frames.push(t-last);last=t;if(t-start<4000)requestAnimationFrame(frame);else resolve();}requestAnimationFrame(frame);});
  frames.shift();frames.sort((a,b)=>a-b);
  const mean=frames.reduce((a,b)=>a+b,0)/frames.length;
  return {frames:frames.length,meanMs:mean,fps:1000/mean,p99Ms:frames[Math.floor(frames.length*.99)],world:window.__JIANGCHENG__.getWorld()};
 });
 report.measurements.push({label,...result});
}
try{
 await page.goto(report.base);await page.locator('#boot').waitFor({state:'hidden',timeout:60000});
 report.assets=await page.locator('script[src],link[rel="stylesheet"]').evaluateAll(els=>els.map(el=>el.src||el.href));
 report.environment=await page.evaluate(()=>{const gl=document.querySelector('#world').getContext('webgl2'),info=gl.getExtension('WEBGL_debug_renderer_info');return {userAgent:navigator.userAgent,dpr:devicePixelRatio,viewport:[innerWidth,innerHeight],renderer:info?gl.getParameter(info.UNMASKED_RENDERER_WEBGL):'unavailable'};});
 await page.locator('#start').click();await page.waitForTimeout(1500);
 assert.equal((await data()).cameraMode,'street');await snap('01-arrival-1920');
 const initial=await data();report.initialFrame=initial.playerFrame;
 const ratio=(initial.playerFrame.feet.y-initial.playerFrame.head.y)/1080;report.characterScreenRatio=ratio;
 assert.ok(ratio>=.32&&ratio<=.40,`initial character ratio ${ratio}`);check('Landscape close camera frames the playable character at 32–40% height');
 await page.keyboard.down('w');await page.waitForTimeout(550);await page.keyboard.up('w');await page.waitForTimeout(450);const stopped=(await data()).position;
 await page.waitForTimeout(600);const settled=(await data()).position;assert.ok(Math.hypot(stopped.x-settled.x,stopped.z-settled.z)<.003);check('Keyboard movement decelerates and remains still after release');
 await go('shop');await snap('02-repair-shop');await page.locator('#interact').click();await page.waitForTimeout(1000);assert.ok((await data()).conversation);const panel=await page.locator('.dialogue-box').boundingBox();for(const actor of (await data()).conversation.actors){assert.ok(actor.head.y>145&&actor.feet.y<panel.y-8,'Shop dialogue keeps the character above its subtitles');}check('Close shop dialogue keeps the whole character above the subtitle panel');await snap('03-shop-live-dialogue');
 await page.keyboard.press('Escape');await page.mouse.move(900,430);await page.mouse.down();await page.mouse.move(980,440,{steps:8});await page.mouse.up();const heading=(await data()).heading;await page.waitForTimeout(450);assert.ok(Math.abs((await data()).heading-heading)<.025);check('Dragging immediately after dialogue takes camera ownership');
 await page.locator('#first-person').click();const first=(await data()).heading;await page.locator('#first-person').click();assert.ok(Math.abs((await data()).heading-first)<.025);check('First-person toggle preserves viewing direction');
 for(const id of ['granny','chef','dock']){
  await go(id);await snap(`04-route-${id}`);const world=await data();
  assert.ok(world.camera.every(Number.isFinite));assert.ok(world.camera[1]<6);assert.ok(world.playerFrame.head.visible&&world.playerFrame.feet.visible,`${id}: near-wall framing must keep the whole character visible`);check(`${id} reached with a close, finite camera`);
 }
 await page.setViewportSize({width:1440,height:900});await page.waitForTimeout(400);await snap('05-landscape-1440');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);check('1440×900 landscape remains usable without horizontal overflow');
 await page.setViewportSize({width:2560,height:1440});await page.waitForTimeout(350);await snap('05-landscape-2560');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);check('2560×1440 landscape remains usable');
 await page.setViewportSize({width:1920,height:1080});await go('chef');await measure('1920×1080 high, breakfast idle');
 const shadowBefore=(await data()).shadow.updates;
 await page.keyboard.down('s');await measure('1920×1080 high, moving away from breakfast');await page.keyboard.up('s');
 assert.equal((await data()).shadow.updates,shadowBefore);check('Walking and animated residents do not rebake static shadows');
 await page.locator('#settings').click();await page.locator('#set-quality').selectOption('low');await page.locator('.close').click();await measure('1920×1080 low');await snap('06-low-quality');
 assert.deepEqual(report.errors,[]);check('No unhandled browser errors');report.completed=new Date().toISOString();
}catch(error){report.failure=error.stack;console.error(error);await snap('failure');process.exitCode=1;}
finally{await writeFile(`${dir}/report.json`,JSON.stringify(report,null,2));await browser.close();}
