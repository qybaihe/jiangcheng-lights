import {RACE_COURSES,createRaceSession,normalizeRaceProgress,recordRaceResult,raceAvailability} from './neighborhood-races.js';
import {createRaceMarkers} from './race-markers.js';
import {mountRaceHUD,raceInvitationMarkup,raceResultMarkup} from './ui/neighborhood-races.js';
import './ui/neighborhood-races.css';

/** Optional play has its own ledger. Nothing here dispatches a story flag. */
export function createNeighborhoodActivities({world,parent,getState,isModal,panel,closeModal,save,collect,toast,releaseInputs,onRoute,onStopGuidance,onSound=()=>{}}){
 let session=null,paused=false,lastGate=0,lastStamp=performance.now();
 const markers=createRaceMarkers(world),slot=document.createElement('div');parent.append(slot);
 const hud=mountRaceHUD(slot,{onCancel:()=>cancel('这次先歇一会儿。成绩只在完整走过路线后记录。'),onPause:()=>setPaused(!paused)});
 const launch=document.createElement('button');launch.className='neighborhood-race-launch';launch.id='neighborhood-race-launch';launch.hidden=true;parent.append(launch);
 const course=id=>RACE_COURSES[id];
 const position=()=>{const r=world.getPropState();return r.mode==='boat'?r.boatPosition??world.player.position:r.mode==='car'?r.cars.find(c=>c.id===r.carId)??world.player.position:world.player.position;};
 const nearStart=id=>{const c=course(id),p=position();return !!c&&Math.hypot(p.x-c.start.x,p.z-c.start.z)<=(c.start.radius??6);};
 const release=()=>{releaseInputs();world.path=[];};
 const active=()=>Boolean(session&&['countdown','running'].includes(session.snapshot().status));
 function setPaused(value){
  if(!active())return;paused=Boolean(value);release();world.blocked=paused||Boolean(isModal())||session.snapshot().status==='countdown';lastStamp=performance.now();
  render();
 }
 function reset(){session=null;paused=false;markers.clear();hud.update(null);document.body.classList.remove('neighborhood-racing');world.blocked=Boolean(isModal());release();}
 function cancel(message){if(!session)return;session.cancel();reset();if(message)toast(message);}
 function render(){const s=session?.snapshot();hud.update(s?{...s,paused:paused||Boolean(isModal())}:null,s?course(s.courseId):null);}
 function begin(id){
  const c=course(id),availability=raceAvailability(getState(),id);
  if(!c||!availability.available){toast(availability.detail||'先把街坊的安排做好，晴天再来。');return;}
  if(world.getPropState().mode!==c.mode){toast(c.mode==='car'?'先坐进车里，再把车开到燕归路起点。':'先到码头坐进小木船。');return;}
  if(!nearStart(id)){toast('先回到标着「起点」的地方，再开始计时。');return;}
  closeModal();onStopGuidance();release();session=createRaceSession(id);paused=false;lastGate=0;lastStamp=performance.now();world.blocked=true;
  document.body.classList.add('neighborhood-racing');markers.update(session.snapshot());render();onSound('ui-confirm');
 }
 function invite(id){
  const c=course(id);if(!c)return;
  if(active()){setPaused(true);return;}
  const availability=raceAvailability(getState(),id),r=world.getPropState(),ready=r.mode===c.mode&&nearStart(id);
  const nearestCar=c.mode==='car'&&r.mode!=='car'?world.getPropAnchors?.().filter(p=>p.propType==='car').sort((a,b)=>Math.hypot(a.x-world.player.position.x,a.z-world.player.position.z)-Math.hypot(b.x-world.player.position.x,b.z-world.player.position.z))[0]:null;
  const routeId=c.mode==='boat'?'prop-rowboat':nearestCar?.id||'race-car',routeLabel=c.mode==='boat'?'小木船':nearestCar?'可以开的车':'起点';
  const a=ready?availability:{...availability,available:false,detail:!availability.available?availability.detail:c.mode==='car'?'先借一辆车，开到燕归路起点。靠近后，屏幕会出现「开始计时」。':'先在晴川里码头借小木船，再从浮标旁出发。'};
  if(!panel(c.title,'街坊的顺路邀请 · 可选游玩',raceInvitationMarkup(c,a,normalizeRaceProgress(getState().races))+'<div class="neighborhood-race-route-actions">'+(!ready?`<button data-race-find>在地图上找${routeLabel} ↗</button>`:'')+'</div>','neighborhood-race-panel'))return;
  const root=document.getElementById('overlay');root.querySelector('[data-race-start]')?.addEventListener('click',()=>begin(id));
  root.querySelector('[data-race-cancel]')?.focus({preventScroll:true});
  root.querySelectorAll('[data-race-cancel]').forEach(button=>button.addEventListener('click',closeModal));
  root.querySelector('[data-race-find]')?.addEventListener('click',()=>{closeModal();onRoute(routeId);});
 }
 function showResult(s){
  const c=course(s.courseId),result=s.result,state=getState();
  state.races=recordRaceResult(state.races,result);save();collect();reset();onSound('collect');
  if(!panel('这一程，记下了','晴川里 · 一张顺路纪念',raceResultMarkup(c,result,state.races),'neighborhood-race-panel'))return;
  const root=document.getElementById('overlay');
  root.querySelector('[data-race-close]')?.focus({preventScroll:true});
  root.querySelectorAll('[data-race-close]').forEach(button=>button.addEventListener('click',closeModal));
  root.querySelector('[data-race-retry]')?.addEventListener('click',()=>{
   closeModal();
   if(c.mode==='boat'){
    world.endPropInteraction({immediate:true});const r=world.startPropInteraction('prop-rowboat');if(!r?.ok){toast(r?.reason||'回到码头，再出发。');return;}
   }
   invite(c.id);
  });
 }
 function update(){
  const now=performance.now(),dt=Math.max(0,(now-lastStamp)/1000);lastStamp=now;
  const r=world.getPropState();
  if(r.mode==='boat'&&!raceAvailability(getState(),'boat').available){cancel();world.endPropInteraction({immediate:true});save();toast('渡口收起了登船板，已回到岸上的入口。');}
  if(active()){
   const before=session.snapshot(),available=raceAvailability(getState(),before.courseId);
   if(!world.active||!available.available){cancel('活动先暂停，回巷里看看。');return;}
   const s=session.update(dt,{...position(),mode:r.mode,paused:paused||Boolean(isModal())||document.hidden});
   if(s.checkpointsPassed>lastGate){lastGate=s.checkpointsPassed;onSound('ui-confirm');}
   if(s.status==='finished'){showResult(s);return;}
   if(s.status==='cancelled'){const reasons={'time-gap':'刚才画面中断了一下，这一圈先不记成绩。回到起点再来。','time-limit':'这一圈先到这里。江风不催你，回起点可以再试。','vehicle-left':'这次先停一停，回起点还可以再约一圈。','position-jump':'这一圈的位置有些不连续，回到起点再试。','outside-start':'先回到起点的标记旁，再开始计时。','early-start':'等三声倒数结束，再从起点出发。'};cancel(reasons[s.cancelReason]||'这次先歇一会儿，再回起点试试。');return;}
   world.blocked=paused||Boolean(isModal())||s.status==='countdown';markers.update(s);render();
  }
  const id=r.mode==='boat'?'boat':r.mode==='car'?'car':null;
  launch.hidden=!id||!world.active||Boolean(isModal())||active()||getState().runEnded;
  if(!launch.hidden){const c=course(id),near=nearStart(id);launch.dataset.course=id;launch.innerHTML=`<small>街坊的顺路邀请</small><strong>${c.title} <span>↗</span></strong><em>${near?'在起点了 · 点击查看玩法':id==='boat'?'划回码头旁的起点浮标，即可计时':'沿燕归路开到起点 · 54 号路牌旁'}</em>`;}
 }
 launch.onclick=()=>invite(launch.dataset.course);
 const onBlur=()=>setPaused(true),onVisibility=()=>{if(document.hidden)setPaused(true);};
 window.addEventListener('blur',onBlur);document.addEventListener('visibilitychange',onVisibility);
 return {update,invite,begin,cancel,setPaused,active,locked:()=>active()&&(paused||session.snapshot().status==='countdown'),snapshot:()=>session?{...session.snapshot(),paused}:null,
  beforeModal(type,cls=''){if(!active())return;if(cls.includes('map-panel')||cls.includes('neighborhood-race-panel'))setPaused(true);else cancel('本轮计时已收起，完成的纪录会保留。');},
  afterModal(){if(active()){world.blocked=paused||session.snapshot().status==='countdown';render();}},
  dispose(){cancel();markers.dispose();hud.dispose();slot.remove();launch.remove();window.removeEventListener('blur',onBlur);document.removeEventListener('visibilitychange',onVisibility);}};
}
