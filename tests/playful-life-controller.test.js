import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as photo from '../src/photo-alignment.js';
import * as meal from '../src/meal-relay.js';
import * as tasks from '../src/playful-life-tasks.js';
import {freshState} from '../src/story.js';

// The real production controller and real rules run here. Only browser views
// and rendering are replaced; these unit samples are not gameplay evidence.
const source=readFileSync(new URL('../src/playful-life.js',import.meta.url),'utf8').replace(/^import[^\n]*\n/gm,'').replace(/^export /gm,'');
const real={...photo,...meal,...tasks};
const uiNames=['createPhotoAlignmentController','photoDirectoryMarkup','photoInvitationMarkup','mountMealPacking','mountMealHUD','createMealScenery','document','window'];
const compile=new Function(...Object.keys(real),...uiNames,`${source}\nreturn createPlayfulLife;`);
class Element{
 constructor(){this.children=[];this.queries=new Map();this.dataset={};this.classList={toggle(){},remove(){}};this.hidden=false;}
 append(el){this.children.push(el);el.parent=this;}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(el=>el!==this);}
 querySelector(selector){if(!this.queries.has(selector))this.queries.set(selector,new Element());return this.queries.get(selector);}
 querySelectorAll(selector){return [this.querySelector(selector)];}
}
function harness(initial={}){
 const state={...freshState(),started:true,flags:['received','radio','granny','chefRequested'],supplies:['box','water','battery'],...initial};
 const parent=new Element(),overlay=new Element(),window={handlers:{},addEventListener(key,fn){this.handlers[key]=fn;},removeEventListener(key){delete this.handlers[key];}};
 const document={body:new Element(),createElement:()=>new Element(),getElementById:()=>overlay,querySelector:s=>overlay.querySelector(s)};
 const world={active:true,rainy:false,ended:false,player:{position:{x:10,y:0,z:12}},playerMotion:{grounded:true},getPropState:()=>({mode}),heightAt:()=>0};
 let api,mode='walk',modal=null,packingOptions=null,photoHandlers,photoActive=false,saved=0,refreshed=0,chefStories=0,navigationTarget=null;
 const dialogue=[],routes=[],messages=[],flags=[],sounds=[],handoffs=[];
 const closeModal=()=>{api?.beforeModal();modal=null;};
 const panel=()=>{api?.beforeModal();modal='panel';return true;};
 const create=compile(...Object.values(real),(_world,_root,handlers)=>{
   photoHandlers=handlers;
   return {get active(){return photoActive;},begin(){photoActive=true;return true;},cancel(reason){if(!photoActive)return false;photoActive=false;handlers.onCancel({cancelReason:reason});return true;},snapshot:()=>photoActive?{status:'aligning'}:null,update(){},shutter(){},dispose(){}};
  },()=>'',()=>'',(_root,options)=>{packingOptions=options;return ()=>{};},()=>Object.assign(()=>{},{update(){}}),()=>({update(){},handover(stop){handoffs.push(stop.id);},snapshot:()=>({}),dispose(){}}),document,window);
 api=create({world,parent,getState:()=>state,getNavigationTarget:()=>navigationTarget,isModal:()=>modal,panel,closeModal,
  playDialogue(key,done){api.beforeModal();dialogue.push(key);modal='story';closeModal();done?.();},
  save(){saved++;},refresh(){refreshed++;},flag(id){flags.push(id);if(!state.flags.includes(id))state.flags.push(id);},
  toast:message=>messages.push(message),onRoute(id){navigationTarget=id;routes.push(id);},releaseInputs(){},syncCamera(){},onChefStory(){chefStories++;},onSound:name=>sounds.push(name)});
 const at=(stopId,{vehicle='walk',grounded=true}={})=>{const p=stopId==='chef'?{x:10,y:0,z:12}:meal.MEAL_STOPS[stopId];Object.assign(world.player.position,{x:p.x,y:p.y,z:p.z});mode=vehicle;world.playerMotion.grounded=grounded;};
 function pack(roundId='evening',ids=meal.MEAL_ROUNDS[roundId].orders.map(item=>item.id),ready=true){
  assert.ok(packingOptions,'actual controller mounted the packing view');
  let progress=packingOptions.progress;
  for(const id of ids){const item=meal.MEAL_ROUNDS[roundId].orders.find(order=>order.id===id);
   for(const field of ['food','scallion','chili','label']){const result=meal.transitionMeal(progress,{type:'pack',roundId,orderId:id,field,value:field==='label'?item.id:item[field]});progress=result.progress;packingOptions.onChange(progress,result);}
   const result=meal.transitionMeal(progress,{type:'seal',roundId,orderId:id});progress=result.progress;packingOptions.onChange(progress,result);
  }
  if(ready)packingOptions.onReady(progress);
  return progress;
 }
 return {api,state,world,dialogue,routes,messages,flags,sounds,handoffs,at,pack,closeModal,overlay,parent,window,
  atPhoto(id){const p=photo.PHOTO_CHALLENGES[id].reference;Object.assign(world.player.position,{x:p.x,y:p.y,z:p.z});mode='walk';},
  clickPractice(round='evening'){const button=overlay.querySelector('[data-life-practice-route]');button.dataset.lifePracticeRoute=round;api.bindDirectory(overlay);button.onclick();},
  startMorning(){api.beginMeal('morning');overlay.querySelector('[data-life-morning]').onclick();},
  cancelPhoto(reason='player-cancelled'){photoActive=false;photoHandlers.onCancel({cancelReason:reason});},
  get chefStories(){return chefStories;},get saved(){return saved;},get refreshed(){return refreshed;},get packing(){return packingOptions;}};
}

