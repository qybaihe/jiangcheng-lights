/** True rendered-tab capture. Real CDP inputs, read-only world diagnostics.
 * A disposable profile receives a fresh game state with only initial position,
 * camera and sound preferences configured. No quest, vehicle, race or gallery
 * progress is injected. All boarding and race gate traversals are real input.
 */
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {freshState,SAVE_KEY} from '../src/story.js';
const mode=process.env.CAPTURE_SHOT||'boat';
assert.ok(['boat','bicycle','car','bridge'].includes(mode));
const run=process.env.CAPTURE_RUN||mode+'-'+new Date().toISOString().replace(/[:.]/g,'-');
assert.match(run,/^[a-zA-Z0-9_-]+$/);
const base='http://127.0.0.1:4173/?v=river-games-v1';
const out=fileURLToPath(new URL('../output/demo-film-final/vehicles/'+run+'/',import.meta.url));await mkdir(out,{recursive:true});
const dir=await mkdtemp(tmpdir()+'/jiangcheng-vehicles-final-');
const initialPosition=mode==='bridge'?{x:76,z:19}:mode==='boat'?{x:35,z:-21}:mode==='bicycle'?{x:-20.05,z:22}:{x:-14.8,z:26.2};
const report={mode,run,startedAt:new Date().toISOString(),base,output:out,status:'running',scope:'Disposable isolated Chrome. Fresh state only initial position/camera/audio configured. No flags/progress/results injected. All recorded vehicle motion via genuine CDP keyboard/mouse; diagnostics read-only. Tab recording includes actual HUD and audio.',initialPosition,viewport:{width:1920,height:1080,deviceScaleFactor:1},inputs:[],events:[],snapshots:[],errors:[]};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--user-data-dir='+dir,'--remote-debugging-port=0','--no-first-run','--no-default-browser-check','--window-size=1920,1200','--window-position=0,30','--force-device-scale-factor=1','--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding','--auto-accept-this-tab-capture','--auto-select-tab-capture-source-by-title=江城有灯','--allow-http-screen-capture','--enable-usermedia-screen-capturing','about:blank'],{stdio:'ignore'});
let ws,send,session,n=0,recordStart=null;
try{
 let port;for(let i=0;i<100;i++){try{port=(await readFile(dir+'/DevToolsActivePort','utf8')).split('\n')[0];break;}catch{await wait(100);}}
 if(!port)throw Error('CDP port missing');const version=await(await fetch('http://127.0.0.1:'+port+'/json/version')).json();report.browser=version.Browser;
 ws=new WebSocket(version.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r));const pending=new Map();ws.addEventListener('message',e=>{const d=JSON.parse(e.data);if(d.id){const p=pending.get(d.id);pending.delete(d.id);d.error?p?.reject(new Error(JSON.stringify(d.error))):p?.resolve(d.result);}else if(d.method==='Runtime.exceptionThrown')report.errors.push(d.params.exceptionDetails);});
 send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++n;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,sessionId}));});
 const targets=await send('Target.getTargets'),target=targets.targetInfos.find(t=>t.type==='page');session=(await send('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;
 const evaluate=async(expression,gesture=false)=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:gesture},session);if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const until=async(expression,timeout=120000)=>{const end=Date.now()+timeout;while(Date.now()<end){try{if(await evaluate(expression))return;}catch(e){if(!/ReferenceError|Cannot find context/.test(e.message))throw e;}await wait(100);}throw Error('timeout: '+expression);};
 const click=async selector=>{const p=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing selector '+${JSON.stringify(selector)});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);report.inputs.push({at:Date.now(),type:'click',selector,...p});await send('Input.dispatchMouseEvent',{type:'mouseMoved',...p},session);await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...p},session);await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...p},session);};
 const held=new Set();
 const key=async(k,down=true)=>{if(down===held.has(k))return;if(down)held.add(k);else held.delete(k);const code=k.length===1?'Key'+k.toUpperCase():k;const keyCode=k==='Escape'?27:k==='Enter'?13:k.toUpperCase().charCodeAt(0);report.inputs.push({at:Date.now(),type:down?'keyDown':'keyUp',key:k});await send('Input.dispatchKeyEvent',{type:down?'keyDown':'keyUp',key:k,code,windowsVirtualKeyCode:keyCode},session);};
 const press=async k=>{await key(k);await key(k,false);};
 const keys=async want=>{for(const k of ['w','a','s','d'])await key(k,want.includes(k));};
 const state=()=>evaluate('({props:__JIANGCHENG__.getProps(),race:__JIANGCHENG__.getRace(),world:__JIANGCHENG__.getWorld(),modal:__JIANGCHENG__.getModal()})');
 const event=async name=>{const x={name,at:Date.now(),seconds:recordStart?(Date.now()-recordStart)/1000:null,state:await state()};report.events.push(x);console.log('EVENT',name,x.seconds,JSON.stringify({pos:x.state.world.position,mode:x.state.props.runtime.mode,race:x.state.race}));return x;};
 const shot=async name=>{const s=await send('Page.captureScreenshot',{format:'png'},session);await writeFile(out+name+'.png',Buffer.from(s.data,'base64'));report.snapshots.push({name,at:Date.now()});};
 await send('Runtime.enable',{},session);await send('Page.enable',{},session);await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false,screenWidth:1920,screenHeight:1080},session);
 const value=freshState();value.position=initialPosition;Object.assign(value.settings,{sound:true,voiceAuto:true,reduced:false,quality:'high',cameraMode:'street'});report.fixture=value;
 await send('Page.navigate',{url:new URL('/media/manifest.json',base).href},session);await until(`location.pathname==='/media/manifest.json'&&document.readyState==='complete'`);await evaluate(`localStorage.setItem(${JSON.stringify(SAVE_KEY)},${JSON.stringify(JSON.stringify(value))})`);
 await send('Page.navigate',{url:base},session);await until(`Boolean(window.__JIANGCHENG__&&document.querySelector('#boot').hidden&&__JIANGCHENG__.getResidents().residents.every(r=>r.avatar?.state==='ready'))`);await click('#start-window');await until(`__JIANGCHENG__.getWorld().active`);await until(`Boolean(document.querySelector('#film-close'))`,15000);await click('#film-close');await until(`__JIANGCHENG__.getModal()===null||__JIANGCHENG__.getModal()==='vehicle-guide'`);await wait(1200);if(await evaluate(`Boolean(document.querySelector('#first-vehicle-guide-confirm'))`)){await click('#first-vehicle-guide-confirm');await wait(250);}
 // Real F dismisses the arrival camera, and shows first-vehicle teaching where relevant.
 await press('f');await wait(500);
 if(await evaluate(`Boolean(document.querySelector('#first-vehicle-guide-confirm'))`)){await click('#first-vehicle-guide-confirm');await wait(350);}
 await shot('01-ready');await event('ready-before-capture');
 await evaluate(`window.__DEMO_CAPTURE_REQUEST=(async()=>{try{const stream=await navigator.mediaDevices.getDisplayMedia({video:{width:{ideal:1920,max:1920},height:{ideal:1080,max:1080},frameRate:{ideal:30,max:30},displaySurface:'browser'},audio:{suppressLocalAudioPlayback:false,autoGainControl:false,echoCancellation:false,noiseSuppression:false,channelCount:2},preferCurrentTab:true,selfBrowserSurface:'include',surfaceSwitching:'exclude',systemAudio:'exclude'});window.__DEMO_CAPTURE={stream,tracks:stream.getTracks().map(t=>({kind:t.kind,label:t.label,settings:t.getSettings()}))};}catch(e){window.__DEMO_CAPTURE_ERROR=e.name+': '+e.message;}})();undefined`,true);
 await until('Boolean(window.__DEMO_CAPTURE||window.__DEMO_CAPTURE_ERROR)',20000);report.captureTracks=await evaluate('__DEMO_CAPTURE?.tracks');if(await evaluate('Boolean(window.__DEMO_CAPTURE_ERROR)'))throw Error(await evaluate('__DEMO_CAPTURE_ERROR'));
 await send('Page.bringToFront',{},session);await wait(1000);await send('Emulation.setVisibleSize',{width:1920,height:1080},session);await wait(700);const sz=await evaluate('__DEMO_CAPTURE.stream.getVideoTracks()[0].getSettings()');assert.equal(sz.width,1920);assert.equal(sz.height,1080);report.captureSize=sz;
 await evaluate(`(()=>{const p=__DEMO_CAPTURE;p.mime=['video/webm;codecs=vp8,opus','video/webm'].find(x=>MediaRecorder.isTypeSupported(x));p.parts=[];p.rec=new MediaRecorder(p.stream,{mimeType:p.mime,videoBitsPerSecond:16000000,audioBitsPerSecond:192000});p.rec.onerror=e=>p.error=e.error?.name+': '+e.error?.message;p.rec.ondataavailable=e=>{if(e.data.size)p.parts.push(e.data)};p.rec.onstop=()=>{p.blob=new Blob(p.parts,{type:p.mime});p.stopped=true};p.times=[];p.start=performance.now();p.worldBefore=__JIANGCHENG__.getWorld();let last;function tick(t){if(last!==undefined)p.times.push(t-last);last=t;if(!p.stopped)requestAnimationFrame(tick)}requestAnimationFrame(tick);p.rec.start(1000)})()`);recordStart=Date.now();report.recordStart=recordStart;
 if(mode==='boat'){
  await wait(900);await event('boarding-invitation');await click('#rowboat-race');await wait(1200);await event('race-invitation');await shot('02-race-invitation');await click('[data-race-start="boat"]');await event('countdown');await until(`__JIANGCHENG__.getRace()?.status==='running'`,8000);await event('race-start');
  let previousGate=-1,loops=0;const end=Date.now()+140000;
  while(Date.now()<end){const st=await state();if(!st.race){await keys([]);await event('race-ended');break;}if(st.race.paused){await click('[data-race-pause]');await wait(100);continue;}if(st.race.status!=='running'){await wait(70);continue;}
   const cp=st.race.nextCheckpoint,p=st.props.runtime.boatPosition,yaw=st.props.runtime.boatYaw,target=Math.atan2(cp.x-p.x,cp.z-p.z),difference=Math.atan2(Math.sin(target-yaw),Math.cos(target-yaw));
   if(st.race.checkpointsPassed!==previousGate){previousGate=st.race.checkpointsPassed;await event('gate-'+previousGate);if(previousGate===2||previousGate===6)await shot('gate-'+previousGate);}
   await keys([...(Math.abs(difference)<.27?['w']:[]),...(difference>.043?['a']:difference<-.043?['d']:[])]);await wait(70);if(++loops%50===0)console.log('BOAT',JSON.stringify({cp:previousGate,pos:p,diff:difference,sec:st.race.elapsed}));
  }
  await keys([]);await shot('03-result');await wait(2600);report.finalRaceProgress=await evaluate('__JIANGCHENG__.getState().races');await event('result-held');
 }else if(mode==='bridge'){
  await wait(500);await event('bridge-scenery');await press('e');await until(`__JIANGCHENG__.getModal()==='district'`,8000);await wait(1800);await event('bridge-first-line');await click('#district-next');await wait(4300);await event('bridge-old-photo-story');await shot('02-bridge-memory');
 }else if(mode==='bicycle'){
  let st=await state();if(st.props.runtime.mode!=='bicycle'){await press('f');await wait(500);}
  await event('bicycle-boarded');await keys(['w']);await wait(550);await keys(['w','a']);for(let i=0;i<45;i++){const p=(await state()).props.runtime.bikePosition;if(p.yaw>1.51)break;await wait(45);}await keys(['w']);await wait(6000);await event('bicycle-route');await shot('02-bicycle-ride');await keys([]);await wait(800);
 }else{
  let st=await state();if(st.props.runtime.mode!=='car'){await press('f');await wait(500);}
  await event('car-boarded');await key('w');await wait(6600);await keys([]);await wait(700);await event('car-eastbound');await shot('02-car-drive');
  // Continue the real drive to the 54号路牌 start; no teleport or parked-car override.
  const end=Date.now()+45000;while(Date.now()<end){st=await state();const p=st.props.runtime.cars.find(c=>c.id===st.props.runtime.carId);if(!p)break;if(p.x>50.7){await keys([]);break;}const diff=Math.atan2(Math.sin(Math.PI/2-p.yaw),Math.cos(Math.PI/2-p.yaw));await keys(['w',...(diff>.026?['a']:diff<-.026?['d']:[])]);await wait(65);}
  await keys([]);await wait(700);await event('car-at-start');await click('#neighborhood-race-launch');await wait(900);await shot('03-car-invitation');await click('[data-race-start="car"]');await event('car-countdown');await until(`__JIANGCHENG__.getRace()?.status==='running'`,8000);await event('car-race-start');
  let prevGate=-1;const raceEnd=Date.now()+126000;
  while(Date.now()<raceEnd){st=await state();if(!st.race){await keys([]);await event('car-race-ended');break;}if(st.race.paused){await click('[data-race-pause]');await wait(100);continue;}if(st.race.status!=='running'){await wait(70);continue;}const cp=st.race.nextCheckpoint,p=st.props.runtime.cars.find(c=>c.id===st.props.runtime.carId);if(!p)break;const angle=Math.atan2(cp.x-p.x,cp.z-p.z),diff=Math.atan2(Math.sin(angle-p.yaw),Math.cos(angle-p.yaw));if(st.race.checkpointsPassed!==prevGate){prevGate=st.race.checkpointsPassed;await event('car-gate-'+prevGate);if(prevGate===2||prevGate===6)await shot('car-gate-'+prevGate);}await keys(['w',...(diff>.065?['a']:diff<-.065?['d']:[])]);await wait(55);}
  await keys([]);await shot('04-car-result');await wait(2400);report.finalRaceProgress=await evaluate('__JIANGCHENG__.getState().races');await event('car-result-held');
 }
 await evaluate(`(()=>{const p=__DEMO_CAPTURE;p.end=performance.now();p.worldAfter=__JIANGCHENG__.getWorld();p.rec.stop()})()`);await until('__DEMO_CAPTURE.stopped',30000);
 report.recording=await evaluate(`(()=>{const p=__DEMO_CAPTURE,s=[...p.times].sort((a,b)=>a-b);return{mime:p.mime,error:p.error,bytes:p.blob.size,durationMs:p.end-p.start,rafFrames:p.times.length,rafFps:1000*p.times.length/p.times.reduce((a,b)=>a+b,0),p50Ms:s[Math.floor(s.length*.5)],p95Ms:s[Math.floor(s.length*.95)],p99Ms:s[Math.floor(s.length*.99)],maxMs:s.at(-1),worldFrameDelta:p.worldAfter.renderFrame-p.worldBefore.renderFrame,worldBefore:p.worldBefore,worldAfter:p.worldAfter,audio:__JIANGCHENG__.getAudio()}})()`);
 const b64=await evaluate(`new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result.slice(r.result.indexOf(';base64,')+8));r.readAsDataURL(__DEMO_CAPTURE.blob)})`);const bytes=Buffer.from(b64,'base64');assert.equal(bytes.length,report.recording.bytes);await writeFile(out+'source.webm',bytes);await evaluate('__DEMO_CAPTURE.stream.getTracks().forEach(t=>t.stop())');report.status='captured';await send('Browser.close');
}catch(error){report.status='failed';report.error=error.stack;if(send&&session){try{const r=await send('Runtime.evaluate',{expression:'({hidden:document.hidden,focus:document.hasFocus(),modal:window.__JIANGCHENG__?.getModal(),world:window.__JIANGCHENG__?.getWorld(),props:window.__JIANGCHENG__?.getProps(),race:window.__JIANGCHENG__?.getRace()})',returnByValue:true},session);report.failureState=r.result.value;const ss=await send('Page.captureScreenshot',{format:'png'},session);await writeFile(out+'failure.png',Buffer.from(ss.data,'base64'));}catch{}}console.error(error);process.exitCode=1;}
finally{ws?.close();chrome.kill();await wait(300);await rm(dir,{recursive:true,force:true});report.browserClosed=true;report.finishedAt=new Date().toISOString();await writeFile(out+'report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,report:out+'report.json'}));}
