# 居民模型 v3｜实际游戏截图美术复查

2026-09-12 · 最终复查包：**`index-dw1CQNRl.js`**。已逐张复查新 integration 九人现场截图。只读审图；未打开 WebGL 页面，未修改代码、模型、贴图或交付文档。

## 1. 证据范围

本次最终结论基于新包的 **9 张 1920 × 1080 真实游戏 greeting 截图**，以及额外查看的林婆婆 1366 × 768 topics 截图。旧包 `index-C5LnBp5q.js` 的 integration 失败现场已迁移至 [旧轮次证据目录](/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/output/qa/resident-avatars-v3/integration-C5LnBp5q-failed/)，更早 exploratory 九人图只用于修复前对照，不作为新包当前缺陷。

未把独立模型联系表当作游戏现场图；本轮 [nine-residents-contact](/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/output/qa/resident-avatars-v3/integration/nine-residents-contact.jpg) 则来自实际对话截图裁切。以下九个原始现场图已逐张打开审查，不将目录中的其他图片自动记为已查看。

| 实际看过的居民 | 真实现场截图 |
|---|---|
| 林婆婆 | [granny-greeting-1920x1080](/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/output/qa/resident-avatars-v3/integration/granny-greeting-1920x1080.png) |
| 蔡姨 | [chef-greeting-1920x1080](/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/output/qa/resident-avatars-v3/integration/chef-greeting-1920x1080.png) |
| 周伯 | [dock-greeting-1920x1080](/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/output/qa/resident-avatars-v3/integration/dock-greeting-1920x1080.png) |
| 小许 | [community-greeting-1920x1080](/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/output/qa/resident-avatars-v3/integration/community-greeting-1920x1080.png) |
| 陈姐 | [walker0-greeting-1920x1080](/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/output/qa/resident-avatars-v3/integration/walker0-greeting-1920x1080.png) |
| 贺师傅 | [walker1-greeting-1920x1080](/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/output/qa/resident-avatars-v3/integration/walker1-greeting-1920x1080.png) |
| 罗娟 | [walker2-greeting-1920x1080](/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/output/qa/resident-avatars-v3/integration/walker2-greeting-1920x1080.png) |
| 程岚 | [walker3-greeting-1920x1080](/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/output/qa/resident-avatars-v3/integration/walker3-greeting-1920x1080.png) |
| 宋远 | [walker4-greeting-1920x1080](/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/output/qa/resident-avatars-v3/integration/walker4-greeting-1920x1080.png) |

## 2. 已知项的新包复核

| 原问题 | 新包实际观察 | 状态 |
|---|---|---|
| 陈姐、贺师傅、罗娟肩带前胸离体弧线 | 三人的肩带现顺着衣服胸前轮廓通向包体，不再像一根悬在胸口前的独立弯线。未见修复引入整条肩带陷入胸腹的大穿模。 | **本轮截图中已消除原明显缺陷。** 并不代表所有动态姿势与被遮挡面已逐帧认证。 |
| 林婆婆蒲扇只露细边 | 新图中可见米黄色椭圆扇面，挂在手下的形状能够读为扇子。 | **明显改善，当前对话构图可辨。** |
| 程岚书本只露细边 | 新图中完整矩形浅色封面朝镜头露出，书本与手/裙侧的关系可读。 | **明显改善，当前对话构图可辨。** |
| 宋远画本只露细边 | 画本有旋转后的书脊/少量封面，但位于远侧手，仍部分被身体/手臂遮挡；本帧主要读成窄书边。 | **保留轻度展示性不足（P3）**，不写成与扇和程岚书本同等清晰。未见整本漂远或大块穿体。 |
| 老人、中年角色的面部成熟度 | 林婆婆、周伯、贺师傅仍主要依靠灰发、眼镜、帽子和背心形成年龄提示；蔡姨与年轻主角仍共享较接近的脸型、发型和纤细身体。 | **素材自身美术边界未改变。** 应维持“年轻基础模型的年龄化改编”说明，不升级为专业成熟老人脸成品。 |
| 脚底视觉接触感 | 新图未见明确鞋底悬空缝隙；NPC 接触阴影仍偏弱。 | 保留阴影层面的观感项，不作为落脚错误或骨骼回归失败。 |

