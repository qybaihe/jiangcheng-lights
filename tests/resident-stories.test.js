import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RESIDENTS, RESIDENT_PHASES, RESIDENT_PHASE_LABELS, getResident, getResidentTopic,
  currentResidentPhase, residentGreeting, normalizeResidentProgress, updateResidentProgress,
  hasMetResident, hasHeardResidentTopic, createResidentChatState, transitionResidentChat,
} from '../src/resident-stories.js';
import {freshState, objective, chapter} from '../src/story.js';
import {resolveEnding} from '../src/endings.js';

test('all four established neighbours and all five walkers have distinct identities and 27 stories', () => {
  assert.deepEqual(RESIDENTS.map(person => person.id), ['granny','chef','dock','community','walker0','walker1','walker2','walker3','walker4']);
  assert.equal(new Set(RESIDENTS.map(person => person.name)).size, 9);
  assert.deepEqual(RESIDENTS.slice(0,4).map(person => person.name), ['林婆婆','蔡姨','周伯','小许']);
  assert.equal(RESIDENTS.flatMap(person => person.topics).length, 27);
  for (const person of RESIDENTS) {
    for (const field of ['name','role','monogram','detail']) assert.ok(person[field].trim(), `${person.id}.${field}`);
    assert.equal(person.topics.length, 3);
    assert.equal(new Set(person.topics.map(item => item.id)).size, person.topics.length);
    assert.deepEqual(Object.keys(person.greetings), RESIDENT_PHASES);
    assert.equal(new Set(Object.values(person.greetings)).size, 3);
    for (const phase of RESIDENT_PHASES) {
      assert.ok(person.greetings[phase].trim());
      assert.ok(RESIDENT_PHASE_LABELS[phase]);
    }
    for (const item of person.topics) {
      assert.ok(item.title.trim());
      assert.ok(item.teaser.trim());
      assert.ok(item.lines.length >= 3 && item.lines.length <= 5);
      assert.ok(item.lines.every(line => typeof line === 'string' && line.trim().length > 6 && line.length <= 95));
      assert.equal(new Set(item.lines).size, item.lines.length);
      assert.equal(getResidentTopic(person.id, item.id), item);
    }
  }
});

test('content is immutable, lookup is exact, and invented identities do not overwrite established ones', () => {
  assert.ok(Object.isFrozen(RESIDENTS));
  for (const person of RESIDENTS) {
    assert.equal(getResident(person.id), person);
    assert.ok(Object.isFrozen(person));
    assert.ok(Object.isFrozen(person.greetings));
    assert.ok(Object.isFrozen(person.topics));
    for (const item of person.topics) {
      assert.ok(Object.isFrozen(item));
      assert.ok(Object.isFrozen(item.lines));
    }
  }
  for (const id of [null, undefined, '', 'grandfather','walker5','toString','__proto__']) assert.equal(getResident(id), null);
  assert.equal(getResidentTopic('walker0','bamboo-bed'), null);
  assert.equal(getResidentTopic('missing','missing'), null);
  assert.equal(residentGreeting('missing', {}), '');
});

test('rain phase follows explicit story flags with postlude taking precedence', () => {
  for (const state of [undefined, {}, {flags:[]}, {flags:['ending']}, {flags:['radio','granny']}, {rainy:true}, {runEnded:true}, {flags:'postlude'}]) {
    assert.equal(currentResidentPhase(state), 'beforeRain');
  }
  for (const flags of [['prepared'],['checked'],['prepared','checked'],new Set(['prepared'])]) assert.equal(currentResidentPhase({flags}), 'warning');
  for (const flags of [['postlude'],['postlude','checked'],new Set(['postlude','prepared'])]) assert.equal(currentResidentPhase({flags}), 'afterRain');
  for (const person of RESIDENTS) {
    assert.equal(residentGreeting(person.id, {}), person.greetings.beforeRain);
    assert.equal(residentGreeting(person.id, {flags:['prepared']}), person.greetings.warning);
    assert.equal(residentGreeting(person.id, {flags:['postlude']}), person.greetings.afterRain);
  }
});

