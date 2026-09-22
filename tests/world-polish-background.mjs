import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {freshState,SAVE_KEY} from '../src/story.js';

// Playwright keeps controlled pages visible. This isolated native Chrome uses
// only raw CDP, without focus/visibility emulation, to exercise REAL tab hiding.
// No document.hidden replacement, app mutator, timer override or test backdoor.
const base=process.env.GAME_URL||'http://127.0.0.1:4193/?qa=native-background';
const out=fileURLToPath(new URL('../output/qa/world-polish-v1/integration/'+(process.env.QA_RUN||'native-background')+'/',import.meta.url));
await mkdir(out,{recursive:true});
const report={startedAt:new Date().toISOString(),base,scope:'isolated native Chrome, real inactive-tab visibility via raw CDP; application diagnostics are read-only',checks:[],sourceHashes:{}};
for(const f of ['src/main.js','src/audio-director.js','src/world-particles.js'])report.sourceHashes[f]=createHash('sha256').update(await readFile(new URL('../'+f,import.meta.url))).digest('hex');
const dir=await mkdtemp(tmpdir()+'/jiangcheng-native-background-');
const chromeProcess=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--user-data-dir='+dir,'--remote-debugging-port=0','--no-first-run','--no-default-browser-check','about:blank'],{stdio:'ignore'});
let ws,n=0,session,send;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const check=(ok,name,details)=>{report.checks.push({name,passed:Boolean(ok),...details});console.log(ok?'PASS':'FAIL',name);};
try{
 let port;for(let i=0;i<100;i++){try{port=(await readFile(dir+'/DevToolsActivePort','utf8')).split('\n')[0];break;}catch{await wait(100);}}
 const version=await(await fetch('http://127.0.0.1:'+port+'/json/version')).json();report.browser=version.Browser;
 ws=new WebSocket(version.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r));
 const pending=new Map();ws.addEventListener('message',e=>{const d=JSON.parse(e.data);if(d.id){const p=pending.get(d.id);pending.delete(d.id);d.error?p.reject(new Error(JSON.stringify(d.error))):p.resolve(d.result);}});
 send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++n;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,sessionId}));});
 const targets=await send('Target.getTargets'),target=targets.targetInfos.find(t=>t.type==='page');
 session=(await send('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;
 const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},session);if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
 const until=async(expression,timeout=120000)=>{const end=Date.now()+timeout;while(Date.now()<end){try{if(await evaluate(expression))return;}catch(error){if(!/ReferenceError|Cannot find context/.test(error.message))throw error;}await wait(100);}throw new Error('timeout: '+expression);};
 const click=async selector=>{const point=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point},session);await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point},session);};
 const snapshot=()=>evaluate(`({hidden:document.hidden,visibility:document.visibilityState,world:__JIANGCHENG__.getWorld(),presentation:__JIANGCHENG__.getPresentation(),audio:__JIANGCHENG__.getAudio()})`);
 const value=freshState();value.started=true;value.flags=['storyV3','received','radio'];value.position={x:-17,z:3.6};Object.assign(value.settings,{sound:true,voiceAuto:true,reduced:false,quality:'high',cameraMode:'street'});
 // A static same-origin document has no game's pagehide-save listener, so the
 // fixture cannot be overwritten by the previous game's in-memory save.
 await send('Page.navigate',{url:new URL('/media/manifest.json',base).href},session);await until(`location.pathname==='/media/manifest.json'&&document.readyState==='complete'`);
 await evaluate(`localStorage.setItem(${JSON.stringify(SAVE_KEY)},${JSON.stringify(JSON.stringify(value))})`);
 await send('Page.navigate',{url:base},session);await until(`Boolean(window.__JIANGCHENG__&&document.querySelector('#boot').hidden&&__JIANGCHENG__.getState().flags.includes('radio')&&__JIANGCHENG__.getState().settings.sound)`);
 report.assets=await evaluate(`[...document.querySelectorAll('script[src],link[rel=stylesheet]')].map(e=>e.src||e.href)`);
 await click('#start');await until(`__JIANGCHENG__.getWorld().active&&__JIANGCHENG__.getPresentation().particles.visible`);await wait(400);
 const before=await snapshot();
 const other=await send('Target.createTarget',{url:'about:blank'});await send('Target.activateTarget',{targetId:other.targetId});await until('document.hidden',5000);await wait(200);
 const hiddenStart=await snapshot();await wait(1200);const hiddenEnd=await snapshot();
 check(before.hidden===false&&hiddenEnd.hidden===true&&hiddenEnd.visibility==='hidden','native tab becomes genuinely hidden',{before:before.hidden,after:hiddenEnd.hidden});
 // Native inactive tabs can stop RAF before the next component update. The
 // cached mesh.visible flag may stay true; actual motion/render counters, not
 // that cached flag, establish that no particle work continues offscreen.
 check(hiddenEnd.presentation.particles.updates===hiddenStart.presentation.particles.updates&&hiddenEnd.presentation.particles.time===hiddenStart.presentation.particles.time&&hiddenEnd.world.renderFrame===hiddenStart.world.renderFrame&&hiddenEnd.presentation.hud.paused&&hiddenEnd.presentation.hud.live===0,'hidden tab stops particle simulation, rendering and HUD animation',{start:hiddenStart.presentation,end:hiddenEnd.presentation,renderFrameStart:hiddenStart.world.renderFrame,renderFrameEnd:hiddenEnd.world.renderFrame,cachedMeshVisible:hiddenEnd.presentation.particles.visible});
 check(hiddenEnd.world.shadow.updates===hiddenStart.world.shadow.updates&&hiddenEnd.world.shadow.requests===hiddenStart.world.shadow.requests,'hidden tab does not refresh static shadows',{start:hiddenStart.world.shadow,end:hiddenEnd.world.shadow});
 check(!hiddenEnd.audio.visible&&hiddenEnd.audio.ambient===null&&hiddenEnd.audio.effectCount===0,'hidden tab stops street ambience and effects',{audio:hiddenEnd.audio});
 await send('Target.activateTarget',{targetId:target.targetId});await until('!document.hidden',5000);await wait(700);const resumed=await snapshot();
 check(resumed.presentation.particles.visible&&resumed.presentation.particles.updates>hiddenEnd.presentation.particles.updates&&!resumed.presentation.hud.paused,'foreground tab resumes particle updates',{before:hiddenEnd.presentation,after:resumed.presentation});
 await click('#prop-guide');await click('[data-resident-visit="granny"]');await until(`__JIANGCHENG__.getAudio().status==='playing'&&__JIANGCHENG__.getAudio().voice?.lineId==='town-resident-granny-greeting-before-rain'`);
 const speaking=await snapshot();await send('Target.activateTarget',{targetId:other.targetId});await until('document.hidden',5000);await wait(300);const muted=await snapshot();
 check(speaking.audio.voice!==null&&!muted.audio.visible&&muted.audio.voice===null,'real background transition cancels an active resident sentence',{speaking:speaking.audio,hidden:muted.audio});
 await send('Target.activateTarget',{targetId:target.targetId});await until('!document.hidden',5000);await wait(300);check((await snapshot()).audio.voice===null,'foreground return does not unexpectedly restart the interrupted sentence',{});
 await click('[data-town-voice-replay]');await until(`__JIANGCHENG__.getAudio().status==='playing'`);check((await snapshot()).audio.voice?.lineId==='town-resident-granny-greeting-before-rain','manual replay works after foreground return',{audio:(await snapshot()).audio});
 const image=await send('Page.captureScreenshot',{format:'png'},session);await writeFile(out+'foreground-replay.png',Buffer.from(image.data,'base64'));
 report.status=report.checks.every(c=>c.passed)?'passed':'failed';
 await send('Browser.close');
}catch(error){report.status='failed';report.error=error.stack;console.error(error);}
finally{ws?.close();chromeProcess.kill();await wait(200);await rm(dir,{recursive:true,force:true});report.finishedAt=new Date().toISOString();await writeFile(out+'report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,checks:report.checks.length,report:out+'report.json'}));}
