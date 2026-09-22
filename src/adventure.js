import {wuhanDistrictRegionAt} from './wuhan-district-layout.js';
/** Optional exploration, independent of the delivery/emergency story.
 * Progress arguments are state.adventure, never the entire game save.
 * Reading is always presented in the current 3D scene. The UI calls discover
 * only after the last line; opening or leaving a reading does not collect it.
 */
const line = (who, text) => Object.freeze({ who, text });
const stop = value => Object.freeze({ adventure:true, icon:'spark', color:'#dfbc79', ...value, lines:Object.freeze(value.lines) });

export const ADVENTURE_TITLE = '追着江风找灯';
export const ADVENTURE_STOPS = Object.freeze([
  stop({
    id: 'kite-tools', name: '工具巷里的旧燕子', label: '旧燕子的纸尾',
    x: -21.45, z: 12.2, radius: 1.75,
    routeHint: '修理铺背后，寻找旧燕子',
    hint: '修理铺侧面传来纸尾的轻响。木夹后，像是藏着一只旧燕子。',
    lines: [
      line('旁白', '修理铺侧门旁，一只旧燕子风筝压在木夹里。两根蓝布尾巴从木夹后探出来，被风吹得一前一后。'),
      line('阿遥', '是小时候那只……左翅这道歪歪的线，还是我缝的。'),
      line('外公的灯语', '小时候你总抢着跑到前面。今天，顺着燕子找找看。往院后的北街走，下一盏灯在那里。'),
      line('旁白', '风筝背面夹着一张旧纸条，只露出一个“借”字。余下的字，被折进去的纸角遮住了。'),
      line('阿遥', '借给谁的？外公还给我留了个谜。'),
      line('旁白', '蓝布尾巴朝着巷子深处轻轻扬起。从小院外的公共通道绕过去，就能走到北街。'),
    ],
  }),
  stop({
    id: 'kite-courtyard', name: '院后北街的灯语', label: '灯罩下的蓝布',
    x: -11.4, z: -13, radius: 1.8,
    routeHint: '绕到院后，寻找蓝布和风铃',
    hint: '院后的灯罩下系着一截蓝布，结扣打得像燕子尾巴。纸条上留着几行不同的笔迹。',
    lines: [
      line('旁白', '院后的灯罩下系着同样的蓝布。这里的纸条多露出几个字：“借给老陆，先用着。”'),
      line('阿遥', '原来是外公向别人借灯。'),
      line('街坊的灯语', '手电借你一晚，陪孩子在栏内看江。回来的时候，记得往我这里拐一下。'),
      line('旁白', '这几行字不是外公写的。纸背却有他画的小燕子，旁边是一条缓缓向上的线。'),
      line('外公的灯语', '沿北街向东走，找通向听风台的缓坡。到了能望见江面的地方，再回头看看这条巷子。'),
      line('阿遥', '那盏灯，后来还回来了吗？'),
    ],
  }),
  stop({
    id: 'kite-terrace', name: '听风台上的借灯条', label: '江风里的那盏灯',
    x: 33, z: -16.2, radius: 1.65,
    routeHint: '沿江向东，登上听风台',
    hint: '听风台栏内的一盏小灯旁，蓝布纸尾正在轻响。木夹里压着一张折好的旧借条。',
    lines: [
      line('旁白', '走上听风台，栏杆外的江面渐渐展开，风把来时的街声送到身后。小灯旁的木夹里，留着完整的借条。'),
      line('借灯条', '老陆借手电一只，陪阿遥去栏内看桥影。回巷口时交还。孩子说只认得桥上的灯，还要再来一趟。——周'),
      line('外公的灯语', '那天你把江上的船灯认作星星，还问，武汉的星星怎么跑得这么快。回去路上讲个不停，连手电都忘了还。'),
      line('外公的灯语', '我在借条后头补了一行：明天先还灯，再带一碗面去。哪件事答应了，就记下来，别光说自己记性好。'),
      line('阿遥', '字是外公写的，旁边这个歪星星倒像我画的。等他回来，再一起站在栏内看看，这回慢慢认。'),
      line('旁白', '你把借条重新夹好。风把纸尾吹向来时的巷子。那盏灯还留在原处，等下一个愿意停下来的人。'),
    ],
  }),
]);

