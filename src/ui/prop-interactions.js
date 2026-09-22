import {ferryAvailability,PROP_NOTES,currentNewspaperEdition} from '../prop-progress.js';
import {NEWSPAPER_EDITIONS} from '../newspaper-data.js';

export const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function propAction(prop,state,mode='walk') {
 if(mode==='boat')return {title:'收桨，回到码头',detail:'F 回岸 · W 划桨 · S 减速 · A/D 转向'};
 if(prop?.propType==='boat')return {title:'借小木船，亲手划一段',detail:'周伯在码头等你 · 自由划船，也可参加桨影计时赛'};
 if(prop?.propType==='race')return {title:'看看江城顺路赛',detail:'先坐进车里，开到燕归路起点 · 顺序通过路标后留下成绩'};
 if(mode==='car')return {title:'停好车，下车走走',detail:'F 下车 · W/S 前后 · A/D 转向'};
 if(prop?.propType==='car')return {title:'驾驶'+(prop.name||prop.label),detail:'走进驾驶座 · 车轮转向 · 停在哪里，下次就在哪里找'};
 if(mode==='bicycle')return {title:'停好自行车',detail:'F 下车 · W/S 前后 · A/D 转向'};
 if(prop?.propType==='bicycle'||prop?.id==='prop-bicycle')return {title:state.props?.bicycleUnlocked?'骑上自行车':'借用外公的自行车',detail:'车闸已经调好，沿公共主巷骑一段'};
 if(prop?.propType==='newspaper'||prop?.id==='prop-newspaper')return {title:'坐下来，翻一翻小报',detail:'椅子、茶杯，还有街坊留下的新消息'};
 const availability=ferryAvailability(state);
 return {title:availability.available?'看看这班渡船':availability.title,detail:availability.detail};
}

/** A 0–40 km/h town-speed dial. Reverse travel still reads as a positive speed. */
export function vehicleSpeedReading(speed=0) {
 const kmh=Math.round(Math.abs(Number.isFinite(speed)?speed:0)*3.6);
 return {kmh,angle:-120+Math.min(kmh,40)*6,max:40};
}

export function vehicleSpeedDialMarkup() {
 const point=(angle,radius)=>{const a=angle*Math.PI/180;return `${(50+Math.sin(a)*radius).toFixed(2)} ${(50-Math.cos(a)*radius).toFixed(2)}`;};
 const ticks=Array.from({length:21},(_,i)=>{const angle=-120+i*12;return `<path d="M${point(angle,i%5===0?33:37)}L${point(angle,41)}" class="${i%5===0?'major':'minor'}"/>`;}).join('');
 const labels=[0,10,20,30,40].map((n,i)=>{const [x,y]=point(-120+i*60,28).split(' ');return `<text x="${x}" y="${y}">${n}</text>`;}).join('');
 return `<span class="bicycle-speed" role="meter" aria-label="车速" aria-valuemin="0" aria-valuemax="40" aria-valuenow="0" aria-valuetext="0 公里每小时"><svg class="vehicle-speed-dial" viewBox="0 0 100 100" fill="none" aria-hidden="true"><circle class="dial-rim" cx="50" cy="50" r="48"/><circle class="dial-face" cx="50" cy="50" r="44"/><g class="dial-ticks">${ticks}</g><g class="dial-labels">${labels}</g><path class="dial-signature" d="M38 85h24m-19 3h14"/><g class="vehicle-speed-needle"><path class="needle-tail" d="M48.7 59 50 19 51.3 59Z"/><path class="needle-tip" d="M50 14 52 27h-4Z"/><circle cx="50" cy="50" r="4"/></g><circle class="dial-cap" cx="50" cy="50" r="2"/></svg><span class="vehicle-speed-readout"><b>0</b><small>km/h</small></span></span>`;
}

