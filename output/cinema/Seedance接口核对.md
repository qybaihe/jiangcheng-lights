# Seedance 接口核对

## 最新执行结果：已生成四条本项目首尾帧视频

更新日期：2026-09-08。以下执行状态依据 [首批任务清单](/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/media/cinema/seedance-requests-v1.json) 与 [C04 重拍清单](/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/media/cinema/seedance-retakes-v1.json)，清单最近核对时间为北京时间 **19:52:18**。本次文档更新仅读取这些非敏感记录，并以本地 `ffprobe` 复核四个视频文件；未调用生成接口，未读取或输出密钥。

四条任务均已返回 **`succeeded`**，服务返回模型均为 **`dreamina-seedance-2.0-260128`**。实际输出全部为 **1280×720、24 fps、16:9、无音轨**；状态成功仅证明任务完成，不等于镜头动作和审美验收通过。

| 镜头 / 任务 | 请求时长 | 本地容器时长 | 创建 / 成功时间（北京时间） | 实际文件与结论 |
| --- | ---: | ---: | --- | --- |
| C01 / `cinema-c01-v1` | 15 秒 | 15.041667 秒 | 2026-09-08 19:38:56 / 19:45:17 | [原始视频](/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/public/media/cinema-c01-v1.mp4)；首尾帧、横屏、720p、无音频组合成功。 |
| C04 / `cinema-c04-v1` | 15 秒 | 15.041667 秒 | 2026-09-08 19:38:59 / 19:44:19 | [原始视频](/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/public/media/cinema-c04-v1.mp4)；任务成功，但重拍记录说明推碗过头后又回拉，因此产生下一版。 |
| C09 / `cinema-c09-v2` | 15 秒 | 15.041667 秒 | 2026-09-08 19:39:07 / 19:44:31 | [原始视频](/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/public/media/cinema-c09-v2.mp4)；服务生成长度为 15 秒，最终亮灯镜头已原速剪为 3.5 秒。 |
| C04 / `cinema-c04-v2` | **原生 8 秒** | **8.041667 秒** | 2026-09-08 19:48:57 / 19:51:59 | [重拍视频](/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/public/media/cinema-c04-v2.mp4)；请求实际为 `duration=8`，不是从 15 秒素材裁切出的“8 秒成功”。动作方向与连续性仍按成片单独验收。 |

这组新证据确认本接入点已完成 **8 秒及 15 秒 + 首尾帧 + 16:9 + 720p + 无音频**的上述具体请求。它不证明任意时长都可用；**原生 3 秒、4 秒、6 秒等未逐项验证**，亦不证明 1080p 或多角色参考效果。下文历史阶段的“8 秒未验证”“本轮未提交”已被上述结果更新，不能继续作为当前状态引用。

### 剪辑策略已调整

用户指出亮灯镜头没有必要占用 15 秒。后续按画面信息量决定长度：**C09 的亮灯段已原速剪为 3.5 秒**。本次已导出 13 秒节奏样片：C01 取 0–5 秒、C04 v2 取 2.5–7 秒、C09 v2 取 1–4.5 秒；完整解码及桌面／手机浏览器播放检查通过。原先 78 秒全片规划待重新编排，完整影片尚未完成。

生成时长与剪辑时长分别记录。**不再把统一请求 15 秒、要求提前到达尾帧后一直保持作为默认策略。** 每镜应按实际动作选生成时长，使用该具体组合已有的证据或单独试验；剪辑以原速保留有效段落，避免为凑固定总长延长灯光等低信息量动作。原生 8 秒 C04 的成功为短动作提供了直接证据，但不能替代逐镜运动验收。

首批 JSON 中的 `edit_target_duration=6/8` 与 “Complete the action … then hold” 保留的是原提交策略，不是新的普遍制片规则。C04 v1 的回拉也说明，模型收到“提前完成并保持”不等于它会严格遵守时序。原 15 秒素材与相关任务记录保留，便于追溯和剪辑选段。