test('directory before the lamp memory returns to that story instead of granting a premature meal',()=>{
 const h=harness();h.api.beginMeal('evening');
 assert.equal(h.chefStories,1);assert.equal(h.state.meals.rounds.evening.started,false);assert.equal(h.packing,null);assert.deepEqual(h.flags,[]);h.api.dispose();
});

test('main relay uses real edits and three ground handovers before marking chef complete',()=>{
 const h=harness();h.api.chefStoryReady();assert.equal(h.dialogue.at(-1),'foodPackIntro');h.pack();
 assert.equal(meal.mealSummary(h.state.meals).ready,true);assert.ok(!h.state.flags.includes('chef'));
 h.at('west',{vehicle:'bicycle'});assert.equal(h.api.handover(),true);assert.equal(meal.mealSummary(h.state.meals).delivered,0);
 h.at('west');h.api.handover();h.api.handover();assert.equal(meal.mealSummary(h.state.meals).delivered,2);assert.deepEqual(h.flags,[]);
 h.at('community');h.api.handover();assert.equal(meal.mealSummary(h.state.meals).completed,true);assert.deepEqual(h.flags,['chef']);
 assert.equal(h.dialogue.at(-1),'foodHandoff');assert.equal(h.state.mealRound,null);assert.equal(h.api.handover(),false);
 assert.deepEqual(h.handoffs,['west','west','community']);h.api.dispose();
});

test('the final west delivery talks to Chen, not a community character across the map',()=>{
 const h=harness();h.api.chefStoryReady();h.pack();h.at('community');h.api.handover();h.at('west');h.api.handover();h.api.handover();
 assert.equal(h.dialogue.at(-1),'foodHandoffWest');assert.deepEqual(h.flags,['chef']);h.api.dispose();
});

test('morning requires deliberate next-day entry and uses the morning dish at Xu',()=>{
 const h=harness({flags:['received','radio','granny','chefRequested','chef','dock','prepared','checked','ending','postlude']});
 h.startMorning();assert.equal(h.state.mealMorning,true);assert.equal(h.dialogue.at(-1),'foodPostlude');h.pack('morning');
 h.at('west');h.api.handover();h.api.handover();h.at('community');h.api.handover();
 assert.equal(h.dialogue.at(-1),'foodMorningHandoff');assert.equal(meal.isMealRoundComplete(h.state.meals,'morning'),true);
 assert.equal(meal.isMealRoundComplete(h.state.meals,'evening'),false);assert.deepEqual(h.flags,[]);
 h.at('chef');assert.equal(h.api.intercept({id:'chef'}),true);assert.equal(h.dialogue.at(-1),'foodMorningAfter');h.api.dispose();
});

