# 《江城有灯》110 秒 Demo 宣传片｜媒体盘点

## 结论

- 现成可用：5 部 1080p/24fps 无声 CG，合计 **154.875 秒**；7 张人物肖像、8 张旧 CG 连续性锚点、44 张新版旧照插图、正式透明 Logo；3 首配乐与完整 TTS/场景音效。
- 1080p 由 720p 经 Real-ESRGAN 动漫模型超分；不是 Seedance 原生 1080p。
- 新生成最多 **2 个 8 秒镜头**：成年阿遥返乡开场、当下修理铺暖灯结尾。其首帧/尾帧兼作封面和片尾底图。音乐全部复用。
- 本次为离线盘点：零网络、零生成/上传、未启动浏览器，未写入 src/public/dist；只写本文件与同目录 JSON。

## 1. 可直接复用的 CG 母版

| 章节 | 时长 | 无声母版 |
|---|---:|---|
| 门还没修 | 29.25 秒 | `/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/public/media/cinema-upscale-v1/prologue-1080p.mp4` |
| 一碗面，一张竹床 | 33.0 秒 | `/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/public/media/cinema-upscale-v1/granny-1080p.mp4` |
| 红盖子的饭盒 | 30.5 秒 | `/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/public/media/cinema-upscale-v1/chef-1080p.mp4` |
| 箱子的另一边 | 28.0 秒 | `/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/public/media/cinema-upscale-v1/dock-1080p.mp4` |
| 那天你也在 | 34.125 秒 | `/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/public/media/cinema-upscale-v1/ending-1080p.mp4` |

全部由 ffprobe 复核为 1920×1080、24 fps、H.264。母版无声，分轨在 JSON 中；混音预览可参考但不应与新 BGM 重复叠加。序章最新有声版为：
`/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/public/media/opening-polish-v1/prologue-mixed-1080p.mp4`

### 精彩段落与建议切点

以下为母版 **1.0 倍速文件时间**，不是游戏 1.15 倍速墙钟时间。剪辑建议位于既有已验收窗口内，新剪辑仍需全片声画检查。

| 段落 | 母版 in–out | 画面 / 用途 |
|---|---|---|
| open-river（prologue） | 0–5 秒 | 轮渡第一人称视点、船栏、江汉关与汉口同岸天际线；没有可见成年主角正脸。开场城市建立 |
| open-alley（prologue） | 14.25–24.25 秒 | 第一人称穿过有生活物件的里分红砖巷。8秒开场可选本段前3秒接轮渡5秒 |
| granny-noodles（granny） | 0–4.875 秒 | 婆婆递面、外公回应；稳定双人。可选约5秒回忆点题 |
| granny-summer（granny） | 15–25 秒 | 竹床午睡，婆婆轻取孩子手中的铅笔。完整动作10秒；紧凑Promo不强塞 |
| chef-box（chef） | 25.5–30.5 秒 | 浅奶白饭盒与带磨白点的红盖，镜头靠近。5秒物件回忆特写 |
| dock-help（dock） | 10–20 秒 | 先询问，段内4–5秒处托住箱子另一边。可选10–16秒表达共同承担 |
| ending-room（ending） | 17.75–26.75 秒 | 童年阿遥在铜座灯旁坐下、打开本子，门口外公/婆婆/蔡姨。9秒完整动作，照顾而非离别 |
| ending-question（ending） | 26.75–34.125 秒 | 童年阿遥抬头发问，外公回答，孩子重新落笔。7.375秒完整收束+2.625秒Logo尾版=10秒 |

**零新增开尾组合**：开场 prologue 0–5 秒 + 14.25–17.25 秒；结尾 ending 26.75–34.125 秒 + 2.625 秒静态 Logo。约 8 + 92 实机 + 10 = 110 秒。结尾若保留童年问答，使用其原句完整录音，不叠宣传旁白。

### 已裁弃区间

