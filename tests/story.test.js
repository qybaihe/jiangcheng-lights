import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ENDING_DIALOGUES} from '../src/ending-v3-data.js';
import {freshState,act,has,objective,chapter,CIRCUIT,circuitConnected,validPack,loadState,POIS,DIALOGUES,EXTRA_DIALOGUES,STORY_META,SUPPLIES,LORE,MEMORY_ORDER,isAvailable,availabilityHint,SAVE_KEY} from '../src/story.js';
test('new game starts at the shop, with an intact independent save',()=>{const a=freshState(),b=freshState();a.flags.push('received');assert.equal(objective(b).target,'shop');assert.equal(b.flags.length,0);assert.equal(b.started,false);});
test('supply collection is gated and idempotent; state transitions are immutable',()=>{const a=freshState();assert.deepEqual(act(a,{type:'supply',id:'box'}).supplies,[]);const received=act(a,{type:'flag',id:'received'});assert.deepEqual(act(received,{type:'supply',id:'box'}).supplies,[]);const radio=act(received,{type:'flag',id:'radio'});const b=act(radio,{type:'flag',id:'chefRequested'});const c=act(b,{type:'supply',id:'box'});assert.deepEqual(c.supplies,['box']);assert.deepEqual(a.flags,[]);assert.deepEqual(act(c,{type:'supply',id:'box'}).supplies,['box']);assert.deepEqual(act(c,{type:'supply',id:'bad'}).supplies,['box']);});
test('route objectives cover the full playable story and ending',()=>{let s=freshState();const flag=f=>s=act(s,{type:'flag',id:f});flag('received');assert.equal(objective(s).target,'shop');flag('radio');assert.equal(chapter(s),1);assert.equal(objective(s).target,'granny');flag('granny');assert.equal(objective(s).target,'chef');flag('chefRequested');for(const id of Object.keys(SUPPLIES))s=act(s,{type:'supply',id});assert.equal(objective(s).target,'chef');flag('chef');assert.equal(objective(s).target,'dock');flag('dock');assert.equal(chapter(s),2);assert.equal(objective(s).target,'community');flag('prepared');assert.equal(objective(s).target,'riskWater');flag('riskWater');assert.equal(objective(s).target,'riskCable');flag('riskCable');assert.equal(objective(s).target,'community');flag('checked');assert.equal(objective(s).target,'shop');flag('ending');assert.equal(chapter(s),4);assert.equal(objective(s).target,null);});
test('radio has a valid route, initial puzzle is not pre-solved, breaks reject',()=>{assert.equal(circuitConnected(CIRCUIT),false);const solved=CIRCUIT.map(t=>({...t,rot:0}));assert.equal(circuitConnected(solved),true);for(const i of [0,1,2,3,5,8]){const broken=structuredClone(solved);broken[i].rot=1;assert.equal(circuitConnected(broken),false,`break at ${i}`);}solved[4].rot=1;assert.equal(circuitConnected(solved),true,'unused ports do not break valid route');});
test('packing requires five distinct useful items and rejects risky substitutions',()=>{const valid=['water','light','food','aid','contact'];assert.equal(validPack(valid),true);assert.equal(validPack(valid.slice(1)),false);assert.equal(validPack(['water','water','food','aid','contact']),false);for(const bad of ['candle','pills','heavy','unknown'])assert.equal(validPack([...valid.slice(0,4),bad]),false);});
test('corrupt saves recover, missing settings upgrade, invented inventory is removed',()=>{assert.deepEqual(loadState({getItem:()=>'{oops'}),freshState());const s=loadState({getItem:()=>JSON.stringify({version:1,supplies:['box','invalid'],lore:['clock','invalid'],position:{x:'bad',z:0},settings:{sound:true}})});assert.deepEqual(s.supplies,['box']);assert.deepEqual(s.lore,['clock']);assert.equal(s.settings.quality,'high');assert.equal(s.position.x,1);});
test('approved v3 dialogue has exact short-script coverage rather than a word-count padding target',()=>{
 assert.equal(new Set(POIS.map(x=>x.id)).size,POIS.length);
 const spoken=Object.values({...DIALOGUES,...EXTRA_DIALOGUES}).flat().filter(line=>!line.silent);
 assert.equal(spoken.length,150);assert.equal(STORY_META.mainSpokenLines,138);
 assert.equal(spoken.filter(line=>line.scope==='main').length,138);
 assert.equal(spoken.filter(line=>line.scope==='optional-towel').length,4);
 assert.equal(spoken.filter(line=>line.scope==='postlude').length,2);
 const draft=JSON.parse(readFileSync(new URL('../output/script-review-v3/dialogue-draft.json',import.meta.url)));
 const mapped=spoken.filter(line=>line.draftId);
 assert.equal(mapped.length,draft.lines.length);
 for(const approved of draft.lines){
  const actual=mapped.find(line=>line.draftId===approved.draftId);assert.ok(actual,approved.draftId);
  assert.equal(actual.text,approved.text);assert.equal(actual.who,approved.speaker);assert.equal(actual.time,approved.time);
 }
});

