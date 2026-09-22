import {RESIDENTS, hasHeardResidentTopic} from './resident-stories.js';

/** One illustration per authored moment. No dialogue, quest or audio is changed. */
export const WUHAN_MEMORY_STYLE = Object.freeze({
  palette:'青绿树影、暖米白纸张、浅杏阳光、温润红砖、少量靛蓝；柔和但清亮，不做浓褐色旧照片滤镜。',
  treatment:'明亮温暖的手绘动漫电影场景，细腻水彩/水粉背景，日常人物自然比例；旧相册的轻微褪色、纸纤维和极细颗粒，画面完整清晰。横屏16:9。',
  history:'人物往事均为虚构，不标具体年份，不把虚构晴川里绘制成真实街区地图；只画符合武汉生活的物件与空间，不拼贴黄鹤楼等无关地标。',
});

const memory=(value)=>Object.freeze({...value, image:`/media/wuhan-memories-v1/${value.id}.webp`,url:`/media/wuhan-memories-v1/${value.id}.webp`});
const MAIN = [
  ['granny-table','留一只凳子','林婆婆 · 一碗面的位置','granny','granny','屋檐下，年轻些的林婆婆把一碗面推到疲惫的陆师傅面前，矮竹凳留出一个空位。武汉里分天井、木窗、搪瓷盆，浅金傍晚。关心是递碗的动作，不是哭泣。'],
  ['granny-bamboo','蒲扇没有停','林婆婆 · 午后的竹床','granny','granny','小阿遥蜷在天井竹床上睡熟，年轻些的林婆婆轻摇蒲扇，陆师傅在旁把声音放轻。竹床之间留路，通风砖和晾衣绳投下柔软影子，盛夏但不昏黄。'],
  ['chef-lamp','天亮以前','蔡姨 · 第一盏摊灯','chef','chef','年轻蔡姨在黎明的武汉过早摊忙碌，陆师傅递来修好的绿色台灯；两盏小灯照亮芝麻酱碗、竹面篓、铝锅，摊外天空青蓝。热气与动作交织，不是单独拍点灯。'],
  ['chef-extra-bowl','先盛小饭盒','蔡姨 · 留着一口热的','chef','chef','蔡姨先给红盖有一点白色磕痕的小饭盒盛热食，桌边小阿遥踮脚看；厨房窗外是武汉里分木门与晒衣。重心在手、饭盒、被记住的一个人的份量。'],
  ['dock-shared-box','箱子的另一边','周伯 · 江边的往事','dock','dock','年轻些的轮渡工周伯先点头询问，再与陆师傅一人托住旧工具箱的一侧，站在干燥的武汉轮渡候船棚内；远处单层老轮渡、柔青江水和武汉长江大桥钢桁架虚景。'],
  ['xu-first-shift','第一场值班的雨','小许 · 第一次值夜班','towel','towel','刚参加社区工作的小许是年轻女性，雨夜在明亮屋内核名单；街坊的手把蓝边干毛巾放在桌角，小许抬头微笑。窗外雨线，暖米白灯光和青绿窗框，不能画成年代久远的历史人物。'],
  ['ending-reopen','门是一起开的','外公 · 修理铺重新开门','ending','ending','修理铺重新开门的那天，年轻些的陆师傅、林婆婆、蔡姨、周伯一起把木桌摆正，靠窗留一个角给小阿遥。武汉里分门洞外有竹床、修理工具和过早饭盒；多人自然群像。'],
  ['ending-lamplit-child','那盏灯照着谁','外公 · 灯下的孩子','ending','ending','修理铺暖灯下，小阿遥低头写作业，桌角放红盖饭盒，陆师傅修理物件，街坊在门边轻声说话；窗外青绿色夏夜。孩子被日常生活温柔环绕，不做煽情流泪特写。'],
].map(([id,title,chapter,flag,movie,brief])=>memory({id,title,chapter,kind:'main',flag,movie,brief,fallbackImage:`/media/story-v2-cg-${id}.webp`,place:'晴川里 · 旧物记忆',era:id==='xu-first-shift'?'小许刚来社区的那一年':'阿遥小时候',caption:chapter}));