## 历史核对记录：2026-09-08 首批提交前

以下保留初次接口核对与筹备阶段记录，时间范围为本项目 **2026-09-08 19:38:56 首批新任务提交之前**。该阶段只对已有 `ending` 任务做过只读 GET 查询；当时尚未新建本轮视频，亦尚无本轮原生 8 秒证据。涉及“本次”“本轮”“当前”的历史描述仅适用于该阶段；最新执行状态以上节为准。

### 历史结论

本项目目前使用 Ark 的异步视频生成接口。本次查询本项目已完成的 `ending` 任务，服务返回的模型为 **`dreamina-seedance-2.0-260128`**，视频为 **10 秒、16:9、720p、24 fps、无生成音频**。可以把本项目这批已有视频准确记作 Seedance 2.0 的输出；`ep-...` 是接入点标识，未来映射仍可能变动。

用户本机既有集成明确提供单首帧、首尾帧，以及另一种多模态参考内容结构。本项目 `tools/media.py` 已扩展为可指定 `--first-frame`、`--last-frame`、`--duration`、`--resolution`，并可通过 `--dry-run` 离线核对请求；当时默认时长为 **10 秒**。新任务保存完整请求的 SHA-256，防止同名任务因提示词或参数变化而被误复用。**历史筹备阶段**视频部分只准备清单与 dry-run，未提交新视频任务；此状态已被上节四条成功任务更新。

### 历史接口约定与当时证据强度