const flag=(state,id)=>act(state,{type:'flag',id});
const supply=(state,id)=>act(state,{type:'supply',id});
const point=id=>POIS.find(p=>p.id===id);
function afterRadio(){return flag(flag(freshState(),'received'),'radio');}
function afterChef(state=afterRadio()){
  state=flag(state,'chefRequested');
  for(const id of Object.keys(SUPPLIES))state=supply(state,id);
  return flag(state,'chef');
}
function afterNeighbors(){return flag(flag(afterChef(),'granny'),'dock');}

test('availability explains the chef authorization and distinguishes collection from delivery',()=>{
  assert.equal(isAvailable(afterRadio(),point('box')),false);
  assert.match(availabilityHint(afterRadio(),point('box')),/蔡姨.*确认/);
  let state=flag(flag(afterRadio(),'granny'),'chefRequested');
  assert.equal(isAvailable(state,point('box')),true);
  for(const id of ['battery','box'])state=supply(state,id);
  assert.equal(has(flag(state,'chef'),'chef'),false,'partial inventory cannot complete handover');
  assert.equal(objective(state).target,'water');assert.equal(objective(state).action,'collect');
  assert.equal(isAvailable(state,point('box')),false);
  assert.match(availabilityHint(state,point('box')),/一起交给蔡姨/);
  state=supply(state,'water');
  assert.equal(has(state,'chef'),false);
  assert.equal(objective(state).step,'deliver-supplies');assert.equal(objective(state).target,'chef');
  assert.match(objective(state).hint,/收齐不等于交付/);
  const delivered=flag(state,'chef');assert.equal(has(delivered,'chef'),true);
  assert.deepEqual(delivered.supplies,state.supplies,'old inventory remains as the handover record');
  assert.match(availabilityHint(delivered,point('box')),/已经交给蔡姨/);
});

test('all neighbor orders work, while community preparation waits for all three',()=>{
  const orders=[['granny','chef','dock'],['granny','dock','chef'],['chef','granny','dock'],['chef','dock','granny'],['dock','granny','chef'],['dock','chef','granny']];
  for(const order of orders){
    let state=afterRadio();
    order.forEach((id,index)=>{
      state=id==='chef'?afterChef(state):flag(state,id);
      assert.equal(has(state,id),true,`${order}: ${id} reachable`);
      if(index<2)assert.equal(has(flag(state,'prepared'),'prepared'),false);
    });
    assert.equal(objective(state).target,'community');
    assert.equal(has(flag(state,'prepared'),'prepared'),true);
  }
});

test('radio, preparation, both observations, report and ending cannot be skipped',()=>{
  for(const id of ['radio','granny','chefRequested','chef','dock','prepared','riskWater','riskCable','checked','ending']){
    assert.equal(has(flag(freshState(),id),id),false,`${id} rejects an unearned transition`);
  }
  const ready=flag(afterNeighbors(),'prepared');
  assert.equal(has(flag(ready,'checked'),'checked'),false);
  const one=flag(ready,'riskWater');assert.equal(has(flag(one,'checked'),'checked'),false);
  const observed=flag(one,'riskCable');
  assert.equal(has(flag(observed,'ending'),'ending'),false);
  assert.equal(objective(observed).action,'report');
  const checked=flag(observed,'checked');assert.equal(objective(checked).step,'read-envelope');
  assert.equal(has(flag(checked,'ending'),'ending'),true);
});

test('risk observations work in both orders and the objective reports the actual count',()=>{
  const ready=flag(afterNeighbors(),'prepared');
  for(const [first,second] of [['riskWater','riskCable'],['riskCable','riskWater']]){
    const state=flag(ready,first);
    assert.equal(objective(state).target,second);assert.match(objective(state).title,/1\/2/);
    assert.equal(isAvailable(state,point(first)),false);assert.equal(isAvailable(state,point(second)),true);
    assert.equal(objective(flag(state,second)).target,'community');
  }
});

