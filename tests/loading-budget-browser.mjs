import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const base=process.env.GAME_URL||'http://127.0.0.1:4191';
const baseline=process.env.LOADING_BASELINE==='1';
const out=new URL('../output/qa/edgeone-loading/',import.meta.url);
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'});
const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
const page=await context.newPage(),errors=[],requests=[],completed=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('request',request=>requests.push({url:new URL(request.url()).pathname,at:Date.now()}));
page.on('requestfinished',request=>completed.push({url:new URL(request.url()).pathname,at:Date.now()}));
const session=await context.newCDPSession(page);
await session.send('Network.enable');
await session.send('Network.emulateNetworkConditions',{offline:false,latency:40,downloadThroughput:1250000,uploadThroughput:500000});
const started=Date.now();
try{
 await page.goto(base,{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForFunction(()=>window.__JIANGCHENG__?.getPresentation().loading.state==='complete',{},{timeout:120000});
 const elapsed=Date.now()-started;
 const snapshot=await page.evaluate(()=>({loading:__JIANGCHENG__.getPresentation().loading,avatar:__JIANGCHENG__.getWorld().avatar,residents:__JIANGCHENG__.getResidentAvatars(),audio:__JIANGCHENG__.getAudio(),resources:performance.getEntriesByType('resource').map(r=>({name:new URL(r.name).pathname,bytes:r.encodedBodySize,start:r.startTime,end:r.responseEnd}))}));
 const report={base,baseline,network:{downloadMbps:10,latencyMs:40},bootMs:elapsed,errors,requests:requests.map(r=>({...r,at:r.at-started})),completed:completed.map(r=>({...r,at:r.at-started})),snapshot};
 report.summary={completedModelCount:snapshot.residents.loaded,modelRequestCount:requests.filter(r=>r.url.endsWith('.vrm')).length,completedModelBytes:snapshot.resources.filter(r=>r.name.endsWith('.vrm')).reduce((n,r)=>n+r.bytes,0),residentRequests:requests.filter(r=>r.url.startsWith('/models/residents/')).length,audioVideoRequests:requests.filter(r=>/\.(mp3|ogg|mp4|wav|webm)$/.test(r.url)).length};
 if(!baseline)assert.equal(snapshot.avatar.state,'ready');assert.equal(report.summary.audioVideoRequests,0);assert.deepEqual(errors,[]);
 await page.screenshot({path:fileURLToPath(new URL(`${baseline?'baseline':'optimized'}-welcome.png`,out))});
 if(!baseline){
  assert.equal(report.summary.residentRequests,0,'no resident requests compete with the selected protagonist');
  await page.waitForFunction(()=>__JIANGCHENG__.getResidentAvatars().state==='ready',{},{timeout:120000});
  report.eventualResidents=await page.evaluate(()=>__JIANGCHENG__.getResidentAvatars());
  assert.equal(report.eventualResidents.loaded,9);
  await page.locator('#start-window').click();
  await page.waitForFunction(()=>__JIANGCHENG__.getWorld().active,{},{timeout:15000});
  report.started=await page.evaluate(()=>({active:__JIANGCHENG__.getWorld().active,modal:__JIANGCHENG__.getModal()}));
 }
 report.status='passed';
 await writeFile(new URL(`${baseline?'baseline':'optimized'}-report.json`,out),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({status:report.status,bootMs:elapsed,...report.summary,eventualResidents:report.eventualResidents?.loaded},null,2));
}finally{await browser.close();}
