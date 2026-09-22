import test from 'node:test';
import assert from 'node:assert/strict';
import {freshState} from '../src/story.js';
import {RESIDENTS,updateResidentProgress} from '../src/resident-stories.js';
import {WUHAN_MEMORIES} from '../src/wuhan-memories.js';
import {GALLERY_KEY,galleryItems,collectGallery,loadGallery} from '../src/endings.js';
const memoryStorage=initial=>{const data=new Map(initial?[[GALLERY_KEY,JSON.stringify(initial)]]:[]);return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};};

test('expanded gallery contains exactly 44 memories, four endings and nine achievement artworks',()=>{
 const state=freshState(),before=structuredClone(state),items=galleryItems(state,memoryStorage());
 assert.equal(items.length,57);assert.equal(new Set(items.map(i=>i.id)).size,57);assert.equal(items.filter(i=>['memory','wuhan-memory'].includes(i.type)).length,44);
 assert.equal(items.filter(i=>i.type==='ending').length,4);assert.equal(items.filter(i=>i.type==='art').length,9);assert.ok(items.every(i=>!i.unlocked));
 assert.deepEqual(state,before);assert.equal(new Set(items.filter(i=>['memory','wuhan-memory'].includes(i.type)).map(i=>i.memoryId)).size,44);
 for(const item of WUHAN_MEMORIES)assert.equal(items.find(i=>i.memoryId===item.id)?.image,item.image,item.id);
});

test('all 27 actual heard-topic events persist their own pictures across a fresh run',()=>{
 const state=freshState(),storage=memoryStorage();
 for(const person of RESIDENTS)for(const topic of person.topics){state.residents=updateResidentProgress(state.residents,{type:'topic-complete',residentId:person.id,topicId:topic.id});collectGallery(state,storage);}
 const items=galleryItems(freshState(),storage),earned=items.filter(i=>i.unlocked);
 assert.equal(earned.length,27);assert.ok(earned.every(i=>i.kind==='resident'&&i.type==='wuhan-memory'));
 for(const item of earned)assert.equal(item.lines.length,4,item.id+' readable original anecdote');
 const dates=structuredClone(loadGallery(storage).unlocked);collectGallery(state,storage);assert.deepEqual(loadGallery(storage).unlocked,dates,'re-reading never duplicates awards or resets earned timestamps');
});

test('existing gallery IDs, endings and fork saves remain available while new memories stay locked',()=>{
 const legacy={version:3,unlocked:{'memory-granny-table':'2026-09-01T00:00:00Z','ending-good':'2026-09-02T00:00:00Z'},endings:{good:{id:'good'}},forks:{good:{version:1,position:{x:1,z:21},flags:['checked']}}};
 const storage=memoryStorage(legacy),items=galleryItems(freshState(),storage),restored=loadGallery(storage);
 assert.equal(items.find(i=>i.id==='memory-granny-table').unlocked,true);assert.equal(items.find(i=>i.id==='ending-good').canResume,true);
 assert.equal(items.filter(i=>i.unlocked).length,2);assert.ok(items.filter(i=>i.type==='wuhan-memory').every(i=>!i.unlocked));
 assert.deepEqual(restored.endings,legacy.endings);assert.deepEqual(restored.forks,legacy.forks);
});
