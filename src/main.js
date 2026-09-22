import {createPlayfulLife} from './playful-life.js';
import {playfulObjective} from './playful-life-tasks.js';
import {PLAYFUL_LIFE_DIALOGUES,playfulLifeLine} from './playful-life-dialogues.js';
import {raceDirectoryMarkup} from './ui/neighborhood-races.js';
import {raceAvailability,RACE_COURSES} from './neighborhood-races.js';
import {createVehicleGuideGate,firstVehicleGuideCandidate,acknowledgeVehicleGuide} from './vehicle-guide-progress.js';
import {mountFirstVehicleGuide} from './ui/first-vehicle-guide.js';
import './ui/first-vehicle-guide.css';
import {deriveWuhanRoute,getWuhanRouteStop} from './wuhan-route.js';
import {wuhanRouteMarkup,bindWuhanRoute,mountWuhanRouteHUD} from './ui/wuhan-route.js';
import {createFullscreenController} from './ui/fullscreen.js';
import {mountHouseLoading} from './ui/house-loading.js';
import './ui/house-loading.css';
import {createWorldHudEffects} from './ui/world-hud-effects.js';
import {residentGreetingAudioLine,residentTopicAudioLine,districtAudioLine,adventureAudioLine,loreAudioLine} from './supplemental-audio-lines.js';
import './ui/resident-chat.css';
import './ui/resident-world.css';
import {RESIDENTS,getResident,normalizeResidentProgress,updateResidentProgress} from './resident-stories.js';
import {mountResidentChat} from './ui/resident-chat.js';
import {mountResidentHUD,residentDirectoryMarkup} from './ui/resident-world.js';
import {normalizeCarProgress} from './car-progress.js';
import './style.css';
import './ui/avatar-picker.css';
import './ui/story-art.css';
import './ui/audio-controls.css';
import './ui/cinema-player.css';
import './ui/prop-interactions.css';
import {normalizePropProgress,updatePropProgress,PROP_IDS,PROP_NOTES,ferryAvailability} from './prop-progress.js';
import {mountPropHUD,propGuideMarkup,mountNewspaper,ferryCardMarkup,updateFerryCard,propAction,escapeHTML} from './ui/prop-interactions.js';
import {mountCinema} from './cinema-player.js';
import {ENDING_DIALOGUES} from './ending-v3-data.js';
import {ENDINGS,resolveEnding,recordEnding,collectGallery,resumeEndingFork} from './endings.js';
import {mountGallery} from './gallery.js';
import {AudioDirector,SOUND_DEFAULTS_VERSION} from './audio-director.js';
import {audioControlsMarkup} from './ui/audio-controls.js';
import {STORY_CGS,getStoryCG,isCGUnlocked,personHeadshot,speakerPerson} from './story-art.js';
import {cgGalleryMarkup,peopleMarkup,cgViewerMarkup} from './ui/story-gallery.js';
import {avatarPickerMarkup,syncAvatarPickers} from './ui/avatar-picker.js';
import {getAvatarOption} from './avatar-catalog.js';
import {mountCircuitGame} from './ui/circuit-game.js';
import {mountMemoryGame} from './ui/memory-game.js';
import {mountPackGame} from './ui/pack-game.js';
import {mountChoiceGame} from './ui/choice-game.js';
import './ui/activity-shell.css';
import './ui/exploration-hud.css';
import {mountAdventureHUD} from './ui/adventure-hud.js';
import {ADVENTURE_STOPS,normalizeAdventureState,currentAdventureStop,discoverAdventure} from './adventure.js';
import {streetMapArtwork,mapPoint,pathMarkup,playerMarkup,MAP_BOUNDS} from './street-map.js';
import {WUHAN_DISTRICT_STOPS} from './wuhan-district-layout.js';
import {normalizeWuhanVisits,recordWuhanVisit} from './wuhan-visit-progress.js';
import {getWuhanMemory,isWuhanMemoryEarned} from './wuhan-memories.js';
import {memoryCardMarkup,mountMemoryInspection} from './ui/memory-art.js';
import './ui/memory-art.css';
import './ui/wuhan-exploration.css';
import './ui/world-hud-theme.css';
import {createNeighborhoodActivities} from './neighborhood-activities.js';
import './ui/welcome-guide.css';
import './ui/wuhan-route.css';
import './ui/wuhan-entry.css';
import {navigationCue} from './navigation.js';
import {World} from './world.js';
import {playMovementSound,playBicycleBell,playCarHorn} from './foley.js';
import {presentationFor,MEMORY_BOUNDARIES} from './dialogue-presentation.js';
import {SAVE_KEY,POIS,START,SUPPLIES,LORE,DIALOGUES,EXTRA_DIALOGUES,CHAPTERS,freshState,loadState,has,act,chapter,objective as storyObjective,isAvailable,availabilityHint} from './story.js';

