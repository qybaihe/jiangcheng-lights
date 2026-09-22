// Surveyed against makeWorld's physical streets and building footprints.
// Furniture is drawn as furniture; collision boxes are not a map illustration.
import {STREET_COMPOSITION_MAP} from './street-composition.js';
import {ADVENTURE_MAP} from './adventure-layout.js';
import {WUHAN_BUILDINGS,WUHAN_ROADS,WUHAN_PARKING} from './wuhan-district-layout.js';

export const MAP_BOUNDS={width:1480,height:640,minX:-40,minZ:-31,scale:10};
export const mapPoint=p=>({x:(p.x-MAP_BOUNDS.minX)*MAP_BOUNDS.scale,y:(p.z-MAP_BOUNDS.minZ)*MAP_BOUNDS.scale});
const buildings=[
 {x:-13,z:11.4,w:10,d:7,name:'陆记修理',tone:'brick'},
 {x:-29,z:9,w:8,d:6,name:'晴川杂货',tone:'cream'},
 {x:14,z:5.6,w:10,d:7,name:'蔡记过早',tone:'cream'},
 {x:17,z:-10.5,w:12,d:9,name:'街坊之家',tone:'brick'},
 {x:-18,z:-6.1,w:10,d:9,name:'十二号院',tone:'cream'},
 {x:-31,z:-7,w:7,d:7,name:'',tone:'brick'},
 {x:31,z:8,w:8,d:9,name:'汉口茶馆',tone:'cream'},
 {x:-28,z:25,w:11,d:6,name:'',tone:'brick'},
 {x:31,z:29,w:9,d:5,name:'',tone:'cream'},
];
const trees=[[-35,-19,1.25],[-9,-16,1.25],[10,-18,1.2],[38,-14.7,1.10],[-34,0,1.2],[-9,29,.9],[9,29,.9],[23,18,1.25],[-22,19,.9],[7,3,.9],[-33,18,.85]];