| 项目 | 已核实内容 | 依据与边界 |
| --- | --- | --- |
| 创建任务 | `POST https://{ARK_HOST}/api/v3/contents/generations/tasks`；JSON；`Authorization: Bearer $ARK_API_KEY` | [当前实现](/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/tools/media.py:71)；密钥只从服务端/离线环境读取 |
| 查询任务 | `GET` 同路径加 `/{task_id}` | [当前实现](/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/tools/media.py:85)；本次只读查询成功 |
| 当前接入点 | 本项目 `.env` 未设置 `SEEDANCE_MODEL` 或 `ARK_HOST`，因此使用代码缺省接入点 `ep-20260623073342-2cwrv` 与 Ark 主机 | [当前缺省值](/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/tools/media.py:64)；只记录配置存在性，不记录任何密钥 |
| 真实模型 | 本项目已完成任务返回 `dreamina-seedance-2.0-260128` | 本次既有任务只读查询摘要见下；不是仅从接入点名称猜测版本 |
| 单首帧 | 内容项 `type=image_url`、`role=first_frame`、`image_url.url` 为可访问 URL 或图片 data URL | [本项目已执行的结构](/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/tools/media.py:55)；本项目已有成功视频 |
| 首尾帧 | 再增加同结构的 `role=last_frame` 内容项；本项目可用 `--first-frame / --last-frame` 指定 PNG、JPEG、WebP | [本项目构造](/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/tools/media.py:55)；[既有构造器](/Users/baihe/Documents/paid_ads_inspiration/app/model_gateway/seedance.py:52)；[首尾帧请求样本](/Users/baihe/Documents/canva宣传复刻/requests/seedance_calibration.json:13)；历史核对阶段未新建首尾帧试片，后续本项目已完成四条，见最新结果 |
| 多参考图 | 每张图片分别用 `role=reference_image`；同类构造器还支持 `reference_video` 和 `reference_audio` | [既有构造器](/Users/baihe/Documents/paid_ads_inspiration/app/model_gateway/seedance.py:76)；本次未验证数量上限、组合上限或角色一致性效果 |
| 模式互斥 | 首帧/首尾帧模式与多模态参考模式不混用 | [既有集成的明确说明](/Users/baihe/Documents/paid_ads_inspiration/app/model_gateway/seedance.py:63)；因此不要在同一请求同时放 `first_frame` 与 `reference_image` |
| 时长 | 整数 `duration`，本项目工具默认 10；本项目成功为 10 秒；本机其他已完成记录为 5 秒与 15 秒 | [本项目默认值](/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/tools/media.py:48)、[5 秒回执](/Users/baihe/Documents/canva宣传复刻/outputs/calibration_status.json:1)、[15 秒回执](/Users/baihe/Documents/canva宣传复刻/outputs/cgt-20260827071322-5xblc.status.json:1)；本地仅校验 1–15，不把本地校验当成上游支持范围 |
| 分辨率 | 本项目 `--resolution` 接受 `480p / 720p / 1080p`，未指定则省略字段；已有成功输出为 `720p` | [参数定义](/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/tools/media.py:121)、[写入请求](/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/tools/media.py:65)、[集成示例](/Users/baihe/Documents/paid_ads_inspiration/docs/model-calling-handoff.md:251)；CLI 枚举不等于上游组合实测；没有本端点 1080p/4K 的验证证据 |
| 画幅 | 本项目调用固定 `ratio=16:9`，已有成功输出为 `16:9`，本机其他成功记录为 `9:16` | [当前调用](/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/tools/media.py:64)；其他枚举未核验 |
| 生成音频 | `generate_audio` 布尔值；当前工具默认 true，`--silent` 置 false；本项目 `ending` 成功回执明确 false | [当前实现](/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/tools/media.py:48)；`arrival.mp4` 有 AAC 音轨，`ending.mp4` 无音轨。已有一次带音频的 ending 失败，不能据此认定模型完全不支持音频 |
| 成功结果 | `status=succeeded` 后读取 `content.video_url` 并下载 | [本项目实现](/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/tools/media.py:90)；更通用集成兼容额外结果包裹方式，见 [交接说明](/Users/baihe/Documents/paid_ads_inspiration/docs/model-calling-handoff.md:284) |
| 终态 | `succeeded / failed / canceled / cancelled` | [本项目实现](/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/tools/media.py:97)；失败应保留任务记录，不能无条件重建 |
| 离线预检 | `--dry-run` 只输出提示词路径、帧路径/哈希、参数与请求 SHA-256，不发网络请求、不输出 data URL 或鉴权信息 | [本项目实现](/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/tools/media.py:67)；预检通过不代表上游已接受请求 |
| 并发 | 既有集成按最多 2 个处理中的任务设置进程内信号量 | [并发门](/Users/baihe/Documents/paid_ads_inspiration/app/model_gateway/seedance.py:27)；这是本地配置约束，不是已核验的供应商全局额度。本项目当前工具没有此闸门，首轮应顺序生成 |

本次已完成任务的只读响应摘要（只保留非敏感元数据；不保存鉴权头、任务 ID 或下载链接）：

```json
{
  "queried_existing_project_asset": "ending",
  "model": "dreamina-seedance-2.0-260128",
  "status": "succeeded",
  "duration": 10,
  "ratio": "16:9",
  "resolution": "720p",
  "generate_audio": false,
  "framespersecond": 24,
  "seed": 9464
}
```

本地 `ffprobe` 也确认 `arrival.mp4` 为 1280×720、24 fps、约 10.054 秒、有 AAC 音轨；`ending.mp4` 为 1280×720、24 fps、约 10.042 秒、无音轨。容器长度与请求整数秒的微小差异不应视为精确剪辑点。

### 首尾帧的历史成功证据与日期

以下是本机既有成功记录，不是本轮新生成；时区均为 Asia/Shanghai（UTC+8）。请求文件、提交回执与状态回执通过任务 ID 对应检查。实验文档记录了首尾帧检查；此处不复制原素材 URL 或任何鉴权信息。

