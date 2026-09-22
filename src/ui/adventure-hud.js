import {ADVENTURE_STOPS,currentAdventureStop,adventureRegionAt} from '../adventure.js';
import './adventure-hud.css';

const kite='<svg viewBox="0 0 40 48" fill="none" aria-hidden="true"><path d="m20 3 15 16-15 12L5 19 20 3Z" fill="currentColor" fill-opacity=".15"/><path d="m20 3 15 16-15 12L5 19 20 3Zm0 0v28M5 19h30M20 31c-9 5 8 7 0 14" stroke="currentColor" stroke-width="1.6"/><path d="m16 39 4 2 4-2" stroke="currentColor" stroke-width="1.4"/></svg>';

/** This overlay never moves the camera or interrupts the player's input. */
export function mountAdventureHUD({parent,getState,getWorld,isModal,onTrack}){
 const compass=document.createElement('button');compass.id='adventure-trail';compass.className='adventure-compass';
 compass.innerHTML=`<span class="adventure-kite">${kite}</span><span class="adventure-compass-copy"><small>江风来信 <b id="adventure-count">0 / 3</b></small><strong id="adventure-hint"></strong></span><span class="adventure-bearing" aria-hidden="true">↑</span>`;
 compass.title='追随线索 · 可选探索';parent.append(compass);
 const region=document.createElement('div');region.className='adventure-region';region.setAttribute('aria-live','polite');region.innerHTML='<small>循着江风，走进街巷</small><strong></strong><span></span>';parent.append(region);
 const hintNode=compass.querySelector('strong'),countNode=compass.querySelector('b'),bearing=compass.querySelector('.adventure-bearing'),regionName=region.querySelector('strong'),regionSubtitle=region.querySelector('span');
 const visited=new Set();let timer=0,lastRegion=null,lastHint='',lastCount=-1,bearingClock=0,lastYaw=null;
 compass.onclick=()=>{const next=currentAdventureStop(getState().adventure);onTrack(next??ADVENTURE_STOPS.at(-1));};
 return {
  update(dt){
   const world=getWorld();if(!world)return;
   const s=getState(),next=currentAdventureStop(s.adventure),count=s.adventure?.found?.length??0;
   const paused=Boolean(isModal()||!world.active),weatherPaused=world.rainy&&!world.ended;
   if(compass.hidden!==paused)compass.hidden=paused;if(region.hidden!==paused)region.hidden=paused;
   const hint=weatherPaused?'雨过以后，再去听风':next?(next.routeHint??next.hint):'灯留在这里，等每个晚归的人';
   if(hint!==lastHint){hintNode.textContent=hint;compass.setAttribute('aria-label',`江风来信 · ${hint}`);lastHint=hint;}
   if(count!==lastCount){countNode.textContent=`${count} / ${ADVENTURE_STOPS.length}`;compass.classList.toggle('complete',!next);lastCount=count;}
   if(compass.disabled!==weatherPaused)compass.disabled=weatherPaused;
   // Keep the tiny bearing on its own compositor layer; text and geometry are
   // cached, and heading wraparound takes the short path rather than a full spin.
   bearingClock+=Math.max(0,dt||0);
   if(next&&!paused&&(bearingClock>=.1||lastYaw===null)){const p=world.player.position,yaw=Math.atan2(next.x-p.x,-(next.z-p.z))-(world.getHeading?.()??0),continuous=lastYaw===null?yaw:lastYaw+Math.atan2(Math.sin(yaw-lastYaw),Math.cos(yaw-lastYaw));if(lastYaw===null||Math.abs(continuous-lastYaw)>.015){bearing.style.transform=`rotate(${continuous}rad)`;lastYaw=continuous;}bearingClock=0;}
   if(bearing.hidden!==!next)bearing.hidden=!next;
   if(paused){region.classList.remove('visible');return;}
   timer=Math.max(0,timer-dt);
   const p=world.player.position,r=adventureRegionAt(p.x,p.z);
   if(r&&r.id!==lastRegion&&!visited.has(r.id)&&world.playerMotion?.grounded!==false){
    visited.add(r.id);timer=4.2;regionName.textContent=r.name;regionSubtitle.textContent=r.subtitle;
   }
   lastRegion=r?.id??null;region.classList.toggle('visible',timer>0&&!s.settings.reduced);
  },
  reset(){visited.clear();lastRegion=null;timer=0;lastYaw=null;bearingClock=0;region.classList.remove('visible');},
  dispose(){compass.remove();region.remove();visited.clear();},
 };
}
