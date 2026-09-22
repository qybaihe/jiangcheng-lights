// A chapter film owns its clock. All stems, captions and transport follow it;
// neither scene completion nor story flags belong to this module.
const CHANNELS=['music','effects','voice'];
export const CINEMA_RATES=Object.freeze([1,1.1,1.15,1.2]);
export function cinemaRate(id,rate){return CINEMA_RATES.includes(rate)?rate:id==='prologue'?1.15:1;}
const localAsset=value=>typeof value==='string'&&value.startsWith('/media/')&&!value.includes('..')?value:null;
const level=value=>Number.isFinite(value)?Math.max(0,Math.min(1,value)):1;
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function cinemaAsset(value,avatarId='female') {return localAsset(typeof value==='string'?value:value?.[avatarId]??value?.default);}
export function cinemaCues(cues) {
 if(!Array.isArray(cues))return [];
 return cues.filter(c=>Number.isFinite(c.start)&&Number.isFinite(c.end)&&c.start>=0&&c.end>c.start&&typeof c.text==='string').map(c=>({...c})).sort((a,b)=>a.start-b.start);
}
export function captionAt(cues,time) {return cues.find(c=>time>=c.start&&time<c.end)??null;}
export function cinemaDuckingGain(cues,time) {
 let gain=1;
 for(const cue of cues){
  const attack=Math.max(0,Math.min(1,(time-cue.start+.16)/.16));
  const release=Math.max(0,Math.min(1,(cue.end+.24-time)/.24));
  gain=Math.min(gain,1-.62*Math.min(attack,release));
 }
 return gain;
}

export class CinemaTransport {
 constructor({video,tracks={},preferences={},voiceCues=[],duckMusic=false,onTick=()=>{},onError=()=>{},onEnded=()=>{}}) {
  this.video=video;this.tracks=tracks;this.onTick=onTick;this.onError=onError;this.onEnded=onEnded;this.listeners=[];this.disposed=false;this.buffering=false;this.pendingPlays=new Map();
  const on=(element,event,fn)=>{element.addEventListener(event,fn);this.listeners.push(()=>element.removeEventListener(event,fn));};
  on(video,'play',()=>this.sync(true));on(video,'playing',()=>{this.buffering=false;this.sync(true);});
  on(video,'pause',()=>{this.pauseStems();this.tick();});
  on(video,'waiting',()=>{this.buffering=true;this.pauseStems();});
  on(video,'seeking',()=>this.pauseStems());on(video,'seeked',()=>this.sync(true));
  on(video,'timeupdate',()=>this.sync());on(video,'ratechange',()=>this.sync(true));
  on(video,'ended',()=>{this.pauseStems();if(!this.disposed)this.onEnded();});
  on(video,'error',()=>this.fail('画面暂未载入，可以继续看旧照和对白。'));
  for(const [channel,audio]of Object.entries(tracks))on(audio,'error',()=>this.fail(`${({music:'配乐',effects:'环境声',voice:'对白'})[channel]}暂未载入，可以继续看旧照和对白。`));
  this.voiceCues=cinemaCues(voiceCues);this.duckMusic=duckMusic;
  for(const element of [video,...Object.values(tracks)]){element.preservesPitch=true;element.webkitPreservesPitch=true;}
  this.configure(preferences);
 }
 configure(preferences={}) {
  this.prefs={...preferences};const audible=preferences.sound!==false,hasStems=Object.keys(this.tracks).length>0;
  this.video.muted=hasStems||!audible;this.video.volume=level(preferences.voiceVolume);
  for(const [channel,audio]of Object.entries(this.tracks)){audio.muted=!audible;audio.volume=level(preferences[channel+'Volume']);}
  this.updateDucking();
 }
 updateDucking(){if(this.tracks.music&&this.duckMusic)this.tracks.music.volume=level(this.prefs.musicVolume)*cinemaDuckingGain(this.voiceCues,this.video.currentTime||0);}
 tick(){if(!this.disposed)this.onTick({time:this.video.currentTime||0,duration:this.video.duration,paused:this.video.paused,buffering:this.buffering});}
 pauseStems(){for(const audio of Object.values(this.tracks))audio.pause();}
 startStem(audio){
  if(this.pendingPlays.has(audio))return;
  const attempt={};this.pendingPlays.set(audio,attempt);
  const rejected=error=>{
   // Buffering, seeking and intentional pauses abort an in-flight play().
   // That is a transport transition, not evidence of a broken sound asset.
   if(this.disposed||this.video.paused||error?.name==='AbortError')return;
   this.fail('声音尚未开始，请点播放重试，或继续看旧照和对白。');
  };
  const finished=()=>{if(this.pendingPlays.get(audio)===attempt)this.pendingPlays.delete(audio);};
  try{Promise.resolve(audio.play()).catch(rejected).finally(finished);}catch(error){rejected(error);finished();}
 }
 sync(force=false) {
  if(this.disposed)return;
  this.updateDucking();
  const playing=!this.video.paused&&!this.video.ended&&!this.video.seeking&&!this.buffering;
  for(const audio of Object.values(this.tracks)){
   audio.playbackRate=this.video.playbackRate;
   const target=Math.max(0,Math.min(this.video.currentTime||0,Number.isFinite(audio.duration)?audio.duration:this.video.currentTime||0));
   if(force||Math.abs(audio.currentTime-target)>.16){try{audio.currentTime=target;}catch{}}
   if(playing&&audio.paused&&!audio.ended)this.startStem(audio);
   else if(!playing)audio.pause();
  }
  this.tick();
 }
 async play(){if(this.disposed)return;this.buffering=false;try{await this.video.play();this.sync(true);}catch(error){if(!this.disposed&&error?.name!=='AbortError')this.fail('点「播放并开启声音」，继续这一段故事。');this.tick();}}
 pause(){this.video.pause();this.pauseStems();this.tick();}
 seek(time){if(this.disposed)return;this.pauseStems();this.video.currentTime=Math.max(0,Math.min(time,Number.isFinite(this.video.duration)?this.video.duration:time));this.sync(true);}
 setVisible(visible){if(!visible)this.pause();}
 fail(message){if(this.disposed)return;this.pause();this.onError(message);}
 diagnostics(){return {time:this.video.currentTime,duration:this.video.duration,playbackRate:this.video.playbackRate,preservesPitch:this.video.preservesPitch,resolution:[this.video.videoWidth,this.video.videoHeight],paused:this.video.paused,muted:this.video.muted,stems:Object.fromEntries(Object.entries(this.tracks).map(([name,a])=>[name,{time:a.currentTime,paused:a.paused,muted:a.muted,volume:a.volume,playbackRate:a.playbackRate,preservesPitch:a.preservesPitch}]))};}
 dispose(){if(this.disposed)return;this.disposed=true;this.listeners.forEach(off=>off());this.pause();for(const element of [this.video,...Object.values(this.tracks)]){element.removeAttribute?.('src');element.load?.();}}
}

