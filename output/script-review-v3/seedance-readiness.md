# Seedance 2 序章试片 · 接口就绪核对

核对时间：2026-09-11 23:56—23:59（Asia/Shanghai）  
范围：只读源代码、既有任务记录、两条既有任务 GET、一次既有视频范围 GET、离线 dry-run。**本次没有 POST，没有提交生成，没有扣费生成操作，没有输出密钥或完整下载地址。**

## 1. 当前结论

**项目现有 Ark 接口可继续使用，接口地址和模型接入点不需要迁移。** 当前鉴权能够读取本项目既有任务，返回的实际模型仍是 `dreamina-seedance-2.0-260128`；视频下载 GET 可用。下方保留 **8 秒、16:9、720p、无模型生成音频、已有首尾帧驱动**的推荐示例，仅作能力说明，已经不是主任务当前新试片计划。

这只是视觉试片，不是把序章定成 8 秒，也不重新把一句亮灯动作拉成 15 秒。序章最终时长应由完整叙事节拍决定。对白仍待用户审稿；本次试片可以无口型、无说话动作、无烘焙字幕，后期另接旁白和环境声，不锁住文字版本。

**账号证据的边界**：既有任务查询 HTTP 200 证明当前凭据对这些任务有效；并未查询余额或配额，也没有用创建任务验证当前计费额度。新任务是否被接受，须以之后真实 POST 的回执为准。

### 主任务后续执行更新

主任务已纠正旧环境断链误判：`.venv/bin/python` 3.13.15 可运行，OpenAI/PIL/httpx 均正常。新建的 `.venv-media-v3` 未完成依赖安装，已停止并删除，后续直接使用原 `.venv`，不再建议新环境。

主任务已用现有 ImageGen CLI 提交 `cinema-v3-prologue-ferry-start` 图像编辑：旧 C01 只作钟楼/机位参考并移除女性角色，`granny-bamboo` 只作动漫风格参考。新画面无主角，支持男女选角。**实际新视频试片计划为单首帧、15 秒、三镜、无对白的序章前半段，不是下方的 8 秒双帧示例；32 秒完整序章仍只是方案。** 本核对文档不将主任务后续操作冒记为本轮只读检查已完成的生成。

## 2. 实际只读网络结果

| 检查 | 当前实测 |
| --- | --- |
| `cinema-c04-v2` 任务 GET | HTTP 200；`succeeded`；实际模型 `dreamina-seedance-2.0-260128`；8 秒；16:9；720p；24 fps；`generate_audio=false` |
| `cinema-c01-v1` 任务 GET | HTTP 200；`succeeded`；同模型；15 秒；16:9；720p；24 fps；`generate_audio=false` |
| 两条结果地址 HEAD | 均 HTTP 403。不要据此宣布地址失效，这些签名地址不接受 HEAD |
| `cinema-c04-v2` 结果地址 **GET**，`Range: bytes=0-63` | HTTP 206；`video/mp4`；`Content-Range: bytes 0-63/2191647`；读取 64 字节，存在正确的 MP4 `ftyp` 头 |
| 本地 C04 v2 `ffprobe` | H.264、1280×720、24 fps、仅视频流；容器时长 8.041667 秒 |

只打印以上白名单字段；未保存鉴权头、任务 ID、签名 URL 或环境文件内容。下载检查未另写媒体文件。

## 3. 当前项目调用契约

实现：[`tools/media.py`](/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/tools/media.py)。

- 创建：`POST https://{ARK_HOST}/api/v3/contents/generations/tasks`。
- 查询：`GET` 同路径加 `/{task_id}`。
- 鉴权：从项目 `.env` 合并进程环境读取 `ARK_API_KEY`，使用 Bearer 头。凭据只在离线工具进程内使用。
- 本次配置存在性：`ARK_API_KEY` 存在；`ARK_HOST`、`SEEDANCE_MODEL` 均未设置，使用当前代码缺省配置。
- 当前请求 `model`：`ep-20260623073342-2cwrv`。它是接入点，**不是模型版本名**；最新既有任务回执确认实际模型是 Seedance 2.0。
- 内容数组：一项 `type=text`；首帧为 `type=image_url, role=first_frame`；尾帧为同结构 `role=last_frame`。文件编码为 PNG/JPEG/WebP data URL，不传本地路径给远端。
- 固定横屏：`ratio=16:9`。
- 无生成音频：CLI 使用 `--silent`，请求实际写 `generate_audio=false`。省略 `--silent` 会默认打开生成音频，不符合本次“文字先审、后配音”的方向。
- 本地 CLI 可接受 `duration=1…15` 和 `480p/720p/1080p`，但这只是参数校验。**当前可靠组合选 8 秒或 15 秒、720p；不要把枚举当成每种组合都实测成功。** 旧项目另有 10 秒成功输出。
- 首帧/首尾帧模式已有实际成功证据；当前 CLI **未实现视频多参考输入**。`--reference` 是图片生成参数，在 `kind=video` 中不会被传给 `video()`，不能误以为它会约束视频人物。

