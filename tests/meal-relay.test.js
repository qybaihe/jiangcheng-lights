import test from 'node:test';
import assert from 'node:assert/strict';
import {MEAL_FOODS,MEAL_TOPPINGS,MEAL_ROUNDS,MEAL_STOPS,normalizeMealProgress,startMealRelay,packMeal,removeMeal,sealMeal,deliverMeal,transitionMeal,mealSummary,mealPackingIssues,mealDeliveryAvailability,deriveMealTask,isMealRoundComplete} from '../src/meal-relay.js';

const clone = value => JSON.parse(JSON.stringify(value));
function packCorrect(progress,roundId,orderId) {
 const item=MEAL_ROUNDS[roundId].orders.find(item=>item.id===orderId);let next=progress;
 for(const field of ['food','scallion','chili','label']){const result=packMeal(next,roundId,orderId,field,field==='label'?orderId:item[field]);assert.equal(result.ok,true);next=result.progress;}
 return next;
}
function sealedRound(roundId='evening') { let progress=startMealRelay(null,roundId).progress;for(const item of MEAL_ROUNDS[roundId].orders){progress=packCorrect(progress,roundId,item.id);const result=sealMeal(progress,roundId,item.id);assert.equal(result.ok,true);progress=result.progress;}return progress; }
const at = stop => ({x:stop.x,y:stop.y,z:stop.z,mode:'walk',grounded:true});
const destination = (roundId,orderId) => MEAL_STOPS[MEAL_ROUNDS[roundId].orders.find(item=>item.id===orderId).stopId];

test('the meal game is authored as three named meals, two real handover stops, no countdown',()=>{
 assert.deepEqual(Object.keys(MEAL_ROUNDS),['evening','morning']);
 for(const round of Object.values(MEAL_ROUNDS)){
  assert.equal(round.orders.length,3);assert.equal(new Set(round.orders.map(item=>item.id)).size,3);
  assert.equal(new Set(round.orders.map(item=>item.stopId)).size,2);
  assert.ok(Object.isFrozen(round));assert.ok(Object.isFrozen(round.orders));
  for(const item of round.orders){assert.ok(MEAL_FOODS[item.food]);assert.ok(MEAL_STOPS[item.stopId]);assert.ok(item.note);assert.ok(item.response);}
  assert.equal('timeLimit' in round,false);assert.equal('score' in round,false);
 }
 assert.match(MEAL_ROUNDS.evening.subtitle,/傍晚/);assert.match(MEAL_ROUNDS.morning.subtitle,/次晨/);
 assert.match(MEAL_ROUNDS.morning.title,/过早/);assert.ok(MEAL_FOODS.doupi.name.includes('豆皮'));
 assert.equal(MEAL_TOPPINGS.chili.options.length,3);
});

test('undefined and hostile-shaped saves become a detached canonical fresh state',()=>{
 const expected=normalizeMealProgress();
 for(const input of [null,undefined,0,'bad',[],true,{rounds:[]},{rounds:{evening:{started:'true',boxes:[]}}},{completed:true,receipt:true,verified:true}])assert.deepEqual(normalizeMealProgress(input),expected);
 const save={rounds:{evening:{started:true,boxes:{lin:{food:'__proto__',scallion:'toString',chili:NaN,label:'unknown',sealed:true,delivered:true},extra:{food:'soup'}}}},unexpected:'discard'};
 const before=structuredClone(save),normalized=normalizeMealProgress(save);assert.deepEqual(normalized.rounds.evening.boxes.lin,{food:null,scallion:null,chili:null,label:null,sealed:false,delivered:false});
 assert.equal('unexpected' in normalized,false);assert.equal('extra' in normalized.rounds.evening.boxes,false);assert.deepEqual(save,before);
 normalized.rounds.morning.boxes.lin.food='soup';assert.equal(normalizeMealProgress().rounds.morning.boxes.lin.food,null);
});

test('packing is gated by starting the round and state transitions never mutate callers',()=>{
 const raw=normalizeMealProgress(),frozen=clone(raw);
 assert.equal(packMeal(raw,'evening','lin','food','noodles').code,'not-started');assert.equal(sealMeal(raw,'evening','lin').code,'not-started');
 const result=startMealRelay(raw);assert.equal(result.ok,true);assert.equal(result.progress.rounds.evening.started,true);assert.deepEqual(raw,frozen);
 assert.equal(result.progress.rounds.morning.started,false);assert.equal(result.completed,false);
});

