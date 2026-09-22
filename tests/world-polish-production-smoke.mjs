import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {freshState,SAVE_KEY} from '../src/story.js';

const base=process.env.GAME_URL||'http://127.0.0.1:4173/?qa=world-polish-production';
const expected=process.env.EXPECTED_BUILD_ASSET||'/assets/index-CZyx5BpN.js';
const out=fileURLToPath(new URL('../output/qa/world-polish-v1/integration/production-smoke/',import.meta.url));
await mkdir(out,{recursive:true});
const report={base,expected,startedAt:new Date().toISOString(),status:'running',checks:[],errors:[],failedRequests:[],assets:[]};
const check=(ok,name,data={})=>{report.checks.push({name,passed:Boolean(ok),...data});console.log(ok?'PASS':'FAIL',name);};
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
 const context=await browser.newContext({viewport:{width:1280,height:720}}),value=freshState();value.started=true;value.flags=['storyV3','received','radio'];value.position={x:-15,z:21};Object.assign(value.settings,{sound:true,voiceAuto:true,reduced:false,quality:'high',cameraMode:'street'});
 await context.addInitScript(({key,value})=>localStorage.setItem(key,JSON.stringify(value)),{key:SAVE_KEY,value});
 const p=await context.newPage();p.on('pageerror',e=>report.errors.push(e.message));p.on('response',r=>{if(r.status()>=400)report.failedRequests.push({url:r.url(),status:r.status()});});
 await p.goto(base);await p.waitForFunction(()=>window.__JIANGCHENG__&&document.querySelector('#boot').hidden,null,{timeout:120000});
 const assets=await p.locator('script[src],link[rel=stylesheet]').evaluateAll(ns=>ns.map(n=>n.src||n.href));
 for(const url of assets){const r=await p.request.get(url),bytes=await r.body();report.assets.push({url,status:r.status(),sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length});}
 check(assets.some(u=>new URL(u).pathname===expected),'exact deployed final JS asset is served',{assets:report.assets});
 check(await p.evaluate(()=>__JIANGCHENG__.getPresentation().loading.completed===3&&__JIANGCHENG__.getPresentation().loading.hidden),'production loading reaches three real tasks and hides original #boot');
 await p.locator('#start').click();await p.waitForFunction(()=>__JIANGCHENG__.getWorld().active&&__JIANGCHENG__.getAudio().context==='running');await p.waitForTimeout(500);
 check(await p.evaluate(()=>__JIANGCHENG__.getAudio().supplementalVoiceCount===179&&__JIANGCHENG__.getAudio().effectCues.length===14),'production merges supplemental voices and all fourteen effects');
 await p.screenshot({path:out+'production-walking-1280x720.png'});
 await p.locator('#settings').click();await p.locator('#set-reduced').check();await p.keyboard.press('Escape');await p.waitForTimeout(150);check(await p.evaluate(()=>__JIANGCHENG__.getModal()===null&&!__JIANGCHENG__.getPresentation().particles.visible&&__JIANGCHENG__.getPresentation().hud.paused),'production checkbox Escape and reduced-motion gate work');
 await p.locator('#settings').click();await p.locator('#set-reduced').uncheck();await p.keyboard.press('Escape');
 await p.locator('#prop-guide').click();await p.locator('[data-resident-visit="granny"]').click();await p.waitForFunction(()=>__JIANGCHENG__.getAudio().voice?.lineId==='town-resident-granny-greeting-before-rain',null,{timeout:90000});
 check(await p.evaluate(()=>__JIANGCHENG__.getAudio().status==='playing'),'production resident voice starts from shipped audio');await p.screenshot({path:out+'production-resident-voice-1280x720.png'});await p.keyboard.press('Escape');
 await p.locator('#map').click();await p.locator('#map-destination').selectOption('prop-car-sedan');await p.locator('#map-go').click();await p.waitForFunction(()=>__JIANGCHENG__.getProps().nearby?.id==='prop-car-sedan'&&__JIANGCHENG__.getWorld().remainingRoute===0,null,{timeout:90000});await p.keyboard.press('f');await p.waitForFunction(()=>__JIANGCHENG__.getProps().runtime.mode==='car');
 const before=await p.evaluate(()=>__JIANGCHENG__.getProps().runtime.cars.find(c=>c.id==='prop-car-sedan'));await p.keyboard.down('w');await p.waitForTimeout(1200);await p.keyboard.up('w');
 const vehicle=await p.evaluate(()=>({runtime:__JIANGCHENG__.getProps().runtime,meter:document.querySelector('.bicycle-speed').getAttribute('aria-valuenow'),routeHidden:document.querySelector('#route-guide').hidden,audio:__JIANGCHENG__.getAudio()}));
 const after=vehicle.runtime.cars.find(c=>c.id==='prop-car-sedan');check(Math.hypot(after.x-before.x,after.z-before.z)>1&&Number(vehicle.meter)>0&&vehicle.routeHidden,'production car drives, real speed updates and completed route disappears',vehicle);
 await p.screenshot({path:out+'production-driving-1280x720.png'});await p.locator('#brand').click();await p.waitForTimeout(800);check(await p.evaluate(()=>!__JIANGCHENG__.getWorld().active&&__JIANGCHENG__.getAudio().effectCount===0),'production home transition cancels late vehicle sounds');
 await p.locator('#intro-film').click();await p.waitForFunction(()=>__JIANGCHENG__.getModal()==='film');await p.waitForTimeout(200);check(await p.evaluate(()=>!__JIANGCHENG__.getPresentation().particles.visible&&__JIANGCHENG__.getPresentation().hud.paused&&__JIANGCHENG__.getAudio().voice===null),'production film pauses decorative particles and street voice');await p.locator('#film-close').click();
 check(report.errors.length===0&&report.failedRequests.length===0,'production smoke has no browser errors or missing assets',{errors:report.errors,failedRequests:report.failedRequests});
 report.status=report.checks.every(c=>c.passed)?'passed':'failed';await context.close();
}catch(error){report.status='failed';report.error=error.stack;console.error(error);}
finally{await browser.close();report.finishedAt=new Date().toISOString();await writeFile(out+'report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,checks:report.checks.length,report:out+'report.json'}));}
