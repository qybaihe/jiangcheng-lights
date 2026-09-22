# 《江城有灯》居民模型来源与许可

核实日期：2026-09-12。适用于本目录九个 `.vrm` 文件。

这些人物使用 **VRoid / pixiv Inc. 提供的五个完整模型**为基础，经本项目做日常衣着、发色、身形、眼部与年龄外观改编，并非从零原创建模。所有下载免费，没有购买付费资源，也没有调用生图接口生成模型。

## 一、两组不同许可，不混标

### VRoid AvatarSample_A / AvatarSample_C — 样例专用条款，非 CC0

- 官方条款：<https://vroid.pixiv.help/hc/en-us/articles/4402394424089>
- 官方 AvatarSample_A：<https://hub.vroid.com/en/characters/2843975675147313744/models/5644550979324015604>
- 官方 AvatarSample_C：<https://hub.vroid.com/en/characters/1248981995540129234/models/8640547963669442173>

可由任何人用于营利或非营利活动；允许在支持 VRM 的应用中使用角色、制作图像或视频、修改纹理和参数、分发改编模型。无需强制署名，本项目仍保留来源。**不得把 A/C 样例或改编模型标为 CC0，不得收费再分发样例 `.vroid`、VRM 或内含图像等数据，不得用于开发角色创建服务，不得暗示 pixiv 对本项目背书。** 其他禁止事项以官方完整条款为准。

本项目目前的使用方式是随免费演示/参赛包提供角色美术素材；不收费再分发这些样例及其数据。本说明不为未来付费游戏包追加授权。

### Sendagaya Shibu / Sendagaya Shino / Sakurada Fumiriya — CC0

- Shibu（现称 β Ver AvatarSample_1）：<https://vroid.pixiv.help/hc/en-us/articles/360012381793>
- Shino：<https://vroid.pixiv.help/hc/en-us/articles/360013482714>
- Sakurada Fumiriya：<https://vroid.pixiv.help/hc/en-us/articles/360014788554>
- CC0 正文：<https://creativecommons.org/publicdomain/zero/1.0/>

以上各模型的官方页面分别明确：在法律允许范围内，pixiv Inc. 放弃相关版权及邻接权；可自由编辑与使用。**这一 CC0 状态仅适用于这三种基础模型，不覆盖 A/C。**

## 二、逐人来源

| 文件 | 游戏身份 | 完整外部基础 | 许可 |
|---|---|---|---|
| `granny.vrm` | 林婆婆 | Sendagaya Shibu | CC0 |
| `chef.vrm` | 蔡姨 | AvatarSample_A | 样例专用条款 |
| `dock.vrm` | 周伯 | Sakurada Fumiriya | CC0 |
| `community.vrm` | 小许，女性 | AvatarSample_A | 样例专用条款 |
| `walker0.vrm` | 陈姐 | Sendagaya Shino | CC0 |
| `walker1.vrm` | 贺师傅 | Sakurada Fumiriya | CC0 |
| `walker2.vrm` | 罗娟 | AvatarSample_A | 样例专用条款 |
| `walker3.vrm` | 程岚 | Sendagaya Shibu | CC0 |
| `walker4.vrm` | 宋远 | AvatarSample_C | 样例专用条款 |

人物姓名、武汉生活故事、职业与游戏设定是本项目既有内容；未沿用原始样例角色的名字、年龄和传记。

## 三、下载与证据

实际文件来自第三方免费镜像仓库 **madjin/vrm-samples**，不是 pixiv 自有仓库。精确下载链接、原文件 SHA-256、产物 SHA-256、文件体积和每人改编说明见项目根目录 `media/resident-model-sources.json`。

- 原始文件保存在 `output/research/resident-models-v3/originals/`。
- 官方条款的完整 API 响应保存在 `output/research/resident-models-v3/terms-*.json`。
- 已核对源模型元数据与官方许可适用关系；没有将镜像与官方 Hub 最新导出版本做二进制哈希比对，因此不声称其版本完全相同。
- 可复现预处理脚本为 `tools/prepare-resident-models.py`，不读取任何 `.env` 或凭证。

## 四、改编的实际边界

1. 保留五个来源不同的完整蒙皮人体、头发、服装几何与人形骨架，而非把一个程序小人换九种颜色。
2. 统一自然棕色虹膜与武汉日常暖色衣着。三位 A 基础人物的短裤/腿部贴图衔接为长裤；内衬改米白，去除样例的彩色缎带纹样。Shibu/Shino 去领口蝴蝶结和发夹，并把裙摆延长至膝下，保留行走空间。
3. 林婆婆、周伯和贺师傅的年龄感来自本项目制作的灰发灰眉、细腻年龄线条、较小眼部比例和成熟下颌改编，以及游戏中的体态与职业附件。**原来源并不是现成老年人模型；不能把它们宣称为专业雕刻的老年脸。**
4. 小许沿用女性身份。其基础短发与原 CG 的低束发不是完全相同造型，3D 与 CG 可继续美术统一；未通过改变性别解决素材匹配。
5. 表情精简为 neutral / blink / a / joy / fun；保留骨骼、蒙皮和变形关系。按同材质合并绘制批次，移除额外描边，贴图保留 1024px 脸部、512px 衣着头发与 256px 细节法线。居民头发关闭独立春骨物理，以稳定九人实时场景。
6. 本模型与其他游戏文件的许可分别适用；仓库或参赛材料中对代码的许可不会覆盖模型条件。
