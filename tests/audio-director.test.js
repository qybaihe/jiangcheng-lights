import test from 'node:test';
import assert from 'node:assert/strict';
import {AudioDirector,AUDIO_DEFAULTS,audioPreferences,musicCueFor,voiceClipFor} from '../src/audio-director.js';
import {freshState,loadState} from '../src/story.js';

const flush=()=>new Promise(resolve=>setImmediate(resolve));
function harness({slowVoice=false,town={}}={}) {
 const sources=[],requests=[],status=[];let resolveSlow;
 const param=()=>({value:0,cancelScheduledValues(){},setValueAtTime(v){this.value=v;},setTargetAtTime(v){this.value=v;},linearRampToValueAtTime(v){this.value=v;}});
 const node=()=>({connect(){},disconnect(){},gain:param()});
 const context={state:'running',currentTime:0,destination:{},createGain:node,createDynamicsCompressor:()=>({...node(),threshold:param(),knee:param(),ratio:param(),attack:param(),release:param()}),resume:async()=>{},decodeAudioData:async data=>({duration:4,data}),createBufferSource:()=>{const s={...node(),start(){this.started=true;},stop(){this.stopped=true;},onended:null};sources.push(s);return s;}};
 const manifest={lines:{one:{text:'第一句',variants:{default:{url:'/media/one.mp3',voiceId:'granny'}}},two:{text:'第二句',variants:{female:{url:'/media/two-female.mp3',voiceId:'female'},male:{url:'/media/two-male.mp3',voiceId:'male'}}}}};
 const fetcher=async url=>{
  requests.push(url);
  if(url.endsWith('town-audio-v1/manifest.json'))return {ok:true,json:async()=>town};
  if(url.endsWith('story-voice-manifest.json'))return {ok:true,json:async()=>manifest};
  if(url.endsWith('story-music-manifest.json'))return {ok:true,json:async()=>({tracks:{explore:{url:'/media/explore.mp3'},memory:{url:'/media/memory.mp3'},ending:{url:'/media/ending.mp3'}},sfx:{page:{url:'/media/page.mp3'}}})};
  if(slowVoice&&url==='/media/one.mp3')await new Promise(resolve=>resolveSlow=resolve);
  return {ok:true,arrayBuffer:async()=>url};
 };
 const director=new AudioDirector({fetcher,createContext:()=>context,onVoiceState:value=>status.push(value)});
 return {director,context,sources,requests,status,manifest,resolveSlow:()=>resolveSlow?.()};
}

test('audio preferences migrate old saves and clamp malformed levels',()=>{
 assert.deepEqual(audioPreferences(null),AUDIO_DEFAULTS);
 assert.deepEqual(audioPreferences({musicVolume:9,voiceVolume:-2,effectsVolume:NaN,voiceAuto:'false'}),{...AUDIO_DEFAULTS,musicVolume:1,voiceVolume:0});
 assert.equal(freshState().settings.musicVolume,AUDIO_DEFAULTS.musicVolume);
 const old=loadState({getItem:()=>JSON.stringify({version:1,flags:['radio'],settings:{sound:true}})});
 assert.equal(old.settings.sound,true);assert.equal(old.settings.voiceAuto,true);assert.equal(old.settings.voiceVolume,.9);assert.deepEqual(old.flags,['radio']);
});

test('music follows narrative context and leaves films or the home screen quiet',()=>{
 assert.equal(musicCueFor(),null);assert.equal(musicCueFor({active:true}),'explore');
 assert.equal(musicCueFor({active:true,memory:true}),'memory');assert.equal(musicCueFor({active:true,memory:true,ending:true}),'ending');
 assert.equal(musicCueFor({active:true,film:true,ending:true}),null);
});

test('voice lookup rejects stale text, missing variants and remote URLs',()=>{
 const {manifest}=harness();
 assert.equal(voiceClipFor(manifest,{id:'one',text:'修订过的第一句'}),null);
 assert.equal(voiceClipFor(manifest,null),null);
 assert.equal(voiceClipFor(manifest,{id:'two',text:'第二句'},'male').voiceId,'male');
 assert.equal(voiceClipFor(manifest,{id:'one',text:'第一句'},'male').voiceId,'granny');
 manifest.lines.one.variants.default.url='https://remote.invalid/audio.mp3';
 assert.equal(voiceClipFor(manifest,{id:'one',text:'第一句'}),null);
});

test('cold startup requests only small manifests, never the full voice library, music or CG',async()=>{
 const h=harness(),d=h.director;await d.ready;d.configure({sound:true});
 assert.deepEqual(h.requests.sort(),['/media/story-music-manifest.json','/media/story-voice-manifest.json','/media/town-audio-v1/manifest.json'].sort());
 assert.equal(h.sources.length,0);assert.equal(d.cache.size,0);
 await d.playLine({id:'two',text:'第二句'},'male');
 assert.deepEqual(h.requests.filter(url=>/\.(mp3|ogg|wav|mp4|webm)$/.test(url)),['/media/two-male.mp3']);
});

