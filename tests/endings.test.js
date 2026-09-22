import test from 'node:test';
import assert from 'node:assert/strict';
import {ENDINGS,resolveEnding,recordEnding,loadGallery,collectGallery,resumeEndingFork,galleryItems,GALLERY_KEY} from '../src/endings.js';
const storage=()=>{const data=new Map();return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};};
const state=(flags=[],storyChoices={})=>({version:1,flags,storyChoices,lore:[],settings:{avatarId:'male'},position:{x:0,z:1},seconds:90});
test('four endings are produced by real task status and choices, not cinematic completion',()=>{
 assert.equal(resolveEnding(state(['checked','towel'],{stay:'breakfast'})).id,'true');
 assert.equal(resolveEnding(state(['checked'],{stay:'breakfast'})).id,'good');
 assert.equal(resolveEnding(state(['checked','towel'],{stay:'leave',commitment:'help'})).id,'neutral');
 assert.equal(resolveEnding(state(['prepared'],{commitment:'help'})).id,'regret');
 assert.equal(resolveEnding(state(['radio'],{commitment:'undecided'})).id,'neutral');
});
test('recording an early ending never marks unfinished safety tasks completed',()=>{
 const s=state(['radio'],{commitment:'help'}), before=structuredClone(s), mem=storage();
 recordEnding(resolveEnding(s),s,mem);assert.deepEqual(s,before);
 assert.deepEqual(resumeEndingFork(mem,'regret').flags,['radio']);
 assert.ok(loadGallery(mem).unlocked['ending-regret']);
});
test('collection survives forks and a fresh run, while locked ending art is not earned',()=>{
 const mem=storage();recordEnding(ENDINGS[1],state(['checked'],{stay:'breakfast'}),mem);
 collectGallery(state([]),mem);
 const items=galleryItems(state([]),mem);
 assert.equal(items.find(x=>x.id==='ending-good').unlocked,true);
 assert.equal(items.find(x=>x.id==='ending-true').unlocked,false);
 const fork=resumeEndingFork(mem,'good');assert.equal(fork.storyChoices.stay,undefined);assert.ok(fork.flags.includes('checked'));
 fork.flags.push('fake');assert.ok(!resumeEndingFork(mem,'good').flags.includes('fake'));
});
test('optional towel image is not unlocked merely by mandatory preparation',()=>{
 const mem=storage();assert.equal(galleryItems(state(['prepared']),mem).find(x=>x.id==='memory-xu-first-shift').unlocked,false);
 assert.equal(galleryItems(state(['towel']),mem).find(x=>x.id==='memory-xu-first-shift').unlocked,true);
});
test('legacy ending and corrupt storage are handled without losing current game state',()=>{
 const mem=storage();mem.setItem(GALLERY_KEY,'not json');assert.deepEqual(loadGallery(mem).unlocked,{});
 collectGallery(state(['ending']),mem);assert.equal(loadGallery(mem).endings.true.legacy,true);
});
test('collection quota failure is reported without throwing or destroying state',()=>{
 const mem={getItem:()=>null,setItem:()=>{throw Error('quota');}};
 assert.equal(recordEnding(ENDINGS[2],state(),mem).saved,false);
});