const paths={fullscreen:'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5',window:'M3 3h18v18H3V3Zm0 5h18',lamp:'M8 7V5a4 4 0 0 1 8 0v2M6 8h12l2 13H4L6 8Zm5 5h2v5h-2',arrow:'M5 12h14m-6-6 6 6-6 6',map:'m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Zm6-2v16m6-14v16',book:'M3 4h6c2 0 3 1 3 3v14c0-2-1-3-3-3H3V4Zm18 0h-6c-2 0-3 1-3 3v14c0-2 1-3 3-3h6V4Z',sound:'m11 5-6 5H2v4h3l6 5V5Zm4 3a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14',mute:'m11 5-6 5H2v4h3l6 5V5Zm5 4 5 6m0-6-5 6',settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-6v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2',close:'m6 6 12 12M6 18 18 6',play:'m9 5 11 7-11 7V5Z',spark:'m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2Z',radio:'M3 7h18v13H3V7Zm2-3 12-3M6 11h7v5H6v-5Zm11 0h1m-1 5h1',bowl:'M3 10h18c0 6-4 9-9 9s-9-3-9-9Zm2 12h14M7 2v4m5-4v4m5-4v4',boat:'m3 12 9-4 9 4-3 7H6l-3-7Zm4-2V4h10v6M12 1v7M2 22l4-2 4 2 4-2 4 2 4-2',heart:'M12 21S2 15 2 8c0-6 8-7 10-2 2-5 10-4 10 2 0 7-10 13-10 13Z',box:'m3 7 9-5 9 5v12l-9 3-9-3V7Zm0 0 9 5 9-5M12 12v10',drop:'M12 2S5 10 5 15a7 7 0 0 0 14 0c0-5-7-13-7-13Z',bolt:'m13 2-9 12h7l-1 8 10-12h-7l1-8Z',alert:'m12 2 10 19H2L12 2Zm0 7v5m0 3v1',check:'m5 12 4 4L19 6',pin:'M12 22s8-9 8-14A8 8 0 0 0 4 8c0 5 8 14 8 14Zm0-17a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',sun:'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0-6v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2',rain:'M5 14a5 5 0 0 1 0-10 6 6 0 0 1 11 0 5 5 0 0 1 3 10M6 17l-1 4m7-4-1 4m7-4-1 4'};
export const icon=(id,size=20)=>`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[id]||paths.spark}"/></svg>`;
const app=document.querySelector('#app');
let state=loadState(localStorage),world,near=null,pendingInteraction=null,modal=null,dialogue=null,storyIndex=0,toastTimer,saveClock=0,frameTick=0,soundContext,ambience,playingAudio=null,media={},navigationTarget=null,navigationEnabled=true,navigationRoute=null,navigationClock=0,lastObjective=null,miniBuilt=false,lastFrameStamp=performance.now(),adventureHUD,advanceAdventureReading=null;
state.adventure=normalizeAdventureState(state.adventure);
let avatarPending=null,avatarChoiceError=false,cinemaPlayer=null,galleryView=null,memoryView=null,advanceDistrictReading=null;
state.wuhanVisits=normalizeWuhanVisits(state.wuhanVisits);
let residentHUD=null,residentView=null,pendingSceneInteraction=null,carHornCount=0;
let worldHudEffects=null,lastAudioPropMode='walk';
let wuhanRouteActive=false,wuhanRouteTarget=null,wuhanRouteHUD=null,wuhanRouteBindings=null,arrivalWasActive=false;
let vehicleGuideView=null,neighborhoodActivities=null,playfulLife=null;
const objective=s=>playfulObjective(s,storyObjective(s));
function getNavigation(id){return world.getNavigation(playfulLife?.point(id)??id);}
const vehicleGuideGate=createVehicleGuideGate(),heldGameplayKeys=new Set(),releaseBeforeGameplay=new Set();
const gameInputKeys=new Set(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','e','f','g','m','j','v',' ','enter','shift']);
window.addEventListener('keydown',event=>{const key=event.key.toLowerCase();if(!gameInputKeys.has(key))return;heldGameplayKeys.add(key);if(releaseBeforeGameplay.has(key)){event.preventDefault();event.stopImmediatePropagation();}},true);
window.addEventListener('keyup',event=>{const key=event.key.toLowerCase();heldGameplayKeys.delete(key);releaseBeforeGameplay.delete(key);},true);
window.addEventListener('blur',()=>{heldGameplayKeys.clear();releaseBeforeGameplay.clear();});
function releaseGuideInputs(){for(const key of heldGameplayKeys)releaseBeforeGameplay.add(key);if(world){world.keys={};if(world.playerMotion)world.playerMotion.bufferedTime=0;}}
let propHUD=null,propReaderView=null,lastFerryTrips=0,bicycleBellCount=0,bicycleBellTime=0;
collectGallery(state,localStorage);
state.storyChoices=state.storyChoices&&typeof state.storyChoices==='object'?state.storyChoices:{};
if(has(state,'ending')&&!state.storyChoices.stay)state.storyChoices.stay='breakfast';
// Existing saves retain the towel memory that used to be part of the main scene.
if(has(state,'prepared')&&!has(state,'storyV3')&&!has(state,'towel'))state.flags.push('towel');
if(!has(state,'storyV3'))state.flags.push('storyV3');
app.innerHTML=`<canvas id="world" tabindex="-1" aria-label="可探索的武汉晴川里三维街区"></canvas><div class="vignette"></div>
<div id="welcome" class="welcome"><div class="welcome-art"></div><div class="welcome-shade"></div><div class="welcome-grain"></div><section class="hero"><div class="eyebrow"><span></span> WUHAN · A STORY OF BELONGING</div><div class="title-lockup generated-title"><h1 class="visually-hidden">江城有灯</h1><img class="hero-game-logo" src="/media/game-logo-v1-dark.webp" alt="江城有灯" width="1522" height="443" fetchpriority="high"/><div class="game-logo-subtitle">LIGHTS OF JIANGCHENG <span>汉口 · 晴川里</span></div></div><p class="hero-tagline">灯火会记得每一个人。</p><p class="hero-desc">一条老巷，一场大雨，一群互相照应的人。<br>推开修理铺的门，走进一段属于武汉的温暖往事。</p><div class="hero-actions"><button class="primary" id="start" aria-describedby="welcome-fullscreen-hint">${icon('fullscreen')} ${state.started?'全屏继续故事':'全屏进入晴川里'} ${icon('arrow')}</button><button class="welcome-window-start" id="start-window">窗口游玩</button><button class="film-button" id="intro-film">${icon('play',16)} 观看序章</button></div><ol class="welcome-play-guide" aria-label="开始游玩指引"><li><span class="guide-step">1</span><strong>选好你的模样</strong><small>右侧可选男女主角</small></li><li><span class="guide-step">2</span><strong id="welcome-screen-step">点击，全屏入城</strong><small id="welcome-fullscreen-hint">Esc 可退出全屏</small></li><li><span class="guide-step">3</span><strong>沿着街巷慢慢走</strong><small>WASD 行走 · E 交谈</small></li></ol><p class="save-note">${state.started?'上次的脚步和记忆，已经为你留好。':'点击入城即开启音乐 · 建议戴上耳机 · 进度自动保存'}</p></section><aside class="welcome-avatar" id="welcome-avatar">${avatarPickerMarkup('welcome',state.settings.avatarId)}</aside><div class="welcome-bottom"><div><span class="small-label">一座城的记忆 · 一条巷的灯火</span><p>3D 街区探索 <b>·</b> 旧物解谜 <b>·</b> 温暖群像故事</p></div><div class="chapter-preview"><span>故事的起点</span><strong>01 <em>回来的人</em></strong></div></div></div>
<header id="header"><a href="#" id="brand" aria-label="返回主画面"><img class="brand-game-icon" src="/media/game-icon-v2-64.png" width="36" height="36" alt=""/><img class="brand-game-logo brand-on-paper" src="/media/game-logo-v1-transparent.webp" alt="江城有灯" width="1522" height="443"/><img class="brand-game-logo brand-on-scene" src="/media/game-logo-v1-dark.webp" alt="江城有灯" width="1522" height="443"/></a><div class="header-right"><span id="weather">${icon('sun',16)} 汉口 · 江风晴好</span><span class="nav-divider"></span><button class="icon-btn" id="sound" aria-label="开启声音" title="声音">${icon('mute')}</button><button class="icon-btn" id="map" aria-label="街区地图 M" title="街区地图 · M">${icon('map')}</button><button class="icon-btn" id="journal" aria-label="记忆手账 J" title="记忆手账 · J">${icon('book')}</button><button class="icon-btn" id="fullscreen" aria-label="全屏游玩" title="全屏游玩" aria-pressed="false">${icon('fullscreen')}</button><button class="icon-btn" id="settings" aria-label="设置" title="设置">${icon('settings')}</button></div></header>
<div id="hud" hidden><aside class="quest"><div class="quest-chapter" id="chapter"></div><div class="quest-line"><span class="quest-dot"></span><h2 id="quest-title"></h2></div><p id="quest-desc"></p><button id="quest-route">沿路引路 ${icon('arrow',15)}</button></aside><div id="route-guide" class="route-guide" hidden><span class="route-direction" aria-hidden="true">↑</span><div><strong id="route-instruction"></strong><small id="route-detail"></small></div><span id="route-distance"></span><button id="route-stop" aria-label="关闭引路">×</button></div><div id="labels"></div><div id="player-label" class="player-label">阿遥<span>▼</span></div><div class="location-note"><span id="location">晴川里 · 主巷</span><small id="memory-count">旧物有声，街坊有情</small></div><div class="camera-toolbar"><button id="view-mode" class="view-mode" title="V 切换视角">街巷视角 ▾</button><button id="first-person" aria-pressed="false">第一人称</button><button id="look-lock" hidden>鼠标观察</button></div><div id="first-person-reticle" aria-hidden="true" hidden>·</div><div class="controls-hint"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 行走</span><span><kbd>Shift</kbd> 跑步</span><span><kbd>空格</kbd> 跳跃</span><span><kbd>E</kbd> 交谈</span><span id="look-hint">拖动视角 · 滚轮缩放</span><button id="help-btn">?</button></div><div class="chapter-dots" id="chapter-dots"></div><button id="interact" class="interaction" hidden><kbd>E</kbd><span id="interact-label"></span>${icon('arrow',17)}</button><button id="minimap" aria-label="打开街区地图"><svg viewBox="0 0 ${MAP_BOUNDS.width} ${MAP_BOUNDS.height}" id="mini-svg"></svg><span>${icon('pin',12)} 晴川里 <kbd>M</kbd></span></button><div class="touch-pad"><button data-key="w" aria-label="向前">↑</button><div><button data-key="a" aria-label="向左">←</button><button data-key="s" aria-label="向后">↓</button><button data-key="d" aria-label="向右">→</button></div></div></div>
<section id="arrival-caption" class="arrival-caption" hidden aria-label="武汉入城视野"><small>武汉 · 汉口意象</small><h2>江上的桥，巷里的灯。</h2><p>从江汉关的钟声，走回一条熟悉的里分。</p><button id="arrival-skip" type="button">沿巷入城 <span>WASD 也可直接走</span> ↗</button></section>
<div id="toast" role="status" aria-live="polite"></div><div id="overlay" hidden></div><div id="boot">${icon('lamp',32)}<p>江风正在穿过巷口……</p></div>`;
const $=id=>document.getElementById(id);
const bootLoading=mountHouseLoading($('boot'),{reduced:state.settings.reduced});
bootLoading.update({completed:0,total:2});
const fullscreen=createFullscreenController({onChange:syncStartControls});
const audioDirector=new AudioDirector({onVoiceState:renderVoiceStatus});
function syncStartControls(screen){
 screen=screen??fullscreen.snapshot();
 const busy=Boolean(avatarPending||screen.pending),verb=state.started?'继续故事':'进入晴川里';
 $('start').disabled=busy;$('start-window').disabled=busy;$('intro-film').disabled=busy;
 $('start').innerHTML=icon(screen.active||!screen.supported?'lamp':'fullscreen')+' '+(screen.active||!screen.supported?'':'全屏')+verb+' '+icon('arrow');
 $('fullscreen').disabled=screen.pending||(!screen.supported&&!screen.active);
 $('fullscreen').setAttribute('aria-pressed',String(screen.active));
 $('fullscreen').setAttribute('aria-label',screen.active?'退出全屏':'全屏游玩');
 $('fullscreen').title=screen.active?'退出全屏 · Esc':screen.supported?'全屏游玩':'当前使用窗口模式';
 $('fullscreen').innerHTML=icon(screen.active?'window':'fullscreen');
 $('welcome-screen-step').textContent=screen.active?'已经全屏，随时入城':screen.supported?'点击，全屏入城':'点击，走进晴川里';
 $('welcome-fullscreen-hint').textContent=screen.active?'Esc 可回到窗口':screen.supported?'Esc 可退出全屏':'当前环境使用窗口模式';
}
function beginFromWelcome(windowed=false){
 if(!world||avatarPending||fullscreen.snapshot().pending||bootLoading.getSnapshot().state!=='complete')return;
 const request=windowed?fullscreen.leave():fullscreen.enter();
 start(); // Keep audio unlocking in this same user gesture as the native request.
 request.then(result=>{if(result.status==='blocked'||result.status==='unsupported')toast(result.active?'当前仍在全屏，按 Esc 可退出。':result.status==='unsupported'?'已使用窗口模式进入，游玩内容保持完整。':'已在窗口模式继续，可从右上角重试全屏。');});
}
function toggleFullscreen(){world?.releasePointerLock?.();fullscreen.toggle().then(result=>{if(result.status==='blocked')toast(fullscreen.snapshot().active?'按 Esc 可退出全屏。':'当前保持窗口模式，可稍后再试全屏。');});}
function refreshAudioScene(){
 const galleryCG=modal==='cg'?$('overlay').querySelector('.cg-viewer')?.dataset.cgId:null;
 const memory=Boolean(galleryCG||(dialogue&&presentationFor(dialogue.key,storyIndex).memory));
 const p=world?.player?.position,mode=world?.getPropState?.().mode;
 const ambient=mode==='car'?null:['ferry','boat'].includes(mode)||p?.z < -10?'water':p&&Math.hypot(p.x-10,p.z-12)<11?'breakfast':'breeze';
 audioDirector.setScene({active:Boolean(world?.active),film:modal==='film',memory,ambient,ending:dialogue?dialogue.key==='ending':galleryCG?galleryCG.startsWith('ending-'):has(state,'ending'),rain:Boolean(world?.rainy&&!world?.ended)});
}
function renderVoiceStatus(status){
 const labels={off:'开启声音可听对白',loading:'正在准备声音…',playing:'正在讲述',ready:'按你的节奏，慢慢听',unavailable:'这句暂以文字呈现'};
 for(const label of document.querySelectorAll('#voice-status,[data-town-voice-status]'))label.textContent=labels[status]||labels.ready;
 for(const button of document.querySelectorAll('#voice-replay,[data-town-voice-replay]')){button.disabled=!state.settings.sound;button.textContent=status==='playing'?'重新听这句':'听这句';button.classList.toggle('speaking',status==='playing');}
}
function townVoiceMarkup(){return '<div class="town-voice"><button type="button" data-town-voice-replay>听这句</button><span data-town-voice-status aria-live="polite"></span></div>';}
function playTownLine(line){if(line)audioDirector.playLine(line,state.settings.avatarId);else audioDirector.clearLine();}
const sound=()=>{audioDirector.configure(state.settings);if(!state.settings.sound)return;audioDirector.unlock().catch(()=>{});soundContext=audioDirector.context;refreshAudioScene();};
function chime(){world?.worldParticles?.pulse();if(!state.settings.sound)return;sound();if(audioDirector.hasEffect('collect')){audioDirector.effect('collect');return;}const now=soundContext.currentTime;[523.25,659.25,783.99].forEach((f,i)=>{const o=soundContext.createOscillator(),g=soundContext.createGain();o.type='sine';o.frequency.value=f;g.gain.setValueAtTime(0,now+i*.11);g.gain.linearRampToValueAtTime(.035,now+i*.11+.03);g.gain.exponentialRampToValueAtTime(.001,now+i*.11+1);o.connect(g);g.connect(audioDirector.effectsBus||soundContext.destination);o.start(now+i*.11);o.stop(now+i*.11+1.1);});}
function toast(text){$('toast').innerHTML=icon('spark',17)+`<span>${text}</span>`;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3600);}
function save(){if(world){state.position=world.getSafeSavePosition?.()||{x:world.player.position.x,z:world.player.position.z};if(!playfulLife?.photoActive)state.settings.cameraMode=world.cameraMode||'street';state.cars=normalizeCarProgress(world.getCarProgress?.()||state.cars);const parked=world.getPropState?.().bikePosition;if(parked)state.props=updatePropProgress(state.props,{type:'park',position:parked});}try{localStorage.setItem(SAVE_KEY,JSON.stringify(state));}catch{toast('浏览器暂时无法保存进度，请保持本页打开。');}}

function restoreProps(){state.residents=normalizeResidentProgress(state.residents);state.cars=normalizeCarProgress(state.cars);state.props=normalizePropProgress(state.props);world.restorePropProgress?.(state.props);world.restoreCarProgress?.(state.cars);lastFerryTrips=world.getPropState?.().completedFerryTrips||0;}
function leavePropForModal(type,cls=''){
 const mode=world?.getPropState?.().mode;
 if(!mode||mode==='walk'||(mode==='reading'&&type==='newspaper')||(mode==='ferry'&&type==='ferry')||(['bicycle','car','boat'].includes(mode)&&(cls.includes('map-panel')||cls.includes('neighborhood-race-panel'))))return true;
 const result=world.endPropInteraction?.({immediate:true});
 if(result?.ok===false){toast(result.reason||'先把车停到宽一点的地方。');return false;}
 save();return true;
}
function showPropsGuide(){
 const anchors=world.getPropAnchors?.()||[];
 panel('把日子，过进这条巷子','晴川里 · 可以摸得到的生活',(playfulLife?.directoryMarkup()||'')+propGuideMarkup(state,anchors)+raceDirectoryMarkup(state.races)+wuhanDirectoryMarkup()+residentDirectoryMarkup(state,world),'prop-guide-panel');
 playfulLife?.bindDirectory($('overlay'));bindRaceDirectory($('overlay'));bindResidentDirectory($('overlay'));$('wuhan-itinerary-open').onclick=()=>showMap(null,{tour:true});$('overlay').querySelectorAll('[data-wuhan-route]').forEach(button=>button.onclick=()=>showMap(button.dataset.wuhanRoute));$('overlay').querySelectorAll('[data-prop-route]').forEach(button=>button.onclick=()=>showMap(button.dataset.propRoute));
 $('overlay').querySelectorAll('[data-prop-note]').forEach(button=>button.onclick=()=>showMap(PROP_NOTES[button.dataset.propNote].target));
}
function wuhanDirectoryMarkup(){
 return `<section class="wuhan-district-directory" aria-label="江城漫游"><header><h3>沿着江风，把街区走大一点</h3><span>已到访 ${state.wuhanVisits.length} / ${WUHAN_DISTRICT_STOPS.length}</span></header><p class="small-print">燕归路与滨江路相连成环；借车走远一点，到了停好车，再读门牌、票窗和街坊留的话。漫游不替你完成主线委托。</p><button id="wuhan-itinerary-open" class="wuhan-itinerary-open" type="button">外公的顺路地图 <span>从一碗面，走到一班船 ↗</span></button><div class="wuhan-district-cards">${WUHAN_DISTRICT_STOPS.map((p,i)=>`<button data-wuhan-route="${p.id}"><small>江城漫游 · 0${i+1} ${state.wuhanVisits.includes(p.id)?'· 已到访':''}</small><strong>${escapeHTML(p.label)}</strong><p>${escapeHTML(p.hint)}</p><em>在地图上找这里 ↗</em></button>`).join('')}</div></section>`;
}
function completeVehicleGuidance(id){
 if(navigationTarget!==id)return;
 navigationTarget=null;navigationRoute=null;navigationEnabled=false;
 world.setGuidance?.(null);$('route-guide').hidden=true;updateMini();
}
function vehicleGuideContext(nearby=world?.getNearbyProp?.(),pending=Boolean(pendingSceneInteraction)){
 return {state,nearby,mode:world?.getPropState?.().mode,active:world?.active,blocked:world?.blocked,modal,arrival:world?.getArrivalView?.()?.active,grounded:world?.playerMotion?.grounded,pending,hidden:document.hidden};
}
function showFirstVehicleGuide(candidate){
 if(!candidate)return false;
 if(!openModal('vehicle-guide','<div id="first-vehicle-guide-root"></div>','first-vehicle-overlay'))return false;
 vehicleGuideGate.presented(candidate);releaseGuideInputs();
 vehicleGuideView=mountFirstVehicleGuide($('first-vehicle-guide-root'),{candidate,onAcknowledge:kind=>{
  state.vehicleGuides=acknowledgeVehicleGuide(state.vehicleGuides,kind);releaseGuideInputs();save();closeModal();
 }});
 return true;
}
function updateFirstVehicleGuide(){
 const candidate=vehicleGuideGate.consider(vehicleGuideContext());if(candidate)showFirstVehicleGuide(candidate);
}
function useWorldProp(selectedId){
 if(!world?.active||modal||state.runEnded)return;
 // A deliberate F/click takes over the arrival camera before checking the
 // tutorial. Automatic discovery still waits for the arrival view to finish.
 world.cancelArrivalView?.('prop-input');syncArrivalView();
 const runtime=world.getPropState?.()||{mode:'walk'};
 if(['bicycle','car','boat'].includes(runtime.mode)){
  neighborhoodActivities?.cancel();
  const result=world.endPropInteraction?.();if(result?.ok===false){toast(result.reason);return;}
  save();toast(runtime.mode==='boat'?'小船系回码头，脚下又是熟悉的岸。':'车停在这里了，回来还可以用。');return;
 }
 const prop=typeof selectedId==='string'?world.getPropAnchors().find(p=>p.id===selectedId):world.getNearbyProp?.();if(!prop)return;
 if(prop.id===PROP_IDS.ferry){showFerryBoarding();return;}
 if(prop.id==='prop-rowboat'){showRowboatBoarding();return;}
 if(prop.id==='race-car'){neighborhoodActivities?.invite('car');return;}
 if(Math.hypot(world.player.position.x-prop.x,world.player.position.z-prop.z)<=2.85&&showFirstVehicleGuide(firstVehicleGuideCandidate(vehicleGuideContext(prop,false))))return;
 const result=world.startPropInteraction?.(prop.id);if(!result?.ok){toast(result?.reason||'再靠近一点，站稳后试试。');return;}
 if(prop.id===PROP_IDS.bicycle){completeVehicleGuidance(prop.id);state.props=updatePropProgress(state.props,{type:'borrow'});save();toast('借到外公的自行车 · F 停车 · 空格按铃');}
 if(prop.propType==='car'){completeVehicleGuidance(prop.id);save();toast('坐进'+(prop.name||prop.label)+' · WASD 驾驶 · 空格鸣笛 · F 停车');}
 if(prop.id===PROP_IDS.newspaper){
  openModal('newspaper','<div id="newspaper-root"></div>','prop-world-overlay');world.readingClue=true;
  propReaderView=mountNewspaper($('newspaper-root'),{state,onClose:closeModal,onRead:edition=>{state.props=updatePropProgress(state.props,{type:'read',edition});save();},onNote:id=>{state.props=updatePropProgress(state.props,{type:'note',id});save();toast('小事记在「巷中生活」里了，主线仍按自己的节奏走。');}});
  $('newspaper-stand')?.focus();
 }
}
function ringBicycleBell(){
 if(performance.now()-bicycleBellTime<400)return;bicycleBellTime=performance.now();bicycleBellCount++;
 if(state.settings.sound){sound();if(audioDirector.hasEffect('bicycle-bell'))audioDirector.effect('bicycle-bell');else playBicycleBell(soundContext,audioDirector.effectsBus);}
 document.body.classList.add('rang-bell');setTimeout(()=>document.body.classList.remove('rang-bell'),500);
}
function showFerryBoarding(){
 const availability=ferryAvailability(state);
 panel(availability.title,'渡口当班告示 · 游戏内场景',`<p class="prop-boarding-copy">${escapeHTML(availability.detail)}</p><p class="prop-boarding-note">近岸一圈约 26 秒，随时可以提前回港。不会消耗物资，也不会替你完成街坊的委托。<br>报纸记录日常，是否开航以眼前这块当班告示为准。</p><div class="prop-boarding-actions">${availability.available?'<button class="primary" id="ferry-board">上船坐一会儿 ↗</button>':''}<button class="text-button" id="ferry-stay">先留在岸上</button></div>`,'prop-boarding-panel');
 $('ferry-stay').onclick=closeModal;
 if($('ferry-board'))$('ferry-board').onclick=()=>{
  if(!ferryAvailability(state).available){closeModal();toast('渡口暂时停航，先留在岸上。');return;}
  closeModal();const result=world.startPropInteraction?.(PROP_IDS.ferry);
  if(!result?.ok){toast(result?.reason||'到登船位置再试试。');return;}
  openModal('ferry',ferryCardMarkup(),'prop-world-overlay');world.readingClue=true;
  $('ferry-return').onclick=()=>{world.endPropInteraction?.();$('ferry-return').disabled=true;$('ferry-return').textContent='正在靠岸…';};save();
 };
}
function bindRaceDirectory(root){root.querySelectorAll('[data-race-route]').forEach(button=>button.onclick=()=>showMap(button.dataset.raceRoute==='boat'?'prop-rowboat':'race-car'));}
function showRowboatBoarding(){
 const availability=raceAvailability(state,'boat');
 if(!panel('借一程江风','周伯的小木船 · 晴川里近岸河湾',`<p class="prop-boarding-copy">「你小时候坐船，老问我江有多宽。」<br>周伯把桨递过来：「今天自己划一段。累了就回来，我在这儿。」</p><p class="prop-boarding-note">这是你可以亲手操控的小木船，不是自动游览。<br><b>W 向前划 · S 减速／倒划 · A / D 转向 · F 回到码头</b><br>近岸浮标围起一段练习水域。穿好救生衣，再从这里出发。</p><p class="small-print">${escapeHTML(availability.detail||'晴日开放。先自由划一会儿，也可以从起点参加桨影计时赛。')}</p><div class="prop-boarding-actions">${availability.available?'<button class="primary" id="rowboat-board">坐稳，划船去 ↗</button><button class="text-button" id="rowboat-race">看看桨影计时赛</button>':''}<button class="text-button" id="rowboat-stay">先留在岸上</button></div>`,'prop-boarding-panel'))return;
 $('rowboat-stay').onclick=closeModal;
 const board=(race=false)=>{if(!raceAvailability(state,'boat').available){closeModal();return;}closeModal();const result=world.startPropInteraction('prop-rowboat');if(!result?.ok){toast(result?.reason||'走到登船的位置，再试试。');return;}completeVehicleGuidance('prop-rowboat');releaseGuideInputs();save();syncCameraUI();if(race)neighborhoodActivities.invite('boat');else toast('W 划桨 · A / D 转向 · F 回岸 · 桨影计时赛随时可从起点参加');};
 $('rowboat-board')?.addEventListener('click',()=>board());$('rowboat-race')?.addEventListener('click',()=>board(true));
}
function updatePropInterface(){
 const runtime=world?.getPropState?.();if(!runtime)return;if(runtime.mode==='boat')$('location').textContent='晴川里 · 近岸河湾';
 if(runtime.mode!==lastAudioPropMode){
  if(runtime.mode==='car'){audioDirector.effect('car-door-close');audioDirector.effect('engine',{delay:.4});}
  else if(lastAudioPropMode==='car')audioDirector.effect('car-door-open');
  else if(runtime.mode==='bicycle')audioDirector.effect('bicycle-freewheel');
  else if(runtime.mode==='reading')audioDirector.effect('chair-sit');
  else if(['ferry','boat'].includes(runtime.mode))audioDirector.effect('ferry');
  lastAudioPropMode=runtime.mode;refreshAudioScene();
 }
 const trips=runtime.completedFerryTrips||0;
 if(trips>lastFerryTrips){for(let i=lastFerryTrips;i<trips;i++)state.props=updatePropProgress(state.props,{type:'ferry-complete'});lastFerryTrips=trips;save();if(modal==='ferry'){closeModal();toast('渡船回港了 · 这一程江风，记在巷中生活里。');}}
 if(trips<lastFerryTrips)lastFerryTrips=trips;
 if(modal==='ferry'&&runtime.mode==='walk'){closeModal();save();toast('回到原来的码头，巷子里的事还在等你。');}
 if(modal==='ferry'){if(!ferryAvailability(state).available){closeModal();toast('渡口收到预警，已回到岸上。');}else updateFerryCard($('overlay'),runtime.ferryProgress||0);}
 document.body.classList.toggle('using-prop',['reading','ferry'].includes(runtime.mode));document.body.classList.toggle('riding-bicycle',runtime.mode==='bicycle');
 document.body.classList.toggle('driving-car',runtime.mode==='car');document.body.classList.toggle('rowing-boat',runtime.mode==='boat');propHUD?.update();updateFirstVehicleGuide();
}
function cancelSceneApproach(){const hadPending=Boolean(pendingSceneInteraction);if(hadPending&&world)world.path=[];pendingSceneInteraction=null;if(world)world.greetingTarget=null;if(hadPending)updateMini();}
function scenePoint(selection){return selection.kind==='resident'?world.getResidentAnchors().find(n=>n.id===selection.id&&n.visible):world.getPropAnchors().find(p=>p.id===selection.id);}
function requestSceneInteraction(selection){
 if(!world?.active||modal||state.runEnded)return;
 if(world.getPropState().mode!=='walk'){toast('先把车停好，再用一用道具、和街坊聊聊。');return;}
 const point=scenePoint(selection);if(!point)return;
 cancelSceneApproach();
 const route=world.getNavigation(point);
 if(!route.reachable){toast('这边隔着院墙。沿公共通道走近一点，再打招呼。');return;}
 if(route.distance<.1&&world.playerMotion?.grounded!==false){if(selection.kind==='resident')openResidentChat(selection.id);else useWorldProp(selection.id);return;}
 if(!world.navigateRoute(route)){toast('眼前这段路有点挤，换个位置再试。');return;}
 pendingSceneInteraction={...selection,route,started:world.elapsed};
 if(selection.kind==='resident')world.greetingTarget=selection.id;
 toast(selection.kind==='resident'?'走过去，跟'+getResident(selection.id).name+'打个招呼。':'走近'+point.label+'。');updateSceneApproachGuidance();updateMini();
}
function updateSceneApproachGuidance(){
 if(!pendingSceneInteraction||modal)return;const selection=pendingSceneInteraction,point=scenePoint(selection);if(!point)return;
 const name=selection.kind==='resident'?getResident(selection.id)?.name:point.label;
 const distance=Math.hypot(world.player.position.x-point.x,world.player.position.z-point.z);
 $('route-guide').hidden=false;$('route-guide').classList.remove('arrived');$('route-instruction').textContent='走近'+name;
 $('route-detail').textContent=selection.kind==='resident'?'到身边后打招呼 · 按方向键可停下':'到达后使用 · 按方向键可停下';$('route-distance').textContent=Math.round(distance)+' m';
 const heading=Math.atan2(point.x-world.player.position.x,-(point.z-world.player.position.z));$('route-guide').querySelector('.route-direction').style.transform=`rotate(${heading-world.getHeading()}rad)`;
 world.setGuidance(selection.route);
}
function updateSceneApproach(){
 if(!pendingSceneInteraction||!world||modal)return;
 const selection=pendingSceneInteraction,point=scenePoint(selection);
 if(!point||world.elapsed-selection.started>70){cancelSceneApproach();toast('先把脚步停在这里，等会儿再去。');return;}
 if(world.path.length||world.playerMotion?.grounded===false)return;
 cancelSceneApproach();
 if(Math.hypot(world.player.position.x-point.x,world.player.position.z-point.z)>2.85){toast('再靠近一点，就能打招呼或使用道具。');return;}
 if(selection.kind==='resident')openResidentChat(selection.id);else useWorldProp(selection.id);
}
function openResidentChat(id){
 const person=getResident(id),anchor=world.getResidentAnchors().find(n=>n.id===id&&n.visible);if(!person||!anchor)return;
 if(Math.hypot(world.player.position.x-anchor.x,world.player.position.z-anchor.z)>3)return;
 if(!openModal('resident','<div id="resident-chat-root"></div>','resident-world-overlay'))return;
 world.beginConversation(id);world.readingClue=true;world.suspended=false;document.body.classList.add('in-conversation');
 residentView=mountResidentChat($('resident-chat-root'),{residentId:id,state,onClose:closeModal,onHeard:(residentId,topicId)=>{state.residents=updateResidentProgress(state.residents,{type:'topic-complete',residentId,topicId});save();collectGallery(state,localStorage);},onSpeak:(residentId,text,meta)=>{world.speakingId=residentId;playTownLine(!residentId?null:meta?.topicId?residentTopicAudioLine(residentId,meta.topicId,meta.index):residentGreetingAudioLine(residentId,meta?.phase));requestAnimationFrame(()=>world.fitConversationCamera());}});
 requestAnimationFrame(()=>world.fitConversationCamera());
}
function bindResidentDirectory(root){root.querySelectorAll('[data-resident-visit]').forEach(button=>button.onclick=()=>{const id=button.dataset.residentVisit;closeModal();requestSceneInteraction({kind:'resident',id});});}
function ringCarHorn(){
 if(performance.now()-bicycleBellTime<550)return;bicycleBellTime=performance.now();carHornCount++;
 if(state.settings.sound){sound();if(audioDirector.hasEffect('car-horn'))audioDirector.effect('car-horn');else playCarHorn(soundContext,audioDirector.effectsBus);}
 document.body.classList.add('vehicle-horn');setTimeout(()=>document.body.classList.remove('vehicle-horn'),450);
}
function dispatch(action){state=act(state,action);save();collectGallery(state,localStorage);renderHUD();}
function flag(id){dispatch({type:'flag',id});chime();}
function updateAvatarChoiceUI(){
 syncAvatarPickers({selected:state.settings.avatarId,pending:avatarPending,error:avatarChoiceError});
 syncStartControls();
}
async function chooseAvatar(id){
 if(!world||avatarPending)return;
 audioDirector.clearLine();
 const option=getAvatarOption(id);
 if(world.heroAvatar?.id===option.id&&world.avatarStatus?.state==='ready')return;
 avatarPending=option.id;avatarChoiceError=false;updateAvatarChoiceUI();
 try{
  const avatar=await world.setAvatar(option.id);
  if(avatar?.id===option.id&&world.avatarStatus?.state==='ready'){
   state.settings.avatarId=option.id;save();
   if(world.active)toast(`已换为${option.label}，故事继续。`);
  }else avatarChoiceError=true;
 }catch{avatarChoiceError=true;}
 finally{avatarPending=null;updateAvatarChoiceUI();}
}
document.addEventListener('click',event=>{
 const target=event.target.closest?.('button');
 if(target?.matches('[data-town-voice-replay]')){audioDirector.replay();return;}
 if(target&&!target.disabled){
  if(target.matches('#map,#minimap,#journal,[data-memory-open]'))audioDirector.effect('map-fold');
  else if(target.matches('#story-next,#story-prev,#adventure-next,#district-next,#newspaper-next,#newspaper-prev,[data-resident-action=advance],[data-resident-action=topic]'))audioDirector.effect('page');
  else if(target.matches('#quest-route,#settings,#first-person,#view-mode,[data-prop-route],[data-wuhan-route]'))audioDirector.effect('ui-confirm');
 }
 if(event.target.closest?.('[data-tile]'))audioDirector.effect('radio');
 const input=event.target.closest?.('[data-avatar-picker] input[type=radio]');
 if(input)chooseAvatar(input.value);
});
function syncSound(){cinemaPlayer?.configure();renderVoiceStatus(audioDirector.status);audioDirector.configure(state.settings);document.querySelectorAll('audio:not([data-cinema-stem])').forEach(a=>{a.muted=!state.settings.sound;a.volume=state.settings.voiceVolume;if(!state.settings.sound)a.pause();});if($('letter-sound'))$('letter-sound').hidden=state.settings.sound;const b=$('sound');b.innerHTML=icon(state.settings.sound?'sound':'mute');b.setAttribute('aria-label',state.settings.sound?'关闭声音':'开启声音');b.title=state.settings.sound?'关闭声音':'开启声音';if(!state.settings.sound){playingAudio?.pause();document.querySelectorAll('video').forEach(v=>v.muted=true);}}
function start(){if(!world||avatarPending)return;if(!has(state,'storyV3'))state.flags.push('storyV3');dispatch({type:'start'});$('welcome').hidden=true;$('hud').hidden=false;document.body.classList.add('playing');world.start();$('world').focus({preventScroll:true});syncCameraUI();renderHUD();sound();if(state.runEnded){showEnding();return;}if(!has(state,'received')&&!has(state,'prologueSeen'))playChapter('prologue',{onComplete:arriveAtShop,onSkip:arriveAtShop,onFallback:arriveAtShop});else toast('WASD 行走，靠近街坊后按 E。');}
function arriveAtShop(){
 closeModal();flag('prologueSeen');
 // The film hands control back to the actual street. No teleport, dialogue or
 // quest reward replaces the player's first walk to the repair shop.
 beginGuidance('shop');world.beginArrivalView?.();syncArrivalView();save();
 if(!world.getArrivalView?.().active)toast('修理铺就在巷里 · 沿光点走近，按 E 接外公的电话。');
}
function syncArrivalView(){
 const active=Boolean(world?.getArrivalView?.().active&&world.active&&!modal);
 if(active!==arrivalWasActive){
  arrivalWasActive=active;document.body.classList.toggle('in-arrival-view',active);$('arrival-caption').hidden=!active;
  if(!active&&world?.active&&!modal&&!has(state,'received'))toast('沿光点走近陆记修理铺，按 E 接电话 · M 可以认路。');
 }
}
function startWuhanRoute(id){
 const route=deriveWuhanRoute(state),stop=getWuhanRouteStop(id??route.nextId);
 if(route.paused){toast(route.pauseDetail);return;}
 if(!stop)return;
 if(modal)closeModal();
 if(!world.active){start();if(modal)return;}
 cancelSceneApproach();world.cancelArrivalView?.('wuhan-route');world.path=[];
 const revisit=route.stops.find(item=>item.id===stop.id)?.done;wuhanRouteActive=!revisit;wuhanRouteTarget=revisit?null:stop.id;beginGuidance(stop.targetId,{source:revisit?'manual':'wuhan'});wuhanRouteHUD?.update();
 toast(stop.place+' · '+stop.brief);
}
function stopWuhanRoute(returnToStory=false){
 cancelSceneApproach();
 wuhanRouteActive=false;wuhanRouteTarget=null;world.path=[];navigationTarget=null;navigationRoute=null;navigationEnabled=returnToStory;
 world.setGuidance?.(null);$('route-guide').hidden=true;updateMini();wuhanRouteHUD?.update();
 if(modal)closeModal();
 if(returnToStory){beginGuidance(objective(state).target);toast('先把手里的委托送到。顺路记下的故事都会保留。');}
}
function syncWuhanRoute(){
 if(!wuhanRouteActive||!world?.active||modal)return;
 const route=deriveWuhanRoute(state),selected=route.stops.find(stop=>stop.id===wuhanRouteTarget);
 if(route.paused&&wuhanRouteTarget){
  wuhanRouteTarget=null;navigationTarget=null;navigationRoute=null;navigationEnabled=true;world.path=[];navigationClock=1;
 }else if(selected?.done){
  // An earned stamp suggests the next stop; it never silently sets off again.
  wuhanRouteTarget=null;navigationTarget=null;navigationRoute=null;navigationEnabled=false;world.setGuidance?.(null);$('route-guide').hidden=true;updateMini();
 }
}

function playChapter(id,{onComplete=()=>{},onSkip=onComplete,onFallback=onComplete,onClose=()=>{closeModal();toast('这段往事还没有讲完，回来后可以继续。');}}={}){openModal('film','<div id="cinema-root"></div>','film-overlay');cinemaPlayer=mountCinema($('cinema-root'),{id,avatarId:state.settings.avatarId,getPreferences:()=>state.settings,onPreferences:patch=>{Object.assign(state.settings,patch);if('sound' in patch)state.settings.soundDefaultsVersion=SOUND_DEFAULTS_VERSION;syncSound();if(patch.sound)sound();save();},onComplete,onSkip,onClose,onFallback});}

function backHome(){neighborhoodActivities?.cancel();world.cancelArrivalView?.('home');if(wuhanRouteActive){cancelSceneApproach();world.path=[];navigationTarget=null;navigationRoute=null;navigationEnabled=true;world.setGuidance?.(null);updateMini();}wuhanRouteActive=false;wuhanRouteTarget=null;leavePropForModal('home');clearTimeout(toastTimer);$('toast').classList.remove('visible');closeModal();world.releasePointerLock?.();world.active=false;refreshAudioScene();$('welcome').hidden=false;$('hud').hidden=true;document.body.classList.remove('playing');syncArrivalView();syncStartControls();}
function renderHUD(){state.adventure=normalizeAdventureState(state.adventure);document.body.classList.toggle('reduce-motion',state.settings.reduced);const obj=objective(state);if(obj.target!==lastObjective){wuhanRouteActive=false;wuhanRouteTarget=null;navigationTarget=null;navigationEnabled=true;lastObjective=obj.target;navigationClock=1;}$('chapter').textContent=CHAPTERS[chapter(state)];$('quest-title').textContent=obj.title;$('quest-desc').textContent=obj.desc;$('chapter-dots').innerHTML=[0,1,2,3].map((n)=>`<span class="${chapter(state)>=n?'lit':''}"></span>`).join('')+'<small>一条巷子 · 四段故事</small>';$('memory-count').textContent=`江城拾光 ${state.lore.length}/6 · 街坊互助 ${['granny','chef','dock'].filter(f=>has(state,f)).length}/3`;$('weather').innerHTML=icon(has(state,'postlude')?'sun':has(state,'prepared')?'rain':'sun',16)+(state.mealMorning?'汉口 · 次晨过早':has(state,'postlude')?'汉口 · 雨后灯火':has(state,'checked')?'汉口 · 巷里听雨':has(state,'prepared')?'汉口 · 雨来以前':'汉口 · 江风晴好');if(world){world.rainy=has(state,'checked');world.ended=has(state,'ending')&&has(state,'postlude');world.collectedLore=new Set(state.lore);world.storyFlags=new Set(state.flags);world.collectedSupplies=new Set(state.supplies);world.adventureFound=new Set(state.adventure.found);}renderLabels();updateMini();refreshAudioScene();}
function renderLabels(){if(!world)return;const target=objective(state).target;$('labels').innerHTML=POIS.filter(p=>!(world.rainy&&!world.ended&&['granny','chef','dock'].includes(p.id))&&!p.lore&&(!p.supply&&!p.risk||target===p.id)).map(p=>`<div class="poi ${p.id===target?'target':''}" id="poi-${p.id}"><span>${icon(p.icon,13)} ${p.label}</span>${p.id===target?'<b>当前委托</b>':''}</div>`).join('');}
function updateLabels(){
 if($('departure-look'))$('departure-look').hidden=!world?.active||Boolean(modal)||Boolean(state.runEnded)||!has(state,'received')||has(state,'ending')||!['shop','dock'].includes(near?.id);
 if($('towel-look'))$('towel-look').hidden=!world?.active||Boolean(modal)||Boolean(state.runEnded)||!has(state,'radio')||Math.hypot(world.player.position.x-12,world.player.position.z+3)>3.3;
 if(!world||!world.active||modal)return;
 const player=world.player.position,overview=world.cameraMode==='overview',target=objective(state).target;
 const pp=world.project(player.x,player.z,player.y+2.5);
 $('player-label').style.transform=`translate(${pp.x}px,${pp.y}px) translate(-50%,-100%)`;$('player-label').hidden=!overview||!pp.visible;
 for(const p of POIS){const el=$('poi-'+p.id);if(!el)continue;
  const y=world.heightAt(p.x,p.z)+2.65,pt=world.project(p.x,p.z,y),distance=Math.hypot(p.x-player.x,p.z-player.z);
  el.style.transform=`translate(${pt.x}px,${pt.y}px) translate(-50%,-100%)`;
  el._labelSize??=[el.offsetWidth,el.offsetHeight];const [width,height]=el._labelSize;
  el.hidden=!pt.visible||pt.x<width/2+12||pt.x>innerWidth-width/2-12||pt.y<height+16||pt.y>innerHeight-16||(!overview&&(distance>(p.id===target?18:7)||!world.labelSightline(p.x,y,p.z)));
 }
}
function updateMini(){if(!world)return;if(world.getPropState().mode==='boat'){$('mini-svg').innerHTML=riverChartMarkup();$('mini-svg').setAttribute('viewBox','0 0 680 320');miniBuilt=false;return;}if(!miniBuilt){$('mini-svg').innerHTML=streetMapArtwork('mini',true)+'<g id="mini-route"></g><g id="mini-player"></g>';miniBuilt=true;}const shownRoute=pendingSceneInteraction?.route??navigationRoute;$('mini-route').innerHTML=shownRoute?.reachable?`<path d="${pathMarkup(shownRoute)}" fill="none" stroke="#fef9e9" stroke-width="14"/><path d="${pathMarkup(shownRoute)}" fill="none" stroke="#c98744" stroke-width="7"/>`:'';$('mini-player').innerHTML=playerMarkup(world.player.position,world.getHeading?.()||0);const p=mapPoint(world.player.position),driving=['car','bicycle'].includes(world.getPropState?.().mode),w=driving?760:480,h=w*.8,x=Math.max(0,Math.min(MAP_BOUNDS.width-w,p.x-w/2)),y=Math.max(0,Math.min(MAP_BOUNDS.height-h,p.y-h/2));$('mini-svg').setAttribute('viewBox',`${x} ${y} ${w} ${h}`);}
function syncCameraUI(){if(!world)return;const mode=world.cameraMode||'street';document.body.classList.toggle('first-person',mode==='first');document.body.dataset.camera=mode;$('view-mode').textContent=({first:'人眼视角',street:'跟随视角',overview:'全景俯瞰'})[mode]+' ▾';$('first-person').setAttribute('aria-pressed',mode==='first');$('look-lock').hidden=mode!=='first';$('first-person-reticle').hidden=mode!=='first';$('look-hint').textContent=mode==='first'?'拖动看四周 · V 换视角':'拖动视角 · 滚轮缩放';}
function destinationStatus(p){
 if(p?.playful)return {action:p.playful==='photo'?'拿出旧照，找一找角度':'把食盒交给'+p.receiver,detail:p.description||'停车下车，走近接应的人，按 E 逐份交接。'};
 if(p?.district)return {action:state.wuhanVisits.includes(p.id)?'再看看这里的江城日常':'读一段眼前的江城日常',detail:p.routeHint+' · '+p.hint};
 if(p?.kind==='prop')return {action:propAction(p,state).title,detail:propAction(p,state).detail};
 if(p?.adventure)return {action:state.adventure.found.includes(p.id)?'再读一遍这封江风来信':'看看燕子留下的线索',detail:p.routeHint??p.hint};
 if(!p)return {action:'查看眼前的地点',detail:'沿公共通道探索'};
 if(world?.rainy&&!world.ended&&['granny','chef','dock'].includes(p.id))return {action:'查看街坊去向',detail:'街坊已按安排到达室内，沿干燥主巷返家'};
 if(p.supply){const held=state.supplies.includes(p.id);return {action:held?'这份物资已收好':isAvailable(state,p)?'收好'+SUPPLIES[p.id]:'先了解物资委托',detail:held?(has(state,'chef')?'物资已交付；不用重复领取':'物资已收好，备齐后交给蔡姨'):isAvailable(state,p)?'蔡姨委托准备的雨前物资':availabilityHint(state,p)};}
 if(p.risk)return {action:has(state,p.id)?'风险已记录':isAvailable(state,p)?'在此安全观察':'先了解社区安排',detail:has(state,p.id)?'位置已发送，等待专业人员确认':isAvailable(state,p)?'这里是干燥观察位，请勿涉水或接触设备':availabilityHint(state,p)};
 if(p.lore)return {action:state.lore.includes(p.id)?'再读一段江城记忆':'拾起一段江城记忆',detail:state.lore.includes(p.id)?'这段城市记忆已收进手账':'停一停，看看武汉的日常'};
 return {action:p.id==='shop'?'查看外公的修理铺':'与'+({granny:'林婆婆',chef:'蔡姨',dock:'周伯',community:'小许'}[p.id]||'街坊')+'交谈',detail:has(state,'ending')?'雨过天晴，再来坐一会儿':'靠近后按 E，与这里的人和物相遇'};
}
function updateNavigation(force=false){if(!world||!world.active||modal)return;if(neighborhoodActivities?.active()||world.getPropState().mode==='boat'){$('route-guide').hidden=true;world.setGuidance?.(null);return;}if(pendingSceneInteraction){updateSceneApproachGuidance();return;}const id=navigationTarget||objective(state).target;if(!navigationEnabled||!id){$('route-guide').hidden=true;navigationRoute=null;world.setGuidance?.(null);return;}if(force||navigationClock>=.85||!navigationRoute){navigationClock=0;navigationRoute=getNavigation(id);world.setGuidance?.(navigationRoute?.reachable?navigationRoute:null);updateMini();}if(!navigationRoute)return;const p=[...POIS,...ADVENTURE_STOPS,...WUHAN_DISTRICT_STOPS,...(playfulLife?.points()||[]),...(world.getPropAnchors?.()||[])].find(p=>p.id===id),cue=navigationCue(navigationRoute,world.getHeading?.()||0);$('route-guide').hidden=false;const status=destinationStatus(p);$('route-instruction').textContent=cue.arrived?status.action+(p?.kind==='prop'?' · F':' · E'):cue.instruction;$('route-detail').textContent=cue.arrived?status.detail:(p?.label||'目的地')+' · '+cue.detail;$('route-distance').textContent=navigationRoute.reachable?`${Math.round(navigationRoute.distance)} m`:'—';$('route-guide').classList.toggle('arrived',cue.arrived);$('route-guide').querySelector('.route-direction').style.transform=`rotate(${cue.angle*180/Math.PI}deg)`;}
function beginGuidance(id,{source='manual'}={}){cancelSceneApproach();if(source!=='wuhan'){wuhanRouteActive=false;wuhanRouteTarget=null;}audioDirector.effect('ui-confirm');navigationTarget=id;navigationEnabled=true;navigationRoute=null;navigationClock=1;updateNavigation(true);}
function openModal(type,html,cls='',context=''){playfulLife?.beforeModal();neighborhoodActivities?.beforeModal(type,cls+' '+context);if(modal)releaseGuideInputs();vehicleGuideView?.dispose();vehicleGuideView=null;world.cancelArrivalView?.('modal');syncArrivalView();wuhanRouteBindings?.dispose();wuhanRouteBindings=null;memoryView?.dispose();memoryView=null;advanceDistrictReading=null;cancelSceneApproach();residentView?.dispose?.();residentView=null;if(!leavePropForModal(type,cls+' '+context))return false;propReaderView?.dispose?.();propReaderView=null;galleryView?.dispose?.();galleryView=null;cinemaPlayer?.dispose();cinemaPlayer=null;audioDirector.clearLine();dialogue=null;world.readingClue=false;clearTimeout(toastTimer);$('toast').classList.remove('visible');world.releasePointerLock?.();$('route-guide').hidden=true;if(type!=='story'){world.endConversation();document.body.classList.remove('in-conversation');}pendingInteraction=null;modal=type;world.blocked=true;world.suspended=type==='film'||type==='cg';world.keys={};world.path=[];$('overlay').hidden=false;$('overlay').className=cls;$('overlay').innerHTML=html;$('interact').hidden=true;const focus=$('overlay').querySelector('button');focus?.focus({preventScroll:true});refreshAudioScene();return true;}
function closeModal(){playfulLife?.beforeModal();if(modal)releaseGuideInputs();vehicleGuideView?.dispose();vehicleGuideView=null;wuhanRouteBindings?.dispose();wuhanRouteBindings=null;memoryView?.dispose();memoryView=null;advanceDistrictReading=null;cancelSceneApproach();residentView?.dispose?.();residentView=null;propReaderView?.dispose?.();propReaderView=null;if(['reading','ferry'].includes(world?.getPropState?.().mode))world.endPropInteraction?.({immediate:true});document.body.classList.remove('using-prop');galleryView?.dispose?.();galleryView=null;cinemaPlayer?.dispose();cinemaPlayer=null;audioDirector.clearLine();audioDirector.setExternalVoice(false);world.readingClue=false;advanceAdventureReading=null;world.endConversation();document.body.classList.remove('in-conversation');playingAudio?.pause();playingAudio=null;document.querySelectorAll('video,audio').forEach(v=>v.pause());modal=null;dialogue=null;world.blocked=false;navigationClock=1;syncCameraUI();world.suspended=false;$('overlay').hidden=true;$('overlay').innerHTML='';neighborhoodActivities?.afterModal();$('world').focus({preventScroll:true});refreshAudioScene();}
function panel(title,sub,content,cls=''){if(!openModal('panel',`<section class="paper-panel ${cls}" role="dialog" aria-modal="true" aria-label="${title}"><div class="panel-head"><div><span class="eyebrow">${sub}</span><h2>${title}</h2></div><button class="close icon-btn" aria-label="关闭">${icon('close')}</button></div>${content}</section>`,'scrim',cls))return false;$('overlay').querySelector('.close').onclick=closeModal;return true;}
function art(name){return `/media/${name}.webp`;}
const storyArt={intro:'arrival',granny:'granny',grannyMemory:'granny',chefIntro:'chef',chefMemory:'chef',dock:'dock',community:'arrival',prepared:'arrival',checked:'ending',ending:'ending'};
function playDialogue(key,onDone,{title,replay=false,startIndex=0,cinemaPlayed=false,afterMemory=null}={}){
 const sourceLines=DIALOGUES[key]??EXTRA_DIALOGUES[key]??ENDING_DIALOGUES[key]??PLAYFUL_LIFE_DIALOGUES[key];const lines=sourceLines?.map(line=>replay?line:playfulLifeLine(line,{foodMode:playfulLife?.foodMode()}));if(!lines?.length)return;storyIndex=startIndex;
 openModal('story',`<section class="story in-world" role="dialog" aria-modal="true" aria-label="${title||'街坊交谈'}"><div class="story-cg-backdrop" aria-hidden="true"></div><div class="story-art" style="background-image:url('${art(storyArt[key]||'arrival')}')"></div><div class="story-gradient"></div><button class="cg-inspect" id="cg-inspect" hidden>细看这张旧照</button><span class="story-cg-credit" id="story-cg-credit"></span><div id="memory-card-slot" class="story-memory-slot"></div><button id="memory-film" class="memory-film" hidden>▷ 看这段往事的旧影</button><div class="story-heading"><span></span><h2></h2><p></p></div><button id="story-leave" class="story-exit">暂时离开 ${icon('close',16)}</button><div class="dialogue-box"><div class="dialogue-top"><div class="dialogue-speaker"><img id="speaker-portrait" alt="" hidden/><div><small class="speaker-context" id="speaker-context" hidden></small><span id="speaker"></span></div></div><span id="story-progress"></span></div><p id="dialogue-text"></p><div class="dialogue-audio"><button id="voice-replay" type="button">听这句</button><span id="voice-status" role="status"></span></div><div class="dialogue-bottom"><span id="dialogue-hint"></span><div><button id="story-prev" aria-label="上一句">← 上一句</button><button id="story-next">下一句 ${icon('arrow',18)}</button></div></div></div></section>`,'story-overlay world-dialogue-overlay');
 dialogue={key,lines,onDone,title,replay,cinemaPlayed,afterMemory,inspecting:false};memoryView=mountMemoryInspection($('overlay'),{onInspect:value=>{if(dialogue)dialogue.inspecting=value;}});$('memory-film').onclick=playMemoryFilm;renderLine();if(!dialogue)return;$('cg-inspect').onclick=()=>setCGInspection(!dialogue.inspecting);$('voice-replay').onclick=()=>audioDirector.replay();$('story-next').focus({preventScroll:true});
 $('story-next').onclick=nextLine;$('story-prev').onclick=()=>{if(storyIndex>0){const range=MEMORY_BOUNDARIES[dialogue.key];storyIndex=dialogue.cinemaPlayed&&range&&storyIndex===range.endExclusive?Math.max(0,range.start-1):storyIndex-1;renderLine();}};
 $('story-leave').onclick=()=>{closeModal();toast('这段对话尚未完成，回来时可重新听。');};
}
function setCGInspection(inspecting){
 if(!dialogue)return;
 if(inspecting)$('memory-card-slot')?.querySelector('[data-memory-action="inspect"]')?.click();
 else memoryView?.close({focus:false});
 dialogue.inspecting=Boolean(memoryView?.isInspecting());
 $('cg-inspect').setAttribute('aria-pressed',String(dialogue.inspecting));
}
function playMemoryFilm(){
 if(!dialogue||dialogue.inspecting)return;
 const movieId=({grannyMemory:'granny',chefMemory:'chef',dock:'dock',ending:'ending'})[dialogue.key];
 if(!movieId||!presentationFor(dialogue.key,storyIndex).memory)return;
 const saved={...dialogue},index=storyIndex;
 const resume=()=>{closeModal();playDialogue(saved.key,saved.onDone,{title:saved.title,replay:saved.replay,startIndex:index,cinemaPlayed:saved.cinemaPlayed,afterMemory:saved.afterMemory});};
 playChapter(movieId,{onComplete:resume,onSkip:resume,onFallback:resume,onClose:resume});
}
function renderLine(){
 if(!dialogue)return;
 const movieId=({grannyMemory:'granny',chefMemory:'chef',dock:'dock',ending:'ending'})[dialogue.key],range=MEMORY_BOUNDARIES[dialogue.key];

 const line=dialogue.lines[storyIndex],presentation=presentationFor(dialogue.key,storyIndex,{replay:dialogue.replay});
 const story=$('overlay').querySelector('.story'),memory=presentation.memory;
 const cg=memory?getStoryCG(presentation.cgId):null,person=speakerPerson(line.who);
 setCGInspection(false);
 if(cg&&story.dataset.cg!==cg.id)audioDirector.effect('page');story.dataset.cg=cg?.id||'';
 story.classList.remove('has-cg');story.classList.toggle('is-memory',Boolean(cg));
 $('memory-card-slot').innerHTML=cg?memoryCardMarkup(cg.id,{collected:isWuhanMemoryEarned(state,cg.id)}):'';
 $('memory-film').hidden=!(memory&&movieId);story.dataset.memoryId=cg?.id||'';
 const sceneArt=story.querySelector('.story-art');
 sceneArt.style.backgroundImage=`url('${cg?.url||art(storyArt[dialogue.key]||'arrival')}')`;story.querySelector('.story-cg-backdrop').style.backgroundImage=cg?`url('${cg.url}')`:'none';
 sceneArt.setAttribute('role','img');sceneArt.setAttribute('aria-label',cg?`${cg.title}：${cg.caption}`:'旧物记忆');
 $('cg-inspect').hidden=!cg;$('story-cg-credit').textContent=cg?`${cg.chapter} · ${cg.title}`:'';
 const portrait=$('speaker-portrait');portrait.hidden=!person;
 if(!portrait.hidden){portrait.src=personHeadshot(person.id,state.settings.avatarId);portrait.alt=person.name;}
 else portrait.removeAttribute('src');
 $('speaker-context').hidden=!person;$('speaker-context').textContent=(person?.role||'')+(!memory&&(line.remote||line.who==='外公')?' · 电话那端':'');

 story.classList.add('in-world');$('overlay').classList.add('world-dialogue-overlay');document.body.classList.add('in-conversation');
 world.suspended=false;
 story.querySelector('.story-heading>span').textContent=memory?'旧物记忆 · MEMORIES OF JIANGCHENG':'此刻的晴川里 · WITH THE NEIGHBOURS';
 story.querySelector('.story-heading>h2').textContent=dialogue.title||presentation.title;
 story.querySelector('.story-heading>p').textContent=memory?'一段被旧物保存的往事':line.remote||line.who==='外公'?'电话那端，熟悉的声音':'江风、灯火，还有眼前的人';
 $('speaker').textContent=line.who;$('dialogue-text').textContent=line.text;
 $('story-progress').textContent=String(storyIndex+1).padStart(2,'0')+' / '+String(dialogue.lines.length).padStart(2,'0');$('story-prev').disabled=storyIndex===0||Boolean(dialogue.cinemaPlayed&&range?.start===0&&storyIndex===range.endExclusive);
 const hasNext=storyIndex<dialogue.lines.length-1,next=hasNext?presentationFor(dialogue.key,storyIndex+1,{replay:dialogue.replay}):null;
 $('story-next').innerHTML=(!hasNext?'继续故事':!memory&&next.memory?'走进这段回忆':memory&&!next.memory?'回到街坊身边':'下一句')+icon('arrow',18);
 if(line.silent||line.kind==='action'){audioDirector.clearLine();$('overlay').querySelector('.dialogue-audio').hidden=true;}else{$('overlay').querySelector('.dialogue-audio').hidden=false;audioDirector.playLine(line,state.settings.avatarId);}refreshAudioScene();
 $('dialogue-hint').textContent=memory?'轻触下一句，听完这段往事':'空格 / Enter 下一句 · 可拖动看看周围';
 world.beginConversation(presentation.placeId,{replay:dialogue.replay});world.setConversationSpeaker(line.who);world.fitConversationCamera();
 $('dialogue-text').classList.remove('line-enter');void $('dialogue-text').offsetWidth;$('dialogue-text').classList.add('line-enter');
}
function fitMemoryArtwork(){const story=$('overlay').querySelector('.story.has-cg');if(!story)return;const box=story.querySelector('.dialogue-box').getBoundingClientRect();story.style.setProperty('--cg-floor',`${Math.max(180,innerHeight-box.top+14)}px`);}
window.addEventListener('resize',fitMemoryArtwork);
function nextLine(){if(!dialogue)return;if(storyIndex<dialogue.lines.length-1){storyIndex++;if(dialogue.afterMemory&&storyIndex===MEMORY_BOUNDARIES[dialogue.key]?.endExclusive){const next=dialogue.afterMemory,done=dialogue.onDone,replay=dialogue.replay;playDialogue(next,done,{replay});return;}renderLine();}else{const done=dialogue.onDone;closeModal();done?.();}}
function simple(who,text,done){const key='ephemeral';DIALOGUES[key]=[{who,text}];playDialogue(key,done,{title:who});}
function showWeatherNotice(){panel('今晚，先把事情安排好','社区天气提醒','<p class="notice-copy">午后阵雨已经过去，今晚仍有较强降雨。低处住户按已通知的安排提前到社区小屋。林婆婆、蔡姨和周伯都在做准备。<br><br>只走干燥的公共主巷；低处入口和配电箱附近先不要靠近。</p><button class="primary" id="weather-continue">收好提醒，去送东西 →</button><aside class="wuhan-walk-invitation"><small>外公还留了一张顺路地图</small><p>先把旧物送到。得空时，拐进燕归里，再沿着江风回码头。</p><button id="weather-wuhan-route" type="button">看看这一路的武汉 ↗</button></aside>');$('weather-continue').onclick=closeModal;$('weather-wuhan-route').onclick=()=>showMap(null,{tour:true});}
function circuitPuzzle(){
 panel('让声音找到回家的路','旧物修复 01 · 陆记修理铺','<div id="activity-root"></div>','activity-panel circuit-panel');
 mountCircuitGame($('activity-root'),{onComplete:()=>{closeModal();flag('radio');toast('收音机修好了 · 获得给婆婆的声音');playDialogue('radioFixed',showWeatherNotice);}});
}
function orderPuzzle(){
 panel('你画的，还不认得？','童年的一张画 · 拼回四片纸' ,'<div id="activity-root"></div>','activity-panel memory-panel');
 mountMemoryGame($('activity-root'),{onComplete:()=>{closeModal();playDialogue('grannyMemory',()=>{flag('granny');toast('记忆已收进手账 · 林婆婆的关照名单');playfulLife?.invitePhoto();},{title:'一碗面的位置'});}});
}
function packPuzzle(){
 panel('雨来以前，带好这些','街坊互助 · 社区准备台','<div id="activity-root"></div>','activity-panel pack-panel');
 mountPackGame($('activity-root'),{onComplete:()=>{flag('prepared');closeModal();playDialogue('prepared');}});
}
function choose(title,text,options){
 panel(title,'现场观察 · 先看清，再行动','<div id="activity-root"></div>','activity-panel choice-panel');
 mountChoiceGame($('activity-root'),{title,text,options,onComplete:option=>{closeModal();option.done();}});
}
function interact(p=near){if(modal||!world.active)return;if(!state.runEnded&&playfulLife?.handover())return;if(!state.runEnded&&playfulLife?.intercept(p))return;if(!p)return;if(p.kind==='prop'){useWorldProp();return;}if(state.runEnded){showEnding();return;}
 if(world.playerMotion&&!world.playerMotion.grounded){pendingInteraction=p.id;return;}
 if(p.district){readWuhanDistrict(p);return;}
 if(p.adventure){readAdventure(p);return;}
 if(p.lore){dispatch({type:'lore',id:p.lore});showLore(p.lore);chime();return;}
 if(p.supply){if(!isAvailable(state,p)&&!state.supplies.includes(p.id)){simple('阿遥',availabilityHint(state,p));return;}if(state.supplies.includes(p.id)){toast('这份物资已经收好了。');return;}dispatch({type:'supply',id:p.id});toast('已收好 · '+SUPPLIES[p.id]);chime();return;}
 if(p.risk){if(!has(state,'prepared')){simple('阿遥','这里需要留心。我先去社区了解一下情况。');return;}if(has(state,p.id)){toast('风险已记录，保持安全距离，等待专业处理。');return;}const water=p.id==='riskWater';choose(water?'这条路，现在还能走吗？':'积水旁的配电箱',water?'江边低处的通道临近水面，天气已经变化。你从安全的主路上看见入口。':'你在干燥的公共通道上，注意到配电箱周围有积水。现在应该怎么做？',[
 {text:water?'保持距离，记录位置并报告社区，改走安全通道':'不涉水、不触碰设备，远离并向社区报告',correct:true,feedback:water?'先留在安全的主路，记下低处入口的位置，向社区报告。通道是否安全，应等待现场确认。':'保持干燥、安全的距离，不碰设备也不自行处理积水。记下位置并向社区报告，交由专业人员处理。',done:()=>playDialogue(water?'riskWaterReport':'riskCableReport',()=>{flag(p.id);toast('位置已发出 · 小许已收到');})},
 {text:water?'沿着水边走近一点，自己检查':'靠近积水，试着打开配电箱',feedback:water?'临水边缘与变化中的水情有风险。观察应在安全位置完成。':'积水与电气设备可能带来触电风险，不要靠近、涉水或操作。'},
 {text:water?'看别人经过，就跟着一起走':'把附近的东西都搬走再说',feedback:'不能用别人的行动替代现场安全判断。先避险，再向社区或相关专业人员报告。'},
 {text:'看不清，就先退回主巷并报告位置',correct:true,feedback:'如实说明看不清，不为看得更清楚而走近风险。位置交给社区，等待现场核查。',done:()=>playDialogue('riskUnclear',()=>{state.riskReports={...state.riskReports,[p.id]:'unclear'};flag(p.id);toast('社区已收到位置 · 具体情况待现场核查');})},]);return;}
 if(p.id==='shop'){
  if(!has(state,'received'))playDialogue('intro',()=>{flag('received');circuitPuzzle();});
  else if(!has(state,'radio'))circuitPuzzle();
  else if(has(state,'checked')&&!has(state,'ending'))chooseStay();
  else if(has(state,'ending'))showEnding();
  else toast('三件委托的去向记在手账里，去和街坊打个招呼。');return;
 }
 if(has(state,'checked')&&!has(state,'ending')&&['granny','chef','dock'].includes(p.id)){simple('阿遥','街坊们已经按社区安排进了安全的室内。这里暂时没有人，我也该沿干燥的主巷回修理铺了。');return;}
 if(has(state,'ending')&&['granny','chef','dock','community'].includes(p.id)){
  if(!has(state,'postlude')){showRainAfterword();return;}
  if(p.id==='chef'&&!has(state,'postludeSpoken'))playDialogue('postlude',()=>flag('postludeSpoken'));
  else if(p.id==='granny')playDialogue('revisitGranny');
  else if(p.id==='community')showCommunityNote();
  else toast(p.id==='chef'?'蔡姨正在收拾空食盒，明早还有热豆皮。':'周伯的折凳靠在雨棚里，旧照已经收进手账。');return;
 }
 if(!has(state,'radio')){simple(p.id==='granny'?'林婆婆':p.id==='chef'?'蔡姨':p.id==='dock'?'周伯':'小许','阿遥，回来啦。先去修理铺，给你外公回个电话吧。');return;}
 if(p.id==='granny'){if(!has(state,'granny'))playDialogue('granny',orderPuzzle);else playDialogue('revisitGranny');return;}
 if(p.id==='chef'){if(!has(state,'chefRequested'))playDialogue('chefIntro',()=>{flag('chefRequested');toast('领取地点已记入手账：保温箱、饮用水、备用电池');});else if(state.supplies.length<3)playDialogue('revisitChefMissing',()=>toast('还差：'+Object.keys(SUPPLIES).filter(k=>!state.supplies.includes(k)).map(k=>SUPPLIES[k]).join('、')));else if(!has(state,'chef')){state.mealNarrative=true;playDialogue('chefMemory',()=>playfulLife?.chefStoryReady(),{title:'红盖子的饭盒'});}else playDialogue('revisitChefPrepared');return;}
 if(p.id==='dock'){if(!has(state,'dock'))playDialogue('dock',()=>choose('天气变了，先看清楚','周伯指向江边低处的通道。面对变化中的天气，你会怎样安排回程？',[
 {text:'留在安全位置观察，联系社区确认通道情况',correct:true,feedback:'熟悉一条路，也要重新确认眼下的情况。先在安全位置联系社区，确认通道后，再陪周伯安排回程。',done:()=>{flag('dock');toast('获得周伯的旧信封 · 街坊互助 +1');}},
 {text:'凭过去的记忆，沿最近的临水小路回去',feedback:'老路也可能出现新风险。需要结合当前情况确认安全。'},
 {text:'先去水边看看能不能帮忙搬东西',feedback:'帮助别人也要先保证自身安全。远离临水风险，把情况交给专业人员。'},]));else playDialogue('revisitDock');return;}
 if(p.id==='community'){
  if(!['granny','chef','dock'].every(f=>has(state,f)))playDialogue('revisitCommunity',()=>toast('还缺：'+['granny','chef','dock'].filter(f=>!has(state,f)).map(f=>({granny:'林婆婆的安排',chef:'蔡姨的物资交付',dock:'周伯的联络安排'})[f]).join('、')));
  else if(!has(state,'prepared'))chooseCommitment(()=>playDialogue('community',packPuzzle));
  else if(!has(state,'riskWater')||!has(state,'riskCable'))simple('小许','还需要从安全距离看看江边低处入口和东巷配电箱附近。不要涉水，不要靠近临水边缘或触碰设备。记录情况就好。');
  else if(!has(state,'checked'))playDialogue('checked',()=>{flag('checked');toast('街坊都已报平安 · 沿干燥主巷回修理铺');});
  else showCommunityNote();
 }
}
function readAdventure(stop){
 if(world.rainy&&!world.ended){toast('先沿干燥主巷返家，雨过后再来听风。');return;}
 const already=state.adventure.found.includes(stop.id),next=currentAdventureStop(state.adventure);
 if(!already&&next?.id!==stop.id)return;
 let lineIndex=0;
 openModal('adventure',`<section class="adventure-note" role="dialog" aria-modal="true" aria-label="江风来信"><div class="adventure-note-header"><small>江风来信 · ${ADVENTURE_STOPS.findIndex(p=>p.id===stop.id)+1} / 3</small><button id="adventure-leave">先继续走 ×</button></div><h2></h2><span class="note-speaker"></span><p class="note-text"></p>${townVoiceMarkup()}<footer><small>拖动视角，看看眼前的线索<br><span id="adventure-page"></span></small><button id="adventure-next">继续读 →</button></footer></section>${memoryCardMarkup('adventure-'+stop.id,{collected:already})}`,'adventure-overlay');
 memoryView=mountMemoryInspection($('overlay'));
 world.readingClue=true;
 const note=$('overlay').querySelector('.adventure-note');note.querySelector('h2').textContent=stop.name;
 function render(){const line=stop.lines[lineIndex];playTownLine(adventureAudioLine(stop.id,lineIndex));note.querySelector('.note-speaker').textContent=line.who;note.querySelector('.note-text').textContent=line.text;$('adventure-page').textContent=`${lineIndex+1} / ${stop.lines.length} · 空格继续`;$('adventure-next').textContent=lineIndex===stop.lines.length-1?(already?'收好这段记忆':'记下这条线索'):'继续读 →';}
 advanceAdventureReading=()=>{
  if(lineIndex<stop.lines.length-1){lineIndex++;render();return;}
  const followingRoute=navigationTarget===stop.id;state.adventure=discoverAdventure(state.adventure,stop.id);save();collectGallery(state,localStorage);closeModal();renderHUD();
  const nextStop=currentAdventureStop(state.adventure);
  if(followingRoute){if(nextStop)beginGuidance(nextStop.id);else{navigationTarget=null;navigationRoute=null;navigationClock=1;updateNavigation(true);}}
  if(!already){chime();toast(nextStop?'新线索 · '+(nextStop.routeHint??nextStop.hint):'江风来信已收齐 · 桥影和街坊的话，都留进了手账');}
 };
 $('adventure-next').onclick=()=>advanceAdventureReading?.();$('adventure-leave').onclick=closeModal;render();$('adventure-next').focus({preventScroll:true});
}
function readWuhanDistrict(stop){
 if(!stop?.district)return;
 if(world.rainy&&!world.ended){toast('雨势还没歇，先沿干燥主巷照应街坊。');return;}
 let index=0;const visited=state.wuhanVisits.includes(stop.id),picture=getWuhanMemory(stop.memoryId),earned=isWuhanMemoryEarned(state,picture),clueId=picture?.loreId;
 const aside=earned?memoryCardMarkup(picture.id,{collected:true}):`<aside class="district-clue-card"><small>让眼前，连到来时的路</small><h3>${escapeHTML(picture?.title||'一件还没找到的旧物')}</h3><p>老巷里还留着与这里有关的记忆。把那件旧物找出来，再翻开它的画面。</p>${clueId?'<button id="district-clue">在地图上找这件旧物 ↗</button>':''}</aside>`;
 if(!openModal('district',`<section class="wuhan-district-note" role="dialog" aria-modal="true" aria-label="${escapeHTML(stop.name)}"><header><small>江城漫游 · ${WUHAN_DISTRICT_STOPS.findIndex(s=>s.id===stop.id)+1} / ${WUHAN_DISTRICT_STOPS.length}</small><button id="district-leave">先继续走 ×</button></header><h2>${escapeHTML(stop.name)}</h2><span class="district-speaker"></span><p class="district-text"></p>${townVoiceMarkup()}<footer><small id="district-page"></small><button id="district-next">继续读 →</button></footer></section>${aside}`,'wuhan-district-overlay'))return;
 world.readingClue=true;world.suspended=false;memoryView=mountMemoryInspection($('overlay'));
 const render=()=>{const line=stop.lines[index];playTownLine(districtAudioLine(stop.id,index));$('overlay').querySelector('.district-speaker').textContent=line.who;$('overlay').querySelector('.district-text').textContent=line.text;$('district-page').textContent=`${index+1} / ${stop.lines.length} · 停下来，看看眼前的武汉日常`;$('district-next').textContent=index===stop.lines.length-1?(visited?'收好，再走一程':'在漫游图上盖个章'):'继续读 →';};
 advanceDistrictReading=()=>{if(index<stop.lines.length-1){index++;render();return;}state.wuhanVisits=recordWuhanVisit(state.wuhanVisits,stop.id);save();closeModal();renderHUD();if(!visited){chime();toast(`${stop.label} · 江城漫游 ${state.wuhanVisits.length} / ${WUHAN_DISTRICT_STOPS.length}`);}};
 $('district-next').onclick=()=>advanceDistrictReading?.();$('district-leave').onclick=closeModal;if($('district-clue'))$('district-clue').onclick=()=>showMap(clueId);render();$('district-next').focus({preventScroll:true});
}
function showLore(id){const l=LORE[id];if(!l)return;panel(l.title,'JIANGCHENG FIELD NOTES · 江城拾光',`<article class="lore-article">${memoryCardMarkup('lore-'+id,{placement:'inline',collected:state.lore.includes(id)})}<h3>${l.subtitle}</h3>${l.text.split('\n').map(p=>`<p>${p}</p>`).join('')}${l.quote?`<blockquote>${l.quote}</blockquote>`:''}${townVoiceMarkup()}<div class="lore-foot">${icon('check',15)} 已收进记忆手账 · ${state.lore.length}/6</div></article>`);memoryView=mountMemoryInspection($('overlay'));playTownLine(loreAudioLine(id));}

function riverChartMarkup(){
 const c=RACE_COURSES.boat,r=world.getPropState(),p=r.boatPosition||world.player.position,s=neighborhoodActivities?.snapshot();
 const xy=point=>({x:30+(point.x-39)*10,y:38+(point.z+56)*10});
 const points=[c.start,...c.checkpoints],line=points.map(point=>{const q=xy(point);return `${q.x},${q.y}`;}).join(' '),q=xy(p);
 return `<rect width="680" height="320" rx="20" fill="#b9d6c1"/><path d="M0 265 Q170 243 350 265 T680 263 V320 H0Z" fill="#eee3c0"/><path d="M0 275 Q180 254 340 275 T680 272" fill="none" stroke="#a49c6d" stroke-width="4"/><text x="35" y="301" fill="#446553" font-size="18">晴川里码头 · 近岸练习河湾</text><text x="485" y="26" fill="#466e61" font-size="15">江风来处 ↑</text><polyline points="${line}" fill="none" stroke="#f9f2d6" stroke-width="4" stroke-dasharray="5 8"/>${c.checkpoints.map((point,i)=>{const a=xy(point);return `<circle cx="${a.x}" cy="${a.y}" r="12" fill="${i<(s?.checkpointsPassed||0)?'#638f79':'#bc9653'}" stroke="#fff9e7" stroke-width="3"/><text x="${a.x}" y="${a.y+4}" text-anchor="middle" fill="white" font-size="12">${i+1}</text>`;}).join('')}<g transform="translate(${q.x} ${q.y}) rotate(${-(r.boatYaw??world.player.rotation.y)*180/Math.PI})"><path d="M0 13 L-8 -9 L0 -5 L8 -9Z" fill="#325f53" stroke="#fff7dc" stroke-width="2"/></g>`;
}
function showRiverMap(){
 if(!panel('把江风，划成一圈','晴川里 · 近岸浮标图',`<svg class="river-chart" viewBox="0 0 680 320" role="img" aria-label="河湾浮标、划船路线和你的位置">${riverChartMarkup()}</svg><p class="prop-boarding-copy">白色虚线是桨影赛的路线；金色数字是依次经过的浮标。自由划船时不必赶路。</p><p class="small-print">游戏内练习河湾，非现实长江航行图。F 收桨回岸；计时赛打开地图会暂停，关图后点击继续。</p><button class="primary" id="river-chart-close">收好航图，继续划 ↗</button>`,'map-panel river-chart-panel'))return;
 $('river-chart-close').onclick=closeModal;
}
function showMap(target,{tour=false}={}){
 if(!world)return;if(world.getPropState().mode==='boat'){showRiverMap();return;}const mapPlaces=[...POIS,...ADVENTURE_STOPS.filter(p=>state.adventure.found.includes(p.id)||p.id===currentAdventureStop(state.adventure)?.id),...WUHAN_DISTRICT_STOPS,...(playfulLife?.points()||[]),...(world.getPropAnchors?.()||[])];let selected=mapPlaces.find(p=>p.id===target)||mapPlaces.find(p=>p.id===(navigationTarget||objective(state).target))||mapPlaces[0],route=null,zoom=1,cx=MAP_BOUNDS.width/2,cy=MAP_BOUNDS.height/2,drag=null,moved=false;
 const markers=mapPlaces.map((p,i)=>{const q=mapPoint(p);return `<g class="map-point" data-place="${p.id}" tabindex="0" role="button" aria-label="${p.name}" transform="translate(${q.x} ${q.y})"><circle class="map-hit" r="26" fill="transparent" pointer-events="all"/><circle class="map-dot" r="${p.lore?10:15}" fill="${p.kind==='prop'?'#a37849':p.adventure?'#b58045':p.lore?'#87a178':p.risk?'#bf8b58':'#4f8f83'}" stroke="#fff9e7" stroke-width="3"/><text class="map-number" text-anchor="middle" y="4" fill="#fffcef" font-size="12">${p.kind==='prop'?'⌂':p.adventure?'◇':p.lore?'✦':String(i+1).padStart(2,'0')}</text><text class="map-selected-name" y="-30" text-anchor="middle">${p.label}</text></g>`;}).join('');
 panel('晴川里 · 江城漫游图','WUHAN · 从里分巷口，走到轮渡江风',`<nav class="wuhan-map-tabs" aria-label="地图内容"><button id="map-tab-overview" type="button">街区地图</button><button id="map-tab-wuhan" type="button">外公的顺路地图 <small>${deriveWuhanRoute(state).progressLabel}</small></button></nav><div id="map-overview"><div class="wuhan-route-intro"><div><strong>老巷 → 燕归里 → 桥影下 → 江边市集</strong>宽路连成一圈；车停在路边，再下车读一段日常。</div><small>江城漫游 ${state.wuhanVisits.length} / ${WUHAN_DISTRICT_STOPS.length}</small></div><div class="map-layout"><div><div class="map-canvas"><svg viewBox="0 0 ${MAP_BOUNDS.width} ${MAP_BOUNDS.height}" id="map-svg" aria-label="晴川里地图，上方为江岸">${streetMapArtwork('large')}<g id="map-route"></g><g id="map-places">${markers}</g><g id="map-player">${playerMarkup(world.player.position,world.getHeading?.()||0)}</g></svg><div class="map-tools"><button id="map-minus" aria-label="缩小地图">−</button><button id="map-plus" aria-label="放大地图">＋</button><button id="map-reset">全图</button><button id="map-center">找到我</button></div></div><div class="map-key"><span><i class="key-you"></i>你与朝向</span><span><i class="key-route"></i>可走路线</span><span><i class="key-lore"></i>城市拾光</span></div><p class="map-disclaimer">晴川里为虚构街区；建筑与入口对应实景，远处武汉地标经过艺术压缩。</p></div><aside class="map-detail"><label class="map-select-label" for="map-destination">选择街坊或地点</label><select id="map-destination">${mapPlaces.map(p=>`<option value="${p.id}">${p.name}</option>`).join('')}</select><span class="small-label" id="map-status"></span><h3 id="map-name"></h3><p id="map-desc"></p><div class="map-distance" id="map-distance"></div><button class="primary" id="map-guide">开始引路 ${icon('pin',17)}</button><button class="map-auto" id="map-go">走到这里 ${icon('arrow',17)}</button><p class="small-print">引路保留手动探索。自动步行时，按方向键即可停下；路线沿公共通道绕行。</p><div class="map-current"><small>当前委托</small><strong>${objective(state).title}</strong></div></aside></div></div><div id="map-wuhan-itinerary" hidden></div>`,'map-panel wuhan-map-panel');
 const svg=$('map-svg');
 function itinerary(){
  $('map-wuhan-itinerary').innerHTML=wuhanRouteMarkup(state,{active:wuhanRouteActive,selectedId:getWuhanRouteStop(selected.id)?selected.id:deriveWuhanRoute(state).nextId});
 }
 function mapTab(itineraryVisible){
  $('map-overview').hidden=itineraryVisible;$('map-wuhan-itinerary').hidden=!itineraryVisible;
  for(const [id,current] of [['map-tab-overview',!itineraryVisible],['map-tab-wuhan',itineraryVisible]]){$(id).classList.toggle('active',current);$(id).setAttribute('aria-pressed',String(current));}
  if(itineraryVisible)itinerary();else requestAnimationFrame(viewport);
 }
 wuhanRouteBindings=bindWuhanRoute($('map-wuhan-itinerary'),{onRoute:startWuhanRoute,onStop:id=>{const point=mapPlaces.find(p=>p.id===id);if(point)select(point);itinerary();},onCollapse:()=>stopWuhanRoute(),onMain:()=>stopWuhanRoute(true)});
 $('map-tab-overview').onclick=()=>mapTab(false);$('map-tab-wuhan').onclick=()=>mapTab(true);
 function viewport(){if(!svg.isConnected||$('map-overview')?.hidden)return;const w=MAP_BOUNDS.width/zoom,h=MAP_BOUNDS.height/zoom;cx=Math.max(w/2,Math.min(MAP_BOUNDS.width-w/2,cx));cy=Math.max(h/2,Math.min(MAP_BOUNDS.height-h/2,cy));svg.setAttribute('viewBox',`${cx-w/2} ${cy-h/2} ${w} ${h}`);const scale=Math.min(svg.clientWidth/w,svg.clientHeight/h);svg.querySelectorAll('.map-hit').forEach(c=>c.setAttribute('r',Math.max(22,22/scale)));svg.querySelectorAll('.map-number').forEach(c=>c.setAttribute('font-size',Math.max(12,10/scale)));svg.querySelectorAll('.map-dot').forEach(c=>c.setAttribute('r',Math.max(c.closest('[data-place]').dataset.place.match(/clock|noodles|ferry|bridge|brick|photo/)?10:15,9/scale)));svg.querySelectorAll('.map-selected-name').forEach(c=>c.style.fontSize=Math.max(16,13/scale)+'px');}
 function select(p){selected=p;route=getNavigation(p.id);$('map-destination').value=p.id;$('map-name').textContent=p.name;const unavailable=!isAvailable(state,p);$('map-status').textContent=p.id===objective(state).target?'接下来，去这里':p.district?'江城漫游 · '+(state.wuhanVisits.includes(p.id)?'已到访':'等待你的脚步'):p.kind==='prop'?'巷中生活 · 可用的场景道具':p.adventure?'江风来信 · 可选探索':p.lore?'在武汉，拾起一段日常':'一条巷子里的照应';$('map-desc').textContent=destinationStatus(p).detail;$('map-distance').textContent=route?.reachable?(route.distance<1.5?'你已经在这里':`沿路约 ${Math.round(route.distance)} 米`):'路线暂时不可达';$('map-route').innerHTML=route?.reachable?`<path d="${pathMarkup(route)}" fill="none" stroke="#fffdf3" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/><path d="${pathMarkup(route)}" fill="none" stroke="#ca8b49" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="3 9"/>`:'';svg.querySelectorAll('[data-place]').forEach(el=>{el.classList.toggle('selected',el.dataset.place===p.id);el.setAttribute('aria-pressed',String(el.dataset.place===p.id));});$('map-go').disabled=!route?.reachable;$('map-go').textContent=['car','bicycle','boat'].includes(world.getPropState().mode)?'下车并步行过去':'走到这里';$('map-guide').disabled=!route?.reachable;}
 svg.querySelectorAll('[data-place]').forEach(el=>{el.onclick=()=>{if(!moved)select(mapPlaces.find(p=>p.id===el.dataset.place));};el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(mapPlaces.find(p=>p.id===el.dataset.place));}};});
 $('map-destination').onchange=e=>select(mapPlaces.find(p=>p.id===e.target.value));
 $('map-plus').onclick=()=>{zoom=Math.min(2.5,zoom+.35);viewport();};$('map-minus').onclick=()=>{zoom=Math.max(1,zoom-.35);viewport();};$('map-reset').onclick=()=>{zoom=1;cx=MAP_BOUNDS.width/2;cy=MAP_BOUNDS.height/2;viewport();};$('map-center').onclick=()=>{const p=mapPoint(world.player.position);zoom=1.8;cx=p.x;cy=p.y;viewport();};
 svg.onpointerdown=e=>{moved=false;drag={x:e.clientX,y:e.clientY,cx,cy};if(!e.target.closest('[data-place]'))svg.setPointerCapture(e.pointerId);};svg.onpointermove=e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.hypot(dx,dy)>5)moved=true;if(moved){const scale=Math.min(svg.clientWidth/(MAP_BOUNDS.width/zoom),svg.clientHeight/(MAP_BOUNDS.height/zoom));cx=drag.cx-dx/scale;cy=drag.cy-dy/scale;viewport();}};svg.onpointerup=svg.onpointercancel=()=>{drag=null;};
 function leaveMap(){if(!world.active){closeModal();start();}else closeModal();beginGuidance(selected.id);}
 $('map-guide').onclick=()=>{leaveMap();toast('已标出通往 '+selected.label+' 的路 · 跟着地面光点走');};$('map-go').onclick=()=>{const driving=['car','boat','bicycle'].includes(world.getPropState().mode);leaveMap();if(driving){const exit=world.endPropInteraction();if(exit?.ok===false){toast(exit.reason);return;}save();}if(world.approach(selected))toast('正走向 '+selected.label+' · 方向键可中断');else toast('这条路线暂时走不通，请回到公共通道。');};select(selected);mapTab(tour);viewport();
}
function showJournal(initialTab='memories'){const memories=[{key:'grannyMemory',flag:'granny',title:'一碗面的位置',art:'wuhan-memories-v1/granny-table',sub:'林婆婆 · 旧收音机'},{key:'chefMemory',flag:'chef',title:'留着一口热的',art:'wuhan-memories-v1/chef-lamp',sub:'蔡姨 · 一盏旧灯'},{key:'dock',flag:'dock',title:'箱子的另一边',art:'wuhan-memories-v1/dock-shared-box',sub:'周伯 · 手电与信封'},{key:'towel',flag:'towel',title:'第一次值夜班',art:'wuhan-memories-v1/xu-first-shift',sub:'小许 · 一条干毛巾'},{key:'ending',flag:'ending',title:'灯下那个孩子',art:'wuhan-memories-v1/ending-lamplit-child',sub:'外公 · 那张旧照片'}];panel('旧物有声，街坊有情','THE MEMORY JOURNAL · 记忆手账',`<div class="journal-tabs"><button class="active" data-tab="memories">旧物记忆</button><button data-tab="notes">江城拾光 <small>${state.lore.length}/6</small></button><button data-tab="tasks">此刻的委托</button><button data-tab="cg">江城旧照 <small>CG</small></button><button data-tab="people">街坊名录</button><button data-tab="props">巷中生活</button></div><div id="journal-content"></div>`,'journal-panel story-journal');function tab(name){$('overlay').querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));const body=$('journal-content');if(name==='props'){body.innerHTML=(playfulLife?.directoryMarkup()||'')+propGuideMarkup(state,world.getPropAnchors?.()||[])+raceDirectoryMarkup(state.races)+residentDirectoryMarkup(state,world);playfulLife?.bindDirectory(body);bindRaceDirectory(body);bindResidentDirectory(body);body.querySelectorAll('[data-prop-route]').forEach(b=>b.onclick=()=>showMap(b.dataset.propRoute));body.querySelectorAll('[data-prop-note]').forEach(b=>b.onclick=()=>showMap(PROP_NOTES[b.dataset.propNote].target));}else if(name==='cg'){body.innerHTML=cgGalleryMarkup(state);body.querySelectorAll('[data-cg]:not(:disabled)').forEach(button=>button.onclick=()=>showCG(button.dataset.cg));}else if(name==='people'){body.innerHTML=peopleMarkup(state.settings.avatarId);}else if(name==='memories'){body.innerHTML=`<div class="memory-grid">${memories.map((m,i)=>`<button class="memory-card ${has(state,m.flag)?'':'locked'}" data-memory="${m.key}" ${has(state,m.flag)?'':'disabled'}><div style="${has(state,m.flag)?`background-image:url('${art(m.art)}')`:'background:#d9dfc9'}"><span>0${i+1}</span>${icon(has(state,m.flag)?'play':'lamp',23)}</div><small>${m.sub}</small><h3>${m.title}</h3><p>${has(state,m.flag)?'打开记忆，再听一次':'走近这位街坊，故事便会开始'}</p></button>`).join('')}</div>`;body.querySelectorAll('[data-memory]').forEach(b=>b.onclick=()=>{const m=memories.find(m=>m.key===b.dataset.memory);playDialogue(m.key,showJournal,{replay:true,title:m.title,afterMemory:m.key==='ending'&&state.lastEnding==='good'?'endingGood':null});});}else if(name==='notes'){body.innerHTML=`<div class="notes-grid">${Object.entries(LORE).map(([id,l],i)=>`<button data-lore="${id}" ${state.lore.includes(id)?'':'disabled'}><span>0${i+1}</span><div><h3>${state.lore.includes(id)?l.title:'还未发现的江城一角'}</h3><p>${state.lore.includes(id)?l.subtitle:'去街区里的闪光地点看看。'}</p></div>${icon(state.lore.includes(id)?'arrow':'spark',18)}</button>`).join('')}</div>`;body.querySelectorAll('[data-lore]').forEach(b=>b.onclick=()=>showLore(b.dataset.lore));}else{const o=objective(state);body.innerHTML=`<div class="task-journal"><span class="small-label">${CHAPTERS[chapter(state)]}</span><h3>${o.title}</h3><p>${o.desc}</p><button class="primary" id="journal-map">看看地图 ${icon('map',17)}</button><div class="inventory"><h4>委托的去向</h4>${has(state,'received')?`<span>${icon('radio',17)} ${has(state,'granny')?'收音机 · 已交给婆婆':has(state,'radio')?'收音机 · 已修好':'收音机 · 待修好'}</span><span>${icon('lamp',17)} ${has(state,'chefRequested')?'旧灯 · 已交给蔡姨':'旧灯 · 带给蔡姨'}</span><span>${icon('bolt',17)} ${has(state,'dock')?'手电 · 已交给周伯':'手电 · 带给周伯'}</span>`:'<p>外公在修理铺留了些东西。</p>'}${state.supplies.map(k=>`<span>${icon('check',15)} ${SUPPLIES[k]}${has(state,'chef')?' · 已交付':''}</span>`).join('')}${has(state,'granny')?'<span>关照名单</span>':''}${has(state,'dock')?'<span>周伯的旧信封</span>':''}</div><section class="network-summary"><h4>一个人的帮忙，正在变成大家的准备</h4><div class="network-list">${[{id:'granny',name:'林婆婆',ready:'关照名单已收好，待交社区',pending:'送去收音机，听听她记得的人'},{id:'chef',name:'蔡姨',ready:playfulLife?.foodMode()==='delivered'?'热食已亲手交到陈姐与小许手里':'热食和物资已备齐，准备送达',pending:'找齐物资，一起备好热食'},{id:'dock',name:'周伯',ready:'已约好协助社区联络街坊',pending:'送还手电，听听箱子另一边的往事'}].map(n=>`<article class="${has(state,n.id)?'ready':''}"><strong>${has(state,n.id)?'✓ ':''}${n.name}</strong><p>${has(state,'checked')?'已向社区报平安':has(state,n.id)?n.ready:n.pending}</p></article>`).join('')}</div></section></div>`;$('journal-map').onclick=()=>showMap(o.target);}}tab(['memories','notes','tasks','cg','people','props'].includes(initialTab)?initialTab:'memories');$('overlay').querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>tab(b.dataset.tab));}
function showCG(id){
 const available=STORY_CGS.filter(cg=>isCGUnlocked(state,cg)),index=available.findIndex(cg=>cg.id===id);
 if(index<0)return;
 openModal('cg',cgViewerMarkup(available[index],index,available.length));
 $('cg-back').onclick=()=>showJournal('cg');
 $('cg-prev').onclick=()=>{if(index>0)showCG(available[index-1].id);};
 $('cg-next').onclick=()=>{if(index+1<available.length)showCG(available[index+1].id);};
}
function showSettings(){panel('让故事，按你的节奏','PREFERENCES · 设置',`${avatarPickerMarkup('settings',state.settings.avatarId)}<div class="settings-rows"><label><span><strong>声音</strong><small>音乐、角色对白与环境声</small></span><input id="set-sound" type="checkbox" ${state.settings.sound?'checked':''}/></label><label><span><strong>减少动态效果</strong><small>暂停渡船、雨滴与场景微动</small></span><input id="set-reduced" type="checkbox" ${state.settings.reduced?'checked':''}/></label><label><span><strong>画面质量</strong><small>流畅模式降低分辨率并关闭实时阴影</small></span><select id="set-quality"><option value="high" ${state.settings.quality==='high'?'selected':''}>精致</option><option value="low" ${state.settings.quality==='low'?'selected':''}>流畅</option></select></label></div>${audioControlsMarkup(state.settings)}<div class="settings-bottom"><p>故事自动保存于当前浏览器。<br>人物故事、晴川里和回忆事件为虚构。角色模型基于 VRoid 官方授权素材改编。<br><a href="/models/AVATAR-LICENSE.md" target="_blank" rel="noopener">角色素材与授权</a> · 应急情境以当地专业指导为准。</p><button class="text-button" id="restart">重新开始故事</button></div><div id="restart-confirm" hidden><p>这会重新开始本周目的任务与探索；已解锁的成就画廊会保留。</p><button id="restart-yes" class="primary">确定重新开始</button></div>`,'settings-panel');updateAvatarChoiceUI();$('set-sound').onchange=e=>{state.settings.sound=e.target.checked;state.settings.soundDefaultsVersion=SOUND_DEFAULTS_VERSION;syncSound();sound();$('voice-preview').disabled=!state.settings.sound;save();};$('voice-preview').onclick=()=>audioDirector.playLine(DIALOGUES.intro[1],state.settings.avatarId,{manual:true});$('set-voice-auto').onchange=e=>{state.settings.voiceAuto=e.target.checked;audioDirector.configure(state.settings);save();};$('overlay').querySelectorAll('[data-audio-channel]').forEach(input=>input.oninput=()=>{const key=input.dataset.audioChannel;state.settings[key]=Number(input.value)/100;input.parentElement.querySelector('output').textContent=input.value+'%';audioDirector.configure(state.settings);save();});$('set-reduced').onchange=e=>{state.settings.reduced=e.target.checked;world.reduced=e.target.checked;bootLoading.setReduced(e.target.checked);document.body.classList.toggle('reduce-motion',e.target.checked);save();};$('set-quality').onchange=e=>{state.settings.quality=e.target.value;world.setQuality(e.target.value==='low');save();};$('restart').onclick=()=>{$('restart-confirm').hidden=false;};$('restart-yes').onclick=()=>{const preferences={...state.settings};state=freshState();playfulLife?.resetTransient();vehicleGuideGate.reset();state.adventure=normalizeAdventureState();adventureHUD?.reset();state.settings=preferences;world.endPropInteraction?.({immediate:true});restoreProps();world.setPosition(START);save();closeModal();backHome();renderHUD();syncStartControls();toast('新的一天，正在晴川里等你。');};}
function showHelp(){panel('在巷子里，慢慢走','HOW TO PLAY · 操作指南',`<div class="help-grid"><div><kbd>W A S D</kbd><h3>行走与探索</h3><p>方向键也可以移动，Shift 跑步，空格跳跃。落地后即可交谈；双击可通行地面会自动寻找路线。</p></div><div><kbd>E</kbd><h3>走近，再打招呼</h3><p>主线委托用 E；点击场景里的街坊或靠近按 G，可以问好、选话题听武汉往事。</p></div><div><kbd>F</kbd><h3>用一用眼前的东西</h3><p>借骑自行车、驾驶停放车辆、坐椅读报、乘一班近岸渡船。F 使用或停车；空格按铃或鸣笛。地图和手账的「巷中生活」可以找到它们。</p></div><div>${icon('map',28)}<h3>看一看地图</h3><p>M 打开地图，选地点查看真实路线；“开始引路”手动走，“走到这里”自动走。J 回看线索与记忆。</p></div><div>${icon('sun',28)}<h3>换一个角度</h3><p>V 切换第一人称、街巷与全景。第一人称用鼠标拖动观察，或点“鼠标观察”；Esc 退出锁定。对话中用空格或 Enter 翻页。</p></div></div><p class="small-print">没有需要抢读的倒计时。故事和雨，都会等你准备好。</p>`);}
function playFilm(name,done){const id=name==='arrival'?'prologue':name;const leave=()=>{closeModal();done?.();};playChapter(id,{onComplete:leave,onSkip:leave,onFallback:leave,onClose:leave});}
function showCommunityNote(){panel('社区小屋','人在，事情也都记着',`<p class="notice-copy">${has(state,'checked')?'林婆婆和陈姐已到达，热食、饮用水和电池都已签收，周伯也报了平安。':'桌上还留着待核对的名单。'}<br>椅背上叠着一条蓝边毛巾。</p><button id="community-towel" class="primary">看看蓝边毛巾 →</button>`);$('community-towel').onclick=showTowel;}
function showTowel(){playDialogue('towel',()=>{flag('towel');toast('这条毛巾的往事，收进了手账。');},{title:'小许 · 蓝边毛巾'});}
function showRainAfterword(){panel('雨歇了一阵','社区消息 · 公共主巷已确认可通行','<p class="notice-copy">社区确认了公共主巷。林婆婆和陈姐已结伴回院，蔡姨在收空食盒，周伯回到码头内侧的雨棚。<br><br>江边低处与配电箱附近仍保持绕行。可以继续在主巷走走，也可以留在店里。</p><button id="after-rain" class="primary">收好消息，再走走 →</button>');$('after-rain').onclick=()=>{closeModal();state.runEnded=false;flag('postlude');};}
function chooseCommitment(done){if(state.storyChoices.commitment){done();return;}panel('你愿意一起把安排核好吗？','社区小屋 · 一个当下的决定','<p class="notice-copy">三位街坊的安排已经带来。小许还在核对物资和两处通道。</p><div class="ending-actions"><button class="primary" id="commit-help">答应：我留下来帮你核好</button><button class="text-button" id="commit-undecided">先看看能帮上什么</button></div>');const choose=value=>{state.storyChoices.commitment=value;save();closeModal();done();};$('commit-help').onclick=()=>choose('help');$('commit-undecided').onclick=()=>choose('undecided');}
function rememberEndingFork(){const fork=structuredClone(state);delete fork.endingFork;delete fork.lastEnding;delete fork.runEnded;state.endingFork=fork;}
function chooseStay(){rememberEndingFork();panel('明天，还走吗？','修理铺 · 街坊都已报平安','<p class="notice-copy">事情已经交接好了。回到修理铺，明天原本的安排还写在手账里。</p><div class="ending-actions"><button class="primary" id="stay-breakfast">多住两天，明早再去过早</button><button class="text-button" id="stay-leave">按原计划回去，向外公告别</button></div>');const choose=value=>{state.storyChoices.stay=value;save();closeModal();const result=resolveEnding(state);if(value==='leave')playDialogue(result.dialogueKey,()=>finishEnding(result));else playDialogue('ending',()=>finishEnding(result),{title:'那天你也在',afterMemory:result.id==='good'?'endingGood':null});};$('stay-breakfast').onclick=()=>choose('breakfast');$('stay-leave').onclick=()=>choose('leave');}
function confirmDeparture(){if(has(state,'ending')){showEnding();return;}panel('准备按原计划离开吗？','手账 · 临行前',`<p class="notice-copy">${has(state,'checked')?'街坊都已报平安。可以按原计划回去，也可以再留下住两天。':'有些事情还没有交接完成。可以继续留下，也可以把未完成的安排告知街坊后结束这一周目。'}</p><div class="ending-actions"><button class="primary" id="departure-cancel">${has(state,'checked')?'再在巷子里待一会儿':'先留下，把眼前的事做完'}</button><button class="text-button" id="departure-confirm">查看离开安排</button></div>`);$('departure-cancel').onclick=closeModal;$('departure-confirm').onclick=()=>{panel('这次就到这里？','再次确认 · 保留分岔点','<p class="notice-copy">离开会结束本周目，已收集的旧照与成就保留。之后可在成就画廊回到这个决定之前，继续当时的故事。</p><div class="ending-actions"><button class="primary" id="departure-return">回到巷子，继续</button><button class="text-button" id="departure-final">确认告别，结束这一周目</button></div>');$('departure-return').onclick=closeModal;$('departure-final').onclick=()=>{rememberEndingFork();state.storyChoices.stay='leave';save();const result=resolveEnding(state);closeModal();const route=getNavigation('shop');if(route?.reachable)world.setPosition(route.path.at(-1));playDialogue(result.dialogueKey,()=>finishEnding(result));};};}
function finishEnding(result=resolveEnding(state)){if(result.id==='true'||result.id==='good')flag('ending');state.lastEnding=result.id;state.runEnded=true;save();const record=recordEnding(result,state,localStorage);showEnding(result);if(!record.saved)toast('这次收藏暂未存储，请保持当前页面。');}
function showEnding(result=ENDINGS.find(e=>e.id===state.lastEnding)||(has(state,'ending')?ENDINGS.find(e=>e.id==='true'):resolveEnding(state))){panel(result.title,'江城有灯 · 这一回的故事',`<div class="ending-branch-art" style="background-image:url('${result.cg}')"></div><p class="notice-copy">${result.description}</p><div class="ending-actions"><button class="primary" id="ending-gallery">打开成就画廊</button><button class="text-button" id="ending-resume">回到这次的分岔点</button>${has(state,'ending')?'<button class="text-button" id="ending-walk">雨后，再在巷子里走走</button>':''}</div>`,'ending-panel');$('ending-gallery').onclick=showAchievementGallery;$('ending-resume').onclick=()=>{const fork=resumeEndingFork(localStorage,result.id);if(fork)restoreFork(fork);else{closeModal();toast('这段故事还可以继续，下一步已记在手账。');}};if($('ending-walk'))$('ending-walk').onclick=()=>has(state,'postlude')?closeModal():showRainAfterword();}
function restoreFork(fork){closeModal();state=loadState({getItem:()=>JSON.stringify(fork)});playfulLife?.resetTransient();state.storyChoices=state.storyChoices||{};state.runEnded=false;delete state.lastEnding;delete state.endingFork;world.endPropInteraction?.({immediate:true});restoreProps();world.setPosition(state.position);save();renderHUD();toast('回到当时的决定之前，已解锁的画廊仍然保留。');}
function showAchievementGallery(){collectGallery(state,localStorage);openModal('gallery','<div id="achievement-gallery-root"></div>','scrim');galleryView=mountGallery($('achievement-gallery-root'),{state,storage:localStorage,onClose:closeModal,onResumeFork:restoreFork,onReplay:(type,id)=>{if(type==='memory'){const movie=({grannyMemory:'granny',chefMemory:'chef',granny:'granny',chef:'chef',dock:'dock',ending:'ending'})[id];if(movie)playChapter(movie,{onComplete:showAchievementGallery,onSkip:showAchievementGallery,onClose:showAchievementGallery,onFallback:()=>playDialogue(({granny:'grannyMemory',chef:'chefMemory'})[movie]||movie,showAchievementGallery,{replay:true,cinemaPlayed:true})});else if(id==='towel')playDialogue('towel',showAchievementGallery,{replay:true});}else if(type==='ending'){const key=({true:'ending',good:'endingGood',neutral:'endingNeutral',regret:'endingRegret'})[id];if(key)playDialogue(id==='good'?'ending':key,showAchievementGallery,{replay:true,afterMemory:id==='good'?'endingGood':null});}}});}
app.insertAdjacentHTML('beforeend','<button id="towel-look" class="towel-look" hidden>看看椅背的蓝边毛巾</button>');$('towel-look').onclick=showTowel;app.insertAdjacentHTML('beforeend','<button id="departure-look" class="departure-look" hidden>看看离开的安排</button>');$('departure-look').onclick=confirmDeparture;$('header').querySelector('.header-right').insertAdjacentHTML('beforeend','<button class="icon-btn" id="achievement-gallery" aria-label="成就画廊" title="成就画廊">◇</button>');$('achievement-gallery').onclick=showAchievementGallery;$('header').querySelector('.header-right').insertAdjacentHTML('beforeend','<button class="icon-btn" id="prop-guide" aria-label="巷中生活：旧照对景、热食接力与场景道具" title="巷中生活 · 场景道具">⌂ <small>巷中生活</small></button>');$('prop-guide').onclick=showPropsGuide;
$('arrival-skip').onclick=()=>{world.cancelArrivalView?.('skip-button');syncArrivalView();$('world').focus({preventScroll:true});};
$('view-mode').onclick=()=>{playfulLife?.beforeModal();world.cycleView?.();syncCameraUI();save();};$('start').onclick=()=>beginFromWelcome();$('start-window').onclick=()=>beginFromWelcome(true);$('fullscreen').onclick=toggleFullscreen;$('intro-film').onclick=()=>{if(!avatarPending&&bootLoading.getSnapshot().state==='complete'){sound();playFilm('arrival');}};$('brand').onclick=e=>{e.preventDefault();backHome();};$('map').onclick=()=>showMap();$('minimap').onclick=()=>showMap();$('journal').onclick=showJournal;$('settings').onclick=showSettings;$('quest-route').onclick=()=>{beginGuidance(objective(state).target);toast('跟着光点走，抬头看清眼前的人与路。');};$('route-stop').onclick=()=>{wuhanRouteActive=false;wuhanRouteTarget=null;cancelSceneApproach();navigationEnabled=false;navigationRoute=null;world.setGuidance?.(null);$('route-guide').hidden=true;updateMini();};$('first-person').onclick=()=>{playfulLife?.beforeModal();world.setCameraMode?.(world.cameraMode==='first'?'street':'first');syncCameraUI();save();};$('look-lock').onclick=()=>world.requestPointerLock?.();$('help-btn').onclick=showHelp;$('interact').onclick=()=>interact();$('sound').onclick=()=>{state.settings.sound=!state.settings.sound;state.settings.soundDefaultsVersion=SOUND_DEFAULTS_VERSION;syncSound();sound();save();if(state.settings.sound&&audioDirector.currentLine&&state.settings.voiceAuto)audioDirector.replay();toast(state.settings.sound?'声音已开启':'声音已关闭');};
window.addEventListener('keydown',e=>{if(e.key!=='Escape'&&/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName))return;const k=e.key.toLowerCase();if(e.repeat&&(k===' '||k==='enter')&&modal){e.preventDefault();e.stopImmediatePropagation();return;}if(e.target.closest?.('[data-town-voice-replay]')&&(k===' '||k==='enter'))return;if(k==='escape'){if(!modal&&neighborhoodActivities?.active()){e.preventDefault();neighborhoodActivities.setPaused(!neighborhoodActivities.snapshot().paused);return;}if(modal==='vehicle-guide'){e.preventDefault();vehicleGuideView?.acknowledge('escape');return;}if(modal==='film'){$('film-close')?.click();return;}if(modal==='story'&&dialogue?.inspecting){setCGInspection(false);$('cg-inspect').focus({preventScroll:true});}else if(modal==='cg'){showJournal('cg');}else if(modal)closeModal();return;}if(modal==='resident'&&(k===' '||k==='enter')&&!e.target.closest('button')){e.preventDefault();e.stopImmediatePropagation();residentView?.advance();return;}if(modal==='film'&&(k===' '||k==='enter')&&!e.target.closest('button,input,summary')){e.preventDefault();e.stopImmediatePropagation();$('cinema-play')?.click();return;}if(modal==='newspaper'&&(k==='arrowup'||k==='arrowdown')){e.preventDefault();$('overlay').querySelector('.newspaper-pages')?.scrollBy({top:k==='arrowup'?-75:75});return;}if(modal==='newspaper'&&(k==='arrowleft'||k==='arrowright')){e.preventDefault();$(k==='arrowleft'?'newspaper-prev':'newspaper-next')?.click();return;}if(modal==='cg'&&(k==='arrowleft'||k==='arrowright')){e.preventDefault();$(k==='arrowleft'?'cg-prev':'cg-next')?.click();return;}if(modal==='district'&&(k===' '||k==='enter')&&e.target.id!=='district-leave'&&e.target.id!=='district-clue'){e.preventDefault();e.stopImmediatePropagation();if(!memoryView?.isInspecting())advanceDistrictReading?.();return;}if(modal==='adventure'&&(k===' '||k==='enter')&&e.target.id!=='adventure-leave'){e.preventDefault();e.stopImmediatePropagation();advanceAdventureReading?.();return;}if(modal==='story'&&(k===' '||k==='enter')&&e.target.id!=='story-prev'&&e.target.id!=='story-leave'&&e.target.id!=='cg-inspect'&&e.target.id!=='voice-replay'&&e.target.id!=='memory-film'&&!e.target.closest('[data-memory-card]')){e.preventDefault();e.stopImmediatePropagation();if(dialogue?.inspecting){setCGInspection(false);$('story-next').focus({preventScroll:true});}else nextLine();return;}if(modal)return;if(playfulLife?.photoActive&&['e','f','g','v',' '].includes(k)){e.preventDefault();return;}if(/^(w|a|s|d|arrowup|arrowdown|arrowleft|arrowright)$/.test(k))cancelSceneApproach();if(k==='g'){e.preventDefault();if(e.repeat)return;const n=world?.nearbyResident?.();if(n)requestSceneInteraction({kind:'resident',id:n.id});return;}if(k===' '&&world?.getPropState?.().mode==='bicycle'&&!e.target.closest('button,a,[role=button]')){e.preventDefault();if(!e.repeat)ringBicycleBell();return;}if(k===' '&&world?.getPropState?.().mode==='car'&&!e.target.closest('button,a,[role=button]')){e.preventDefault();if(!e.repeat)ringCarHorn();return;}if(k==='f'){e.preventDefault();if(!e.repeat)useWorldProp();return;}if(k==='v'){world.cycleView?.();syncCameraUI();save();}if(k==='m')showMap();if(k==='j')showJournal();if(k==='e')interact();});
$('overlay').addEventListener('keydown',e=>{if(e.key!=='Tab')return;const els=[...$('overlay').querySelectorAll('button:not([disabled]),input,select,summary,[tabindex="0"]')].filter(x=>x.offsetParent);if(!els.length)return;if(e.shiftKey&&document.activeElement===els[0]){els.at(-1).focus();e.preventDefault();}else if(!e.shiftKey&&document.activeElement===els.at(-1)){els[0].focus();e.preventDefault();}});
for(const b of document.querySelectorAll('[data-key]')){b.onpointerdown=e=>{e.preventDefault();b.setPointerCapture(e.pointerId);world.keys[b.dataset.key]=true;};b.onpointerup=b.onpointercancel=()=>world.keys[b.dataset.key]=false;}
try{bootLoading.setStage('scene');world=new World($('world'),{avatarId:state.settings.avatarId,onMove:()=>{},onSceneClick:requestSceneInteraction,onJump:()=>{if(state.settings.sound)playMovementSound(soundContext,'jump',1,audioDirector.effectsBus);},onLand:impact=>{if(state.settings.sound)playMovementSound(soundContext,'land',impact/6.6,audioDirector.effectsBus);},onFootstep:speed=>{if(state.settings.sound)playMovementSound(soundContext,'step',.65+speed*.08,audioDirector.effectsBus);},onNear:p=>{near=p;const show=world?.active&&!modal&&p;$('interact').hidden=!show;if(show){$('interact-label').textContent=destinationStatus(p).action;$('location').textContent='晴川里 · '+p.label;}},onFrame:dt=>{playfulLife?.update();neighborhoodActivities?.update();syncArrivalView();syncWuhanRoute();wuhanRouteHUD?.update();updateSceneApproach();adventureHUD?.update(dt);worldHudEffects?.update(dt);if(pendingInteraction&&world?.playerMotion?.grounded&&!modal){const id=pendingInteraction;pendingInteraction=null;if(near?.id===id)interact(near);}const now=performance.now(),wallDt=Math.max(0,(now-lastFrameStamp)/1000);lastFrameStamp=now;if(world?.active&&!document.hidden){state.seconds+=wallDt;saveClock+=wallDt;}navigationClock+=dt;frameTick++;if(frameTick%6===0)updateNavigation();if(frameTick%3===0){updateLabels();updatePropInterface();residentHUD?.update();}if(frameTick%20===0){updateMini();refreshAudioScene();}if(saveClock>5){saveClock=0;save();}}});restoreProps();world.setPosition(state.position);neighborhoodActivities=createNeighborhoodActivities({world,parent:$('hud'),getState:()=>state,isModal:()=>modal,panel,closeModal,save,collect:()=>collectGallery(state,localStorage),toast,releaseInputs:releaseGuideInputs,onRoute:id=>showMap(id),onStopGuidance:()=>{stopWuhanRoute();navigationEnabled=false;world.setGuidance(null);},onSound:name=>audioDirector.effect(name)});propHUD=mountPropHUD({parent:$('hud'),getWorld:()=>world,getState:()=>state,isModal:()=>modal,onUse:useWorldProp,onGuide:showPropsGuide});residentHUD=mountResidentHUD({parent:$('hud'),getWorld:()=>world,isModal:()=>modal,onTalk:id=>requestSceneInteraction({kind:'resident',id})});world.reduced=state.settings.reduced;world.setQuality(state.settings.quality==='low');world.setCameraMode?.(state.settings.cameraMode||'street');syncCameraUI();adventureHUD=mountAdventureHUD({parent:$('hud'),getState:()=>state,getWorld:()=>world,isModal:()=>modal,onTrack:p=>{beginGuidance(p.id);toast('循着燕子路标，去看看巷子另一头。');}});wuhanRouteHUD=mountWuhanRouteHUD({parent:$('hud'),getState:()=>state,getWorld:()=>world,isActive:()=>wuhanRouteActive,isModal:()=>modal,getTargetId:()=>wuhanRouteTarget,onRoute:startWuhanRoute,onCollapse:()=>stopWuhanRoute(),onMain:()=>stopWuhanRoute(true)});worldHudEffects=createWorldHudEffects($('hud'),{getState:()=>state,getWorld:()=>world,isModal:()=>modal});
 playfulLife=createPlayfulLife({world,parent:$('hud'),getState:()=>state,getNavigationTarget:()=>navigationTarget,isModal:()=>modal,isBusy:()=>Boolean(neighborhoodActivities?.active()),panel,closeModal,playDialogue,save,refresh:()=>{collectGallery(state,localStorage);renderHUD();},flag,toast,onRoute:beginGuidance,releaseInputs:releaseGuideInputs,syncCamera:syncCameraUI,onChefStory:()=>interact(POIS.find(p=>p.id==='chef')),onSound:name=>audioDirector.effect(name)});
 renderHUD();syncSound();bootLoading.update({completed:1,total:2});bootLoading.setStage('hero');
 // The selected hero is the only character on the critical path. All nine
 // residents retain usable shells and stream their detailed models afterwards.
 Promise.resolve(world.heroReady).then(()=>{bootLoading.update({completed:2,total:2});avatarChoiceError=world.avatarStatus?.state==='fallback';updateAvatarChoiceUI();bootLoading.complete();if(avatarChoiceError)toast('形象还没载入，点击右侧角色卡即可重试。');}).catch(err=>bootLoading.fail(err));}catch(err){bootLoading.fail(err);console.error(err);}