test('start and cancel preserve all partially packed selections',()=>{
 let progress=startMealRelay().progress;
 progress=packMeal(progress,'evening','lin','food','noodles').progress;
 progress=packMeal(progress,'evening','lin','scallion','none').progress;
 const again=startMealRelay(progress);assert.equal(again.code,'already-started');assert.deepEqual(again.progress,progress);
 const cancelled=transitionMeal(progress,{type:'cancel'});assert.equal(cancelled.ok,true);assert.deepEqual(cancelled.progress,progress);
 const restored=normalizeMealProgress(clone(progress));assert.equal(restored.rounds.evening.boxes.lin.food,'noodles');assert.equal(restored.rounds.evening.boxes.lin.scallion,'none');assert.equal(restored.rounds.evening.boxes.lin.chili,null);
});

test('invalid rounds, choices and fabricated completion actions grant nothing',()=>{
 const progress=startMealRelay().progress;
 for(const action of [null,[],{},'deliver',{type:'result',verified:true,completed:true},{type:'complete'},{type:'receipt',orderId:'lin'},{type:'pack',roundId:'__proto__'},{type:'pack',orderId:'constructor'},{type:'pack',orderId:'lin',field:'__proto__',value:'noodles'},{type:'pack',orderId:'lin',field:'food',value:'constructor'},{type:'pack',orderId:'lin',field:'label',value:'林婆婆'},{type:'pack',orderId:'lin',field:'chili',value:'extra-hot'}]){
  const result=transitionMeal(progress,action);assert.equal(result.ok,false,JSON.stringify(action));assert.deepEqual(result.progress,progress);assert.equal(result.justCompleted,false);
 }
 assert.equal(deriveMealTask(progress,'unknown'),null);assert.deepEqual(mealSummary(progress,'unknown'),{started:false,total:0,sealed:0,delivered:0,ready:false,completed:false,pending:[]});
});

test('an empty box explains what is missing rather than wiping out preparation',()=>{
 const progress=startMealRelay().progress,result=sealMeal(progress,'evening','lin');
 assert.equal(result.ok,false);assert.equal(result.code,'needs-correction');assert.equal(result.issues.length,4);assert.match(result.message,/热食/);assert.deepEqual(result.progress,progress);
});

test('each named order needs the correct food, explicit condiment choice, and label',()=>{
 let progress=startMealRelay().progress;progress=packMeal(progress,'evening','lin','food','doupi').progress;
 progress=packMeal(progress,'evening','lin','scallion','on').progress;
 progress=packMeal(progress,'evening','lin','chili','side').progress;
 progress=packMeal(progress,'evening','lin','label','chen').progress;
 let rejected=sealMeal(progress,'evening','lin');assert.equal(rejected.issues.length,4);assert.match(rejected.message,/热干面/);assert.deepEqual(rejected.progress,progress);
 progress=packMeal(progress,'evening','lin','food','noodles').progress;
 rejected=sealMeal(progress,'evening','lin');assert.equal(rejected.issues.length,3);assert.match(rejected.message,/不放葱/);assert.equal(rejected.progress.rounds.evening.boxes.lin.food,'noodles');
 progress=packCorrect(progress,'evening','lin');assert.deepEqual(mealPackingIssues(progress,'evening','lin'),[]);
 assert.equal(sealMeal(progress,'evening','lin').ok,true);
});

test('removing one choice does not erase the other food, condiments or name',()=>{
 let progress=packCorrect(startMealRelay().progress,'evening','chen');
 const result=removeMeal(progress,'evening','chen','chili');assert.equal(result.ok,true);
 assert.equal(result.progress.rounds.evening.boxes.chen.chili,null);assert.equal(result.progress.rounds.evening.boxes.chen.food,'doupi');assert.equal(result.progress.rounds.evening.boxes.chen.label,'chen');
 assert.equal(result.progress.rounds.evening.boxes.chen.scallion,'on');assert.equal(progress.rounds.evening.boxes.chen.chili,'side');
 assert.equal(sealMeal(result.progress,'evening','chen').code,'needs-correction');
});

test('sealing is an explicit step and cannot be repeated or have contents altered',()=>{
 const packed=packCorrect(startMealRelay().progress,'evening','lin');assert.equal(packed.rounds.evening.boxes.lin.sealed,false);
 const sealed=sealMeal(packed,'evening','lin').progress;
 assert.equal(sealMeal(sealed,'evening','lin').code,'already-sealed');assert.equal(packMeal(sealed,'evening','lin','food','soup').code,'box-sealed');assert.equal(removeMeal(sealed,'evening','lin','food').code,'box-sealed');
 assert.equal(mealSummary(sealed).sealed,1);assert.equal(mealSummary(sealed).delivered,0);assert.equal(mealSummary(sealed).ready,false);
});

