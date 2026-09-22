# 江城有灯 · 第一人称故事版参赛片

本版本独立于 v1：不覆盖旧成片、旁白、工程或交付包。

## 剪辑意图

阿遥用第一人称回忆这趟返乡：本来只住一晚，替正在姨妈家休养的外公送东西。实机先建立完整的小目标——修好收音机、借车认路、骑去林婆婆家、停车交付——再接童画记忆、蔡姨的物资、江边自由探索、社区互助、去留选择与画廊。

配音来自同一条新生成的连续女声；每句保留自然呼吸，不压缩字音，不借快放适配窗口。制作过程卡只用音乐承接，让阿遥的讲述留在故事里。

## 输入与输出

- 编辑决策：`output/demo-film-v2/edit-decision.json`
- 新任务链：`output/demo-film-v2/capture/`
- 配音与实际分句边界：`output/demo-film-v2/narration/`
- 最终规格：118 秒，1920×1080，30fps，H.264 / AAC，MP4
- 最终主文件：`output/demo-film-v2/江城有灯-比赛Demo-1080p-v2.mp4`
- 核验记录：`output/demo-film-v2/review/` 和 `final-technical-acceptance.json`

## 重现

在项目根目录运行，使用已配置的 Node 与 Python 环境：

```sh
.venv/bin/python video/demo-film-v2/integrate-narration.py
# 完成新任务录屏的源时码回填；审核 edit-decision.json 后设置 reviewed: true。
node video/demo-film-v2/prepare-final.mjs
node video/demo-film-v2/render.mjs final-stills
node video/demo-film-v2/render.mjs final
.venv/bin/python video/demo-film-v2/master-final.py
.venv/bin/python video/demo-film-v2/verify-final.py
.venv/bin/python video/demo-film-v2/review-final.py mix
.venv/bin/python video/demo-film-v2/review-final.py task-route
```

`integrate-narration.py` 会重新置为未审核，避免改动后误用旧验收。所有新任务源必须去掉 `sourcePending` 才能准备渲染。输出资产按 SHA-256 留档。最终技术验收包含完整解码、帧数、黑帧、源哈希、字幕边界、响度与峰值；模型辅助视听检查另行标注，不冒称人工听检。

若只调整混音，可运行 `render-audio.mjs`，将输出 WAV 路径传给 `master-final.py`；视频流直接复制，不重复压缩。

晴川里为武汉生活意象的虚构街区。自由探索以独立章节展示，不宣称所有片段来自一次无剪辑通关；AI 创作记录不等同于实时 AI NPC。
