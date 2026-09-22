import {galleryItems,resumeEndingFork} from './endings.js';
import './ui/achievement-gallery.css';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function mountGallery(root,{state,storage,onClose=()=>{},onReplay=()=>{},onResumeFork=()=>{}}={}) {
  const items=galleryItems(state,storage); let filter='all',selected=null,disposed=false;
  const labels={all:'全部收藏',ending:'四种归途',memory:'武汉旧事',art:'江城画作'};
  const inFilter=(item,id)=>id==='all'||item.type===id||(id==='memory'&&item.type==='wuhan-memory');
  const isMemory=item=>item.type==='memory'||item.type==='wuhan-memory';
  function bindImages(){root.querySelectorAll('img[data-fallback]').forEach(img=>{img.onerror=()=>{img.onerror=null;img.src=img.dataset.fallback;};});}
  function render(){
    if(disposed)return;
    const visible=items.filter(x=>inFilter(x,filter)), unlocked=items.filter(x=>x.unlocked).length;
    root.innerHTML=`<section class="achievement-gallery" aria-label="江城画廊"><header class="ag-heading"><div><p class="ag-kicker">THE THINGS WE KEEP</p><h2>江城画廊<span>把走过的故事，留在这里。</span></h2></div><div class="ag-total"><strong>${unlocked}</strong><span>/ ${items.length} 幅已收藏</span><button class="ag-close" data-close aria-label="关闭画廊">×</button></div></header><nav class="ag-tabs" aria-label="画廊分类">${Object.entries(labels).map(([id,title])=>`<button data-filter="${id}" class="${filter===id?'active':''}" aria-pressed="${filter===id}">${title}<small>${items.filter(x=>inFilter(x,id)&&x.unlocked).length}</small></button>`).join('')}</nav><div class="ag-grid">${visible.map(item=>`<button class="ag-card ${item.unlocked?'':'locked'}" data-card="${esc(item.id)}" ${item.unlocked?'':'disabled'}><div class="ag-frame">${item.unlocked?`<img src="${esc(item.image)}" ${item.fallbackImage?`data-fallback="${esc(item.fallbackImage)}"`:""} alt="${esc(item.title)}" loading="lazy">`:`<div class="ag-sealed"><span>未开启的故事</span><i>✧</i></div>`}<span class="ag-chip">${item.type==='ending'?`归途 · 0${item.number}`:isMemory(item)?(item.kind==='resident'?'街坊旧事':item.kind==='lore'?'江城拾光':item.kind==='adventure'?'江风来信':'旧物记忆'):'成就画作'}</span></div><div class="ag-caption"><h3>${item.unlocked?esc(item.title):item.type==='ending'?'另一种归途':'尚未收藏'}</h3><p>${item.unlocked?esc(item.description):item.type==='ending'?'沿着自己的选择走下去。':'在街巷里多停留一会儿，和人说说话。'}</p><small>${item.unlocked?'展开画作 ↗':item.type==='art'||item.type==='wuhan-memory'?esc(item.hint):'完成相关故事后解锁'}</small></div></button>`).join('')}</div><footer class="ag-foot">本机画廊跨周目保留 · 跳过影片不会抹去已完成的故事 · 未解锁结局不提前展示</footer></section>`;
    bindImages();root.querySelector('[data-close]').onclick=onClose;
    root.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;render();root.querySelector(`[data-filter="${filter}"]`)?.focus();});
    root.querySelectorAll('[data-card]:not(:disabled)').forEach(b=>b.onclick=()=>openItem(b.dataset.card));
  }
  function openItem(id){
    const item=items.find(x=>x.id===id&&x.unlocked);if(!item)return;selected=id;
    root.innerHTML=`<section class="ag-lightbox" data-memory-id="${esc(item.memoryId||'')}" aria-label="${esc(item.title)}"><button class="ag-back" data-back>← 回到画廊</button><figure><img src="${esc(item.image)}" ${item.fallbackImage?`data-fallback="${esc(item.fallbackImage)}"`:""} alt="${esc(item.title)}"><figcaption><div><p class="ag-kicker">${item.type==='ending'?esc(item.kind):item.type==='wuhan-memory'?esc(item.chapter+' · '+item.era):'A MOMENT IN JIANGCHENG'}</p><h2>${esc(item.title)}</h2><p>${esc(item.description)}</p></div><div class="ag-view-actions">${item.type==='memory'?'<button data-replay>重温这段往事</button>':''}${item.type==='ending'?'<button data-replay>重温结局</button>':''}${item.canResume?'<button data-resume>回到这次选择之前</button>':''}</div></figcaption></figure>${item.type==='wuhan-memory'&&item.lines?.length?`<article class="ag-memory-transcript" aria-label="${esc(item.personName)}的旧事"><h3>${esc(item.personName)}这样说</h3>${item.lines.map(line=>`<p>${esc(line)}</p>`).join('')}<small>想再聊几句，就回巷子里找这位街坊。</small></article>`:''}${item.type==='ending'?`<p class="ag-route-note">这次归途：${esc(item.hint)}<br>回到分岔点不会清除已收藏的画作，也不会替你完成未做的委托。</p>`:''}</section>`;
    bindImages();root.querySelector('[data-back]').onclick=()=>{selected=null;render();};
    root.querySelector('[data-replay]')?.addEventListener('click',()=>onReplay(item.type,item.endingId||item.movie));
    root.querySelector('[data-resume]')?.addEventListener('click',()=>{
      const fork=resumeEndingFork(storage,item.endingId);if(!fork)return;
      const actions=root.querySelector('.ag-view-actions');
      actions.innerHTML='<p>回到这次选择之前？当前进度会由该分岔存档替换，画廊收藏保留。</p><button data-confirm>确认返回</button><button data-cancel>留在画廊</button>';
      actions.querySelector('[data-confirm]').onclick=()=>onResumeFork(fork);
      actions.querySelector('[data-cancel]').onclick=()=>openItem(id);
      actions.querySelector('[data-cancel]').focus();
    });
    root.querySelector('[data-back]')?.focus();
  }
  const keydown=event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(selected){selected=null;render();}else onClose();}};
  root.addEventListener('keydown',keydown);render();root.querySelector('button')?.focus();
  return {dispose(){disposed=true;root.removeEventListener('keydown',keydown);}};
}
