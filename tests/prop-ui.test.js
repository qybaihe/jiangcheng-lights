import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { mountNewspaper, escapeHTML } from '../src/ui/prop-interactions.js';
import { normalizePropProgress, updatePropProgress, ferryAvailability } from '../src/prop-progress.js';
import { NEWSPAPER_EDITIONS } from '../src/newspaper-data.js';
import { createVehicleGuideGate } from '../src/vehicle-guide-progress.js';

// Deliberately small DOM adapter: exercise the rendered buttons' assigned
// callbacks without needing a browser, WebGL scene or an extra DOM dependency.
class ReaderRoot {
  constructor() { this.nodes = new Map(); this.focused = null; this.html = ''; }
  set innerHTML(value) {
    this.html = value; this.nodes.clear();
    for (const match of value.matchAll(/<button\b([^>]*)>/g)) {
      const id = match[1].match(/\bid="([^"]+)"/)?.[1];
      if (!id) continue;
      const root = this;
      this.nodes.set(`#${id}`, {
        id, disabled: /\bdisabled\b/.test(match[1]), onclick: null,
        focus() { root.focused = id; },
        click() { if (!this.disabled) this.onclick?.(); },
      });
    }
  }
  get innerHTML() { return this.html; }
  querySelector(selector) { return this.nodes.get(selector) || null; }
  click(selector) { const node = this.querySelector(selector); assert.ok(node, selector); node.click(); }
}

function reader(flags = [], progress) {
  const root = new ReaderRoot();
  const state = { flags: [...flags], props: normalizePropProgress(progress), storyChoices: { commitment: 'help' } };
  const before = structuredClone(state), events = [];
  let props = state.props, closes = 0;
  const view = mountNewspaper(root, {
    state,
    onClose() { closes++; },
    onRead(edition) { events.push({ type: 'read', edition }); props = updatePropProgress(props, { type: 'read', edition }); },
    onNote(id) { events.push({ type: 'note', id }); props = updatePropProgress(props, { type: 'note', id }); },
  });
  return { root, state, before, events, view, progress: () => props, closes: () => closes };
}

test('opening or closing the newspaper front page does not record a read or a note', () => {
  const h = reader();
  assert.match(h.root.innerHTML, /雨前号/);
  assert.deepEqual(h.events, []);
  h.root.click('#newspaper-stand');
  assert.equal(h.closes(), 1);
  assert.deepEqual(h.events, []);
  assert.deepEqual(h.state, h.before);
  h.view.dispose();
  assert.equal(h.root.innerHTML, '');
  assert.equal(h.root.querySelector('#newspaper-next'), null);
});

test('the actual next-page handler records the stable edition key, never the printed edition id', () => {
  for (const [flags, key] of [[[], 'beforeRain'], [['checked', 'ending'], 'beforeRain'], [['checked', 'ending', 'postlude'], 'afterRain']]) {
    const h = reader(flags);
    h.root.click('#newspaper-next');
    assert.deepEqual(h.events, [{ type: 'read', edition: key }]);
    assert.deepEqual(h.progress().readEditions, [key]);
    assert.notEqual(key, NEWSPAPER_EDITIONS[key].id);
    assert.match(h.root.innerHTML, /游戏内虚构社区小报/);
    assert.equal(h.root.querySelector('#newspaper-next').disabled, true);
    assert.deepEqual(h.state, h.before, 'the view delegates rather than mutating story state');
  }
});

test('rereading pages remains idempotent, and the optional note needs its own click', () => {
  const h = reader();
  h.root.click('#newspaper-next');
  assert.deepEqual(h.progress().notes, []);
  h.root.click('#newspaper-prev');
  h.root.click('#newspaper-next');
  assert.deepEqual(h.progress().readEditions, ['beforeRain']);
  h.root.click('#newspaper-note');
  assert.deepEqual(h.progress().notes, ['window-corner']);
  assert.equal(h.root.querySelector('#newspaper-note').disabled, true);
  h.root.click('#newspaper-note');
  assert.equal(h.events.filter(event => event.type === 'note').length, 1);
  assert.deepEqual(h.state.flags, []);
  assert.deepEqual(h.state.storyChoices, { commitment: 'help' });
});

