// Optional conversations belong to the street, not to the main-story graph.
// All personal anecdotes are fictional. No completion grants supplies or flags.
const topic = (id, title, teaser, lines) => Object.freeze({id, title, teaser, lines:Object.freeze(lines)});
const resident = value => Object.freeze({...value, greetings:Object.freeze(value.greetings), topics:Object.freeze(value.topics)});

export const RESIDENT_PHASES = Object.freeze(['beforeRain', 'warning', 'afterRain']);
export const RESIDENT_PHASE_LABELS = Object.freeze({beforeRain:'雨来以前', warning:'雨声渐近', afterRain:'雨歇之后'});

export const RESIDENTS = Object.freeze([
  resident({
    id:'granny', name:'林婆婆', role:'爱听收音机的老街坊', monogram:'林', detail:'竹床挪过几回，街坊的声音还认得。',
    greetings:{
      beforeRain:'阿遥，来啦。站这儿歇歇，我正好把扇子收一收。',
      warning:'阿遥，就在干燥的廊下说两句。陈姐和我约好了，你莫挂心。',
      afterRain:'雨歇了，听得见巷子里的人声了。阿遥，走累没有？',
    },
    topics:[
      topic('bamboo-bed','竹床上的小规矩','一张竹床，怎样坐下半条巷子。',[
        '从前夏天热，我们把竹床搬到天井里，先拿湿布擦一遍。',
        '谁家先坐下，谁就替后来的人留个角，不用专门开口。',
        '小孩子在床底找滚走的玻璃弹珠，上头的人还当他们睡着了。',
        '如今一听竹床响，我总想把脚缩回来，怕挡了谁。',
      ]),
      topic('radio-dial','旋钮要慢慢拧','比节目先来的，是熟悉的沙沙声。',[
        '我以前找电台，先把旋钮拧过头，再一点点往回退。',
        '陈姐在窗外听见沙沙响，就问我是不是又没找准。',
        '有时节目已经开了头，我还忙着跟她搭话，半句都没听进耳朵。',
        '收音机开着，屋里像多了个不催你说话的人。',
      ]),
      topic('enamel-cup','搪瓷缸底下的记号','借出去的东西，总有回来的办法。',[
        '巷子里借个碗、借只缸子，是常有的事。',
        '我怕拿混，就在搪瓷缸底下点了个小小的蓝点。',
        '后来发现陈姐也点蓝点，我们俩站在门口比了半天。',
        '最后一人拿一个，里面的绿豆汤倒是分得很匀。',
      ]),
    ],
  }),
  resident({
    id:'chef', name:'蔡姨', role:'蔡记过早铺掌勺人', monogram:'蔡', detail:'锅边忙归忙，记得谁爱哪一口。',
    greetings:{
      beforeRain:'阿遥，来了。过早的摊收了，我手上这锅还忙着，嘴巴倒有空。',
      warning:'来，站干燥这边，莫堵着送饭的路。说两句，我耳朵听着。',
      afterRain:'空饭盒慢慢收齐了。明早的豆皮还得备，陪我聊两句？',
    },
    topics:[
      topic('first-noodles','头一回拌热干面','手忙脚乱，也是从一碗面开始的。',[
        '我年轻时帮人看摊，头一碗热干面，酱和面各在各的地方。',
        '师傅没骂我，叫我自己吃，吃到底下咸得直找水。',
        '后来我学会先把筷子挑进去，连碗底也照顾到。',
        '现在看人只拌上面，我那只手就忍不住想伸过去。',
      ]),
      topic('doupi-edge','豆皮的边角归谁','锅边那一圈，早有人惦记。',[
        '豆皮一出锅，总有人先盯边角，觉得那一口脆得有意思。',
        '罗娟问过我，能不能替她留一块，我叫她先起得来再说。',
        '第二天她真早到了，头发还翘着，进门先指锅边。',
        '我没忍住笑，差点把她要的那块分给后头的人。',
      ]),
      topic('breakfast-orders','不用开口的老主顾','过早的花样多，记法也各不同。',[
        '有人早上就认热干面，有人隔几天换豆皮、面窝，换着吃。',
        '我最初记不住脸，只记得这个少一点辣，那个豆浆别装太满。',
        '贺师傅总把报纸折好才端碗，折纸声一响，我就晓得是他。',
        '后来他换了眼镜，我还是听那一声认出来的。',
      ]),
    ],
  }),
  resident({
    id:'dock', name:'周伯', role:'退休后仍爱看船的街坊', monogram:'周', detail:'口袋里装过船票，也装过一把江风。',
    greetings:{
      beforeRain:'阿遥，棚子里坐。船来船往的，看一会儿也不耽误什么。',
      warning:'这会儿不登船，就在岸内聊。风声大，我说慢一点。',
      afterRain:'阿遥，又顺路来了？过江看当班告示，闲话我倒随时有。',
    },
    topics:[
      topic('ticket-pocket','衣袋里留下的船票','洗衣服前，得先翻翻口袋。',[
        '以前坐完轮渡，我常把纸船票往衬衣口袋里一塞。',
        '回家忘了掏，洗完晾出来，口袋里就粘着一小团纸。',
        '后来学乖了，进门先放在柜上，倒越攒越多。',
        '贺师傅说可以拿去做书签，我说先别急，这几张还有肥皂味。',
      ]),
      topic('arriving-shore','快靠岸的那阵安静','人还没下船，心已经往家走了。',[
        '我爱看船快靠岸的时候，刚才还说笑的人，都开始摸自己的包。',
        '有人把菜提稳，有人替孩子理一理领子。',
        '我年轻时总急，后来才觉得，在座位上多坐片刻也好。',
        '等船停稳了再走，岸上的那碗饭又不会长脚。',
      ]),
      topic('river-hat','那顶总戴不正的帽子','江风不按人的意思吹。',[
        '我有顶旧布帽，出门前戴得正正的，到江边就歪。',
        '以前还怪镜子挂斜了，后来发现，是我总朝着船来的方向扭头。',
        '宋远想给我画张像，我让他把帽子画正一点。',
        '他偏说歪着才像，我一看，倒还真是。',
      ]),
    ],
  }),
  resident({
    id:'community', name:'小许', role:'晴川里社区工作者', monogram:'许', detail:'从门牌号，慢慢记到每个人的名字。',
    greetings:{
      beforeRain:'阿遥，正好路过？我把这页夹稳，咱们慢慢说。',
      warning:'阿遥，名单我还在核。可以聊两句，来电话时容我先接一下。',
      afterRain:'主巷的情况核好了，低处还是绕着走。总算能坐稳说句话了。',
    },
    topics:[
      topic('first-notice','第一张通知写太满了','大字和空白，都是后来学的。',[
        '我刚来时写通知，恨不得把每句话都塞进一张纸。',
        '林婆婆站远了看，问我这是通知，还是考眼睛。',
        '贺师傅帮我把字放大，又留了几块空白，我起初还嫌浪费。',
        '后来有人看一眼就找对地方，我才晓得空着也有用。',
      ]),
      topic('spare-chair','先搬一张空椅子','认识街坊，不只靠一张名单。',[
        '我刚认门牌那阵，喊人总要先低头看本子。',
        '陈姐叫我把本子合上，搬张椅子坐到她们旁边。',
        '坐了一会儿，谁家猫躲着谁，谁的袖子又长了，我全听到了。',
        '第二回再碰面，名字反倒不用翻了。',
      ]),
      topic('clock-reminder','忘了看手机的傍晚','钟声一来，才发现纸上全是圈。',[
        '有回我整理旧表格，低着头，把约好的晚饭都忘了。',
        '窗外听见江汉关的钟声，我才抬头找手机。',
        '程岚已经在门口等着，说不催，怕我把刚改的地方又抄错。',
        '现在她约我吃饭，会先叫我把笔帽盖上。',
      ]),
    ],
  }),
  resident({
    id:'walker0', name:'陈姐', role:'退休缝纫师傅', monogram:'陈', detail:'针线收在包里，手上总舍不得闲着。',
    greetings:{
      beforeRain:'阿遥，认得我吧，陈姐。刚从林婆婆那里出来，走两步透口气。',
      warning:'我和林婆婆都约好了，走干燥的主巷。你也别赶，来这边说话。',
      afterRain:'地上还潮，鞋底慢点落。阿遥，难得看你不赶路。',
    },
    topics:[
      topic('pillow-patch','竹床上的花布补丁','小小一块布，总有人嫌它不够大。',[
        '以前天热睡竹床，枕头套磨破了，拿块花布补上还能用。',
        '有个孩子嫌补丁小，说看不全上头那朵花。',
        '我索性缝个大口袋，他把弹珠全装进去，一翻身就哗啦响。',
        '后来还是拆了，不然整条巷子都要跟着他醒。',
      ]),
      topic('umbrella-stitch','舍不得换的旧伞','认一把伞，有时靠的是针脚。',[
        '我有把伞，伞面松过线，自己沿着原来的针眼缝了一遍。',
        '线用得深了些，撑开像多了条歪歪的路。',
        '有回收伞时几把放一处，别人都在看伞柄，我一眼就找着了。',
        '宋远说这条路有意思，我说你试过缝直，就不觉得有意思了。',
      ]),
      topic('recognise-clothes','我是怎么认出你的','衣裳会变，有些小动作还在。',[
        '做衣裳久了，我见人先看肩膀，再看袖口。',
        '有人小时候老爱拽左边袖子，长大穿衬衣，还是那个动作。',
        '林婆婆说我净记这些没用的，我说比只记个名字牢。',
        '这不，街坊走到巷口，还没出声，我手已经抬起来了。',
      ]),
    ],
  }),
  resident({
    id:'walker1', name:'贺师傅', role:'老印刷工，闲时替人装订书报', monogram:'贺', detail:'看一张纸，先把翘起来的角抚平。',
    greetings:{
      beforeRain:'小伙子小姑娘我有时认不准，阿遥倒记得。来，别踩这张飘来的纸。',
      warning:'纸都收进袋子了，没让它乱飞。站廊下聊吧，外头的风渐渐硬了。',
      afterRain:'湿了的纸先摊开晾，心急不得。阿遥，今天倒有工夫说句话。',
    },
    topics:[
      topic('ticket-bookmark','船票夹在哪一页','不起眼的纸片，替人记住读到哪里。',[
        '我看旧书，喜欢拿用过的船票当书签，薄，不把书脊顶坏。',
        '周伯那几张带肥皂味的，我可没收，我要的是平平整整的。',
        '有次借书给人，书还回来，票上多写了句“这页好看”。',
        '我就从那一页又看了一遍，倒像和人隔空聊了个天。',
      ]),
      topic('paper-margin','报纸总要留一点边','纸上的热闹，有一部分留给读的人。',[
        '排字的时候，边上要留空，不是字越挤越像回事。',
        '蔡姨读小报，常在旁边补一句自己的话，字比印的还神气。',
        '我起初替纸心疼，后来觉得，这才像有人真看了。',
        '自己那张我倒舍不得写，就在边角折个小小的记号。',
      ]),
      topic('customs-bell','抬头听见江汉关','工作台前，也有属于江边的声音。',[
        '以前干活一忙，只顾眼前那行字，窗外亮着暗着都没留意。',
        '偶尔听见江汉关的钟声，手上会停一下，才发现腰坐僵了。',
        '旁边的师傅不用问，就把茶缸往我这边推一点。',
        '现在不赶那一版纸了，听见钟声，还是会想喝口茶。',
      ]),
    ],
  }),
  resident({
    id:'walker2', name:'罗娟', role:'住在附近的通勤上班族', monogram:'罗', detail:'平时脚步快，聊到过早就肯停下来。',
    greetings:{
      beforeRain:'你是阿遥吧？我叫罗娟，常在蔡姨那儿过早，没准还一起排过队。',
      warning:'今天不抄近路了，沿主巷走。难得不用边走边回消息，说两句？',
      afterRain:'雨一停，鼻子又惦记起过早的味道了。明早我可不赖床。',
    },
    topics:[
      topic('morning-detour','总会绕到早点铺','赶时间，也有舍不得省的一小段。',[
        '我上班有条更近的路，可一到巷口，脚还是往蔡记拐。',
        '不全是饿，有时候就想听蔡姨问一句，今天又这么早啊。',
        '周末睡醒再去，她又问，今天怎么这晚。',
        '两句话都一样亲热，叫人觉得自己真在这条巷子住着。',
      ]),
      topic('crispy-corner','为了豆皮早起一回','起得早，未必装得出从容。',[
        '我跟蔡姨说想留豆皮的脆边，她叫我先起得来再说。',
        '我还真较上劲，隔天一醒就跑，连头发翘着都没发现。',
        '拿到豆皮，坐下来才看见手机里同事问我，今天不是休息吗。',
        '那顿倒吃得慢，连碗边掉的米粒都一粒粒夹干净了。',
      ]),
      topic('guest-breakfast','带外地朋友过早','想把喜欢的都摆给他，结果点多了。',[
        '有个外地朋友来武汉，我带他过早，样样都想让他尝。',
        '热干面、豆皮、面窝摆了一桌，他问我是不是还有人没到。',
        '我这才晓得自己点多了，赶紧叫他慢慢吃，别为了捧场硬撑。',
        '后来他再来，会自己挑一两样，剩下的说留给下回。',
      ]),
    ],
  }),
  resident({
    id:'walker3', name:'程岚', role:'社区图书室帮手，也是汉剧票友', monogram:'程', detail:'说起唱腔，手指会在书脊上打拍子。',
    greetings:{
      beforeRain:'阿遥，我叫程岚。刚把书窗关好，出来听听巷子里的声音。',
      warning:'书已经往里挪了，我也不往低处走。就在这里聊一小会儿。',
      afterRain:'你听，雨声一小，连说话的尾音都清楚了。好久没这么安静地站一会儿。',
    },
    topics:[
      topic('two-operas','汉剧和黄梅戏，别认串了','都能爱听，不必把它们叫成一回事。',[
        '我小时候跟着妈妈哼戏，只记得好听，常把戏种叫错。',
        '妈妈说，汉剧和黄梅戏是不同的戏种，唱腔、韵味各有自己的样子。',
        '在武汉听到一段戏，也别光凭地方就认定它是什么。',
        '现在遇到不熟的，我先问唱的哪一出，比硬猜少闹笑话。',
      ]),
      topic('hummed-melody','妈妈没唱完的一句','记住的有时不是唱词，是停下来的地方。',[
        '妈妈做家务爱哼戏，唱到起劲，锅盖一响，人就跑进厨房。',
        '我跟着学的那一句，老在同一个地方断掉。',
        '后来真听了完整的一段，反而觉得后头那截陌生。',
        '林婆婆听我说完，笑得很，说她也有被水壶打断的曲子。',
      ]),
      topic('walking-beat','散步的时候别抢拍','小许总说，等我把这一拍走完。',[
        '我练戏时会轻轻打拍子，走在路上也忘不了。',
        '小许跟我散步，发现我到路口才说半句话，到了巷尾又接上。',
        '她问我，是在聊天，还是在等锣鼓。',
        '如今我们一块走，我先收住手，免得把人家的话也打成拍子。',
      ]),
    ],
  }),
  resident({
    id:'walker4', name:'宋远', role:'在江边长大的街景速写爱好者', monogram:'宋', detail:'本子里的人，帽子常常是歪的。',
    greetings:{
      beforeRain:'阿遥？我叫宋远，小时候住这附近。刚画到屋檐，你一来，我正好歇歇手。',
      warning:'本子收好了，不追着江景往低处跑。廊下这道檐影也够我看半天。',
      afterRain:'雨后的砖颜色深一点，我还没调准。你要聊，我就先不画了。',
    },
    topics:[
      topic('wind-sketch','江风怎么画进本子','看不见的风，总会碰着点什么。',[
        '我头一回画江边，只顾把房子画整齐，画完总觉得太静。',
        '后来抬头看，周伯的帽檐歪着，旁边人的衣角也不肯垂下去。',
        '我把这几处留下，纸上才像有了风。',
        '周伯要我把帽子画正，我说正了倒不像您，他看完也笑了。',
      ]),
      topic('bridge-space','桥影下面留点空','画江，不是把纸涂得满满的。',[
        '小时候画长江大桥，我把桥下也一笔一笔涂满。',
        '长大再翻，桥是有了，江倒像堵墙，船也没地方走。',
        '如今画到水面，我会留几块纸的本色，不急着补。',
        '贺师傅看了说，和他排字一个道理，空一点，人才能喘口气。',
      ]),
      topic('repair-stool','画一张太小的板凳','巷子的样子，不只在屋顶上。',[
        '我画过你外公铺门口的小板凳，凳面磨得亮，边上却缺一小块。',
        '他看见了，问我怎么专挑这点不齐整的画。',
        '我说，换张新凳子放这儿，我反倒不一定认得了。',
        '等他回来，我还想请他坐一坐，这回把人也画进去。',
      ]),
    ],
  }),
]);

