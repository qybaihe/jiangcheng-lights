import test from 'node:test';
import assert from 'node:assert/strict';
import {freshState,loadState,objective,SAVE_KEY} from '../src/story.js';
import {PHOTO_CHALLENGES,createPhotoAlignmentSession,getPhotoReferenceAnchors,normalizePhotoProgress,recordPhotoResult} from '../src/photo-alignment.js';
import {MEAL_ROUNDS,MEAL_STOPS,normalizeMealProgress,transitionMeal,isMealRoundComplete} from '../src/meal-relay.js';
import {collectGallery,galleryItems,loadGallery,resolveEnding,recordEnding,resumeEndingFork} from '../src/endings.js';

const storage=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};};
const restore=value=>loadState({getItem:key=>{assert.equal(key,SAVE_KEY);return JSON.stringify(value);}});
function photoResult(id){
  const p=PHOTO_CHALLENGES[id].reference;
  const result=createPhotoAlignmentSession(id).shutter({position:{x:p.x,y:p.y,z:p.z},yaw:p.yaw,pitch:p.pitch,mode:'first',vehicle:'walk',paused:false,anchors:getPhotoReferenceAnchors(id)}).result;
  assert.ok(result,`${id} reference shutter succeeds`);return result;
}
function prepareMeal(progress,roundId='evening',deliver=true){
  let current=transitionMeal(progress,{type:'start',roundId}).progress;
  for(const order of MEAL_ROUNDS[roundId].orders){
    for(const field of ['food','scallion','chili','label'])current=transitionMeal(current,{type:'pack',roundId,orderId:order.id,field,value:field==='label'?order.id:order[field]}).progress;
    current=transitionMeal(current,{type:'seal',roundId,orderId:order.id}).progress;
    if(deliver){const stop=MEAL_STOPS[order.stopId];current=transitionMeal(current,{type:'deliver',roundId,orderId:order.id,sample:{x:stop.x,y:stop.y,z:stop.z,mode:'walk',grounded:true}}).progress;}
  }
  return current;
}

test('new saves contain detached empty photo and meal records without advancing story',()=>{
  const a=freshState(),b=freshState();
  assert.deepEqual(a.photos,normalizePhotoProgress());assert.deepEqual(a.meals,normalizeMealProgress());
  a.photos.completed.push('shop');a.meals.rounds.evening.started=true;
  assert.deepEqual(b.photos.completed,[]);assert.equal(b.meals.rounds.evening.started,false);
  assert.equal(objective(b).target,'shop');assert.deepEqual(b.flags,[]);
});

test('legacy neighbor and ending saves keep their progress without invented new achievements',()=>{
  for(const flags of [['received','radio','granny'],['received','radio','chefRequested','chef'],['ending']]){
    const source={version:1,started:true,flags,supplies:['box','water','battery'],position:{x:1,z:21},seconds:500};
    const state=restore(source),mem=storage();
    assert.deepEqual(state.flags,flags);assert.deepEqual(state.photos,normalizePhotoProgress());assert.deepEqual(state.meals,normalizeMealProgress());
    assert.deepEqual(state.milestones,{});collectGallery(state,mem);
    assert.ok(!Object.keys(loadGallery(mem).unlocked).some(id=>id.startsWith('photo-')||id.startsWith('meal-')));
    if(flags.includes('ending'))assert.equal(objective(state).target,null);
  }
});

test('real shutter and delivery results survive a regular save and unlock only matching gallery slots',()=>{
  const state=freshState(),mem=storage();
  state.photos=recordPhotoResult(state.photos,photoResult('shop'));
  state.meals=prepareMeal(state.meals);
  const resumed=restore(state);assert.deepEqual(resumed.photos,state.photos);assert.deepEqual(resumed.meals,state.meals);
  collectGallery(resumed,mem);
  assert.deepEqual(Object.keys(loadGallery(mem).unlocked).sort(),['meal-evening','photo-shop']);
  assert.deepEqual(resumed.flags,[]);assert.equal(resolveEnding(resumed).id,'neutral');
  state.photos=recordPhotoResult(state.photos,photoResult('river'));state.meals=prepareMeal(state.meals,'morning');collectGallery(state,mem);
  assert.deepEqual(Object.keys(loadGallery(mem).unlocked).sort(),['meal-evening','meal-morning','photo-river','photo-shop']);
  const before=structuredClone(loadGallery(mem).unlocked);collectGallery(state,mem);assert.deepEqual(loadGallery(mem).unlocked,before);
  const newRun=galleryItems(freshState(),mem);assert.equal(newRun.filter(item=>item.unlocked).length,4);
});

test('packing without handover and forged result buttons grant no meal or photo art',()=>{
  const state=freshState(),mem=storage();state.meals=prepareMeal(state.meals,'evening',false);
  state.photos=recordPhotoResult(state.photos,{photoId:'shop',status:'finished',verified:true,anchorCount:3});
  assert.equal(isMealRoundComplete(state.meals),false);assert.deepEqual(state.photos.completed,[]);
  collectGallery(state,mem);assert.deepEqual(loadGallery(mem).unlocked,{});
  const restored=restore(state);assert.deepEqual(restored.meals,state.meals,'sealed food survives reload awaiting actual handover');
});

test('malformed life fields are normalized while unrelated save choices remain intact',()=>{
  const source={...freshState(),flags:['received','radio'],photos:{completed:['shop','unknown','shop']},meals:{rounds:{evening:{started:true,boxes:{lin:{food:'unknown',scallion:'none',chili:'none',label:'lin',sealed:true,delivered:true}}},invented:{completed:true}}},settings:{avatarId:'male',sound:false,soundDefaultsVersion:2}};
  const restored=restore(source);assert.deepEqual(restored.photos.completed,['shop']);
  assert.equal(isMealRoundComplete(restored.meals),false);assert.equal(restored.meals.rounds.evening.boxes.lin.delivered,false);
  assert.equal(restored.meals.rounds.invented,undefined);assert.equal(restored.settings.avatarId,'male');assert.equal(restored.settings.sound,false);
  assert.deepEqual(restored.flags,['received','radio']);
});

test('ending forks retain only progress at that decision and never erase later cross-run gallery',()=>{
  const state=freshState(),mem=storage();state.photos=recordPhotoResult(state.photos,photoResult('shop'));
  state.meals=prepareMeal(state.meals,'evening',false);state.storyChoices={commitment:'help',stay:'leave'};
  recordEnding(resolveEnding(state),state,mem);
  const fork=resumeEndingFork(mem,'regret');assert.deepEqual(fork.photos,state.photos);assert.deepEqual(fork.meals,state.meals);
  state.meals=prepareMeal(state.meals);collectGallery(state,mem);
  const restored=restore(resumeEndingFork(mem,'regret'));assert.equal(isMealRoundComplete(restored.meals),false);
  assert.equal(galleryItems(restored,mem).find(item=>item.id==='meal-evening').unlocked,true);
});