test('a saved note stays disabled on revisit and the afterword edition uses its own note', () => {
  const h = reader(['postlude'], { notes: ['many-hands'], readEditions: ['beforeRain'] });
  h.root.click('#newspaper-next');
  assert.deepEqual(h.progress().readEditions, ['beforeRain', 'afterRain']);
  assert.equal(h.root.querySelector('#newspaper-note').disabled, true);
  h.root.click('#newspaper-note');
  assert.deepEqual(h.events, [{ type: 'read', edition: 'afterRain' }]);
  const unread = reader(['postlude']);
  unread.root.click('#newspaper-next'); unread.root.click('#newspaper-note');
  assert.deepEqual(unread.progress().notes, ['many-hands']);
});

test('newspaper rendering escapes markup characters instead of injecting text as HTML', () => {
  assert.equal(escapeHTML('<>&"\''), '&lt;&gt;&amp;&quot;&#39;');
  assert.equal(escapeHTML(undefined), '');
});

// Evaluate only the main-thread ferry adapter against a world stub. These
// assertions cover counting/lifecycle wiring, not the world voyage simulation.
const mainSource = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const from = mainSource.indexOf('function updatePropInterface(){');
const to = mainSource.indexOf('\nfunction dispatch(', from);
assert.ok(from >= 0 && to > from, 'locate the main-thread prop interface adapter');
const updateInterfaceSource = mainSource.slice(from, to);

function ferryHarness({ mode = 'ferry', trips = 0, previous = 0, earned = 0 } = {}) {
  let runtime = { mode, completedFerryTrips: trips, ferryProgress: .4 };
  const effects = { saves: 0, closes: 0, cards: 0, hud: 0, notices: [] };
  const context = {
    world: { getPropState: () => runtime },
    state: { props: normalizePropProgress({ ferryRides: earned }), flags: [] },
    modal: 'ferry', lastFerryTrips: previous, lastAudioPropMode:mode, updatePropProgress, ferryAvailability,
    audioDirector:{effect(id){(effects.audio??=[]).push(id);}},refreshAudioScene(){},
    save() { effects.saves++; },
    closeModal() { effects.closes++; context.modal = null; },
    toast(value) { effects.notices.push(value); },
    updateFerryCard() { effects.cards++; },
    $() { return {}; },
    document: { body: { classList: { toggle() {} } } },
    propHUD: { update() { effects.hud++; } },
    // Vehicle discovery is a separate screen lifecycle; this harness only
    // owns ferry completion accounting and actual vehicle mode Foley.
    updateFirstVehicleGuide() {},
  };
  runInNewContext(`${updateInterfaceSource}\nthis.tick = updatePropInterface;`, context);
  return { context, effects, setRuntime(value) { runtime = { ...runtime, ...value }; }, tick() { context.tick(); } };
}

test('one natural voyage increments the saved count once and closes its card once', () => {
  const h = ferryHarness({ mode: 'walk', trips: 1 });
  h.tick(); h.tick();
  assert.equal(h.context.state.props.ferryRides, 1);
  assert.equal(h.context.lastFerryTrips, 1);
  assert.equal(h.effects.closes, 1);
  assert.equal(h.effects.saves, 1);
});

test('an early return closes the voyage without awarding a completed round trip', () => {
  const h = ferryHarness({ mode: 'walk', trips: 0 });
  h.tick(); h.tick();
  assert.equal(h.context.state.props.ferryRides, 0);
  assert.equal(h.effects.closes, 1);
  assert.equal(h.effects.saves, 1);
});

