import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ADVENTURE_STOPS, currentAdventureStop, discoverAdventure,
  normalizeAdventureState, adventureReading, nearestAdventureStop, adventureRegionAt,
} from '../src/adventure.js';

const [first, second, third] = ADVENTURE_STOPS;

test('missing, malformed and inherited adventure saves start clean', () => {
  for (const raw of [undefined, null, 0, true, '', [], {found:null}, {found:'kite-tools'}, {found:{}}, Object.create({found:[first.id]})]) {
    assert.deepEqual(normalizeAdventureState(raw), {found:[]});
  }
});

test('normalization ignores invalid entries and only accepts the next discovery', () => {
  const raw={found:[third.id, null, first.id, first.id, 'unknown', third.id, second.id, false, third.id, third.id],flags:['ending']};
  const before=structuredClone(raw);
  assert.deepEqual(normalizeAdventureState(raw),{found:[first.id,second.id,third.id]});
  assert.deepEqual(raw,before);
  assert.deepEqual(normalizeAdventureState({found:[third.id,first.id,second.id]}),{found:[first.id,second.id]});
  assert.deepEqual(normalizeAdventureState({found:[second.id,third.id]}),{found:[]});
});

test('normalization is idempotent and does not retain save array references', () => {
  const raw={found:[first.id,second.id]}, normalized=normalizeAdventureState(raw);
  assert.notEqual(normalized.found,raw.found);
  assert.deepEqual(normalizeAdventureState(normalized),normalized);
  normalized.found.push(third.id);
  assert.deepEqual(raw.found,[first.id,second.id]);
});

test('three optional discoveries advance in order without main-story flags', () => {
  let progress=normalizeAdventureState();
  for(const location of ADVENTURE_STOPS){
    assert.equal(currentAdventureStop(progress),location);
    const previous=progress;
    progress=discoverAdventure(previous,location.id);
    assert.notEqual(progress,previous);assert.notEqual(progress.found,previous.found);
    assert.equal(progress.found.length,previous.found.length+1);
  }
  assert.equal(currentAdventureStop(progress),null);
  assert.deepEqual(progress,{found:ADVENTURE_STOPS.map(s=>s.id)});
});

test('duplicate, future and unknown discoveries cannot award progress or rewards', () => {
  const progress=Object.freeze({found:Object.freeze([first.id])});
  for(const id of [first.id,third.id,'ending','unknown',undefined,null,'__proto__']) {
    const next=discoverAdventure(progress,id);
    assert.deepEqual(next,{found:[first.id]});
    assert.deepEqual(Object.keys(next),['found']);
    assert.notEqual(next,progress);
  }
});

test('reading or exiting has no discovery side effect, and future readings are only atmosphere', () => {
  const progress={found:[]};
  const ready=adventureReading(progress,first.id), future=adventureReading(progress,third.id);
  assert.equal(ready.mode,'discover');assert.equal(ready.canDiscover,true);
  assert.equal(ready.lines,first.lines);
  assert.equal(future.mode,'teaser');assert.equal(future.canDiscover,false);
  assert.deepEqual(future.lines,[{who:'旁白',text:third.hint}]);
  assert.deepEqual(progress,{found:[]});
  assert.equal(adventureReading(progress,'missing'),null);
});

test('completed stops can be reread without restarting or advancing the chain', () => {
  const progress={found:[first.id,second.id,third.id]};
  for(const location of ADVENTURE_STOPS){
    const reading=adventureReading(progress,location.id);
    assert.equal(reading.mode,'revisit');assert.equal(reading.canDiscover,false);
    assert.equal(reading.lines,location.lines);
    assert.deepEqual(discoverAdventure(progress,location.id),progress);
  }
  for(const id of [undefined,null,'unknown'])assert.deepEqual(discoverAdventure(progress,id),progress);
});

test('stop metadata and narrative are immutable and coordinates are finite', () => {
  assert.equal(new Set(ADVENTURE_STOPS.map(s=>s.id)).size,3);
  for(const location of ADVENTURE_STOPS){
    assert.ok(Number.isFinite(location.x)&&Number.isFinite(location.z)&&location.radius>0&&location.radius<=3.1);
    assert.equal(location.adventure,true);assert.equal(location.icon,'spark');assert.equal(location.color,'#dfbc79');
    assert.ok(location.name&&location.label&&location.hint&&location.routeHint);
    assert.ok(location.routeHint.length<location.hint.length);
    assert.ok(location.lines.length>=4&&location.lines.every(l=>l.who&&l.text));
    assert.ok(Object.isFrozen(location)&&Object.isFrozen(location.lines)&&location.lines.every(Object.isFrozen));
  }
});

test('E proximity uses the declared radius, rejects invalid coordinates, and never collects', () => {
  for(const location of ADVENTURE_STOPS){
    assert.equal(nearestAdventureStop(location.x,location.z),location);
    assert.equal(nearestAdventureStop(location.x+location.radius-.0001,location.z),location);
    assert.equal(nearestAdventureStop(location.x+location.radius+.0001,location.z),null);
  }
  for(const [x,z]of [[NaN,0],[0,Infinity],['33',-16.2],[undefined,0]])assert.equal(nearestAdventureStop(x,z),null);
  assert.equal(nearestAdventureStop(0,0),null);
  assert.deepEqual(normalizeAdventureState(),{found:[]});
});

test('all three stops expose a local region title and the ramp has its own approach title', () => {
  assert.equal(adventureRegionAt(first.x,first.z).name,'工具巷');
  assert.equal(adventureRegionAt(second.x,second.z).name,'院后北街');
  assert.equal(adventureRegionAt(third.x,third.z).name,'听风台');
  assert.equal(adventureRegionAt(33,-7).name,'听风坡');
  assert.equal(adventureRegionAt(33,-14.7).name,'听风台');
  assert.equal(adventureRegionAt(0,0),null);
  assert.equal(adventureRegionAt(Infinity,-16),null);
  assert.equal(adventureRegionAt(33,'-16'),null);
});

test('region results are independent values and do not carry progress or timer state', () => {
  const firstVisit=adventureRegionAt(third.x,third.z);firstVisit.name='changed';
  const nextVisit=adventureRegionAt(third.x,third.z);
  assert.equal(nextVisit.name,'听风台');
  assert.deepEqual(Object.keys(nextVisit),['id','name','subtitle']);
});

test('optional discoveries available before the story do not reveal the shop reopening',()=>{
  const early=ADVENTURE_STOPS.flatMap(stop=>stop.lines.map(line=>line.text)).join('\n');
  assert.doesNotMatch(early,/林婆婆、蔡姨、周伯|店门修好了再还|街坊先把灯送|暗下来的时候|铺子暗了|明早的热干面，也多你一份|重新开张|工作台搬好了/);
  assert.match(third.lines.map(line=>line.text).join('\n'),/陪阿遥去栏内看桥影/);
  assert.match(third.lines.map(line=>line.text).join('\n'),/等他回来/);
  let progress=normalizeAdventureState();
  for(const stop of ADVENTURE_STOPS)progress=discoverAdventure(progress,stop.id);
  assert.equal(currentAdventureStop(progress),null,'removing spoilers must not add a main-story gate');
});