| 参数与模式 | 创建 / 完成时间 | 证据 |
| --- | --- | --- |
| 5 秒、首尾帧、9:16；回执 `720p / 24 fps / generate_audio=true / dreamina-seedance-2.0-260128 / succeeded` | 2026-08-27 14:45:05 / 14:52:07 | [首尾帧请求](/Users/baihe/Documents/canva宣传复刻/requests/seedance_calibration.json:13)、[提交回执](/Users/baihe/Documents/canva宣传复刻/outputs/calibration_submit.json:1)、[成功回执](/Users/baihe/Documents/canva宣传复刻/outputs/calibration_status.json:1)、[三次首尾帧实验结论](/Users/baihe/Documents/canva宣传复刻/analysis/experiment_results.md:7) |
| 15 秒、首尾帧、9:16；回执 `720p / 24 fps / generate_audio=true / dreamina-seedance-2.0-260128 / succeeded` | 2026-08-27 15:13:22 / 15:19:00 | [首尾帧请求](/Users/baihe/Documents/canva宣传复刻/requests/seedance_15s.json:13)、[提交回执](/Users/baihe/Documents/canva宣传复刻/outputs/seedance_15s_submit.json:1)、[成功回执](/Users/baihe/Documents/canva宣传复刻/outputs/cgt-20260827071322-5xblc.status.json:1)、[实验技术数据](/Users/baihe/Documents/canva宣传复刻/analysis/experiment_15s_results.md:24) |

上述记录证明这个接入点在 2026-08-27 曾成功完成 5 秒与 15 秒首尾帧任务。它们不是每个中间整数时长的实测证明。2026-09-08 本项目后续完成的 8 秒与 15 秒横屏无音频组合已在最新执行结果单独记录，仍不能据此推断全部时长组合均已验证。

当时没有找到能确认接入点完整 `duration` 参数范围的已核验文档。既有集成仅把整数透传，并明确最终组合取决于接入点，见 [参数边界说明](/Users/baihe/Documents/paid_ads_inspiration/docs/model-calling-handoff.md:288)。**历史状态：首批提交前 6 秒、8 秒暂记为未验证。更新后：本项目原生 8 秒已实测成功，原生 6 秒仍未验证。** 不由 5/8/10/15 秒的成功记录推断任意整数时长都已验证。

**历史提交计划**中，C01 的 6 秒、C04/C09 的 8 秒是剪辑目标时长；首批清单显式使用模型参数 `duration=15`，与当时工具默认 10 秒及独立试片建议 5 秒分开。首批提交前，“15 秒 + 16:9 + 无音频 + 当时各组两帧”尚未验证；这三条请求后来均成功，不再是待执行计划。

**历史策略，现已停止作为默认做法：** 首批各镜头提示词要求动作与主要运镜在第 6/8 秒内完成，再以自然微动保持至第 15 秒，后期拟原速截取。首尾帧只能约束整体边界，不保证尾帧构图提前到达，实际 C04 v1 还出现了推过头再回拉的问题。后续按镜头信息量与实片选择时长，C04 已改为原生 8 秒，C09 剪辑改为约 3–4 秒。生成时长与剪辑时长仍须分开记录，不把裁切片段宣称为原生短时长任务。

### 历史记录中的 5 秒试片请求示例

初期曾建议另外生成一条 5 秒、720p 的无音频试片，检验两帧之间的人物、灯具与建筑连续性。它是当时的独立动效验证建议，不是统一默认值，也不是首批 C01/C04/C09 的正式生成时长；截至本次清单记录，没有提交这条独立 5 秒请求。保留下列示例用于说明请求结构，不将其列为已完成视频，也不因示例时长而限制当前剪辑。

```json
{
  "model": "ep-20260623073342-2cwrv",
  "content": [
    {
      "type": "text",
      "text": "A single continuous restrained cinematic shot. Preserve the exact same people, clothing, brass lamp and Wuhan alley architecture from the first and last frames. The camera makes one slow gentle move; the character performs only the described small action. Natural weight, steady faces, subtle cloth movement, believable warm practical light. No cuts, no new people, no text or subtitles."
    },
    {
      "type": "image_url",
      "image_url": {"url": "<首帧图片 data URL>"},
      "role": "first_frame"
    },
    {
      "type": "image_url",
      "image_url": {"url": "<尾帧图片 data URL>"},
      "role": "last_frame"
    }
  ],
  "ratio": "16:9",
  "duration": 5,
  "resolution": "720p",
  "generate_audio": false
}
```

