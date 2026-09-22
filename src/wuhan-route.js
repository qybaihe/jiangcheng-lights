import {PROP_IDS, normalizePropProgress, ferryAvailability} from './prop-progress.js';
import {normalizeWuhanVisits} from './wuhan-visit-progress.js';

const stop = value => Object.freeze(value);

/** These are existing navigation destinations, not a second quest or reward ledger.
 * Order is a suggested walk; reading any stop at any time counts independently.
 * Keep the dock prop distinct from the eastern district's historic ticket window.
 */
export const WUHAN_ROUTE_NAME = '外公的顺路地图';
export const WUHAN_ROUTE_STOPS = Object.freeze([
  stop({id:'noodles',targetId:'noodles',kind:'lore',title:'先过个早',place:'蔡记过早',short:'热干面',key:'E',
    lead:'先去蔡姨门口。芝麻酱在碗底，别急着下筷子。',
    action:'在过早点按 E，查看“过早，要拌匀了”。',
    brief:'E 查看过早记忆，不是只从面摊经过。',
    connection:'一碗面的位置，是街坊替晚来的人留的。',
    completionLabel:'过早记忆已查看'}),
  stop({id:'wuhan-lifen',targetId:'wuhan-lifen',kind:'district',title:'认一认门牌',place:'燕归里',short:'里分门牌',key:'E',
    lead:'往东拐进燕归里，看看门牌下面的两排挂钩。',
    action:'停好车，按 E 读门牌旁的字条，读到最后盖章。',
    brief:'E 读完门牌字条，再盖下这一站的章。',
    connection:'钥匙忘带了，敲隔壁；外公认得的是整条巷子。',
    completionLabel:'门牌字条已读'}),
  stop({id:'wuhan-breakfast',targetId:'wuhan-breakfast',kind:'district',title:'再捎一口热的',place:'豆皮面窝摊',short:'豆皮面窝',key:'E',
    lead:'豆皮刚出锅。外公嘴上说随便吃点，手里总拎着两袋。',
    action:'在面窝摊按 E，读完旧价签与摊边的小黑板。',
    brief:'E 读旧价签，听听“零钱下回来再找”。',
    connection:'零钱下回来再找，热的先吃——熟人的日子不急这一会儿。',
    completionLabel:'旧价签已读'}),
  stop({id:'wuhan-bridge',targetId:'wuhan-bridge',kind:'district',title:'等一等桥上的车',place:'桥影下',short:'桥下合影',key:'E',
    lead:'桥影下有张没拍好的照片，外公却一直留着。',
    action:'在桥影小广场按 E，读完旧合影背面的字。',
    brief:'E 看合影背面，别只开车穿过桥下。',
    connection:'小孩抬头看火车，大人也跟着看；那半张脸，正陪在旁边。',
    completionLabel:'桥下合影已读'}),
  stop({id:'wuhan-market',targetId:'wuhan-market',kind:'district',title:'替楼上捎两根葱',place:'街坊市集',short:'街坊竹篮',key:'E',
    lead:'去市集看看那只竹篮，上面写了三户人家的门牌。',
    action:'把车停在市集外，按 E 读完篮沿留下的话。',
    brief:'E 读竹篮上的字，记下三户人家的顺路。',
    connection:'买菜的人替楼上带葱，回巷里的人再捎一碗米酒。',
    completionLabel:'竹篮故事已读'}),
  stop({id:'wuhan-ferry',targetId:'wuhan-ferry',kind:'district',title:'找回那张小船票',place:'江风渡口旧址',short:'旧轮渡票',key:'E',
    lead:'沿回车路到江边。票窗里，那张船票还缺着一角。',
    action:'在旧候船窗按 E，读完船票故事；这里是旧址。',
    brief:'E 读旧船票；真正登船要回老巷码头。',
    connection:'小孩想把撕下的票角也带回家，有人就替他收好了。',
    completionLabel:'旧船票已读'}),
  stop({id:PROP_IDS.ferry,targetId:PROP_IDS.ferry,kind:'prop',title:'把脚步交给江风',place:'老巷码头',short:'近岸往返',key:'F',
    lead:'沿滨江路回老码头，坐一班真正开出去的小渡船。',
    action:'在老码头按 F 登船，坐完整班近岸往返再回岸。',
    brief:'F 登船，完成一次近岸往返；提前返航不计。',
    connection:'回来的还是原码头；再看岸上亮着的窗，已经认得里面的人。',
    completionLabel:'近岸往返已完成'}),
]);

export function getWuhanRouteStop(id) {
  return WUHAN_ROUTE_STOPS.find(item => item.id === id) ?? null;
}

/** Pure projection of already-earned progress. Never writes, grants, or normalizes
 * back into the save; position, proximity, map selection and trip start are ignored.
 */
export function deriveWuhanRoute(value) {
  const state = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const lore = new Set(Array.isArray(state.lore) ? state.lore : []);
  const visits = new Set(normalizeWuhanVisits(state.wuhanVisits));
  const props = normalizePropProgress(state.props);
  const flags = Array.isArray(state.flags) ? state.flags : [];
  const availability = ferryAvailability({flags,runEnded:state.runEnded === true});
  const paused = !availability.available;
  const stops = WUHAN_ROUTE_STOPS.map((item,index) => ({...item,index,number:index + 1,
    done:item.kind === 'lore' ? lore.has(item.id) : item.kind === 'district' ? visits.has(item.id) : props.ferryRides > 0,
  }));
  const completedCount = stops.filter(item => item.done).length;
  const next = stops.find(item => !item.done) ?? null;
  return {
    name:WUHAN_ROUTE_NAME,stops,total:stops.length,completedCount,
    readCount:stops.filter(item => item.kind !== 'prop' && item.done).length,
    ferryComplete:props.ferryRides > 0,next,nextId:next?.id ?? null,
    complete:next === null,paused,
    pauseKind:paused ? (state.runEnded === true ? 'ended' : 'weather') : null,
    pauseReason:paused ? availability.title : '',
    pauseDetail:paused ? (state.runEnded === true ? '这一程已结束。记下的旧事，都还留在手账里。' : '先照应街坊；雨过、码头确认复航后，再接着逛。') : '',
    progressLabel:`已记 ${completedCount} / ${stops.length}`,
  };
}