- granny-g01-v1 约 6 秒反打产生重复婆婆，正式版使用 v2。
- chef C02 只用原片 0–11.5 秒，之后手部动作已剔除。
- ending E02 只用 0–5.75 秒，6 秒附近饭盒颜色漂移；E03 只用 0–9 秒；E04 只用 0–7.375 秒。
- 优先取 1080p 已剪母版；不要为多几秒回到这些原片尾段。

## 2. 既有人物、场景与 Logo 锚点

### 人物主参考（已发布 CG 连续性）

| ID | 源图 |
|---|---|
| female | `/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/output/imagegen/story-v2-portrait-female.png` |
| male | `/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/output/imagegen/story-v2-portrait-male.png` |
| grandfather | `/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/output/imagegen/story-v2-portrait-grandfather-r2.png` |
| granny | `/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/output/imagegen/story-v2-portrait-granny.png` |
| chef | `/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/output/imagegen/story-v2-portrait-chef.png` |
| dock | `/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/output/imagegen/story-v2-portrait-dock.png` |
| xu | `/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/output/imagegen/story-v2-portrait-xu.png` |

七张均为 1024×1536。女款阿遥为 25 岁栗棕短发、米白开衫/黑内搭/墨绿下装、帆布斜挎包；男款为深栗短发、鼠尾草绿与米白外套。选角择一，不把男女款画成两个人。外公定稿是 grandfather-r2。

### 电影场景与道具锚点

- 轮渡第一视点/江汉关同岸线：`/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/output/imagegen/cinema-v3-prologue-ferry-start.png`（2048×1152）
- 里分红砖巷/修理铺空间：`/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/output/imagegen/cinema-v3-prologue-p04-start.png`（2048×1152）
- 修理铺灰绿门/黄铜门把与钥匙：`/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/output/imagegen/cinema-v3-prologue-p05-start.png`（2048×1152）
- 童年/铜座台灯/蓝棉布/修理铺：`/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/output/imagegen/cinema-v3-ending-e03-start-r2.png`（2048×1152）

旧剧情 CG 全组原稿为 1536×1024（3:2）；需要 16:9 时按安全区裁切，而不是标作原生横屏。定稿清单：

- granny-table：`/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/output/imagegen/story-v2-cg-granny-table-r3.png`
- granny-bamboo：`/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/output/imagegen/story-v2-cg-granny-bamboo.png`
- chef-lamp：`/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/output/imagegen/story-v2-cg-chef-lamp.png`
- chef-extra-bowl：`/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/output/imagegen/story-v2-cg-chef-extra-bowl.png`
- dock-shared-box：`/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/output/imagegen/story-v2-cg-dock-shared-box.png`
- xu-first-shift：`/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/output/imagegen/story-v2-cg-xu-first-shift.png`
- ending-reopen：`/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/output/imagegen/story-v2-cg-ending-reopen-r2.png`
- ending-lamplit-child：`/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/output/imagegen/story-v2-cg-ending-lamplit-child.png`

关键区别：蔡姨的 A 灯为绿边便携灯；修理铺 B 灯为铜座弯颈下照台灯。红盖饭盒必须保留奶白盒身及盖角白点。外公健在，童年与现在分开。

### 新版旧照与当前 3D 造型

- 新版 44 张已生成/调色旧照在 `/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/media/wuhan-memory-art-v1-generated.json`，原稿位于 `/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/output/imagegen/wuhan-memories-v1`；全部 1792×1008。JSON 已逐张列出定稿实际路径。
- 例如 `/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/public/media/wuhan-memories-v1/lore-clock.webp`、`/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/public/media/wuhan-memories-v1/lore-bridge.webp`、`/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/public/media/wuhan-memories-v1/ending-lamplit-child.webp`。
- 当前 3D 居民已改版，与旧 CG 的发型/服装并非完全相同；新版旧照也有造型更新。新电影若延续旧 CG，沿用旧 CG 的人物锚点；实机展示则录当前版本，不混用来伪装造型完全一致。

### 正式 Logo（原字形复用）

