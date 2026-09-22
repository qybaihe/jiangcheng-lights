# 《江城有灯》118 秒参赛片制作档案

主题：**这一趟，不只是送东西。**

影片顺序：返乡 → 替外公修理与送回旧物 → 与街坊相识 → 骑车、驾车、划船与计时挑战 → 回来照应社区 → 去留选择、四种归途与画廊 → AI 制作过程 → 暖灯片尾。

## 素材与可复核来源

- `story/manifest.json`、`story/report.json`：从独立空白浏览器存档出发，正常游玩、分岔恢复，真实解锁四种结局。解谜、交付、风险报告、回执、画廊均有原始录制。
- `vehicles/capture-manifest.json`：四组交通素材、输入记录和技术检查。独立拍摄存档仅安排岸边等初始位置；没有注入载具状态、任务完成或成就。木船通过真实操作完成八门；汽车只剪出发和过门，没有在影片中宣称完赛。
- `aigc/narration/`：一条连续生成的成年女声，切成 12 段；按真实语音边界制作字幕。没有身份克隆。
- `aigc/cg-task.json`：新增 Seedance 2 片尾生成任务；源画面沿用已生成的 GPT Image 2 宣传关键帧。
- `audio/score-edit.json`：三条现有 AI 配乐拼接为连续 118 秒音乐底，再按旁白及小许原声压低。
- `edit-decision.json`：镜头入出点、字幕、旁白时码和素材说明。

## 展示边界

画面中区分“实机录制”“剧情 CG”和“AIGC 创作记录”。AI 参与画面与声音制作，不宣传为实时 AI NPC。晴川里是融入武汉生活意象的艺术化虚构街区，不等同真实桥址。外公健在，在姨妈家休养。

角色模型基于 VRoid / pixiv 样例和 CC0 模型改编；不是完全原创建模。详细来源和适用条件保留在项目 `public/models/AVATAR-LICENSE.md` 与 `public/models/residents/RESIDENT-LICENSE.md`。

## 可编辑工程与导出

工程：项目 `video/demo-film-v1/`。使用 Remotion + FFmpeg，时间线为 3540 帧、30fps、1920×1080。

最终 MP4、字幕和核验报告输出到 `output/demo-film-v1/`；旧 30 秒风格样片保持不变。