test('save normalization tolerates absent and malformed older saves', () => {
  const blank = {version:1, met:[], heard:{}};
  for (const input of [undefined,null,0,true,'granny',[],{}, {met:'granny',heard:[]},{met:{granny:true},heard:{granny:'bamboo-bed'}}]) {
    assert.deepEqual(normalizeResidentProgress(input), blank);
  }
});

test('normalization whitelists, de-duplicates, canonicalizes and infers meeting from completed stories', () => {
  const raw = {
    version:999, met:['walker4','granny','granny','foreign','__proto__'],
    heard:{granny:['radio-dial','bamboo-bed','radio-dial','ticket-pocket'], dock:['ticket-pocket'], foreign:['all']},
    flags:['ending'], supplies:['water'], storyChoices:{stay:'breakfast'},
  };
  const snapshot = structuredClone(raw);
  assert.deepEqual(normalizeResidentProgress(raw), {
    version:1, met:['granny','dock','walker4'], heard:{granny:['bamboo-bed','radio-dial'],dock:['ticket-pocket']},
  });
  assert.deepEqual(raw, snapshot);
  const inherited = Object.create({granny:['bamboo-bed']});
  assert.deepEqual(normalizeResidentProgress({heard:inherited}), {version:1,met:[],heard:{}});
});

test('progress updates are immutable, isolated, repeatable, and ignore invalid events', () => {
  const original = normalizeResidentProgress();
  const next = updateResidentProgress(original, {type:'topic-complete',residentId:'granny',topicId:'bamboo-bed'});
  assert.deepEqual(original, {version:1,met:[],heard:{}});
  assert.equal(hasMetResident(next,'granny'), true);
  assert.equal(hasHeardResidentTopic(next,'granny','bamboo-bed'), true);
  assert.deepEqual(updateResidentProgress(next, {type:'topic-complete',residentId:'granny',topicId:'bamboo-bed'}), next);
  for (const event of [null,{}, {type:'open',residentId:'granny'}, {type:'close',residentId:'granny'}, {type:'topic',residentId:'granny',topicId:'bamboo-bed'}, {type:'topic-complete',residentId:'granny',topicId:'ticket-pocket'}, {type:'topic-complete',residentId:'foreign',topicId:'bamboo-bed'}, {type:'flag',residentId:'granny',id:'ending'}]) {
    assert.deepEqual(updateResidentProgress(original,event), original);
  }
  const metOnly = updateResidentProgress(original, {type:'meet',residentId:'walker2'});
  assert.deepEqual(metOnly, {version:1,met:['walker2'],heard:{}});
  const clone = normalizeResidentProgress(next);
  clone.met.push('chef');
  clone.heard.granny.push('radio-dial');
  assert.deepEqual(next,{version:1,met:['granny'],heard:{granny:['bamboo-bed']}});
});

test('a greeting, topic selection and last-line display do not count as hearing a story', () => {
  assert.equal(createResidentChatState('nobody', {}), null);
  let session = createResidentChatState('granny', {flags:['prepared']});
  assert.equal(session.phase, 'warning');
  assert.equal(session.screen, 'greeting');
  assert.equal(transitionResidentChat(session,{type:'topic',topicId:'bamboo-bed'}).session.screen, 'greeting');
  let result = transitionResidentChat(session,{type:'advance'});
  assert.equal(result.session.screen,'topics');
  assert.equal(result.heard,null);
  result = transitionResidentChat(result.session,{type:'topic',topicId:'bamboo-bed'});
  assert.equal(result.heard,null);
  session = result.session;
  const story = getResidentTopic('granny','bamboo-bed');
  for (let index=1;index<story.lines.length;index++) {
    const before = structuredClone(session);
    result = transitionResidentChat(session,{type:'advance'});
    assert.deepEqual(session,before);
    assert.equal(result.heard,null);
    assert.equal(result.session.screen,'story');
    assert.equal(result.session.lineIndex,index);
    session=result.session;
  }
  result = transitionResidentChat(session,{type:'advance'});
  assert.deepEqual(result.heard,{residentId:'granny',topicId:'bamboo-bed'});
  assert.equal(result.session.screen,'topics');
  assert.equal(transitionResidentChat(result.session,{type:'advance'}).heard,null);
});