const byId = new Map(RESIDENTS.map(value => [value.id, value]));
export function getResident(id) { return byId.get(id) || null; }
export function getResidentTopic(residentId, topicId) {
  return getResident(residentId)?.topics.find(value => value.id === topicId) || null;
}

/** Main-story flags are read only, and never inferred from weather or endings. */
export function currentResidentPhase(state) {
  const flags = state?.flags;
  const has = id => Array.isArray(flags) ? flags.includes(id) : flags instanceof Set && flags.has(id);
  if (has('postlude')) return 'afterRain';
  if (has('prepared') || has('checked')) return 'warning';
  return 'beforeRain';
}
export function residentGreeting(id, state) { return getResident(id)?.greetings[currentResidentPhase(state)] || ''; }

/** Canonical JSON-only save island. Never retain unknown fields or share arrays. */
export function normalizeResidentProgress(value) {
  const data = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const rawHeard = data.heard && typeof data.heard === 'object' && !Array.isArray(data.heard) ? data.heard : {};
  const heard = {};
  for (const person of RESIDENTS) {
    const entries = Object.hasOwn(rawHeard, person.id) && Array.isArray(rawHeard[person.id]) ? rawHeard[person.id] : [];
    const valid = person.topics.filter(item => entries.includes(item.id)).map(item => item.id);
    if (valid.length) heard[person.id] = valid;
  }
  const met = RESIDENTS.filter(person => (Array.isArray(data.met) && data.met.includes(person.id)) || heard[person.id]?.length).map(person => person.id);
  return {version:1, met, heard};
}

