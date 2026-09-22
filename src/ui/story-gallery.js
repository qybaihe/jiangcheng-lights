import {STORY_CGS,STORY_PEOPLE,isCGUnlocked,personPortrait} from '../story-art.js';

export function cgGalleryMarkup(state) {
 const count=STORY_CGS.filter(cg=>isCGUnlocked(state,cg)).length;
 return `<div class="cg-collection-intro"><p>有些瞬间，会在心里亮很久。</p><span>已展开 ${count} / ${STORY_CGS.length} 张旧照</span></div>
 <div class="cg-gallery">${STORY_CGS.map((cg,i)=>{
  const unlocked=isCGUnlocked(state,cg);
  return `<button class="cg-card ${unlocked?'':'locked'}" data-cg="${cg.id}" ${unlocked?'':'disabled'} aria-label="${unlocked?cg.title:'尚未展开的回忆'}">
  <span class="cg-card-art">${unlocked?`<img src="${cg.url}" alt="${cg.title}" loading="lazy"/>`:'<span class="cg-locked-art"><span aria-hidden="true">✧</span></span>'}<span class="cg-card-number">${String(i+1).padStart(2,'0')}</span></span>
  <span class="cg-card-copy"><small>${unlocked?cg.chapter:'晴川里 · 尚待重逢'}</small><strong>${unlocked?cg.title:'尚未展开的回忆'}</strong><em>${unlocked?cg.caption:'和街坊走完这段故事，再回来翻一翻。'}</em></span></button>`;
 }).join('')}</div><p class="cg-collection-empty">旧照随故事解锁，可随时回来查看。看图与重温不会改变任务进度。</p>`;
}

export function peopleMarkup(avatarId) {
 return `<div class="cg-collection-intro"><p>认得一张脸，就认得一条回家的路。</p><span>晴川里 · 街坊名录</span></div><div class="people-grid">${STORY_PEOPLE.map(person=>`<article class="person-card"><div class="person-card-portrait"><img src="${personPortrait(person.id,avatarId)}" alt="${person.name}的角色形象" loading="lazy"/><span>${person.name}</span></div><div class="person-card-copy"><small>${person.role}</small><p>${person.description}</p><span>随身的记忆 · ${person.object}</span></div></article>`).join('')}</div>`;
}

export function cgViewerMarkup(cg,index,total) {
 return `<section class="cg-viewer" data-cg-id="${cg.id}" role="dialog" aria-modal="true" aria-label="${cg.title}"><img src="${cg.url}" alt="${cg.title}：${cg.caption}"/><button class="close" id="cg-back">返回旧照集 <span aria-hidden="true">×</span></button><div class="cg-viewer-caption"><div><small>${cg.chapter}</small><h3>${cg.title}</h3><p>${cg.caption}</p></div><div class="cg-viewer-nav"><button id="cg-prev" ${index===0?'disabled':''}>← 上一张</button><span>${index+1} / ${total}</span><button id="cg-next" ${index===total-1?'disabled':''}>下一张 →</button></div></div></section>`;
}