const svgText=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]));
const number=value=>Number(value.toFixed(2));
function compositionMapArtwork(features,id,mini){
 const rect=feature=>{
  const b=feature.bounds,p=mapPoint({x:b.minX,z:b.minZ});
  return {x:number(p.x),y:number(p.y),w:number((b.maxX-b.minX)*MAP_BOUNDS.scale),h:number((b.maxZ-b.minZ)*MAP_BOUNDS.scale)};
 };
 const attributes=feature=>`data-map-feature="${svgText(feature.id)}" data-kind="${svgText(feature.kind)}" data-passable="${feature.passable?'true':'false'}"`;
 // Lay the walkable strips first. A ramp shares the street's light paving;
 // only physical walls and the shed receive an opaque structural symbol.
 const layer={pocket:0,lane:1,ramp:2};
 const passages=features.filter(f=>f.passable).sort((a,b)=>(layer[a.kind]??1)-(layer[b.kind]??1)).map(feature=>{
  const {x,y,w,h}=rect(feature),ramp=feature.kind==='ramp',pocket=feature.kind==='pocket';
  const label=feature.mapLabel||(ramp?'坡道':({'tool-lane':'工具巷','breakfast-lane':'过早巷'}[feature.id]||'巷道'));
  const higherAtStart=feature.heightStart>feature.heightEnd;
  const chevrons=ramp?[.25,.5,.75].map(f=>{
   const cy=y+h*f,cx=x+w*.69,half=Math.min(5,w*.19),tip=higherAtStart?-2.4:2.4;
   return `<path d="M${number(cx-half)} ${number(cy-tip)}L${number(cx)} ${number(cy+tip)}L${number(cx+half)} ${number(cy-tip)}"/>`;
  }).join(''):'';
  return `<g class="map-passage ${ramp?'map-ramp':pocket?'map-pocket':'map-alley'}" ${attributes(feature)}><title>${svgText(feature.label)} · 可步行</title><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff8df"/><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${id}-paving)"/>${ramp?`<path d="M${x+.8} ${y+.6}V${y+h-.6}M${x+w-.8} ${y+.6}V${y+h-.6}" fill="none" stroke="#d4bd8c" stroke-width="1"/><g fill="none" stroke="#a78d59" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">${chevrons}</g>`:''}${mini||pocket?'':`<text x="${number(ramp?x+w*.24:x+w/2)}" y="${number(ramp?y+10:y+h-label.length*10-4)}" writing-mode="vertical-rl" font-size="9" letter-spacing="1" fill="#8a805f">${svgText(label)}</text>`}</g>`;
 }).join('');
 const structures=features.filter(f=>!f.passable).map(feature=>{
  const {x,y,w,h}=rect(feature),wall=feature.kind.includes('wall');
  if(feature.kind==='rail'){
   const cx=number(x+w/2);
   return `<g class="map-handrail" ${attributes(feature)}><title>${svgText(feature.label)}</title><path d="M${cx} ${y}V${y+h}M${cx-1.4} ${y+1}h2.8M${cx-1.4} ${y+h-1}h2.8" fill="none" stroke="#9b8966" stroke-width="1.2" stroke-linecap="round"/></g>`;
  }
  if(wall){
   const joints=mini?'':Array.from({length:Math.max(0,Math.floor(h/12)-1)},(_,i)=>`<path d="M${x} ${number(y+(i+1)*12)}h${w}"/>`).join('');
   return `<g class="map-boundary-wall" ${attributes(feature)}><title>${svgText(feature.label)}</title><rect x="${x+1.3}" y="${y+1.3}" width="${w}" height="${h}" fill="#65806b25"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx=".5" fill="#c2bea4" stroke="#8d947c" stroke-width=".7"/><g stroke="#92987f" stroke-width=".6">${joints}</g></g>`;
  }
  const ridge=x+w/2,tiles=mini?'':[.2,.4,.6,.8].map(f=>`<path d="M${x+1} ${number(y+h*f+2)}L${number(ridge)} ${number(y+h*f-2)}L${x+w-1} ${number(y+h*f+2)}"/>`).join('');
  return `<g class="map-shed" ${attributes(feature)}><title>${svgText(feature.label)}</title><rect x="${x+2}" y="${y+3}" width="${w}" height="${h}" rx="1" fill="#486f4d20"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1" fill="#9bafa0" stroke="#65816e" stroke-width="1.1"/><path d="M${number(ridge)} ${y+1}V${y+h-1}" stroke="#627e6c" stroke-width="1.5"/><g fill="none" stroke="#d9e0c7" stroke-width=".9">${tiles}</g><rect x="${number(ridge-4)}" y="${y+h-2}" width="8" height="3" fill="#dfc296" stroke="#958264" stroke-width=".6"/>${mini?'':`<text x="${number(ridge)}" y="${y+12}" writing-mode="vertical-rl" font-size="8.5" letter-spacing="2" fill="#f9f1d3" paint-order="stroke" stroke="#738975" stroke-width="2">${svgText(feature.mapLabel||'工具棚')}</text>`}</g>`;
 }).join('');
 return `<g class="map-street-composition">${passages}${structures}</g>`;
}
function adventureMapArtwork(mini){
 return '<g class="map-adventure-survey">'+ADVENTURE_MAP.map(f=>{
  const b=f.bounds,p=mapPoint({x:b.minX,z:b.minZ}),w=(b.maxX-b.minX)*10,h=(b.maxZ-b.minZ)*10;
  const attr=`data-map-feature="${svgText(f.id)}" data-kind="${f.kind}" data-passable="${f.passable}"`;
  if(f.kind==='pillar')return `<g ${attr}><title>${f.label}</title><rect x="${p.x}" y="${p.y}" width="${w}" height="${h}" rx="1" fill="#b9b696" stroke="#829681" stroke-width="1"/></g>`;
  if(f.kind==='rail')return `<g ${attr}><title>${f.label}</title><path d="M${p.x+w/2} ${p.y+h/2} ${w>h?'h'+w/2+'m-'+w+' 0h'+w/2:'v'+h/2+'m0 -'+h+'v'+h/2}" stroke="#6c8070" stroke-width="1.7" fill="none"/></g>`;
  if(f.kind==='overpass')return `<g ${attr}><title>${f.label} · 门廊下可通行</title><rect x="${p.x}" y="${p.y}" width="${w}" height="${h}" rx="2" fill="#527b70" fill-opacity=".45" stroke="#557a6c" stroke-width="1.2" stroke-dasharray="4 3"/><path d="M${p.x} ${p.y+h/2}h${w}" stroke="#435e52" stroke-width="2"/><rect x="${p.x+7}" y="${p.y+3}" width="11" height="${h-6}" fill="#477363"/><rect x="${p.x+w-18}" y="${p.y+3}" width="11" height="${h-6}" fill="#477363"/>${mini?'':`<text x="${p.x+w+7}" y="${p.y+h/2+4}" font-size="9" fill="#506c59">${f.mapLabel}</text>`}</g>`;
  const ramp=f.kind==='ramp';
  return `<g ${attr}><title>${f.label} · ${ramp?'缓坡步行可达':'高于街面 1.8 米'}</title><rect x="${p.x}" y="${p.y}" width="${w}" height="${h}" fill="${ramp?'#dcc99d':'#d1ba88'}" stroke="#ab9466" stroke-width="1"/>${ramp?[.2,.4,.6,.8].map(t=>`<path d="m${p.x+w/2-4} ${p.y+h*t+3} 4-5 4 5" stroke="#927b51" fill="none"/>`).join(''):Array.from({length:5},(_,i)=>`<path d="M${p.x+3+i*14} ${p.y+1}v${h-2}" stroke="#bba474"/>`).join('')}${mini?'':`<text x="${p.x+w/2}" y="${ramp?p.y+h-12:p.y+h/2+4}" font-size="${ramp?8:11}" text-anchor="middle" fill="#6b6345">${ramp?'缓坡':f.mapLabel}</text>`}</g>`;
 }).join('')+'</g>';
}
function roof(b){const p=mapPoint(b),w=b.w*10,d=b.d*10,x=p.x-w/2,y=p.y-d/2;return `<g class="map-house"><rect x="${x+4}" y="${y+6}" width="${w}" height="${d}" rx="3" fill="#486f4d1f"/><rect x="${x}" y="${y}" width="${w}" height="${d}" rx="3" fill="${b.tone==='brick'?'#dfad91':'#edcf9e'}" stroke="#a98067" stroke-width="1.5"/><path d="M${x-3} ${y+5}L${p.x} ${y-3}L${x+w+3} ${y+5}V${y+d-7}L${p.x} ${y+d+2}L${x-3} ${y+d-7}Z" fill="#829c94" stroke="#527769" stroke-width="1.5"/><path d="M${p.x} ${y}V${y+d}" stroke="#496d62" stroke-width="3"/>${[.2,.4,.6,.8].map(f=>`<path d="M${x} ${y+d*f}L${p.x} ${y+d*f-6}L${x+w} ${y+d*f}" fill="none" stroke="#d4ded0" opacity=".65"/>`).join('')}<rect x="${p.x-8}" y="${y+d-2}" width="16" height="7" rx="1" fill="#f7e9bc" stroke="#947b58"/>${b.name?`<text x="${p.x}" y="${p.y+4}" class="map-building-name">${b.name}</text>`:''}</g>`;}
function coreStreetMapArtwork(id='street',mini=false){return `<defs><pattern id="${id}-paving" width="20" height="14" patternUnits="userSpaceOnUse"><path d="M0 0H20M10 0V7M0 7H20M0 7V14" fill="none" stroke="#cdbf972c" stroke-width="1"/></pattern><pattern id="${id}-water" width="80" height="18" patternUnits="userSpaceOnUse"><path d="M3 10Q18 6 33 10T63 10" fill="none" stroke="#e9f6df" opacity=".5"/></pattern></defs><rect width="800" height="640" rx="12" fill="#eee9cd"/><rect y="47" width="800" height="593" fill="url(#${id}-paving)"/><path d="M0 0H800V43Q520 38 400 43T0 43Z" fill="#91c9c4"/><path d="M0 0H800V38H0Z" fill="url(#${id}-water)"/><path d="M0 46H800" stroke="#d5c39a" stroke-width="9"/><path d="M400 69V623M34 380H766M34 540H766M34 220H766M25 110H775" fill="none" stroke="#d4c19a" stroke-width="44" stroke-linejoin="round"/><path d="M400 69V623" stroke="#fff8df" stroke-width="85"/><path d="M34 380H766M34 540H766M34 220H766" stroke="#fff8df" stroke-width="38"/><path d="M25 110H775" stroke="#fff8df" stroke-width="58"/><path d="M355 70V620M445 70V620" stroke="#c2b58c" stroke-width="2" stroke-dasharray="9 7"/><rect x="165" y="290" width="130" height="70" rx="5" fill="#ded5b3" stroke="#b5ad8b"/><g stroke="#a49f80" stroke-width="2">${[0,1,2,3,4].map(i=>`<path d="M${294+i*7} 322V360"/>`).join('')}</g><path d="M187 290V344H284" fill="none" stroke="#e5c59e" stroke-width="7"/>${compositionMapArtwork(STREET_COMPOSITION_MAP,id,mini)}${buildings.map(roof).join('')}${adventureMapArtwork(mini)}<g fill="#efcf88" stroke="#947e59" stroke-width="1.3"><rect x="230" y="466" width="34" height="12" rx="2"/><rect x="504" y="424" width="52" height="16" rx="2"/><rect x="528" y="461" width="24" height="16" rx="2"/></g><g fill="#8eae8f" stroke="#517e6b" stroke-width="1.4">${trees.map(([x,z,s],i)=>{const p=mapPoint({x,z});return `<g transform="translate(${p.x} ${p.y})"><ellipse cx="4" cy="9" rx="${13*s}" ry="${10*s}" fill="#6a88652e" stroke="none"/><circle cx="0" cy="0" r="${13*s}" fill="${i%2?'#b9c98d':'#9dbd95'}"/><circle cx="-5" cy="-4" r="${8*s}" fill="#d2dcac" stroke="none"/><path d="M0 2V${14*s}" stroke="#7a8964"/></g>`;}).join('')}</g><g stroke="#708774" stroke-width="2"><path d="M218 318H267M221 318V323M237 318V323M254 318V323"/><path d="M485 424H577" stroke="#d6a86d" stroke-width="12" stroke-dasharray="10 8"/></g><path d="M659 32h35l-7 8h-21z" fill="#f9f1d7" stroke="#669798"/><rect x="670" y="25" width="16" height="7" rx="2" fill="#f9f1d7"/>${mini?'':`<g class="map-geography"><text x="402" y="28" text-anchor="middle" letter-spacing="12" fill="#346b70" font-size="17">长 江</text><text x="95" y="118" fill="#867b5d" font-size="13" letter-spacing="4">沿江步道</text><text x="410" y="275" fill="#a49771" writing-mode="vertical-rl" font-size="14" letter-spacing="5">晴川主巷</text><text x="65" y="561" fill="#99866a" font-size="12" letter-spacing="3">南巷</text><g transform="translate(750 570)"><path d="M0 0v-34m-7 11 7-12 7 12" fill="none" stroke="#5a8077" stroke-width="2"/><text y="17" text-anchor="middle" fill="#5a8077" font-size="13">江侧</text></g><text x="29" y="614" fill="#94836a" font-size="11">0</text><path d="M46 607H146M46 603V612M146 603V612" stroke="#94836a" stroke-width="2"/><text x="154" y="614" fill="#94836a" font-size="11">10 米</text></g>`}`;}
export function pathMarkup(route){if(!route?.reachable||!route.path.length)return '';return route.path.map((p,i)=>{const m=mapPoint(p);return `${i?'L':'M'}${m.x.toFixed(1)} ${m.y.toFixed(1)}`;}).join(' ');}
export function playerMarkup(position,heading=0){const p=mapPoint(position);return `<g transform="translate(${p.x} ${p.y})"><circle r="12" fill="#e6a05d" stroke="#fffbed" stroke-width="4"/><path d="M0 -23l-8 12h16z" fill="#98642e" stroke="#fffbed" stroke-width="2" transform="rotate(${heading*180/Math.PI})"/></g>`;}


