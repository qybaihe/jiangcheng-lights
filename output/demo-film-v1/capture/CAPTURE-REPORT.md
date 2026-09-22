# 实机录屏样片验收（12 秒）

## 可交付文件
- MP4：`/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/output/demo-film-v1/capture/walk-to-granny-12s-1080p30.mp4`
- 原始 WebM：`/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/output/demo-film-v1/capture/probe-v5/walking-route-native-tab.webm`
- 完整证据：`/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/output/demo-film-v1/capture/probe-v5/report.json`
- 结构化行动/帧率/音轨清单：`/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/output/demo-film-v1/capture/capture-manifest.json`
- 可重复录制脚本：`/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/tools/demo-capture-granny-12s.mjs`

## 画面与时间码
| 时间（秒） | 真实操作与画面 |
|---|---|
| 0.000–2.502 | 按住 W 手动走动；任务卡“给婆婆送去熟悉的声音”与真实引路 UI 可见。 |
| 2.502–2.807 | 松开 W，停步。 |
| 2.807–3.766 | 点击地图按钮，打开“晴川里 · 江城漫游图”。 |
| 3.766–4.249 | 点击地图上林婆婆标记。 |
| 4.249–12.000 | 点击“走到这里”，由游戏现有自动步行导航走向小院；主角上台阶，婆婆出现在门前。末尾抵达站定。 |

起点 fixture 只写入临时独立 profile：flags = `storyV3, received, radio`。含义为已接任务并修好收音机；录像里没有按 E、没有完成交付。字幕“找到林婆婆，把修好的收音机送回去”应表达当前目标。勿写“已经送回”。所有动作经真实 CDP Input 输入；没有改游戏场景/位置/画面状态。

## 实测
- 游戏画布：1920 × 1080，DPR 1，高画质。
- 每一解码源帧：1920 × 1080；原始源视频共 360 帧。
- 原始 VFR 实测：29.959 fps；要求的采集率 30 fps。WebM 的 `r_frame_rate=60/1` 是探测推导值，应按帧数与 PTS 判断。
- 一处帧间隔 67 ms；无持续卡顿。MediaRecorder 未提供丢帧计数，因此不声称零丢帧。
- 游戏 RAF：60.003 fps，P95 16.8 ms、最大 16.8 ms，0 次 >50 ms RAF 间隔。
- 交付 MP4 视频：H.264 High / yuv420p，1920 × 1080，30 fps，360 帧，12.000 秒。
- 音轨：真实标签页音频，48 kHz / 双声道；源 Opus，交付 AAC 192 kbps。无麦克风/系统桌面声音；录制时关闭降噪、AGC、回声消除。
- 实际音频峰值 -14.718 dBFS、RMS -31.345 dBFS；存在有效游戏声音，非静音。
- MP4 容器可能显示 12.018 秒（AAC 尾包）；Remotion 按 360 帧使用即可。

## 方案比较
| 方案 | 结论 |
|---|---|
| Playwright recordVideo | 本机已安装 playwright-core 1.63.0 的 `coreBundle.js` 录像实现固定 `fps=25`，FFmpeg 参数含 `-an`，停止时还发至少 1 秒末帧。适合 QA，不选作此次原生 30 fps 含音轨宣传片源。此项为代码检查，未另录该方案。 |
| canvas.captureStream(30) | 只能录 WebGL 游戏 canvas；地图/任务卡/对白等 DOM HUD 会缺失。音轨也需要另接。未选用，未声称已测。 |
| 原生桌面/AVFoundation | 系统有多块屏幕，但音频输入仅相机/麦克风，没有 loopback 设备；且会涉及桌面和浏览器 chrome。未启动系统录屏。 |
| Chrome getDisplayMedia 自标签页 + MediaRecorder | 本次已实录验证：完整 DOM + WebGL + 真实标签页立体声音频，原生 1920 × 1080。最佳复用方案。 |

## 复现要点
1. 用独立临时 `--user-data-dir`，`--headless=new`，`--auto-accept-this-tab-capture`，绝不附着用户 Chrome。
2. 通过 CDP 设视口 1920 × 1080，加载正式构建，等待模型和页面就绪，真实点击开始。
3. `getDisplayMedia` 选择当前标签页，video frameRate 30；音频仅 Tab audio。
4. 分享栏会使最初的捕获视口短暂减少 24 像素。等待后调用 CDP `Emulation.setVisibleSize` 恢复真实可见表面 1920 × 1080；检查视频轨道尺寸后再录。
5. 使用 VP8/Opus、视频 16 Mbps、音频 192 kbps。只经 CDP Input 发送键鼠；`windowsVirtualKeyCode` 即可，不写 `nativeVirtualKeyCode`，后者在 macOS 会引出无效键重复。
6. FileReader Data URL MIME 里有 `vp8,opus` 逗号，必须从 `;base64,` 后取数据，勿使用简单 `split(',')[1]`。
7. 停止录制、读原始 Blob、逐帧验尺寸/PTS，再以 ffmpeg 转成 H.264 30 fps。未升格、未补运动插帧、未扩大分辨率。
8. 关闭本进程创建的 Chrome 并删除自有临时 profile；不碰其他浏览器标签页。

```sh
cd '/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛'
CAPTURE_RUN=granny-12s-repeat \
  '/Users/baihe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node' \
  '/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/tools/demo-capture-granny-12s.mjs'
```

所有试验 Chrome 已关闭，用户存档和 src/public/dist 未修改。失败探测仅保留在 capture/probe-v1 至 probe-v4；可用媒体为 probe-v5 与上方 MP4。
