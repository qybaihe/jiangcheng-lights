# 居民成品模型：官方资产核验

核验日期：2026-09-12。范围：官方单品页、作者官方预览、官方对应下载入口；没有改动游戏源码或 `public`，没有在 Three.js 中实装这些新模型。

## 结论

**免费、已有服装、成年比例、带骨骼动画的优先候选：Quaternius Ultimate Modular Men + Women 的日常服饰组合。** 它们是低多边形风格，不等于精细动漫人物。可承担普通路人/远中景街坊；重要剧情人物、老年面部和近景表演仍需更细腻来源或定制。必须先做一个居民的灯光/材质/比例对照试装，再决定批量换人。

这些包准确说是 **CC0 模型素材**，不是角色生成器代码的开源许可证。单品页明确 CC0，允许个人及商业项目；即使无需署名，也建议游戏资产清单保留作者、来源和版本。

## 1. Quaternius Ultimate Modular Men / Women（推荐作免费普通居民起点）

| 项目 | Men | Women |
|---|---|---|
| 官方数量 | 11 个角色 | 10 个角色 |
| 动画 | 各 24 段 | 各 24 段 |
| 模块 | 各角色拆成 4 部分供互换 | 各角色拆成 4 部分供互换 |
| 格式 | 正文明确 FBX / OBJ / glTF / Blend | 正文明确 FBX / OBJ / glTF / Blend |
| 骨骼 | 官方下载目录含 Humanoid Rig、Separate Skeletal Meshes and Animations | 页面明确 humanoid rig version；下载目录含 Humanoid Rigs |
| 价格/许可 | 免费，单品页 CC0，明确可商用 | 免费，单品页 CC0，明确可商用 |

- Men 官方页：https://quaternius.com/packs/ultimatemodularcharacters.html
- Men 官方原图：https://quaternius.com/assets/images/fullres/modularcharacters.jpg
- Men 官方下载目录：https://drive.google.com/drive/folders/1USAAquX2JJWuA2m6zol0KUkFe3UkZ8zX?usp=sharing
- Women 官方页：https://quaternius.com/packs/ultimatemodularwomen.html
- Women 官方原图：https://quaternius.com/assets/images/fullres/modularwomen.jpg
- Women 官方下载目录：https://drive.google.com/drive/folders/1720N9IGyQHXYvtvZJzazhxtTTlz-y2Vf?usp=sharing

**已目视匹配：** 比两三头身玩具人物更接近成人比例，已经有便服、长裤、西装、裙装和工装。包内也混有王冠/铠甲/科幻/军装，筛选时只取日常上衣、裤装及普通发型。官方展示的成年脸部仍非常简化、轮廓硬朗；老年人身份不是完整现成解决方案。林婆婆等角色仅改灰发或缩小身体还不足以完成老人塑造。

**整合代价：** 选择便服组合、统一皮肤与衣物配色、适配游戏尺寸和现有骨骼动画、核验手脚与地面/椅子/车辆的接触位置。店主围裙、布鞋、旧外套等武汉日常特征需要补充搭配。glTF 是可读入 Three.js 的格式，仍有动画命名、材质、尺度适配工作，并非点击下载后自动匹配全部玩法。

**核验边界：** 官方网页与 Google Drive 目录已读取，预览已目视；模型大包未下载、未解压、未运行。两目录列出 `License.txt`；尝试单独下载许可文本时返回 Google Drive 配额页面，因此未把该响应当成许可内容。CC0 结论来自这两个具体单品页，不来自站点通用口号。对应失败响应保存为 `quaternius-men-license-download-error.html` / `quaternius-women-license-download-error.html`。

## 2. Kenney Mini Characters（开箱程度高，视觉方向不主荐）

