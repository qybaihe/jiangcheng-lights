import {getWuhanMemory} from '../wuhan-memories.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/** The card belongs to the current 3D conversation, never a scene replacement. */
export function memoryCardMarkup(id,{placement='floating',collected=false,inspectLabel='细看这页记忆'}={}) {
  const item=getWuhanMemory(id);if(!item)return '';
  const image=expanded=>`<img src="${esc(item.image)}" alt="${esc(item.title)}：${esc(item.caption)}" ${expanded?'loading="lazy"':'decoding="async"'} data-memory-image ${item.fallbackImage?`data-memory-fallback="${esc(item.fallbackImage)}"`:''}>`;
  return `<aside class="wuhan-memory-card ${placement==='inline'?'is-inline':'is-floating'}" data-memory-card="${esc(id)}" aria-label="${esc(item.title)}的记忆插画">
    <button type="button" class="wm-preview" data-memory-action="inspect" aria-expanded="false" aria-label="${esc(inspectLabel)}：${esc(item.title)}">
      <span class="wm-corner" aria-hidden="true"></span><span class="wm-image">${image(false)}<span class="wm-image-status" hidden>旧照正在整理</span></span>
      <span class="wm-paper"><small>${esc(item.place)} <i aria-hidden="true">·</i> ${esc(item.era)}</small><strong>${esc(item.title)}</strong><span>${collected?'已收入画廊':'随这段往事展开'} <i aria-hidden="true">↗</i></span></span>
    </button>
    <figure class="wm-inspection" hidden tabindex="-1" aria-label="${esc(item.title)}，按 Escape 回到交谈">
      <header><div><small>武汉记忆 · ${esc(item.era)}</small><h3>${esc(item.title)}</h3></div><button type="button" data-memory-action="back">回到眼前 <span aria-hidden="true">×</span></button></header>
      <div class="wm-inspection-image">${image(true)}<span class="wm-image-status" hidden>旧照正在整理</span></div>
      <figcaption><span>${esc(item.caption)}</span><small>旧事里的画面 · 街坊仍在眼前</small></figcaption>
    </figure>
  </aside>`;
}

/** Delegated bindings survive a caller replacing its card markup. No save writes. */
export function mountMemoryInspection(root,{onInspect=()=>{}}={}) {
  const keyboardRoot=root.ownerDocument??root;
  let active=null,returnFocus=null,disposed=false;
  function close({focus=true}={}) {
    if(!active)return false;
    const card=active;active=null;card.classList.remove('is-inspecting');
    const detail=card.querySelector('.wm-inspection');if(detail)detail.hidden=true;
    card.querySelector('[data-memory-action="inspect"]')?.setAttribute('aria-expanded','false');
    onInspect(false,card.dataset.memoryCard);
    if(focus&&returnFocus?.isConnected)returnFocus.focus({preventScroll:true});returnFocus=null;
    return true;
  }
  function inspect(card) {
    close({focus:false});active=card;returnFocus=card.querySelector('[data-memory-action="inspect"]');
    card.classList.add('is-inspecting');returnFocus?.setAttribute('aria-expanded','true');
    const detail=card.querySelector('.wm-inspection');detail.hidden=false;
    onInspect(true,card.dataset.memoryCard);detail.querySelector('button')?.focus({preventScroll:true});
  }
  function click(event){
    const button=event.target.closest?.('[data-memory-action]');if(!button||!root.contains(button))return;
    const card=button.closest('[data-memory-card]');if(!card)return;
    event.preventDefault();event.stopPropagation();
    if(button.dataset.memoryAction==='inspect')inspect(card);else close();
  }
  function keydown(event){
    if(active&&event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}
    else if(active&&event.key==='Tab'){
      // The manual picture view has one close button; keep keyboard focus there.
      event.preventDefault();active.querySelector('.wm-inspection button')?.focus({preventScroll:true});
    }
  }
  function error(event){
    const img=event.target;if(!img?.matches?.('[data-memory-image]'))return;
    if(img.dataset.memoryFallback&&!img.dataset.fallbackUsed){img.dataset.fallbackUsed='true';img.src=img.dataset.memoryFallback;return;}
    img.hidden=true;const status=img.parentElement.querySelector('.wm-image-status');if(status)status.hidden=false;
  }
  function stopPointer(event){if(event.target.closest?.('[data-memory-card]'))event.stopPropagation();}
  root.addEventListener('click',click);keyboardRoot.addEventListener('keydown',keydown,true);
  root.addEventListener('error',error,true);root.addEventListener('pointerdown',stopPointer);
  return {close,isInspecting:()=>Boolean(active),dispose(){if(disposed)return;disposed=true;close({focus:false});root.removeEventListener('click',click);keyboardRoot.removeEventListener('keydown',keydown,true);root.removeEventListener('error',error,true);root.removeEventListener('pointerdown',stopPointer);}};
}
