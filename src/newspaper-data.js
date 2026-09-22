// Optional, in-world reading. These fictional community briefs are not real
// Wuhan news, ferry timetables, quest instructions or progression rewards.
// The caller selects an edition; this module never reads or changes a save.
const article = value => Object.freeze({ ...value, body: Object.freeze(value.body) });
const edition = value => Object.freeze({
  ...value,
  body: Object.freeze(value.body),
  news: Object.freeze(value.news.map(article)),
  advert: article(value.advert),
});

export const NEWSPAPER_EDITIONS = Object.freeze({
  beforeRain: edition({
    id: 'qingchuan-before-rain',
    title: '晴川里街坊小报',
    issueLabel: '雨前号 · 傍晚印',
    fictionNotice: '游戏内虚构社区小报 · 非真实新闻或实时通航公告',
    headline: '竹床收一收，巷子留条路',
    deck: '武汉晴川里这一天：锅还开着，江风已经换了方向。',
    body: ['本期放在修理铺旁的小桌上。看完拿杯垫压好，纸薄，容易叫风翻走。'],
    news: [
      {
        id: 'before-rain-lane',
        headline: '里分先收竹床，门口莫堆满',
        deck: '今晚还有雨，街坊各忙各的准备。',
        body: [
          '午后的阵雨才歇，天井里的竹床又往屋里挪。有人把花盆收进门洞，有人提着扫帚清掉路边落叶。',
          '低处住户按社区通知提前安排去处。出门走公共主巷，留出中间那条路，拎饭盒的好过人。',
        ],
      },
      {
        id: 'before-rain-breakfast',
        headline: '蔡记收了过早摊，锅还没关',
        deck: '晚些时候备热食，葱另放一小碟。',
        body: [
          '热干面招牌翻过去了，后厨还在烧水。蔡姨给社区备热食，洗净的饭盒摞在干燥桌边。',
          '有人隔门问明早的豆皮，她手没停：“明早的事明早说，先把这锅顾好。”',
        ],
      },
      {
        id: 'before-rain-ferry',
        headline: '想看轮渡，往棚子里坐',
        deck: '江边风起，班次看渡口当班告示。',
        body: [
          '码头内侧雨棚添了候船告示，长凳擦过一遍。看船的人把凳子往里让了让，免得鞋尖淋湿。',
          '小报不刊固定班次。天气有变时，先问渡口是否开航，再安排过江。',
        ],
      },
    ],
    advert: {
      id: 'before-rain-repair-ad',
      headline: '旧修理铺 · 小修小补',
      deck: '旧广告重印，不作今日营业告示。',
      body: ['台灯、收音机、小电扇，能修的先看看。送来写好姓名，莫把旋钮落在家里。'],
    },
    evidenceHint: '旧广告的小图里，工作台没有画满。靠窗那一角，摆着一本摊开的作业本。',
  }),
  afterRain: edition({
    id: 'qingchuan-after-rain',
    title: '晴川里街坊小报',
    issueLabel: '雨后号 · 补印',
    fictionNotice: '游戏内虚构社区小报 · 非真实新闻或实时通航公告',
    headline: '雨歇了，空饭盒慢慢往回收',
    deck: '武汉晴川里这一天：主巷又有脚步声，明早还要过早。',
    body: ['这一张压在旧号上。桌沿还有点潮，翻页时别把纸角拽破了。'],
    news: [
      {
        id: 'after-rain-lane',
        headline: '公共主巷已确认，低处仍绕行',
        deck: '出门看清通道，别只看天上没下雨。',
        body: [
          '社区已确认公共主巷可以通行，街坊顺路归还空饭盒。连廊里扫出的树叶装了袋，没再堆回路口。',
          '江边低处和配电箱附近仍保持绕行。原来的提示还在，莫图省那几步。',
        ],
      },
      {
        id: 'after-rain-breakfast',
        headline: '明早豆皮，照旧趁热',
        deck: '锅台擦好了，饭盒也晾开了。',
        body: [
          '蔡记把收回的空饭盒洗好晾开，明早照常备豆皮。老板在本报纸边添了一句：来早一点，边角脆的先夹完。',
          '一位街坊认真问能否预留，答复是：“先起得来再说。”',
        ],
      },
      {
        id: 'after-rain-ferry',
        headline: '雨停之后，过江仍看当班告示',
        deck: '先确认，再出发，莫拿旧号当船期。',
        body: [
          '渡口按天气和现场确认更新开航信息。想坐轮渡的街坊先到内侧雨棚看告示，停航时就在岸内歇脚。',
          '本报只记街坊日常，不代替渡口通知。看完这一条，把座位让半边，旁人也好坐。',
        ],
      },
    ],
    advert: {
      id: 'after-rain-neighbour-ad',
      headline: '晴川里便民栏 · 修伞磨剪',
      deck: '下回摆桌另贴通知，先收好小物件。',
      body: ['旧伞松线、剪刀发钝，留意连廊里的便民通知。来时带块小布垫，桌子借来的，莫划花了。'],
    },
    evidenceHint: '便民栏底下有句铅笔字：“桌子若重，喊一声再搬。”末尾挤着几种不同的笔迹。',
  }),
});
