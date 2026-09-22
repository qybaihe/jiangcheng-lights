import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {deriveWuhanRoute,getWuhanRouteStop} from '../src/wuhan-route.js';
import {freshState} from '../src/story.js';

const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const excerpt=(start,end)=>source.slice(source.indexOf('function '+start),source.indexOf('function '+end));
test('prologue handoff preserves position, awards no task and waits for actual shop interaction',()=>{
 const calls=[],scope={closeModal:()=>calls.push('close'),flag:id=>calls.push(id),beginGuidance:id=>calls.push('route:'+id),world:{beginArrivalView:()=>calls.push('view'),getArrivalView:()=>({active:true})},syncArrivalView:()=>{},save:()=>calls.push('save'),toast:()=>{}};
 const fn=excerpt('arriveAtShop(','syncArrivalView(');
 assert.doesNotMatch(fn,/setPosition|playDialogue|circuitPuzzle|received/);
 runInNewContext(fn+';arriveAtShop();',scope);
 assert.deepEqual(calls,['close','prologueSeen','route:shop','view','save']);
});

function routeHarness(state=freshState()){
 const calls=[],node={hidden:false},scope={state,world:{active:true,path:[],setGuidance:()=>calls.push('clear')},modal:null,wuhanRouteActive:true,wuhanRouteTarget:'noodles',navigationTarget:'noodles',navigationRoute:{},navigationEnabled:true,navigationClock:0,deriveWuhanRoute,getWuhanRouteStop,$:()=>node,updateMini:()=>calls.push('mini')};
 runInNewContext(excerpt('syncWuhanRoute(','playChapter(')+';this.sync=syncWuhanRoute;',scope);
 return {scope,calls,node};
}
test('walking past never earns a route stop, opening a map does not create progress',()=>{
 const h=routeHarness();h.scope.sync();assert.equal(h.scope.navigationTarget,'noodles');assert.deepEqual(h.scope.state.lore,[]);
});
test('earned stop clears its arrow, suggests next but never automatically moves or advances story',()=>{
 const state=freshState();state.lore=['noodles'];const before=structuredClone(state),h=routeHarness(state);
 h.scope.world.path=[];h.scope.sync();assert.equal(h.scope.navigationEnabled,false);assert.equal(h.scope.navigationTarget,null);assert.equal(h.scope.wuhanRouteTarget,null);assert.equal(h.scope.wuhanRouteActive,true);
 assert.deepEqual(h.scope.state,before);assert.deepEqual(h.scope.world.path,[]);
});
test('reading defers route completion until the modal is closed',()=>{
 const state=freshState();state.lore=['noodles'];const h=routeHarness(state);h.scope.modal='panel';h.scope.sync();assert.equal(h.scope.navigationTarget,'noodles');
 h.scope.modal=null;h.scope.sync();assert.equal(h.scope.navigationTarget,null);
});
test('weather pauses active sightseeing navigation without granting or removing its records',()=>{
 const state=freshState();state.flags=['prepared'];const h=routeHarness(state);h.scope.world.path=[{x:13,z:21}];h.scope.sync();assert.equal(h.scope.wuhanRouteTarget,null);assert.equal(h.scope.navigationTarget,null);assert.equal(h.scope.navigationEnabled,true);assert.equal(h.scope.world.path.length,0);assert.deepEqual(state.flags,['prepared']);
});
test('only an explicit itinerary action owns the arrow; ordinary navigation yields to its destination',()=>{
 const fn=excerpt('beginGuidance(','openModal('),calls=[],scope={cancelSceneApproach:()=>calls.push('cancel-approach'),wuhanRouteActive:true,wuhanRouteTarget:'noodles',audioDirector:{effect:()=>{}},updateNavigation:()=>calls.push('update'),navigationTarget:null,navigationEnabled:false,navigationRoute:null,navigationClock:0};
 runInNewContext(fn+';this.begin=beginGuidance;',scope);
 scope.begin('noodles',{source:'wuhan'});assert.equal(scope.wuhanRouteActive,true);
 scope.begin('shop');assert.equal(scope.wuhanRouteActive,false);assert.equal(scope.wuhanRouteTarget,null);assert.equal(scope.navigationTarget,'shop');
 assert.deepEqual(calls,['cancel-approach','update','cancel-approach','update']);
});
test('returning to the main story cancels pending NPC approach before clearing paths',()=>{
 const calls=[],scope={cancelSceneApproach:()=>calls.push('cancel-approach'),wuhanRouteActive:true,wuhanRouteTarget:'noodles',world:{path:[{}],setGuidance:()=>calls.push('clear-guidance')},navigationTarget:'noodles',navigationRoute:{},navigationEnabled:true,$:()=>({hidden:false}),updateMini:()=>{},wuhanRouteHUD:{update:()=>{}},modal:null,beginGuidance:()=>calls.push('main'),objective:()=>({target:'shop'}),state:freshState(),toast:()=>{}};
 runInNewContext(excerpt('stopWuhanRoute(','syncWuhanRoute(')+';stopWuhanRoute(true);',scope);
 assert.deepEqual(calls,['cancel-approach','clear-guidance','main']);assert.equal(scope.world.path.length,0);
});
test('the minimap uses the same temporary approach route as the world arrow',()=>{
 const fn=excerpt('updateMini(','syncCameraUI(');
 assert.match(fn,/const shownRoute=pendingSceneInteraction\?\.route\?\?navigationRoute/);
 assert.doesNotMatch(fn,/pathMarkup\(navigationRoute\)/);
 const calls=[],scope={world:{path:[{}],greetingTarget:'granny'},pendingSceneInteraction:{id:'granny'},updateMini:()=>calls.push('mini')};
 runInNewContext(excerpt('cancelSceneApproach(','scenePoint(')+';cancelSceneApproach();',scope);
 assert.equal(scope.pendingSceneInteraction,null);assert.equal(scope.world.path.length,0);assert.equal(scope.world.greetingTarget,null);assert.deepEqual(calls,['mini']);
});
test('returning home clears only an active optional itinerary, not an unrelated manually chosen destination',()=>{
 for(const active of [true,false]){
  const scope={neighborhoodActivities:null,wuhanRouteActive:active,wuhanRouteTarget:active?'noodles':null,navigationTarget:'noodles',navigationRoute:{},navigationEnabled:true,world:{path:[],cancelArrivalView:()=>{},setGuidance:()=>{},releasePointerLock:()=>{}},cancelSceneApproach:()=>{},updateMini:()=>{},leavePropForModal:()=>{},clearTimeout:()=>{},toastTimer:null,$:()=>({classList:{remove:()=>{}},hidden:false}),closeModal:()=>{},refreshAudioScene:()=>{},document:{body:{classList:{remove:()=>{}}}},syncArrivalView:()=>{},syncStartControls:()=>{}};
  runInNewContext(excerpt('backHome(','renderHUD(')+';backHome();',scope);
  assert.equal(scope.navigationTarget,active?null:'noodles');assert.equal(scope.wuhanRouteActive,false);
 }
});
test('map has mutually exclusive content panels and lifecycle-managed route events',()=>{
 assert.match(source,/id="map-tab-overview"/);assert.match(source,/id="map-tab-wuhan"/);
 assert.match(source,/map-overview'\)\.hidden=itineraryVisible/);
 assert.match(source,/map-wuhan-itinerary'\)\.hidden=!itineraryVisible/);
 assert.match(source,/wuhanRouteBindings\?\.dispose\(\)/);
 assert.match(source,/getWuhanRoute:\(\)=>/);
});