const RESIDENT_BRIEFS = {
  'bamboo-bed':['里分天井','从前的夏夜','竹床交错摆在武汉里分天井，林婆婆轻收双脚给迟来的邻居让位，孩子在床底找玻璃弹珠。蒲扇、布席、木门；从略低视角看一张竹床容下许多亲切身影。'],
  'radio-dial':['木窗旁','旧日午后','林婆婆慢慢转收音机旋钮，陈姐从木窗外探头搭话，电台被两人的笑容打断。绿色收音机、竹椅、明亮窗光；用神情而非文字表现沙沙声。'],
  'enamel-cup':['巷口门洞','从前一个夏天','林婆婆与陈姐在武汉里分门口比对两只缸底都有小蓝点的白搪瓷缸，旁边一壶绿豆汤已经分匀，两人忍俊不禁。近景带暖砖色门框。'],
  'first-noodles':['蔡记过早摊','蔡姨年轻的时候','年轻蔡姨面对自己拌得不匀的一碗热干面，筷子挑进碗底，老师傅在旁不急着批评；芝麻酱、竹面篓、铝壶与清晨烟气，生活喜感。'],
  'doupi-edge':['豆皮锅边','前些年的一个清早','金黄三鲜豆皮在大平锅中分成方块，蔡姨将最脆的一角留在锅铲上，头发有一撮翘起的罗娟在摊边伸手期待。绿围裙、青绿门面、第一缕阳光。'],
  'breakfast-orders':['蔡记门前','熟客每天都来的早晨','贺师傅折好报纸后伸手接碗，蔡姨看见这个熟悉动作就笑了，桌上热干面、面窝和不装太满的豆浆。重点是熟客之间无需开口的默契。'],
  'ticket-pocket':['家中晾衣处','还留纸船票的时候','周伯从晾着的衬衣口袋里掏出一团洗过的纸船票，窗台放着几张压平的旧票；海蓝布帽、搪瓷缸、竹晾衣竿，窗外轮渡远影。船票不含可读班次或虚构官方标志。'],
  'arriving-shore':['轮渡客舱','一次寻常的归程','武汉老轮渡客舱内，年轻些的周伯看着大家在船将靠岸时安静收包；母亲理孩子衣领、居民稳住菜篮，大家仍坐稳，窗外码头轮廓和清亮江水。'],
  'river-hat':['江边候船棚','前些年的傍晚','周伯坐在栏内干燥候船棚，旧海蓝布帽被转头动作带歪，宋远一边画速写一边笑；江风吹起衣角，远景是武汉长江大桥钢桁架。'],
  'first-notice':['社区门前','小许刚来的时候','年轻女社区工作人员小许摊着一张写得太密的通知，戴眼镜的贺师傅帮她留空白，林婆婆站远一点比划字的大小；纸面只有模糊笔迹，不生成可读文字。'],
  'spare-chair':['里分天井','小许刚认门牌时','陈姐把一张空竹椅挪到街坊之间，小许合上名册坐下来听，林婆婆手拿蒲扇，猫在椅腿间探头；正午阴凉、暖米白墙面、青绿树影。'],
  'clock-reminder':['社区小屋','一个忘了看手机的傍晚','小许伏案改表格听钟声抬头，程岚已抱书在门边安静等候；窗外以远小轮廓暗示江汉关钟楼。现代手机留在桌上，避免把年轻小许画成几十年前。'],
  'pillow-patch':['天井竹床','旧日暑夜','年轻些的陈姐缝一块印小花的枕套大补丁，孩子把玻璃弹珠放入新口袋，林婆婆在竹床另一边笑；手工针脚与布纹清晰，轻松生活片段。'],
  'umbrella-stitch':['木檐下','那把伞还常用时','陈姐把修好的旧伞撑在干燥屋檐内，伞面上一道深色歪针脚很清楚，宋远捧速写本好奇看；其他折伞靠墙，温柔雨后漫反射，不阴沉。'],
  'recognise-clothes':['里分巷口','故人重逢的一天','陈姐在缝纫桌旁抬手招呼刚到巷口的熟人，对方无意识地拽左袖口；陈姐视线从袖口移到脸上，旧缝纫机与碎花布，暖光穿过天井。'],
  'ticket-bookmark':['装订桌前','借书的那些年','戴眼镜的贺师傅打开旧书，纸船票夹在一页旁，旁边茶缸和装订针线；另一人的手在归还书，票上只有不可读的小笔记，过江的记忆藏在很小的纸片中。'],
  'paper-margin':['小印刷间','赶印街坊小报的日子','贺师傅在整齐的老排字工作台旁看蔡姨在报纸留白处补一小句，蔡姨持铅笔神气地笑；纸字不清晰，金属活字格、绿灯罩、木窗和红砖。'],
  'customs-bell':['临江印刷间','贺师傅当班的时候','年轻些的贺师傅从活字排版桌抬头伸腰，旁边老师傅默默推来茶缸；窗外远小的江汉关钟楼轮廓，青灰砖和暮色金光。不要出现全城不合理拼接。'],
  'morning-detour':['蔡记门口','罗娟搬来之后','通勤的罗娟本要走向巷口，却带笑转入蔡记，蔡姨隔着氤氲蒸汽抬头招呼；通勤包与街巷电线，熟悉的武汉过早生活。'],
  'crispy-corner':['豆皮摊的小桌','某个不用上班的清晨','头发翘起的罗娟终于坐下，面前是脆边金黄豆皮，手机安静放在桌边，蔡姨在锅前笑；这一回不赶时间，阳光明亮，表现松弛而非冲刺。'],
  'guest-breakfast':['蔡记过早桌','朋友来武汉那回','罗娟与一位外地朋友面对点得太满的一小桌武汉过早：热干面、方块三鲜豆皮、圆环面窝；两人相视笑起来，蔡姨端水，友好而不奢侈铺张。'],
  'two-operas':['家中木窗边','程岚学戏的时候','童年程岚听母亲哼唱，母亲温柔指点，桌上旧磁带与收音机，窗外武汉天井；不画具体戏服或剧目以免混淆汉剧黄梅戏，用亲子聆听呈现。'],
  'hummed-melody':['家中厨房外','程岚小时候','小程岚正跟母亲哼唱，母亲听到锅盖轻响转身去厨房，孩子愣一下又笑；温润铝锅、浅绿木柜、窗外晾衣，旋律被生活接过去。'],
  'walking-beat':['雨后主巷','与小许熟起来之后','成年程岚和女性小许并肩在武汉红砖主巷散步，程岚手指刚要轻轻打拍，小许笑着看她，路边书窗与梧桐叶影；不画戏台和旅游打卡人群。'],
  'wind-sketch':['江边栏内','宋远刚学画的时候','青年宋远坐在干燥栏内把江风画进速写本，周伯歪帽、行人微扬衣角在画面中形成呼应；水面留明亮纸色，远处武汉长江大桥。'],
  'bridge-space':['江边写生处','旧画和新画之间','成年宋远把童年涂满水面的旧画与现在留白的长江大桥速写放在膝上，贺师傅指向纸面空白；镜头看纸与手，背后真实钢桁架桥影淡淡呼应。'],
  'repair-stool':['陆师傅铺前','外公还在铺里忙的时候','宋远坐在小巷里画一张边角缺了一小块的矮板凳，陆师傅在修理铺门边俯身看画；旧台灯、螺丝盒、磨亮木纹，画面核心是被认真看见的日常。'],
};