const byId = new Map(ADVENTURE_STOPS.map(value => [value.id, value]));

/** Keep only legal discoveries in their original order. Unknown, duplicate or
 * premature IDs cannot fill a missing earlier stop in a damaged save.
 * Always returns a new JSON-safe object and array; unrelated fields are dropped.
 */
export function normalizeAdventureState(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) &&
    Object.hasOwn(raw, 'found') && Array.isArray(raw.found) ? raw.found : [];
  const found = [];
  for (const id of source) {
    if (found.length === ADVENTURE_STOPS.length) break;
    if (id === ADVENTURE_STOPS[found.length].id) found.push(id);
  }
  return { found };
}

/** Next unread stop, or null after all three. No main-story flags are consulted. */
export function currentAdventureStop(progress) {
  return ADVENTURE_STOPS[normalizeAdventureState(progress).found.length] ?? null;
}

/** Records only the next stop. Re-reading, unknown IDs and out-of-order attempts
 * are harmless no-ops on values, while still returning a fresh state object.
 */
export function discoverAdventure(progress, id) {
  const next = normalizeAdventureState(progress);
  const current = ADVENTURE_STOPS[next.found.length];
  if (current && current.id === id) next.found.push(id);
  return next;
}

/** UI reading contract: stop, mode, canDiscover, lines. Future stops offer only
 * their atmosphere hint; revisits show the original text without another award.
 * The returned lines are immutable narrative data, not a progress mutation.
 */
export function adventureReading(progress, id) {
  const location = byId.get(id);
  if (!location) return null;
  const { found } = normalizeAdventureState(progress);
  const revisit = found.includes(id), canDiscover = ADVENTURE_STOPS[found.length]?.id === id;
  return {
    stop: location,
    mode: revisit ? 'revisit' : canDiscover ? 'discover' : 'teaser',
    canDiscover,
    lines: revisit || canDiscover ? location.lines : Object.freeze([line('旁白', location.hint)]),
  };
}

/** Proximity enables an E prompt, never an automatic discovery. */
export function nearestAdventureStop(x, z) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  let nearest = null, distance = Infinity;
  for (const location of ADVENTURE_STOPS) {
    const d = Math.hypot(x - location.x, z - location.z);
    if (d <= location.radius && d < distance) { nearest = location; distance = d; }
  }
  return nearest;
}

// Platform precedes ramp so their shared top edge has one stable region title.
const REGIONS = Object.freeze([
  { id:'wind-terrace', name:'听风台', subtitle:'江面在前，来时的灯在身后', x:29.5, X:36.5, z:-18, Z:-14.7 },
  { id:'wind-ramp', name:'听风坡', subtitle:'顺着缓坡，慢慢走到江风里', x:32, X:35.2, z:-14.7, Z:-.3 },
  { id:'courtyard-north', name:'院后北街', subtitle:'窗后的灯，也照着别人的归路', x:-14.6, X:-7.5, z:-15.5, Z:-10.7 },
  { id:'tool-alley', name:'工具巷', subtitle:'拐过墙角，听见纸尾轻响', x:-22.65, X:-20.25, z:10.6, Z:17.8 },
].map(Object.freeze));

/** Region label or null. The UI owns entry detection/display duration; this
 * function has no timer, visit flag, discovery effect or mandatory pause.
 */
export function adventureRegionAt(x, z) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  const region = REGIONS.find(r => x >= r.x && x <= r.X && z >= r.z && z <= r.Z);
  return region ? { id:region.id, name:region.name, subtitle:region.subtitle } : wuhanDistrictRegionAt(x,z);
}