test('one sealed serving can be handed over without fabricating the other two',()=>{
 const h=harness();h.api.chefStoryReady();h.pack('evening',['lin'],false);h.closeModal();h.at('west');h.api.handover();
 assert.equal(meal.mealSummary(h.state.meals).sealed,1);assert.equal(meal.mealSummary(h.state.meals).delivered,1);assert.deepEqual(h.flags,[]);
 assert.equal(h.api.handover(),false);h.api.dispose();
});

test('an early existing completed relay cannot trap the later main-story callback',()=>{
 const h=harness({flags:['received','radio','granny','chefRequested','chef']});h.api.beginMeal('evening');h.pack();h.at('west');h.api.handover();h.api.handover();h.at('community');h.api.handover();
 assert.deepEqual(h.flags,[],'legacy chef progress is not recreated or removed');
 h.state.flags=h.state.flags.filter(id=>id!=='chef');h.at('chef');h.api.chefStoryReady();assert.deepEqual(h.flags,['chef']);h.api.dispose();
});

test('photo invite, start, cancellation and route displays never produce completion awards',()=>{
 const h=harness();for(const id of ['__proto__','constructor']){h.state.photoTarget=id;h.api.beginPhoto(id);assert.equal(h.api.intercept(null),false);assert.equal(h.api.photoActive,false);assert.doesNotThrow(()=>h.api.update());}h.state.photoTarget=null;
 h.api.invitePhoto();assert.equal(h.state.photoInvited,true);assert.deepEqual(h.state.photos.completed,[]);
 h.api.beginPhoto('shop');assert.equal(h.state.photoTarget,'shop');assert.deepEqual(h.state.photos.completed,[]);
 h.cancelPhoto();assert.equal(h.state.photoTarget,null);assert.deepEqual(h.state.photos.completed,[]);assert.deepEqual(h.flags,[]);h.api.dispose();
});

test('starting from away from the kitchen routes there without remote food preparation',()=>{
 const h=harness();h.at('west');h.api.beginMeal('evening');assert.equal(h.routes.at(-1),'chef');
 assert.equal(h.packing,null);assert.equal(h.state.meals.rounds.evening.started,false);assert.deepEqual(h.flags,[]);h.api.dispose();
});

test('map interruption can resume at a photo navigation point even without a base-world POI',()=>{
 const h=harness();h.api.beginPhoto('shop');assert.equal(h.api.photoActive,true);
 h.api.beforeModal();assert.equal(h.api.photoActive,false);assert.equal(h.state.photoTarget,'shop');
 h.atPhoto('shop');assert.equal(h.api.intercept(null),true);assert.equal(h.api.photoActive,true);
 assert.deepEqual(h.state.photos.completed,[]);assert.deepEqual(h.flags,[]);h.api.dispose();
});

test('a distant interrupted photo offers a nonmodal resume button without teleporting or awarding',()=>{
 const h=harness();h.api.beginPhoto('river');h.api.beforeModal();h.at('chef');const before={...h.world.player.position};
 assert.equal(h.api.intercept(null),false);h.api.update();const action=h.parent.children.find(child=>child.className==='life-world-action');
 assert.equal(action.hidden,false);assert.equal(action.dataset.photo,'river');assert.match(action.textContent,/继续找一找/);
 action.onclick();assert.equal(h.api.photoActive,true);assert.deepEqual(h.world.player.position,before);assert.deepEqual(h.state.photos.completed,[]);h.api.dispose();
});

test('an old completed story exposes empty-box practice and does not recreate deliveries or save edits',()=>{
 const h=harness({flags:['received','radio','granny','chefRequested','chef','dock','prepared','checked','ending','postlude']});
 assert.match(h.api.directoryMarkup(),/data-life-practice-route="evening"/);
 const before=structuredClone(h.state);h.at('west');h.clickPractice();assert.equal(h.routes.at(-1),'chef');assert.equal(h.packing,null);
 h.at('chef');assert.equal(h.api.intercept({id:'chef'}),true);assert.ok(h.packing);
 h.pack();assert.deepEqual(h.state,before);assert.equal(h.saved,0);assert.deepEqual(h.flags,[]);
 assert.match(h.messages.at(-1),/练习完成/);h.api.dispose();
});
