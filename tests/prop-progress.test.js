import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePropProgress,updatePropProgress,currentNewspaperEdition,ferryAvailability} from '../src/prop-progress.js';
import {freshState,loadState,SAVE_KEY} from '../src/story.js';
import {resolveEnding,recordEnding,resumeEndingFork} from '../src/endings.js';

test('prop progress normalizes legacy and malformed saves without transient modes',()=>{
 assert.equal(normalizePropProgress().bicycleUnlocked,false);
 const p=normalizePropProgress({bicycleUnlocked:'true',mode:'ferry',bikePosition:{x:1,z:-60},readEditions:['beforeRain','beforeRain','fake'],notes:['window-corner','ending'],ferryRides:-2});
 assert.deepEqual(p,{version:1,bicycleUnlocked:false,bikePosition:null,readEditions:['beforeRain'],notes:['window-corner'],ferryRides:0});
});
test('each optional interaction is idempotent except a genuinely completed voyage',()=>{
 let p=updatePropProgress(null,{type:'borrow'});p=updatePropProgress(p,{type:'read',edition:'beforeRain'});p=updatePropProgress(p,{type:'read',edition:'beforeRain'});p=updatePropProgress(p,{type:'note',id:'window-corner'});
 assert.equal(p.bicycleUnlocked,true);assert.equal(p.readEditions.length,1);assert.equal(p.notes.length,1);
 assert.equal(updatePropProgress(p,{type:'ferry-abort'}).ferryRides,0);
 assert.equal(updatePropProgress(p,{type:'ferry-complete'}).ferryRides,1);
 assert.equal(updatePropProgress(p,{type:'park',position:{x:Infinity,z:0}}).bikePosition,null);
});
test('props never mutate main story flags, supplies, lore or ending choices',()=>{
 const state={...freshState(),storyChoices:{commitment:'help'},props:normalizePropProgress()},before=structuredClone(state);
 const props=updatePropProgress(state.props,{type:'note',id:'window-corner'});
 assert.deepEqual(state,before);assert.equal(props.flags,undefined);assert.equal(props.storyChoices,undefined);
});
test('a safe parked bicycle and reading progress survive a standard story save',()=>{
 const source={...freshState(),props:normalizePropProgress({bicycleUnlocked:true,bikePosition:{x:-19,z:20,yaw:1.23},readEditions:['beforeRain']})};
 const restored=loadState({getItem:key=>key===SAVE_KEY?JSON.stringify(source):null});assert.deepEqual(restored.props,source.props);
});
test('bicycle heading is retained and bounded for the same footprint on reload',()=>{
 const p=normalizePropProgress({bikePosition:{x:12,z:20,yaw:Math.PI*4+.3}});
 assert.ok(Math.abs(p.bikePosition.yaw-.3)<1e-12);
 assert.equal(normalizePropProgress({bikePosition:{x:12,z:20,yaw:Infinity}}).bikePosition.yaw,undefined);
});
test('newspapers advance only on rain afterword, and ferry closure follows preparation not just rainfall',()=>{
 assert.equal(currentNewspaperEdition({flags:['ending','checked']}),'beforeRain');assert.equal(currentNewspaperEdition({flags:['postlude']}),'afterRain');
 assert.equal(ferryAvailability({flags:[]}).available,true);assert.equal(ferryAvailability({flags:['prepared']}).available,false);
 assert.equal(ferryAvailability({flags:['checked']}).available,false);
 assert.equal(ferryAvailability({flags:['prepared','checked','postlude']}).available,true);
 assert.equal(ferryAvailability({flags:['postlude'],runEnded:true}).available,false);
});

test('normalization detaches saved references and preserves a canonical bounded set',()=>{
 const raw={bicycleUnlocked:true,bikePosition:{x:-19,z:20},readEditions:['afterRain','beforeRain','afterRain'],notes:['many-hands','window-corner'],ferryRides:99999};
 const before=structuredClone(raw),next=normalizePropProgress(raw);
 assert.deepEqual(next.readEditions,['beforeRain','afterRain']);assert.deepEqual(next.notes,['window-corner','many-hands']);assert.equal(next.ferryRides,9999);
 assert.notEqual(next.bikePosition,raw.bikePosition);assert.notEqual(next.readEditions,raw.readEditions);assert.notEqual(next.notes,raw.notes);
 next.bikePosition.x=0;next.readEditions.length=0;next.notes.length=0;assert.deepEqual(raw,before);
 assert.equal(updatePropProgress({ferryRides:9999},{type:'ferry-complete'}).ferryRides,9999);
 for(const ferryRides of [NaN,Infinity,1.5,'3',Number.MAX_SAFE_INTEGER+1])assert.equal(normalizePropProgress({ferryRides}).ferryRides,0);
});

test('a fresh run resets optional prop progress without sharing mutable defaults',()=>{
 const first=freshState(),second=freshState();
 first.props=updatePropProgress(first.props,{type:'borrow'});first.props=updatePropProgress(first.props,{type:'read',edition:'beforeRain'});first.props=updatePropProgress(first.props,{type:'ferry-complete'});
 assert.deepEqual(second.props,normalizePropProgress());assert.deepEqual(freshState().props,normalizePropProgress());
});

test('restoring an ending fork uses its original optional progress rather than the later run',()=>{
 const data=new Map(),storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
 const state={...freshState(),flags:['checked','towel'],storyChoices:{stay:'breakfast'},props:normalizePropProgress({bicycleUnlocked:true,bikePosition:{x:-19,z:20},readEditions:['beforeRain'],ferryRides:2})};
 state.endingFork=structuredClone(state);delete state.endingFork.storyChoices.stay;
 const original=structuredClone(state.endingFork.props);
 state.props=updatePropProgress(state.props,{type:'read',edition:'afterRain'});state.props=updatePropProgress(state.props,{type:'ferry-complete'});
 recordEnding(resolveEnding(state),state,storage);
 const fork=resumeEndingFork(storage,'true'),restored=loadState({getItem:()=>JSON.stringify(fork)});
 assert.deepEqual(restored.props,original);assert.deepEqual(restored.flags,['checked','towel']);
 assert.equal(restored.storyChoices.stay,undefined);assert.equal(restored.props.readEditions.includes('afterRain'),false);
 restored.props.notes.push('window-corner');assert.deepEqual(resumeEndingFork(storage,'true').props,original);
});
