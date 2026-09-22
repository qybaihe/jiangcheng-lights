import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeVehicleGuideProgress,acknowledgeVehicleGuide,vehicleGuideKind,firstVehicleGuideCandidate,createVehicleGuideGate} from '../src/vehicle-guide-progress.js';
import {firstVehicleGuideCopy,firstVehicleGuideMarkup,mountFirstVehicleGuide} from '../src/ui/first-vehicle-guide.js';

const bicycle = {id:'prop-bicycle',name:'巷口旧单车',propType:'bicycle'};
const sedan = {id:'prop-car-sedan',name:'暖黄小轿车',propType:'car'};
const van = {id:'prop-car-van',name:'青绿社区小货车',propType:'car'};
const context = patch => ({state:{props:{bicycleUnlocked:false}},nearby:bicycle,active:true,...patch});

test('vehicle guide saves accept only the two real categories and detach arrays', () => {
  for (const value of [undefined,null,[],5,'bicycle',{seen:'bicycle'},{seen:['fake','__proto__']},{mode:'car'}]) {
    assert.deepEqual(normalizeVehicleGuideProgress(value),{version:1,seen:[]});
  }
  const source = {version:99,seen:['car','bicycle','car','ending'],reward:true};
  const progress = normalizeVehicleGuideProgress(source);
  assert.deepEqual(progress,{version:1,seen:['bicycle','car']});
  progress.seen.length=0;
  assert.equal(source.seen.length,4);
});

test('only a deliberate acknowledgement earns a category, without mutating the input', () => {
  const source={version:1,seen:[],storyChoices:{commitment:'help'}},before=structuredClone(source);
  const first=acknowledgeVehicleGuide(source,'bicycle');
  assert.deepEqual(first,{version:1,seen:['bicycle']});
  assert.deepEqual(acknowledgeVehicleGuide(first,'bicycle'),first);
  assert.deepEqual(acknowledgeVehicleGuide(first,'car'),{version:1,seen:['bicycle','car']});
  assert.deepEqual(acknowledgeVehicleGuide(first,'ending'),first);
  assert.deepEqual(source,before);
});

test('real vehicle ids share category completion; arbitrary propType cannot impersonate them', () => {
  assert.equal(vehicleGuideKind(bicycle),'bicycle');
  assert.equal(vehicleGuideKind(sedan),'car');
  assert.equal(vehicleGuideKind(van),'car');
  for(const prop of [null,{id:'constructor'},{id:'__proto__'},{id:'prop-newspaper',propType:'car'},{propType:'bicycle'}]) assert.equal(vehicleGuideKind(prop),null);
});

test('first encounter has no task, currency, parking or unlocking side effects', () => {
  const ctx=context(),before=structuredClone(ctx);
  assert.deepEqual(firstVehicleGuideCandidate(ctx),{kind:'bicycle',id:bicycle.id,name:bicycle.name,unlocked:false});
  assert.deepEqual(ctx,before);
  assert.equal(firstVehicleGuideCandidate(),null);
  assert.equal(firstVehicleGuideCandidate(context({nearby:null})),null);
  assert.equal(firstVehicleGuideCandidate(context({nearby:{id:'prop-ferry'}})),null);
});

test('CG, dialogue, maps, menus, arrival camera, air time and automatic approaches all defer it', () => {
  for(const patch of [
    {active:false},{active:1},{blocked:true},{modal:'film'},{modal:'story'},{modal:'resident'},
    {modal:'panel'},{arrival:true},{pending:true},{pending:{id:sedan.id}},{grounded:false},{hidden:true},
    {mode:'bicycle'},{mode:'car'},{mode:'ferry'},{mode:'reading'},{state:{runEnded:true}},
  ]) assert.equal(firstVehicleGuideCandidate(context(patch)),null,JSON.stringify(patch));
});

test('an old save gets one accurate reminder, not a fake locked vehicle state', () => {
  const old={props:{bicycleUnlocked:true},flags:['received','radio'],cars:{vehicles:{}}},before=structuredClone(old);
  const candidate=firstVehicleGuideCandidate(context({state:old}));
  assert.equal(candidate.unlocked,true);
  assert.match(firstVehicleGuideCopy(candidate).title,/再骑/);
  assert.equal(firstVehicleGuideCopy(candidate).action,'骑上自行车');
  assert.doesNotMatch(firstVehicleGuideCopy(candidate).description,/钥匙|不用花钱/);
  assert.deepEqual(old,before);
});