- 官方页：https://kenney.nl/assets/mini-characters
- 官方预览：https://kenney.nl/media/pages/assets/mini-characters/357d1a9452-1721210569/preview.png
- 官方下载：https://kenney.nl/media/pages/assets/mini-characters/bfc7e272b4-1774770718/kenney_mini-characters.zip
- 单品页写 **25 files、Animation、Creative Commons CC0、免费**，并非“25 位居民”。
- 本次实际读取官方 ZIP（2,403,059 字节），在内存中解包并审计 GLB；包本体未写入研究目录或游戏目录，仅保存审计 JSON。
- 实际包含 **12 个角色（6 male + 6 female）及道具；各格式 26 文件**，格式为 **FBX、GLB、OBJ/MTL**，另有 PNG 贴图。
- 12 个角色均含 2 个 skin、2 个 mesh，各 **32 个 animation entries**（其中一个为 `static`）。已确认 `idle / walk / sprint / sit / drive / pick-up / emote-yes / emote-no / interact-left / interact-right`，也有轮椅动作。
- 角色约 **690–876 三角面**。很轻量，却也表明它不是精细近景人物。
- 包内 `License.txt` 原文明确 CC0、可用于 personal / educational / commercial、署名非要求；审计记录保存了全文。

**视觉判断：** 有成年男女、老年造型、眼镜、轮椅/手杖等，生活题材适配强；但明显是短腿大头的积木 Q 版。与用户要求“长一点的腿、主人公比例、精细人脸”相反，因此不作为主力居民替换推荐。它可提供无障碍道具及动作结构参考。

**核验边界：** 已下载到内存、实际解析许可证和 GLB 元数据；没有渲染/Three.js 实测。详细证据：`kenney-mini-archive-audit.json`。

## 3. Quaternius Universal Base Characters（更细腻，但它是底模）

- 官方页：https://quaternius.com/packs/universalbasecharacters.html
- 作者下载页：https://quaternius.itch.io/universal-base-characters
- 完整包预览：https://quaternius.com/assets/images/fullres/universalbasecharacters.jpg
- 免费版内容预览：https://quaternius.com/assets/images/fullres/universalbasecharacters/standard.jpg

**免费 Standard：官方图明确 2 个底模 + 5 个发型；122 MB。**

**完整包介绍：6 个男女体型（Superhero / Regular / Teen）+ 20 个发型，平均约 13k tris，Humanoid rig，兼容 Universal Animation Library。** 作者下载页显示 Source 600 MB，售价 **$19.99 USD 起**；包含 rigged `.blend` 和引擎项目/材质工具。不要把完整包的 6 + 20 数量宣传成免费版全部内容。

单品页与作者 Itch 页均明确 **CC0**、可商业项目使用；官网正文明确 FBX / glTF。官方 `Animated` 图标为叉号：**已经绑定骨骼不代表自带完整动作包**，动作需要另取 Universal Animation Library 等并适配。

**已目视判断：** 比 Modular Men / Women 更细腻，正常比例及眼鼻唇刻画更好；然而是穿基础底衣的人体 + 发型，没有居民日常外衣、鞋、老年面部。它适合作为下一阶段高精度居民基础，不是完整穿衣的即用街坊素材。

**核验边界：** 官方网页、免费/完整包预览和 Itch 价格/大小已核对；122 MB / 600 MB 大包未下载，未核验内部拓扑和动画，未接入 Three.js。

## 执行建议

1. 普通路人试装：从 Modular Men / Women 各挑一个无装备的便服角色，做一个免费方案的真实游戏对照，不混入铠甲/奇幻人物。
2. 重要人物：林婆婆、蔡姨、周伯、小许另设近景标准；老人需真实的脸部轮廓/年龄感、发型和服装，不只改颜色。
3. 验收按实际 3D：正面/侧面/背面、站立/走路/问候/坐下、雨前/雨后灯光、对话近景与帧率全部检查。现有问候/寻路/故事数据独立保留。
4. 现阶段仅研究；没有替换现有人物，没有宣称任何新包已达到用户参考图精细度。
