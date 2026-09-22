# 最终参赛片 v3 · 新玩法真实实机补拍

## 来源与真实性

- 入口是 v2 已真实游玩完成的 `granny-delivery-and-drawing-earned` 存档；角色为女性阿遥。没有预置新照片、新食盒或交付完成状态。
- 后续均为真实游戏键鼠输入：地图自动步行、鼠标拖动第一人称视角、Enter 快门、领取三份物资、观看蔡姨剧情、逐一选择热食/葱辣/姓名、走到两处接应点交付。
- Native tab capture 记录 WebGL、DOM HUD 与实际音轨，不更改画面/UI，不传送角色。原生 1920×1080；VP8/Opus 原片保留，交剪 H.264/AAC 30fps BT.709 MP4。三条源片完整解码通过。
- 对景片首次整块 CDP 导出遇到大消息连接限制，使用同一已停止录制的 Blob 分块提取。没有重录或伪造画面。修复后餐盒/交付沿用分块导出。
- 这些新玩法尚有字幕呈现而未配音的新对白，成片不使用新原声轨，保持此前核准的 v2 完整旁白与音乐轨。

## 剪辑建议

| 原片 | 长度 | 使用范围 | 真实可见事件 |
| --- | --- | --- | --- |
| `01-river-photo-alignment.mp4` | 8.133s | 2.0–5.0s | 江汉关/长江大桥；转头对齐到 3/3；4.617s Enter 快门，原生切回阿遥3D对白 |
| `02-meal-packing.mp4` | 6.700s | 1.0–5.0s | 空盒开始；选热干面、不放葱、不放辣、林婆婆标签；4.205s 真实封盒成功 |
| `03-meal-community-delivery.mp4` | 12.508s | 6.5–10.5s | 手提篮走近小许，HUD 已交接2/3；8.462s交付第三盒；篮子移除并进入3D对白 |

交付后的首句是阿遥说：“小许，蔡姨给你留了藕汤。”不是小许的回应。拍摄前已真实交付西侧的两盒，第三次交付时 `chef` 才首次加入剧情 flags。

## 证据

- `SOURCE-VERIFICATION.json`：分辨率、帧率、SHA-256、解码、完成状态核验。
- `report.json`：餐盒与交付完整输入/状态审计，94次输入，0个 Runtime exception。
- `photo-events.json`、`photo-rescue-state.json`：对景时间戳、3/3状态与成功后存档。
- `events.json`：封盒、完整社区行走路径采样、实际交付时间。
- `EDIT-CANDIDATES.json`、`manifest.json`：三个统一源片。
- 拍摄代码 `tools/demo-capture-playful-life-v3.mjs`。

自有 Chrome 捕获会话已关闭；用户浏览器/存档未操作。
