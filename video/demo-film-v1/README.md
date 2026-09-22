# 118 秒最终参赛片

当前主时间线为 `output/demo-film-final/edit-decision.json`：**3540 帧、1920×1080、30fps、总长 118 秒**。包含 94 秒真实实机、16 秒 Seedance CG 和 8 秒 AIGC 制作记录。

最终导出：项目 `output/demo-film-v1/江城有灯-比赛Demo-1080p-v1.mp4`。

重新构建顺序（在项目根执行，确保 Node 在 PATH）：

```sh
node video/demo-film-v1/prepare-final.mjs
node video/demo-film-v1/render.mjs final
.venv/bin/python video/demo-film-v1/master-final.py
.venv/bin/python video/demo-film-v1/verify-final.py
```

- 只检查关键帧：`node video/demo-film-v1/render.mjs final-stills`。
- `final-asset-ledger.json` 记录实际源文件 SHA、取用时码及来源类型。
- `参赛片-旁白字幕.srt` 与 `参赛片-操作说明.srt` 随片保留。
- 生成、实录与源文件听检证据在 `output/demo-film-final/`。
- 画面中对实机、剧情 CG、AI 制作记录分别标注；片中不宣称实时 AI NPC。

下方保留先前 30 秒风格样片的工作记录；已交付样片 MP4 未覆盖。

---

# 江城有灯 · 参赛 Demo 影片工程

这是独立的 **Remotion 4.0.524 / React** 工程，不修改游戏源码或已有存档。

## 当前阶段

- 完整导演计划：110 秒，开场 8 秒 CG＋92 秒实机＋结尾 10 秒 CG。
- 当前交付：30 秒视听风格样片；8 秒既有 CG＋12 秒本次实录＋10 秒新 Image2 片尾意向图。
- 样片不是完整流程，12 秒实录没有完成“送还收音机”，只展示打开地图和前往小院。
- 新片尾当前为关键帧与 Remotion 轻微运镜，不登记为已经生成的新 Seedance 动画。

## 工作方式

1. `production-plan.json` 与导演文档确定 110 秒结构。
2. 用 `tools/demo-capture-granny-12s.mjs` 中已验证的独立 Chrome 标签页捕获链路录制。完整 DOM＋游戏声音，真实键鼠，保持当前生产构建、1920×1080、30 fps。
3. 先录谜题、领取/交付、社区回执等有输入和反馈的镜头，再补步行与镜头衔接。完整镜头清单在导演文档中。
4. CG、实机、旁白、音乐、环境声、任务注释、Logo 分层编排；保留原始素材，修改字幕不必重录游戏。
5. `prepare.mjs` 校验并复制批准素材，生成样片 props、素材账与 SRT。`render.mjs` 直接用 Remotion 渲染 H.264/AAC MP4。
6. 最终片另用 `final-props.json`，所有素材审核后显式置 `readyForFinal: true`。缺片时渲染器会报错，不用黑场或假实机补空。

## 本机命令

```sh
export PATH="/Users/baihe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH"
cd "/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/video/demo-film-v1"
PNPM=/Users/baihe/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm
$PNPM install --frozen-lockfile
node render.mjs proof
```

生成的文件位于项目的 `output/demo-film-v1/`。可用 `node render.mjs stills` 仅检查关键帧；用 `node node_modules/typescript/bin/tsc --noEmit` 检查工程类型。安装与字体渲染在当前 macOS 已验证，字体栈使用系统 PingFang SC / Songti SC，不把系统字体作为素材再分发。

## 素材与字幕

- `proof-asset-ledger.json`：源文件、字节数、SHA、素材类型。
- `capture/capture-manifest.json`：实际构建、录制存档、键鼠时码、360 帧原生 1080p 核验。
- `generation/`：单次 Image2 关键帧、提示词、参考图 SHA、视觉检查。
- `narration/`：两句新宣传旁白、原始录音、精确切片与模型辅助听检；不是人耳试听报告。
- `风格样片-旁白.srt`：逐句旁白字幕。片尾大标题本身呈现同一句，不再同时叠一遍底部字幕。

## 最终验收

时长 ≤120 秒、1920×1080 以上、MP4、推荐 <500 MB。完整片必须以 92 秒真实操作为主体，有准确任务注释和明确 CG 角标。最终实录中的地图至少留 2–2.5 秒，完整保留关键人物原句和成功反馈；样片短时码不能替代完整片的录制验收。

在每次最终渲染后运行 `../../.venv/bin/python verify.py`（当前脚本核验 30 秒样片），进行逐帧解码、画幅/帧数/音轨/响度/黑场/源文件一致性核验。完整片制作时更新独立验收目标，不能沿用“样片通过”作为 110 秒通过。
