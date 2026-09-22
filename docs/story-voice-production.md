# 《江城有灯》对白配音档案

对白来源为 `src/story.js` 中已冻结的 `DIALOGUES`：189 句。成年阿遥的 49 句分别制作女声与男声，其余人物、旁白和童年阿遥共用，因此交付目标为 238 个独立音频。每句独立播放、独立中断，按台词 ID 和原文校验，不以字幕页序号猜测音频。

## 实际使用的服务

本批使用 Microsoft Edge Read Aloud 服务，通过固定版本 `edge-tts==7.2.8` 的 WebSocket 客户端合成。服务只接收公开剧情文本和选定的标准声线、语速、音高。本工具不读取 `.env`、浏览器 Cookie 或本地登录凭证。

这是可追溯的标准神经语音服务调用，不是 Seedance、Seed Audio、真人录音、武汉口音克隆或带情绪标注的演员系统。Edge 客户端没有正式 API SLA；游戏运行直接读取本地已生成 MP3，不依赖该服务在线。若将来服务接口变化，现有游戏配音仍可播放。

已检查原有 prompt-only 音频生成服务：只有 `prompt`，没有可核实的固定 `voice_id` 控制，不适合逐句维持角色身份；它由另一套工具用于 BGM/SFX。一次匹配现有 GPT 网关的标准 speech 路径探测返回 404，因此没有将其记录为可用 TTS 接口。现有 HeyGen 登录不可用，按项目要求采用可实际调用的固定普通话声线。

## 声线表

| 角色档案 | 固定 voice ID | 语速 | 音高 | 处理 |
| --- | --- | --- | --- | --- |
| 旁白 | `zh-CN-XiaoxiaoNeural` | -6% | 0 Hz | 安静、留白 |
| 成年阿遥 · 女 | `zh-CN-XiaoyiNeural` | -3% | -2 Hz | 年轻、自然 |
| 成年阿遥 · 男 | `zh-CN-YunxiNeural` | -5% | -2 Hz | 年轻、自然 |
| 外公／外公字条 | `zh-CN-YunyangNeural` | -8% | -4 Hz | 温和、放缓 |
| 林婆婆 | `zh-CN-XiaoxiaoNeural` | -11% | -7 Hz | 低缓、亲近 |
| 蔡姨 | `zh-CN-XiaoxiaoNeural` | +3% | -3 Hz | 干脆、明亮 |
| 周伯 | `zh-CN-YunjianNeural` | -8% | -5 Hz | 厚实、稳当 |
| 小许 | `zh-CN-XiaoxiaoNeural` | -1% | +2 Hz | 清楚、轻快 |
| 童年阿遥 | `zh-CN-YunxiaNeural` | -5% | +2 Hz | 轻亮、偏少年，男女主共用 |

所有声线均为大陆普通话。旁白、林婆婆、蔡姨、小许共享 Xiaoxiao 底层声源：它们拥有固定的韵律档案，但不能等同于四位不同演员。年轻的外公／婆婆／蔡姨／周伯继续使用各自同一 voice ID，仅微调语速，不在回忆切换时更换声音身份。对老年与童年角色的年龄感是标准声音的表达选择，不是训练或克隆成果。

回忆语速为：年轻外公 -4%、年轻／那年林婆婆 -6%、年轻蔡姨 +1%、年轻周伯 -5%；小许去年与今天保持同一档案。

## 文件与播放器契约

- 生产工具：`tools/story_voice.py`。
- 9 个角色小样与试听页：`output/audio/story-voice/auditions/`。
- 原始服务音频：`output/audio/story-voice/raw/`，按文本与声线配置哈希保留。
- 可断点恢复的作业台账：`output/audio/story-voice/jobs.json`。保存原文 SHA-256、完整配置哈希、voice ID、客户端版本、时长、音频 SHA-256、状态与重试次数。
- 游戏音频：`public/media/story-voice/`。
- 游戏清单：`public/media/story-voice-manifest.json`，`version: 1`。
- 完整性校验报告：`output/audio/story-voice/verification.json`。

