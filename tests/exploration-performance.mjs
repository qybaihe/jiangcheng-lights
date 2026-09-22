import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const directory=process.env.QA_DIR||'output/qa/messenger-overhaul/performance';await mkdir(directory,{recursive:true});
const seconds=Number(process.env.QA_SECONDS||70);
assert.ok(Number.isFinite(seconds)&&seconds>=30&&seconds<=900,'QA_SECONDS must be between 30 and 900');
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1920,height:1080}});
const errors=[];page.on('pageerror',error=>errors.push(error.message));
page.on('console',message=>{if(message.text().startsWith('PERFORMANCE '))console.log(message.text());});
await page.goto(process.env.GAME_URL||'http://127.0.0.1:4173');await page.locator('#boot').waitFor({state:'hidden',timeout:60000});await page.locator('#start').click();
const assets=await page.locator('script[src]').evaluateAll(els=>els.map(e=>e.src));
if(process.env.EXPECTED_BUILD_ASSET)assert.ok(assets.some(asset=>new URL(asset).pathname===process.env.EXPECTED_BUILD_ASSET),'Performance run must use the frozen build');
const environment=await page.evaluate(()=>{
 const gl=document.querySelector('#world').getContext('webgl2'),debug=gl?.getExtension('WEBGL_debug_renderer_info');
 return {devicePixelRatio,hardwareConcurrency:navigator.hardwareConcurrency,gpu:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl?.getParameter(gl.RENDERER)};
});
const route=['granny','dock','chef','shop','community','box'];
let monitorDone=false;const visited=[];
const monitor=page.evaluate(async seconds=>{
 const frames=[],stalls=[],snapshots=[];let previous=performance.now(),start=previous,moving=false,lastPosition=null,frame=0,nextSnapshot=0;
 await new Promise(resolve=>{function sample(t){
  if(frame++%6===0){const state=window.__JIANGCHENG__.getWorld(),p=state.position;moving=state.moveSpeed>.1&&!state.suspended&&(!lastPosition||Math.hypot(p.x-lastPosition.x,p.z-lastPosition.z)>.01);lastPosition=p;}
  if(moving){frames.push(t-previous);if(t-previous>100)stalls.push({atSeconds:(t-start)/1000,frameMs:t-previous,world:window.__JIANGCHENG__.getWorld()});}
  if(t-start>=nextSnapshot){
   const world=window.__JIANGCHENG__.getWorld();snapshots.push({atSeconds:(t-start)/1000,world});
   if(nextSnapshot>0&&nextSnapshot%60000===0){const total=frames.reduce((a,b)=>a+b,0);console.log('PERFORMANCE '+JSON.stringify({elapsedSeconds:Math.round((t-start)/1000),movingSeconds:Math.round(total/1000),meanFps:Math.round(1000*frames.length/total),shadow:world.shadow}));}
   nextSnapshot+=10000;
  }
  previous=t;
  if(t-start<seconds*1000)requestAnimationFrame(sample);else resolve();
 }requestAnimationFrame(sample);});
 const sorted=frames.slice().sort((a,b)=>a-b),sum=frames.reduce((a,b)=>a+b,0),slow=sorted.slice(-Math.max(1,Math.ceil(sorted.length*.01)));
 return {durationSeconds:seconds,movingSeconds:sum/1000,frames:frames.length,meanFps:1000/(sum/frames.length),onePercentLowFps:1000/(slow.reduce((a,b)=>a+b,0)/slow.length),p99Ms:sorted[Math.floor(sorted.length*.99)],stalls,snapshots,frameIntervalsMs:frames,finalWorld:window.__JIANGCHENG__.getWorld()};
},seconds).then(result=>{monitorDone=true;return result;});
try{
 for(let i=0;!monitorDone;i++){
  const id=route[i%route.length];await page.locator('#map').click();await page.locator(`[data-place="${id}"]`).click();await page.locator('#map-go').click();await page.waitForFunction(id=>window.__JIANGCHENG__.getNearest()===id&&window.__JIANGCHENG__.getWorld().remainingRoute===0,id,{timeout:60000});
  visited.push({id,at:new Date().toISOString()});console.log('Reached',id);
 }
 const result=await monitor;
 const report={recorded:new Date().toISOString(),assets,viewport:[1920,1080],quality:'high',weather:'day; story weather transitions are covered by the separate full walkthrough',environment,route,visited,errors,userAgent:await page.evaluate(()=>navigator.userAgent),...result};
 await writeFile(`${directory}/report.json`,JSON.stringify(report,null,2));
 console.log(JSON.stringify({movingSeconds:result.movingSeconds,meanFps:result.meanFps,onePercentLowFps:result.onePercentLowFps,p99Ms:result.p99Ms}));
 assert.deepEqual(errors,[]);assert.ok(result.meanFps>=60,'High quality must sustain 60 FPS during movement');
}finally{await browser.close();}
