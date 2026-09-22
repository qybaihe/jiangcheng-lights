import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createFullscreenController} from '../src/ui/fullscreen.js';
function harness({unsupported=false,blocked=false,delayed=false,legacy=false}={}){
 const events=new Map(),states=[],calls=[];let resolve;
 const doc={fullscreenEnabled:!unsupported,documentElement:{},addEventListener:(type,callback)=>events.set(type,callback),removeEventListener:type=>events.delete(type)};
 const emit=()=>events.get(legacy?'webkitfullscreenchange':'fullscreenchange')?.();
 const enter=()=>{calls.push('enter');if(blocked)return Promise.reject(new Error('user activation'));const done=()=>{doc[legacy?'webkitFullscreenElement':'fullscreenElement']=doc.documentElement;emit();};if(delayed)return new Promise(r=>resolve=()=>{done();r();});done();return Promise.resolve();};
 doc.documentElement[legacy?'webkitRequestFullscreen':'requestFullscreen']=enter;
 doc[legacy?'webkitExitFullscreen':'exitFullscreen']=()=>{calls.push('exit');doc[legacy?'webkitFullscreenElement':'fullscreenElement']=null;emit();return Promise.resolve();};
 const controller=createFullscreenController({doc,onChange:state=>states.push(state)});
 return {controller,doc,events,calls,states,resolve:()=>resolve?.(),escape(){doc[legacy?'webkitFullscreenElement':'fullscreenElement']=null;emit();}};
}
test('native request is synchronous in the original gesture; state follows real fullscreen',async()=>{
 const h=harness();const promise=h.controller.enter();assert.deepEqual(h.calls,['enter']);assert.equal(h.controller.snapshot().active,true);
 assert.equal((await promise).status,'entered');assert.equal(h.controller.snapshot().pending,false);assert.equal(h.states.at(-1).active,true);
 assert.equal((await h.controller.toggle()).status,'window');assert.deepEqual(h.calls,['enter','exit']);
});
test('Escape/external fullscreenchange synchronizes controls without automatically entering again',async()=>{
 const h=harness();await h.controller.enter();h.escape();assert.equal(h.states.at(-1).active,false);assert.deepEqual(h.calls,['enter']);
});
test('window mode is a no-op when already windowed; repeated enters do not duplicate requests',async()=>{
 const h=harness();assert.equal((await h.controller.leave()).status,'window');assert.equal(h.calls.length,0);
 await h.controller.enter();await h.controller.enter();assert.equal(h.calls.length,1);
});
test('unsupported or rejected fullscreen resolves with actual state, never a pretend CSS fullscreen',async()=>{
 const unsupported=harness({unsupported:true});assert.equal((await unsupported.controller.enter()).status,'unsupported');assert.equal(unsupported.calls.length,0);assert.equal(unsupported.controller.snapshot().active,false);
 const rejected=harness({blocked:true});assert.equal((await rejected.controller.enter()).status,'blocked');assert.equal(rejected.controller.snapshot().pending,false);assert.equal(rejected.controller.snapshot().active,false);
});
test('pending transitions are deduplicated and settle before controls unlock',async()=>{
 const h=harness({delayed:true}),pending=h.controller.enter();assert.equal(h.controller.snapshot().pending,true);
 assert.equal((await h.controller.enter()).status,'busy');assert.equal(h.calls.length,1);
 h.resolve();const done=await pending;assert.equal(done.pending,false);assert.equal(done.active,true);
});
test('legacy native API and disposal keep listener ownership bounded',async()=>{
 const h=harness({legacy:true});assert.equal((await h.controller.enter()).status,'entered');assert.equal((await h.controller.leave()).status,'window');
 h.controller.dispose();h.controller.dispose();assert.equal(h.events.size,0);assert.equal((await h.controller.enter()).status,'disposed');
});
test('asynchronous void WebKit APIs wait for native events and deduplicate until completion',async()=>{
 const h=harness({legacy:true});let calls=0;
 h.doc.documentElement.webkitRequestFullscreen=()=>{calls++;};
 const enter=h.controller.enter();assert.equal(h.controller.snapshot().pending,true);
 assert.equal((await h.controller.enter()).status,'busy');assert.equal(calls,1);
 h.doc.webkitFullscreenElement=h.doc.documentElement;h.events.get('webkitfullscreenchange')();
 assert.equal((await enter).status,'entered');assert.equal(h.controller.snapshot().pending,false);
 h.doc.webkitExitFullscreen=()=>{};
 const exit=h.controller.leave();assert.equal(h.controller.snapshot().pending,true);
 h.escape();assert.equal((await exit).status,'window');
});
test('unanswered void native requests settle with a bounded fallback, or dispose immediately',async()=>{
 const h=harness({legacy:true});h.doc.documentElement.webkitRequestFullscreen=()=>{};
 assert.equal((await h.controller.enter()).status,'blocked');assert.equal(h.controller.snapshot().pending,false);
 const pending=h.controller.enter();h.controller.dispose();
 assert.equal((await pending).status,'disposed');assert.equal(h.events.size,0);
});
test('standard API support is independent of a disabled deprecated WebKit flag',()=>{
 const h=harness();h.doc.webkitFullscreenEnabled=false;
 assert.equal(h.controller.snapshot().supported,true);
});
const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const begin=source.indexOf('function beginFromWelcome('),end=source.indexOf('function toggleFullscreen(',begin);
function entry({pending=false,loading=false}={}){
 const calls=[],scope={world:{},avatarPending:false,fullscreen:{snapshot:()=>({pending}),enter:()=>{calls.push('enter');return Promise.resolve({status:'entered'});},leave:()=>{calls.push('leave');return Promise.resolve({status:'window'});}},bootLoading:{getSnapshot:()=>({state:loading?'loading':'complete'})},start:()=>calls.push('start'),toast:()=>{}};
 runInNewContext(source.slice(begin,end)+';this.begin=beginFromWelcome;',scope);return{calls,scope};
}
test('welcome fullscreen and window actions preserve audio gesture and never force fullscreen on window entry',()=>{
 const full=entry();full.scope.begin();assert.deepEqual(full.calls,['enter','start']);
 const win=entry();win.scope.begin(true);assert.deepEqual(win.calls,['leave','start']);
});
test('welcome waits for real boot and prevents rapid repeated transitions',()=>{
 for(const options of [{pending:true},{loading:true}]){const h=entry(options);h.scope.begin();assert.deepEqual(h.calls,[]);}
});
test('welcome has explicit fullscreen/window choices, keyboard guidance and native status diagnostics',()=>{
 assert.match(source,/id="start-window"/);assert.match(source,/id="welcome-fullscreen-hint"/);assert.match(source,/WASD 行走 · E 交谈/);
 assert.match(source,/fullscreen:fullscreen.snapshot\(\)/);assert.doesNotMatch(source,/\.requestFullscreen\s*\(/,'native access is owned by the controller');
});
test('preview waits for the chosen avatar and real boot just like story entry',()=>{
 assert.ok(source.includes("$('intro-film').disabled=busy"));
 const calls=[],scope={avatarPending:'female',bootLoading:{getSnapshot:()=>({state:'complete'})},sound:()=>calls.push('sound'),playFilm:id=>calls.push(id)};
 const handler=source.match(/\$\('intro-film'\)\.onclick=(\(\)=>\{[^\n]+?\});\$\('brand'\)/)?.[1];
 assert.ok(handler);runInNewContext('this.preview='+handler,scope);
 scope.preview();assert.equal(calls.length,0);
 scope.avatarPending=null;scope.preview();assert.deepEqual(calls,['sound','arrival']);
});
