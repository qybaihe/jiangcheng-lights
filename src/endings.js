import {normalizeRaceProgress} from './neighborhood-races.js';
import {normalizePhotoProgress} from './photo-alignment.js';
import {isMealRoundComplete} from './meal-relay.js';
import {WUHAN_MEMORIES,getWuhanMemory,isWuhanMemoryEarned,wuhanMemoryGalleryId,wuhanMemoryGalleryItems} from './wuhan-memories.js';
// Ending choices belong to this run; the collection survives revisiting a fork.
export const GALLERY_KEY = 'jiangcheng-lights-gallery-v3';
export const ENDINGS = Object.freeze([
  {id:'true',title:'灯下有你',kind:'真结局',description:'那张桌子留出的地方，原来一直有你的名字。',hint:'把社区安排做完，留到明早，也听小许讲讲那条毛巾。',dialogueKey:'ending',movieId:'ending'},
  {id:'good',title:'明早见',kind:'好结局',description:'有些话不急着说。明早的豆皮，要趁热吃。',hint:'把答应的安排落实，留在巷子里吃下一顿过早。',dialogueKey:'endingGood',movieId:'ending'},
  {id:'neutral',title:'顺路归来',kind:'平常结局',description:'江风跟了一程。下次回来，还有一些话可以问。',hint:'在没有留下过早的约定时，选择先回去。',dialogueKey:'endingNeutral',movieId:null},
  {id:'regret',title:'未赴的约',kind:'遗憾结局',description:'豆皮还留着。只是这一回，你没坐上那张凳子。',hint:'承诺来帮忙之后，在安排落实前离开。',dialogueKey:'endingRegret',movieId:null},
].map(x=>Object.freeze({...x,cg:`/media/ending-v3-${x.id}.webp`})));

const owns=(state,flag)=>Array.isArray(state?.flags)&&state.flags.includes(flag);
const defaultStorage=()=>typeof localStorage==='undefined'?null:localStorage;
export function resolveEnding(state) {
  const choice=state?.storyChoices||{};
  let id='neutral';
  if(owns(state,'checked')&&choice.stay==='breakfast') id=owns(state,'towel')?'true':'good';
  else if(!owns(state,'checked')&&choice.commitment==='help') id='regret';
  return ENDINGS.find(x=>x.id===id);
}

export function loadGallery(storage=defaultStorage()) {
  const empty={version:3,unlocked:{},endings:{},forks:{}};
  try {
    const data=JSON.parse(storage?.getItem(GALLERY_KEY)||'null');
    if(data?.version!==3)return empty;
    for(const key of ['unlocked','endings','forks'])if(!data[key]||typeof data[key]!=='object'||Array.isArray(data[key]))data[key]={};
    return {...empty,...data};
  } catch {return empty;}
}

function persist(data,storage) {
  try {storage?.setItem(GALLERY_KEY,JSON.stringify(data));return true;} catch {return false;}
}

export const MEMORY_GALLERY=Object.freeze([
  ['granny-table','留一只凳子','先坐下来，面要坨了。','granny','granny'],
  ['granny-bamboo','蒲扇没有停','孩子睡熟以后，大人把话放得很轻。','granny','granny'],
  ['chef-lamp','天亮以前','那盏借出去的灯，照见了别人的忙碌。','chef','chef'],
  ['chef-extra-bowl','先盛小饭盒','红盖上那一点白，隔了很多年还认得。','chef','chef'],
  ['dock-shared-box','箱子的另一边','先问一声，再托住另一边。','dock','dock'],
  ['xu-first-shift','第一场值班的雨','记着别人名字的人，也有人记着。','towel','towel'],
  ['ending-reopen','门是一起开的','桌子靠窗，给阿遥留个角。','ending','ending'],
  ['ending-lamplit-child','明天还在这里','一个字写完，大人把声音放轻。','ending','ending'],
].map(([id,title,description,flag,movie])=>Object.freeze({id:`memory-${id}`,memoryId:id,title,description,flag,movie,type:'memory',image:getWuhanMemory(id).image,fallbackImage:`/media/story-v2-cg-${id}.webp`})));