林婆婆的 1366 × 768 topics 截图中，双方人物全身和鞋已留在对话面板上方，不再由面板切掉脚；此为该张实见结果。其他 26 个布局组合的严格判定由 QA 报告负责，本美术复查不冒充重新跑了一轮浏览器。

## 3. 九人逐项观察

- **林婆婆**：灰短发与较矮身高辨识成立；眼镜位于眼鼻附近，未见明显离脸漂浮。裙轮廓和鞋完整；当前静止帧未见大块腿穿裙。新包蒲扇已露出可辨扇面。
- **蔡姨**：围裙在躯干前、毛巾在腰/手侧，未见明显离体独立漂浮或穿入大半个身体；有衣服与肩颈系带关系。围裙偏平硬片状，当前侧面还不像柔软布料，但属于精修空间。与年轻角色的成熟度差异仍有限。
- **周伯**：帽子位于发顶，未见明显离头缝隙或贯穿脸部；帽檐偏宽但仍可读为日常布帽。搪瓷杯贴近前伸手掌，未见远离手部独立漂浮或穿入胸腹；分辨率不足以认证杯把逐指抓握。
- **小许**：女性身份保持；杏橘外衣与玉绿长裤清楚。工作牌/绳与夹板均位于胸前、手前的合理区域，没有大块贯穿；夹板边缘与手相接，精细指节接触未验证。
- **陈姐**：长发、旧玫瑰背心、蓝裙与短发街坊不同，未见先前旧模型春骨造成的发片穿脸。布包本体主要在远侧，被身躯遮挡，不将“没看清包”判为“包缺失”；新包可见肩带已贴近服装轮廓，旧版离体弧线不再出现。
- **贺师傅**：灰鬓、眼镜、棕背心及绿书包区分明确；包本体位于髋侧，未见整包穿体。新包前胸肩带已贴合，不再呈旧版独立外鼓弧线。脸仍偏年轻，眼镜能增加年长读感。
- **罗娟**：赭黄开衫、深色裤子与棕手袋可辨；袋体位于髋侧，没有整包漂在远处。旧版最明显的前胸离体弧线已修复，现沿开衫胸前落向包体。
- **程岚**：短发、绿背心与蓝裙比例正常，未见腿部大块穿出裙面；新包手侧书本已露出完整浅色封面，辨识改善。略带学院感，和年长街坊的职业附件区别有效。
- **宋远**：休闲蓝夹克、宽松长裤与靴子形成不同于背心男的轮廓，成年正常比例成立；手边画本侧边可见，未见整本漂远，但画本正面辨识度不足。

## 4. 整体判断与边界

**目前九位已见角色都没有明显 T-pose、缺失大片网格、发片贯穿面部、黑色透明模板衣片或大块穿地。** 腿身比例不再是原先短腿积木感；身高差与短发/长发、开衫/夹克/背心等差异真实存在。服装颜色与主角的动漫材质协调，无突兀科幻荧光；全场偏灰绿、低饱和主要来自现场环境与阴影，并非某一个 NPC 的色板独有问题。

此次是实际游戏**静止帧**美术检查，不替代连续走路穿裙、手指抓握动画、四个视角、天气、性能、碰撞或存档回归。已补齐九个人物出现的现场图，但各附件被遮挡面的状态仍保留不确定性。

**新包结论：九位居民的正常比例与基础模型替换成立；三条肩带的明显离体问题已经修复，蒲扇和程岚书本的展示面已可辨。未发现需要回滚整组模型的严重美术问题。剩余为宋远远侧画本展示较窄、老人/中年脸的成熟度与接触阴影等轻度或后续精修空间，不混记为旧包问题仍未修复。**
