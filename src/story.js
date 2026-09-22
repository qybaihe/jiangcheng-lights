import {normalizeRaceProgress} from './neighborhood-races.js';
import {normalizeVehicleGuideProgress} from './vehicle-guide-progress.js';
import {normalizeWuhanVisits} from './wuhan-visit-progress.js';
import {normalizeResidentProgress} from './resident-stories.js';
import {normalizeCarProgress} from './car-progress.js';
import {STORY_V3_DIALOGUES,STORY_V3_EXTRA_DIALOGUES,STORY_V3_META} from './story-v3-data.js';
import {AUDIO_DEFAULTS,audioPreferences,soundPreferences} from './audio-director.js';
import {getAvatarOption} from './avatar-catalog.js';
import {normalizeAdventureState} from './adventure.js';
import {normalizePropProgress} from './prop-progress.js';
import {normalizePhotoProgress} from './photo-alignment.js';
import {normalizeMealProgress} from './meal-relay.js';
export const SAVE_KEY = 'jiangcheng-lights-v1';
export const START = {x: 1, z: 21};
export const POIS = [
  {id:'shop', name:'外公的修理铺', label:'修理铺', x:-9.5, z:17, icon:'lamp', color:'#e8bd77'},
  {id:'granny', name:'林婆婆的小院', label:'林婆婆', x:-17, z:0.7, icon:'radio', color:'#d1b2aa'},
  {id:'chef', name:'蔡姨的过早铺', label:'蔡记过早', x:10, z:12, icon:'bowl', color:'#e8bd77'},
  {id:'dock', name:'轮渡边的周伯', label:'周伯', x:22, z:-20, icon:'boat', color:'#a9c9c2'},
  {id:'community', name:'晴川里社区小屋', label:'社区小屋', x:12, z:-3, icon:'heart', color:'#a9c9c2'},
  {id:'box', name:'杂货铺的保温箱', label:'保温箱', x:-28, z:15, icon:'box', color:'#c2bea2', supply:'box'},
  {id:'water', name:'巷口的饮用水', label:'饮用水', x:25, z:24, icon:'drop', color:'#c2bea2', supply:'water'},
  {id:'battery', name:'雨棚下的备用电池', label:'备用电池', x:-27, z:-13, icon:'bolt', color:'#c2bea2', supply:'battery'},
  {id:'riskWater', name:'江边临水通道', label:'临水通道', x:4, z:-23, icon:'alert', color:'#dfa07c', risk:true},
  {id:'riskCable', name:'旧配电箱旁的积水', label:'配电箱', x:26, z:1, icon:'alert', color:'#dfa07c', risk:true},
  {id:'clock', name:'江汉关的钟声', label:'钟声', x:-23, z:-22, icon:'spark', color:'#d9cba7', lore:'clock'},
  {id:'noodles', name:'武汉人的过早', label:'过早', x:13, z:21, icon:'spark', color:'#d9cba7', lore:'noodles'},
  {id:'ferry', name:'江上的轮渡', label:'轮渡', x:29, z:-15, icon:'spark', color:'#d9cba7', lore:'ferry'},
  {id:'bridge', name:'一桥飞架南北', label:'长江大桥', x:0, z:-18, icon:'spark', color:'#d9cba7', lore:'bridge'},
  {id:'brick', name:'红砖墙里的日常', label:'老街', x:-25, z:5, icon:'spark', color:'#d9cba7', lore:'brick'},
  {id:'photo', name:'修理铺的旧合影', label:'旧相片', x:-8, z:26, icon:'spark', color:'#d9cba7', lore:'photo'},
];
export const SUPPLIES = {box:'保温箱',water:'瓶装饮用水',battery:'备用电池'};
const HELP_FLAGS = ['granny','chef','dock'];
const RISK_FLAGS = ['riskWater','riskCable'];
const SUPPLY_ROUTES = {
  box: { location:'西侧杂货铺门前', hint:'沿西侧公共主巷走到杂货铺，取走约好的空保温箱。' },
  water: { location:'南边巷口', hint:'在南巷收好约定的密封饮用水，再交给蔡姨统一核对。' },
  battery: { location:'北边雨棚下', hint:'沿干燥主巷到北边雨棚，领取给手电配套的备用电池。' },
};
export function freshState(){return {version:1, started:false, races:normalizeRaceProgress(), vehicleGuides:normalizeVehicleGuideProgress(), wuhanVisits:[], adventure:normalizeAdventureState(), props:normalizePropProgress(), cars:normalizeCarProgress(), residents:normalizeResidentProgress(), photos:normalizePhotoProgress(), meals:normalizeMealProgress(), storyChoices:{}, flags:[], supplies:[], lore:[], position:{...START}, seconds:0, milestones:{}, settings:{...soundPreferences(),reduced:false,quality:'high',avatarId:'female',...AUDIO_DEFAULTS}};}
export function has(s,f){return s.flags.includes(f);}
export function addFlag(s,f){if(!has(s,f))s.flags.push(f); return s;}
function canAdvance(s,id){
  if(has(s,id))return true;
  switch(id){
    case 'radio':return has(s,'received');
    case 'granny':case 'chefRequested':case 'dock':return has(s,'radio');
    case 'chef':return has(s,'chefRequested')&&Object.keys(SUPPLIES).every(k=>s.supplies.includes(k));
    case 'prepared':return HELP_FLAGS.every(f=>has(s,f));
    case 'riskWater':case 'riskCable':return has(s,'prepared');
    case 'checked':return has(s,'prepared')&&RISK_FLAGS.every(f=>has(s,f));
    case 'ending':return has(s,'checked');
    default:return true;
  }
}
export function act(s,action){
  const n = structuredClone(s);
  if(action.type==='flag' && canAdvance(n,action.id)&&!has(n,action.id)){
    addFlag(n,action.id);
    n.milestones={...n.milestones,[action.id]:Number.isFinite(n.seconds)&&n.seconds>=0?n.seconds:0};
  }
  if(action.type==='supply' && has(n,'chefRequested') && SUPPLIES[action.id] && !n.supplies.includes(action.id)) n.supplies.push(action.id);
  if(action.type==='lore' && LORE[action.id] && !n.lore.includes(action.id))n.lore.push(action.id);
  if(action.type==='start')n.started=true;
  return n;
}
export function chapter(s){ if(has(s,'ending'))return 4;if(has(s,'prepared'))return 3;if(has(s,'granny')&&has(s,'chef')&&has(s,'dock'))return 2;if(has(s,'radio'))return 1;return 0; }
export const CHAPTERS = ['一 · 回来的人','二 · 街坊的名字','三 · 雨来以前','四 · 灯火里的答案','尾声 · 江城有灯'];
function task(step,action,title,desc,target,hint=desc){return {step,action,title,desc,target,location:POIS.find(p=>p.id===target)?.name||'晴川里',hint};}
export function objective(s){
  if(has(s,'ending'))return task('free-exploration','explore','每一盏灯，都在等一个人',`继续在江边走走吧。江城拾光已收集 ${s.lore.length}/6。`,null,'可以拜访街坊、补收江城拾光，或在手账里重看已解锁的旧物记忆。');
  if(!has(s,'received'))return task('receive','read','推开那扇熟悉的门','走近外公的修理铺，接通外公的电话，看看工作台上的旧物。','shop');
  if(!has(s,'radio'))return task('repair-radio','repair','让收音机重新响起来','在修理铺接通旧收音机的电路。','shop','旋转铜线，让左侧入口连到右下出口；完成后把收音机送还林婆婆。');
  if(!has(s,'granny'))return task('visit-granny','visit','给婆婆送去熟悉的声音','把收音机送到西边的小院，再帮婆婆拼回小时候的画页。','granny','小院在西侧公共台阶旁；说完往事后，记下婆婆与社区约好的关照安排。');
  if(!has(s,'chefRequested')&&!has(s,'chef'))return task('receive-chef-request','visit','巷子里还有一口热的','把旧灯交给蔡姨，听她说说雨前热食需要什么。','chef','先和蔡姨确认领取安排，再取街坊约好存放的保温箱、饮用水和电池。');
  if(!has(s,'chef')){
    const missing=Object.keys(SUPPLIES).filter(k=>!s.supplies.includes(k));
    if(missing.length){const id=missing[0],route=SUPPLY_ROUTES[id];return task(`collect-${id}`,'collect',`帮蔡姨备齐物资 · ${3-missing.length}/3`,`前往${route.location}领取${SUPPLIES[id]}。`,id,route.hint);}
    return task('deliver-supplies','deliver','把物资送到过早铺','三样东西都已收好。交给蔡姨核对，听她确认热食送达安排。','chef','收齐不等于交付；回到过早铺完成交接，社区才会收到热食准备的消息。');
  }
  if(!has(s,'dock'))return task('visit-dock','visit','江边，有个人在等你','把外公修好的手电交给北边码头的周伯。','dock','在干燥的公共通道上与周伯交谈；收好旧信封，并确认他愿意协助社区联络。');
  if(!has(s,'prepared'))return task('prepare-kit','prepare','把一个人的忙碌变成大家的准备','把关照名单、热食和周伯的联络安排带回社区，再核对应急包。','community','基础应急包选择五项实用物资，按说明判断，不能随意给别人用药。');
  const risksDone=RISK_FLAGS.filter(f=>has(s,f)).length;
  if(!has(s,'riskWater'))return task('observe-water','observe',`确认公共通道的风险 · ${risksDone}/2`,'从安全的主路观察江边低处入口，当场把位置发给小许。','riskWater','站在干燥处用手机报告，等小许回复。不要走近水边或涉水。');
  if(!has(s,'riskCable'))return task('observe-cable','observe',`确认公共通道的风险 · ${risksDone}/2`,'在干燥主路上远远观察东巷配电箱旁的积水，当场把位置发给小许。','riskCable','不涉水、不碰设备，也不尝试搬物或维修。发出消息后等小许回复。');
  if(!has(s,'checked'))return task('report-risks','report','回社区核对街坊到达情况','两处位置已发给小许。回社区，确认街坊是否都到了。','community','沿干燥主巷返回。风险交给专业人员处理，和小许核对名单后再回家。');
  return task('read-envelope','return','回家，把灯点上','街坊已报平安。沿干燥主巷回修理铺，打开周伯的旧信封看看照片。','shop','回到室内看看旧照片，再给外公打个电话。');
}
export function isAvailable(s,p){if(!p)return false;if(p.lore)return true;if(p.supply)return has(s,'chefRequested')&&!s.supplies.includes(p.id);if(p.risk)return has(s,'prepared')&&!has(s,p.id);return true;}
export function availabilityHint(s,p){
  if(!p)return '';
  if(p.supply){
    if(s.supplies.includes(p.id))return has(s,'chef')?'这份物资已经交给蔡姨，交付记录留在手账里。':'这份物资已经收好，回到过早铺时一起交给蔡姨。';
    if(!has(s,'received'))return '先去修理铺接外公的电话，看看工作台上的旧物。';
    if(!has(s,'chefRequested'))return '这些物资有各自的主人。先去过早铺，和蔡姨确认领取安排。';
    return SUPPLY_ROUTES[p.id]?.hint||'领取约好的物资，再交给蔡姨核对。';
  }
  if(p.risk)return !has(s,'prepared')?'先到社区了解安排并完成应急包核对，再从安全位置观察。':has(s,p.id)?'位置已发给小许。继续保持距离，处理交给专业人员。':'只从安全的干燥通道观察，不涉水、不触碰设备。';
  return '';
}
export function loadState(storage){try{
  const v=JSON.parse(storage.getItem(SAVE_KEY));if(v?.version!==1)return freshState();const d=freshState();
  const flags=Array.isArray(v.flags)?[...new Set(v.flags.filter(x=>typeof x==='string'))]:[];
  const milestones=v.milestones&&typeof v.milestones==='object'&&!Array.isArray(v.milestones)?Object.fromEntries(Object.entries(v.milestones).filter(([id,time])=>flags.includes(id)&&Number.isFinite(time)&&time>=0)):{};
  return {...d,...v,races:normalizeRaceProgress(v.races),vehicleGuides:normalizeVehicleGuideProgress(v.vehicleGuides),wuhanVisits:normalizeWuhanVisits(v.wuhanVisits),adventure:normalizeAdventureState(v.adventure),props:normalizePropProgress(v.props),cars:normalizeCarProgress(v.cars),residents:normalizeResidentProgress(v.residents),photos:normalizePhotoProgress(v.photos),meals:normalizeMealProgress(v.meals),flags,supplies:Array.isArray(v.supplies)?[...new Set(v.supplies.filter(x=>SUPPLIES[x]))]:[],lore:Array.isArray(v.lore)?[...new Set(v.lore.filter(x=>LORE[x]))]:[],position:Number.isFinite(v.position?.x)&&Number.isFinite(v.position?.z)?v.position:d.position,seconds:Number.isFinite(v.seconds)&&v.seconds>=0?v.seconds:0,milestones,settings:{...d.settings,...v.settings,...audioPreferences(v.settings),...soundPreferences(v.settings),avatarId:getAvatarOption(v.settings?.avatarId).id}};
}catch{return freshState();}}
export const LORE = {
  clock:{title:'江汉关的钟声',subtitle:'江汉关的钟声',text:"钟声传来，阿遥抬了一下头。小时候，外公一喊回家，总要先问一句：“听见钟没？”阿遥不是没听见，是还想多玩一会儿。",quote:''},
  noodles:{title:'过早，要拌匀了',subtitle:'过早',text:"蔡姨把芝麻酱往碗底一浇，筷子递过来：“先拌匀，结成坨了不好吃。”阿遥拌了两下。她看一眼：“底下，还有。”",quote:''},
  ferry:{title:'轮渡靠岸的时候',subtitle:'轮渡',text:"夹在旧相片里的船票折了一个角。小时候怕丢，阿遥一路攥着，到岸时字都沾在手心。票倒没丢，回来找了半天书包。",quote:''},
  bridge:{title:'一桥飞架南北',subtitle:'长江大桥',text:"远处是熟悉的钢桁架。阿遥小时候坐船，总数桥影，数到一半就有人问饿不饿。隔了这么多年，还是没数完。",quote:''},
  brick:{title:'墙上有一道旧水痕',subtitle:'里分与竹床',text:"天井的竹床撤进屋了，地上还留着床脚的浅印。夏天挨家摆出来，要给中间留条路。有人经过，床上的人就把腿收一收。",quote:''},
  photo:{title:'相片里的江风',subtitle:'轮渡合影',text:"照片裁歪了，留下半张椅子，没留下阿遥指的那片对岸。外公站在后面，手垫着窗框角。两个人的头发往同一边倒。",quote:''},
};
export const DIALOGUES = STORY_V3_DIALOGUES;
export const EXTRA_DIALOGUES = STORY_V3_EXTRA_DIALOGUES;
export const STORY_META = STORY_V3_META;
export const MEMORY_ORDER = [
 {id:'close',title:'画页 · 左上',text:'左上角的门框接向桌沿，纸边留下阿遥的铅笔线。'},
 {id:'bowl',title:'画页 · 右上',text:'右上角的饭碗放在桌上，沿着同一条桌沿接回去。'},
 {id:'talk',title:'画页 · 左下',text:'左下角的凳脚连到地面，铅笔线与上面的门框对齐。'},
 {id:'open',title:'画页 · 右下',text:'右下角是歪歪扭扭的阿遥签名，接好后画页完整了。'},
];
export const PACK_ITEMS = [
 {id:'water',name:'密封饮用水',detail:'便于携带，保障基本饮水。',good:true},
 {id:'light',name:'手电与备用电池',detail:'提供可靠照明，按设备要求安装电池。',good:true},
 {id:'food',name:'方便食用的包装食品',detail:'检查保质期，照顾个人饮食限制。',good:true},
 {id:'aid',name:'基础急救用品',detail:'纱布、敷料等；使用仍需要正确知识。',good:true},
 {id:'contact',name:'防水联系卡与充电宝',detail:'保留必要联系方式，手机及时补电。',good:true},
 {id:'candle',name:'蜡烛与火柴',detail:'存在明火风险；有可靠手电时优先用手电。',good:false},
 {id:'heavy',name:'沉重的纪念摆件',detail:'占用空间和负重，应优先保障基本需要。',good:false},
 {id:'pills',name:'来历不明的散装药片',detail:'无法确认药物与用途，不能随意使用。',good:false},
];
export function validPack(ids){return ids.length===5 && new Set(ids).size===5 && ids.every(id=>PACK_ITEMS.some(x=>x.id===id&&x.good));}
// Pipes have N/E/S/W ports; current rotation is clockwise quarter-turns.
export const CIRCUIT = [
 {ports:[1,2],rot:1},{ports:[1,3],rot:1},{ports:[2,3],rot:2},
 {ports:[0,3],rot:1},{ports:[1,2],rot:3},{ports:[0,2],rot:1},
 {ports:[0,1],rot:2},{ports:[0,3],rot:1},{ports:[0,1],rot:1},
];
export function circuitConnected(tiles){
 const ports=tiles.map(t=>t.ports.map(p=>(p+t.rot)%4));
 if(!ports[3].includes(3))return false;
 const seen=new Set([3]),todo=[3];
 while(todo.length){const i=todo.shift();if(i===8&&ports[i].includes(1))return true;for(const d of ports[i]){const row=Math.floor(i/3),col=i%3;const nr=row+[-1,0,1,0][d],nc=col+[0,1,0,-1][d];if(nr<0||nr>2||nc<0||nc>2)continue;const ni=nr*3+nc;if(ports[ni].includes((d+2)%4)&&!seen.has(ni)){seen.add(ni);todo.push(ni);}}}return false;
}