export function mountPropHUD({parent,getWorld,getState,isModal,onUse,onGuide}) {
 const button=document.createElement('button');button.id='prop-interact';button.className='prop-interact';button.hidden=true;
 button.innerHTML='<kbd>F</kbd><span><strong></strong><small></small></span><i aria-hidden="true">↗</i>';parent.append(button);
 const riding=document.createElement('aside');riding.id='bicycle-status';riding.className='bicycle-status';riding.hidden=true;
 riding.innerHTML=vehicleSpeedDialMarkup()+'<div class="vehicle-status-copy"><span class="vehicle-status-label" aria-hidden="true">晴川里 · 顺路的风</span><strong>借一阵顺路的风</strong><small>W/S 前后 · A/D 转向 · 空格按铃 · F 停车</small></div>';parent.append(riding);
 button.onclick=onUse;
 const title=button.querySelector('strong'),detail=button.querySelector('small'),vehicleName=riding.querySelector('div>strong'),vehicleKeys=riding.querySelector('div>small'),meter=riding.querySelector('.bicycle-speed'),number=riding.querySelector('b'),needle=riding.querySelector('.vehicle-speed-needle');
 let signature='',vehicleSignature='',lastSpeed=-1;
 return {update(){
  const world=getWorld();if(!world)return;
  const runtime=world.getPropState?.()||{mode:'walk'},near=world.getNearbyProp?.(),state=getState();
  const available=world.active&&!isModal()&&!state.runEnded;
  button.hidden=!available||(!near&&!['bicycle','car','boat'].includes(runtime.mode));riding.hidden=!available||!['bicycle','car','boat'].includes(runtime.mode);
  if(!riding.hidden){
   const key=runtime.mode+(runtime.carName||runtime.name||'');
   if(key!==vehicleSignature){vehicleName.textContent=runtime.mode==='boat'?'把一程江风划回来':runtime.mode==='car'?(runtime.carName||runtime.name||'沿街慢行'):'借一阵顺路的风';vehicleKeys.textContent=runtime.mode==='boat'?'W 划桨 · S 减速／倒划 · A/D 转向 · F 回岸':runtime.mode==='car'?'W/S 前后 · A/D 转向 · 空格鸣笛 · F 停车':'W/S 前后 · A/D 转向 · 空格按铃 · F 停车';riding.dataset.mode=runtime.mode;meter.setAttribute('aria-label',runtime.mode==='boat'?'航速':'车速');vehicleSignature=key;}
   const reading=vehicleSpeedReading(runtime.speed??world.moveSpeed??0);
   if(reading.kmh!==lastSpeed){number.textContent=String(reading.kmh);needle.style.transform=`rotate(${reading.angle}deg)`;meter.setAttribute('aria-valuenow',String(Math.min(reading.kmh,reading.max)));meter.setAttribute('aria-valuetext',`${reading.kmh} 公里每小时`);riding.dataset.speed=String(reading.kmh);lastSpeed=reading.kmh;}
  }
  if(!button.hidden){const action=propAction(near,state,runtime.mode),key=action.title+action.detail;if(key!==signature){title.textContent=action.title;detail.textContent=action.detail;signature=key;}}
 },dispose(){button.remove();riding.remove();}};
}

export function propGuideMarkup(state,anchors) {
 const descriptions={boat:['亲手划一程江风','小木船由你掌舵。W 划桨、A/D 转向，F 回岸；沿浮标还可以参加桨影计时赛。'],race:['街坊的顺路赛','驾驶车辆沿宽路依次经过路标，把一圈江城日常记成自己的成绩。'],car:['沿街慢慢开','走进驾驶座，开去巷子的另一头。人多的地方慢一点，停好后再下车聊聊。'],bicycle:['顺路的风','借到车以后，可以更快地穿过主巷。停在哪里，下次就去哪里找。'],newspaper:['坐一会儿再走','纸页里的消息会随着这一天变化。有些小事，可以顺手记进手账。'],ferry:['把脚步交给江风','乘一班近岸往返船，在江上看钟楼与桥影。不是去另一张地图。']};
 const progress=state.props||{};
 return `<div class="prop-guide-intro"><p>不是每一件东西，都只用来从旁边经过。</p><small>走近后按 F 使用道具，E 仍然留给街坊与委托。</small></div><div class="prop-guide-grid">${anchors.map(prop=>{const type=prop.propType,copy=descriptions[type]||['巷中小事','慢一点，看看。'];return `<article class="prop-guide-card" data-prop-card="${type}"><div class="prop-sketch ${type}" aria-hidden="true">${propSketch(type)}</div><small>${escapeHTML(prop.label)}</small><h3>${copy[0]}</h3><p>${copy[1]}</p><span class="prop-guide-status">${type==='bicycle'?(progress.bicycleUnlocked?'已借用 · 随停随骑':'可借用 · 无需消耗物资'):type==='boat'?'晴日近岸开放 · 可自由划行':type==='race'?'完整经过路线后，解锁纪念画':type==='car'?'驾驶/停放位置随本周目保存':type==='newspaper'?`已读 ${progress.readEditions?.length||0} / 2 期`:`完成往返 ${progress.ferryRides||0} 次`}</span><button data-prop-route="${prop.id}">去${escapeHTML(prop.label)} <span>↗</span></button></article>`;}).join('')}</div><section class="prop-notebook"><h3>从纸页里记下的小事</h3>${progress.notes?.length?progress.notes.map(id=>{const note=PROP_NOTES[id];return note?`<button data-prop-note="${id}"><span><strong>${note.title}</strong><small>${note.text}</small></span><i>↗</i></button>`:'';}).join(''):'<p>坐下翻到小报的夹页。有些消息，适合留着下次见面再问。</p>'}</section>`;
}

function propSketch(type) {
 const path=(type==='car'||type==='race')?'<path d="M26 70V48l18-5 14-22h47l22 23h14v26H26ZM47 43h76M77 24v19M26 58h15m82 0h18"/><circle cx="49" cy="71" r="12"/><circle cx="119" cy="71" r="12"/>':type==='bicycle'?'<circle cx="39" cy="65" r="22"/><circle cx="123" cy="65" r="22"/><path d="m39 65 24-40 25 40H39l19-32h48l17 32M88 65l18-47h13M55 24h18"/>':type==='newspaper'?'<path d="M35 17h83v76H35zM118 31h14v55q0 7-7 7M45 32h62M46 45h25v24H46zM81 46h25M81 57h25M81 68h25M45 81h62"/>':'<path d="m29 62 26 21h66l23-21zM51 60V35h69v25M61 35V23h47v12M66 43v10m19-10v10m19-10v10M18 94q12-9 23 0t23 0 23 0 23 0 23 0 23 0"/>';
 return `<svg viewBox="0 0 170 110" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">${path}</svg>`;
}

