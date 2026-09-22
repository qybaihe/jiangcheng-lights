# 江城有灯 · 大字硬字幕版 v4

本版响应“宣传片字幕不明显”的反馈：全片28句旁白/关键对白统一采用48px硬字幕、深色底板、距底部80px的安全区。实机画面等比放入1568×882窗口，为字幕单独留位，不压住原游戏对话框。所有字幕在最终视频像素内，不依赖播放器字幕开关或旁边的SRT。

## 保持不变

118秒、30镜头、全部源时码、阿遥12段旁白、小许完整回执、原配乐音效。v3完整保留；v4使用其公共素材目录的只读式符号链接，避免重复复制几百MB。

## 重现

在项目根目录执行：

```sh
export PATH=/Users/baihe/.nvm/versions/node/v24.16.0/bin:$PATH
node video/demo-film-v4/render.mjs final-stills
node video/demo-film-v4/render.mjs final --skip-stills
.venv/bin/python video/demo-film-v4/finish.py master
.venv/bin/python video/demo-film-v4/finish.py verify
```

`master`原样复制v3音频流；`verify`核对AAC/PCM/时间戳、完整解码、时长、3540帧、黑帧、响度，并从实际MP4解码28句的中点，确认亮色字幕字形位于安全区。实际画面人工智能目视复核单独保存在`output/demo-film-v4/review/final-editorial-acceptance.json`，不是由技术脚本自动填写的通过。

复核通过后执行`.venv/bin/python video/demo-film-v4/finish.py package`。正式交付目录为`output/江城有灯-参赛片交付-v4-大字硬字幕版/`；请使用其中名称明确的MP4，不要发送中间render文件或旧v3版本。

本目录运行`npm run studio`可编辑，唯一展示的时间线为完整CompetitionDemo。画面、字幕和口述时码保持分层。