test('sealing all meals creates a delivery task, never an automatic completion',()=>{
 const progress=sealedRound(),summary=mealSummary(progress),task=deriveMealTask(progress);
 assert.equal(summary.ready,true);assert.equal(summary.completed,false);assert.equal(summary.sealed,3);assert.equal(summary.delivered,0);
 assert.equal(task.action,'meal-deliver');assert.equal(task.target,'meal-west');assert.equal(task.position.x,MEAL_STOPS.west.x);assert.match(task.desc,/林婆婆、陈姐/);
 assert.equal(progress.rounds.morning.started,false);
});

test('a sealed and delivered box survives JSON reload with matching recipe',()=>{
 const progress=sealedRound(),delivered=deliverMeal(progress,'evening','lin',at(MEAL_STOPS.west)).progress;
 assert.deepEqual(normalizeMealProgress(clone(delivered)),delivered);assert.equal(normalizeMealProgress(delivered).rounds.evening.boxes.lin.delivered,true);
 assert.equal(mealSummary(normalizeMealProgress(delivered)).sealed,3);assert.equal(mealSummary(normalizeMealProgress(delivered)).delivered,1);
});

test('corrupt contents revoke impossible seal and receipt while keeping usable selections',()=>{
 const source=sealedRound();source.rounds.evening.boxes.lin.delivered=true;source.rounds.evening.boxes.lin.food='soup';
 source.rounds.evening.boxes.chen.delivered=true;source.rounds.evening.boxes.chen.label='lin';
 source.rounds.evening.boxes.xu.delivered=true;source.rounds.evening.boxes.xu.sealed=false;
 const normalized=normalizeMealProgress(source);
 for(const box of Object.values(normalized.rounds.evening.boxes)){assert.equal(box.sealed,false);assert.equal(box.delivered,false);}
 assert.equal(normalized.rounds.evening.boxes.lin.food,'soup');assert.equal(normalized.rounds.evening.boxes.chen.label,'lin');assert.equal(mealSummary(normalized).completed,false);
});

test('a stopped or invalid saved round cannot restore awarded boxes',()=>{
 const source=sealedRound();source.rounds.evening.started=false;for(const box of Object.values(source.rounds.evening.boxes))box.delivered=true;
 assert.deepEqual(normalizeMealProgress(source).rounds.evening,normalizeMealProgress().rounds.evening);
});

test('unsealed food cannot be delivered even at the right recipient',()=>{
 const progress=packCorrect(startMealRelay().progress,'evening','lin');
 const result=deliverMeal(progress,'evening','lin',at(MEAL_STOPS.west));assert.equal(result.ok,false);assert.equal(result.code,'not-sealed');assert.deepEqual(result.progress,progress);
});

test('wrong-location and stale remote clicks do not record a handover',()=>{
 const progress=sealedRound();
 for(const point of [{x:10,y:0,z:12},{x:12,y:0,z:-3},{x:MEAL_STOPS.west.x+3.01,y:0,z:MEAL_STOPS.west.z}]){
  const result=deliverMeal(progress,'evening','lin',{...point,mode:'walk',grounded:true});assert.equal(result.code,'wrong-place');assert.deepEqual(result.progress,progress);
 }
 assert.equal(deliverMeal(progress,'evening','xu',at(MEAL_STOPS.west)).code,'wrong-place');
});

test('cars, bicycles, boats, seated, flying and invalid positions cannot hand over',()=>{
 const progress=sealedRound(),point=at(MEAL_STOPS.west);
 for(const mode of ['car','bicycle','bike','boat','ferry','seated','fly',null,undefined])assert.equal(deliverMeal(progress,'evening','lin',{...point,mode}).code,'not-walking');
 for(const grounded of [false,undefined,'true',1])assert.equal(deliverMeal(progress,'evening','lin',{...point,grounded}).code,'not-grounded');
 for(const y of [1.251,3,-4])assert.equal(deliverMeal(progress,'evening','lin',{...point,y}).code,'wrong-height');
 for(const axis of ['x','y','z'])for(const value of [NaN,Infinity,'0',null])assert.equal(deliverMeal(progress,'evening','lin',{...point,[axis]:value}).code,'not-grounded');
 for(const sample of [undefined,null,{},[],{verified:true,completed:true}])assert.equal(deliverMeal(progress,'evening','lin',sample).ok,false);
});