/** The expanded sheet keeps the original 10px-per-metre survey intact. Every
 * new road and house comes from the same layout that creates the 3D district.
 */
function wuhanDistrictMapArtwork(id,mini){
 const rectangle=(b)=>{const p=mapPoint({x:b.minX,z:b.minZ});return `x="${p.x}" y="${p.y}" width="${(b.maxX-b.minX)*10}" height="${(b.maxZ-b.minZ)*10}"`;};
 const roads=WUHAN_ROADS.map(r=>`<g data-map-feature="${r.id}" data-kind="${r.kind}" data-passable="true"><title>${r.name} · ${r.kind==='road'?'连续车行宽路':'步行街巷'}</title><rect ${rectangle(r)} fill="${r.kind==='plaza'?'#e1d6b0':'#fff8df'}"/><rect ${rectangle(r)} fill="url(#${id}-paving)"/></g>`).join('');
 const roofs=WUHAN_BUILDINGS.filter(b=>b.collide!==false).map(b=>`<g data-map-feature="${b.id}" data-kind="building" data-passable="false">${roof(b)}</g>`).join('');
 const bridge=`<g data-map-feature="wuhan-truss-bridge" data-kind="overpass" data-passable="true"><title>桥影下 · 净空 6 米；桥柱处绕行</title><rect x="1110" y="14" width="100" height="605" rx="3" fill="#779a80" fill-opacity=".32" stroke="#527567" stroke-width="2" stroke-dasharray="6 5"/><path d="M1116 14V619M1204 14V619" stroke="#537564" stroke-width="3"/><path d="${Array.from({length:10},(_,i)=>`M1116 ${16+i*60}l88 30-88 30`).join(' ')}" fill="none" stroke="#75917b" stroke-width="1.2"/>${[-9,9,30].flatMap(z=>[71.3,80.7].map(x=>{const p=mapPoint({x,z});return `<rect x="${p.x-7.6}" y="${p.y-9.6}" width="15.2" height="19.2" fill="#91a38d" stroke="#577e68"/>`;})).join('')}${mini?'':'<text x="1158" y="465" text-anchor="middle" font-size="13" fill="#476b58">桥影下</text>'}</g>`;
 const parking=WUHAN_PARKING.map(b=>{const p=mapPoint(b);return `<g data-map-feature="${b.id}" data-kind="parking" data-passable="true"><title>${b.name} · 停好再下车</title><rect x="${p.x-b.width*5}" y="${p.y-b.depth*5}" width="${b.width*10}" height="${b.depth*10}" rx="2" fill="#e2ddbf" stroke="#bdad7e" stroke-width="1.2"/><text x="${p.x}" y="${p.y+4}" text-anchor="middle" font-size="12" fill="#7c8865">P</text></g>`;}).join('');
 const trees=[[41,-15],[54,-13],[68,16],[82,-15],[93,14],[103,16]].map(([x,z])=>{const p=mapPoint({x,z});return `<g transform="translate(${p.x} ${p.y})"><ellipse cy="7" cx="4" rx="13" ry="10" fill="#59784f25"/><circle r="13" fill="#a2bd92" stroke="#5c846b" stroke-width="1.4"/><circle r="8" cx="-5" cy="-4" fill="#cbd7a5"/></g>`;}).join('');
 const stalls=[[87,3],[87,12]].map(([x,z])=>{const p=mapPoint({x,z});return `<g data-kind="stall" data-passable="false"><rect x="${p.x-24.5}" y="${p.y-10}" width="49" height="20" rx="2" fill="#c5b48a" stroke="#927e54"/><path d="M${p.x-24.5} ${p.y+6}h49" stroke="#e9d4a4" stroke-width="8" stroke-dasharray="7 6"/></g>`;}).join('');
 return `<g class="map-wuhan-extension"><rect x="798" width="682" height="640" fill="#eee9cd"/><rect x="798" y="47" width="682" height="593" fill="url(#${id}-paving)"/><path d="M798 0H1480V43Q1230 38 798 43Z" fill="#91c9c4"/><path d="M798 0H1480V38H798Z" fill="url(#${id}-water)"/><path d="M798 46H1480" stroke="#d5c39a" stroke-width="9"/>${roads}${parking}${roofs}${bridge}${stalls}<g>${trees}</g><path d="M800 62H1456" stroke="#8ba28b" stroke-width="2" stroke-dasharray="12 6"/>${mini?'':`<g class="map-geography"><text x="1140" y="28" text-anchor="middle" letter-spacing="12" fill="#346b70" font-size="17">长 江</text><text x="932" y="560" fill="#95805d" font-size="13" letter-spacing="3">燕归路 · 可驾车</text><text x="1000" y="114" text-anchor="middle" fill="#8a7e5b" font-size="12">滨江路</text><text x="1323" y="462" text-anchor="middle" font-size="13" fill="#927a54">街坊市集</text><text x="966" y="352" text-anchor="middle" font-size="12" fill="#8a7e5b">里分横巷</text><text x="1408" y="290" writing-mode="vertical-rl" fill="#94825d" font-size="13" letter-spacing="4">轮渡回车路</text><text x="815" y="628" fill="#94836a" font-size="11">虚构滨江街区 · 里分、过早、桥影与轮渡的武汉日常</text></g>`}</g>`;
}
export function streetMapArtwork(id='street',mini=false){
 return `${coreStreetMapArtwork(id,mini)}${wuhanDistrictMapArtwork(id,mini)}`;
}
