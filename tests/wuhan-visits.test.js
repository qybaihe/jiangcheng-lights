import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeWuhanVisits,recordWuhanVisit} from '../src/wuhan-visit-progress.js';
import {WUHAN_DISTRICT_STOPS} from '../src/wuhan-district-layout.js';
import {freshState,loadState,SAVE_KEY} from '../src/story.js';
import {isWuhanMemoryEarned} from '../src/wuhan-memories.js';
const ids=WUHAN_DISTRICT_STOPS.map(s=>s.id);
test('Wuhan visits sanitize damaged saves and keep stable order without aliases',()=>{
 for(const value of [undefined,null,42,'wuhan-lifen',{},true])assert.deepEqual(normalizeWuhanVisits(value),[]);
 const bad=[ids[1],ids[0],ids[1],null,5,{},'unknown','__proto__','constructor',ids[4]];
 const clean=normalizeWuhanVisits(bad);assert.deepEqual(clean,[ids[1],ids[0],ids[4]]);assert.notEqual(clean,bad);
});
test('recording a Wuhan observation is immutable, idempotent and never accepts foreign events',()=>{
 const original=[ids[1]],first=recordWuhanVisit(original,ids[0]);assert.deepEqual(original,[ids[1]]);assert.deepEqual(first,[ids[1],ids[0]]);
 assert.deepEqual(recordWuhanVisit(first,ids[0]),first);assert.notEqual(recordWuhanVisit(first,ids[0]),first);
 for(const id of [null,5,{},'missing','granny','lore-brick','__proto__'])assert.deepEqual(recordWuhanVisit(first,id),first);
});
test('visited district read states survive normal saves without advancing lore, quests or resident stories',()=>{
 const state=freshState();assert.deepEqual(state.wuhanVisits,[]);state.wuhanVisits=ids;state.flags=['storyV3','received','radio'];
 const loaded=loadState({getItem:key=>key===SAVE_KEY?JSON.stringify(state):null});assert.deepEqual(loaded.wuhanVisits,ids);
 assert.deepEqual(loaded.flags,state.flags);assert.deepEqual(loaded.lore,[]);assert.deepEqual(loaded.residents.heard,{});assert.deepEqual(loaded.supplies,[]);assert.deepEqual(loaded.storyChoices,{});
 for(const stop of WUHAN_DISTRICT_STOPS)assert.equal(isWuhanMemoryEarned(loaded,stop.memoryId),false,stop.id+' observation alone must not reveal unearned old memory');
 const damaged=loadState({getItem:()=>JSON.stringify({...state,wuhanVisits:[ids[0],ids[0],'unknown']})});assert.deepEqual(damaged.wuhanVisits,[ids[0]]);
});
