import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PLAYFUL_LIFE_DIALOGUES,PLAYFUL_LIFE_SCENES,PLAYFUL_LIFE_COPY,playfulLifeLine} from '../src/playful-life-dialogues.js';
import {STORY_V3_DIALOGUES,STORY_V3_EXTRA_DIALOGUES} from '../src/story-v3-data.js';
import {voiceClipFor} from '../src/audio-director.js';
import {MEAL_ROUNDS} from '../src/meal-relay.js';
import {presentationFor} from '../src/dialogue-presentation.js';

const oldLines=Object.values({...STORY_V3_DIALOGUES,...STORY_V3_EXTRA_DIALOGUES}).flat();
const newLines=Object.values(PLAYFUL_LIFE_DIALOGUES).flat();
const manifest=JSON.parse(readFileSync(new URL('../public/media/story-voice-manifest.json',import.meta.url),'utf8'));

test('life v1 lines are short, uniquely identified and stay in the live 3D world',()=>{
  const known=new Set(oldLines.map(line=>line.id));
  assert.equal(new Set(newLines.map(line=>line.id)).size,newLines.length);
  assert.deepEqual(Object.keys(PLAYFUL_LIFE_SCENES).sort(),Object.keys(PLAYFUL_LIFE_DIALOGUES).sort());
  for(const [key,lines] of Object.entries(PLAYFUL_LIFE_DIALOGUES)){
    assert.ok(Object.isFrozen(lines));assert.ok(lines.length>=2&&lines.length<=4);
    assert.ok(PLAYFUL_LIFE_SCENES[key].title);
    for(const line of lines){
      assert.ok(Object.isFrozen(line));assert.ok(!known.has(line.id));
      assert.equal(line.time,'present');assert.equal(line.cg,undefined);assert.equal(line.draftId,undefined);
      assert.equal(line.scope,'playful-life-v1');assert.ok(line.text.length<50,line.id);
    }
  }
});

test('photos do not disclose the late reopening revelation and evening food is not breakfast',()=>{
  const photos=['photoIntro','photoAligned','photoReturn'].flatMap(key=>PLAYFUL_LIFE_DIALOGUES[key]).map(line=>line.text).join('\n');
  assert.doesNotMatch(photos,/重新开门|重新开张|修理铺重开|遗物|遗愿|已经去世/);
  const evening=['foodPackIntro','foodReady','foodHandoff'].flatMap(key=>PLAYFUL_LIFE_DIALOGUES[key]).map(line=>line.text).join('\n');
  assert.doesNotMatch(evening,/过早|明早|早餐/);
  assert.match(evening,/社区/);assert.match(evening,/纸条/);assert.match(evening,/小许/);
  assert.match(PLAYFUL_LIFE_COPY.foodReplay,/不重复配送/);
});

test('handover speech respects the two receivers and distinct evening/morning orders',()=>{
  assert.equal(PLAYFUL_LIFE_SCENES.foodHandoffWest.placeId,'walker0');
  assert.equal(PLAYFUL_LIFE_SCENES.foodMorningHandoff.placeId,'community');
  assert.equal(PLAYFUL_LIFE_DIALOGUES.foodHandoffWest.at(-1).who,'陈姐');
  assert.equal(MEAL_ROUNDS.evening.orders.find(order=>order.id==='xu').food,'soup');
  assert.match(PLAYFUL_LIFE_DIALOGUES.foodHandoff[0].text,/藕汤/);
  assert.equal(MEAL_ROUNDS.morning.orders.find(order=>order.id==='xu').food,'doupi');
  assert.match(PLAYFUL_LIFE_DIALOGUES.foodMorningHandoff[0].text,/豆皮.*不放辣.*葱花另外/);
  assert.doesNotMatch(PLAYFUL_LIFE_DIALOGUES.foodMorningHandoff.map(line=>line.text).join(''),/藕汤/);
  assert.equal(MEAL_ROUNDS.evening.orders.filter(order=>order.stopId==='west').length,2);
  assert.match(PLAYFUL_LIFE_DIALOGUES.foodHandoffWest[0].text,/两份/);
  assert.match(PLAYFUL_LIFE_DIALOGUES.foodReady[0].text,/西巷两份，社区一份/);
  assert.doesNotMatch(PLAYFUL_LIFE_DIALOGUES.foodReady[0].text,/一盅|汤/);
  assert.equal(PLAYFUL_LIFE_SCENES.foodMorningAfter.placeId,'chef');
  assert.doesNotMatch(PLAYFUL_LIFE_DIALOGUES.foodMorningAfter.map(line=>line.text).join(''),/明天|明早/);
});

test('new scenes use stable local 3D framing and never inherit a memory CG',()=>{
  assert.equal(PLAYFUL_LIFE_SCENES.photoAligned.placeId,'photo-self');
  for(const [key,lines] of Object.entries(PLAYFUL_LIFE_DIALOGUES))for(const [index] of lines.entries())for(const replay of [false,true]){
    const presentation=presentationFor(key,index,{replay});
    assert.equal(presentation.memory,false,key);assert.equal(presentation.cgId,null,key);
    assert.equal(presentation.placeId,PLAYFUL_LIFE_SCENES[key].placeId,key);
  }
});

test('unrecorded lines have an explicit text-only fallback, not an unrelated existing voice',()=>{
  for(const line of newLines)for(const gender of ['female','male'])assert.equal(voiceClipFor(manifest,line,gender),null,line.id);
});

test('live delivery wording is versioned independently from approved dialogue and recordings',()=>{
  const originals=structuredClone(oldLines);
  for(const id of ['chef-present-dispatch','community-report-ready','revisit-chef-prepared']){
    const source=oldLines.find(line=>line.id===id);assert.ok(source);
    assert.equal(playfulLifeLine(source),source);
    for(const mode of ['pending','packed','delivered']){
      const revised=playfulLifeLine(source,{foodMode:mode});
      assert.notEqual(revised,source);assert.notEqual(revised.id,source.id);assert.equal(revised.sourceLineId,source.id);
      assert.equal(revised.draftId,undefined);assert.equal(revised.time,'present');assert.equal(revised.who,source.who);
      assert.equal(voiceClipFor(manifest,revised,'female'),null);
      assert.equal(voiceClipFor(manifest,revised,'male'),null);
      assert.doesNotMatch(revised.text,/等人取|人一会儿来取|等小许的人来/);
    }
  }
  assert.deepEqual(oldLines,originals);
});

test('memory lines, unknown lines and invalid modes never change',()=>{
  for(const source of oldLines.filter(line=>line.time==='memory'))assert.equal(playfulLifeLine(source,{foodMode:'delivered'}),source);
  const unchanged=oldLines.find(line=>line.id==='chef-intro-evening');
  assert.equal(playfulLifeLine(unchanged,{foodMode:'delivered'}),unchanged);
  const target=oldLines.find(line=>line.id==='chef-present-dispatch');
  for(const foodMode of ['unknown','__proto__','constructor',null])assert.equal(playfulLifeLine(target,{foodMode}),target);
  assert.equal(playfulLifeLine(null,{foodMode:'packed'}),null);
});
