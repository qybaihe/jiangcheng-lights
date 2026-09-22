import {getWuhanMemory} from './wuhan-memories.js';
const portrait=id=>`/media/story-v2-portrait-${id}.webp`;
export const STORY_PEOPLE=Object.freeze([
 {id:'player',name:'阿遥',role:'回来的人',object:'修理铺的钥匙',description:'离开武汉七年，带着外公寄来的钥匙，回到那间总有零件声的修理铺。'},
 {id:'grandfather',name:'陆师傅',role:'外公 · 修理铺的主人',object:'工具箱与旧台灯',description:'总记得哪台收音机该送回谁家，却不太会讲自己的难处。如今在外地休养，还惦记着巷口的天气。'},
 {id:'granny',name:'林婆婆',role:'小院里的老街坊',object:'收音机与蒲扇',description:'爱听熟悉的电台，也听得出一个人话里没说完的半句。家门常虚掩着，竹凳留在阴凉处。'},
 {id:'chef',name:'蔡姨',role:'蔡记过早铺',object:'旧灯与铝锅',description:'芝麻酱要拌到碗底，饭要趁热吃。摊子忙起来嘴上催得急，给熟人盛饭时手却总会多停一下。'},
 {id:'dock',name:'周伯',role:'退休轮渡职工',object:'手电与工具箱',description:'在江边干了大半辈子，习惯先看船靠稳，再招呼人上岸。他肯等人，也知道帮忙前该先问一句。'},
 {id:'xu',name:'小许',role:'晴川里社区工作人员',object:'记录本与一条干毛巾',description:'名单上的名字，她尽量都去见过。会认真核对每一通回电，也有忙得顾不上喝水的时候。'},
].map(Object.freeze));

export const STORY_CGS=Object.freeze([
 {id:'granny-table',title:'留一只凳子',chapter:'林婆婆 · 一台收音机',caption:'先坐下来。难处可以慢慢讲。',unlock:'granny'},
 {id:'granny-bamboo',title:'蒲扇没有停',chapter:'林婆婆 · 午后的竹床',caption:'孩子睡熟以后，大人把话放得很轻。',unlock:'granny'},
 {id:'chef-lamp',title:'天亮以前',chapter:'蔡姨 · 第一盏摊灯',caption:'一盏灯，照得见别人手里的活。',unlock:'chef'},
 {id:'chef-extra-bowl',title:'先盛小饭盒',chapter:'蔡姨 · 留着一口热的',caption:'说是顺手，其实一直记得。',unlock:'chef'},
 {id:'dock-shared-box',title:'箱子的另一边',chapter:'周伯 · 江边的往事',caption:'等你点了头，我再帮你一起拿。',unlock:'dock'},
 {id:'xu-first-shift',title:'第一场值班的雨',chapter:'小许 · 也被照顾的人',caption:'初次值夜班，桌角放来了一条干毛巾。',unlock:'towel'},
 {id:'ending-reopen',title:'门是一起开的',chapter:'归家 · 信封里的合影',caption:'有些答案，要走过一条巷子才看得懂。',unlock:'ending'},
 {id:'ending-lamplit-child',title:'那盏灯照着谁',chapter:'归家 · 灯下的孩子',caption:'你以为早已忘了，灯火却还记得。',unlock:'ending'},
].map(item=>Object.freeze({...item,url:getWuhanMemory(item.id).image,fallbackUrl:`/media/story-v2-cg-${item.id}.webp`})));

export const getStoryCG=id=>STORY_CGS.find(cg=>cg.id===id)??null;
export const isCGUnlocked=(state,cg)=>Boolean(cg&&Array.isArray(state?.flags)&&(state.flags.includes(cg.unlock)||(cg.unlock==='towel'&&!state.flags.includes('storyV3')&&state.flags.includes('prepared'))));
export const personPortrait=(id,avatarId='female')=>portrait(id==='player'?(avatarId==='male'?'male':'female'):id);
export const personHeadshot=(id,avatarId='female')=>personPortrait(id,avatarId).replace('-portrait-','-headshot-');
export function speakerPerson(who) {
 if(who==='阿遥')return STORY_PEOPLE[0];
 const id=/外公|陆师傅/.test(who)?'grandfather':/林婆婆/.test(who)?'granny':/蔡姨/.test(who)?'chef':/周伯/.test(who)?'dock':/小许/.test(who)?'xu':null;
 return STORY_PEOPLE.find(person=>person.id===id)??null;
}