test('a late first-line download cannot overlap the next line or restore stale ducking',async()=>{
 const h=harness({slowVoice:true}),d=h.director;await d.ready;d.configure({sound:true});
 const first=d.playLine({id:'one',text:'第一句'});await flush();
 await d.playLine({id:'two',text:'第二句'},'male');
 assert.equal(d.diagnostics().voice.lineId,'two');assert.equal(d.diagnostics().voice.voiceId,'male');
 h.resolveSlow();await first;
 assert.equal(h.sources.filter(s=>s.started&&!s.stopped).length,1);assert.equal(d.diagnostics().voice.lineId,'two');
 assert.equal(d.musicBus.gain.value,AUDIO_DEFAULTS.musicVolume*.28);
 d.clearLine();assert.equal(d.diagnostics().voice,null);assert.equal(d.diagnostics().ducking,false);
 assert.ok(h.sources.every(s=>s.stopped));assert.equal(d.musicBus.gain.value,AUDIO_DEFAULTS.musicVolume);
});

test('muting while a line loads cancels playback; manual replay works with automatic speech off',async()=>{
 const h=harness({slowVoice:true}),d=h.director;await d.ready;d.configure({sound:true});
 const pending=d.playLine({id:'one',text:'第一句'});await flush();d.configure({sound:false});h.resolveSlow();await pending;
 assert.equal(h.sources.length,0);assert.equal(d.diagnostics().status,'off');
 d.configure({sound:true,voiceAuto:false});await d.playLine({id:'two',text:'第二句'});assert.equal(h.sources.length,0);
 await d.replay();assert.equal(d.diagnostics().voice.lineId,'two');
 d.setVisible(false);assert.equal(d.diagnostics().voice,null);assert.equal(d.master.gain.value,0);
});

test('music changes stop the previous source and repeated scene updates do not restart it',async()=>{
 const h=harness(),d=h.director;await d.ready;d.configure({sound:true});await d.unlock();
 d.setScene({active:true});await flush();assert.equal(d.diagnostics().music,'explore');
 const count=h.sources.length;d.setScene({active:true});await flush();assert.equal(h.sources.length,count);
 const old=d.music.source;d.setScene({active:true,memory:true});await flush();assert.equal(d.diagnostics().music,'memory');assert.equal(old.stopped,true);
 d.setScene({active:true,film:true});assert.equal(d.diagnostics().music,null);
});

test('missing voice assets fail quietly and never leave music ducked',async()=>{
 const h=harness(),d=h.director;await d.ready;d.configure({sound:true});
 await d.playLine({id:'unknown',text:'临时回复'});assert.equal(d.diagnostics().status,'unavailable');assert.equal(d.diagnostics().ducking,false);
 assert.equal(h.requests.filter(url=>url.endsWith('.mp3')).length,0);
});

test('opening a film cancels a previously requested effect that finishes loading late',async()=>{
 const h=harness(),d=h.director;await d.ready;d.configure({sound:true});await d.unlock();d.setScene({active:true});await flush();
 let release;const oldBuffer=d.clipBuffer.bind(d);
 d.clipBuffer=clip=>clip.url==='/media/page.mp3'?new Promise(resolve=>release=()=>resolve({duration:1})):oldBuffer(clip);
 const pending=d.effect('page');await flush();d.setScene({active:true,film:true});release();await pending;
 assert.equal(d.effects.size,0);assert.equal(h.sources.filter(source=>source.started&&!source.stopped).length,0);
});


test('supplemental audio merges without replacing original actors and keeps exact-text validation',async()=>{
 const town={lines:{one:{text:'错误覆盖',variants:{default:{url:'/media/wrong.mp3'}}},town:{text:'巷口的话',variants:{default:{url:'/media/town.mp3',voiceId:'town-neighbor'}}}}};
 const h=harness({town}),d=h.director;await d.ready;d.configure({sound:true});
 await d.playLine({id:'one',text:'第一句'});assert.equal(d.diagnostics().voice.voiceId,'granny');
 await d.playLine({id:'town',text:'巷口的话'});assert.equal(d.diagnostics().voice.voiceId,'town-neighbor');
 await d.playLine({id:'town',text:'修过的对白'});assert.equal(d.diagnostics().voice,null);assert.equal(d.diagnostics().status,'unavailable');
});

test('town effects enforce milliseconds cooldown, bounded voices, gain and cancellation',async()=>{
 const effects=Object.fromEntries(['bell','page','door','engine','extra'].map(id=>[id,{url:`/media/${id}.mp3`,gain:.2,cooldown:400}]));
 const h=harness({town:{effects}}),d=h.director;await d.ready;d.configure({sound:true});await d.unlock();d.setScene({active:true});
 assert.equal(await d.effect('bell'),true);assert.equal(await d.effect('bell'),false);
 assert.equal(d.effects.size,1);h.context.currentTime=.39;assert.equal(await d.effect('bell'),false);
 h.context.currentTime=.41;assert.equal(await d.effect('bell'),true);
 await d.effect('page');await d.effect('door');assert.equal(d.effects.size,4);assert.equal(await d.effect('extra'),false);
 d.configure({sound:false});assert.equal(d.effects.size,0);assert.ok(h.sources.every(s=>s.stopped));
});