export const residentMemoryId=(residentId,topicId)=>`resident-${residentId}-${topicId}`;
const NEIGHBOURS = RESIDENTS.flatMap(person=>person.topics.map(topic=>{
  const [place,era,brief]=RESIDENT_BRIEFS[topic.id];
  return memory({id:residentMemoryId(person.id,topic.id),kind:'resident',residentId:person.id,topicId:topic.id,title:topic.title,chapter:`${person.name} · 街坊旧事`,caption:topic.teaser,place,era,brief,lines:topic.lines,personName:person.name});
}));

const LORE = [
  ['clock','钟声喊人回家','江汉关的钟声','童年的傍晚','小阿遥在武汉里分巷口玩，外公在修理铺门口招手，远处江汉关钟楼仅小比例轮廓；孩子明明听见仍恋恋不舍，重点是被喊回家的温暖。'],
  ['noodles','底下，还有','武汉人的过早','一碗面的记忆','近景小阿遥的筷子挑进热干面碗底，蔡姨温柔指向碗底芝麻酱；身后武汉过早摊的锅气和木凳，漂亮食物质感而非广告摄影。'],
  ['ferry','手心里的船票','江上的轮渡','小时候过江','小阿遥坐在武汉轮渡靠窗位置，把攥得微皱的纸船票摊在手心给外公看；身边书包安好，窗外青绿江水，票上文字不可读。'],
  ['bridge','还没数完的桥影','武汉长江大桥','童年的船窗前','轮渡窗框内，小阿遥伸指认真数武汉长江大桥钢桁架的节奏，身旁外公把一只饭盒递来；桥与水都有留白，蓝绿清透天空。'],
  ['brick','留在地上的竹床印','里分与竹床','夏天的天井','武汉里分天井的竹床脚在砖地留下浅印，街坊将竹床往边上挪给过路的人留出中间小路，近景是蒲扇和浅花布，空间真实温暖。'],
  ['photo','相片没有留下的对岸','轮渡合影','那次坐船的时候','小阿遥指向轮渡窗外，年轻些的外公站后面手垫在窗框尖角，两人头发被江风吹向同一边，前景留半张椅子，像构图略歪却珍贵的家庭快照。'],
].map(([key,title,place,era,brief])=>memory({id:`lore-${key}`,kind:'lore',loreId:key,title,chapter:'江城拾光',caption:place,place,era,brief}));

