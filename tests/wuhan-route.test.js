import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {deriveWuhanRoute,WUHAN_ROUTE_STOPS,WUHAN_ROUTE_NAME,getWuhanRouteStop} from '../src/wuhan-route.js';
import {wuhanRouteMarkup,bindWuhanRoute,mountWuhanRouteHUD} from '../src/ui/wuhan-route.js';
import {WUHAN_DISTRICT_STOPS} from '../src/wuhan-district-layout.js';
import {PROP_ANCHORS} from '../src/world-interactions.js';
import {POIS,freshState,loadState,SAVE_KEY} from '../src/story.js';
import {recordWuhanVisit} from '../src/wuhan-visit-progress.js';
import {updatePropProgress} from '../src/prop-progress.js';

const ids=['noodles','wuhan-lifen','wuhan-breakfast','wuhan-bridge','wuhan-market','wuhan-ferry','prop-ferry'];
const allState=()=>({lore:['noodles'],wuhanVisits:ids.slice(1,6),props:{ferryRides:1},flags:[]});

test('the seven stops use real destinations, including the actual old dock rather than the historic ticket window',()=>{
  assert.equal(WUHAN_ROUTE_NAME,'外公的顺路地图');
  assert.deepEqual(WUHAN_ROUTE_STOPS.map(stop=>stop.id),ids);
  const destinations=[...POIS,...WUHAN_DISTRICT_STOPS,...PROP_ANCHORS];
  for(const stop of WUHAN_ROUTE_STOPS){
    assert.equal(stop.targetId,stop.id);
    assert.ok(destinations.some(place=>place.id===stop.targetId),stop.id);
    for(const field of ['lead','action','brief','connection','completionLabel'])assert.ok(stop[field].length>4,stop.id+' '+field);
    assert.equal(getWuhanRouteStop(stop.id),stop);
  }
  const dock=PROP_ANCHORS.find(place=>place.id===WUHAN_ROUTE_STOPS.at(-1).targetId);
  assert.deepEqual([dock.x,dock.z],[27,-23.1]);
  assert.equal(WUHAN_ROUTE_STOPS.at(-1).key,'F');
  assert.equal(WUHAN_ROUTE_STOPS.at(-2).key,'E');
  assert.match(WUHAN_ROUTE_STOPS.at(-2).brief,/真正登船要回老巷码头/);
  assert.equal(getWuhanRouteStop('ferry'),null);
  assert.equal(getWuhanRouteStop('__proto__'),null);
});

test('old, missing and malformed save fragments produce a clean unearned itinerary',()=>{
  for(const value of [undefined,null,5,'noodles',[],{},
    {lore:'noodles',wuhanVisits:'wuhan-lifen',props:{ferryRides:'1'},flags:{}},
    {lore:['unknown','wuhan-lifen'],wuhanVisits:['noodles','prop-ferry'],props:{ferryTrips:2}},
  ]){
    const route=deriveWuhanRoute(value);
    assert.equal(route.completedCount,0);assert.equal(route.nextId,'noodles');
    assert.equal(route.complete,false);assert.equal(route.total,7);assert.equal(route.paused,false);
  }
});

test('all 128 unordered completion subsets derive independently with the first remaining suggestion',()=>{
  for(let bits=0;bits<128;bits++){
    const done=ids.filter((id,index)=>bits&(1<<index));
    const state={lore:done.includes('noodles')?['noodles']:[],wuhanVisits:done.filter(id=>id.startsWith('wuhan-')).reverse(),props:{ferryRides:done.includes('prop-ferry')?3:0},flags:[]};
    const route=deriveWuhanRoute(state),expectedNext=ids.find(id=>!done.includes(id))??null;
    assert.equal(route.completedCount,done.length,`subset ${bits}`);
    assert.equal(route.nextId,expectedNext);
    assert.equal(route.complete,done.length===7);
    assert.deepEqual(route.stops.filter(stop=>stop.done).map(stop=>stop.id),done);
  }
});

