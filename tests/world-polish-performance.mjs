import {chromium} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {freshState,SAVE_KEY} from '../src/story.js';

// Run after all functional QA browsers close: one context and one page at a
// time. Measurements are observations, not runtime performance overrides.
const base=process.env.GAME_URL||'http://127.0.0.1:4193/?qa=polish-single-page-performance';
const out=fileURLToPath(new URL('../output/qa/world-polish-v1/integration/performance/',import.meta.url));
await mkdir(out,{recursive:true});
const report={startedAt:new Date().toISOString(),base,scope:'single isolated page per sample; no other QA browser; five-second actual RAF samples',samples:[],errors:[],sourceHashes:{}};
for(const file of ['src/main.js','src/world.js','src/world-particles.js','src/ui/world-hud-theme.css'])report.sourceHashes[file]=createHash('sha256').update(await readFile(new URL('../'+file,import.meta.url))).digest('hex');
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
 for(const sample of [{name:'core-1440',width:1440,height:900,position:{x:1,z:21}},{name:'market-1280',width:1280,height:720,position:{x:92,z:8}},{name:'after-rain-1440',width:1440,height:900,position:{x:-20,z:21},rain:true}]){
  const value=freshState();value.started=true;value.position=sample.position;value.flags=['storyV3','received','radio'];if(sample.rain)value.flags.push('granny','chef','dock','prepared','checked','ending','postlude');Object.assign(value.settings,{sound:false,reduced:false,quality:'high',cameraMode:'street'});
  const context=await browser.newContext({viewport:{width:sample.width,height:sample.height}});
  await context.addInitScript(({key,value})=>localStorage.setItem(key,JSON.stringify(value)),{key:SAVE_KEY,value});
  const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));await page.goto(base);
  await page.waitForFunction(()=>window.__JIANGCHENG__&&document.querySelector('#boot').hidden,null,{timeout:120000});await page.locator('#start').click();await page.waitForTimeout(1500);
  if(!report.assets)report.assets=await page.locator('script[src],link[rel=stylesheet]').evaluateAll(ns=>ns.map(n=>n.src||n.href));
  const result=await page.evaluate(()=>new Promise(resolve=>{let start,last;const times=[],before=__JIANGCHENG__.getWorld(),particlesBefore=__JIANGCHENG__.getPresentation().particles;function step(t){if(start===undefined)start=last=t;else{times.push(t-last);last=t;}if(t-start<5000){requestAnimationFrame(step);return;}const sorted=[...times].sort((a,b)=>a-b),after=__JIANGCHENG__.getWorld(),presentation=__JIANGCHENG__.getPresentation();resolve({documentHidden:document.hidden,durationMs:t-start,frames:times.length,fps:times.length*1000/(t-start),p95Ms:sorted[Math.floor(sorted.length*.95)],p99Ms:sorted[Math.floor(sorted.length*.99)],maxMs:sorted.at(-1),shadowUpdates:after.shadow.updates-before.shadow.updates,shadowRequests:after.shadow.requests-before.shadow.requests,particleUpdates:presentation.particles.updates-particlesBefore.updates,particles:presentation.particles,hud:presentation.hud,drawCalls:after.drawCalls,triangles:after.triangles,worldFrameDelta:after.renderFrame-before.renderFrame});}requestAnimationFrame(step);}));
  report.samples.push({...sample,...result});await page.screenshot({path:out+sample.name+'.png'});await context.close();console.log(sample.name,JSON.stringify(result));
 }
}finally{await browser.close();report.finishedAt=new Date().toISOString();await writeFile(out+'report.json',JSON.stringify(report,null,2));}
