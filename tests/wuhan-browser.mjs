import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {freshState,SAVE_KEY,DIALOGUES} from '../src/story.js';
import {WUHAN_DISTRICT_STOPS,PLAYABLE_BOUNDS} from '../src/wuhan-district-layout.js';
import {WUHAN_MEMORIES,memoryForResidentTopic} from '../src/wuhan-memories.js';
import {MEMORY_BOUNDARIES} from '../src/dialogue-presentation.js';

const preview=process.env.WUHAN_QA_MODE==='geometry-preview';
const BASE=process.env.GAME_URL||'http://127.0.0.1:4173/?v=wuhan-v1';
assert.ok(['127.0.0.1','localhost'].includes(new URL(BASE).hostname));
const out=new URL(process.env.WUHAN_QA_DIR||'../output/qa/wuhan-v1/integration/',import.meta.url);await mkdir(out,{recursive:true});
const report={startedAt:new Date().toISOString(),base:BASE,mode:preview?'geometry-preview':'integration',status:'running',checks:[],cases:[],screenshots:[],samples:[],errors:[],failedRequests:[],limitations:['Isolated starting saves establish story phase; this is not a complete story playthrough.','All movement and memory interactions use rendered UI or keyboard controls; exposed world APIs are read-only.','Performance samples describe this local Chromium run only.']};
let browser,activePage,activeCase='setup';
function check(condition,name,detail={}){report.checks.push({case:activeCase,name,passed:Boolean(condition),...detail});assert.ok(condition,name);console.log('PASS',name);}
const world=page=>page.evaluate(()=>__JIANGCHENG__.getWorld());
const state=page=>page.evaluate(()=>__JIANGCHENG__.getState());
const props=page=>page.evaluate(()=>__JIANGCHENG__.getProps().runtime);
const d=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
function fixture(extra={}){const s=freshState();s.started=true;s.flags=['storyV3','received','radio'];Object.assign(s.settings,{sound:false,quality:'high',reduced:false,cameraMode:'street',avatarId:'female'});return Object.assign(s,extra);}
async function ready(page){await page.waitForFunction(()=>window.__JIANGCHENG__&&document.querySelector('#boot').hidden&&__JIANGCHENG__.getResidentAvatars()?.residents.every(r=>r.state==='ready'),null,{timeout:120000});}
async function openCase(name,initial=fixture()){
 activeCase=name;report.cases.push({name,status:'running',fixture:{position:initial.position,flags:initial.flags}});
 const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
 await context.addInitScript(({key,initial})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(initial));},{key:SAVE_KEY,initial});
 const page=await context.newPage();activePage=page;
 page.on('pageerror',e=>report.errors.push({case:name,message:e.message}));page.on('response',r=>{if(r.status()>=400)report.failedRequests.push({case:name,url:r.url(),status:r.status()});});
 await page.goto(BASE);await ready(page);
 const assets=await page.locator('script[src],link[rel=stylesheet]').evaluateAll(ns=>ns.map(n=>n.src||n.href));
 if(report.assets)assert.deepEqual(assets,report.assets,'same frozen build');else report.assets=assets;
 if(process.env.EXPECTED_BUILD_ASSET)assert.ok(assets.some(u=>new URL(u).pathname===process.env.EXPECTED_BUILD_ASSET),'expected frozen JS');
 await page.locator('#start').click();await page.waitForFunction(()=>__JIANGCHENG__.getWorld().active&&__JIANGCHENG__.getModal()===null);await page.waitForTimeout(1000);
 return {page,context};
}
async function shot(page,name){const file=name+'.png';await page.screenshot({path:fileURLToPath(new URL(file,out))});report.screenshots.push({case:activeCase,file});await writeFile(new URL(name+'.json',out),JSON.stringify({world:await world(page),props:await props(page),state:await state(page)},null,2));}
async function go(page,id){
 await page.locator('#map').click();await page.locator('#map-destination').selectOption(id);assert.equal(await page.locator('#map-go').isDisabled(),false,id+' reachable');
 const route=await page.evaluate(id=>__JIANGCHENG__.getNavigation(id),id);
 check(route?.reachable&&route.path.length>0,id+': map has an actual reachable route',{distance:route.distance,path:route.path});
 const routeCheck=await page.evaluate(path=>{let count=0,bad=[];for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i],steps=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.15);for(let n=0;n<=steps;n++){const f=n/Math.max(1,steps),x=a.x+(b.x-a.x)*f,z=a.z+(b.z-a.z)*f;count++;if(!__JIANGCHENG__.canWalk(x,z))bad.push({x,z});}}return {count,bad:bad.slice(0,6)};},route.path);
 check(routeCheck.bad.length===0,id+': every 15cm route sample clears buildings and boundaries',routeCheck);
 await page.locator('#map-go').click();await page.waitForFunction(id=>__JIANGCHENG__.getWorld().remainingRoute===0&&(__JIANGCHENG__.getNearest()===id||__JIANGCHENG__.getProps().nearby?.id===id),id,{timeout:120000});
 const w=await world(page);check(Math.abs(w.position.y-w.groundHeight)<.025,id+': actual arrival remains grounded',{position:w.position,groundHeight:w.groundHeight});
}
async function memoryFrame(page,id,label){
 const card=page.locator(`[data-memory-card="${id}"]`);await card.waitFor({state:'visible'});
 await card.locator('[data-memory-image]').first().evaluate(async img=>{await img.decode();});
 const info=await card.locator('[data-memory-image]').first().evaluate(img=>({src:img.currentSrc,width:img.naturalWidth,height:img.naturalHeight,fallback:img.dataset.fallbackUsed||false}));
 check(info.src.endsWith(`/wuhan-memories-v1/${id}.webp`)&&info.width>=1280&&!info.fallback,label+': correct independent Image2 picture is decoded',info);
 const before=await world(page);await page.waitForTimeout(400);const after=await world(page);
 check(!after.suspended&&after.renderFrame>before.renderFrame&&!await page.locator('#world').evaluate(e=>e.hidden),label+': 3D world continues rendering behind the memory');
 await shot(page,label);
 return card;
}
async function memoryLayout(page,id,name){
 for(const [width,height]of [[1440,900],[1280,720]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(1100);
  const layout=await page.evaluate(id=>{const card=document.querySelector(`[data-memory-card="${id}"] .wm-preview`),panel=document.querySelector('.resident-chat')||document.querySelector('.dialogue-box');const c=card.getBoundingClientRect(),p=panel.getBoundingClientRect();return {card:{left:c.left,right:c.right,top:c.top,bottom:c.bottom},panel:{left:p.left,right:p.right,top:p.top,bottom:p.bottom},overflow:document.documentElement.scrollWidth>innerWidth,actors:__JIANGCHENG__.getWorld().conversation?.actors};},id);
  check(!layout.overflow&&layout.card.left>=0&&layout.card.right<=width&&layout.card.top>=0&&layout.card.bottom<layout.panel.top&&layout.panel.bottom<=height+1,`${name}: picture and dialogue never overlap or clip at ${width}×${height}`,layout);
  check(layout.actors?.length===2&&layout.actors.every(a=>a.visible&&['head','feet'].every(part=>a[part].visible&&a[part].y>=0&&a[part].y<layout.panel.top&&a[part].x>=0&&a[part].x<=width)),`${name}: both physical conversation actors fit above subtitles at ${width}×${height}`,{actors:layout.actors});
  await shot(page,`${name}-${width}x${height}`);
 }
 await page.setViewportSize({width:1440,height:900});await page.waitForTimeout(700);
}
async function sample(page,name,ms=3000){
 const value=await page.evaluate(ms=>new Promise(resolve=>{let start,last;const dt=[],before=__JIANGCHENG__.getWorld();function tick(t){if(start===undefined)start=last=t;else{dt.push(t-last);last=t;}if(t-start<ms){requestAnimationFrame(tick);return;}const sorted=dt.slice().sort((a,b)=>a-b),after=__JIANGCHENG__.getWorld();resolve({fps:dt.length/(t-start)*1000,p95:sorted[Math.floor(sorted.length*.95)],renderedFrames:after.renderFrame-before.renderFrame,shadowUpdates:after.shadow.updates-before.shadow.updates,shadowRequests:after.shadow.requests-before.shadow.requests,drawCalls:after.drawCalls,triangles:after.triangles});}requestAnimationFrame(tick);}),ms);
 report.samples.push({case:activeCase,name,...value});check(value.renderedFrames>20,name+': live 3D frame sample');check(value.shadowUpdates===0&&value.shadowRequests===0,name+': no per-frame static shadow refresh',value);
}
async function carUntil(page,key,predicate,timeout=30000){
 const samples=[];await page.keyboard.down(key);let reached=false;
 try{const start=Date.now();while(Date.now()-start<timeout){await page.waitForTimeout(150);const runtime=await props(page),c=runtime.cars.find(c=>c.id===runtime.carId);assert.ok(c&&runtime.mode==='car');samples.push({...c,speed:runtime.speed});if(predicate(c,runtime)){reached=true;break;}}}finally{await page.keyboard.up(key);}
 check(reached,'manual '+key+' driving reaches intended waypoint',{last:samples.at(-1),samples:samples.length});
 assert.ok(samples.every(p=>p.x<PLAYABLE_BOUNDS.maxX&&p.z>PLAYABLE_BOUNDS.minZ&&p.z<PLAYABLE_BOUNDS.maxZ));return samples;
}
async function finish(run){report.cases.at(-1).status='passed';await run.context.close();}
try{
 browser=await chromium.launch({headless:true,channel:'chrome'});report.browser=browser.version();
 const run=await openCase('map-driving-district',fixture({lore:preview?[]:['clock','noodles','ferry','bridge','photo']}));const p=run.page,original=await state(p);
 const district=await p.evaluate(()=>__JIANGCHENG__.getWuhanDistrict());check(district?.preservedCoreCoordinates&&district.stops.length===5&&district.bounds.maxX>=100,'new east district is installed with original core preserved',district);
 check(d((await world(p)).position,original.position)<.03,'old save starts at the original exact location');
 const residents=await p.evaluate(()=>__JIANGCHENG__.getResidents().residents);check(residents.length===9&&residents.every(r=>r.avatar.state==='ready'),'all nine existing detailed resident models are preserved');
 await p.locator('#map').click();
 const mapData=await p.locator('#map-svg').evaluate(svg=>({viewBox:svg.getAttribute('viewBox'),points:[...svg.querySelectorAll('[data-place]')].map(n=>({id:n.dataset.place,transform:n.getAttribute('transform')})),overflow:document.documentElement.scrollWidth>innerWidth}));
 check(!mapData.overflow&&Number(mapData.viewBox.split(' ')[2])>=1480,'full map fits viewport and includes the expanded surveyed area',mapData);
 check(WUHAN_DISTRICT_STOPS.every(s=>mapData.points.some(p=>p.id===s.id)),'all five district destinations are represented in the real map');
 await p.locator('#map-plus').click();await p.locator('#map-center').click();await p.locator('#map-reset').click();await shot(p,'expanded-map');await p.locator('.close').click();
 await go(p,'prop-car-sedan');await p.keyboard.press('f');await p.waitForFunction(()=>__JIANGCHENG__.getProps().runtime.mode==='car');
 const carStart=(await props(p)).cars.find(c=>c.id==='prop-car-sedan');
 const drive=await carUntil(p,'w',c=>c.x>90);check(d(drive.at(-1),carStart)>95&&drive.some(c=>c.x>37),'real sedan drives from the old lane into the expanded east district',{from:carStart,to:drive.at(-1)});
 await p.locator('#map').click();await p.waitForTimeout(180);const stop=await props(p);await p.waitForTimeout(500);const stopped=await props(p);
 check(stop.mode==='car'&&stopped.mode==='car'&&stopped.speed===0&&d(stop.cars[0],stopped.cars[0])<.01,'opening map brakes without dismount or drift');await p.locator('.close').click();
 await p.keyboard.down('w');await p.waitForTimeout(4500);await p.keyboard.up('w');await p.waitForTimeout(300);const edge=await props(p),edgeCar=edge.cars.find(c=>c.id==='prop-car-sedan');
 check(edgeCar.x>100&&edgeCar.x<=PLAYABLE_BOUNDS.maxX-1.9&&edge.speed<.05,'full chassis stops at visible new eastern boundary, not outside the map',{edgeCar,speed:edge.speed});
 await carUntil(p,'s',c=>c.x<94,9000);await p.waitForTimeout(700);await shot(p,'new-district-car');
 await p.keyboard.press('f');await p.waitForFunction(()=>__JIANGCHENG__.getProps().runtime.mode==='walk');const parked=(await props(p)).cars.find(c=>c.id==='prop-car-sedan'),exit=(await world(p)).position;
 check(exit.x>37&&await p.evaluate(q=>__JIANGCHENG__.canWalk(q.x,q.z),exit),'F dismounts in the new region on a legal dry point',{exit,parked});
 await p.reload();await ready(p);await p.locator('#start').click();const loaded=await props(p);check(loaded.mode==='walk'&&d(loaded.cars.find(c=>c.id==='prop-car-sedan'),parked)<.03,'new-region parked car survives a real reload without remounting');
 for(const stop of WUHAN_DISTRICT_STOPS){
  await go(p,stop.id);await p.keyboard.press('e');await p.waitForSelector('#district-next');
  check(!(await state(p)).wuhanVisits.includes(stop.id),stop.id+': opening observation does not mark it read');
  if(preview||stop.id==='wuhan-lifen'){
   check(await p.locator('[data-memory-card]').count()===0&&await p.locator('#district-clue').isVisible(),'unearned old-lane memory stays hidden; district offers its location clue');
   await p.locator('#district-next').click();await p.locator('#district-leave').click();check(!(await state(p)).wuhanVisits.includes(stop.id),'leaving a partial district reading grants neither visit nor old memory');
   await p.keyboard.press('e');await p.waitForSelector('#district-next');await shot(p,'district-locked-clue');
  }else await memoryFrame(p,stop.memoryId,stop.id);
  for(let i=0;i<stop.lines.length;i++)await p.locator('#district-next').click();await p.waitForFunction(()=>__JIANGCHENG__.getModal()===null);
  check((await state(p)).wuhanVisits.includes(stop.id),stop.id+': final acknowledged line records exactly this visit');
 }
 const after=await state(p);for(const key of ['flags','supplies','storyChoices','lore','residents'])assert.deepEqual(after[key],original[key]);check(true,'new optional district readings do not advance the original main quest or unlock unearned memories');
 await p.reload();await ready(p);await p.locator('#start').click();check((await state(p)).wuhanVisits.length===5,'all five real visit completions survive refresh without duplicates');
 await sample(p,'east-market-idle');await finish(run);

 if(!preview){
  const initial=fixture({position:{x:94,z:21.25}});initial.cars.vehicles['prop-car-sedan']={x:94,z:23,yaw:Math.PI/2};
  const turn=await openCase('actual-car-corner',initial),r=turn.page;await go(r,'prop-car-sedan');await r.keyboard.press('f');await r.waitForFunction(()=>__JIANGCHENG__.getProps().runtime.mode==='car');
  const before=(await props(r)).cars.find(c=>c.id==='prop-car-sedan'),turnSamples=[];await r.keyboard.down('w');await r.keyboard.down('a');
  try{const began=Date.now();while(Date.now()-began<6000){await r.waitForTimeout(50);const rt=await props(r),c=rt.cars.find(c=>c.id==='prop-car-sedan');turnSamples.push({...c,speed:rt.speed});if(c.yaw>=Math.PI-.24)break;}}
  finally{await r.keyboard.up('a');}
  try{await r.waitForTimeout(650);const rt=await props(r),c=rt.cars.find(c=>c.id==='prop-car-sedan');check(c.yaw>2.9&&c.yaw<3.4,'actual A steering turns sedan from south avenue into the ferry return road',{before,after:c,turnSamples});}
  finally{await r.keyboard.up('w');}
  await carUntil(r,'w',c=>c.z<6,7000);await r.waitForTimeout(600);const corner=(await props(r)).cars.find(c=>c.id==='prop-car-sedan');
  check(corner.x>95&&corner.x<103&&corner.z<6&&d(corner,before)>17,'post-turn car genuinely travels north between the road edges without wall crossing',{before,corner});await shot(r,'actual-left-turn-ferry-road');await r.keyboard.press('f');await r.waitForFunction(()=>__JIANGCHENG__.getProps().runtime.mode==='walk');check(await r.evaluate(()=>{const p=__JIANGCHENG__.getWorld().position;return __JIANGCHENG__.canWalk(p.x,p.z);}), 'turned vehicle dismounts on a legal new-road point');await finish(turn);
 }
 if(!preview){
  const replay=await openCase('remote-journal-replay',fixture({flags:['storyV3','received','radio','granny']})),rr=replay.page;
  const remoteFrom=(await world(rr)).position;await rr.locator('#journal').click();await rr.locator('[data-memory="grannyMemory"]').click();
  for(let i=0;i<MEMORY_BOUNDARIES.grannyMemory.start;i++)await rr.locator('#story-next').click();
  await memoryFrame(rr,'granny-table','main-remote-memory');await rr.waitForTimeout(1000);
  const remote=await world(rr),panel=await rr.locator('.dialogue-box').boundingBox(),line=await rr.locator('#dialogue-text').innerText();
  check(d(remote.position,remoteFrom)<.02,'remote journal memory never teleports the protagonist');
  check(remote.conversation?.replay===true&&remote.conversation.framingMode==='solo-memory'&&remote.conversation.actors.length===1&&remote.conversation.actors[0].id==='player','remote recollection deliberately frames only the present player, not a distant resident');
  check(remote.playerVisible&&['head','feet'].every(part=>remote.playerFrame[part].visible&&remote.playerFrame[part].x>=0&&remote.playerFrame[part].x<=1440&&remote.playerFrame[part].y>=0&&remote.playerFrame[part].y<panel.y),'remote journal memory keeps the present protagonist visibly framed instead of staring through distant walls',{frame:remote.playerFrame,panel,conversation:remote.conversation});
  await rr.locator('[data-memory-card="granny-table"] .wm-preview').click();await rr.waitForSelector('.wm-inspection:not([hidden])');await rr.keyboard.press('Escape');check(await rr.locator('#dialogue-text').innerText()===line,'remote picture inspection returns to the same sentence');await rr.keyboard.press('Escape');
  await finish(replay);
 }
 const mem=await openCase('memory-ui-regression');const q=mem.page;
 // Decode every shipping image only in the final gate. The preview exercises
 // existing two pictures and never requests not-yet-generated unlocked art.
 if(!preview){
 const imageChecks=await q.evaluate(async items=>await Promise.all(items.map(item=>new Promise(resolve=>{const img=new Image();img.onload=()=>resolve({id:item.id,ok:img.naturalWidth>=1280&&img.naturalWidth/img.naturalHeight===16/9,width:img.naturalWidth,height:img.naturalHeight});img.onerror=()=>resolve({id:item.id,ok:false});img.src=item.image;}))),WUHAN_MEMORIES.map(({id,image})=>({id,image})));
 check(imageChecks.length===44&&imageChecks.every(i=>i.ok),'all 44 shipped images load and decode at landscape resolution over HTTP',{images:imageChecks});
 }
 await go(q,'granny');await q.keyboard.press('e');await q.waitForSelector('#story-next');
 for(let i=0;i<DIALOGUES.granny.length;i++)await q.locator('#story-next').click();
 await q.waitForSelector('[data-piece]');for(const [a,b]of [[0,1],[1,3],[2,3]]){await q.locator(`[data-piece="${a}"]`).click();await q.locator(`[data-piece="${b}"]`).click();}
 await q.locator('#order-check').click();await q.locator('[data-activity-continue]').click();check(!(await world(q)).conversation?.replay,'actual delivered-radio conversation and completed picture puzzle lead to a live, non-replay main memory');
 for(let i=0;i<MEMORY_BOUNDARIES.grannyMemory.start;i++)await q.locator('#story-next').click();
 const cg='granny-table';await memoryFrame(q,cg,'main-granny-memory');const spoken=await q.locator('#dialogue-text').innerText();if(!preview)await memoryLayout(q,cg,'main-granny-memory-layout');
 check(await q.locator('#memory-film').isVisible(),'memory movie remains an explicit available action rather than replacing the image automatically');
 await q.locator('[data-memory-card="granny-table"] .wm-preview').click();await q.waitForSelector('[data-memory-card="granny-table"].is-inspecting');await q.keyboard.press('Escape');
 check(await q.locator('#dialogue-text').innerText()===spoken&&await q.evaluate(()=>__JIANGCHENG__.getModal())==='story','manual main-memory inspection returns to the exact same 3D dialogue line');
 const memoryIndex=await q.evaluate(()=>__JIANGCHENG__.getMemory().storyIndex);await q.locator('#memory-film').click();await q.waitForFunction(()=>__JIANGCHENG__.getModal()==='film');await q.locator('#film-close').click();await q.waitForFunction(()=>__JIANGCHENG__.getModal()==='story');
 check(await q.locator('#dialogue-text').innerText()===spoken&&(await q.evaluate(()=>__JIANGCHENG__.getMemory().storyIndex))===memoryIndex,'explicit old-film playback returns to the same memory and sentence');
 await q.keyboard.press('Escape');
 for(const [residentId,topicId]of (preview?[['granny','bamboo-bed']]:[['granny','bamboo-bed'],['chef','first-noodles'],['dock','ticket-pocket']])){
  await q.locator('#prop-guide').click();await q.locator(`[data-resident-visit="${residentId}"]`).click();await q.waitForFunction(id=>__JIANGCHENG__.getModal()==='resident'&&document.querySelector('.resident-chat')?.dataset.residentId===id,residentId,{timeout:120000});
  await q.locator('[data-resident-action="advance"]').click();await q.locator(`[data-resident-topic="${topicId}"]`).click();
  const memory=memoryForResidentTopic(residentId,topicId),card=await memoryFrame(q,memory.id,'resident-'+residentId);const line=await q.locator('[data-resident-line]').innerText();if(!preview)await memoryLayout(q,memory.id,'resident-'+residentId+'-layout');
  check(!(await state(q)).residents.heard[residentId]?.includes(topicId),residentId+': opening the image does not award the story');
  await card.locator('.wm-preview').click();await q.waitForSelector('.wm-inspection:not([hidden])');await q.keyboard.press('Escape');
  check(await q.locator('[data-resident-line]').innerText()===line&&await q.evaluate(()=>__JIANGCHENG__.getModal())==='resident',residentId+': Escape closes only the artwork, not the 3D conversation');
  for(let i=0;i<4;i++)await q.locator('[data-resident-action="advance"]').click();check((await state(q)).residents.heard[residentId]?.includes(topicId),residentId+': final acknowledged line earns only the matching artwork');await q.keyboard.press('Escape');
 }
 if(!preview){
 await q.locator('#achievement-gallery').click();await q.locator('[data-filter="memory"]').click();
 const memoryId=memoryForResidentTopic('granny','bamboo-bed').id;await q.locator(`[data-card="wuhan-${memoryId}"]`).click();await q.locator(`.ag-lightbox[data-memory-id="${memoryId}"]`).waitFor();
 check(await q.locator('.ag-memory-transcript p').count()===4,'gallery replay retains the completed resident story beside its own illustration');await shot(q,'gallery-memory-replay');await q.keyboard.press('Escape');
 await q.reload();await ready(q);await q.locator('#start').click();await q.locator('#achievement-gallery').click();check(await q.locator(`[data-card="wuhan-${memoryId}"]`).isEnabled(),'earned independent memory remains available after refresh');await q.keyboard.press('Escape');
 }
 await sample(q,'old-core-after-memory');await finish(mem);
 check(report.errors.length===0,'no uncaught browser errors',{errors:report.errors});check(report.failedRequests.length===0,'no missing shipping resources',{failedRequests:report.failedRequests});report.status=preview?'preview-passed':'passed';
}catch(error){report.status='failed';report.failure=error.stack;report.cases.at(-1)&&(report.cases.at(-1).status='failed');if(activePage&&!activePage.isClosed())await shot(activePage,'failure-'+activeCase).catch(()=>{});console.error(error);process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();await writeFile(new URL('report.json',out),JSON.stringify(report,null,2));await browser?.close();console.log(JSON.stringify({status:report.status,checks:report.checks.length,samples:report.samples,report:fileURLToPath(new URL('report.json',out))},null,2));}