test('v3 task hints use immediate mobile reporting and the photo/phone ending',()=>{
  const ready=flag(afterNeighbors(),'prepared');
  assert.match(objective(ready).desc,/当场.*发给小许/);
  const water=flag(ready,'riskWater');
  assert.match(objective(water).desc,/当场.*发给小许/);
  assert.match(availabilityHint(water,point('riskWater')),/已发给小许/);
  const observed=flag(water,'riskCable');
  assert.match(objective(observed).title,/核对街坊到达/);
  assert.match(objective(observed).desc,/已发给小许/);
  const checked=flag(observed,'checked');
  assert.match(objective(checked).desc,/旧信封.*照片/);
  assert.match(objective(checked).hint,/外公.*电话/);
  for(const state of [ready,water,observed,checked]){
    assert.doesNotMatch(JSON.stringify(objective(state)),/一起回社区报告|观察结果带回社区|读完信与外公的语音/);
  }
});

test('every objective retains title/description/target and includes useful navigation metadata',()=>{
  let state=freshState();const states=[state];
  for(const id of ['received','radio','granny','chefRequested']){state=flag(state,id);states.push(state);}
  for(const id of Object.keys(SUPPLIES)){state=supply(state,id);states.push(state);}
  for(const id of ['chef','dock','prepared','riskWater','riskCable','checked','ending']){state=flag(state,id);states.push(state);}
  for(const snapshot of states){
    const obj=objective(snapshot);
    for(const field of ['step','action','title','desc','location','hint'])assert.ok(typeof obj[field]==='string'&&obj[field].length>0,field);
    assert.ok(obj.target===null||POIS.some(p=>p.id===obj.target));
  }
});

test('milestones measure first earned flags, never force waiting or overwrite a replay',()=>{
  const initial={...freshState(),seconds:12.25};
  const received=flag(initial,'received');assert.deepEqual(initial.milestones,{});
  assert.deepEqual(received.milestones,{received:12.25});
  const state=flag({...received,seconds:47.5},'radio');
  assert.equal(state.milestones.radio,47.5);
  assert.equal(flag({...state,seconds:80},'radio').milestones.radio,47.5);
  assert.deepEqual(flag(state,'prepared').milestones,state.milestones);
  assert.equal(flag({...freshState(),seconds:0},'received').milestones.received,0);
});

test('old version 1 saves keep early supplies and completed flags without invented timestamps',()=>{
  const old={version:1,started:true,flags:['received','radio'],supplies:['water','box','battery'],lore:['photo'],position:{x:3,z:5},seconds:152,settings:{sound:true}};
  let state=loadState({getItem:key=>{assert.equal(key,SAVE_KEY);return JSON.stringify(old);}});
  assert.deepEqual(state.supplies,old.supplies);assert.deepEqual(state.flags,old.flags);
  assert.deepEqual(state.milestones,{});assert.deepEqual(state.position,old.position);
  state=flag(state,'chefRequested');assert.equal(state.milestones.chefRequested,152);
  assert.equal(has(flag(state,'chef'),'chef'),true,'old supplies count once the arrangement is confirmed');
  const ending=loadState({getItem:()=>JSON.stringify({...old,flags:['ending']})});
  assert.equal(objective(ending).target,null,'completed legacy stories stay complete');
});

test('save cleanup deduplicates inventory and rejects malformed timing data',()=>{
  const state=loadState({getItem:()=>JSON.stringify({version:1,flags:['received','received','radio','future-flag'],supplies:['box','box','invalid'],lore:['clock','clock'],seconds:-1,milestones:{received:2.5,radio:'4',unearned:7,'future-flag':-3}})});
  assert.deepEqual(state.flags,['received','radio','future-flag']);assert.deepEqual(state.supplies,['box']);
  assert.deepEqual(state.lore,['clock']);assert.deepEqual(state.milestones,{received:2.5});assert.equal(state.seconds,0);
});

