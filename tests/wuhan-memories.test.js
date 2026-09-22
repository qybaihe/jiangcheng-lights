import test from 'node:test';
import assert from 'node:assert/strict';
import {WUHAN_MEMORIES,WUHAN_MEMORY_STYLE,getWuhanMemory,memoryForResidentTopic,memoryForLore,memoryForAdventure,isWuhanMemoryEarned,wuhanMemoryGalleryItems,wuhanMemoryGalleryId} from '../src/wuhan-memories.js';
import {RESIDENTS,createResidentChatState,transitionResidentChat,updateResidentProgress} from '../src/resident-stories.js';
import {freshState,LORE,DIALOGUES,EXTRA_DIALOGUES} from '../src/story.js';
import {ADVENTURE_STOPS} from '../src/adventure.js';
import {STORY_CGS} from '../src/story-art.js';
import {WUHAN_DISTRICT_STOPS} from '../src/wuhan-district-layout.js';

const counts=Object.fromEntries(['main','resident','lore','adventure'].map(kind=>[kind,WUHAN_MEMORIES.filter(m=>m.kind===kind).length]));
test('44 authored moments have 44 stable images and consistently warm Wuhan art direction',()=>{
 assert.deepEqual(counts,{main:8,resident:27,lore:6,adventure:3});assert.equal(WUHAN_MEMORIES.length,44);
 for(const property of ['id','image','brief'])assert.equal(new Set(WUHAN_MEMORIES.map(m=>m[property])).size,44,property);
 for(const m of WUHAN_MEMORIES){assert.match(m.id,/^[a-z0-9-]+$/);assert.equal(m.url,m.image);assert.equal(m.image,`/media/wuhan-memories-v1/${m.id}.webp`);assert.ok(m.title&&m.place&&m.era&&m.brief.length>35,m.id);assert.equal(getWuhanMemory(m.id),m);}
 assert.match(WUHAN_MEMORY_STYLE.treatment,/16:9/);assert.match(WUHAN_MEMORY_STYLE.palette,/青绿/);assert.match(WUHAN_MEMORY_STYLE.history,/虚构/);
 assert.equal(getWuhanMemory('unknown'),null);
});

test('all 27 resident topics, six lore stops, three adventure readings and main CGs map one-to-one',()=>{
 for(const person of RESIDENTS)for(const topic of person.topics){const m=memoryForResidentTopic(person.id,topic.id);assert.ok(m,person.id+'/'+topic.id);assert.equal(m.kind,'resident');assert.deepEqual(m.lines,topic.lines);assert.equal(m.title,topic.title);}
 for(const id of Object.keys(LORE))assert.equal(memoryForLore(id)?.loreId,id);
 for(const stop of ADVENTURE_STOPS)assert.equal(memoryForAdventure(stop.id)?.adventureId,stop.id);
 for(const cg of STORY_CGS)assert.equal(getWuhanMemory(cg.id)?.kind,'main',cg.id);
 const usedCGs=new Set(Object.values({...DIALOGUES,...EXTRA_DIALOGUES}).flatMap(lines=>lines.filter(l=>l.cg).map(l=>l.cg)));
 for(const id of usedCGs)assert.ok(getWuhanMemory(id),id);
 assert.equal(memoryForResidentTopic('granny','unknown'),null);assert.equal(memoryForLore('unknown'),null);assert.equal(memoryForAdventure('unknown'),null);
});

test('new district observation stops attach existing Wuhan moments without inventing missing images',()=>{
 for(const stop of WUHAN_DISTRICT_STOPS){const memory=getWuhanMemory(stop.memoryId);assert.ok(memory,stop.id+' -> '+stop.memoryId);assert.equal(memory.kind,'lore','district observation links field memory, not unearned resident anecdote');}
});

test('greeting, choosing a topic and reading only part of it never unlock a resident picture',()=>{
 for(const person of RESIDENTS)for(const topic of person.topics){
  const state=freshState(),before=structuredClone(state);state.residents=updateResidentProgress(state.residents,{type:'meet',residentId:person.id});
  const memory=memoryForResidentTopic(person.id,topic.id);assert.equal(isWuhanMemoryEarned(state,memory),false);
  let session=createResidentChatState(person.id,state);session=transitionResidentChat(session,{type:'advance'}).session;session=transitionResidentChat(session,{type:'topic',topicId:topic.id}).session;
  for(let i=0;i<topic.lines.length-1;i++){const event=transitionResidentChat(session,{type:'advance'});assert.equal(event.heard,null);session=event.session;assert.equal(isWuhanMemoryEarned(state,memory),false);}
  const completed=transitionResidentChat(session,{type:'advance'});assert.deepEqual(completed.heard,{residentId:person.id,topicId:topic.id});state.residents=updateResidentProgress(state.residents,{type:'topic-complete',...completed.heard});
  assert.equal(isWuhanMemoryEarned(state,memory),true);assert.equal(isWuhanMemoryEarned(state,memory.id),true);
  for(const key of ['flags','lore','supplies','storyChoices'])assert.deepEqual(state[key],before[key]);
 }
});

test('main/lore/adventure pictures unlock only from their own progress without mutating state',()=>{
 for(const m of WUHAN_MEMORIES.filter(m=>m.kind!=='resident')){
  const state=freshState();assert.equal(isWuhanMemoryEarned(state,m),false);assert.equal(isWuhanMemoryEarned(null,m),false);
  if(m.kind==='main')state.flags.push(m.flag);if(m.kind==='lore')state.lore.push(m.loreId);if(m.kind==='adventure')state.adventure.found.push(m.adventureId);
  const before=structuredClone(state);assert.equal(isWuhanMemoryEarned(state,m),true);assert.deepEqual(state,before);
 }
 assert.equal(isWuhanMemoryEarned(freshState(),'missing'),false);
});

test('earned optional memory gallery survives collection replay without granting new run progress',()=>{
 const state=freshState(),items=wuhanMemoryGalleryItems(state);assert.equal(items.length,36);assert.ok(items.every(m=>!m.unlocked));
 assert.equal(new Set(items.map(m=>m.id)).size,36);assert.ok(items.every(m=>m.type==='wuhan-memory'&&getWuhanMemory(m.memoryId)));
 const candidate=items.find(m=>m.kind==='resident'),collection={unlocked:{[candidate.id]:{at:'2026-09-12'}}},before=structuredClone(state);
 const saved=wuhanMemoryGalleryItems(state,collection);assert.equal(saved.filter(m=>m.unlocked).length,1);assert.equal(saved.find(m=>m.id===candidate.id).unlocked,true);
 assert.equal(candidate.id,wuhanMemoryGalleryId(candidate.memoryId));assert.deepEqual(state,before);assert.equal(isWuhanMemoryEarned(state,candidate.memoryId),false);
});
