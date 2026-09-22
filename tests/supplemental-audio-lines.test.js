import test from 'node:test';import assert from 'node:assert/strict';
import {SUPPLEMENTAL_AUDIO_LINES,residentGreetingAudioLine,residentTopicAudioLine,districtAudioLine,adventureAudioLine,loreAudioLine} from '../src/supplemental-audio-lines.js';
import {RESIDENTS,RESIDENT_PHASES} from '../src/resident-stories.js';import {WUHAN_DISTRICT_STOPS} from '../src/wuhan-district-layout.js';import {ADVENTURE_STOPS} from '../src/adventure.js';import {LORE,DIALOGUES,EXTRA_DIALOGUES} from '../src/story.js';import {ENDING_DIALOGUES} from '../src/ending-v3-data.js';

test('179 supplementary authored lines have collision-free stable IDs and 194 voice variants',()=>{
 assert.equal(SUPPLEMENTAL_AUDIO_LINES.length,179);const ids=new Set(SUPPLEMENTAL_AUDIO_LINES.map(l=>l.id));assert.equal(ids.size,179);
 const mainIds=new Set(Object.values({...DIALOGUES,...EXTRA_DIALOGUES,...ENDING_DIALOGUES}).flatMap(lines=>lines.map(l=>l.id)));
 for(const line of SUPPLEMENTAL_AUDIO_LINES){assert.match(line.id,/^town-[a-z0-9-]+$/);assert.ok(!mainIds.has(line.id));assert.ok(Object.isFrozen(line));assert.ok(line.text&&line.who&&line.profileId);}
 assert.equal(SUPPLEMENTAL_AUDIO_LINES.reduce((sum,l)=>sum+(l.profileId==='hero'?2:1),0),194);assert.ok(Object.isFrozen(SUPPLEMENTAL_AUDIO_LINES));
});
test('residents use exact greetings and story sentences, with all nine role IDs fixed',()=>{
 for(const r of RESIDENTS){for(const phase of RESIDENT_PHASES){const line=residentGreetingAudioLine(r.id,phase);assert.equal(line.text,r.greetings[phase]);assert.equal(line.who,r.name);assert.equal(line.profileId,r.id);}
 for(const t of r.topics)t.lines.forEach((text,index)=>{const line=residentTopicAudioLine(r.id,t.id,index);assert.equal(line.text,text);assert.equal(line.who,r.name);assert.equal(line.profileId,r.id);});}
});
test('five district and three adventure readings retain exact source text and authored speaker labels',()=>{
 for(const[stops,fn]of[[WUHAN_DISTRICT_STOPS,districtAudioLine],[ADVENTURE_STOPS,adventureAudioLine]])for(const s of stops)s.lines.forEach((source,index)=>{const line=fn(s.id,index);assert.equal(line.text,source.text);assert.equal(line.who,source.who);if(source.who==='阿遥')assert.equal(line.profileId,'hero');});
 for(const[id,lore]of Object.entries(LORE))assert.equal(loreAudioLine(id).text,lore.text);
});
test('unknown identities, phases, topics and malformed indices never return another recording',()=>{
 assert.equal(residentGreetingAudioLine('missing','beforeRain'),null);assert.equal(residentGreetingAudioLine('granny','missing'),null);assert.equal(residentTopicAudioLine('granny','missing',0),null);assert.equal(loreAudioLine('missing'),null);
 for(const index of[-1,.5,NaN,undefined,null,'0',1000]){assert.equal(residentTopicAudioLine('granny','bamboo-bed',index),null);assert.equal(districtAudioLine('wuhan-lifen',index),null);assert.equal(adventureAudioLine('kite-tools',index),null);}
});
