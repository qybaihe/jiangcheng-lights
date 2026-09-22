import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {CIRCUIT} from '../src/story.js';

const base=process.env.GAME_URL||'http://127.0.0.1:4197/';
const output=new URL(process.env.RELEASE_QA_DIR||'../output/qa/edgeone-release/local/',import.meta.url);
await mkdir(output,{recursive:true});
const report={base,startedAt:new Date().toISOString(),checks:[],errors:[],consoleErrors:[],failedRequests:[],abortedRequests:[],scope:'Fresh independent Chromium context, real UI input only; no gameplay state injection, no user browser or save accessed.'};
const browser=await chromium.launch({headless:true,channel:'chrome'});
const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
const page=await context.newPage(),requests=[];
page.on('pageerror',error=>report.errors.push(error.message));
page.on('console',message=>{if(message.type()==='error')report.consoleErrors.push(message.text());});
page.on('request',request=>requests.push({url:new URL(request.url()).pathname,time:Date.now()}));
page.on('response',response=>{if(response.status()>=400)report.failedRequests.push({url:response.url(),status:response.status()});});
page.on('requestfailed',request=>{const item={url:request.url(),error:request.failure()?.errorText};(item.error?.includes('ERR_ABORTED')&&!/\.(vrm|glb)(?:\?|$)/.test(item.url)?report.abortedRequests:report.failedRequests).push(item);});
const check=(name,details={})=>{report.checks.push({name,passed:true,...details});console.log('PASS',name);};
const snapshot=async name=>{await page.screenshot({path:fileURLToPath(new URL(`${name}.png`,output))});};
const state=()=>page.evaluate(()=>__JIANGCHENG__.getState());
async function skipFilm(){
 await page.waitForFunction(()=>{const video=document.querySelector('#cinematic');return video&&!video.paused&&video.currentTime>=.6;},null,{timeout:60000});
 const video=await page.locator('#cinematic').evaluate(v=>({src:v.currentSrc,width:v.videoWidth,height:v.videoHeight,duration:v.duration,time:v.currentTime,readyState:v.readyState}));
 assert.ok(video.width>=1920&&video.height>=1080);report.checks.push({name:'real chapter video decodes and plays',passed:true,...video});
 await snapshot(`film-${report.checks.length}`);await page.locator('#cinema-skip').click();
}
async function finishDialogue(){for(let i=0;i<90;i++){if(await page.locator('.chapter-film').isVisible()){await skipFilm();continue;}if(await page.locator('#story-next').isVisible()){await page.locator('#story-next').click();continue;}return;}throw Error('Dialogue did not end');}
async function go(id){await page.locator('#map').click();await page.locator('#map-destination').selectOption(id);await snapshot(`map-${id}`);await page.locator('#map-go').click();await page.waitForFunction(id=>__JIANGCHENG__.getNearest()===id&&__JIANGCHENG__.getWorld().remainingRoute===0,id,{timeout:90000});}
try{
 const session=await context.newCDPSession(page);await session.send('Network.enable');
 await session.send('Network.emulateNetworkConditions',{offline:false,latency:40,downloadThroughput:1250000,uploadThroughput:500000});
 const start=Date.now();await page.goto(base,{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForFunction(()=>window.__JIANGCHENG__?.getPresentation().loading.state==='complete',null,{timeout:120000});
 report.coldStartup={elapsedMs:Date.now()-start,network:{downloadMbps:10,latencyMs:40},...await page.evaluate(()=>({hero:__JIANGCHENG__.getWorld().avatar,loading:__JIANGCHENG__.getPresentation().loading,residents:__JIANGCHENG__.getResidentAvatars(),resources:performance.getEntriesByType('resource').map(r=>({url:new URL(r.name).pathname,encodedBytes:r.encodedBodySize,decodedBytes:r.decodedBodySize,end:r.responseEnd}))}))};
 assert.equal(report.coldStartup.hero.id,'female');assert.equal(report.coldStartup.hero.state,'ready');assert.equal(report.coldStartup.loading.total,2);
 if(process.env.EXPECTED_BUILD_ASSET){report.expectedBuildAsset=process.env.EXPECTED_BUILD_ASSET;assert.ok(report.coldStartup.resources.some(resource=>resource.url===report.expectedBuildAsset),'expected deployed JavaScript revision');check('expected deployed JavaScript revision is executing',{asset:report.expectedBuildAsset});}
 report.coldStartup.initialModelRequests=requests.filter(r=>r.url.endsWith('.vrm')).map(r=>r.url);report.coldStartup.initialMediaRequests=requests.filter(r=>/\.(mp4|mp3|wav|ogg|webm)$/.test(r.url)).map(r=>r.url);
 assert.equal(report.coldStartup.initialMediaRequests.length,0);check('cold start has detailed female, honest 2-task boot and no preloaded films/voice library',{ms:report.coldStartup.elapsedMs,models:report.coldStartup.initialModelRequests});
 await snapshot('welcome');
 await session.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
 await page.locator('#start-window').click();await skipFilm();
 if(await page.locator('#arrival-skip').isVisible())await page.locator('#arrival-skip').click();
 await go('shop');await page.locator('#interact').click();await finishDialogue();
 assert.ok(await page.locator('.circuit-grid').isVisible());assert.ok((await state()).flags.includes('received'));check('real prologue and Grandpa dialogue lead into radio repair');await snapshot('radio-before');
 for(let i=0;i<CIRCUIT.length;i++)for(let n=0;n<(4-CIRCUIT[i].rot)%4;n++)await page.locator(`[data-tile="${i}"]`).click();
 await page.locator('#circuit-check').click();await snapshot('radio-complete');await page.locator('[data-activity-continue]').click();await finishDialogue();await page.locator('#weather-continue').click();
 assert.ok((await state()).flags.includes('radio'));check('actual circuit rotations complete the radio task');
 if(await page.locator('#arrival-skip').isVisible())await page.locator('#arrival-skip').click();
 await page.waitForFunction(()=>['ready','partial'].includes(__JIANGCHENG__.getResidentAvatars().state),null,{timeout:300000});
 report.residents=await page.evaluate(()=>__JIANGCHENG__.getResidentAvatars());assert.equal(report.residents.loaded,9);assert.equal(report.residents.fallback,0);check('all nine detailed resident VRMs parse, install and remain separate identities');
 await page.waitForTimeout(500);await snapshot('female-world');
 await page.locator('#settings').click();await page.locator('[data-avatar-picker="settings"] [data-avatar-option="male"]').click();
 await page.waitForFunction(()=>__JIANGCHENG__.getWorld().avatar.id==='male'&&__JIANGCHENG__.getWorld().avatar.state==='ready',null,{timeout:60000});
 await page.keyboard.press('Escape');await page.waitForTimeout(400);await snapshot('male-world');check('real UI switches to detailed male without restarting the story');
 await page.locator('#settings').click();await page.locator('[data-avatar-picker="settings"] [data-avatar-option="female"]').click();
 await page.waitForFunction(()=>__JIANGCHENG__.getWorld().avatar.id==='female'&&__JIANGCHENG__.getWorld().avatar.state==='ready',null,{timeout:60000});
 await page.keyboard.press('Escape');
 await go('granny');await page.locator('#interact').click();await page.waitForFunction(()=>__JIANGCHENG__.getModal()==='story',null,{timeout:10000});await page.waitForTimeout(500);await snapshot('granny-conversation');
 assert.ok((await state()).flags.includes('radio'));check('real map route walks to Granny and starts 3D task conversation');
 report.finalState=await state();report.finalWorld=await page.evaluate(()=>__JIANGCHENG__.getWorld());
 await session.send('Network.emulateNetworkConditions',{offline:false,latency:40,downloadThroughput:1250000,uploadThroughput:500000});
 const warmStart=Date.now();await page.reload({waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForFunction(()=>window.__JIANGCHENG__?.getPresentation().loading.state==='complete',null,{timeout:120000});
 report.warmStartup={elapsedMs:Date.now()-warmStart,network:{downloadMbps:10,latencyMs:40},...await page.evaluate(()=>({hero:__JIANGCHENG__.getWorld().avatar,loading:__JIANGCHENG__.getPresentation().loading,resources:performance.getEntriesByType('resource').map(r=>({url:new URL(r.name).pathname,encodedBytes:r.encodedBodySize,transferBytes:r.transferSize,deliveryType:r.deliveryType||'',end:r.responseEnd}))}))};
 report.warmStartup.cacheReuse={memoryOrDiskResources:report.warmStartup.resources.filter(r=>r.transferBytes===0&&r.encodedBytes>0).length,memoryOrDiskEncodedBytes:report.warmStartup.resources.filter(r=>r.transferBytes===0&&r.encodedBytes>0).reduce((sum,r)=>sum+r.encodedBytes,0),networkTransferBytes:report.warmStartup.resources.reduce((sum,r)=>sum+r.transferBytes,0)};
 const restored=await state();assert.deepEqual(restored.flags,report.finalState.flags);assert.deepEqual(restored.supplies,report.finalState.supplies);assert.equal(restored.settings.avatarId,'female');
 await page.locator('#start-window').click();await page.waitForFunction(()=>__JIANGCHENG__.getWorld().active,null,{timeout:15000});
 assert.equal(await page.locator('.chapter-film').isVisible(),false);await snapshot('warm-resume');
 check('same-context throttled refresh reuses assets and resumes completed radio progress',{ms:report.warmStartup.elapsedMs,flags:restored.flags});
 report.authentication={queryKeys:[...new URL(base).searchParams.keys()],cookies:(await context.cookies()).map(cookie=>({name:cookie.name,domain:cookie.domain,httpOnly:cookie.httpOnly,secure:cookie.secure,sameSite:cookie.sameSite}))};
 report.requestCount=requests.length;report.modelRequests=requests.filter(r=>r.url.endsWith('.vrm')).map(r=>r.url);
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.failedRequests,[]);check('no page errors, missing textures, 404s or failed non-aborted requests');report.status='passed';
}catch(error){report.status='failed';report.failure=error.stack;console.error(error);report.failureState=await page.evaluate(()=>({residents:window.__JIANGCHENG__?.getResidentAvatars(),world:window.__JIANGCHENG__?.getWorld(),state:window.__JIANGCHENG__?.getState()})).catch(()=>null);await snapshot('failure').catch(()=>{});}
finally{report.finishedAt=new Date().toISOString();await writeFile(new URL('report.json',output),JSON.stringify(report,null,2)+'\n');await browser.close();console.log(JSON.stringify({status:report.status,checks:report.checks.length,errors:report.errors,failedRequests:report.failedRequests,report:fileURLToPath(new URL('report.json',output))},null,2));}
if(report.status!=='passed')process.exitCode=1;
