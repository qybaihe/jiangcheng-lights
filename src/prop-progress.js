import {isInsidePlayableBounds} from './wuhan-district-layout.js';
// Optional everyday interactions never award main-story flags or ending choices.
export const PROP_IDS = Object.freeze({bicycle:'prop-bicycle', newspaper:'prop-newspaper', ferry:'prop-ferry'});
const EDITIONS = ['beforeRain','afterRain'];
const NOTES = ['window-corner','many-hands'];
const point = value => value && Number.isFinite(value.x) && Number.isFinite(value.z)
  && isInsidePlayableBounds(value.x,value.z,.35)
  ? {x:value.x,z:value.z,...(Number.isFinite(value.yaw)?{yaw:Math.atan2(Math.sin(value.yaw),Math.cos(value.yaw))}:{})} : null;

export function normalizePropProgress(value) {
 const data=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
 return {version:1,bicycleUnlocked:data.bicycleUnlocked===true,bikePosition:point(data.bikePosition),
  readEditions:EDITIONS.filter(id=>Array.isArray(data.readEditions)&&data.readEditions.includes(id)),
  notes:NOTES.filter(id=>Array.isArray(data.notes)&&data.notes.includes(id)),
  ferryRides:Number.isSafeInteger(data.ferryRides)?Math.max(0,Math.min(9999,data.ferryRides)):0};
}

export function updatePropProgress(value,event) {
 const next=normalizePropProgress(value);
 if(event?.type==='borrow')next.bicycleUnlocked=true;
 if(event?.type==='park')next.bikePosition=point(event.position)||next.bikePosition;
 if(event?.type==='read'&&EDITIONS.includes(event.edition)&&!next.readEditions.includes(event.edition))next.readEditions.push(event.edition);
 if(event?.type==='note'&&NOTES.includes(event.id)&&!next.notes.includes(event.id))next.notes.push(event.id);
 if(event?.type==='ferry-complete')next.ferryRides=Math.min(9999,next.ferryRides+1);
 return normalizePropProgress(next);
}

export function currentNewspaperEdition(state) {return state?.flags?.includes('postlude')?'afterRain':'beforeRain';}
export function ferryAvailability(state) {
 const flags=state?.flags||[];
 if(state?.runEnded)return {available:false,title:'这次的行程已经结束',detail:'先完成告别，或回到画廊保存的分岔点。'};
 if((flags.includes('prepared')||flags.includes('checked'))&&!flags.includes('postlude'))return {available:false,title:'晚间预警 · 暂停登船',detail:'渡口已经收起登船板。先把街坊的安排核好，等码头确认复航再来。'};
 if(flags.includes('postlude'))return {available:true,title:'渡口公告 · 近岸短线已确认恢复',detail:'船员确认这一段航线可以出发。只乘近岸往返线；低处步道和配电箱附近仍然绕行。'};
 return {available:true,title:'晴川里渡口 · 近岸往返',detail:'这一班沿汉口岸线走一小段，再回到原来的码头。上船坐稳，把走巷子的脚步交给江风。'};
}

export const PROP_NOTES = Object.freeze({
 'window-corner':{title:'工作台留出的那一角',text:'旧广告里，靠窗的工作台放着一本作业本。回修理铺的时候，再看看那个位置。',target:'shop'},
 'many-hands':{title:'几种不同的笔迹',text:'“桌子若重，喊一声再搬。”便民栏末尾的字迹不一样，像是几个人接着写的。',target:'community'},
});
