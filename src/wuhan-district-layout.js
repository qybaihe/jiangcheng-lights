/** One physical survey for terrain, vehicles, saves, map and exploration.
 * Qingchuanli is a fictional district inspired by Wuhan's lifen lanes, morning
 * food culture, bridge engineering and river ferries, not a real street map.
 * The original story coordinates are intentionally unchanged.
 */
const freeze=Object.freeze;
const bounds=(minX,maxX,minZ,maxZ)=>freeze({minX,maxX,minZ,maxZ});
const point=([x,z])=>freeze({x,z});
export const CORE_BOUNDS=bounds(-37,37,-24.3,31);
export const PLAYABLE_BOUNDS=bounds(-37,105,-24.3,31);
export const WUHAN_EXTENSION_BOUNDS=bounds(37,105,-24.3,31);
export function isInsidePlayableBounds(x,z,margin=0){
 return Number.isFinite(x)&&Number.isFinite(z)&&Number.isFinite(margin)&&margin>=0&&
  x>=PLAYABLE_BOUNDS.minX+margin&&x<=PLAYABLE_BOUNDS.maxX-margin&&z>=PLAYABLE_BOUNDS.minZ+margin&&z<=PLAYABLE_BOUNDS.maxZ-margin;
}
export const WUHAN_BUILDINGS=freeze([
 {id:'yan-gui-lifen',x:46,z:8,w:10,d:11,h:8.4,color:'#c7ad87',sign:'燕归里 · 钟表缝纫',name:'燕归里',tone:'cream'},
 {id:'lifen-house',x:47,z:-7,w:12,d:12,h:9.2,color:'#b77c63',sign:'里分旧物铺',name:'旧物铺',tone:'brick'},
 {id:'tea-shop',x:62,z:-7,w:10,d:12,h:7.4,color:'#cbbca0',sign:'江城 · 老茶铺',name:'老茶铺',tone:'cream'},
 {id:'breakfast-house',x:62,z:12,w:10,d:8,h:6.6,color:'#bd956c',sign:'婆婆豆皮 · 面窝',name:'豆皮面窝',tone:'brick'},
 {id:'ferry-house',x:89,z:-9,w:11,d:7,h:5.6,color:'#d2c09b',sign:'江风渡口 · 候船旧址',name:'候船旧址',tone:'cream'},
 {id:'riverside-grocery',x:89,z:28,w:12,d:4,h:5.9,color:'#be8e72',sign:'江滩 · 街坊市集',name:'街坊市集',tone:'brick'},
 {id:'newspaper-kiosk',x:103,z:-9,w:3.2,d:4,h:3.4,color:'#c0b18b',sign:'江城书报亭',name:'书报亭',tone:'cream'},
 {id:'riverside-workshop',x:109,z:8,w:6,d:12,h:7.3,color:'#b78065',sign:'江边篾匠铺',name:'篾匠铺',tone:'brick',collide:false},
].map(freeze));
export const WUHAN_ROADS=freeze([
 {id:'river-avenue',name:'滨江路',...bounds(37.7,104,-24,-16),kind:'road'},
 {id:'south-avenue',name:'燕归路',...bounds(37.7,104,19,27),kind:'road'},
 {id:'east-loop',name:'轮渡回车路',...bounds(95,103,-20,23),kind:'road'},
 {id:'lifen-crossing',name:'里分横巷',...bounds(38,99,1,5),kind:'lane'},
 {id:'lifen-passage',name:'过早巷',...bounds(52,56,-20,23),kind:'lane'},
 {id:'bridge-plaza',name:'桥影小广场',...bounds(69,83,-5,20),kind:'plaza'},
 {id:'ferry-plaza',name:'候船广场',...bounds(84,103,-17,-13),kind:'plaza'},
 {id:'market-court',name:'街坊市集',...bounds(83,95,-3,18),kind:'plaza'},
].map(freeze));
export const WUHAN_REGIONS=freeze([
 {id:'east-lifen',name:'燕归里',subtitle:'门里是一家，门外是一条巷子的日子',...bounds(37,69,-24.3,31)},
 {id:'bridge-shade',name:'桥影下',subtitle:'车从桥下过，江风把老故事吹来',...bounds(69,83,-24.3,31)},
 {id:'ferry-neighbourhood',name:'江风渡口',subtitle:'从一张船票，读懂江两岸的日常',...bounds(83,105,-24.3,-4)},
 {id:'riverside-market',name:'江滩街坊市集',subtitle:'豆皮趁热，街坊的话慢慢讲',...bounds(83,105,-4,31)},
].map(freeze));
export const WUHAN_PARKING=freeze([
 {id:'lifen-parking',name:'里分街旁停车位',x:54,z:29,yaw:Math.PI/2,width:6,depth:3.4},
 {id:'ferry-parking',name:'渡口内侧停车位',x:89,z:-15,yaw:Math.PI/2,width:7,depth:3.6},
 {id:'market-parking',name:'市集旁停车位',x:99,z:28.1,yaw:Math.PI/2,width:7,depth:3.4},
].map(freeze));
// Wide-road loop uses two old public streets, never the narrow raised terrace.
export const WUHAN_DRIVE_LOOP=freeze([[0,23],[30,23],[54,23],[76,23],[99,23],[99,-20],[76,-20],[54,-20],[30,-20],[28,-21.8],[6,-21.8],[0,-20],[0,23]].map(point));
const line=(who,text)=>freeze({who,text});
const stop=s=>freeze({district:true,kind:'district',icon:'spark',color:'#bc9755',radius:2.0,...s,lines:freeze(s.lines)});
export const WUHAN_DISTRICT_STOPS=freeze([
 stop({id:'wuhan-lifen',name:'燕归里的门牌',label:'里分门牌',x:47,z:17.6,
  memoryId:'lore-brick',routeHint:'沿南边宽路向东，进燕归里',
  hint:'里分不是一栋房子，是许多户人家把日子过在了一起。',
  lines:[line('阿遥','这门牌下面，怎么有两排挂钩？'),line('旧物铺门边的字条','下面挂书包，上面挂菜篮。钥匙忘带了，敲隔壁。'),line('阿遥','外公说的“整条巷子都认得我”，原来不是夸张。'),line('旁白','红砖、天井、窄巷，把武汉里分的日常留在一声应门里。燕归里是我们虚构的街坊，不对应现实中的一条街。')]}),
 stop({id:'wuhan-breakfast',name:'面窝摊的旧价签',label:'过早的老味道',x:62,z:18,
  memoryId:'lore-noodles',routeHint:'过早巷尽头，寻找豆皮摊',
  hint:'“过早”不是赶时间，是一天从热腾腾的一口开始。',
  lines:[line('阿遥','这里也留着一碗的位置。'),line('摊边的小黑板','面窝刚起锅，豆皮要趁热。先吃，零钱下回来再找。'),line('阿遥','外公每次说“随便吃点”，最后都拎回来两大袋。'),line('旁白','武汉人把吃早餐叫“过早”。有人爱面窝配米酒，有人认一份豆皮。记忆里的味道，各家有各家的偏爱。')]}),
 stop({id:'wuhan-bridge',name:'桥影下的合影',label:'桥下旧合影',x:76,z:17.5,
  memoryId:'lore-bridge',routeHint:'沿燕归路向东，停在桥影小广场',
  hint:'照片里的人没看镜头，正抬头等一列火车。',
  lines:[line('阿遥','外公怎么只拍了半张脸？'),line('照片背面','孩子一直往桥上看。我也跟着看。快门按早了，就这样吧。'),line('阿遥','原来照片没拍好，也能舍不得扔。'),line('旁白','武汉长江大桥于 1957 年通车，是公铁两用桥。眼前这段可穿行的桥影，是对它桁架结构的艺术化呼应，并非真实桥址。')]}),
 stop({id:'wuhan-ferry',name:'渡口的一张旧票',label:'旧轮渡票',x:96,z:-15.3,
  memoryId:'lore-ferry',routeHint:'穿过桥下，沿回车路走向江边',
  hint:'一张小小的船票，曾把上学、上班和回家连在一起。',
  lines:[line('阿遥','这票角缺了一块。'),line('候船窗里的便笺','小孩没见过检票，非要把撕下来的小角也留着。回家一摸，两张都在。'),line('阿遥','说的肯定是我。连坐过一次船，也要带点什么回去。'),line('旁白','轮渡连着武汉江两岸的生活。眼前是虚构的候船旧址，保留票窗与栏内观江处；现在的小渡船仍从老巷码头出发。')]}),
 stop({id:'wuhan-market',name:'市集里借过的竹篮',label:'街坊的竹篮',x:92,z:8,
  memoryId:'lore-photo',routeHint:'沿轮渡回车路，去街坊市集',
  hint:'竹篮的主人不止一个——谁顺路，谁就帮忙拎一程。',
  lines:[line('阿遥','篮子上怎么写了三户人家的门牌？'),line('篮沿的字','去江边买菜，替楼上带两根葱；回巷里，捎给老陆一碗米酒。'),line('阿遥','这不是谁家的篮子，是一条巷子的顺路。'),line('旁白','摊主把空位留在了路边。车停好，步子慢下来，才听得见这些不算大事的故事。')]}),
]);
export function wuhanDistrictRegionAt(x,z){
 if(!Number.isFinite(x)||!Number.isFinite(z))return null;
 const r=WUHAN_REGIONS.find(b=>x>=b.minX&&x<=b.maxX&&z>=b.minZ&&z<=b.maxZ);
 return r?{id:r.id,name:r.name,subtitle:r.subtitle}:null;
}
export function nearestWuhanStop(x,z){
 if(!Number.isFinite(x)||!Number.isFinite(z))return null;
 return WUHAN_DISTRICT_STOPS.filter(s=>Math.hypot(s.x-x,s.z-z)<=s.radius).sort((a,b)=>Math.hypot(a.x-x,a.z-z)-Math.hypot(b.x-x,b.z-z))[0]??null;
}