`image_url.url` 应填图片 data URL，或模型可访问的媒体 URL，不能传本机文件路径或 `http://localhost:4173/`。本项目已经使用 WebP data URL；既有构造器还处理 PNG/JPEG。集成注释记录请求体上限 64 MB，base64 会膨胀体积，因此先压缩图片并限制请求体，见 [图片编码说明](/Users/baihe/Documents/paid_ads_inspiration/app/model_gateway/seedance.py:39)。本次没有探测上游体积边界。

若某镜头没有严格的终点要求，可删除尾帧项，保留单首帧。若需要多角色参考，应改用完整的 `reference_image` 模式并单独验证，不能给首尾帧请求随意附加参考项。大场面优先拆为多个短镜头剪辑；接口成功不等于长镜头人物和地理关系稳定。

`watermark=false` 是当前项目已使用的额外字段；最小请求不依赖它。`seed`、`camera_fixed`、`draft`、尾帧返回开关等未在本项目核验，不应凭通用印象加入。

### 历史核对时的任务恢复与工具局限

当前工具在 `tmp/media-jobs.json` 记录镜头名称对应的 `id`、`status`，并为新任务记录 `request_sha256`，见 [保存新任务](/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/tools/media.py:81)。同名任务存在时不会重新 POST；保留原提示词、原输入帧与原参数，以相同名字加 `--poll` 会继续查询原任务。一次轮询预算为 1500 秒，间隔 25 秒；查询超时会保留任务，可再次查询，见 [轮询实现](/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/tools/media.py:83)。

哈希覆盖完整请求，包括提示词、帧内容、模型与生成参数。已有任务的非空哈希与本次请求不同时，工具拒绝执行并要求使用新版本名，见 [一致性检查](/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/tools/media.py:74)。旧任务没有哈希时仍兼容恢复，但无法验证旧输入是否变化；失败任务同名重跑也只会再读失败记录。修订应采用新的明确版本名，例如 `prologue-01-v02`，保留旧任务以便追溯。

正式制片还应在制作清单保存提示词/输入帧的独立哈希、实际请求参数、剪辑目标、创建时间、服务返回模型与输出验收结果。dry-run 已可输出帧哈希和完整请求哈希，便于在提交前留档；它不写入任务状态，也不证明供应商端已校验参数。

当前 JSON 写入不是原子合并，也没有跨进程锁；多个进程并发可能覆盖彼此任务记录。首轮顺序提交最稳妥。创建请求如果上游已受理、客户端却在拿到 ID 前超时，自动重发可能重复付费；此时先核对任务，不能盲目重试 POST。下载地址的有效期与供应商任务保留期，本次没有验证，成功后应及时保存本地成片。

## 当前仍未核验的能力

- 本接入点目前完整的分辨率、时长、画幅枚举，以及参考图片/音频/视频的数量与长度上限。本项目新实测覆盖 8 秒和 15 秒横屏 720p 无音频，不等于原生 3/4/6 秒或任意时长已验证。
- 多参考图与人物身份保持的实际表现；首尾帧提示词遵循度需要试片验证。
- 原生生成音频的对白精度、口型同步与可控混音能力。正式剧情建议先无音频出镜头，TTS、环境声和配乐统一在后期处理。
- 供应商当前价格、额度、并发限制、幂等键及任务保存期限。本次没有读取计费信息或做能力边界探测。

这些边界不妨碍对已生成素材继续进行动作验收与按信息量剪辑，但不能把 720p 素材放大后标为原生 4K，也不能把客户端接受某字段等同于上游已经支持该参数组合。生成成功、视觉通过和剪辑完成应分别记录。
