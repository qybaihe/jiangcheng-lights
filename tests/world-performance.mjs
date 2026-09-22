import {chromium} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {cpus} from 'node:os';
import {freshState,SAVE_KEY} from '../src/story.js';

// One isolated page at a time. Pause other active WebGL previews before running.
// This measures the actual game, including its HUD, route refresh and town life.
const BASE=process.env.GAME_URL||'http://127.0.0.1:5173';
const report={date:new Date().toISOString(),gameUrl:BASE,cpu:cpus()[0]?.model,viewport:{width:1440,height:900},sampling:'4 seconds per case after warmup; first-person includes W walking; town life and navigation HUD enabled',samples:[],errors:[],sourceHashes:{}};
for(const file of['src/world.js','src/main.js','src/style.css','src/town-life.js','src/characters.js','src/architecture.js','src/atmosphere.js','src/landmarks.js'])report.sourceHashes[file]=createHash('sha256').update(await readFile(new URL('../'+file,import.meta.url))).digest('hex');
const browser=await chromium.launch({headless:true,channel:'chrome'});report.browser=browser.version();
try{
 for(const quality of(process.env.QUALITY_FILTER?process.env.QUALITY_FILTER.split(','):['high','low'])){
  const context=await browser.newContext({viewport:report.viewport,deviceScaleFactor:1});
  const save=freshState();save.started=true;save.flags=['received','radio','granny','chefRequested'];save.settings={sound:false,reduced:false,quality,cameraMode:'street'};
  await context.addInitScript(({key,save})=>localStorage.setItem(key,JSON.stringify(save)),{key:SAVE_KEY,save});
  const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto(BASE);await page.locator('#boot').waitFor({state:'hidden',timeout:60000});await page.locator('#start').click();await page.waitForTimeout(1600);
  for(const mode of['first','street','overview']){
   for(let i=0;i<3&&(await page.evaluate(()=>__JIANGCHENG__.getWorld().cameraMode))!==mode;i++)await page.locator('#view-mode').click();
   await page.waitForTimeout(600);if(mode==='first')await page.keyboard.down('w');
   const sample=await page.evaluate(duration=>new Promise(resolve=>{
    const intervals=[],before=__JIANGCHENG__.getWorld();let start,last;
    function frame(now){if(start===undefined){start=last=now;requestAnimationFrame(frame);return;}intervals.push(now-last);last=now;if(now-start<duration){requestAnimationFrame(frame);return;}
     const sorted=[...intervals].sort((a,b)=>a-b),elapsed=now-start,after=__JIANGCHENG__.getWorld();
     resolve({fps:Math.round(intervals.length/elapsed*1e6)/1000,medianMs:sorted[Math.floor(sorted.length*.5)],p95Ms:sorted[Math.floor(sorted.length*.95)],p99Ms:sorted[Math.floor(sorted.length*.99)],elapsedMs:elapsed,frames:intervals.length,actualRenderedFrames:after.shadow.renderedFrames-before.shadow.renderedFrames,shadowUpdates:after.shadow.updates-before.shadow.updates,drawCalls:after.drawCalls,triangles:after.triangles,from:before.position,to:after.position,routeActive:Boolean(after.navigation?.reachable),frameTimesMs:intervals});
    }requestAnimationFrame(frame);
   }),4000);
   if(mode==='first')await page.keyboard.up('w');
   report.samples.push({quality,mode,...sample});
  }
  await context.close();
 }
 report.status=report.errors.length?'failed':'measured';
}finally{
 await browser.close();const output=fileURLToPath(new URL('../output/qa/',import.meta.url));await mkdir(output,{recursive:true});await writeFile(output+(process.env.REPORT_NAME||'world-performance.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({...report,sourceHashes:undefined,samples:report.samples.map(({frameTimesMs,...sample})=>sample)},null,2));
}