test('map selection, proximity, travel start, aborted travel and unrelated lore never earn a stop',()=>{
  const state={lore:['ferry','bridge','photo'],wuhanVisits:[],props:{mode:'ferry',ferryProgress:1},position:{x:96,z:-15.3},navigationTarget:'wuhan-ferry',wuhanRoute:{active:true,visited:ids}};
  assert.equal(deriveWuhanRoute(state).completedCount,0);
  state.props=updatePropProgress(state.props,{type:'ferry-abort'});
  assert.equal(deriveWuhanRoute(state).ferryComplete,false);
  state.props=updatePropProgress(state.props,{type:'ferry-complete'});
  assert.equal(deriveWuhanRoute(state).completedCount,1);
  assert.equal(deriveWuhanRoute(state).ferryComplete,true);
  state.wuhanVisits=recordWuhanVisit(state.wuhanVisits,'wuhan-market');
  assert.equal(deriveWuhanRoute(state).completedCount,2);
  assert.equal(deriveWuhanRoute(state).nextId,'noodles');
});

test('duplicate or invalid completion data cannot inflate the seven-stamp count',()=>{
  const state=allState();state.lore.push('noodles','fake');state.wuhanVisits.push(...ids,'fake');
  assert.equal(deriveWuhanRoute(state).completedCount,7);
  assert.equal(deriveWuhanRoute(state).readCount,6);
  for(const ferryRides of [-1,NaN,Infinity,1.1,'2',Number.MAX_SAFE_INTEGER+1]){
    assert.equal(deriveWuhanRoute({...state,props:{ferryRides}}).completedCount,6);
  }
});

test('weather pauses suggestions without deleting progress and postlude resumes them',()=>{
  for(const flags of [['prepared'],['checked'],['prepared','checked','ending']]){
    const route=deriveWuhanRoute({...allState(),wuhanVisits:['wuhan-market'],flags});
    assert.equal(route.paused,true);assert.equal(route.pauseKind,'weather');assert.equal(route.completedCount,3);
    assert.equal(route.nextId,'wuhan-lifen');assert.match(route.pauseDetail,/先照应街坊/);
  }
  assert.equal(deriveWuhanRoute({...allState(),flags:['prepared','checked','ending','postlude']}).paused,false);
  const ended=deriveWuhanRoute({...allState(),flags:['postlude'],runEnded:true});
  assert.equal(ended.pauseKind,'ended');assert.equal(ended.completedCount,7);
});

test('derivation is pure, reads existing saves and does not add route progress to a save',()=>{
  const state={...freshState(),...allState(),flags:['storyV3','received'],storyChoices:{stay:'help'}};
  const before=structuredClone(state),route=deriveWuhanRoute(state);
  assert.deepEqual(state,before);
  route.stops[0].done=false;route.stops[0].lead='changed';
  assert.equal(deriveWuhanRoute(state).stops[0].done,true);
  assert.notEqual(deriveWuhanRoute(state).stops[0].lead,'changed');
  const loaded=loadState({getItem:key=>key===SAVE_KEY?JSON.stringify(state):null});
  assert.equal(deriveWuhanRoute(loaded).completedCount,7);
  assert.deepEqual(loaded.storyChoices,state.storyChoices);
  assert.equal(Object.hasOwn(loaded,'wuhanRoute'),false);
  assert.ok(Object.isFrozen(WUHAN_ROUTE_STOPS));assert.ok(Object.isFrozen(WUHAN_ROUTE_STOPS[0]));
});