const ADVENTURE = [
  ['kite-tools','旧燕子的左翅','修理铺背后的工具巷','小时候','小阿遥笨拙地给旧燕子风筝左翅缝补一条歪线，外公在修理铺门边扶住竹骨，蓝布尾巴被风抬起；武汉红砖里分与青绿木门，浅杏阳光。'],
  ['kite-courtyard','借给老陆，先用着','院后的北街','一个准备出门的傍晚','周伯在武汉天井廊下把手电递给年轻些的陆师傅，小阿遥在旁抱着蓝尾燕子风筝等待；灯罩下系一截蓝布，人物手势自然，重点是邻里借灯。'],
  ['kite-terrace','武汉的星星会走路','听风台栏内','童年的江风里','外公与小阿遥并肩站在牢固栏杆内，看武汉长江大桥桥灯和江上缓行船灯，阿遥抬手把船灯当作星星；清透蓝绿暮色配暖金点光，人物绝不站在栏杆外。'],
].map(([key,title,place,era,brief])=>memory({id:`adventure-${key}`,kind:'adventure',adventureId:key,title,chapter:'江风来信',caption:place,place,era,brief}));

export const WUHAN_MEMORIES = Object.freeze([...MAIN,...NEIGHBOURS,...LORE,...ADVENTURE]);
const byId=new Map(WUHAN_MEMORIES.map(item=>[item.id,item]));
export const getWuhanMemory=id=>byId.get(id)??null;
export const memoryForResidentTopic=(residentId,topicId)=>getWuhanMemory(residentMemoryId(residentId,topicId));
export const memoryForLore=id=>getWuhanMemory(`lore-${id}`);
export const memoryForAdventure=id=>getWuhanMemory(`adventure-${id}`);
export const wuhanMemoryGalleryId=id=>`wuhan-${id}`;

/** Read-only unlocks; greeting, opening a picture or partly reading never earns it. */
export function isWuhanMemoryEarned(state,itemOrId) {
  const item=getWuhanMemory(typeof itemOrId==='string'?itemOrId:itemOrId?.id);
  if(!item)return false;
  if(item.kind==='main')return Array.isArray(state?.flags)&&state.flags.includes(item.flag);
  if(item.kind==='resident')return hasHeardResidentTopic(state?.residents,item.residentId,item.topicId);
  if(item.kind==='lore')return Array.isArray(state?.lore)&&state.lore.includes(item.loreId);
  if(item.kind==='adventure')return Array.isArray(state?.adventure?.found)&&state.adventure.found.includes(item.adventureId);
  return false;
}

export function wuhanMemoryGalleryItems(state,collection={}) {
  // Main memories retain their established gallery IDs; the rest are new cards.
  return WUHAN_MEMORIES.filter(item=>item.kind!=='main').map(item=>({
    ...item,id:wuhanMemoryGalleryId(item.id),memoryId:item.id,type:'wuhan-memory',
    description:item.caption,unlocked:isWuhanMemoryEarned(state,item)||Boolean(collection?.unlocked?.[wuhanMemoryGalleryId(item.id)]),
    hint:item.kind==='resident'?`和${item.personName}聊完这件旧事`:item.kind==='lore'?'在街巷中找到这页江城拾光':'读完这段江风来信',
  }));
}