export function hasMetResident(value, residentId) { return normalizeResidentProgress(value).met.includes(residentId); }
export function hasHeardResidentTopic(value, residentId, topicId) {
  return normalizeResidentProgress(value).heard[residentId]?.includes(topicId) || false;
}

/** Call topic-complete after acknowledging the final line, never on open/close. */
export function updateResidentProgress(value, event) {
  const next = normalizeResidentProgress(value);
  const person = getResident(event?.residentId);
  if (!person) return next;
  if (event?.type === 'meet' && !next.met.includes(person.id)) next.met.push(person.id);
  if (event?.type === 'topic-complete' && getResidentTopic(person.id, event.topicId)) {
    next.heard[person.id] = [...new Set([...(next.heard[person.id] || []), event.topicId])];
  }
  return normalizeResidentProgress(next);
}

/** The UI's manual, timer-free state machine, also usable without a DOM. */
export function createResidentChatState(residentId, state) {
  if (!getResident(residentId)) return null;
  return {residentId, phase:currentResidentPhase(state), screen:'greeting', topicId:null, lineIndex:0};
}

export function transitionResidentChat(session, event) {
  if (!session || !getResident(session.residentId)) return {session:null, heard:null};
  let next = {...session};
  let heard = null;
  if (session.screen === 'closed') return {session:next, heard};
  if (event?.type === 'close') next = {...next, screen:'closed', topicId:null, lineIndex:0};
  else if (event?.type === 'back' && session.screen === 'story') next = {...next, screen:'topics', topicId:null, lineIndex:0};
  else if (event?.type === 'topic' && session.screen === 'topics' && getResidentTopic(session.residentId, event.topicId)) {
    next = {...next, screen:'story', topicId:event.topicId, lineIndex:0};
  } else if (event?.type === 'advance' && session.screen === 'greeting') next = {...next, screen:'topics'};
  else if (event?.type === 'advance' && session.screen === 'story') {
    const story = getResidentTopic(session.residentId, session.topicId);
    if (story && session.lineIndex < story.lines.length - 1) next.lineIndex++;
    else if (story && session.lineIndex === story.lines.length - 1) {
      heard = {residentId:session.residentId, topicId:story.id};
      next = {...next, screen:'topics', topicId:null, lineIndex:0};
    }
  }
  return {session:next, heard};
}