- main：`/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/public/media/game-logo-v1.png`（1522×443）
- overLightScene：`/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/public/media/game-logo-v1-transparent.png`（1522×443）
- overDarkScene：`/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/public/media/game-logo-v1-dark.png`（1522×443）
- mark：`/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/public/media/game-logo-v1-mark.png`（512×512）
- markOnDark：`/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/public/media/game-logo-v1-mark-dark.png`（512×512）

透明横标 1522×443，浅底用深青字、暗底用浅奶油字；保留琥珀窗灯。生成图只做无字底图，正式四字 Logo 与副标题交给 Remotion 叠加。现成结局图可先作封面/尾版底图，不必重新生成标题。

## 3. 音轨与 TTS 复用

| 配乐 | 实际长度 | MP3 文件 |
|---|---:|---|
| explore | 67.5 秒 | `/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/public/media/audio/bgm-explore.mp3` |
| memory | 70.5 秒 | `/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/public/media/audio/bgm-memory.mp3` |
| ending | 70.5 秒 | `/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/public/media/audio/bgm-ending.mp3` |

**建议 110 秒配乐时间表**：0–64 秒 explore，62–88 秒 memory，86–110 秒 ending；交叉淡入 2 秒。三段均在现有文件长度内，无需硬循环、无需新增音乐。旁白期间 BGM 再降低约 8–10 dB，以合成后实际听感为准。

- 主线 TTS：169 句 / 233 变体，清单 `/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/public/media/story-voice-manifest.json`。
- 街坊/游览 TTS：179 句 / 194 变体 + 14 项效果音，清单 `/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/public/media/town-audio-v1/manifest.json`。
- 两组主要使用 edge-tts 7.2.8 固定音色、48 kHz 单声道 MP3、96 kbps；成年男女主有独立音色。
- 序章新增三句旁白使用 prompt-only text_to_audio，不是 Xiaoxiao 固定音色。当前总声轨为 29.25 秒；旧文档的“序章零旁白”已过时。

可直接拿取的开场三句：

- 离开武汉以后，阿遥很少再坐这趟轮渡。（4.27 秒）：`/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/public/media/opening-narration-v1/opening-return.mp3`
- 外公在姨妈家休养，托阿遥回来，给街坊送几件东西。（6.62 秒）：`/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/public/media/opening-narration-v1/opening-errand.mp3`
- 原本想着，明天就走。（2.51 秒）：`/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/public/media/opening-narration-v1/opening-one-night.mp3`

故事短句可选（文件及男女变体详见 JSON）：

- `granny-memory-entry`：面要坨了，先吃。
- `dock-memory-ask`：我托一边？
- `ending-memory-child`：外公，明天还在这里写？
- `ending-next-breakfast`：跟我去过早。
- `ending-stay-two-days`：晚两天。我先替你尝尝，等你回来再去一回。

策略：宣传片统一一位旁白。若补新长旁白，优先一次完整生成，再按实际波形分段；prompt-only 接口没有固定 speaker ID，因此新音频不宣称与旧序章音色完全一致。另一个已具备的路径是 edge-tts 固定 narrator ID。人物原声只在对应故事镜头中完整保留，避免与宣传旁白抢话。

环境声从发布素材复用：河水/江风只用于河边；翻页/地图折叠/拾光/修理完成只落在对应动作上；有原始游戏声时避免叠两次。旧 cinema breeze 只验收了源片 0–7 秒，长循环优先用 town 打包江风。

## 4. 已核实 API 与本地程序

### Seedance 2.0（异步视频）