test('acknowledgement survives serialization and is shared by both cars, but not the bicycle', () => {
  const state=JSON.parse(JSON.stringify({vehicleGuides:acknowledgeVehicleGuide(null,'car')}));
  assert.equal(firstVehicleGuideCandidate(context({state,nearby:sedan})),null);
  assert.equal(firstVehicleGuideCandidate(context({state,nearby:van})),null);
  assert.equal(firstVehicleGuideCandidate(context({state})).kind,'bicycle');
});

test('a preempted card does not reopen every frame; leaving its range rearms it without saving', () => {
  const gate=createVehicleGuideGate(),ctx=context(),candidate=gate.consider(ctx);
  assert.equal(candidate.kind,'bicycle');
  assert.equal(gate.consider(ctx).id,bicycle.id,'reading the candidate never marks it presented');
  gate.presented(candidate);
  assert.equal(gate.consider(ctx),null);
  assert.equal(gate.consider({...ctx,modal:'panel'}),null);
  assert.equal(gate.consider(ctx),null);
  gate.consider({...ctx,nearby:null});
  assert.equal(gate.consider(ctx).id,bicycle.id);
  gate.presented(candidate);gate.reset();
  assert.equal(gate.consider(ctx).id,bicycle.id);
  assert.equal(ctx.state.vehicleGuides,undefined);
});

test('a second category can show, while permanent acknowledgements beat a transient gate reset', () => {
  const gate=createVehicleGuideGate(),ctx=context(),candidate=gate.consider(ctx);
  gate.presented(candidate);
  assert.equal(gate.consider({...ctx,nearby:sedan}).kind,'car');
  ctx.state.vehicleGuides=acknowledgeVehicleGuide(null,'bicycle');gate.reset();
  assert.equal(gate.consider(ctx),null);
  gate.presented({id:'__proto__'});assert.equal(gate.diagnostics().shownId,null);
});

test('copy explains actual F, WS, AD and Space controls and never offers auto-boarding', () => {
  for(const prop of [bicycle,sedan,van]){
    const candidate=firstVehicleGuideCandidate(context({nearby:prop})),html=firstVehicleGuideMarkup(candidate);
    assert.match(html,/role="dialog" aria-modal="true"/);
    for(const key of ['F','W','S','A','D','空格']) assert.ok(html.includes(`>${key}</kbd>`));
    assert.match(html,/记住了，回到巷子/);assert.match(html,/不会自动上车/);
    assert.match(html,/停车下车/);assert.match(html,/左右转向/);
    assert.equal(firstVehicleGuideCopy(candidate).sound,prop===bicycle?'按铃':'鸣笛');
  }
  assert.equal(firstVehicleGuideCopy({id:'fake'}),null);assert.equal(firstVehicleGuideMarkup(null),'');
  assert.match(firstVehicleGuideMarkup({...bicycle,kind:'bicycle'}),/借车并骑上/);
  assert.match(firstVehicleGuideMarkup({...van,kind:'car'}),/is-van/);
  assert.doesNotMatch(firstVehicleGuideMarkup({...sedan,kind:'car'}),/is-van/);
});

test('names are escaped in the artwork rather than injected as HTML', () => {
  const html=firstVehicleGuideMarkup({...sedan,name:'<img onerror="alert(1)">&\''});
  assert.ok(html.includes('&lt;img onerror=&quot;alert(1)&quot;&gt;&amp;&#39;'));
  assert.doesNotMatch(html,/<img onerror/);
});

