import {RESIDENTS,getResident} from '../resident-stories.js';
import {escapeHTML} from './prop-interactions.js';

export function residentDirectoryMarkup(state,world){
 const available=new Set(world.getResidentAnchors().filter(n=>n.visible).map(n=>n.id));
 const heard=state.residents?.heard||{};
 return `<section class="resident-directory"><header><div><small>巷子里的人 · 不止是路过</small><h3>打个招呼，就多认识一个人</h3></div><span>${Object.values(heard).reduce((n,ids)=>n+ids.length,0)} / ${RESIDENTS.reduce((n,r)=>n+r.topics.length,0)} 段街坊往事</span></header><p>直接点场景里的街坊，会走近聊一聊。主线委托仍用 E；闲谈不赶时间。</p><div class="resident-directory-grid">${RESIDENTS.map(r=>`<button data-resident-visit="${r.id}" ${available.has(r.id)?'':'disabled'}><i>${escapeHTML(r.monogram)}</i><span><strong>${escapeHTML(r.name)}</strong><small>${escapeHTML(r.role)}</small></span><em>${available.has(r.id)?`${heard[r.id]?.length||0}/${r.topics.length} ↗`:'在屋里'}</em></button>`).join('')}</div></section>`;
}

export function mountResidentHUD({parent,getWorld,isModal,onTalk}){
 const button=document.createElement('button');button.id='resident-greet';button.className='resident-greet';button.hidden=true;
 button.innerHTML='<kbd>G</kbd><span><strong></strong><small>问个好 · 听一段街坊往事</small></span><i>♧</i>';parent.append(button);
 let id=null;button.onclick=()=>{if(id)onTalk(id);};
 return {update(){const w=getWorld(),resident=w?.nearbyResident?.(),profile=resident&&getResident(resident.id);id=profile?.id;
  button.hidden=!profile||!w.active||isModal()||w.getPropState().mode!=='walk';
  if(profile)button.querySelector('strong').textContent='和'+profile.name+'聊聊';
 },dispose(){button.remove();}};
}
