# 整页 AI 图像 PPTX / PDF 编译工具

## 正式输入

- `output/submission-deck-v1/slides/slide-01.jpg` 至 `slide-12.jpg`
- 每张必须为 RGB JPEG，精确 2048 × 1152 像素
- 图片须先通过中文、事实与视觉审核，完整包含排版和文字
- 本工具不添加任何可见文字、形状、页码、图标、边框或装饰，也不裁切图像

## 正式编译

```bash
bash '/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/output/submission-deck-v1/tools/compile_and_verify.sh'
```

正式输出：

- `output/submission-deck-v1/final/江城有灯-参赛作品介绍.pptx`
- `output/submission-deck-v1/final/江城有灯-参赛作品介绍.pdf`

目标文件存在时工具会停止，以免覆盖已交付版本。修订时指定新目标文件夹：

```bash
bash '/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/output/submission-deck-v1/tools/compile_and_verify.sh' \
  '/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/output/submission-deck-v1/slides' \
  '/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/output/submission-deck-v1/final-r2' \
  12 '江城有灯-参赛作品介绍'
```

## 实现与检查

- PPTX 由 JavaScript ES modules + `@oai/artifact-tool` 生成。每页一张源 JPEG，1280 × 720 CSS px 画布，原图字节完整嵌入。
- 正式 PPTX 通过 presentations 技能的 finalizer，检查包完整性、总页数、16:9 几何尺寸，并重新导入验证。
- 最后一页的图片增加 `https://jcyd.classby.cn/` 超链接元数据，不添加覆盖层或新对象。
- PDF 使用 `auto-ppt-image-pdf/scripts/compile_slide_images_to_pdf.py`，设置 `--strict --tolerance 0 --target-size 2048x1152`。
- 技术检查核对页面顺序、每页图像数、嵌入源图 SHA-256、无文字图形覆盖、无裁切、图像与画布尺寸、PDF 页面绘制指令以及文件大小。
- 全部 PPTX 和 PDF 页面实际渲染并与对应源图比较。PDF 同时检查嵌入图像，区分 JPEG 重压缩与 Poppler 的像素插值。
- 两种输出均严格要求小于 30,000,000 字节。
- 接受报告及渲染结果写入 `qa/时间戳/`，不混进交付目录。
- 工具不声称执行过 Microsoft PowerPoint 本机验收。

## 技术样本

`private-build/TECHNICAL-SAMPLE-ONLY/` 只用已有海报测试编译，不是本次正式 PPT。不得作为最终内容交付。样本的源图片和编译产物均留在 private-build 中。

`mark_artifact_operation_started` 已于此任务第一次技术导出前成功执行一次，后续正式编译无需重复执行。

## PDF 原图保真

`preserve_pdf_jpeg.py` 在严格编译后将 PDF 中的 JPEG 流替换为原始输入 JPEG 字节，保留已有页面尺寸、图像变换和绘图指令。避免 Pillow PDF 默认二次编码带来的质量损失。该步骤已加入主编译脚本。