test('a restored world counter is a baseline, not a fresh completion reward', () => {
  const h = ferryHarness({ mode: 'walk', trips: 4, previous: 4, earned: 4 });
  h.tick();
  assert.equal(h.context.state.props.ferryRides, 4);
  h.context.modal = 'ferry';
  h.setRuntime({ mode: 'ferry', completedFerryTrips: 0 });
  h.tick();
  assert.equal(h.context.lastFerryTrips, 0);
  assert.equal(h.context.state.props.ferryRides, 4);
  h.setRuntime({ mode: 'walk', completedFerryTrips: 1 });
  h.tick(); h.tick();
  assert.equal(h.context.state.props.ferryRides, 5);
});

// The earlier `event =>` capture listener guards held-key releases. Exercise
// the actual `e =>` shortcut adapter here, not the entire intervening app.
const keyboardFrom = mainSource.indexOf("window.addEventListener('keydown',e=>");
const keyboardTo = mainSource.indexOf("\n$('overlay').addEventListener('keydown'", keyboardFrom);
assert.ok(keyboardFrom >= 0 && keyboardTo > keyboardFrom, 'locate the main-thread keyboard adapter');
function keyboardHarness(context = {}) {
  let keydown;
  const effects = { props: 0, story: 0 };
  const scope = {
    modal: null,
    playfulLife: null,
    window: { addEventListener(_type, callback) { keydown = callback; } },
    useWorldProp() { effects.props++; },
    interact() { effects.story++; },
    ...context,
  };
  runInNewContext(mainSource.slice(keyboardFrom, keyboardTo), scope);
  return { scope, effects, press(key, repeat = false, tagName = 'DIV', targetPatch = {}) {
    const event = { key, repeat, defaultPrevented: false, immediatePropagationStopped:false,
      target: { tagName, id: '', closest() { return null; }, ...targetPatch },
      preventDefault() { this.defaultPrevented = true; },
      stopImmediatePropagation() { this.immediatePropagationStopped = true; },
    };
    keydown(event); return event;
  } };
}

test('F is an independent prop key, E remains a story key, and held F does not toggle repeatedly', () => {
  const h = keyboardHarness();
  assert.equal(h.press('f').defaultPrevented, true);
  h.press('f', true); h.press('e');
  assert.deepEqual(h.effects, { props: 1, story: 1 });
  h.scope.modal = 'panel'; h.press('f'); h.press('e');
  assert.deepEqual(h.effects, { props: 1, story: 1 }, 'a modal intercepts both world interaction keys');
});

test('newspaper arrow keys click the real page controls and record the correct edition', () => {
  const h = reader(['postlude']);
  const keyboard = keyboardHarness({ modal: 'newspaper', $: id => h.root.querySelector(`#${id}`) });
  assert.equal(keyboard.press('ArrowRight').defaultPrevented, true);
  assert.deepEqual(h.events, [{ type: 'read', edition: 'afterRain' }]);
  keyboard.press('ArrowRight');
  assert.equal(h.events.length, 1, 'the disabled final-page control does not rerecord');
  keyboard.press('ArrowLeft');
  assert.equal(h.root.querySelector('#newspaper-prev').disabled, true);
  assert.deepEqual(keyboard.effects, { props: 0, story: 0 });
});

test('the generic panel forwards its inner semantic class to the prop lifecycle guard', () => {
  const begin = mainSource.indexOf('function panel('), end = mainSource.indexOf('\nfunction art(', begin);
  assert.ok(begin >= 0 && end > begin);
  let args;
  const close = {}, context = { openModal(...received) { args = received; return true; }, closeModal() {}, icon() { return ''; }, $() { return { querySelector() { return close; } }; } };
  runInNewContext(`${mainSource.slice(begin, end)}\nthis.show = panel;`, context);
  context.show('地图', '晴川里', '<div>map</div>', 'map-panel');
  assert.equal(args[0], 'panel');
  assert.equal(args[2], 'scrim');
  assert.equal(args[3], 'map-panel', 'the lifecycle guard can preserve bicycle mode for map overlays');
});


