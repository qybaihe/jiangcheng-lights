// New present-day lines are independent from the approved story-v3 recording.
// Each new text has its own id; absent audio intentionally falls back to text.
const freeze = Object.freeze;
const portraits = freeze({阿遥:'player',林婆婆:'granny',蔡姨:'chef',小许:'xu',陈姐:'walker0'});
const line = (id, who, text) => freeze({
  id:`life-v1-${id}`, who, text, time:'present',
  portrait:portraits[who], scope:'playful-life-v1',
});
const scene = (title, placeId) => freeze({title, placeId});

export const PLAYFUL_LIFE_SCENES = freeze({
  photoIntro:scene('旧照里的位置','granny'),
  // A non-POI local id keeps an aside at the player's position. Empty ids in
  // World.beginConversation inherit the nearest POI (or even the shop).
  photoAligned:scene('原来是这个角度','photo-self'),
  photoReturn:scene('巷口的那张凳子','granny'),
  foodPackIntro:scene('一口热的','chef'),
  foodReady:scene('稳稳地送到','chef'),
  foodHandoff:scene('这份是给你的','community'),
  foodMorningHandoff:scene('你也坐下吃一口','community'),
  foodHandoffWest:scene('院门口的两份热食','walker0'),
  foodReplay:scene('再练一回分装','chef'),
  foodPostlude:scene('天晴了，去送过早','chef'),
  foodMorningAfter:scene('这回，坐下来吃','chef'),
});

export const PLAYFUL_LIFE_DIALOGUES = freeze({
  photoIntro:freeze([
    line('photo-intro-ask','林婆婆','这儿还夹着旧照片。你认得在哪儿拍的吗？'),
    line('photo-intro-look','阿遥','有点眼熟。我拿着去比一比。'),
    line('photo-intro-care','林婆婆','沿主巷慢慢看，找到了回来告诉我。'),
  ]),
  photoAligned:freeze([
    line('photo-aligned-angle','阿遥','找到了。原来是这个角度。'),
    line('photo-aligned-return','阿遥','拍一张现在的，带回去给婆婆看看。'),
  ]),
  photoReturn:freeze([
    line('photo-return-show','阿遥','您看，还认得出来吧？'),
    line('photo-return-place','林婆婆','认得。以前吃完饭，就爱往巷口搬凳子。'),
    line('photo-return-question','阿遥','能坐一晚上？'),
    line('photo-return-answer','林婆婆','哪坐得住。谁家喊一声，又起来帮忙了。'),
  ]),
  foodPackIntro:freeze([
    line('food-pack-ask','蔡姨','三份：婆婆的面、陈姐的豆皮，还有给小许的藕汤。'),
    line('food-pack-answer','阿遥','口味都在纸条上？'),
    line('food-pack-note','蔡姨','嗯。两份交给西巷的陈姐，汤送社区给小许。'),
    line('food-pack-handoff','蔡姨','名字贴好，盖子扣稳，再出发。'),
  ]),
  foodReady:freeze([
    line('food-ready-care','蔡姨','西巷两份，社区一份。走主巷，别赶。'),
    line('food-ready-answer','阿遥','好，我交到她们手上。您也趁热吃一口。'),
  ]),
  foodHandoff:freeze([
    line('food-handoff-arrival','阿遥','小许，蔡姨给你留了藕汤。'),
    line('food-handoff-receipt','小许','还给我留了啊。'),
    line('food-handoff-care','阿遥','放了葱，没放辣。先喝点，别光顾着别人。'),
    line('food-handoff-answer','小许','好，点完这几个名字，我就喝。'),
  ]),
  foodMorningHandoff:freeze([
    line('food-morning-handoff-arrival','阿遥','你的豆皮。不放辣，葱花另外装了。'),
    line('food-morning-handoff-answer','小许','记得这么清楚。你也去吃吧，今天不赶了。'),
  ]),
  foodHandoffWest:freeze([
    line('food-west-handoff-arrival','阿遥','两份都在这儿了。婆婆那份，名字也贴好了。'),
    line('food-west-handoff-answer','陈姐','好，我给她拿进去。你也记得回蔡姨那儿吃一口。'),
  ]),
  foodReplay:freeze([
    line('food-replay-note','蔡姨','拿空盒再试一遍？纸条还在。'),
    line('food-replay-answer','阿遥','这回我自己记。'),
  ]),
  foodPostlude:freeze([
    line('food-postlude-breakfast','蔡姨','天晴了，今天又是三份过早。婆婆换了豆皮，别照昨天的装。'),
    line('food-postlude-answer','阿遥','我先看看纸条。送完了，也来吃一份。'),
  ]),
  foodMorningAfter:freeze([
    line('food-morning-after-return','蔡姨','送完啦？你的豆皮在这儿，还热着。'),
    line('food-morning-after-answer','阿遥','这回我坐着吃，不往外跑了。'),
  ]),
});

export const PLAYFUL_LIFE_COPY = freeze({
  photoAccepted:'旧照已夹进手账 · 沿主巷寻找相同的角度',
  photoAligned:'旧景和眼前对上了 · 把发现带给林婆婆',
  photoCollected:'这一刻已收进画廊 · 旧照里的位置',
  photoReplay:'重看已找回的街景，不改变这一回的主线进度。',
  foodPacked:'食盒已封好 · 西巷交陈姐，社区交小许',
  foodInTransit:'已分装，待签收',
  foodDelivered:'热食已签收 · 这一次，是你把它送到了',
  foodReplay:'空盒练习 · 不重复配送，不覆盖本次交接记录',
  voicePending:'这句暂以文字呈现',
});

// Keep approved archival lines untouched. Apply only to the live playable
// route whose food delivery is actually performed by the player.
const FOOD_LINE_OVERRIDES = freeze({
  'chef-present-dispatch':freeze({
    pending:'饭好了。你再搭把手，按纸条分几份。',
    packed:'两份给西巷的陈姐，汤给小许。别赶，稳稳地送。',
    delivered:'两边都收到了。来，喝口水，歇一下。',
  }),
  'community-report-ready':freeze({
    pending:'蔡姨那边正在备饭。周伯说那几家他联系。',
    packed:'两边的热食我来送。周伯说那几家他联系。',
    delivered:'陈姐接了食盒，你的汤也到了。周伯说那几家他联系。',
  }),
  'revisit-chef-prepared':freeze({
    pending:'纸条搁在这儿，咱们把这几份分好。',
    packed:'陈姐在西巷，小许在社区。两边都记得去，路上慢点。',
    delivered:'陈姐和小许都收到了。辛苦，坐一会儿吧。',
  }),
});

/** Returns an unmodified line unless this is a live food-delivery revision. */
export function playfulLifeLine(source, {foodMode=null}={}) {
  if(!source || source.time!=='present')return source;
  const overrides=Object.hasOwn(FOOD_LINE_OVERRIDES,source.id)?FOOD_LINE_OVERRIDES[source.id]:null;
  const text=overrides&&Object.hasOwn(overrides,foodMode)?overrides[foodMode]:null;
  if(typeof text!=='string')return source;
  const {draftId, ...lineData}=source;
  return freeze({...lineData, id:`life-v1-${source.id}-${foodMode}`,
    sourceLineId:source.id, text, scope:'playful-life-v1'});
}
