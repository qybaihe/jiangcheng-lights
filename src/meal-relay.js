/** 热食接力：分装、封盒、亲手交接。没有倒计时，已做好的事情不会因离开而丢失。 */
const freeze = object => { Object.values(object).forEach(value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) freeze(value); }); return Object.freeze(object); };
const own = (object, key) => typeof key === 'string' && Object.hasOwn(object, key);
const record = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
export const MEAL_FOODS = freeze({
  noodles: {id:'noodles', name:'热干面', detail:'芝麻酱拌匀了，再分进碗里。', container:'面碗'},
  doupi: {id:'doupi', name:'三鲜豆皮', detail:'金黄的蛋皮，底下是软糯的米。', container:'食盒'},
  soup: {id:'soup', name:'藕汤', detail:'蔡姨煨好的汤，装进有盖的汤盅。', container:'汤盅'},
});
export const MEAL_TOPPINGS = freeze({
  scallion: {id:'scallion', name:'葱花', options:[{id:'none',name:'不放葱'},{id:'on',name:'撒在上面'},{id:'side',name:'小碟另放'}]},
  chili: {id:'chili', name:'辣椒', options:[{id:'none',name:'不放辣'},{id:'on',name:'拌在里面'},{id:'side',name:'小碟另放'}]},
});
export const MEAL_STOPS = freeze({
  west: {id:'west', target:'meal-west', name:'西巷接力点', receiver:'陈姐', x:-17, y:0, z:.7, radius:3, description:'林婆婆小院外的公共主巷', landmark:'沿西巷到小院门前，把两份食盒交给陈姐。'},
  community: {id:'community', target:'meal-community', name:'社区小屋接力点', receiver:'小许', x:12, y:0, z:-3, radius:3, description:'社区小屋门前的干燥通道', landmark:'沿主巷到社区门前，小许在这里等你。'},
});
const order = (id, name, food, scallion, chili, stopId, note, response) => ({id,name,food,scallion,chili,stopId,note,response});
export const MEAL_ROUNDS = freeze({
  evening: {id:'evening', title:'一口热的', subtitle:'傍晚 · 蔡记过早铺', intro:'蔡姨已经把热食做好了。照着街坊的便签分三份，装好再沿主巷交给接应的人。', packingTarget:'chef', packingPosition:{x:10,y:0,z:12}, orders:[
    order('lin','林婆婆','noodles','none','none','west','还是热干面，不放葱，也不放辣。名字贴在盒上，陈姐会替我接。','陈姐接过面碗：“没放葱，对的。她刚还说，怕你记不住呢。”'),
    order('chen','陈姐','doupi','on','side','west','给我一份豆皮，撒点葱。辣椒另放，等坐下来再慢慢加。','陈姐把辣椒碟收进盒边：“哎，真的分开放了。你快去吧，婆婆这边有我。”'),
    order('xu','小许','soup','on','none','community','留一盅藕汤，放一点葱，不放辣。忙完这阵，我也坐下来喝口热的。','小许两手接住汤盅：“我都忘了自己还没吃。谢谢你，我先把这份也记上。”'),
  ], completion:'三份热食都交到了手里。不是“应该送到了”，是你亲手把名字一一对上了。'},
  morning: {id:'morning', title:'骑车送过早', subtitle:'次晨 · 蔡记过早铺', intro:'天晴了。蔡姨又记下三份过早，沿熟悉的路，把早晨的热气送过去。', packingTarget:'chef', packingPosition:{x:10,y:0,z:12}, orders:[
    order('lin','林婆婆','doupi','none','none','west','今早换豆皮尝尝，葱和辣都不要。陈姐还是在院门口。','陈姐笑了：“她今天换了口味。你连这句也记着。”'),
    order('chen','陈姐','noodles','on','side','west','热干面要葱，辣椒给我另外装。豆皮那一份是婆婆的，别贴反名字。','陈姐接过热干面：“一闻就晓得是蔡记的。下回坐下来一起吃。”'),
    order('xu','小许','doupi','side','none','community','豆皮就好，不要辣。葱花也另放，我想先尝一口原味。','小许把便签折好：“今天不用赶了。送完这趟，你也记得去过早。”'),
  ], completion:'过早送到了。走过的还是那几条巷子，已经有人会叫住你吃一口。'},
});
const getRound = id => own(MEAL_ROUNDS,id) ? MEAL_ROUNDS[id] : null;
const getOrder = (roundId,orderId) => getRound(roundId)?.orders.find(item => item.id === orderId) || null;
const fields = ['food','scallion','chili','label'];
const blankBox = () => ({food:null,scallion:null,chili:null,label:null,sealed:false,delivered:false});
const matchesOrder = (box,item) => box.food === item.food && box.scallion === item.scallion && box.chili === item.chili && box.label === item.id;

/** Persist only known selections. Completion is derived from valid, sealed,
 * delivered boxes; arbitrary status/receipt/verified fields have no effect. */