test('within the ground and distance tolerance a named box is handed over only once',()=>{
 const progress=sealedRound(),sample={...at(MEAL_STOPS.west),x:MEAL_STOPS.west.x+2.9,y:.7};
 const check=mealDeliveryAvailability(progress,'evening','lin',sample);assert.equal(check.available,true);
 const result=deliverMeal(progress,'evening','lin',sample);assert.equal(result.ok,true);assert.equal(result.code,'delivered');assert.match(result.message,/陈姐|没放葱/);assert.equal(result.progress.rounds.evening.boxes.lin.delivered,true);
 assert.equal(result.completed,false);assert.equal(result.justCompleted,false);
 const repeated=deliverMeal(result.progress,'evening','lin',sample);assert.equal(repeated.code,'already-delivered');assert.equal(repeated.justCompleted,false);assert.deepEqual(repeated.progress,result.progress);
 assert.equal(progress.rounds.evening.boxes.lin.delivered,false);
});

test('the two handover stops may be visited in either order without losing task guidance',()=>{
 let progress=sealedRound();progress=deliverMeal(progress,'evening','xu',at(MEAL_STOPS.community)).progress;
 assert.equal(deriveMealTask(progress).target,'meal-west');assert.equal(mealSummary(progress).delivered,1);
 progress=deliverMeal(progress,'evening','chen',at(MEAL_STOPS.west)).progress;assert.match(deriveMealTask(progress).desc,/林婆婆/);assert.doesNotMatch(deriveMealTask(progress).desc,/陈姐的/);
 const final=deliverMeal(progress,'evening','lin',at(MEAL_STOPS.west));assert.equal(final.justCompleted,true);assert.equal(final.completed,true);assert.equal(isMealRoundComplete(final.progress),true);
 assert.equal(deriveMealTask(final.progress).action,'complete');assert.equal(deriveMealTask(final.progress).target,null);
 const replay=deliverMeal(final.progress,'evening','lin',at(MEAL_STOPS.west));assert.equal(replay.justCompleted,false);assert.equal(replay.completed,true);
});

test('community becomes the remaining objective after the western meals are delivered',()=>{
 let progress=sealedRound();for(const id of ['lin','chen'])progress=deliverMeal(progress,'evening',id,at(MEAL_STOPS.west)).progress;
 const task=deriveMealTask(progress);assert.equal(task.target,'meal-community');assert.match(task.desc,/小许/);assert.equal(task.position.z,MEAL_STOPS.community.z);
});

test('morning recipes are independent, persisted and use the same full loop',()=>{
 let progress=sealedRound('evening');const eveningBefore=clone(progress.rounds.evening);
 progress=startMealRelay(progress,'morning').progress;
 for(const item of MEAL_ROUNDS.morning.orders){progress=packCorrect(progress,'morning',item.id);progress=sealMeal(progress,'morning',item.id).progress;}
 assert.equal(mealSummary(progress,'morning').ready,true);assert.deepEqual(progress.rounds.evening,eveningBefore);
 for(const item of MEAL_ROUNDS.morning.orders){const result=deliverMeal(progress,'morning',item.id,at(destination('morning',item.id)));assert.equal(result.ok,true);progress=result.progress;}
 assert.equal(isMealRoundComplete(progress,'morning'),true);assert.equal(isMealRoundComplete(progress,'evening'),false);assert.deepEqual(normalizeMealProgress(clone(progress)),progress);
 assert.match(deriveMealTask(progress,'morning').desc,/过早/);
});

test('copying an evening recipe to a changed morning order does not bypass the new note',()=>{
 let progress=sealedRound();progress=startMealRelay(progress,'morning').progress;
 progress.rounds.morning.boxes.lin={...progress.rounds.evening.boxes.lin,delivered:true};
 const restored=normalizeMealProgress(progress);assert.equal(restored.rounds.morning.boxes.lin.sealed,false);assert.equal(restored.rounds.morning.boxes.lin.delivered,false);assert.match(mealPackingIssues(restored,'morning','lin')[0],/豆皮/);
});

test('derived objectives cover new, partial, packed and complete state without external flags',()=>{
 const blank=normalizeMealProgress();assert.equal(deriveMealTask(blank).step,'meal-start');
 let progress=startMealRelay(blank).progress;assert.equal(deriveMealTask(progress).action,'meal-pack');assert.match(deriveMealTask(progress).title,/0\/3/);
 progress=packCorrect(progress,'evening','lin');progress=sealMeal(progress,'evening','lin').progress;assert.match(deriveMealTask(progress).title,/1\/3/);
 progress.status='completed';progress.verified=true;progress.receipt={complete:true};assert.equal(isMealRoundComplete(progress),false);assert.equal(deriveMealTask(progress).target,'chef');
});