export const ACHIEVEMENT_ART=Object.freeze([
  {id:'photo-shop',title:'门口留着的位置',description:'在真实街巷里，找回照片里的招牌、木窗和修理桌。',hint:'在修理铺巷口完成旧照对景，亲手按下快门。',image:'/media/playful-life-v1/photo-shop.webp',fallbackImage:'/media/arrival.webp',type:'art'},
  {id:'photo-river',title:'没拍全的江城',description:'钟声在左，桥影在右。把这一刻，重新装进旧照片。',hint:'在主巷北端完成江景旧照对景，亲手按下快门。',image:'/media/playful-life-v1/photo-river.webp',fallbackImage:'/media/dock.webp',type:'art'},
  {id:'meal-evening',title:'一口热的',description:'两份食盒交给陈姐，一盅藕汤交给小许。每一份，都有人接住。',hint:'分装并亲手交接傍晚的三份热食。',image:'/media/wuhan-memories-v1/chef-extra-bowl.webp',type:'art'},
  {id:'meal-morning',title:'今早，也记得你',description:'又走过熟悉的巷子，这回换了口味，也记住了名字。',hint:'完成次晨番外的三份过早分装与交接。',image:'/media/wuhan-memories-v1/resident-chef-breakfast-orders.webp',fallbackImage:'/media/chef.webp',type:'art'},
  {id:'race-boat',title:'有人在岸上等你',description:'桨影绕过一圈江风，又划回那声招呼。',hint:'完整通过桨影计时赛的所有浮标。',image:'/media/gallery-river-oars-v1.webp',type:'art'},
  {id:'race-car',title:'路的尽头，是街坊',description:'快一点绕过街区，慢一点停在人面前。',hint:'完整完成一次江城顺路驾驶计时赛。',image:'/media/gallery-road-home-v1.webp',type:'art'},
  {id:'drawing',title:'画里的人',description:'拼回一张歪画，也认出了小时候的自己。',hint:'帮林婆婆拼好旧画页。',image:'/media/story-v3-child-drawing.webp',type:'art'},
  {id:'wuhan',title:'江城拾光',description:'六页日常，连成一座住过的城。',hint:'找到全部六处江城拾光。',image:'/media/gallery-v3-wuhan.webp',type:'art'},
  {id:'neighbors',title:'一件一件，做到一起',description:'收齐之后，还要交到那个人手里。',hint:'完成物资交接、应急准备和社区回执。',image:'/media/gallery-v3-neighbors.webp',type:'art'},
]);

export function collectGallery(state,storage=defaultStorage()) {
  const data=loadGallery(storage), now=new Date().toISOString();
  const unlock=id=>{if(!data.unlocked[id])data.unlocked[id]=now;};
  for(const card of MEMORY_GALLERY)if(owns(state,card.flag))unlock(card.id);
  for(const card of WUHAN_MEMORIES)if(card.kind!=='main'&&isWuhanMemoryEarned(state,card))unlock(wuhanMemoryGalleryId(card.id));
  for(const [id,record] of Object.entries(normalizeRaceProgress(state?.races).courses))if(record.completions>0)unlock('race-'+id);
  for(const id of normalizePhotoProgress(state?.photos).completed)unlock('photo-'+id);
  for(const id of ['evening','morning'])if(isMealRoundComplete(state?.meals,id))unlock('meal-'+id);
  if(owns(state,'granny'))unlock('drawing');
  if(new Set(state?.lore||[]).size>=6)unlock('wuhan');
  if(owns(state,'checked'))unlock('neighbors');
  // Compatibility: old completed runs predate the branching choices, so keep
  // their original ending as an earned collection rather than resetting them.
  if(owns(state,'ending')&&!state?.lastEnding&&!state?.storyChoices?.stay){
    unlock('ending-true');
    data.endings.true??={id:'true',unlockedAt:now,legacy:true};
  }
  data.saved=persist(data,storage);
  return data;
}

export function recordEnding(result,state,storage=defaultStorage()) {
  const entry=ENDINGS.find(x=>x.id===result?.id);
  if(!entry)throw new Error('Unknown ending');
  const data=collectGallery(state,storage),now=new Date().toISOString();
  const record={id:entry.id,unlockedAt:data.endings[entry.id]?.unlockedAt||now,lastPlayedAt:now,choices:{...state.storyChoices},seconds:Math.max(0,Number(state.seconds)||0)};
  data.endings[entry.id]=record; data.unlocked[`ending-${entry.id}`]=record.unlockedAt;
  if(entry.movieId==='ending')for(const id of ['ending-reopen','ending-lamplit-child'])data.unlocked[`memory-${id}`]??=now;
  const fork=structuredClone(state.endingFork||state);
  delete fork.endingFork; delete fork.lastEnding;
  // The snapshot keeps all real work and never invents a completed task.
  fork.flags=(fork.flags||[]).filter(flag=>!['ending','postlude'].includes(flag));
  fork.storyChoices={...fork.storyChoices};delete fork.storyChoices.stay;
  data.forks[entry.id]=fork;
  return {...record,saved:persist(data,storage)};
}

export function resumeEndingFork(storage=defaultStorage(),id) {
  const fork=loadGallery(storage).forks[id];
  if(!fork||fork.version!==1||!Array.isArray(fork.flags))return null;
  return structuredClone(fork);
}

export function galleryItems(state,storage=defaultStorage()) {
  const collection=collectGallery(state,storage);
  const list=[...ENDINGS.map((e,i)=>({...e,type:'ending',image:e.cg,id:`ending-${e.id}`,endingId:e.id,number:i+1})),...MEMORY_GALLERY,...wuhanMemoryGalleryItems(state,collection),...ACHIEVEMENT_ART];
  return list.map(item=>({...item,unlocked:Boolean(collection.unlocked[item.id]),unlockedAt:collection.unlocked[item.id]||null,canResume:Boolean(item.endingId&&collection.forks[item.endingId])}));
}