- 程序：`/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/tools/media.py`；带锁/请求指纹/不确定提交保护的生产版本：`/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/tools/cinema_v3.py`。
- 创建：`POST https://ark-i18n-tt.tiktok-row.net/api/v3/contents/generations/tasks`；查询同路径加 `/<task_id>`。
- 鉴权：`Authorization: Bearer <ARK_API_KEY>`；`Content-Type: application/json`。主机可由 `ARK_HOST` 覆盖，模型由 `SEEDANCE_MODEL` 覆盖。现有默认接入点返回实测模型 `dreamina-seedance-2.0-260128`。
- content 含 text，以及 `type=image_url`、`role=first_frame`/`last_frame`、`image_url.url=data:image/png;base64,...`。单首帧去掉尾帧项；不要把本地路径或 localhost 当作远程可访问 URL。
- 本项目 payload 固定 `ratio=16:9`；`duration=8`、`resolution=720p`、`generate_audio=false`、`watermark=false` 是推荐已验证组合。成功后下载 `content.video_url`。
- v3 已接受的原生秒数为 **5/8/10/12/15**，皆为 720p/24fps/无声；首尾帧 8/15 秒另有项目实测记录。旧接口文档写原生 6 秒未测仍成立，不外推任意秒数。
- CLI 提供 480p/720p/1080p 与 1–15 秒的本地枚举；枚举不等于供应商每个组合都已验证。未找到原生 1080p 成功证据。
- 多参考模式构造器：`/Users/baihe/Documents/paid_ads_inspiration/app/model_gateway/seedance.py` 的 `build_content`，角色为 `reference_image`/`reference_video`/`reference_audio`。与首尾帧模式互斥；参考数量/长度上限和人物一致性未在本项目验证。
- `media.py --dry-run` 仅视频、无网络。已有同名请求输入改变必须使用新版本名。`cinema_v3.py` 会在 POST 前持久化 uncertain 状态，创建响应丢失时不盲目重发。

### Image2 / gpt-image-2（图片）

- 入口 `/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/tools/media.py`，内部调用 `/Users/baihe/.codex/skills/.system/imagegen/scripts/image_gen.py`。
- `generate` 为无参考生图，`edit` 为一张/多张参考编辑；可选 mask。参数为 `--model gpt-image-2 --size WxH --quality high --no-augment`。
- 生图真实路由：`https://aidp-i18ntt-sg.tiktok-row.net/api/modelhub/online/v2/crawl/openai/images/generations`。
- 编辑真实路由：`https://aidp-i18ntt-sg.tiktok-row.net/gpt/openapi/online/v2/crawl/openai/images/edits`。两者路径不同。
- 鉴权头 `api-key: <GPT_AK>`；`MODEL_GATEWAY_HOST` 可覆盖主机。loopback adapter 保留 CLI 的原 JSON 或 multipart body/Content-Type。参考素材由 CLI 上传文件字节，不需先传 TOS。
- 已实测图幅：人物 1024×1536；CG 1536×1024；新版插图/结局 1792×1008；视频帧 2048×1152；Logo 原稿 2048×768。新开尾帧建议 **2048×1152**。

### prompt-only 音频（TTS / BGM / SFX）

- 真实端点：`POST https://lv-api.ulikecam.com/cc_ads_api/v1/audio/text_to_audio`。
- 请求体严格为 `{"prompt":"..."}`；当前代码不发送鉴权，也不需要 .env 音频密钥。返回 `base_resp`、`audio_base64`、可选 `output_format`；解码并校验 RIFF/RF64 WAV。
- 没有独立 duration、voice ID、seed、参考音色或参考音乐字段；要求写入 prompt，产物用 ffprobe 实测。底层音频模型未暴露，不归属到某个未经回执确认的模型名。
- 现有程序：`/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/tools/opening_narration_v1.py`、`/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/tools/story_music.py`、`/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/tools/media.py`。BGM 原始实测 72 秒/40 kHz/双声道；不要把 prompt 秒数当作输出保证。

### 固定音色 TTS

- `/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/tools/story_voice.py` / `/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/tools/town_audio.py` 使用 edge-tts==7.2.8。
- API 形式：`edge_tts.Communicate(text, voice=voiceId, rate=rate, pitch=pitch, connect_timeout=20, receive_timeout=90)`，随后 `await save(path)`。
- 旁白固定音色为 `zh-CN-XiaoxiaoNeural`；女主 `zh-CN-XiaoyiNeural`；男主 `zh-CN-YunxiNeural`。已公开 profile 细节在 JSON；无 .env 凭据，不猜客户端内部 HTTP 地址。
- 新宣传词独立保存和生成，保留已发布剧情稳定 ID、文本 hash 和音频不变。