test('vehicle Foley fires once per actual mode transition, not on HUD polling',()=>{
 const h=ferryHarness({mode:'walk'});h.context.modal=null;
 h.setRuntime({mode:'car'});h.tick();h.tick();
 assert.deepEqual(h.effects.audio,['car-door-close','engine']);
 h.setRuntime({mode:'walk'});h.tick();h.tick();
 assert.deepEqual(h.effects.audio,['car-door-close','engine','car-door-open']);
 h.setRuntime({mode:'bicycle'});h.tick();h.tick();assert.equal(h.effects.audio.at(-1),'bicycle-freewheel');
});


test('Escape closes settings from a focused input without enabling world shortcuts there',()=>{
 let closes=0;const h=keyboardHarness({modal:'panel',closeModal(){closes++;}});
 for(const tag of ['INPUT','SELECT','TEXTAREA']){h.press('f',false,tag);h.press('e',false,tag);h.press('Escape',false,tag);}
 assert.equal(closes,3);assert.deepEqual(h.effects,{props:0,story:0});
});


test('boarding completes only the selected vehicle route, not another destination',()=>{
 const begin=mainSource.indexOf('function completeVehicleGuidance('),end=mainSource.indexOf('function useWorldProp(',begin);
 const effects={clears:0,maps:0},guide={hidden:false};const scope={navigationTarget:'bike',navigationRoute:{targetId:'bike'},navigationEnabled:true,world:{setGuidance(value){assert.equal(value,null);effects.clears++;}},$(){return guide;},updateMini(){effects.maps++;}};
 runInNewContext(`${mainSource.slice(begin,end)};this.complete=completeVehicleGuidance;`,scope);
 scope.complete('car');assert.equal(scope.navigationTarget,'bike');assert.equal(effects.clears,0);
 scope.complete('bike');assert.equal(scope.navigationTarget,null);assert.equal(scope.navigationRoute,null);assert.equal(scope.navigationEnabled,false);assert.equal(guide.hidden,true);assert.equal(effects.clears,1);assert.equal(effects.maps,1);
});

test('held Enter and Space cannot activate focused buttons in any modal, including the next puzzle panel',()=>{
 const keyboard=keyboardHarness();
 for(const modal of ['story','resident','district','adventure','vehicle-guide','panel','film','newspaper','cg','gallery']){
  keyboard.scope.modal=modal;
  for(const key of ['Enter',' ']){
   const event=keyboard.press(key,true,'BUTTON',{id:'next-screen-control',closest(selector){return selector==='button'?this:null;}});
   assert.equal(event.defaultPrevented,true,modal+' suppresses the native repeated button activation');
   assert.equal(event.immediatePropagationStopped,true,modal+' does not forward the repeated input to World');
  }
 }
 assert.deepEqual(keyboard.effects,{props:0,story:0});
});

test('the final dialogue Space is consumed before a completed conversation can return control to World',()=>{
 for(const modal of ['story','resident']){
  let advances=0,keyboard;
  const complete=()=>{advances++;keyboard.scope.modal=null;};
  keyboard=keyboardHarness({modal,dialogue:{inspecting:false},nextLine:complete,residentView:{advance:complete}});
  const event=keyboard.press(' ');
  assert.equal(advances,1);assert.equal(keyboard.scope.modal,null);
  assert.equal(event.defaultPrevented,true);assert.equal(event.immediatePropagationStopped,true);
  assert.deepEqual(keyboard.effects,{props:0,story:0});
 }
});

