import {photoPoint,mealPoint,activeMealRound} from './playful-life-tasks.js';
import {PHOTO_CHALLENGES,normalizePhotoProgress,recordPhotoResult} from './photo-alignment.js';
import {createPhotoAlignmentController,photoDirectoryMarkup,photoInvitationMarkup} from './ui/photo-alignment.js';
import {MEAL_ROUNDS,MEAL_STOPS,MEAL_FOODS,mealSummary,deriveMealTask,normalizeMealProgress,startMealRelay,deliverMeal} from './meal-relay.js';
import {mountMealPacking,mountMealHUD} from './ui/meal-relay.js';
import {createMealScenery} from './playful-life-scenery.js';
import './ui/photo-alignment.css';
import './ui/playful-life.css';

const has=(s,id)=>s.flags.includes(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
/** One lifecycle for both optional exploration and the actual mainline relay.
 * All rewards use real rule results, never the entry panel or navigation. */
export function createPlayfulLife({world,parent,getState,getNavigationTarget=()=>null,isModal,isBusy=()=>false,panel,closeModal,playDialogue,save,refresh,flag,toast,onRoute,releaseInputs,syncCamera,onChefStory=()=>{},onSound=()=>{}}){
 let packing=null,mealHUD=null,hudRound=null,disposed=false,photoInviting=false,pendingPractice=null;
 const scenery=createMealScenery(world),action=document.createElement('button');
 action.className='life-world-action';action.hidden=true;action.type='button';parent.append(action);
 const state=()=>getState();
 const changed=()=>{save();refresh();};
 const sample=()=>({...world.player.position,mode:world.getPropState().mode,grounded:world.playerMotion?.grounded===true});
 const allowed=()=>world.active&&!state().runEnded&&!(world.rainy&&!world.ended);
 const isAtChef=()=>{const p=sample();return p.mode==='walk'&&p.grounded&&Math.hypot(p.x-10,p.z-12)<3.2&&Math.abs(p.y-world.heightAt(10,12))<.8;};
 const photo=createPhotoAlignmentController(world,parent,{
  onComplete(result){state().photos=recordPhotoResult(state().photos,result);state().photoTarget=null;releaseInputs();syncCamera();changed();onSound('collect');playDialogue('photoAligned',()=>toast('照片已收入画廊 · 回林婆婆的小院，给她看看。'));},
  onCancel(snapshot){releaseInputs();syncCamera();if(snapshot?.cancelReason==='player-cancelled'){state().photoTarget=null;changed();toast('旧照夹回手账了，巷中生活里可以继续。');}},
  onChange(snapshot){document.body.classList.toggle('in-photo-alignment',Boolean(snapshot));},
 });
 function point(id){return typeof id==='string'&&id.startsWith('photo-')?photoPoint(id.slice(6)):mealPoint(id);}
 function points(){const s=state();return [...(has(s,'radio')?Object.keys(PHOTO_CHALLENGES).map(photoPoint):[]),...(activeMealRound(s)?Object.values(MEAL_STOPS).map(s=>mealPoint(s.target)):[])];}
 function beforeModal(){photo.cancel('modal-opened');packing?.();packing=null;}
 function beginPhoto(id){
  if(!Object.hasOwn(PHOTO_CHALLENGES,id))return;
  if(!has(state(),'radio')){toast('先修好收音机，旧照片在婆婆的相册里。');return;}
  if(!allowed()||isBusy()){toast('先把眼前的安排交接好，再沿主巷找照片。');return;}
  closeModal();
  if(world.getPropState().mode!=='walk'){toast('先按 F 停好车，再拿出旧照。');return;}
  releaseInputs();
  if(photo.begin(id)){state().photoTarget=id;changed();syncCamera();onRoute('photo-'+id);toast('旧照在左侧 · 认招牌、木窗和街景，拖动画面慢慢找。');}
 }
 function invitePhoto(){
  if(state().photoInvited||photoInviting)return;
  photoInviting=true;state().photoInvited=true;save();
  playDialogue('photoIntro',()=>{photoInviting=false;panel('旧照片，还认得吗？','林婆婆的相册 · 可选探索',photoInvitationMarkup(PHOTO_CHALLENGES.shop,normalizePhotoProgress(state().photos).completed.includes('shop'))+'<button class="life-later" data-life-later>夹进手账，先去送旧灯</button>','life-invitation-panel');const root=document.getElementById('overlay');root.querySelector('[data-photo-start]').onclick=()=>beginPhoto('shop');root.querySelector('[data-life-later]').onclick=closeModal;});
 }
 function roundEligible(round){
  const s=state();
  return round==='morning'?has(s,'postlude'):has(s,'chefRequested')&&s.supplies.length===3&&!has(s,'checked');
 }
 function setMeals(progress){state().meals=normalizeMealProgress(progress);changed();}
 function beginMeal(round='evening'){
  if(!roundEligible(round)){toast(round==='morning'?'等雨后的故事走完，再来送明早的过早。':'先把蔡姨需要的三样物资找齐。');return;}
  if(!isAtChef()){closeModal();onRoute('chef');toast('到蔡记过早铺的桌前，按 E 看看便签。');state().mealRound=round;save();return;}
  if(!allowed()){toast('先沿主巷完成眼前的安排。');return;}
  if(round==='evening'&&!has(state(),'chef')&&!state().mealStoryReady){closeModal();onChefStory();return;}
  if(mealSummary(state().meals,round).completed){receipt(round);return;}
  const start=()=>{state().mealRound=round;setMeals(startMealRelay(state().meals,round).progress);openPacking(round);};
  if(mealSummary(state().meals,round).started){start();return;}
  if(round==='morning'){
   panel('天晴了，过早去。','次晨番外 · 不改变这一回的结局','<p class="notice-copy">在晴川里多住了一晚。街坊的三份过早，又写在蔡姨的纸条上。<br><br>沿公共主巷送到陈姐和小许手里，江边低处仍不通行。</p><button class="primary" data-life-morning>翻到第二天，去看便签 →</button>','life-invitation-panel');
   document.querySelector('[data-life-morning]').onclick=()=>{closeModal();state().mealMorning=true;playDialogue('foodPostlude',start);};
  }else playDialogue('foodPackIntro',start);
 }
 function openPacking(round='evening',{practice=false}={}){
  if(!isAtChef()){closeModal();if(practice)pendingPractice=round;onRoute('chef');toast('分装台在蔡姨身边，到了按 E 再动手。');return;}
  const initial=practice?startMealRelay(null,round).progress:state().meals;
  if(!panel(practice?'空盒练习 · 不重复配送':'照着便签，留一口热的',practice?'练习不覆盖已交接的食盒':'蔡记过早 · 读便签 / 分装 / 亲手交接','<div id="meal-packing-root"></div>','life-packing-panel'))return;
  packing=mountMealPacking(document.getElementById('meal-packing-root'),{progress:initial,roundId:round,
   onChange(progress,result){if(!practice)setMeals(progress);if(result.code==='sealed')onSound('ui-confirm');},
   onCancel(){closeModal();if(!practice)toast('食盒和便签已保存，回到蔡姨这里可以接着做。');},
   onReady(progress){if(!practice)setMeals(progress);closeModal();if(practice){toast('练习完成 · 已送达的食盒和主线进度没有改变。');return;}playDialogue('foodReady',()=>{const task=deriveMealTask(state().meals,round);if(task.target)onRoute(task.target);});},
  });
 }
 function chefStoryReady(){state().mealStoryReady=true;save();if(mealSummary(state().meals,'evening').completed){if(!has(state(),'chef'))flag('chef');return;}beginMeal('evening');}
 function nearbyOrder(){
  const round=activeMealRound(state());if(!round||!allowed())return null;
  const p=sample(),progress=normalizeMealProgress(state().meals),orders=MEAL_ROUNDS[round].orders;
  const item=orders.find(item=>{const stop=MEAL_STOPS[item.stopId],box=progress.rounds[round].boxes[item.id];return box.sealed&&!box.delivered&&Math.hypot(p.x-stop.x,p.z-stop.z)<=stop.radius&&Math.abs(p.y-stop.y)<1.25;});
  return item?{item,round,stop:MEAL_STOPS[item.stopId],sample:p}:null;
 }
 function handover(){
  const next=nearbyOrder();if(!next)return false;
  const result=deliverMeal(state().meals,next.round,next.item.id,next.sample);
  if(!result.ok){toast(result.message);return true;}
  setMeals(result.progress);onSound('collect');scenery.handover(next.stop,next.item.name);releaseInputs();toast(result.message);
  if(result.justCompleted){
   if(next.round==='evening'&&state().mealStoryReady&&!has(state(),'chef'))flag('chef');
   state().mealRound=null;changed();
   // Completion happens at either receiver. Do not cut to an absent speaker.
   const done=()=>toast(MEAL_ROUNDS[next.round].completion);
   if(next.stop.id==='community')playDialogue(next.round==='morning'?'foodMorningHandoff':'foodHandoff',done);else playDialogue('foodHandoffWest',done);
  }
  return true;
 }
 function intercept(p){
  if(!allowed()||isModal())return false;
  const target=point(getNavigationTarget())??photoPoint(state().photoTarget);
  if(!photo.active&&target?.playful==='photo'&&Math.hypot(world.player.position.x-target.x,world.player.position.z-target.z)<3){beginPhoto(target.photoId);return true;}
  if(!p)return false;
  if(photo.active){if(p.playful==='photo'){photo.shutter();return true;}return false;}
  const next=nearbyOrder();if(next&&(['granny','walker0','community',next.stop.target].includes(p.id)))return handover();
  if(p.playful==='photo'){beginPhoto(p.photoId);return true;}
  if(p.id==='granny'&&has(state(),'granny')){
   const completed=normalizePhotoProgress(state().photos).completed,returned=Array.isArray(state().photosReturned)?state().photosReturned:[];
   if(completed.some(id=>!returned.includes(id))){playDialogue('photoReturn',()=>{state().photosReturned=[...completed];changed();toast('婆婆把旧照和新照片并排收好了。');});return true;}
  }
  if(p.id==='chef'){
   if(state().mealMorning&&mealSummary(state().meals,'morning').completed&&!pendingPractice){playDialogue('foodMorningAfter');return true;}
   if(pendingPractice){const round=pendingPractice;pendingPractice=null;openPacking(round,{practice:true});return true;}
   const round=activeMealRound(state())??(state().mealRound==='morning'&&has(state(),'postlude')?'morning':null);
   if(round){if(!isAtChef()){toast('先按 F 下车，在桌前站稳。');return true;}const s=mealSummary(state().meals,round);if(s.ready){onRoute(deriveMealTask(state().meals,round).target);toast('食盒已经在篮子里了，沿主巷送到接应的人手里。');}else beginMeal(round);return true;}
   if(state().mealStoryReady&&!has(state(),'chef')){beginMeal('evening');return true;}
   if(state().mealRound==='evening'&&has(state(),'chef')&&roundEligible('evening')){beginMeal('evening');return true;}
  }
  return false;
 }
 function directoryMarkup(){
  const s=state(),evening=mealSummary(s.meals,'evening'),morning=mealSummary(s.meals,'morning');
  const card=(round,summary,title,copy)=>`<article><small>${round==='morning'?'次晨番外':'主线里的热食接力'}</small><h4>${title}</h4><p>${copy}</p><span>${summary.completed?'✓ 三份已亲手交到':summary.started?`封盒 ${summary.sealed}/3 · 交接 ${summary.delivered}/3`:'三张便签 · 两处接应'}</span><button type="button" data-life-meal="${round}" ${!summary.completed&&!roundEligible(round)?'disabled':''}>${summary.completed?'看看回执':summary.started?'接着上次做':round==='morning'?'翻到次晨，送过早':'到蔡姨的分装台'} ↗</button>${round==='evening'&&has(s,'chef')?'<button class="life-practice-link" type="button" data-life-practice-route="evening">用空盒练一练 · 不改进度</button>':''}</article>`;
  return `<section class="life-directory"><header><span>把武汉的日常，亲手过一遍</span><h3>一张旧照，一口热的。</h3><p>不是打开一页就算完成。走到照片里的地方，把热食送到人的手里。</p></header>${photoDirectoryMarkup(s.photos)}<div class="life-meal-directory">${card('evening',evening,'记住每个人的口味','看便签选热食、分葱辣、贴名字。骑车、开车或步行都可以，到了下车交接。')}${card('morning',morning,'天晴了，骑车送过早','在雨后番外重新接三张便签。口味换了，街坊还在熟悉的巷口等你。')}</div><p class="life-directory-foot">旧照在修好收音机后可找；热食在物资齐备后开始；次晨番外在雨后散步时开放。提示和练习不扣分，也不改变四种结局的判定。</p></section>`;
 }
 function receipt(round){
  const orders=MEAL_ROUNDS[round].orders;
  panel('食盒上的三个名字','热食接力 · 交接回执',`<div class="life-receipts">${orders.map(item=>`<article><small>亲手交接 · ${esc(MEAL_STOPS[item.stopId].receiver)}</small><h3>${esc(item.name)}</h3><p>${esc(MEAL_FOODS[item.food].name)}</p><span>✓ 名字与口味已核对</span></article>`).join('')}</div><p class="notice-copy">${esc(MEAL_ROUNDS[round].completion)}</p><button class="text-button" data-life-practice>回蔡姨桌前，再练一回分装</button>`,'life-invitation-panel');
  document.querySelector('[data-life-practice]').onclick=()=>openPacking(round,{practice:true});
 }
 function bindDirectory(root){
  root.querySelectorAll('[data-life-practice-route]').forEach(b=>b.onclick=()=>openPacking(b.dataset.lifePracticeRoute,{practice:true}));
  root.querySelectorAll('[data-photo-route]').forEach(b=>b.onclick=()=>beginPhoto(b.dataset.photoRoute));
  root.querySelectorAll('[data-life-meal]').forEach(b=>b.onclick=()=>{const round=b.dataset.lifeMeal;if(mealSummary(state().meals,round).completed)receipt(round);else beginMeal(round);});
 }
 function update(){
  if(disposed)return;photo.update();
  const s=state(),round=activeMealRound(s);
  if(round!==hudRound){mealHUD?.();mealHUD=null;hudRound=round;if(round)mealHUD=mountMealHUD(parent,{progress:s.meals,roundId:round,onNavigate:onRoute,onOpenPacking:()=>openPacking(round)});}
  mealHUD?.update(s.meals,sample());
  document.body.classList.toggle('life-modal-open',Boolean(isModal()));
  scenery.update(s,round);
  const near=nearbyOrder(),resumeId=s.photoTarget??point(getNavigationTarget())?.photoId,resume=!photo.active&&Object.hasOwn(PHOTO_CHALLENGES,resumeId)&&PHOTO_CHALLENGES[resumeId],show=!isModal()&&!photo.active&&!isBusy()&&(near||resume)&&allowed();action.hidden=!show;
  action.dataset.photo=resume&&!near?resumeId:'';
  if(show&&!near){action.textContent='拿出旧照，继续找一找 · '+resume.title;action.disabled=false;return;}
  if(show){const txt=near.sample.mode!=='walk'?'先按 F 下车，再交接食盒':`E · 把${near.item.name}的${MEAL_FOODS[near.item.food].name}交给${near.stop.receiver}`;if(action.textContent!==txt)action.textContent=txt;action.disabled=near.sample.mode!=='walk'||!near.sample.grounded;}
 }
 action.onclick=()=>action.dataset.photo?beginPhoto(action.dataset.photo):handover();
 const blur=()=>photo.cancel('window-blur');window.addEventListener('blur',blur);
 return {point,points,beginPhoto,invitePhoto,beginMeal,chefStoryReady,intercept,handover,directoryMarkup,bindDirectory,beforeModal,update,
  resetTransient(){beforeModal();pendingPractice=null;photoInviting=false;},
  get photoActive(){return photo.active;},
  foodMode(){const s=state();if(!s.mealStoryReady&&!s.mealNarrative&&!mealSummary(s.meals,'evening').started)return null;const sum=mealSummary(s.meals,'evening');return sum.completed?'delivered':sum.ready?'packed':'pending';},
  snapshot:()=>({photo:photo.snapshot(),photos:normalizePhotoProgress(state().photos),meals:normalizeMealProgress(state().meals),activeRound:activeMealRound(state()),nearbyOrder:nearbyOrder()?.item.id??null,scenery:scenery.snapshot()}),
  dispose(){disposed=true;beforeModal();photo.dispose();mealHUD?.();scenery.dispose();action.remove();window.removeEventListener('blur',blur);document.body.classList.remove('in-photo-alignment','life-modal-open');},
 };
}