export function normalizeMealProgress(value) {
  const input = record(record(value).rounds), rounds = {};
  for (const [id,round] of Object.entries(MEAL_ROUNDS)) {
    const old = record(input[id]), source = record(old.boxes), started = old.started === true, boxes = {};
    for (const item of round.orders) {
      const raw = record(source[item.id]), box = blankBox();
      if (started) {
        box.food = own(MEAL_FOODS,raw.food) ? raw.food : null;
        for (const field of ['scallion','chili']) box[field] = MEAL_TOPPINGS[field].options.some(option => option.id === raw[field]) ? raw[field] : null;
        box.label = round.orders.some(candidate => candidate.id === raw.label) ? raw.label : null;
        box.sealed = raw.sealed === true && matchesOrder(box,item);
        box.delivered = box.sealed && raw.delivered === true;
      }
      boxes[item.id] = box;
    }
    rounds[id] = {started,boxes};
  }
  return {version:1,rounds};
}
export function mealSummary(value,roundId='evening') {
  const round = getRound(roundId), progress = normalizeMealProgress(value), state = progress.rounds[roundId];
  if (!round) return {started:false,total:0,sealed:0,delivered:0,ready:false,completed:false,pending:[]};
  const sealed = round.orders.filter(order => state.boxes[order.id].sealed).length;
  const delivered = round.orders.filter(order => state.boxes[order.id].delivered).length;
  return {started:state.started,total:round.orders.length,sealed,delivered,ready:sealed === round.orders.length,completed:delivered === round.orders.length,pending:round.orders.filter(order => !state.boxes[order.id].delivered).map(order => order.id)};
}
export const isMealRoundComplete = (value,roundId='evening') => mealSummary(value,roundId).completed;
export function mealPackingIssues(value,roundId,orderId) {
  const round = getRound(roundId), item = getOrder(roundId,orderId);
  if (!round || !item) return ['这份便签不在本轮清单里。'];
  const box = normalizeMealProgress(value).rounds[roundId].boxes[orderId], issues = [];
  if (box.food !== item.food) issues.push(box.food ? `${item.name}要的是${MEAL_FOODS[item.food].name}，换一下主食就好。` : '先从桌上选一份热食。');
  for (const field of ['scallion','chili']) if (box[field] !== item[field]) {
    const expected = MEAL_TOPPINGS[field].options.find(option => option.id === item[field]);
    issues.push(box[field] === null ? `还没决定${MEAL_TOPPINGS[field].name}怎么放。` : `${item.name}的${MEAL_TOPPINGS[field].name}要“${expected.name}”，只调整这一项就好。`);
  }
  if (box.label !== item.id) issues.push(box.label ? '名字贴错了；把这份便签上的名字换上去。' : '最后，记得贴上收件人的名字。');
  return issues;
}
/** sample comes from the world's player, never from a success button or a saved
 * result. A vehicle, seated/flying avatar, or remote click is not a handover. */
export function mealDeliveryAvailability(value,roundId,orderId,sample={}) {
  sample = record(sample);
  const round = getRound(roundId), item = getOrder(roundId,orderId), state = normalizeMealProgress(value).rounds[roundId];
  const no = (code,message) => ({available:false,code,message});
  if (!round || !item) return no('unknown-order','这份便签不在本轮清单里。');
  if (!state.started) return no('not-started','先到蔡姨的铺子，收好这轮便签。');
  const box = state.boxes[orderId];
  if (box.delivered) return no('already-delivered','这份已经亲手交到了，不用再送一次。');
  if (!box.sealed) return no('not-sealed','这份还没封盒。回蔡姨的桌前核对好，再带出来。');
  if (sample.mode !== 'walk') return no('not-walking','先停车下车，再走近把食盒交到对方手里。');
  if (sample.grounded !== true || !['x','y','z'].every(axis => Number.isFinite(sample[axis]))) return no('not-grounded','在接力点的地面上站稳，再交接食盒。');
  const stop = MEAL_STOPS[item.stopId];
  if (Math.abs(sample.y-stop.y) > 1.25) return no('wrong-height','接应的人在巷口地面上，先回到同一条通道。');
  if (Math.hypot(sample.x-stop.x,sample.z-stop.z) > stop.radius) return no('wrong-place',`${item.name}的这份要在${stop.name}，亲手交给${stop.receiver}。`);
  return {available:true,code:'ready',message:`把${item.name}的${MEAL_FOODS[item.food].name}交给${stop.receiver}。`,stop};
}

