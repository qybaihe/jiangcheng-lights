import {CIRCUIT,circuitConnected} from '../story.js';
import './circuit-game.css';

const arrow='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 12h15m-6-6 6 6-6 6"/></svg>';
const screw='<i class="radio-screw" aria-hidden="true"></i>';

function radioIllustration(){return `<svg class="radio-portrait" viewBox="0 0 400 250" role="img" aria-label="木壳收音机，绿色调频窗、黄铜旋钮与编织扬声器">
 <defs><linearGradient id="radio-wood" x2="0" y2="1"><stop stop-color="#b88b5d"/><stop offset=".5" stop-color="#946a44"/><stop offset="1" stop-color="#775134"/></linearGradient><linearGradient id="radio-face" x2="0" y2="1"><stop stop-color="#d4b382"/><stop offset="1" stop-color="#af8757"/></linearGradient><radialGradient id="radio-knob"><stop stop-color="#f9e3ae"/><stop offset=".7" stop-color="#c79d60"/><stop offset="1" stop-color="#805d36"/></radialGradient><pattern id="radio-weave" width="5" height="5" patternUnits="userSpaceOnUse"><rect width="5" height="5" fill="#d4be8f"/><path d="M0 1h5M1 0v5" stroke="#8c774f" stroke-width="1"/></pattern></defs>
 <ellipse cx="202" cy="226" rx="157" ry="13" fill="#344a3420"/><path d="M67 218v10h30v-10M303 218v10h30v-10" fill="#69513c"/>
 <rect x="42" y="49" width="316" height="176" rx="15" fill="url(#radio-wood)" stroke="#755539" stroke-width="2"/><rect x="48" y="55" width="304" height="164" rx="11" fill="none" stroke="#edcf9950"/>
 <path d="M51 64h296M49 209h300M57 60q65 9 134 1t151 1M56 215q77-7 151-1t137-1" fill="none" stroke="#573b2a40"/>
 <rect x="62" y="69" width="276" height="136" rx="6" fill="url(#radio-face)" stroke="#dfc79b"/>
 <rect x="73" y="80" width="156" height="114" rx="3" fill="#766346"/><rect x="78" y="85" width="146" height="104" rx="2" fill="url(#radio-weave)"/>
 <path d="M100 86v102m23-102v102m23-102v102m23-102v102m23-102v102" stroke="#b29a6b" stroke-width="3" opacity=".7"/>
 <rect x="242" y="82" width="85" height="42" rx="3" fill="#334e46" stroke="#765b38"/><path d="M247 105h74" stroke="#a2be99"/>
 ${Array.from({length:12},(_,i)=>`<path d="M${249+i*6} 98v${i%3===0?12:7}" stroke="#cbd7af" stroke-width=".8"/>`).join('')}
 <text x="252" y="93" fill="#e1d49d" font-size="5" letter-spacing="1">FM · 汉口的声音</text><path class="radio-tuning-needle" d="M285 94v26" stroke="#d39b58" stroke-width="2"/>
 <circle cx="261" cy="156" r="17" fill="#755237"/><circle cx="261" cy="154" r="15" fill="url(#radio-knob)"/><path d="M261 140v6" stroke="#715334" stroke-width="2"/>
 <circle cx="306" cy="156" r="17" fill="#755237"/><circle cx="306" cy="154" r="15" fill="url(#radio-knob)"/><path d="M306 140v6" stroke="#715334" stroke-width="2"/>
 <text x="261" y="186" text-anchor="middle" font-size="7" fill="#634b32" letter-spacing="1">音量</text><text x="306" y="186" text-anchor="middle" font-size="7" fill="#634b32" letter-spacing="1">调频</text>
 <rect x="153" y="59" width="92" height="12" rx="2" fill="#e5cf9a"/><text x="199" y="67.5" text-anchor="middle" fill="#695b39" font-size="7" letter-spacing="3">陆记检修</text>
 <path d="M284 50 328 13" stroke="#83908a" stroke-width="4"/><path d="m285 48 44-37" stroke="#e2e6d2" stroke-width="1.4"/>
 </svg>`;}