### 与 ChatCut 最新技能的区别

本次已读：

- [`video-gen/SKILL.md`](/Users/baihe/.codex/plugins/cache/chatcut-inc/chatcut/0.2.18/skills/video-gen/SKILL.md)
- [`references/seedance2.md`](/Users/baihe/.codex/plugins/cache/chatcut-inc/chatcut/0.2.18/skills/video-gen/references/seedance2.md)

技能的主体/动作/场景/光色/镜头/风格/质量/约束八要素、参考图序号和单镜头单运镜规则可用于写提示词。**ChatCut 的工具封装参数不能直接搬进项目 Ark 请求**：

| 项目 | ChatCut 封装 | 本项目 Ark 接入 |
| --- | --- | --- |
| 模型参数 | `seedance2` | 当前接入点 `ep-…` |
| 时长字段 | `durationSeconds` | `duration` |
| 输入引用 | ChatCut 项目 asset ID | data URL / 远端可访问 URL |
| 生成音频 | ChatCut 当前封装始终打开 | 本项目已验证 `generate_audio=false` |
| 首尾帧 | `firstFrame/lastFrame` | 内容项 `role=first_frame/last_frame` |
| 参考图与首帧混用 | 新技能有其封装组合约定 | 本项目工具尚未实现多参考模式；不要直接推断兼容 |

没有新建 ChatCut 项目，没有登录 ChatCut，没有切换网关，也没有将现有项目素材上传到其他平台。

## 4. 运行环境与旧路径

本轮 23:56 的直接实测：

- `/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/.venv/bin/python` **当前可执行**，Python 3.13.15。
- 可导入 `httpx 0.28.1`、`dotenv`、`PIL 12.3.0`。
- 这个 Python 仍链接到旧的 `/Users/baihe/Documents/ByteDance/.local/share/uv/python/…` 路径。它在本轮检查时可运行，不应把以前的断链判断继续写成当前实测结果；但可移植性较差。
- `ffmpeg` 与 `ffprobe` 均在 `/opt/homebrew/bin`，可用。
- 当前 ImageGen CLI `/Users/baihe/.codex/skills/.system/imagegen/scripts/image_gen.py` 存在；**调用视频函数不依赖它，也不依赖 OpenAI SDK**。
- `.venv-media-v3` 已由主任务停止并删除，不作为后续运行环境。原 `.venv` 已实测可用。

**采用环境**：视频生产使用现有 `.venv/bin/python`；`httpx`、`python-dotenv`、`Pillow`、OpenAI SDK 均已可用。不需要迁移 Ark endpoint。也不要用 3.12 Python 通过 `PYTHONPATH` 强行加载 3.13 的原生扩展；本次用实际 3.13 环境进行了只读请求。

## 5. 保留的 8 秒双帧推荐示例（非当前新试片计划）

以下是**待主任务执行的制作命令**，本轮未执行创建。预条件：主任务审定参考帧和短提示词，并将提示词保存为：

`/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/media/prompts/prologue-arrival-v3-test1-video.txt`

已有可复用序章帧：

- [`cinema-c01-start-v1.webp`](/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/public/media/cinema-c01-start-v1.webp)：2048×1152，398,300 字节。
- [`cinema-c01-end-v1.webp`](/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/public/media/cinema-c01-end-v1.webp)：2048×1152，399,364 字节。

这两张旧帧的既有提示词明确是**女性阿遥**。它们适合延续已建立的女主视觉试片，不应自动覆盖男女共用序章；若要男女通用，主任务先选无人或背影不区分角色的序章帧，或者后续分别产出男女版本。

先离线预检：

```sh
cd '/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛'
.venv/bin/python tools/media.py video prologue-arrival-v3-test1 \
  --first-frame public/media/cinema-c01-start-v1.webp \
  --last-frame public/media/cinema-c01-end-v1.webp \
  --duration 8 --resolution 720p --silent --dry-run
```