export function transitionMeal(value,action={}) {
  action = record(action);
  const progress = normalizeMealProgress(value), roundId = action.roundId ?? 'evening', round = getRound(roundId);
  const before = mealSummary(progress,roundId).completed;
  const result = (ok,code,message) => ({progress,ok,code,message,roundId,orderId:action.orderId ?? null,completed:mealSummary(progress,roundId).completed,justCompleted:!before && mealSummary(progress,roundId).completed});
  if (!round) return result(false,'unknown-round','没有找到这一轮热食便签。');
  const state = progress.rounds[roundId];
  if (action.type === 'start') {
    if (state.started) return result(true,'already-started','便签和已经装好的食盒都还在，接着上次做就好。');
    state.started = true; return result(true,'started','三张便签收好了。先看名字和口味，再动手分装。');
  }
  if (action.type === 'cancel') return result(true,'saved','食盒和便签已收好，回来可以接着做。');
  if (!['pack','remove','seal','deliver'].includes(action.type)) return result(false,'unknown-action','这一步还没有改变食盒。');
  if (!state.started) return result(false,'not-started','先和蔡姨确认这轮便签。');
  const item = getOrder(roundId,action.orderId);
  if (!item) return result(false,'unknown-order','这份便签不在本轮清单里。');
  const box = state.boxes[item.id];
  if (action.type === 'deliver') {
    const check = mealDeliveryAvailability(progress,roundId,item.id,action.sample);
    if (!check.available) return result(false,check.code,check.message);
    box.delivered = true; return result(true,'delivered',item.response);
  }
  if (action.type === 'seal') {
    if (box.sealed) return result(false,'already-sealed','这份已经封好了，放在保温篮里等你出发。');
    const issues = mealPackingIssues(progress,roundId,item.id);
    if (issues.length) return {...result(false,'needs-correction',issues[0]),issues};
    box.sealed = true; return result(true,'sealed',`${item.name}的${MEAL_FOODS[item.food].name}封好了。名字和口味都对上了。`);
  }
  if (box.sealed) return result(false,'box-sealed','已经核对封好的食盒，留在保温篮里就好。');
  if (!fields.includes(action.field)) return result(false,'unknown-field','请调整热食、葱花、辣椒或名字。');
  if (action.type === 'remove') { box[action.field] = null; return result(true,'removed','这一项先取出来，其他准备好的都留着。'); }
  const valid = action.field === 'food' ? own(MEAL_FOODS,action.value) : action.field === 'label' ? round.orders.some(item => item.id === action.value) : MEAL_TOPPINGS[action.field].options.some(option => option.id === action.value);
  if (!valid) return result(false,'unknown-choice','桌上没有这一项，再从现有选项里挑一下。');
  box[action.field] = action.value;
  const label = action.field === 'food' ? MEAL_FOODS[action.value].name : action.field === 'label' ? round.orders.find(item => item.id === action.value).name : MEAL_TOPPINGS[action.field].options.find(option => option.id === action.value).name;
  return result(true,'packed',action.field === 'label' ? `贴上了“${label}”。核对便签后，就可以封盒。` : `已选：${label}。慢慢来，把这一份照顾好。`);
}
export const startMealRelay = (value,roundId='evening') => transitionMeal(value,{type:'start',roundId});
export const packMeal = (value,roundId,orderId,field,choice) => transitionMeal(value,{type:'pack',roundId,orderId,field,value:choice});
export const removeMeal = (value,roundId,orderId,field) => transitionMeal(value,{type:'remove',roundId,orderId,field});
export const sealMeal = (value,roundId,orderId) => transitionMeal(value,{type:'seal',roundId,orderId});
export const deliverMeal = (value,roundId,orderId,sample) => transitionMeal(value,{type:'deliver',roundId,orderId,sample});
export function deriveMealTask(value,roundId='evening') {
  const round = getRound(roundId); if (!round) return null;
  const progress = normalizeMealProgress(value), summary = mealSummary(progress,roundId);
  const task = (step,action,title,desc,target,position,hint=desc) => ({step,action,title,desc,target,position,hint,roundId,location:target === 'chef' ? '蔡姨的过早铺' : Object.values(MEAL_STOPS).find(stop => stop.target === target)?.name || '晴川里'});
  if (!summary.started) return task('meal-start','visit','蔡姨留了三张便签','到过早铺听听街坊想吃什么。','chef',{...round.packingPosition});
  if (!summary.ready) return task('meal-pack','meal-pack',`把名字和口味装好 · ${summary.sealed}/${summary.total}`,'照着三张便签分装热食，核对后逐份封盒。','chef',{...round.packingPosition},'每份都要选好热食、葱花、辣椒和名字。装错只改这一项；离开会保留进度。');
  if (summary.completed) return task('meal-complete','complete','热食都交到了手里',round.completion,null,null);
  const first = round.orders.find(item => !progress.rounds[roundId].boxes[item.id].delivered), stop = MEAL_STOPS[first.stopId];
  const names = round.orders.filter(item => item.stopId === stop.id && !progress.rounds[roundId].boxes[item.id].delivered).map(item => item.name).join('、');
  return task('meal-deliver','meal-deliver',`热食接力 · 已交接 ${summary.delivered}/${summary.total}`,`把${names}的食盒交给${stop.receiver}。`,stop.target,{x:stop.x,y:stop.y,z:stop.z},`${stop.landmark} 可以骑车或开车赶路，抵达后下车交接。两处先去哪边都可以。`);
}
export const deriveTask = deriveMealTask;