test('last dialogue to a new panel requires keyup before another Enter, and clears movement/jump buffers',()=>{
 const listeners=[];let focused;
 const button=id=>({id,tagName:'BUTTON',closest(selector){return selector==='button'?this:null;},focus(){focused=this;}});
 const storyNext=button('story-next'),panelClose=button('panel-close');focused=storyNext;
 const nodes={
  overlay:{hidden:false,innerHTML:'',querySelector(selector){return selector==='button'?panelClose:null;}},
  world:{focus(){focused={id:'world',tagName:'CANVAS',closest(){return null;}};}},
  toast:{classList:{remove(){}}},'route-guide':{},interact:{},
 };
 const world={keys:{w:true},path:[{x:1,z:2}],blocked:true,playerMotion:{bufferedTime:.15},getPropState:()=>({mode:'walk'}),cancelArrivalView(){},releasePointerLock(){},endConversation(){}};
 const scope={
  createVehicleGuideGate,world,modal:'story',storyIndex:0,neighborhoodActivities:null,playfulLife:null,
  vehicleGuideView:null,wuhanRouteBindings:null,memoryView:null,residentView:null,propReaderView:null,galleryView:null,cinemaPlayer:null,
  dialogue:null,playingAudio:null,toastTimer:null,advanceDistrictReading:null,advanceAdventureReading:null,pendingInteraction:null,navigationClock:0,
  window:{addEventListener(type,fn,capture=false){listeners.push({type,fn,capture});}},
  document:{body:{classList:{remove(){}}},querySelectorAll(){return[];}},
  $:id=>nodes[id],clearTimeout(){},syncArrivalView(){},cancelSceneApproach(){},syncCameraUI(){},refreshAudioScene(){},leavePropForModal(){return true;},
  audioDirector:{clearLine(){},setExternalVoice(){}},
 };
 const captureFrom=mainSource.indexOf('const vehicleGuideGate='),captureTo=mainSource.indexOf('let propHUD=',captureFrom);
 const modalFrom=mainSource.indexOf('function openModal('),modalTo=mainSource.indexOf('function panel(',modalFrom);
 const nextFrom=mainSource.indexOf('function nextLine('),nextTo=mainSource.indexOf('function simple(',nextFrom);
 assert.ok(captureFrom>=0&&captureTo>captureFrom&&modalFrom>=0&&modalTo>modalFrom&&nextFrom>=0&&nextTo>nextFrom);
 runInNewContext(mainSource.slice(captureFrom,captureTo)+mainSource.slice(modalFrom,modalTo)+mainSource.slice(nextFrom,nextTo)+mainSource.slice(keyboardFrom,keyboardTo),scope);
 let completed=0;
 scope.dialogue={lines:[{text:'最后一句'}],onDone(){completed++;scope.openModal('panel','<button id="panel-close">关闭</button>','scrim');}};
 function send(type,key,repeat=false){
  const event={key,repeat,target:focused,defaultPrevented:false,immediatePropagationStopped:false,preventDefault(){this.defaultPrevented=true;},stopImmediatePropagation(){this.immediatePropagationStopped=true;}};
  for(const listener of listeners.filter(entry=>entry.type===type).sort((a,b)=>Number(b.capture)-Number(a.capture))){listener.fn(event);if(event.immediatePropagationStopped)break;}
  return event;
 }
 send('keydown','w');
 const finish=send('keydown','Enter');
 assert.equal(completed,1);assert.equal(scope.modal,'panel');assert.equal(focused.id,'panel-close');
 assert.equal(finish.defaultPrevented,true);assert.equal(finish.immediatePropagationStopped,true);
 assert.deepEqual(Object.keys(world.keys),[]);assert.equal(world.playerMotion.bufferedTime,0);assert.equal(world.path.length,0);
 // A second down event without keyup stays blocked even if an automation or
 // platform accidentally labels it non-repeating; ownership is physical.
 for(const repeat of [true,false]){
  const held=send('keydown','Enter',repeat);
  assert.equal(held.defaultPrevented,true);assert.equal(held.immediatePropagationStopped,true);
 }
 assert.equal(send('keydown','w',true).immediatePropagationStopped,true);
 send('keyup','Enter');
 const deliberate=send('keydown','Enter');
 assert.equal(deliberate.defaultPrevented,false,'the new panel can receive a fresh deliberate Enter');
 assert.equal(deliberate.immediatePropagationStopped,false);
 send('keyup','Enter');send('keyup','w');
 assert.equal(completed,1,'the previous dialogue onDone callback was delivered exactly once');
});