清单条目为 `lines[line.id]`，其中 `text` 必须与当前字幕原文完全相等。NPC 使用 `variants.default`，成年阿遥使用 `variants.female` 或 `variants.male`。每个版本含本地 URL、时长、声线 ID、档案 ID、语速、音高和音频哈希。缺少文件或原文不匹配时不应播放旧录音。翻页、关闭对话、切换片段或切换主角性别时应停止上一句；重播按钮重新播放当前句。

## 混音与质量边界

每句由 ffmpeg 双遍 loudnorm 处理，目标 -19 LUFS，真峰值上限 -2 dBTP，LRA 9 LU；输出 mono MP3，48 kHz，96 kbps。标准服务源本身有采样率和编码上限，重新编码不会创造额外语音细节。保留自然句内停顿，不加入配乐或混响，便于游戏统一控制语音音量与音乐闪避。

生成工具只在完整解码、合理时长与有限响度分析通过后记为成功；失败最多重试 3 次，保留明确状态，不以静音占位文件伪装成功。已完成作业只有在文本、声音配置、文件大小和音频哈希一致时才复用。台词更新会产生新文件名，旧音频不冒充新台词。

自动校验不等于逐句真人听审。专名“阿遥、蔡姨、周伯、过早、江汉关”的读音需结合小样试听或中文 ASR 辅助复核；ASR 的“阿瑶／阿遥”等同音字转写差异并不能单独证明发音错误。完整配音范围、文件校验和辅助复核结果以实际生成后的 JSON 报告为准。

## 重现命令

```bash
uv run --with edge-tts==7.2.8 python tools/story_voice.py audition
uv run --with edge-tts==7.2.8 python tools/story_voice.py generate --concurrency 2
python3 tools/story_voice.py verify
python3 tools/story_voice.py status
```

局部重录可传 `--ids ending-next-breakfast,intro-clock`。修改固定声线档案后重新运行会生成对应新哈希版本。脚本有跨进程锁，不同时启动两个生成进程。

## 本批交付验收

2026-09-10 冻结结果：189/189 句、238/238 个版本，合计 22,240,904 bytes。女声主角完整对白为 1,564.248 秒（约 26 分 04 秒），男声主角为 1,572.552 秒（约 26 分 13 秒）。播放时应允许玩家随时翻页，不强制等一句读完。

238 个生产 MP3 均通过完整解码、音频哈希、源文哈希、声线映射、合理时长和编码后响度检查。实测响度范围 -20.46 至 -19.05 LUFS，最大真峰值 -2.12 dBTP，无验收错误。8 句原本受瞬态峰值限制而偏小声的对白，经过有界增益与过采样限峰修正；记录见 `output/audio/story-voice/level-repairs.json`。新作业生成时自动执行同类检查，已有作业可用 `python3 tools/story_voice.py repair-levels` 补做。

9 个角色小样另有本地中文 Whisper base/small 转写记录；这些模型在专名与同音字上有误识，不用其字面差异判定 TTS 漏读。更大的本地模型下载未完成，已停止，没有把未完成分析写为成功。

对男主、外公和童年阿遥的 3 个完整小样追加了 Gemini 模型辅助听审，未检出需要重做的漏字、多字或严重年龄违和；男主“过早”被听为 guò zǎo。该抽检不代表逐句真人听审，也不把模型对单个字声调的自信说明当作音素级证据。男主与童年声线有轻微合成节奏感。实际响应和保守结论保存在 `output/audio/story-voice/auditions/gemini-review.json`。

这 3 个听审样本与对应生产文件逐字节一致；冻结清单哈希、样本一致性及报告路径见 `output/audio/story-voice/release.json`。生产音频和清单在上述验收后冻结。