### 可选 TOS 上传

- 现有真实实现：`/Users/baihe/Documents/paid_ads_inspiration/app/model_gateway/tos.py` 的 `TOSClient.upload_file(local,key)` / `upload_bytes(data,key)`；依赖 bytedtos。
- 本项目有 `TOS_ACCESS_KEY` 配置，但 .venv 未安装 bytedtos。本次仅核查存在性，没有联网验证上传可用性。
- 该实现默认桶 seeyou-us-proxy-sg、endpoint tos-notebook-sg.tiktok-row.org；可读 URL 前缀为 `https://sf-capcut-ug.capcutstatic.com/obj/<bucket>/<key>`。默认值来源 settings.py，不是推测。
- 包装器上限 500 MiB；≤5 MiB 直传，大于 5 MiB 分片，单片 20 MiB。当前开尾 PNG 使用 data URL 已足够，无需为这次制作新增对象存储依赖。

**落盘边界**：现有 media.py 会写 output/imagegen 与 public/media，cinema_v3.py 绑定旧制片清单。Demo 正式生成应在独立输出目录封装相同已核实接口，不直接复用旧片名覆盖游戏资产。

## 5. 最多两镜的新生成建议

### demo-opening-new｜8 秒（可选）

成年阿遥站在轮渡栏边，轻扶帆布包带，抬眼望向江汉关；单人单动作，温暖晴日，留出进入实机的方向

- 模式：first+last frame or first-only; choose one mode, no reference_image mixed into frame mode；720p/16:9/无声，完成后按项目既有超分流程交付1080p。
- 连续性：25岁短栗发女主；若主片使用男主则换male主参考。不得把男女选角同时出现。首尾保持同一船栏、岸线和衣服。
- 用途：开场约8秒，新增完整人物故事镜头；既有P01+P04可零新增替代
- 封面/尾版：开场首帧同时可作无字封面底图，Logo和副标题后期叠加
- 参考：`/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/output/imagegen/story-v2-portrait-female.png`；`/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/output/imagegen/cinema-v3-prologue-ferry-start.png`

### demo-ending-new｜8 秒（可选）

当下修理铺夜灯已经亮着，成年阿遥停在门边回望，镜头轻退留下温暖窗灯；不是死亡、诀别或灾难场面

- 模式：first+last frame；720p/16:9/无声，完成后按项目既有超分流程交付1080p。
- 连续性：童年图仅参考修理铺和铜座台灯B，不复制儿童或添加老人；避免重复点灯长动作。A绿边提灯属蔡姨，不替代B铜座台灯。
- 用途：约6–8秒故事收束+2–4秒定版；新增尾帧同时服务片尾海报
- 封面/尾版：尾帧留静区，叠加既有透明Logo和比赛Demo信息；文字不交给生成模型
- 参考：`/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/output/imagegen/story-v2-portrait-female.png`；`/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/public/media/repair-facade.webp`；`/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/output/imagegen/story-v2-cg-ending-lamplit-child.png`

不另造群像大动作、长对话口型或三四个拼接地点的单镜。先确认首/尾帧人物与空间，再提交视频；失败版本留档，新版本号重做。生成任务状态、画面通过和入片完成分别记录。

## 6. 实机与本次证据范围

- 找到 10 条 traversal QA WebM，其中多条 1920×1080/25fps、无音轨；最长 126.12 秒。文件位于 output/qa/traversal，完整路径/规格列在 JSON。
- 它们对应过去 release build，当前角色/场景已更新；仅作镜头动作参考和备用，不以旧 QA 替代当前版本实录。
- 本次查看了已有 prologue/ending 超分对照图和 Logo 视觉样张；没有宣称重新完整看过全部视频。当前选段依据已发布 manifest 和已有动作验收。
- 完整机器可读清单：`/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/output/demo-film-v1/media-inventory.json`。