class GuideRoot {
  constructor(){this.html='';this.nodes=new Map();this.events=new Map();this.ownerDocument={activeElement:null};}
  set innerHTML(html){this.html=html;this.nodes.clear();for(const match of html.matchAll(/<button\b[^>]*id="([^"]+)"[^>]*>/g)){
    const root=this,node={id:match[1],onclick:null,focus(){root.ownerDocument.activeElement=this;}};
    this.nodes.set('#'+node.id,node);
  }}
  get innerHTML(){return this.html;}
  querySelector(selector){return this.nodes.get(selector)??null;}
  addEventListener(type,listener){this.events.set(type,listener);}
  removeEventListener(type,listener){if(this.events.get(type)===listener)this.events.delete(type);}
  key(key,extra={}){const event={key,defaultPrevented:false,stopped:false,repeat:false,preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.stopped=true;},...extra};this.events.get('keydown')?.(event);return event;}
}
function mount(candidate=firstVehicleGuideCandidate(context())){
  const root=new GuideRoot(),calls=[];
  const ui=mountFirstVehicleGuide(root,{candidate,onAcknowledge:(...args)=>calls.push(args)});
  return {root,calls,ui};
}

test('mounting focuses the main button but never acknowledges or mutates state by itself', () => {
  const candidate=firstVehicleGuideCandidate(context()),before=structuredClone(candidate),h=mount(candidate);
  assert.equal(h.root.ownerDocument.activeElement.id,'first-vehicle-guide-confirm');
  assert.deepEqual(h.calls,[]);assert.deepEqual(candidate,before);
  assert.equal(h.ui.diagnostics().acknowledged,false);
});

test('F and movement keys are consumed, never used to acknowledge or leak to world handlers', () => {
  const h=mount();
  for(const key of ['f','F','w','a','s','d','ArrowUp','ArrowDown','e','g','m','j','v']){
    const event=h.root.key(key);
    assert.equal(event.defaultPrevented,true,key);assert.equal(event.stopped,true,key);
  }
  assert.deepEqual(h.calls,[]);
});

test('Enter, Space and Escape acknowledge once and consume the original keyboard event', () => {
  for(const key of ['Enter',' ','Escape']){
    const h=mount(),held=h.root.key(key,{repeat:true});
    assert.equal(held.defaultPrevented,true);assert.deepEqual(h.calls,[]);
    const event=h.root.key(key);assert.equal(event.defaultPrevented,true);assert.equal(event.stopped,true);
    h.root.key(key);h.ui.acknowledge();
    assert.equal(h.calls.length,1);
    assert.equal(h.calls[0][0],'bicycle');assert.equal(h.calls[0][1].reason,key==='Escape'?'escape':'keyboard');
  }
});

test('both mouse controls explicitly acknowledge once; browser shortcuts remain untouched', () => {
  for(const id of ['confirm','close']){
    const h=mount(),event={stopPropagation(){this.stopped=true;}};
    h.root.querySelector('#first-vehicle-guide-'+id).onclick(event);
    h.root.querySelector('#first-vehicle-guide-'+id).onclick(event);
    assert.equal(h.calls.length,1);assert.equal(event.stopped,true);assert.equal(h.calls[0][1].reason,id);
  }
  const h=mount();
  for(const extra of [{ctrlKey:true},{metaKey:true},{altKey:true}]) assert.equal(h.root.key('w',extra).defaultPrevented,false);
});

test('Tab stays within the two visible controls and never jumps to the world HUD', () => {
  const h=mount();assert.equal(h.root.key('Tab').stopped,true);
  assert.equal(h.root.ownerDocument.activeElement.id,'first-vehicle-guide-close');
  h.root.key('Tab');assert.equal(h.root.ownerDocument.activeElement.id,'first-vehicle-guide-confirm');
  h.root.key('Tab',{shiftKey:true});assert.equal(h.root.ownerDocument.activeElement.id,'first-vehicle-guide-close');
});

test('preemption disposal is idempotent and does not pretend the instruction was acknowledged', () => {
  const h=mount(),oldButton=h.root.querySelector('#first-vehicle-guide-confirm');
  h.ui.dispose();h.ui.dispose();
  assert.equal(h.root.innerHTML,'');assert.equal(oldButton.onclick,null);assert.equal(h.root.events.size,0);
  assert.equal(h.ui.acknowledge(),false);assert.deepEqual(h.calls,[]);assert.equal(h.ui.diagnostics().disposed,true);
});

test('invalid candidates create no actionable UI or callbacks', () => {
  const h=mount({id:'constructor'});assert.equal(h.root.innerHTML,'');
  assert.equal(h.ui.acknowledge(),false);assert.deepEqual(h.calls,[]);h.ui.dispose();
});