test('the childhood drawing and early ferry photo do not reveal the final reopening CG',()=>{
 const early=[LORE.photo.text,...MEMORY_ORDER.map(card=>card.text)].join('\n');
 assert.doesNotMatch(early,/重新开门|重新开张|工作台搬好了|窗帘洗好了/);
 assert.match(LORE.photo.text,/照片裁歪了/);assert.equal(isAvailable(freshState(),point('photo')),true);
 assert.deepEqual(act(freshState(),{type:'lore',id:'photo'}).lore,['photo']);
 assert.deepEqual(MEMORY_ORDER.map(card=>card.id),['close','bowl','talk','open'],'legacy card IDs retained');
 assert.ok(MEMORY_ORDER.every(card=>card.title.startsWith('画页')));
 assert.match(MEMORY_ORDER.at(-1).text,/签名/);
 assert.match(DIALOGUES.granny.map(line=>line.text).join('\n'),/帮我拼回去/);
 assert.match(DIALOGUES.dock.find(line=>line.id==='dock-present-return').text,/后来还是开了/,'no artificial withheld answer');
 for(const [key,lines] of Object.entries({...DIALOGUES,...EXTRA_DIALOGUES}))if(key!=='ending')assert.ok(lines.every(line=>!line.cg?.startsWith('ending-')));
 assert.equal(DIALOGUES.ending[0].id,'ending-recognize-child');
});

test('each memory adds a distinct practical relationship without compulsory theme speeches',()=>{
 const text=key=>(DIALOGUES[key]??EXTRA_DIALOGUES[key]).map(line=>line.text).join('\n');
 assert.match(text('grannyMemory'),/你送我的，我收着/);
 assert.match(text('grannyMemory'),/行不行/);
 assert.match(text('chefMemory'),/红盖子/);assert.match(text('chefMemory'),/蛋皮一铲起来就碎/);
 assert.doesNotMatch(text('chefMemory'),/婆婆也提到|婆婆跟我说/);
 assert.match(text('dock'),/我托一边/);assert.match(text('dock'),/坐船，还是回去/);
 assert.match(text('dock'),/那几家我来联系/);
 assert.match(text('checked'),/饭也到了，周伯刚报了平安/);
 assert.doesNotMatch(Object.values(DIALOGUES).flat().map(line=>line.text).join('\n'),/被.*接住|不是要你回来还谁的情/);
});

test('line IDs, portraits, gender-neutral story and living grandfather survive the version upgrade',()=>{
 const lines=Object.values({...DIALOGUES,...EXTRA_DIALOGUES}).flat();
 assert.equal(new Set(lines.map(line=>line.id)).size,lines.length);
 const portraits=new Set(['player','grandfather','granny','chef','dock','xu']);
 for(const line of lines){
  assert.match(line.id,/^[a-z0-9-]+$/);assert.ok(['present','memory'].includes(line.time));
  if(!line.silent)assert.ok(portraits.has(line.portrait));
  if(line.who.includes('阿遥'))assert.equal(line.portrait,'player');
 }
 const spoken=lines.filter(line=>!line.silent).map(line=>line.text).join('\n');
 assert.doesNotMatch(spoken,/外孙女|孙女|孙子|丫头|小伙子|小姑娘|遗物|遗书|临终|去世/);
 assert.match(DIALOGUES.intro.find(line=>line.id==='intro-rest').text,/姨妈那儿好好歇着/);
 assert.equal(DIALOGUES.ending.find(line=>line.id==='ending-live-voice').who,'外公');
 assert.equal(DIALOGUES.ending.find(line=>line.id==='ending-live-voice').time,'present');
});

test('eight CG entries use stable authored IDs and only the optional towel contains Xu memory',()=>{
 const expected=['granny-table','granny-bamboo','chef-lamp','chef-extra-bowl','dock-shared-box','xu-first-shift','ending-reopen','ending-lamplit-child'].sort();
 const actual=[];
 for(const [key,lines] of Object.entries({...DIALOGUES,...EXTRA_DIALOGUES}))for(const line of lines)if(line.cg){
  actual.push(line.cg);assert.equal(line.time,'memory');assert.ok(line.id);
  assert.notEqual(line.who,'旁白','approved memory entry is an actual speaker, not invented narration');
  if(line.cg.startsWith('ending-'))assert.equal(key,'ending');
  if(line.cg==='xu-first-shift')assert.equal(key,'towel');
 }
 assert.deepEqual(actual.sort(),expected);
 assert.ok(DIALOGUES.community.every(line=>line.time==='present'));
 assert.equal(EXTRA_DIALOGUES.towel.at(-1).id,'towel-present-return');
 assert.equal(EXTRA_DIALOGUES.towel.at(-1).silent,true);assert.equal(EXTRA_DIALOGUES.towel.at(-1).time,'present');
});

