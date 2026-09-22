import test from 'node:test';
import assert from 'node:assert/strict';
import {DIALOGUES,EXTRA_DIALOGUES} from '../src/story.js';
import {ENDING_DIALOGUES} from '../src/ending-v3-data.js';
import {presentationFor,MEMORY_BOUNDARIES} from '../src/dialogue-presentation.js';
const all=()=>({...DIALOGUES,...EXTRA_DIALOGUES});
function lineIndex(key,id){const matches=all()[key].flatMap((line,index)=>line.id===id?[index]:[]);assert.equal(matches.length,1,`stable line ${key}/${id}`);return matches[0];}
const at=(key,id,options)=>presentationFor(key,lineIndex(key,id),options);
const places={intro:'shop',granny:'granny',grannyMemory:'granny',chefIntro:'chef',chefMemory:'chef',dock:'dock',community:'community',prepared:'community',checked:'community',ending:'shop',radioFixed:'shop',riskWaterReport:'riskWater',riskCableReport:'riskCable',towel:'community',postlude:'chef',revisitGranny:'granny',revisitChefMissing:'chef',revisitChefPrepared:'chef',revisitDock:'dock',revisitCommunity:'community',riskUnclear:''};

test('all current dialogue and silent returns stay in 3D including optional scenes and replays',()=>{
 for(const [key,lines] of Object.entries(all()))lines.forEach((line,index)=>{if(line.time==='memory')return;for(const replay of [false,true]){const result=presentationFor(key,index,{replay});assert.equal(result.memory,false,line.id);assert.equal(result.cgId,null,line.id);assert.equal(result.placeId,places[key]);assert.ok(result.title);}});
 assert.equal(at('ending','ending-live-voice').memory,false);assert.equal(at('towel','towel-present-return').memory,false);
});
test('each CG persists only within its contiguous authored past interval',()=>{
 for(const [key,lines] of Object.entries(all())){let expected=null;lines.forEach((line,index)=>{if(line.time!=='memory')expected=null;else if(line.cg)expected=line.cg;const result=presentationFor(key,index);assert.equal(result.memory,line.time==='memory',line.id);assert.equal(result.cgId,expected,line.id);assert.deepEqual(presentationFor(key,index,{replay:true}),result);});}
});
test('all eight artwork changes match stable line IDs, not character names or numeric offsets',()=>{
 for(const [key,id,cg] of [['grannyMemory','granny-memory-entry','granny-table'],['grannyMemory','granny-memory-bamboo','granny-bamboo'],['chefMemory','chef-memory-entry','chef-lamp'],['chefMemory','chef-memory-extra-bowl','chef-extra-bowl'],['dock','dock-memory-entry','dock-shared-box'],['towel','community-memory-entry','xu-first-shift'],['ending','ending-memory-entry','ending-reopen'],['ending','ending-memory-child','ending-lamplit-child']]){assert.equal(at(key,id).cgId,cg);assert.equal(at(key,id).memory,true);}
 for(const [key,id] of [['grannyMemory','granny-present-return'],['chefMemory','chef-present-return'],['dock','dock-present-return'],['towel','towel-present-return'],['ending','ending-live-voice']])assert.equal(at(key,id).cgId,null);
});
test('the optional towel moved out of the compulsory community scene and returns explicitly',()=>{
 assert.equal(MEMORY_BOUNDARIES.community,undefined);assert.deepEqual(MEMORY_BOUNDARIES.towel,{start:2,endExclusive:4});
 assert.equal(at('community','community-pack-start').memory,false);assert.equal(at('towel','towel-present-origin').memory,false);assert.equal(EXTRA_DIALOGUES.towel.at(-1).silent,true);
});
test('five frozen intervals derive from time metadata and accept non-narrator entries',()=>{
 assert.deepEqual(Object.keys(MEMORY_BOUNDARIES).sort(),['chefMemory','dock','ending','grannyMemory','towel']);
 for(const [key,range] of Object.entries(MEMORY_BOUNDARIES)){const lines=all()[key];assert.notEqual(lines[range.start].who,'旁白');assert.ok(lines[range.start].cg&&lines[range.start].id);assert.ok(lines.slice(range.start,range.endExclusive).every(l=>l.time==='memory'));assert.equal(lines[range.endExclusive].time,'present');if(range.start)assert.equal(presentationFor(key,range.start-1).memory,false);assert.equal(presentationFor(key,range.endExclusive).cgId,null);assert.ok(Object.isFrozen(range));}
 assert.ok(Object.isFrozen(MEMORY_BOUNDARIES));
});
test('unknown and ephemeral responses never inherit prior CG',()=>{
 assert.deepEqual(presentationFor('missing',0),{memory:false,title:'街坊的话',placeId:'',cgId:null});
 const previous=DIALOGUES.ephemeral;
 try{for(const [who,placeId] of [['林婆婆','granny'],['蔡姨','chef'],['周伯','dock'],['小许','community'],['阿遥',''],['旁白','']]){DIALOGUES.ephemeral=[{who,text:'当下的一句回应。'}];assert.deepEqual(presentationFor('ephemeral',0,{replay:true}),{memory:false,title:who,placeId,cgId:null});}DIALOGUES.ephemeral=[{who:'林婆婆',time:'memory',cg:'granny-table'},{who:'阿遥',time:'present'},{who:'林婆婆',time:'memory'}];assert.equal(presentationFor('ephemeral',2).cgId,null);}finally{if(previous===undefined)delete DIALOGUES.ephemeral;else DIALOGUES.ephemeral=previous;}
});
test('invalid indices never reveal a CG',()=>{for(const index of [-1,.5,NaN,Infinity,undefined,null,'6',DIALOGUES.chefMemory.length,10000])for(const replay of [false,true])assert.deepEqual(presentationFor('chefMemory',index,{replay}),{memory:false,title:'留一口热的',placeId:'chef',cgId:null});});
test('branch ending phone calls return to the shop in both live and replay presentation',()=>{
 for(const [key,lines] of Object.entries(ENDING_DIALOGUES))for(const [index,line] of lines.entries())for(const replay of [false,true]){
  const result=presentationFor(key,index,{replay});assert.equal(result.memory,false,line.id);assert.equal(result.cgId,null);assert.equal(result.placeId,'shop');assert.ok(result.title);
 }
});
test('presentation queries are read only',()=>{const before=structuredClone(all());for(const [key,lines] of Object.entries(all()))lines.forEach((_,index)=>{presentationFor(key,index);presentationFor(key,index,{replay:true});});assert.deepEqual(all(),before);});
let freshModuleId=0;const freshPresentation=()=>import(`../src/dialogue-presentation.js?v3-test=${++freshModuleId}`);
test('prose editing leaves memory cuts unchanged',async()=>{const previous=DIALOGUES.grannyMemory;try{DIALOGUES.grannyMemory=previous.map(l=>({...l,text:`修订：${l.text}`}));const fresh=await freshPresentation();assert.deepEqual(fresh.MEMORY_BOUNDARIES.grannyMemory,MEMORY_BOUNDARIES.grannyMemory);assert.equal(fresh.presentationFor('grannyMemory',lineIndex('grannyMemory','granny-memory-bamboo')).cgId,'granny-bamboo');assert.equal(fresh.presentationFor('grannyMemory',lineIndex('grannyMemory','granny-present-return')).memory,false);}finally{DIALOGUES.grannyMemory=previous;}});
test('inserting current speech changes offsets without changing stable memory IDs',async()=>{const previous=DIALOGUES.chefMemory;try{DIALOGUES.chefMemory=[{id:'test-present-insert',who:'蔡姨',text:'当下交接。',time:'present'},...previous];const fresh=await freshPresentation();assert.equal(fresh.MEMORY_BOUNDARIES.chefMemory.start,MEMORY_BOUNDARIES.chefMemory.start+1);assert.equal(fresh.MEMORY_BOUNDARIES.chefMemory.endExclusive,MEMORY_BOUNDARIES.chefMemory.endExclusive+1);assert.equal(fresh.presentationFor('chefMemory',0).memory,false);assert.equal(fresh.presentationFor('chefMemory',lineIndex('chefMemory','chef-memory-entry')).cgId,'chef-lamp');}finally{DIALOGUES.chefMemory=previous;}});
test('missing entry CG, duplicate IDs, current CG and fragmented memory fail visibly',async()=>{const previous=DIALOGUES.grannyMemory;try{DIALOGUES.grannyMemory=previous.map(l=>l.id==='granny-memory-entry'?{...l,cg:undefined}:l);await assert.rejects(freshPresentation(),/memory entry requires a stable id and a CG/);DIALOGUES.grannyMemory=[previous[0],...previous];await assert.rejects(freshPresentation(),/missing or duplicate line id/);DIALOGUES.grannyMemory=previous.map(l=>l.id==='granny-present-return'?{...l,cg:'granny-table'}:l);await assert.rejects(freshPresentation(),/assigns CG to the present/);DIALOGUES.grannyMemory=previous.map(l=>l.id==='granny-memory-consent'?{...l,time:'present'}:l);await assert.rejects(freshPresentation(),/memory metadata must be contiguous/);}finally{DIALOGUES.grannyMemory=previous;}});