test('closing or switching topics at every reading position never marks a partial story', () => {
  for (const person of RESIDENTS) for (const story of person.topics) {
    for (let index=0;index<story.lines.length;index++) {
      let session = createResidentChatState(person.id, {});
      session=transitionResidentChat(session,{type:'advance'}).session;
      session=transitionResidentChat(session,{type:'topic',topicId:story.id}).session;
      for (let line=0;line<index;line++) session=transitionResidentChat(session,{type:'advance'}).session;
      const back=transitionResidentChat(session,{type:'back'});
      assert.equal(back.heard,null);
      assert.equal(back.session.screen,'topics');
      const closed=transitionResidentChat(session,{type:'close'});
      assert.equal(closed.heard,null);
      assert.equal(closed.session.screen,'closed');
      assert.deepEqual(transitionResidentChat(closed.session,{type:'advance'}),closed);
      assert.equal(transitionResidentChat(back.session,{type:'topic',topicId:story.id}).session.lineIndex,0);
    }
  }
});

test('unknown topic events are inert and no automatic transition can choose a story', () => {
  const initial = createResidentChatState('granny',{});
  for (const event of [{type:'tick'}, {type:'timeout'}, {type:'topic',topicId:'bamboo-bed'}]) assert.deepEqual(transitionResidentChat(initial,event),{session:initial,heard:null});
  const topics=transitionResidentChat(initial,{type:'advance'}).session;
  for (const event of [{type:'advance'}, {type:'topic',topicId:'ticket-pocket'}, {type:'topic',topicId:'__proto__'}]) assert.deepEqual(transitionResidentChat(topics,event),{session:topics,heard:null});
  assert.deepEqual(transitionResidentChat(null,{type:'advance'}),{session:null,heard:null});
});

test('all 27 complete stories are optional: no quest, inventory, lore or ending mutation', () => {
  const state = {...freshState(),flags:['received','radio','prepared','checked'],supplies:['water'],storyChoices:{stay:'breakfast'}};
  const untouched = structuredClone(state);
  const before = {objective:objective(state), chapter:chapter(state), ending:resolveEnding(state)};
  let progress=normalizeResidentProgress();
  for (const person of RESIDENTS) {
    let session=createResidentChatState(person.id,state);
    session=transitionResidentChat(session,{type:'advance'}).session;
    for (const item of person.topics) {
      session=transitionResidentChat(session,{type:'topic',topicId:item.id}).session;
      for (let index=0;index<item.lines.length;index++) {
        const result=transitionResidentChat(session,{type:'advance'});
        session=result.session;
        if (result.heard) progress=updateResidentProgress(progress,{type:'topic-complete',...result.heard});
      }
    }
  }
  assert.deepEqual(state,untouched);
  assert.equal(progress.met.length,9);
  assert.equal(Object.values(progress.heard).flat().length,27);
  const enriched={...state,residents:progress};
  assert.deepEqual({objective:objective(enriched),chapter:chapter(enriched),ending:resolveEnding(enriched)},before);
  assert.deepEqual(Object.keys(progress),['version','met','heard']);
  assert.deepEqual(enriched.flags,untouched.flags);
  assert.deepEqual(enriched.supplies,untouched.supplies);
  assert.deepEqual(enriched.lore,untouched.lore);
  assert.deepEqual(enriched.storyChoices,untouched.storyChoices);
});

test('no anecdote exposes the sealed main-story keepsakes or makes the grandfather deceased', () => {
  const text = JSON.stringify(RESIDENTS);
  for (const fragment of ['遗物','遗照','去世','过世','临终','旧信封','红盖子','白点','不想开店','饭钱先记','阿遥那份别放葱']) assert.equal(text.includes(fragment),false,fragment);
  assert.match(getResidentTopic('walker4','repair-stool').lines.at(-1),/等他回来/);
  const opera=getResidentTopic('walker3','two-operas').lines.join('');
  assert.match(opera,/汉剧和黄梅戏是不同的戏种/);
  assert.doesNotMatch(text,/\d{4}年|\d+月\d+日|发放物资|解锁结局|获得电池/);
});
