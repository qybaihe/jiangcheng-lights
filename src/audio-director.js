export const AUDIO_DEFAULTS=Object.freeze({musicVolume:.48,voiceVolume:.9,effectsVolume:.6,voiceAuto:true});
// v1 saved a default mute even when the player never chose silence. Migrate
// that default once; explicit choices made in this version survive reloads.
export const SOUND_DEFAULTS_VERSION=2;
export function soundPreferences(settings={}) {
 settings=settings&&typeof settings==='object'?settings:{};
 return {sound:settings.soundDefaultsVersion===SOUND_DEFAULTS_VERSION&&typeof settings.sound==='boolean'?settings.sound:true,soundDefaultsVersion:SOUND_DEFAULTS_VERSION};
}
export function audioPreferences(settings={}) {
 settings=settings&&typeof settings==='object'?settings:{};
 const result={...AUDIO_DEFAULTS};
 for(const key of ['musicVolume','voiceVolume','effectsVolume'])if(Number.isFinite(settings[key]))result[key]=Math.max(0,Math.min(1,settings[key]));
 if(typeof settings.voiceAuto==='boolean')result.voiceAuto=settings.voiceAuto;
 return result;
}
export function musicCueFor({active=false,film=false,ending=false,memory=false}={}) {
 return !active||film?null:ending?'ending':memory?'memory':'explore';
}
export function voiceClipFor(manifest,line,avatarId='female') {
 if(!line?.id||typeof line.text!=='string')return null;
 const entry=manifest?.lines?.[line.id];
 if(!entry||entry.text!==line.text)return null;
 const clip=entry.variants?.[avatarId]??entry.variants?.default;
 return clip?.url?.startsWith('/media/')?clip:null;
}