test('map sheet has seven individually selectable stops and factual completion copy',()=>{
  const markup=wuhanRouteMarkup({},{});
  assert.equal((markup.match(/data-wuhan-route-stop=/g)||[]).length,7);
  assert.match(markup,/外公的顺路地图/);assert.match(markup,/aria-label="已记 0 \/ 7"/);
  assert.match(markup,/data-wuhan-route-start="noodles"/);
  assert.match(markup,/查看过早记忆，五处东街读到末页/);
  assert.doesNotMatch(markup,/data-wuhan-route-collapse/,'inactive route is not a permanent HUD opt-in');
  assert.match(wuhanRouteMarkup({}, {active:true}),/data-wuhan-route-collapse/);
  const chosen=wuhanRouteMarkup({}, {selectedId:'wuhan-ferry'});
  assert.match(chosen,/data-wuhan-route-start="wuhan-ferry"/);
  assert.match(chosen,/这里是旧址/);
  const dock=wuhanRouteMarkup({}, {selectedId:'prop-ferry'});
  assert.match(dock,/<kbd>F<\/kbd>/);assert.match(dock,/完整班近岸往返/);
  assert.doesNotMatch(wuhanRouteMarkup({}, {selectedId:'"><script>alert(1)</script>'}),/<script>/);
});

test('map sheet permits optional re-visits and disables start during the weather or ended run',()=>{
  assert.match(wuhanRouteMarkup(allState(),{selectedId:'wuhan-lifen'}),/再去这里看看/);
  assert.match(wuhanRouteMarkup({flags:['prepared']}),/data-wuhan-route-start="noodles" disabled/);
  assert.match(wuhanRouteMarkup({flags:['postlude'],runEnded:true}),/本次行程已结束/);
  assert.doesNotMatch(wuhanRouteMarkup({flags:['postlude']}),/data-wuhan-route-start="noodles" disabled/);
});

class Root {
  constructor(doc){this.ownerDocument=doc??{createElement:()=>new Root(this.ownerDocument)};this.handlers=new Map();this.children=[];this.dataset={};this.hidden=false;this.writes=0;this.html='';}
  addEventListener(type,fn){this.handlers.set(type,fn);}
  removeEventListener(type,fn){if(this.handlers.get(type)===fn)this.handlers.delete(type);}
  append(element){this.children.push(element);element.parent=this;}
  remove(){this.removed=true;this.parent.children=this.parent.children.filter(element=>element!==this);}
  contains(button){return button.root===this;}
  setAttribute(){}
  set innerHTML(value){this.html=value;this.writes++;}
  get innerHTML(){return this.html;}
  click(dataset,disabled=false,foreign=false){const button={dataset,disabled,root:foreign?{}:this};this.handlers.get('click')?.({target:{closest:()=>button}});}
}

test('sheet dispatches only deliberate valid button actions and releases its listener',()=>{
  const root=new Root(),calls=[];
  const binding=bindWuhanRoute(root,{onRoute:id=>calls.push(['route',id]),onStop:id=>calls.push(['stop',id]),onCollapse:()=>calls.push(['collapse']),onMain:()=>calls.push(['main'])});
  assert.deepEqual(calls,[]);
  root.click({wuhanRouteStop:'wuhan-ferry'});root.click({wuhanRouteStart:'prop-ferry'});
  root.click({wuhanRouteCollapse:''});root.click({wuhanRouteMain:''});
  assert.deepEqual(calls,[['stop','wuhan-ferry'],['route','prop-ferry'],['collapse'],['main']]);
  root.click({wuhanRouteStart:'noodles'},true);root.click({wuhanRouteStart:'unknown'});root.click({wuhanRouteStart:'noodles'},false,true);
  assert.equal(calls.length,4);binding.dispose();root.click({wuhanRouteStart:'noodles'});assert.equal(calls.length,4);assert.equal(root.handlers.size,0);
});

function hudHarness(){
  const parent=new Root(),state={lore:[],wuhanVisits:[],props:{ferryRides:0},flags:[]},world={active:true,blocked:false};
  const calls=[];let active=false,modal=false,targetId=null;
  const hud=mountWuhanRouteHUD({parent,getState:()=>state,getWorld:()=>world,isActive:()=>active,isModal:()=>modal,getTargetId:()=>targetId,onRoute:id=>calls.push(id),onCollapse:()=>{active=false;},onMain:()=>calls.push('main')});
  return {parent,state,world,hud,calls,active:value=>{active=value;},modal:value=>{modal=value;},target:value=>{targetId=value;}};
}