确定后只提交一条，不在同进程内另开并发：

```sh
cd '/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛'
.venv/bin/python tools/media.py video prologue-arrival-v3-test1 \
  --first-frame public/media/cinema-c01-start-v1.webp \
  --last-frame public/media/cinema-c01-end-v1.webp \
  --duration 8 --resolution 720p --silent
```

任务名进入任务记录后，以相同输入和参数恢复查询及下载：

```sh
cd '/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛'
.venv/bin/python tools/media.py video prologue-arrival-v3-test1 \
  --first-frame public/media/cinema-c01-start-v1.webp \
  --last-frame public/media/cinema-c01-end-v1.webp \
  --duration 8 --resolution 720p --silent --poll
```

注意：当前 `--poll` **不是纯查询命令**；如果该名字还没有任务记录，它会先创建。只读检查用直接 GET 既有任务，不要拿新名字运行 `--poll`。生成成功后工具保存到 `/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/public/media/prologue-arrival-v3-test1.mp4`。

### 可交给总编压缩使用的提示词草案

> 8 秒、16:9，精致手绘动画电影质感。@Image1 首帧中的年轻中国女性站在轮渡甲板右侧，保持原有低马尾、燕麦色外套、绿裤子和帆布包，与 @Image2 尾帧为同一人。镜头始终位于奶油色栏杆内，面向汉口江岸。只做一次极轻的向前推进；江面有细小波纹，船行带来缓慢视差，人物轻扶包带，发梢被江风带动，平静地望向岸边，不转脸、不说话。江汉关钟楼位置与结构稳定，金色天光和清透青绿江面，保留参考图明亮细腻的材质与空气层次。自然到达尾帧，不提前定格、不重复动作。人物轮廓与手部稳定，无多余肢体、变脸、穿模、突然出现的地标或船只；无剪切、字幕、标志、水印、黑边。视觉母版，环境声、音乐和对白留到后期。

只把已审核参考帧里的可见元素写入提示词，主任务换帧时需同步改掉人物、衣服与构图描述。不要沿用旧提示词中“6 秒到达尾帧、再保持到 15 秒”的拖时长要求。

## 6. 任务恢复与生成验收

- 任务记录在 [`tmp/media-jobs.json`](/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/tmp/media-jobs.json)。同名新任务会检查请求 SHA-256；提示词、帧或参数变化应使用新版本名，不覆盖成功旧片。
- 当前写入无跨进程锁；本次试片顺序进行，避免并行脚本覆盖任务记录。
- 若创建 POST 超时但供应商可能已受理，先核对账号任务再决定下一步，不自动再 POST 一次。
- 查询最多持续 1,500 秒、每 25 秒一次；超时保留任务，之后可恢复。终态有 `succeeded/failed/canceled/cancelled`。
- 下载成功后先 `ffprobe` 和完整解码，再看首、中、尾与实际运动；不要把 `succeeded` 写成美术验收通过。
- 试片看四项：江城辨识是否清楚、镜头有没有前进感、人物与建筑是否稳定、动作是否可自然接向“回到巷子”的下一段。
- 不以慢放、尾帧久停、重复亮灯凑时长。若有效内容只有 4 秒，就剪 4 秒；需要更长序章时补新的叙事动作，而不是延长空镜。
- 音频先保持分离。对白稿定版后才生成最终 TTS，整体剪辑时间线应按完整配音时长设计，避免继续出现“10 秒视频截断 21/24 秒旁白”的旧问题。

## 7. 本次离线预检证据

对既有 `cinema-c01-v1` 原参数执行了工具的 `--dry-run`，成功构造 15 秒、720p、16:9、无音频、双帧请求。工具报告 `dry-run; no request submitted`，没有网络创建或修改任务记录。

- 首帧 SHA-256：`5f034f548359c925891482df4c09226daa84233d38ae05f826c91300a3db0f74`
- 尾帧 SHA-256：`f3ba84d37dfe1927c2e23f4901557f713763e6de6afee8e48786c03c025a8d72`
- 该次原参数请求 SHA-256：`6cb2d2e8ca6f1c8bf6a996fcb68d0a3f33e89d58efa0a97f4c064f8d0feac35b`

这不是新 8 秒试片的哈希。新提示词与参数确定后，应重新 dry-run 记录，不复用旧哈希。