test('the lamp distinction and care for Xu remain in short approved language',()=>{
 const text=key=>(DIALOGUES[key]??EXTRA_DIALOGUES[key]).map(line=>line.text).join('\n');
 assert.match(text('chefIntro'),/外公让我还灯/);
 assert.match(text('chefMemory'),/阿遥写字有台灯/);
 assert.match(text('ending'),/给阿遥留个角/);
 assert.match(text('towel'),/头回值夜班/);assert.match(text('towel'),/先擦擦，脖子都湿了/);
 assert.match(text('prepared'),/水在那边/);assert.match(text('checked'),/这个别再放凉了/);
 assert.match(text('ending'),/晚两天/);assert.match(text('ending'),/不用了，我现在吃了/);
});

test('authorization, actual handover, remote risk reports and verified arrivals remain distinct',()=>{
 const lines=Object.values({...DIALOGUES,...EXTRA_DIALOGUES}).flat();const line=id=>lines.find(line=>line.id===id)?.text??'';
 assert.match(line('chef-intro-authorized-pickup'),/都跟人说好了/);
 assert.match(line('chef-intro-handover'),/取齐了带回来/);
 assert.match(line('chef-handover-check'),/齐了/);
 assert.match(line('chef-present-dispatch'),/备好了.*一会儿来取/);
 assert.match(line('prepared-safe-observation'),/干地上看.*别靠近积水和电箱/);
 assert.match(line('prepared-stop-if-unsafe'),/过不去就回来.*别自己弄/);
 assert.match(line('risk-water-report'),/我没下去.*位置发你/);
 assert.match(line('risk-cable-report'),/我没靠近.*位置也发了/);
 assert.match(line('risk-cable-reply'),/专业人员/);
 assert.match(line('checked-professional-followup'),/你发的两处都记下了/);
 assert.match(line('checked-arrivals-confirmed'),/到了.*陈姐.*饭也到了.*报了平安/);
 assert.match(line('granny-present-agency'),/要帮忙我喊你.*到了我给小许打电话/);
});

test('optional reprises and reports have explicit isolated scene keys and no hidden CG',()=>{
 assert.deepEqual(Object.keys(EXTRA_DIALOGUES).sort(),['radioFixed','riskWaterReport','riskCableReport','towel','postlude','revisitGranny','revisitChefMissing','revisitChefPrepared','revisitDock','revisitCommunity','riskUnclear'].sort());
 for(const [key,lines] of Object.entries(EXTRA_DIALOGUES))if(key!=='towel')assert.ok(lines.every(line=>line.time==='present'&&!line.cg));
 assert.equal(EXTRA_DIALOGUES.radioFixed.length,1);assert.equal(EXTRA_DIALOGUES.riskWaterReport.length,2);assert.equal(EXTRA_DIALOGUES.riskCableReport.length,2);
 assert.equal(EXTRA_DIALOGUES.postlude.length,2);
});

test('three additional ending calls have unique current IDs and preserve choice without disaster punishment',()=>{
 assert.deepEqual(Object.keys(ENDING_DIALOGUES).sort(),['endingGood','endingNeutral','endingRegret']);
 const core=Object.values({...DIALOGUES,...EXTRA_DIALOGUES}).flat();
 const endings=Object.values(ENDING_DIALOGUES).flat();assert.equal(endings.length,19);
 assert.equal(new Set([...core,...endings].map(line=>line.id)).size,core.length+endings.length);
 for(const lines of Object.values(ENDING_DIALOGUES)){
  assert.ok(lines.length>=4&&lines.length<=7);
  for(const line of lines){assert.equal(line.time,'present');assert.equal(line.cg,undefined);assert.ok(line.portrait);assert.equal(line.scope,'ending-branch');}
 }
 const text=key=>ENDING_DIALOGUES[key].map(line=>line.text).join('\n');
 assert.match(text('endingGood'),/人都到了.*饭也送过去了/);
 assert.match(text('endingGood'),/再住两天/);
 assert.match(text('endingNeutral'),/得先回去了/);assert.match(text('endingNeutral'),/姨妈那儿好好歇着/);
 assert.doesNotMatch(text('endingNeutral'),/明早走/);
 assert.match(text('endingRegret'),/社区这边你还过来吗/);assert.match(text('endingRegret'),/我另安排人/);
 assert.match(text('endingRegret'),/豆皮留着/);assert.doesNotMatch(text('endingRegret'),/那两处|你先回来/);
 assert.doesNotMatch(endings.map(line=>line.text).join('\n'),/死亡|去世|遇难|受伤|抢救|永别|外孙女|孙子|丫头/);
});