test('the narrow HUD is opt-in, read-only, cached and paused under gameplay overlays',()=>{
  const h=hudHarness(),before=structuredClone(h.state);h.hud.update();
  assert.equal(h.hud.element.hidden,true);assert.equal(h.hud.element.writes,0);assert.deepEqual(h.calls,[]);
  h.active(true);h.hud.update();assert.equal(h.hud.element.hidden,false);assert.match(h.hud.element.innerHTML,/下一站/);
  assert.equal(h.hud.element.writes,1);for(let i=0;i<100;i++)h.hud.update();assert.equal(h.hud.element.writes,1);
  assert.deepEqual(h.state,before);assert.deepEqual(h.calls,[]);
  for(const pause of [()=>h.modal(true),()=>{h.world.active=false;},()=>{h.world.blocked=true;},()=>{h.state.runEnded=true;}]){
    h.modal(false);h.world.active=true;h.world.blocked=false;h.state.runEnded=false;pause();h.hud.update();assert.equal(h.hud.element.hidden,true);
  }
  h.modal(false);h.world.active=true;h.world.blocked=false;h.state.runEnded=false;h.hud.update();assert.equal(h.hud.element.hidden,false);
  h.hud.element.click({wuhanRouteCollapse:''});h.hud.update();assert.equal(h.hud.element.hidden,true);
  h.hud.dispose();h.hud.dispose();assert.equal(h.parent.children.length,0);assert.equal(h.hud.element.handlers.size,0);assert.equal(h.hud.diagnostics().visible,false);
});

test('HUD honours an out-of-order selected stop, updates only earned progress and returns to remaining stops',()=>{
  const h=hudHarness();h.active(true);h.target('wuhan-market');h.hud.update();
  assert.match(h.hud.element.innerHTML,/05 · 街坊市集/);assert.match(h.hud.element.innerHTML,/data-wuhan-route-start="wuhan-market"/);
  h.state.wuhanVisits=['wuhan-market'];h.hud.update();assert.match(h.hud.element.innerHTML,/01 · 蔡记过早/);
  assert.match(h.hud.element.innerHTML,/已记 1 \/ 7/);assert.equal(h.hud.element.writes,2);
  Object.assign(h.state,allState());h.hud.update();assert.match(h.hud.element.innerHTML,/这一路，都记下了/);
  assert.match(h.hud.element.innerHTML,/data-wuhan-route-start="" disabled/);
  assert.deepEqual(h.calls,[]);assert.equal(h.hud.diagnostics().complete,true);
});

test('route UI adds no storage, independent render loop, external request or reward writer',()=>{
  for(const path of ['../src/wuhan-route.js','../src/ui/wuhan-route.js']){
    const source=readFileSync(new URL(path,import.meta.url),'utf8');
    assert.doesNotMatch(source,/localStorage|sessionStorage|setInterval\s*\(|setTimeout\s*\(|requestAnimationFrame\s*\(|fetch\s*\(/);
    assert.doesNotMatch(source,/dispatch\s*\(|recordWuhanVisit\s*\(|updatePropProgress\s*\(|collectGallery\s*\(/);
  }
  const css=readFileSync(new URL('../src/ui/wuhan-route.css',import.meta.url),'utf8');
  assert.match(css,/repeat\(7,minmax\(0,1fr\)\)/);assert.match(css,/min-height:48px/);
  assert.match(css,/@media\(max-height:760px\) and \(min-width:901px\)/);
  assert.match(css,/--hud-route-top,296px\) \+ 96px/);assert.match(css,/--hud-route-top,277px\) \+ 97px/);
  assert.match(css,/prefers-reduced-motion:reduce/);assert.match(css,/\[hidden\]\{display:none/);
});
