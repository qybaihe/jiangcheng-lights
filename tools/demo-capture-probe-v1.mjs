/**
 * Isolated 1080p capture probe. No source, distribution or user's save changes.
 * Game actions are genuine CDP keyboard/mouse input; diagnostics are read-only.
 * The sole save fixture seeds this disposable browser's own localStorage.
 * getDisplayMedia captures the complete rendered tab and its actual audio.
 */
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {freshState,SAVE_KEY} from '../src/story.js';
const base=process.env.GAME_URL||'http://127.0.0.1:4173/?v=opening-polish-v1';
const out=fileURLToPath(new URL('../output/demo-film-v1/capture/probe-v5/',import.meta.url));
await mkdir(out,{recursive:true});
const dir=await mkdtemp(tmpdir()+'/jiangcheng-demo-probe-v1-');
const report={startedAt:new Date().toISOString(),base,status:'running',scope:'Disposable isolated Chrome profile; fixture establishes story phase only; all recorded movement/navigation uses real keyboard/mouse input; rendered output is unmodified.',viewport:{width:1920,height:1080,deviceScaleFactor:1},inputs:[],snapshots:[],errors:[]};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',[
 '--headless=new','--user-data-dir='+dir,'--remote-debugging-port=0','--no-first-run','--no-default-browser-check',
 '--window-size=1920,1200','--window-position=0,30','--force-device-scale-factor=1',
 '--auto-accept-this-tab-capture','--auto-select-tab-capture-source-by-title=江城有灯',
 '--allow-http-screen-capture','--enable-usermedia-screen-capturing','about:blank'
],{stdio:'ignore'});
let ws,send,session,n=0;
try{
 let port;for(let i=0;i<100;i++){try{port=(await readFile(dir+'/DevToolsActivePort','utf8')).split('\n')[0];break;}catch{await wait(100);}}
 if(!port)throw Error('isolated Chrome did not expose its CDP port');
 const version=await(await fetch('http://127.0.0.1:'+port+'/json/version')).json();report.browser=version.Browser;
 ws=new WebSocket(version.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r));
 const pending=new Map();ws.addEventListener('message',e=>{const d=JSON.parse(e.data);if(d.id){const p=pending.get(d.id);pending.delete(d.id);d.error?p?.reject(new Error(JSON.stringify(d.error))):p?.resolve(d.result);}else if(d.method==='Runtime.exceptionThrown')report.errors.push(d.params.exceptionDetails);});
 send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++n;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,sessionId}));});
 const targets=await send('Target.getTargets'),target=targets.targetInfos.find(t=>t.type==='page');
 session=(await send('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;
 const evaluate=async(expression,gesture=false)=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:gesture},session);if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const until=async(expression,timeout=120000)=>{const end=Date.now()+timeout;while(Date.now()<end){try{if(await evaluate(expression))return;}catch(e){if(!/ReferenceError|Cannot find context/.test(e.message))throw e;}await wait(100);}throw Error('timeout: '+expression);};
 const click=async selector=>{const point=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing selector');const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);report.inputs.push({at:Date.now(),type:'mouse-click',selector,point});await send('Input.dispatchMouseEvent',{type:'mouseMoved',...point},session);await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point},session);await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point},session);};
 const key=async(key,down=true)=>{const code=key.length===1?'Key'+key.toUpperCase():key;const keyCode=key==='Enter'?13:key==='Escape'?27:key==='Home'?36:key==='ArrowDown'?40:key.toUpperCase().charCodeAt(0);report.inputs.push({at:Date.now(),type:down?'keyDown':'keyUp',key});await send('Input.dispatchKeyEvent',{type:down?'keyDown':'keyUp',key,code,windowsVirtualKeyCode:keyCode},session);};
 const press=async k=>{await key(k);await key(k,false);};
 const shot=async name=>{const s=await send('Page.captureScreenshot',{format:'png'},session);await writeFile(out+name+'.png',Buffer.from(s.data,'base64'));report.snapshots.push({name,at:Date.now(),world:await evaluate('__JIANGCHENG__.getWorld()'),audio:await evaluate('__JIANGCHENG__.getAudio()')});};
 await send('Runtime.enable',{},session);await send('Page.enable',{},session);
 await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false,screenWidth:1920,screenHeight:1080},session);
 const value=freshState();value.started=true;value.flags=['storyV3','received','radio'];Object.assign(value.settings,{sound:true,voiceAuto:true,reduced:false,quality:'high',cameraMode:'street'});report.fixture=value;
 await send('Page.navigate',{url:new URL('/media/manifest.json',base).href},session);await until(`location.pathname==='/media/manifest.json'&&document.readyState==='complete'`);await evaluate(`localStorage.setItem(${JSON.stringify(SAVE_KEY)},${JSON.stringify(JSON.stringify(value))})`);
 await send('Page.navigate',{url:base},session);await until(`Boolean(window.__JIANGCHENG__&&document.querySelector('#boot').hidden&&__JIANGCHENG__.getResidents().residents.every(r=>r.avatar?.state==='ready'))`);await click('#start');await until(`__JIANGCHENG__.getWorld().active&&__JIANGCHENG__.getModal()===null`);await wait(1800);
 report.page=await evaluate(`({title:document.title,width:innerWidth,height:innerHeight,dpr:devicePixelRatio,canvases:[...document.querySelectorAll('canvas')].map(c=>({width:c.width,height:c.height,cssWidth:c.clientWidth,cssHeight:c.clientHeight})),assets:[...document.querySelectorAll('script[src],link[rel=stylesheet]')].map(e=>e.src||e.href),audio:__JIANGCHENG__.getAudio()})`);
 await shot('01-ready');
 console.log('READY',JSON.stringify(report.page));
 await evaluate(`window.__DEMO_CAPTURE_REQUEST=(async()=>{try {const stream=await navigator.mediaDevices.getDisplayMedia({video:{width:{ideal:1920,max:1920},height:{ideal:1080,max:1080},frameRate:{ideal:30,max:30},displaySurface:'browser'},audio:{suppressLocalAudioPlayback:false,autoGainControl:false,echoCancellation:false,noiseSuppression:false,channelCount:2},preferCurrentTab:true,selfBrowserSurface:'include',surfaceSwitching:'exclude',systemAudio:'exclude'});window.__DEMO_CAPTURE={stream,tracks:stream.getTracks().map(t=>({kind:t.kind,label:t.label,settings:t.getSettings()}))};return window.__DEMO_CAPTURE.tracks;}catch(e){window.__DEMO_CAPTURE_ERROR=e.name+': '+e.message;}})();undefined`,true);
 await until(`Boolean(window.__DEMO_CAPTURE||window.__DEMO_CAPTURE_ERROR)`,20000);report.captureTracks=await evaluate(`window.__DEMO_CAPTURE?.tracks`);report.captureError=await evaluate(`window.__DEMO_CAPTURE_ERROR`);if(report.captureError)throw Error(report.captureError);
 console.log('TRACKS',JSON.stringify(report.captureTracks));
 await send('Page.bringToFront',{},session);await wait(1200);
 report.preSizeFix=await evaluate('({inner:[innerWidth,innerHeight],outer:[outerWidth,outerHeight],capture:__DEMO_CAPTURE.stream.getVideoTracks()[0].getSettings()})');
 await send('Emulation.setVisibleSize',{width:1920,height:1080},session);await wait(500);
 report.postSizeFix=await evaluate('({inner:[innerWidth,innerHeight],outer:[outerWidth,outerHeight],capture:__DEMO_CAPTURE.stream.getVideoTracks()[0].getSettings()})');console.log('SIZEFIX',JSON.stringify({pre:report.preSizeFix,post:report.postSizeFix}));
 report.afterCapture=await evaluate('({hidden:document.hidden,focused:document.hasFocus(),active:document.activeElement?.outerHTML,modal:__JIANGCHENG__.getModal()})');console.log('FOCUS',JSON.stringify(report.afterCapture));
 await evaluate('window.__DEMO_INPUT_LOG=[];["keydown","keyup","pointerdown"].forEach(type=>window.addEventListener(type,e=>__DEMO_INPUT_LOG.length<1000&&__DEMO_INPUT_LOG.push({type:e.type,key:e.key,trusted:e.isTrusted,target:e.target.tagName}),true))');
 await evaluate(`(()=>{const p=window.__DEMO_CAPTURE;p.mime=['video/webm;codecs=vp8,opus','video/webm'].find(x=>MediaRecorder.isTypeSupported(x));p.parts=[];p.rec=new MediaRecorder(p.stream,{mimeType:p.mime,videoBitsPerSecond:16000000,audioBitsPerSecond:192000});p.rec.onerror=e=>p.error=e.error?.name+': '+e.error?.message;p.rec.ondataavailable=e=>{if(e.data.size)p.parts.push(e.data)};p.rec.onstop=()=>{p.blob=new Blob(p.parts,{type:p.mime});p.stopped=true};p.times=[];p.start=performance.now();p.worldBefore=__JIANGCHENG__.getWorld();let last;function tick(t){if(last!==undefined)p.times.push(t-last);last=t;if(!p.stopped)requestAnimationFrame(tick)}requestAnimationFrame(tick);p.rec.start(1000);})()`);
 report.recordStart=Date.now();
 await key('w');await wait(2500);await key('w',false);await wait(300);
 report.afterWalk=await evaluate('({world:__JIANGCHENG__.getWorld(),input:__DEMO_INPUT_LOG.slice(0,30),inputCount:__DEMO_INPUT_LOG.length})');console.log('WALK',JSON.stringify({pos:report.afterWalk.world.position,inputs:report.afterWalk.input,inputCount:report.afterWalk.inputCount}));await click('#map');await until(`Boolean(document.querySelector('#map-destination'))`,5000);await wait(900);
 const options=await evaluate(`[...document.querySelector('#map-destination').options].map(o=>({value:o.value,label:o.textContent}))`);report.mapOptions=options;
 await click('[data-place=granny]');await wait(450);
 report.selectedDestination=await evaluate(`document.querySelector('#map-destination').value`);
 await click('#map-go');await wait(Math.max(500,12000-(Date.now()-report.recordStart)));
 report.beforeStop=await evaluate('({mime:__DEMO_CAPTURE.mime,state:__DEMO_CAPTURE.rec.state,error:__DEMO_CAPTURE.error,parts:__DEMO_CAPTURE.parts.map(x=>x.size),tracks:__DEMO_CAPTURE.stream.getTracks().map(t=>({kind:t.kind,muted:t.muted,readyState:t.readyState,settings:t.getSettings()}))})');console.log('BEFORE_STOP',JSON.stringify(report.beforeStop));
 await evaluate(`(()=>{const p=__DEMO_CAPTURE;p.end=performance.now();p.worldAfter=__JIANGCHENG__.getWorld();p.rec.stop();})()`);
 await until('__DEMO_CAPTURE.stopped',30000);report.recordEnd=Date.now();
 report.recording=await evaluate(`(()=>{const p=__DEMO_CAPTURE,s=[...p.times].sort((a,b)=>a-b),duration=p.end-p.start;return{mime:p.mime,bytes:p.blob.size,durationMs:duration,rafFrames:p.times.length,rafFps:1000*p.times.length/p.times.reduce((a,b)=>a+b,0),p50Ms:s[Math.floor(s.length*.5)],p95Ms:s[Math.floor(s.length*.95)],p99Ms:s[Math.floor(s.length*.99)],maxMs:s.at(-1),rafGapsOver50Ms:p.times.filter(x=>x>50).length,worldFrameDelta:p.worldAfter.renderFrame-p.worldBefore.renderFrame,worldBefore:p.worldBefore,worldAfter:p.worldAfter,audio:__JIANGCHENG__.getAudio()}})()`);
 const b64=await evaluate(`new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result.slice(r.result.indexOf(';base64,')+8));r.readAsDataURL(__DEMO_CAPTURE.blob)})`);await writeFile(out+'walking-route-native-tab.webm',Buffer.from(b64,'base64'));await shot('02-after-route');await evaluate('__DEMO_CAPTURE.stream.getTracks().forEach(t=>t.stop())');
 report.status='captured';console.log('CAPTURE',JSON.stringify({bytes:report.recording.bytes,durationMs:report.recording.durationMs,rafFps:report.recording.rafFps}));await send('Browser.close');
}catch(error){report.status='failed';report.error=error.stack;if(send&&session){try{const r=await send('Runtime.evaluate',{expression:'({hidden:document.hidden,focus:document.hasFocus(),modal:window.__JIANGCHENG__?.getModal(),world:window.__JIANGCHENG__?.getWorld(),inputs:window.__DEMO_INPUT_LOG})',returnByValue:true},session);report.failureState=r.result.value;const ss=await send('Page.captureScreenshot',{format:'png'},session);await writeFile(out+'failure.png',Buffer.from(ss.data,'base64'));}catch{}}console.error(error);process.exitCode=1;}
finally{ws?.close();chrome.kill();await wait(300);await rm(dir,{recursive:true,force:true});report.browserClosed=true;report.finishedAt=new Date().toISOString();await writeFile(out+'report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,report:out+'report.json'}));}