test('one local environment loop follows context, never duplicates, and stops for films or mute',async()=>{
 const h=harness({town:{effects:{water:{url:'/media/water.mp3',loop:true,gain:.1},breeze:{url:'/media/breeze.mp3',loop:true,gain:.12}}}}),d=h.director;
 await d.ready;d.configure({sound:true});await d.unlock();d.setScene({active:true,ambient:'water'});await flush();
 assert.equal(d.diagnostics().ambient,'water');const count=h.sources.length;d.setScene({active:true,ambient:'water'});await flush();assert.equal(h.sources.length,count);
 assert.equal(await d.effect('water'),false);
 const old=d.ambient.source;d.setScene({active:true,ambient:'breeze'});await flush();assert.equal(old.stopped,true);assert.equal(d.diagnostics().ambient,'breeze');
 d.setVisible(false);assert.equal(d.diagnostics().ambient,null);d.setVisible(true);await flush();assert.equal(d.diagnostics().ambient,'breeze');
 d.setScene({active:true,film:true,ambient:'breeze'});assert.equal(d.diagnostics().ambient,null);assert.equal(d.effects.size,0);
 d.configure({sound:false});assert.equal(d.diagnostics().ambient,null);
});

test('late ambience and voice never play over a film',async()=>{
 const h=harness({slowVoice:true,town:{effects:{water:{url:'/media/water.mp3',loop:true}}}}),d=h.director;await d.ready;d.configure({sound:true});await d.unlock();
 const previous=d.clipBuffer.bind(d);let release;
 d.clipBuffer=clip=>clip.url==='/media/water.mp3'?new Promise(resolve=>release=()=>resolve({duration:2})):previous(clip);
 d.setScene({active:true,ambient:'water'});await flush();
 const voice=d.playLine({id:'one',text:'第一句'});await flush();d.setScene({active:true,film:true});release();h.resolveSlow();await voice;await flush();
 assert.equal(d.diagnostics().ambient,null);assert.equal(d.diagnostics().voice,null);assert.equal(d.diagnostics().ducking,false);
 await d.playLine({id:'two',text:'第二句'});assert.equal(d.diagnostics().voice,null);
});


test('returning home cancels late effects and scheduled engine sounds',async()=>{
 const h=harness({town:{effects:{engine:{url:'/media/engine.mp3'},door:{url:'/media/door.mp3'}}}}),d=h.director;await d.ready;d.configure({sound:true});await d.unlock();d.setScene({active:true});await flush();
 await d.effect('engine',{delay:.4});assert.equal(d.effects.size,1);assert.equal(d.diagnostics().playedEffects.at(-1).id,'engine');
 let release;const previous=d.clipBuffer.bind(d);d.clipBuffer=clip=>clip.url==='/media/door.mp3'?new Promise(resolve=>release=()=>resolve({duration:1})):previous(clip);
 const door=d.effect('door');await flush();d.setScene({active:false});release();assert.equal(await door,false);assert.equal(d.effects.size,0);
 assert.equal(d.diagnostics().playedEffects.some(effect=>effect.id==='door'),false);assert.ok(h.sources.every(s=>s.stopped));
});


test('a fresh prop-mode callback after returning home cannot restart door or engine Foley',async()=>{
 const h=harness({town:{effects:{engine:{url:'/media/engine.mp3'},'car-door-open':{url:'/media/door.mp3'}}}}),d=h.director;
 await d.ready;d.configure({sound:true});await d.unlock();d.setScene({active:true});await flush();d.setScene({active:false});
 assert.equal(await d.effect('car-door-open'),false);assert.equal(await d.effect('engine'),false);assert.equal(d.effects.size,0);assert.equal(d.effectRecords.size,0);
});

test('a collection sound preempts one paper/UI sound without exceeding the four-source budget',async()=>{
 const effects=Object.fromEntries(['page-a','page-b','page-c','ui','collect'].map(id=>[id,{url:`/media/${id}.mp3`,cooldown:10}]));
 const h=harness({town:{effects}}),d=h.director;await d.ready;d.configure({sound:true});await d.unlock();d.setScene({active:true});await flush();
 for(const id of ['page-a','page-b','page-c','ui'])assert.equal(await d.effect(id),true);
 assert.equal(d.effects.size,4);const old=[...d.effects];assert.equal(await d.effect('collect'),true);
 assert.equal(d.effects.size,4);assert.equal(d.effectRecords.size,4);assert.equal(d.diagnostics().playedEffects.at(-1).id,'collect');assert.equal(old.filter(source=>source.stopped).length,1);
 d.setVisible(false);assert.equal(d.effects.size,0);assert.equal(d.effectRecords.size,0);
});
