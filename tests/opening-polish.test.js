import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {freshState,loadState} from '../src/story.js';
import {soundPreferences,SOUND_DEFAULTS_VERSION} from '../src/audio-director.js';
import {cinemaRate,CINEMA_RATES,CinemaTransport} from '../src/cinema-player.js';
import {firstVehicleGuideCandidate} from '../src/vehicle-guide-progress.js';
import {PROP_IDS} from '../src/prop-progress.js';

test('new and legacy-default saves enable sound without losing existing story progress',()=>{
 assert.equal(freshState().settings.sound,true);
 const old={...freshState(),flags:['received'],settings:{sound:false,avatarId:'male',musicVolume:.27}};
 const state=loadState({getItem:()=>JSON.stringify(old)});
 assert.equal(state.settings.sound,true);assert.equal(state.settings.soundDefaultsVersion,SOUND_DEFAULTS_VERSION);
 assert.deepEqual(state.flags,['received']);assert.equal(state.settings.avatarId,'male');assert.equal(state.settings.musicVolume,.27);
});
test('a deliberate mute made after default-on migration survives reload and malformed data defaults on',()=>{
 const saved=freshState();saved.settings.sound=false;
 assert.equal(loadState({getItem:()=>JSON.stringify(saved)}).settings.sound,false);
 for(const input of [null,[],{sound:'false'},{soundDefaultsVersion:2,sound:1}])assert.equal(soundPreferences(input).sound,true);
});
test('the prologue defaults to 1.15x while later dialogue-heavy films keep their existing pace',()=>{
 assert.equal(cinemaRate('prologue'),1.15);assert.equal(cinemaRate('granny'),1);
 for(const rate of CINEMA_RATES)assert.equal(cinemaRate('prologue',rate),rate);
 for(const rate of [NaN,0,-1,2,'1.2'])assert.equal(cinemaRate('prologue',rate),1.15);
});
class Medium extends EventTarget{
 constructor(){super();this.currentTime=0;this.duration=29.25;this.paused=true;this.ended=false;this.seeking=false;this.playbackRate=1.15;this.volume=1;}
 async play(){this.paused=false;this.dispatchEvent(new Event('play'));}
 pause(){const was=this.paused;this.paused=true;if(!was)this.dispatchEvent(new Event('pause'));}
 removeAttribute(){}load(){}
}
test('narration music ducking follows source time through seek, mute and speed without changing the voice pitch',async()=>{
 const video=new Medium(),music=new Medium(),voice=new Medium();
 const t=new CinemaTransport({video,tracks:{music,voice},preferences:{sound:true,musicVolume:.5,voiceVolume:.9},voiceCues:[{start:1,end:4,text:'阿遥回来了。'}],duckMusic:true});
 assert.equal(music.volume,.5);await t.play();t.seek(2);assert.equal(music.volume,.19);
 assert.equal(voice.playbackRate,1.15);assert.equal(voice.preservesPitch,true);assert.equal(video.preservesPitch,true);
 video.playbackRate=1.2;t.sync(true);assert.equal(voice.playbackRate,1.2);assert.equal(voice.currentTime,2);
 t.configure({sound:false,musicVolume:.5});assert.equal(music.muted,true);assert.equal(voice.muted,true);
 t.seek(4.3);assert.equal(music.volume,.5);t.dispose();
});
test('blocked video autoplay exposes a retry instead of silently claiming playback',async()=>{
 const video=new Medium(),errors=[];video.play=async()=>{throw Object.assign(new Error('gesture'),{name:'NotAllowedError'});};
 const t=new CinemaTransport({video,onError:message=>errors.push(message)});await t.play();assert.equal(errors.length,1);assert.match(errors[0],/播放并开启声音/);assert.equal(video.paused,true);t.dispose();
});
test('all initial entry buttons unlock audio and held advance keys cannot rush past dialogue',()=>{
 const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 assert.match(source,/sound\(\);playFilm\('arrival'\)/);
 assert.match(source,/e\.repeat.*&&modal.*e\.preventDefault\(\)/);
 assert.match(source,/soundDefaultsVersion=SOUND_DEFAULTS_VERSION/);
});
test('manual F during arrival first takes over the camera, then teaches without borrowing the bicycle',()=>{
 const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 const start=source.indexOf('function useWorldProp('),end=source.indexOf('function ringBicycleBell(',start);
 const state=freshState(),calls=[],prop={id:PROP_IDS.bicycle,x:0,z:0,name:'巷口旧单车'};
 const world={active:true,arrival:true,player:{position:{x:0,z:0}},getPropState:()=>({mode:'walk'}),getNearbyProp:()=>prop,
  cancelArrivalView(){this.arrival=false;calls.push('camera');},startPropInteraction(){calls.push('board');return {ok:true};}};
 const scope={world,state,modal:null,PROP_IDS,firstVehicleGuideCandidate,syncArrivalView:()=>calls.push('caption'),
  vehicleGuideContext:nearby=>({state,nearby,active:true,arrival:world.arrival}),
  showFirstVehicleGuide:candidate=>{if(!candidate)return false;calls.push('guide');return true;}};
 runInNewContext(source.slice(start,end)+';this.use=useWorldProp;',scope);scope.use();
 assert.deepEqual(calls,['camera','caption','guide']);assert.equal(state.props.bicycleUnlocked,false);
 assert.deepEqual(state.vehicleGuides.seen,[]);assert.deepEqual(state.flags,[]);
});
