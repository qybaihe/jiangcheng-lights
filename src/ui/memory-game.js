import './memory-game.css';
export const DRAWING_PIECES=Object.freeze(['close','bowl','talk','open']);
export function drawingComplete(order){return order.length===4&&order.every((id,index)=>id===DRAWING_PIECES[index]);}
export function swapDrawingPieces(order,a,b){const result=[...order];if(Number.isInteger(a)&&Number.isInteger(b)&&a>=0&&a<4&&b>=0&&b<4)[result[a],result[b]]=[result[b],result[a]];return result;}

export function mountMemoryGame(root,{onComplete=()=>{}}={}){
 let order=['talk','close','open','bowl'],selected=null,completed=false,continued=false,dragged=null;
 const game=document.createElement('section');game.className='memory-game drawing-puzzle';
 game.innerHTML=`<div class="drawing-intro"><span>林婆婆的相册 · 阿遥十岁</span><h3>你画的，还不认得？</h3><p>一张旧画沿折痕裂成四片。接上门框、桌沿和铅笔线，拼回原来的样子。</p></div><div class="drawing-album"><div class="drawing-board" role="group" aria-label="四片童画拼合区"></div><div class="drawing-signed" hidden>歪歪扭扭的签名，原来一直收在这里。</div></div><footer class="drawing-footer"><p id="puzzle-feedback" role="status">点选两片纸交换位置，也可以拖动交换。</p><button id="order-check" class="primary">这张画，拼好了吗？ →</button><button data-activity-continue class="primary" hidden>把画放回相册 →</button></footer>`;
 root.replaceChildren(game);const board=game.querySelector('.drawing-board'),feedback=game.querySelector('#puzzle-feedback');
 function render(){board.innerHTML=order.map((id,i)=>`<button type="button" class="drawing-piece${selected===i?' is-selected':''}" data-piece="${i}" data-piece-id="${id}" draggable="${!completed}" aria-label="第 ${i+1} 个位置的画纸" aria-pressed="${selected===i}" ${completed?'disabled':''}><img src="/media/child-drawing-${id}.webp" alt="带有连续门框、桌沿或铅笔线的童画碎片" draggable="false"/><span class="drawing-corner">${i+1}</span></button>`).join('');}
 function exchange(a,b){order=swapDrawingPieces(order,a,b);selected=null;render();board.querySelector(`[data-piece="${b}"]`)?.focus();feedback.textContent='纸片换好了。看看接缝上的线条有没有连起来。';}
 board.onclick=event=>{const piece=event.target.closest('[data-piece]');if(!piece||completed)return;const i=Number(piece.dataset.piece);if(selected===null){selected=i;render();board.querySelector(`[data-piece="${i}"]`).focus();feedback.textContent='已选中一片，再选另一片交换。';}else if(selected===i){selected=null;render();}else exchange(selected,i);};
 board.ondragstart=event=>{const piece=event.target.closest('[data-piece]');if(completed||!piece)return;dragged=Number(piece.dataset.piece);event.dataTransfer?.setData('text/plain',String(dragged));};
 board.ondragover=event=>{if(!completed)event.preventDefault();};
 board.ondrop=event=>{event.preventDefault();const piece=event.target.closest('[data-piece]');if(!completed&&piece&&dragged!==null)exchange(dragged,Number(piece.dataset.piece));dragged=null;};
 game.querySelector('#order-check').onclick=()=>{if(completed)return;if(!drawingComplete(order)){feedback.textContent='有的线条还断着。看看门框的转角和桌沿，再交换两片试试。';return;}completed=true;selected=null;render();game.classList.add('is-complete');game.querySelector('.drawing-signed').hidden=false;game.querySelector('#order-check').hidden=true;const next=game.querySelector('[data-activity-continue]');next.hidden=false;feedback.textContent='门框、桌沿和铅笔线都连上了。这是同一张画。';next.focus();};
 game.querySelector('[data-activity-continue]').onclick=()=>{if(!completed||continued)return;continued=true;onComplete();};render();return()=>game.remove();
}
