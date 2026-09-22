// Frozen-build visual evidence: real UI, keyboard and mouse input only.
// __JIANGCHENG__ is read-only; no saves, positions, camera state or routes injected.
import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
const base=process.env.GAME_URL||'http://127.0.0.1:4173';
const expected=process.env.EXPECTED_BUILD_ASSET;
const dir=path.resolve(process.env.QA_DIR||'output/qa/curved-street/views');
const viewport={width:1920,height:1080};
const report={started:new Date().toISOString(),base,expected,viewport,method:'Real map UI, native keyboard and native mouse only; read-only debug snapshots.',status:'running',assets:[],views:[],routes:[],inputs:[],errors:[],failedRequests:[],failedResponses:[]};
let browser,page;
const angle=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const sleep=ms=>page.waitForTimeout(ms);
await fs.mkdir(dir,{recursive:true});
async function read(full=false){return page.evaluate(full=>{const world=window.__JIANGCHENG__.getWorld();return{at:performance.now(),world:full?world:Object.fromEntries(['position','heading','groundHeight','playerMotion','moveSpeed','remainingRoute','blocked','active','camera','cameraTarget','avatar'].map(k=>[k,world[k]])),modal:window.__JIANGCHENG__.getModal(),near:window.__JIANGCHENG__.getNearest(),...(full?{assets:performance.getEntriesByType('resource').map(r=>({name:r.name,initiatorType:r.initiatorType,transferSize:r.transferSize}))}:{}),ui:{camera:document.querySelector('#view-mode')?.textContent,quest:document.querySelector('#quest-title')?.textContent,region:document.querySelector('.adventure-region.visible strong')?.textContent||null}};},full);}
async function until(fn,label,timeout=30000){const start=Date.now();let s;while(Date.now()-start<timeout){s=await read();if(fn(s))return s;await sleep(45);}report.timeout={label,state:s};throw Error(label+' timed out');}
async function settle(){return until(s=>s.world.playerMotion.grounded&&s.world.moveSpeed<.03&&s.world.remainingRoute===0,'settle',12000);}
async function drag(dx,dy=0){const x=viewport.width*.5,y=viewport.height*.40;const before=await read();await page.mouse.move(x,y);await page.mouse.down();try{await page.mouse.move(x+dx,y+dy,{steps:Math.max(10,Math.ceil(Math.hypot(dx,dy)/30))});}finally{await page.mouse.up();}await sleep(130);const after=await read();report.inputs.push({type:'native-mouse-drag',dx,dy,from:before.world.heading,to:after.world.heading,at:before.at});}
async function face(target){for(let i=0;i<8;i++){const s=await read(),d=angle(s.world.heading,target);if(Math.abs(d)<.035)return;await drag(Math.max(-520,Math.min(520,d/.0024)));}const s=await read();assert(Math.abs(angle(s.world.heading,target))<.12,'native drag could not face requested direction');}
async function tiltDelta(dy){await drag(0,dy);}
async function release(){await Promise.all(['w','a','s','d','Shift','Space'].map(k=>page.keyboard.up(k)));}
const options=[{keys:['w'],offset:0},{keys:['w','d'],offset:Math.PI/4},{keys:['d'],offset:Math.PI/2},{keys:['s','d'],offset:3*Math.PI/4},{keys:['s'],offset:Math.PI},{keys:['s','a'],offset:-3*Math.PI/4},{keys:['a'],offset:-Math.PI/2},{keys:['w','a'],offset:-Math.PI/4}];
async function walk(x,z,label){
 const target={x,z};await settle();let s=await read();
 const clear=await page.evaluate(({a,b})=>{const n=Math.ceil(Math.hypot(a.x-b.x,a.z-b.z)/.15);for(let i=0;i<=n;i++){const f=i/n;if(!window.__JIANGCHENG__.canWalk(a.x+(b.x-a.x)*f,a.z+(b.z-a.z)*f))return false;}return true;},{a:s.world.position,b:target});
 assert(clear,`${label}: direct segment must be physically walkable`);
 const route={label,target,started:Date.now(),samples:[],keyChanges:[]};report.routes.push(route);
 const from={...s.world.position};const len=distance(from,target),sx=(x-from.x)/len,sz=(z-from.z)/len;
 let active=[],best=len,progressAt=Date.now();const deadline=Date.now()+Math.max(9000,len*1000+5000);
 try{while(true){s=await read();route.samples.push({at:s.at,position:s.world.position,heading:s.world.heading,groundHeight:s.world.groundHeight,grounded:s.world.playerMotion.grounded,remainingRoute:s.world.remainingRoute});
  const d=distance(s.world.position,target);if(d<.20)break;assert(s.modal===null&&!s.world.blocked&&s.world.remainingRoute===0,'keyboard route must stay active without automatic travel');
  if(d<best-.02){best=d;progressAt=Date.now();}assert(Date.now()-progressAt<2000,label+' stopped progressing');assert(Date.now()<deadline,label+' walking deadline');
  const progress=(s.world.position.x-from.x)*sx+(s.world.position.z-from.z)*sz;const ahead=Math.min(len,Math.max(0,progress)+.7);const aim={x:from.x+sx*ahead,z:from.z+sz*ahead};
  const desired=Math.atan2(aim.x-s.world.position.x,s.world.position.z-aim.z);const selected=options.reduce((a,b)=>Math.abs(angle(s.world.heading+a.offset,desired))<=Math.abs(angle(s.world.heading+b.offset,desired))?a:b);
  if(active.join()!==selected.keys.join()){for(const k of active)if(!selected.keys.includes(k))await page.keyboard.up(k);for(const k of selected.keys)if(!active.includes(k))await page.keyboard.down(k);active=selected.keys;route.keyChanges.push({at:s.at,keys:[...active],position:s.world.position});}
  await sleep(30);
 }}finally{await Promise.all(active.map(k=>page.keyboard.up(k)));}
 const end=await settle();route.finished=Date.now();route.arrival=end.world.position;assert(distance(end.world.position,target)<.43,label+' arrival overshot');console.log('WALK',label,JSON.stringify(end.world.position));
}
async function snap(label,description){await settle();await sleep(450);const state=await read(true);const name=`${String(report.views.length+1).padStart(2,'0')}-${label}`;await page.screenshot({path:path.join(dir,name+'.png')});await fs.writeFile(path.join(dir,name+'.json'),JSON.stringify({label,description,...state},null,2)+'\n');report.views.push({name:name+'.png',description,position:state.world.position,heading:state.world.heading,camera:state.world.camera,cameraTarget:state.world.cameraTarget,at:state.at});console.log('VIEW',name);}
async function mapGo(id){await page.locator('#map').click();await page.locator('#map-destination').selectOption(id);await page.locator('#map-go').click();const route={label:'map-ui-'+id,samples:[]};report.routes.push(route);const end=await until(s=>{route.samples.push({at:s.at,position:s.world.position,remainingRoute:s.world.remainingRoute});return s.world.remainingRoute===0&&s.world.moveSpeed<.03;},'map arrival '+id,60000);route.arrival=end.world.position;console.log('MAP',id,JSON.stringify(end.world.position));}
try{
 browser=await chromium.launch({headless:true,channel:'chrome'});const context=await browser.newContext({viewport,deviceScaleFactor:1});page=await context.newPage();
 page.on('pageerror',e=>report.errors.push(e.stack||e.message));page.on('requestfailed',r=>report.failedRequests.push({url:r.url(),error:r.failure()?.errorText}));page.on('response',r=>{if(r.status()>=400)report.failedResponses.push({url:r.url(),status:r.status()});});
 await page.goto(base);await page.locator('#boot').waitFor({state:'hidden',timeout:60000});report.assets=await page.locator('script[src],link[rel="stylesheet"]').evaluateAll(ns=>ns.map(n=>n.src||n.href));assert(report.assets.some(u=>new URL(u).pathname===expected),'frozen build match');
 await page.locator('#start').click();await until(s=>s.world.active&&s.modal===null,'start');await settle();
 await snap('arrival','Default first playable frame with the redesigned character and curved street.');await face(Math.PI/2);await snap('hero-side','Character silhouette in the regular third-person view, viewed from the side.');await face(Math.atan2(10.5,-4));await snap('hero-front','Front view after native mouse orbit; no camera or player state injected.');await face(0);await walk(1,26,'back-from-start-five-metres');await face(0);await tiltDelta(-105);await page.mouse.wheel(0,800);await sleep(250);await snap('south-gateway','From START, walked backward approximately 5m, north-facing view of the complete south gateway.');
 await page.keyboard.down('w');await page.keyboard.down('Shift');await page.keyboard.press('Space');await sleep(210);await page.screenshot({path:path.join(dir,'run-jump.png')});report.views.push({name:'run-jump.png',description:'Native Shift+W+Space in flight'});await page.keyboard.up('w');await page.keyboard.up('Shift');await settle();await walk(1,14,'through-south-gateway');await face(0);await tiltDelta(45);await snap('north-timber-gallery','After passing through the south gateway, looking north toward the timber gallery.');
 await mapGo('dock');await walk(12,-21.5,'river-street-west');await face(Math.atan2(33.2-12,-21.5+17.4));await tiltDelta(-70);await snap('river-street-kite','Distant swallow kite and lookout from the northern riverside street; ordinary third-person camera.');
 await walk(25,-21.5,'river-street-east');await walk(25,-3,'eastern-public-lane');await walk(30.8,-3,'approach-ramp-southwest');await walk(31.1,1.2,'around-ramp-entry');await walk(33.6,1.2,'ramp-foot');await face(0);await snap('ramp-foot-north','At the ramp foot, facing north toward the lookout and destination kite.');
 await walk(33.6,-.3,'ramp-entry');await walk(33.6,-7.5,'ramp-lower-half');await walk(33.6,-14.7,'ramp-upper-half');await walk(33,-16.2,'lookout-arrival');await face(0);await tiltDelta(72);await snap('lookout-north-river','Normal north-facing view from the elevated lookout, after the tree was moved aside.');
 await face(Math.PI);await tiltDelta(50);await snap('lookout-return-ramp','From the lookout, looking back south down the complete ramp and arrival route.');
 await walk(33.6,-14.7,'descent-platform-exit');await walk(33.6,-7.5,'descent-upper-half');await walk(33.6,-.3,'descent-lower-half');await walk(33.6,1.2,'descent-return-ground');
 const up=report.routes.filter(r=>['ramp-entry','ramp-lower-half','ramp-upper-half','lookout-arrival'].includes(r.label)).flatMap(r=>r.samples),down=report.routes.filter(r=>r.label.startsWith('descent')).flatMap(r=>r.samples);
 report.heightEvidence={ascent:{samples:up.length,min:Math.min(...up.map(s=>s.position.y)),max:Math.max(...up.map(s=>s.position.y))},descent:{samples:down.length,min:Math.min(...down.map(s=>s.position.y)),max:Math.max(...down.map(s=>s.position.y))}};
 assert(report.heightEvidence.ascent.min<.2&&report.heightEvidence.ascent.max>1.9&&report.heightEvidence.descent.min<.2&&report.heightEvidence.descent.max>1.9,'full ramp up and down');assert(report.errors.length===0&&report.failedResponses.length===0,'no exceptions or missing assets');report.status='captured';report.finished=new Date().toISOString();
}catch(e){report.status='failed';report.error=e.stack||String(e);console.error(e);process.exitCode=1;if(page)try{await page.screenshot({path:path.join(dir,'failure.png')});await fs.writeFile(path.join(dir,'failure.json'),JSON.stringify(await read(),null,2));}catch{}}
finally{if(page)await release().catch(()=>{});await browser?.close();report.browserClosed=true;await fs.writeFile(path.join(dir,'views-report.json'),JSON.stringify(report,null,2)+'\n');console.log('CLOSED',report.status);}
