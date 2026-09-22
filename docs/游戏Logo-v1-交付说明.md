# 《江城有灯》正式 Logo v1

已通过项目 Image2 接口实际生成，模型 `gpt-image-2`，高质量 2048×768 PNG，一次生成。

**视觉方向**：深青墨色手绘四字横标，以一笔江水和「灯」字上方的小屋檐、琥珀四格窗呼应武汉老巷。四字是主体，不使用风景海报、额外英文或宣传口号。

## 使用文件

- `public/media/game-logo-v1.webp`：主图，1522×443，奶油底深青字。
- `public/media/game-logo-v1-transparent.webp`：深青字透明版，适合浅色界面或画面上方。
- `public/media/game-logo-v1-dark.webp`：浅奶油字透明版，适合深色界面；保留金色窗灯。
- `public/media/game-logo-v1-mark.webp` / `game-logo-v1-mark-dark.webp`：512×512 的「灯」字屋檐窗灯标记，分别适合浅色/深色底。
- 以上均保留对应 PNG；另有 32 / 64 / 128 像素 PNG 图标。

生成原稿完整保存在 `output/imagegen/game-logo-v1.png`。透明版是从不透明原稿精确去底导出；深色适配是同一字形、同一 alpha 的确定性配色变体，没有重新排字或以代码字体替代生成字形。

## 验收

- 实图检查四字准确为「江城有灯」，无额外文字。
- 原稿、主图及 320 / 160 像素版本均由离线 macOS Vision OCR 识别为完全相同的四字；同时逐字进行视觉审图。
- 320 像素宽保留字形、窗灯与江水；160 像素宽仍可读。带细节的图标建议至少 64 像素，32 像素用于简略 favicon 标记。
- 透明边缘已在奶油底与深色底检查；PNG 与无损 WebP 像素往返完全一致。
- 小尺寸/背景对照图：`output/logo-v1/size-and-background-review.jpg`。
- 完整提示词、模型、原稿及全部输出 SHA-256：`media/game-logo-v1.json`。

生成与导出阶段没有修改页面；主项目随后已接入开始页主标、明暗页眉双版本和 32 像素 favicon。接入与浏览器验收见[道具互动 v1 交付与验收](/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/docs/场景道具互动-v1-交付与验收.md)。