fetch('/media/manifest.json').then(r=>r.ok?r.json():{}).then(d=>media=d).catch(()=>{});
document.addEventListener('visibilitychange',()=>{lastFrameStamp=performance.now();audioDirector.setVisible(!document.hidden);if(document.hidden){cinemaPlayer?.pause();playfulLife?.beforeModal();}if(document.hidden){playingAudio?.pause();document.querySelectorAll('video,audio').forEach(v=>v.pause());}});
window.addEventListener('pagehide',save);
// Read-only diagnostics. No credentials or model APIs are loaded by the game.
window.__JIANGCHENG__={getPlayfulLife:()=>playfulLife?.snapshot()??null,getRace:()=>neighborhoodActivities?.snapshot()??null,getWuhanRoute:()=>({...deriveWuhanRoute(state),active:wuhanRouteActive,targetId:wuhanRouteTarget,hud:wuhanRouteHUD?.diagnostics()}),getPresentation:()=>({arrival:world?.getArrivalView?.()??null,fullscreen:fullscreen.snapshot(),loading:bootLoading.getSnapshot(),hud:worldHudEffects?.diagnostics?.()??null,particles:world?.worldParticles?.stats()??null}),getAudio:()=>({...audioDirector.diagnostics(),cinema:cinemaPlayer?.diagnostics()??null,filmNarration:playingAudio?{currentTime:playingAudio.currentTime,paused:playingAudio.paused}:null}),getState:()=>structuredClone(state),getWuhanDistrict:()=>({...world.getWuhanDistrict(),visited:normalizeWuhanVisits(state.wuhanVisits)}),getNavigation:id=>{const r=getNavigation(id);return r?{targetId:r.targetId,reachable:r.reachable,distance:r.distance,path:r.path.map(p=>({x:p.x,z:p.z}))}:null;},getMemory:()=>({id:$('overlay').querySelector('[data-memory-card]')?.dataset.memoryCard??null,inspecting:Boolean(memoryView?.isInspecting()),storyIndex:dialogue?storyIndex:null}),getResidentAvatars:()=>world.getResidentAvatars(),getResidents:()=>{const avatars=new Map((world.getResidentAvatars()?.residents??[]).map(n=>[n.id,n]));return {pending:pendingSceneInteraction?{id:pendingSceneInteraction.id,kind:pendingSceneInteraction.kind,route:pendingSceneInteraction.route?{targetId:pendingSceneInteraction.route.targetId,path:pendingSceneInteraction.route.path.map(p=>({x:p.x,z:p.z}))}:null}:null,nearby:world.nearbyResident?.(),residents:world.getResidentAnchors().map(n=>({...n,name:getResident(n.id)?.name,avatar:avatars.get(n.id)??null,screen:world.project(n.x,n.z,world.heightAt(n.x,n.z)+n.height*.55)}))}},getProps:()=>({firstGuide:vehicleGuideView?.diagnostics()??null,guideGate:vehicleGuideGate.diagnostics(),hornCount:carHornCount,bellCount:bicycleBellCount,runtime:world.getPropState?.()??null,nearby:world.getNearbyProp?.()??null,anchors:world.getPropAnchors?.()??[]}),getWorld:()=>({position:{x:world.player.position.x,y:world.player.position.y,z:world.player.position.z},adventure:world.adventureScenery?.summary??null,playerMotion:world.playerMotion?{...world.playerMotion}:null,playerYaw:world.player.rotation.y,simulationTime:world.elapsed,active:world.active,blocked:world.blocked,groundHeight:world.heightAt(world.player.position.x,world.player.position.z),cameraRotation:{x:world.camera.rotation.x,y:world.camera.rotation.y,z:world.camera.rotation.z,order:world.camera.rotation.order},cameraMode:world.cameraMode,eyeHeight:world.eyeHeight,characterHeight:world.player.userData.height,avatar:world.avatarStatus,residentAvatars:world.getResidentAvatars(),heading:world.getHeading?.(),shadow:world.getShadowStats?.(),navigation:navigationRoute?{targetId:navigationRoute.targetId,reachable:navigationRoute.reachable,distance:navigationRoute.distance,path:navigationRoute.path.map(p=>({x:p.x,z:p.z}))}:null,illustration:world.illustrationStats?{converted:world.illustrationStats.convertedMaterials,preserved:world.illustrationStats.preservedMaterials}:null,curvature:world.curvedWorld?.stats(),cameraDistance:world.actualCameraDistance,playerOpacity:world.playerOpacity??1,playerVisible:world.player.visible,moveSpeed:world.moveSpeed,playerFrame:{head:world.project(world.player.position.x,world.player.position.z,world.player.position.y+(world.player.userData.height||1.78)),feet:world.project(world.player.position.x,world.player.position.z,world.player.position.y)},drawCalls:world.renderer.info.render.calls,triangles:world.renderer.info.render.triangles,colliders:world.colliders.map(c=>({...c})),remainingRoute:world.path.length,camera:world.camera.position.toArray(),residentsOutside:world.npcs.filter(n=>n.group.visible).length,renderFrame:world.renderer.info.render.frame,suspended:world.suspended,cameraTarget:world.controls.target.toArray(),cameraRestoring:Boolean(world.cameraReturn),conversation:world.conversation?{placeId:world.conversation.placeId,replay:world.conversation.replay,framingMode:world.conversation.framingMode,manual:world.conversation.manual,actors:[{id:'player',group:world.player},...world.npcs.filter(n=>n.group===world.conversation.npc)].map(n=>({id:n.id,visible:n.group.visible,head:world.project(n.group.position.x,n.group.position.z,n.group.position.y+(n.group.userData.height??1.65)),feet:world.project(n.group.position.x,n.group.position.z,n.group.position.y)}))}:null}),canWalk:(x,z)=>world.canWalk(x,z),getNearest:()=>near?.id||null,getModal:()=>modal};
