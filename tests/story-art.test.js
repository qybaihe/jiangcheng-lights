import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {DIALOGUES,EXTRA_DIALOGUES,freshState} from '../src/story.js';
import {presentationFor} from '../src/dialogue-presentation.js';
import {STORY_CGS,STORY_PEOPLE,getStoryCG,isCGUnlocked,personPortrait,speakerPerson} from '../src/story-art.js';
import {cgGalleryMarkup,peopleMarkup,cgViewerMarkup} from '../src/ui/story-gallery.js';

test('each authored memory resolves to one of the eight unique CGs',()=>{
 const authored=new Set();
 for(const [key,lines] of Object.entries({...DIALOGUES,...EXTRA_DIALOGUES}))lines.forEach((line,index)=>{
  const {cgId}=presentationFor(key,index);
  if(line.time==='memory'){
   assert.ok(getStoryCG(cgId),`${key}/${line.id} has a valid illustration`);
   authored.add(cgId);
  }else assert.equal(cgId,null,`${line.id} cannot inherit a memory image`);
 });
 assert.equal(STORY_CGS.length,8);
 assert.deepEqual([...authored].sort(),STORY_CGS.map(cg=>cg.id).sort());
 assert.equal(new Set(STORY_CGS.map(cg=>cg.url)).size,8);
});

test('unreached CGs never reveal their art, title, caption or chapter in the gallery',()=>{
 let state=freshState();
 for(const flag of [null,'granny','chef','dock','prepared','ending']){
  if(flag)state={...state,flags:[...state.flags,flag]};
  const before=structuredClone(state),html=cgGalleryMarkup(state);
  for(const cg of STORY_CGS){
   const unlocked=isCGUnlocked(state,cg);
   for(const content of [cg.url,cg.title,cg.caption,cg.chapter])assert.equal(html.includes(content),unlocked,`${cg.id}: ${content}`);
  }
  assert.deepEqual(state,before,'reading the collection is side effect free');
 }
});

test('gallery uses existing flags and opens for previous completed saves',()=>{
 const saved={flags:['granny','chef','dock','prepared','ending']};
 assert.ok(STORY_CGS.every(cg=>isCGUnlocked(saved,cg)));
 for(const state of [null,{}, {flags:[]}, {flags:'ending'}])assert.ok(STORY_CGS.every(cg=>!isCGUnlocked(state,cg)));
 assert.equal(getStoryCG('unwritten'),null);
 assert.equal(isCGUnlocked(saved,null),false);
});

test('the same protagonist receives the chosen portrait and remains one person in the directory',()=>{
 assert.equal(STORY_PEOPLE.length,6);
 assert.equal(STORY_PEOPLE.filter(p=>p.id==='player').length,1);
 for(const avatarId of ['male','female']){
  const html=peopleMarkup(avatarId);
  assert.ok(html.includes(personPortrait('player',avatarId)));
  assert.ok(!html.includes(personPortrait('player',avatarId==='male'?'female':'male')));
  assert.equal((html.match(/class="person-card"/g)||[]).length,6);
 }
 assert.equal(speakerPerson('阿遥')?.id,'player');
 assert.equal(speakerPerson('外公的字条')?.id,'grandfather');
 assert.equal(speakerPerson('小许')?.id,'xu');
 assert.equal(speakerPerson('旁白'),null);
});

test('CG viewer has an explicit return and cannot move past either end of the collection',()=>{
 const first=cgViewerMarkup(STORY_CGS[0],0,8),last=cgViewerMarkup(STORY_CGS[7],7,8);
 assert.match(first,/id="cg-back"/);
 assert.match(first,/id="cg-prev" disabled/);
 assert.doesNotMatch(first,/id="cg-next" disabled/);
 assert.match(last,/id="cg-next" disabled/);
 assert.doesNotMatch(last,/id="cg-prev" disabled/);
});

test('all shipped character and memory illustrations exist as local browser assets',()=>{
 const urls=[...STORY_CGS.map(cg=>cg.url),...STORY_PEOPLE.map(p=>personPortrait(p.id)),personPortrait('player','male')];
 assert.equal(new Set(urls).size,15);
 for(const url of urls)assert.ok(existsSync(new URL(`../public${url}`,import.meta.url)),url);
});
