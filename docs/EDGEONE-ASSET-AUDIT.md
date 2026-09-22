# EdgeOne 静态发布资产审计

日期：2026-09-13。范围：完整游戏、男女主角、9 位居民、交通/小游戏、四结局、画廊、CG 与全部声音。

## 结果

- 原 `public/`：976 文件，755.63 MB。
- 最小保守运行闭包：619 文件，274.73 MB，减少 **63.6%**。
- 基于本轮现存 `dist/` 的独立站点：623 文件，276.50 MB（含构建脚本/CSS/HTML）。
- 未删除/修改源素材、`public/`、源代码、`.env`、存档或旧参赛片。
- 该体积是完整游戏总资源，不等于首屏下载量。CG、后续对白/画廊原有按需读取仍保留。
- 运行闭包在 `output/edgeone-release/audit/asset-plan.json`，逐文件给出路径、原始/发布字节、SHA256、理由、是否裁剪元数据。

## 可复用工具

```sh
node tools/prepare-edgeone-release.mjs --input dist --output output/edgeone-release/site
```

输出必须为新目录。工具只从构建输出复制运行必需文件，不携带生成脚本、请求、原始媒体、Git、依赖、`.env`、审计文件或源映射。审计在 `site` 同级，不会公开。

`tools/edgeone-assets.mjs` 可独立只读分析，或用 `--stage NEW_DIRECTORY` 输出仅公共运行资源。

## 运行资产组成

| 类型 | 文件数 | 大小 |
|---|---:|---:|
| `.mp4` | 5 | 143.90 MB |
| `.vrm` | 11 | 47.92 MB |
| `.mp3` | 462 | 39.44 MB |
| `.webp` | 112 | 36.97 MB |
| `.ogg` | 6 | 4.04 MB |
| `.jpg` | 5 | 1.59 MB |
| `.png` | 6 | 0.47 MB |
| `.ico` | 2 | 0.27 MB |
| `.json` | 5 | 0.11 MB |
| `.md` | 2 | 0.01 MB |
| `.txt` | 2 | 0.00 MB |
| `.webmanifest` | 1 | 0.00 MB |

## 排除的离线/旧版资源

| 类型 | 文件数 | 大小 |
|---|---:|---:|
| `.mp4` | 40 | 416.11 MB |
| `.mp3` | 254 | 24.82 MB |
| `.wav` | 8 | 18.75 MB |
| `.webp` | 38 | 17.87 MB |
| `.png` | 10 | 2.03 MB |
| `.js` | 2 | 1.54 MB |
| `.jpg` | 5 | 0.97 MB |
| `.css` | 1 | 0.23 MB |
| `.json` | 2 | 0.01 MB |
| `.html` | 1 | 0.00 MB |

旧版CG单镜头、旧混音版、上采样混音预览、语音旧文本重复哈希版本、绘图迭代草稿、logo大PNG、无运行引用的原始WAV等均不进入发布集。5 个正式1080p静音CG及15路音乐/环境/人声 stem 完整保留。

## 最大运行资源

| 文件 | 原始大小 |
|---|---:|
| `media/cinema-upscale-v1/prologue-1080p.mp4` | 42.45 MB |
| `media/cinema-upscale-v1/ending-1080p.mp4` | 28.66 MB |
| `media/cinema-upscale-v1/dock-1080p.mp4` | 27.34 MB |
| `media/cinema-upscale-v1/granny-1080p.mp4` | 24.44 MB |
| `media/cinema-upscale-v1/chef-1080p.mp4` | 21.01 MB |
| `models/ayao-male.vrm` | 9.37 MB |
| `models/ayao.vrm` | 8.39 MB |
| `models/residents/walker1.vrm` | 4.01 MB |
| `models/residents/dock.vrm` | 3.97 MB |
| `models/residents/granny.vrm` | 3.77 MB |
| `models/residents/walker3.vrm` | 3.72 MB |
| `models/residents/walker0.vrm` | 3.25 MB |

可以在独立发布目录压缩这5部CG为1080p H264流式播放版，保留同URL、相同时钟、帧率和时长；3路声音不要重复混进视频。使用`-movflags +faststart`，不要覆盖源。具体EdgeOne单文件限制需以产品文档/实际CLI为准，本审计不将25MB当作已核验上限。

## 安全审计

- 公开JSON未发现明文密钥、带鉴权远程URL或本机绝对路径。
- 原manifest含31处离线QA/生成溯源路径；它们不是已发现的密钥泄露，但不属于运行数据。
- 发布副本仅保留实际运行字段：电影URL/海报/stems/时长/字幕/播放速度；对白text/variants/url/duration/voiceId；音乐和音效url/fallbackUrl/loop/gain/cooldown。
- 新发布集14个文本文件经本机路径、Bearer材料、dotenv赋值检查，没有发现匹配。
- 所有审计只记录文件位置和JSON指针，不记录敏感值。
- 未读取用户Token或`.env`，未执行上传。

## 许可证

保留：
- `models/AVATAR-LICENSE.md`
- `models/residents/RESIDENT-LICENSE.md`
- `media/cinema-upscale-v1/LICENSE-Real-ESRGAN.txt`
- `media/cinema-upscale-v1/LICENSE-ncnn.txt`

## 验证

- 696个男女主角对白查找用例：发布manifest和原manifest的URL、时长、voiceId一致。
- 每部CG每0.03秒逐点核对字幕、说话人、音乐ducking，5部全部一致；URL/stems/速度/时长一致。
- 音乐/环境音fallback、loop、gain、cooldown逐字段一致。
- 动态URL域显式覆盖：人物立绘/头像、武汉记忆、结局、童画四片、storyArt五图、全部24张材质图。
- 这不是公网实机网络覆盖证明；主线程仍需以最终压缩版本进行公网首屏、CG、男女主角和代表任务测试。

## 后续构建注意

本次stage使用既有dist。若加载优化后重建，需使用新目录重新运行此工具，或用最新`index.html`与`assets/`更新发布目录，再重跑文件SHA/尺寸审计。不要回拷整份public，否则旧版大视频与离线元数据会重新公开。