function connectedTiles(tiles){
 const ports=tiles.map(t=>t.ports.map(p=>(p+t.rot)%4));
 if(!ports[3].includes(3))return new Set();
 const visited=new Set([3]),queue=[3];
 while(queue.length){const i=queue.shift();for(const d of ports[i]){const r=Math.floor(i/3)+[-1,0,1,0][d],c=i%3+[0,1,0,-1][d];if(r<0||r>2||c<0||c>2)continue;const j=r*3+c;if(ports[j].includes((d+2)%4)&&!visited.has(j)){visited.add(j);queue.push(j);}}}
 return visited;
}

export function mountCircuitGame(root,{onComplete}){
 const tiles=structuredClone(CIRCUIT),history=[];let tested=false,solved=false,finished=false;
 root.innerHTML=`<div class="circuit-game">
  <aside class="radio-story"><div class="radio-inventory"><span>旧物档案 / 01</span><span>林婆婆的收音机</span></div>
   <div class="radio-object">${radioIllustration()}<span class="radio-object-caption">旋钮还是旧的，声音也会是。</span></div>
   <div class="radio-ticket"><span class="ticket-fold" aria-hidden="true"></span><span class="radio-eyebrow">外公的检修笺</span><h3>再听一次，熟悉的声音。</h3><p>转动铜线，让线路从左侧的输入端，接到右下角的喇叭。</p><div class="radio-safety"><span aria-hidden="true">✓</span> 已取出电池 · 这是线路拼接示意</div><p class="radio-handwriting">“别急，先找到两端，再看中间。”</p></div>
   <details class="radio-help"><summary>需要一点线索 <span>＋</span></summary><p>从第二行左侧进入，先往上，再穿过顶行，沿右列向下，最后向右出去。空余零件不一定用得上。</p></details>
  </aside>
  <section class="radio-workspace" aria-label="收音机线路维修台">
   <div class="radio-workspace-head"><div><span class="radio-eyebrow">把每一处，轻轻接好</span><h3>声音的来路</h3></div><span class="radio-power"><i></i><span id="radio-power-label">等待测试</span></span></div>
   <div class="radio-board-wrap"><div class="radio-terminal radio-inlet"><span>输入</span><i aria-hidden="true">＋</i></div><div class="radio-terminal radio-outlet"><i aria-hidden="true">♪</i><span>喇叭</span></div>
    <div class="radio-case">${screw}${screw}${screw}${screw}<div class="radio-case-title"><span>陆记 · 线路检修板</span><span>01—09</span></div><div class="circuit-grid">${tiles.map((t,i)=>`<button type="button" class="tile radio-tile" data-tile="${i}" aria-label="第 ${i+1} 块铜线，按 Enter 或空格顺时针转动"><span class="radio-tile-number" aria-hidden="true">0${i+1}</span><svg viewBox="0 0 100 100" aria-hidden="true"><path class="radio-trace-ghost" d="M6 16h16v10M83 78v12h10M20 72v16h20"/><g class="radio-connector"><path class="radio-wire-shadow"/><path class="radio-wire-edge"/><path class="radio-wire-core"/><path class="radio-wire-light"/><g class="radio-ports"></g></g><circle class="radio-joint-rim" cx="50" cy="50" r="11"/><circle class="radio-joint" cx="50" cy="50" r="7"/><path class="radio-joint-slot" d="m47 53 6-6"/></svg></button>`).join('')}</div><div class="radio-case-bottom"><span>转一格，让接点彼此相遇</span><span aria-hidden="true">＋ — · — ＋</span></div></div>
   </div>
   <div class="radio-tools"><span class="radio-turn-hint"><span aria-hidden="true">↻</span> 轻触铜线，顺时针转动</span><div><button type="button" id="circuit-undo" disabled aria-label="撤回上一次转动">↶ 撤回</button><button type="button" id="circuit-reset">重新摆放</button></div></div>
   <div class="radio-response" data-state="idle"><span class="radio-response-symbol" aria-hidden="true">◇</span><div><strong id="radio-response-title">一段熟悉的旋律，正在等你。</strong><p id="puzzle-feedback" role="status" aria-live="polite">拼好后试一试，测试灯会告诉你连接的情况。</p></div></div>
   <div class="radio-actions"><span id="radio-turn-count">还没有转动零件</span><button type="button" class="primary" id="circuit-check">测试连接 <span aria-hidden="true">↗</span></button><button type="button" class="primary" data-activity-continue hidden>把声音送给婆婆 ${arrow}</button></div>
  </section></div>`;
 const game=root.querySelector('.circuit-game'),buttons=[...root.querySelectorAll('[data-tile]')],points=[[50,0],[100,50],[50,100],[0,50]];
 // Anchor the external sockets to the actual second and third grid rows.
 root.querySelectorAll('.radio-terminal').forEach(terminal=>root.querySelector('.circuit-grid').append(terminal));
 const feedback=root.querySelector('#puzzle-feedback'),response=root.querySelector('.radio-response'),title=root.querySelector('#radio-response-title'),check=root.querySelector('#circuit-check'),continuation=root.querySelector('[data-activity-continue]');
 function draw(){
  const connected=tested?connectedTiles(tiles):new Set();
  tiles.forEach((tile,i)=>{
   const b=buttons[i],path=tile.ports.map(p=>`M50 50L${points[p][0]} ${points[p][1]}`).join('');
   b.querySelectorAll('.radio-connector>path').forEach(p=>p.setAttribute('d',path));
   b.querySelector('.radio-ports').innerHTML=tile.ports.map(p=>`<circle cx="${50+(points[p][0]-50)*.82}" cy="${50+(points[p][1]-50)*.82}" r="4"/>`).join('');
   b.querySelector('.radio-connector').style.transform=`rotate(${tile.rot*90}deg)`;
   b.classList.toggle('powered',connected.has(i));b.disabled=solved;
   const directions=['上','右','下','左'];b.setAttribute('aria-label',`第 ${i+1} 块铜线，接点朝${tile.ports.map(p=>directions[(p+tile.rot)%4]).join('和')}；按 Enter 或空格顺时针转动`);
  });
  root.querySelector('#circuit-undo').disabled=!history.length||solved;root.querySelector('#circuit-reset').disabled=solved;
  root.querySelector('#radio-turn-count').textContent=history.length?`已轻轻转动 ${history.length} 次`:'还没有转动零件';
  game.classList.toggle('is-tested',tested);game.classList.toggle('is-solved',solved);
 }
 function clearTest(){tested=false;response.dataset.state='idle';title.textContent='沿着铜线，找到下一个接点。';feedback.textContent='可以随时测试，也可以撤回刚才的一步。';root.querySelector('#radio-power-label').textContent='等待测试';}
 buttons.forEach((b,i)=>{
  b.onclick=()=>{if(solved)return;history.push(i);tiles[i].rot++;clearTest();draw();};
  b.onkeydown=e=>{const offsets={ArrowLeft:-1,ArrowRight:1,ArrowUp:-3,ArrowDown:3};if(e.key in offsets){e.preventDefault();const next=i+offsets[e.key];if(next>=0&&next<9&&(Math.abs(offsets[e.key])===3||Math.floor(next/3)===Math.floor(i/3)))buttons[next].focus();}};
 });
 root.querySelector('#circuit-undo').onclick=()=>{if(!history.length||solved)return;const i=history.pop();tiles[i].rot--;clearTest();draw();buttons[i].focus();};
 root.querySelector('#circuit-reset').onclick=()=>{if(solved)return;tiles.forEach((t,i)=>t.rot=CIRCUIT[i].rot);history.length=0;clearTest();draw();feedback.textContent='零件回到了刚才的摆放。慢慢来，声音还在等你。';buttons[3].focus();};
 check.onclick=()=>{
  if(solved)return;tested=true;solved=circuitConnected(tiles);draw();
  if(solved){response.dataset.state='success';title.textContent='接通了，是小时候的那段旋律。';feedback.textContent='输入端已经连到喇叭。装回电池后，收音机又有了清楚的声音。';root.querySelector('#radio-power-label').textContent='线路接通';check.hidden=true;continuation.hidden=false;continuation.focus({preventScroll:true});}
  else{response.dataset.state='error';title.textContent='还有一处没接上，别着急。';const lit=connectedTiles(tiles);feedback.textContent=lit.size?`亮起的 ${lit.size} 块是已经相连的部分。沿着亮线看看，下一处接点有没有转向它。`:'左侧输入端还没接上。先看看第二行左边那块铜线，是否朝向输入。';root.querySelector('#radio-power-label').textContent='连接待调整';}
 };
 continuation.onclick=()=>{if(finished||!solved)return;finished=true;continuation.disabled=true;onComplete();};
 draw();
}
