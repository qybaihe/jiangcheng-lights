import {PLAYFUL_LIFE_DIALOGUES,PLAYFUL_LIFE_SCENES} from './playful-life-dialogues.js';
import {DIALOGUES,EXTRA_DIALOGUES} from './story.js';
import {ENDING_DIALOGUES} from './ending-v3-data.js';

const PLACES_BY_SPEAKER=Object.freeze({林婆婆:'granny',蔡姨:'chef',周伯:'dock',小许:'community'});
const SCENES=Object.freeze({
 ...PLAYFUL_LIFE_SCENES,
 intro:{title:'回来的人',placeId:'shop'},
 granny:{title:'一台收音机',placeId:'granny'},
 grannyMemory:{title:'一台收音机',memoryTitle:'一碗面的位置',placeId:'granny'},
 chefIntro:{title:'留一口热的',placeId:'chef'},
 chefMemory:{title:'留一口热的',memoryTitle:'留着一口热的',placeId:'chef'},
 dock:{title:'江边的周伯',memoryTitle:'箱子的另一边',placeId:'dock'},
 community:{title:'雨来以前',memoryTitle:'第一次被记住',placeId:'community'},
 prepared:{title:'雨来以前',placeId:'community'},
 checked:{title:'街坊都已报平安',placeId:'community'},
 ending:{title:'灯火里的答案',memoryTitle:'灯下那个孩子',placeId:'shop'},
 radioFixed:{title:'熟悉的声音',placeId:'shop'},
 riskWaterReport:{title:'江边低处入口',placeId:'riskWater'},
 riskCableReport:{title:'东巷配电箱附近',placeId:'riskCable'},
 towel:{title:'蓝边毛巾',memoryTitle:'第一次值夜班',placeId:'community'},
 postlude:{title:'明早见',placeId:'chef'},
 revisitGranny:{title:'林婆婆的小院',placeId:'granny'},
 revisitChefMissing:{title:'蔡记过早',placeId:'chef'},
 revisitChefPrepared:{title:'蔡记过早',placeId:'chef'},
 revisitDock:{title:'轮渡边的周伯',placeId:'dock'},
 revisitCommunity:{title:'晴川里社区小屋',placeId:'community'},
 riskUnclear:{title:'先退回主巷',placeId:''},
 endingGood:{title:'明早见',placeId:'shop'},
 endingNeutral:{title:'顺路归来',placeId:'shop'},
 endingRegret:{title:'未赴的约',placeId:'shop'},
});

// Time is authored on each line. Text edits, localization and new present-day
// conversation can no longer silently move a cut into or out of a memory.
function memoryRange(key,lines) {
 const indices=lines.flatMap((line,index)=>line.time==='memory'?[index]:[]);
 for(const line of lines)if(line.cg&&line.time!=='memory')throw new Error(`Dialogue presentation: ${key}/${line.id??'?'} assigns CG to the present.`);
 if(!indices.length)return null;
 const start=indices[0],endExclusive=indices.at(-1)+1;
 if(indices.length!==endExclusive-start)throw new Error(`Dialogue presentation: ${key} memory metadata must be contiguous.`);
 if(!lines[start].cg||!lines[start].id)throw new Error(`Dialogue presentation: ${key} memory entry requires a stable id and a CG.`);
 if(endExclusive===lines.length||!lines[endExclusive].id)throw new Error(`Dialogue presentation: ${key} must explicitly return to the present.`);
 const ids=new Set();
 for(const line of lines){
  if(!line.id||ids.has(line.id))throw new Error(`Dialogue presentation: ${key} has a missing or duplicate line id.`);
  ids.add(line.id);
 }
 return Object.freeze({start,endExclusive});
}

// Retain the original boundary API for acceptance checks and chapter previews.
// Live presentation below reads line metadata, never these numeric offsets.
export const MEMORY_BOUNDARIES=Object.freeze(Object.fromEntries(
 Object.entries({...DIALOGUES,...EXTRA_DIALOGUES,...ENDING_DIALOGUES}).map(([key,lines])=>[key,memoryRange(key,lines)]).filter(([,range])=>range),
));

/**
 * Present-day speech stays in the 3D location, also during a journal replay.
 * Only explicitly authored past-tense scenes use CG. A CG marker carries
 * forward within that memory, and never across a return to the present.
 */
export function presentationFor(key,index,{replay=false}={}) {
 const lines=DIALOGUES[key]??EXTRA_DIALOGUES[key]??ENDING_DIALOGUES[key]??PLAYFUL_LIFE_DIALOGUES[key];
 const valid=Array.isArray(lines)&&Number.isInteger(index)&&index>=0&&index<lines.length;
 const line=valid?lines[index]:null,memory=line?.time==='memory';
 const scene=SCENES[key],speaker=line?.who??'';
 let cgId=null;
 if(memory)for(let i=index;i>=0&&lines[i].time==='memory';i--)if(lines[i].cg){cgId=lines[i].cg;break;}
 return {memory,title:scene?(memory?scene.memoryTitle:scene.title):speaker||'街坊的话',
  placeId:scene?.placeId||PLACES_BY_SPEAKER[speaker]||'',cgId};
}