export function mountCinema(root,{id,avatarId='female',getPreferences=()=>({}),onPreferences=()=>{},onComplete=()=>{},onSkip=()=>{},onClose=()=>{},onFallback=()=>{},fetcher=globalThis.fetch.bind(globalThis),manifestUrl='/media/cinema-v3-manifest.json'}={}) {
 let disposed=false,transport=null,cues=[],raf,timeout,caption=null,failed=false;
 const abort=new AbortController();
 root.innerHTML=`<section class="chapter-film" role="dialog" aria-modal="true" aria-label="章节影像" data-cinema-id="${escape(id)}"><video id="cinematic" playsinline muted preload="auto"></video><div class="chapter-film__shade"></div><header><span><small>江城有灯 · 故事影像</small><h2 id="cinema-title">正在准备影像</h2></span><button id="film-close" type="button">暂时离开 ×</button></header><div class="chapter-film__subtitle" aria-live="off"><span id="cinema-speaker"></span><p id="cinema-caption"></p></div><div class="chapter-film__message" id="cinema-message" role="status"><p>正在载入这一段往事…</p><button id="cinema-resume" type="button" hidden>播放并开启声音</button><button id="cinema-fallback" type="button">改为旧照与对白</button></div><footer><div class="chapter-film__transport"><button id="cinema-play" type="button" aria-label="播放或暂停">播放</button><input id="cinema-seek" type="range" min="0" max="100" value="0" step="0.05" aria-label="影片进度"/><span id="cinema-time">0:00</span><label class="chapter-film__speed"><span>节奏</span><select id="cinema-speed" aria-label="影片播放速度">${CINEMA_RATES.map(rate=>`<option value="${rate}">${rate}×</option>`).join('')}</select></label><button id="film-sound" type="button">关闭声音</button><button id="cinema-skip" type="button">跳过影像，继续故事 →</button></div><details class="chapter-film__mix"><summary>影片音量</summary>${CHANNELS.map(c=>`<label>${({music:'配乐',effects:'环境声',voice:'对白'})[c]}<input type="range" data-cinema-volume="${c}" min="0" max="100" step="1" aria-label="影片${({music:'配乐',effects:'环境声',voice:'对白'})[c]}音量"/></label>`).join('')}</details></footer></section>`;
 const $=selector=>root.querySelector(selector),video=$('#cinematic'),message=$('#cinema-message');
 const durationText=seconds=>`${Math.floor((seconds||0)/60)}:${String(Math.floor((seconds||0)%60)).padStart(2,'0')}`;
 const error=text=>{if(disposed)return;failed=true;message.hidden=false;message.querySelector('p').textContent=text;$('#cinema-resume').hidden=!transport;};
 function configure(){const prefs=getPreferences();transport?.configure(prefs);$('#film-sound').textContent=prefs.sound?'关闭声音':'开启声音';root.querySelectorAll('[data-cinema-volume]').forEach(input=>input.value=Math.round(level(prefs[input.dataset.cinemaVolume+'Volume'])*100));}
 function update({time,duration,paused}){
  if(disposed)return;$('#cinema-play').textContent=paused?'播放':'暂停';$('#cinema-seek').max=Number.isFinite(duration)?duration:100;$('#cinema-seek').value=time;$('#cinema-time').textContent=`${durationText(time/(video.playbackRate||1))} / ${durationText(duration/(video.playbackRate||1))}`;
  const current=captionAt(cues,time);if(current!==caption){caption=current;$('#cinema-speaker').textContent=current?.who??'';$('#cinema-caption').textContent=current?.text??'';}
 }
 function destroy(){if(disposed)return;disposed=true;abort.abort();clearTimeout(timeout);cancelAnimationFrame(raf);document.removeEventListener('visibilitychange',visibility);transport?.dispose();}
 function leave(callback){destroy();callback();}
 function visibility(){transport?.setVisible(!document.hidden);}
 $('#film-close').onclick=()=>leave(onClose);$('#cinema-skip').onclick=()=>leave(onSkip);$('#cinema-fallback').onclick=()=>leave(onFallback);
 $('#cinema-play').onclick=()=>{if(!transport)return;if(video.paused){failed=false;message.hidden=true;transport.play();}else transport.pause();};
 $('#cinema-resume').onclick=()=>{if(!transport)return;onPreferences({sound:true});configure();failed=false;message.hidden=true;transport.play();};
 $('#cinema-speed').value=String(cinemaRate(id));
 $('#cinema-speed').onchange=e=>{video.defaultPlaybackRate=cinemaRate(id,Number(e.target.value));video.playbackRate=video.defaultPlaybackRate;transport?.sync(true);};
 $('#cinema-seek').oninput=e=>transport?.seek(Number(e.target.value));
 $('#film-sound').onclick=()=>{onPreferences({sound:!getPreferences().sound});configure();transport?.sync(true);};
 root.querySelectorAll('[data-cinema-volume]').forEach(input=>input.oninput=()=>{onPreferences({[input.dataset.cinemaVolume+'Volume']:Number(input.value)/100});configure();});
 document.addEventListener('visibilitychange',visibility);configure();$('#cinema-skip').focus({preventScroll:true});
 timeout=setTimeout(()=>error('载入时间较长。可以继续等待，或改为旧照与对白。'),12000);
 (async()=>{
  try{
   const response=await fetcher(manifestUrl,{signal:abort.signal});if(!response.ok)throw Error('manifest');
   const manifest=await response.json(),scene=manifest.scenes?.[id];if(!scene||!localAsset(scene.url))throw Error('scene');
   if(typeof scene.cues==='string'){const r=await fetcher(localAsset(scene.cues)||'',{signal:abort.signal});if(!r.ok)throw Error('captions');const value=await r.json();cues=cinemaCues(Array.isArray(value)?value:value.cues);}
   else cues=cinemaCues(scene.cues);
   if(disposed)return;$('#cinema-title').textContent=scene.title||'江城的一段往事';if(localAsset(scene.poster))video.poster=scene.poster;
   const tracks={};for(const channel of CHANNELS){const url=cinemaAsset(scene.stems?.[channel],avatarId);if(url){const audio=document.createElement('audio');audio.preload='auto';audio.src=url;audio.dataset.cinemaStem=channel;root.append(audio);tracks[channel]=audio;}}
   transport=new CinemaTransport({video,tracks,preferences:getPreferences(),voiceCues:cues,duckMusic:scene.voiceDucking===true,onTick:update,onError:error,onEnded:()=>leave(onComplete)});
   video.defaultPlaybackRate=cinemaRate(id,scene.defaultPlaybackRate);video.playbackRate=video.defaultPlaybackRate;$('#cinema-speed').value=String(video.playbackRate);
   video.addEventListener('loadeddata',()=>{clearTimeout(timeout);if(!failed)message.hidden=true;},{once:true});video.src=scene.url;
   function frame(){if(disposed)return;transport.sync();raf=requestAnimationFrame(frame);}frame();
   configure();if(document.hidden)transport.pause();else await transport.play();
  }catch{if(!disposed)error(id==='prologue'?'序章影像暂未载入。可以直接走到门前接电话。':'章节影像暂未载入。可以用旧照和新对白继续这段往事。');}
 })();
 return {dispose:destroy,configure,pause:()=>transport?.pause(),diagnostics:()=>({id,loaded:Boolean(transport),caption:caption?.text??null,...transport?.diagnostics()})};
}