// Only static, locally shipped audio reaches this player. Provider credentials
// and synthesis requests stay in the offline asset tools.
export class AudioDirector {
 constructor({onVoiceState=()=>{},fetcher=globalThis.fetch.bind(globalThis),createContext=()=>new (window.AudioContext||window.webkitAudioContext)()}={}) {
  this.fetcher=fetcher;this.createContext=createContext;this.onVoiceState=onVoiceState;
  this.prefs=audioPreferences();this.enabled=false;this.visible=true;this.scene={};
  this.cache=new Map();this.music=null;this.rain=null;this.voice=null;this.effects=new Set();
  this.voiceGeneration=0;this.musicGeneration=0;this.rainGeneration=0;this.status='off';
  this.voiceManifest={};this.musicManifest={};this.townManifest={};this.effectTimes=new Map();this.playedEffects=[];this.effectRecords=new Map();this.ambient=null;this.ambientGeneration=0;this.ducking=false;this.externalVoice=false;
  this.ready=Promise.all([
   this.fetcher('/media/story-voice-manifest.json').then(r=>r.ok?r.json():{}).catch(()=>({})),
   this.fetcher('/media/story-music-manifest.json').then(r=>r.ok?r.json():{}).catch(()=>({})),
   this.fetcher('/media/town-audio-v1/manifest.json').then(r=>r.ok?r.json():{}).catch(()=>({})),
  ]).then(([voice,music,town])=>{this.voiceManifest={...voice,lines:{...town?.lines,...voice?.lines}};this.musicManifest=music;this.townManifest=town;this.refreshMusic();this.refreshRain();this.refreshAmbient();});
 }
 unlock() {
  if(!this.context){
   const c=this.context=this.createContext();
   this.master=c.createGain();this.master.gain.value=.82;
   const limiter=c.createDynamicsCompressor();limiter.threshold.value=-3;limiter.knee.value=8;limiter.ratio.value=12;limiter.attack.value=.003;limiter.release.value=.2;
   this.master.connect(limiter);limiter.connect(c.destination);
   this.musicBus=c.createGain();this.voiceBus=c.createGain();this.effectsBus=c.createGain();
   for(const bus of [this.musicBus,this.voiceBus,this.effectsBus])bus.connect(this.master);
   this.applyMix(true);
  }
  const resumed=this.context.resume();
  Promise.resolve(resumed).then(()=>{this.refreshMusic();this.refreshRain();this.refreshAmbient();}).catch(()=>{});
  return resumed;
 }
 configure(settings) {
  const was=this.enabled;this.enabled=Boolean(settings.sound);this.prefs=audioPreferences(settings);
  if(!this.enabled){this.stopVoice('off');this.stopEffects();}
  else if(!was&&this.currentLine)this.setStatus('ready');
  this.applyMix();this.refreshMusic();this.refreshRain();this.refreshAmbient();
 }
 setVisible(visible) {
  this.visible=Boolean(visible);
  if(!visible){this.stopVoice(this.enabled?'ready':'off');this.stopEffects();}
  this.applyMix();this.refreshMusic();this.refreshRain();this.refreshAmbient();
 }
 setScene(scene) {if((scene.film&&!this.scene.film)||(!scene.active&&this.scene.active)){this.stopEffects();this.clearLine();}this.scene={...scene};this.refreshMusic();this.refreshRain();this.refreshAmbient();}
 setExternalVoice(active) {this.externalVoice=Boolean(active);this.applyMix();}
 setStatus(status) {this.status=status;this.onVoiceState(status);}
 applyMix(immediate=false) {
  if(!this.context)return;
  const now=this.context.currentTime,fade=immediate?0:.14;
  const assign=(param,value)=>{param.cancelScheduledValues(now);param.setTargetAtTime(value,now,fade||.001);};
  assign(this.master.gain,this.enabled&&this.visible ? .82 : 0);
  assign(this.musicBus.gain,this.prefs.musicVolume*((this.ducking||this.externalVoice) ? .28 : 1));
  assign(this.voiceBus.gain,this.prefs.voiceVolume);
  assign(this.effectsBus.gain,this.prefs.effectsVolume*((this.ducking||this.externalVoice) ? .5 : 1));
 }
 async buffer(url) {
  if(!this.context)throw new Error('Audio has not been enabled');
  if(!url?.startsWith('/media/'))throw new Error('Audio must be a local game asset');
  if(this.cache.has(url))return this.cache.get(url);
  const promise=this.fetcher(url).then(r=>{if(!r.ok)throw new Error('Audio unavailable');return r.arrayBuffer();}).then(bytes=>this.context.decodeAudioData(bytes));
  this.cache.set(url,promise);
  while(this.cache.size>12)this.cache.delete(this.cache.keys().next().value);
  try{return await promise;}catch(error){this.cache.delete(url);throw error;}
 }
 async clipBuffer(clip) {
  try{return await this.buffer(clip.url);}catch(error){if(clip.fallbackUrl)return this.buffer(clip.fallbackUrl);throw error;}
 }
 fadeOut(track,seconds=1.3) {
  if(!track||!this.context)return;
  const now=this.context.currentTime;
  track.gain.gain.cancelScheduledValues(now);track.gain.gain.setValueAtTime(track.gain.gain.value,now);track.gain.gain.linearRampToValueAtTime(0,now+seconds);
  try{track.source.stop(now+seconds+.02);}catch{}
 }
 makeLoop(buffer,bus,volume=1) {
  const c=this.context,source=c.createBufferSource(),gain=c.createGain();
  source.buffer=buffer;source.loop=true;gain.gain.value=0;source.connect(gain);gain.connect(bus);
  gain.gain.linearRampToValueAtTime(volume,c.currentTime+1.4);source.start();
  source.onended=()=>{source.disconnect();gain.disconnect();};
  return {source,gain};
 }
 async refreshMusic() {
  const cue=this.enabled&&this.visible&&this.context?musicCueFor(this.scene):null;
  if(cue===this.requestedCue)return;
  this.requestedCue=cue;const token=++this.musicGeneration;
  if(!cue){this.fadeOut(this.music,this.scene.film?0:.25);this.music=null;return;}
  await this.ready;
  const track=this.musicManifest.tracks?.[cue];
  if(!track?.url)return;
  try{
   const buffer=await this.clipBuffer(track);
   if(token!==this.musicGeneration)return;
   this.fadeOut(this.music);this.music={...this.makeLoop(buffer,this.musicBus),cue};
  }catch{if(token===this.musicGeneration)this.requestedCue=null;}
 }
 async refreshRain() {
  const wanted=Boolean(this.enabled&&this.visible&&this.context&&this.scene.active&&!this.scene.film&&!this.scene.memory&&this.scene.rain);
  if(wanted===this.rainRequested)return;
  this.rainRequested=wanted;const token=++this.rainGeneration;
  if(!wanted){this.fadeOut(this.rain,this.scene.film?0:.5);this.rain=null;return;}
  await this.ready;
  const clip=this.musicManifest.sfx?.rain;
  if(!clip?.url)return;
  try{const buffer=await this.clipBuffer(clip);if(token!==this.rainGeneration)return;this.rain=this.makeLoop(buffer,this.effectsBus,.25);}catch{if(token===this.rainGeneration)this.rainRequested=false;}
 }
 stopVoice(status='ready') {
  this.voiceGeneration++;
  if(this.voice){try{this.voice.source.stop();}catch{}this.voice.source.disconnect();this.voice.gain.disconnect();this.voice=null;}
  this.ducking=false;this.applyMix();this.setStatus(status);
 }
 clearLine() {this.currentLine=null;this.stopVoice(this.enabled?'ready':'off');}
 async playLine(line,avatarId='female',{manual=false}={}) {
  this.currentLine={line,avatarId};this.stopVoice(this.enabled?'ready':'off');
  const token=this.voiceGeneration;
  if(!this.enabled||!this.visible||this.scene.film||line?.silent||line?.kind==='action')return;
  if(!manual&&!this.prefs.voiceAuto)return;
  this.setStatus('loading');
  try{
   await this.unlock();await this.ready;
   if(token!==this.voiceGeneration)return;
   const clip=voiceClipFor(this.voiceManifest,line,avatarId);
   if(!clip){this.setStatus('unavailable');return;}
   const buffer=await this.clipBuffer(clip);
   if(token!==this.voiceGeneration||!this.enabled||!this.visible||this.scene.film)return;
   const c=this.context,source=c.createBufferSource(),gain=c.createGain();
   source.buffer=buffer;source.connect(gain);gain.connect(this.voiceBus);
   gain.gain.setValueAtTime(0,c.currentTime);gain.gain.linearRampToValueAtTime(1,c.currentTime+.012);
   this.voice={source,gain,lineId:line.id,voiceId:clip.voiceId};this.ducking=true;this.applyMix();this.setStatus('playing');
   source.onended=()=>{source.disconnect();gain.disconnect();if(token===this.voiceGeneration){this.voice=null;this.ducking=false;this.applyMix();this.setStatus('ready');}};
   source.start();
  }catch{if(token===this.voiceGeneration){this.ducking=false;this.applyMix();this.setStatus('unavailable');}}
 }
 replay() {if(this.currentLine)return this.playLine(this.currentLine.line,this.currentLine.avatarId,{manual:true});}
 effectClip(id) {return this.townManifest.effects?.[id]??this.musicManifest.sfx?.[id];}
 hasEffect(id) {return Boolean(this.effectClip(id)?.url?.startsWith('/media/'));}
 stopEffect(source) {
  const record=this.effectRecords.get(source);
  try{source.stop();}catch{}source.disconnect();record?.gain.disconnect();
  this.effects.delete(source);this.effectRecords.delete(source);
 }
 effectSlot(priority,commit=false) {
  if(this.effects.size<4)return true;
  let victim=null,lowest=priority;
  for(const source of this.effects){const level=this.effectRecords.get(source)?.priority??1;if(level<lowest){victim=source;lowest=level;}}
  if(!victim)return false;if(commit)this.stopEffect(victim);return true;
 }
 async effect(id,{delay=0}={}) {
  if(!this.enabled||!this.visible||!this.context||!this.scene.active||this.scene.film)return false;
  const token=this.effectGeneration||0;await this.ready;
  const clip=this.effectClip(id);if(!clip?.url||clip.loop)return false;
  const now=this.context.currentTime,priority=id==='collect'?3:['engine','car-door-open','car-door-close','car-horn'].includes(id)?2:1;
  if(now-(this.effectTimes.get(id)??-Infinity)<Math.max(.08,(clip.cooldown??180)/1000)||!this.effectSlot(priority))return false;
  this.effectTimes.set(id,now);
  try{
   const buffer=await this.clipBuffer(clip);
   if(!this.enabled||!this.visible||!this.scene.active||this.scene.film||token!==(this.effectGeneration||0)||!this.effectSlot(priority,true))return false;
   const source=this.context.createBufferSource(),gain=this.context.createGain();
   source.buffer=buffer;gain.gain.value=Math.max(0,Math.min(1,clip.gain??.7));source.connect(gain);gain.connect(this.effectsBus);this.effects.add(source);this.effectRecords.set(source,{gain,priority,id});
   source.onended=()=>{source.disconnect();gain.disconnect();this.effects.delete(source);this.effectRecords.delete(source);};const startsAt=this.context.currentTime+Math.max(0,Math.min(1,delay));source.start(startsAt);this.playedEffects.push({id,startsAt});if(this.playedEffects.length>16)this.playedEffects.shift();return true;
  }catch{return false;}
 }
 async refreshAmbient() {
  const cue=this.enabled&&this.visible&&this.context&&this.scene.active&&!this.scene.film&&!this.scene.memory&&!this.scene.rain?this.scene.ambient??null:null;
  if(cue===this.requestedAmbient)return;
  this.requestedAmbient=cue;const token=++this.ambientGeneration;
  this.fadeOut(this.ambient,this.scene.film?0:.35);this.ambient=null;
  if(!cue)return;
  await this.ready;const clip=this.effectClip(cue);if(!clip?.url||!clip.loop)return;
  try {const buffer=await this.clipBuffer(clip);if(token!==this.ambientGeneration)return;this.ambient={...this.makeLoop(buffer,this.effectsBus,Math.max(0,Math.min(.5,clip.gain??.12))),cue};}
  catch {if(token===this.ambientGeneration)this.requestedAmbient=null;}
 }
 stopEffects() {this.effectGeneration=(this.effectGeneration||0)+1;for(const source of this.effects)this.stopEffect(source);this.effects.clear();this.effectRecords.clear();}
 diagnostics() {return {enabled:this.enabled,visible:this.visible,status:this.status,music:this.music?.cue??null,ducking:this.ducking||this.externalVoice,voice:this.voice?{lineId:this.voice.lineId,voiceId:this.voice.voiceId}:null,prefs:{...this.prefs},context:this.context?.state??'uninitialized',voiceCount:Object.keys(this.voiceManifest.lines||{}).length,supplementalVoiceCount:Object.keys(this.townManifest.lines||{}).length,effectCount:this.effects.size,ambient:this.ambient?.cue??null,effectCues:Object.keys(this.townManifest.effects||{}),lastEffects:[...this.effectTimes.keys()].slice(-5),playedEffects:this.playedEffects.map(effect=>({...effect}))};}
}