function articleMarkup(article) {
 return `<article class="newspaper-story"><small>${escapeHTML(article.deck||'街坊消息')}</small><h3>${escapeHTML(article.headline)}</h3>${(article.body||[]).map(line=>`<p>${escapeHTML(line)}</p>`).join('')}</article>`;
}

export function mountNewspaper(root,{state,onClose,onRead,onNote}) {
 const key=currentNewspaperEdition(state),edition=NEWSPAPER_EDITIONS[key];let page=0;
 const noteId=key==='beforeRain'?'window-corner':'many-hands';let noted=state.props?.notes?.includes(noteId);
 function render(){
  root.innerHTML=`<section class="newspaper-reader" role="dialog" aria-modal="true" aria-label="坐在椅子上读晴川里小报"><div class="newspaper-top"><span>桌边阅读 · ${escapeHTML(edition.issueLabel)}</span><button id="newspaper-stand" aria-label="收起报纸并站起来">收好报纸 ×</button></div><div class="newspaper-masthead"><small>QING CHUAN LI · NEIGHBOURHOOD NOTES</small><h2>${escapeHTML(edition.title||'晴川里小报')}</h2><div><span>${escapeHTML(edition.deck)}</span><b>${page===0?'壹 · 街坊消息':'贰 · 广告夹页'}</b></div></div><div class="newspaper-pages" tabindex="0">${page===0?`<h3 class="newspaper-lead">${escapeHTML(edition.headline)}</h3>${(edition.body||[]).map(p=>`<p class="newspaper-editor">${escapeHTML(p)}</p>`).join('')}<div class="newspaper-columns">${edition.news.map(articleMarkup).join('')}</div>`:`<div class="newspaper-advert">${articleMarkup(edition.advert)}</div><div class="newspaper-pencil"><span>有人在页边划了一道线</span><p>${escapeHTML(typeof edition.evidenceHint==='string'?edition.evidenceHint:edition.evidenceHint?.text)}</p><button id="newspaper-note" ${noted?'disabled':''}>${noted?'✓ 已记下这件小事':'把这件小事记进手账 ↗'}</button></div><p class="newspaper-fiction">${escapeHTML(edition.fictionNotice)}</p>`}</div><footer><span>拖动左侧街景，仍能看看四周</span><div><button id="newspaper-prev" ${page===0?'disabled':''} aria-label="上一页">←</button><b>${page+1} / 2</b><button id="newspaper-next" ${page===1?'disabled':''} aria-label="下一页">→</button></div></footer></section>`;
  root.querySelector('#newspaper-stand').onclick=onClose;
  root.querySelector('#newspaper-prev').onclick=()=>{page=0;render();root.querySelector('#newspaper-next').focus();};
  root.querySelector('#newspaper-next').onclick=()=>{page=1;onRead(key);render();root.querySelector('#newspaper-note').focus();};
  const note=root.querySelector('#newspaper-note');if(note)note.onclick=()=>{noted=true;onNote(noteId);render();root.querySelector('#newspaper-stand').focus();};
 }
 render();return {dispose(){root.innerHTML='';}};
}

export function ferryCardMarkup() {
 return '<section class="ferry-card" role="dialog" aria-modal="true" aria-label="江上短途"><small>汉口岸线 · 一班往返</small><h2 id="ferry-scene-title">码头慢慢退到身后</h2><p id="ferry-scene-copy">坐稳了。江汉关就在那一边。</p><div class="ferry-progress" aria-label="渡船行程"><i id="ferry-progress-fill"></i></div><footer><span id="ferry-scene-time">离岸</span><button id="ferry-return">提前靠岸，回到巷子 ↗</button></footer></section>';
}

export function updateFerryCard(root,progress=0) {
 const scenes=[['码头慢慢退到身后','岸上的自行车铃已经听不清了。江汉关就在那一边。'],['江面宽，话可以少一点','桥影从水面掠过。屋檐和窗灯，原来只是岸线上的小小一段。'],['还回到刚才的地方','船头转向熟悉的码头。那张报纸和没办完的事，都还在巷子里。']];
 const index=progress<.3?0:progress<.7?1:2,[title,copy]=scenes[index];
 const heading=root.querySelector('#ferry-scene-title');if(!heading)return;
 if(heading.textContent!==title){heading.textContent=title;root.querySelector('#ferry-scene-copy').textContent=copy;}
 root.querySelector('#ferry-progress-fill').style.width=`${Math.round(Math.min(1,Math.max(0,progress))*100)}%`;
 root.querySelector('#ferry-scene-time').textContent=['离岸','江上','回港'][index];
}
