# 《江城有灯》EdgeOne 上线记录

> 最新 2026-09-14 参赛提交版已更新至 `dpvdk0teoe3o`，正式入口为 [https://jcyd.classby.cn/](https://jcyd.classby.cn/)，包含旧照对景与热食接力。见 [参赛提交版更新记录](./EDGEONE-SUBMISSION-RELEASE.md)。下文保留 2026-09-13 的原始测量与发布记录，不将旧性能数据写成新版本实测。

日期：2026-09-13。发布的是完整静态游戏，不是参赛视频或删减演示版。

## 生产部署

| 项目 | 值 |
|---|---|
| 项目名 | `jiangcheng-lights` |
| 项目 ID | `makers-esms8yh8juk5` |
| 部署 ID | `dpt5l96hwrls` |
| 环境 / 结果 | Production / Success |
| 完成时间 | 2026-09-13 18:29:01（北京时间） |
| 默认域名 | `jiangcheng-lights-cdcyen2j.edgeone.dev` |
| 加速区域 | overseas（全球，不含中国大陆节点） |
| 发布文件 | 624 个，191,695,182 字节；最大单文件 14,364,165 字节 |
| 部署工具 | 官方 `@edgeone/makers-sdk@0.1.0` |

**历史访问方式（2026-09-13）：** 当时尚无自定义域名，使用 `deployment.previewUrl` 的约 3 小时签名预览。**2026-09-14 已完成自定义域名和 HTTPS 验收，当前应使用主收据 `publicUrl` 指向的 [https://jcyd.classby.cn/](https://jcyd.classby.cn/)**；旧平台预览只作诊断。

## 完整内容与加载优化

- 保留男女主角、9 位精细居民、所有交通/小游戏、完整主线、四种结局、画廊、记忆插画、5 部正式 1080P CG 及全部运行配音/音乐/音效。
- 原 `public/` 755.63 MB 包含大量制作迭代；仅发布运行依赖，并进一步压缩至总计 191.70 MB，约减少 75%。源素材、原始模型、原 CG 与参赛片均保留在本地。
- 5 部 CG：143.90 MB → 67.14 MB；1080P、24fps、帧数、逐帧时间戳与声音/字幕同步不变，增加 faststart。全片 SSIM 0.97816–0.99099。
- 11 个模型：47.92 MB → 39.87 MB；312 张内嵌纹理转像素级无损 WebP。无降分辨率、减面、骨骼或动作删减。
- 首屏只等待场景与所选主角；9 位居民在主角就绪后后台单并发加载。音视频按需请求，启动不预拉整个媒体库。
- HTML 内联小房子加载画面和轻量欢迎图预载，资源到达前不白屏。主角高网络优先级，慢网超时放宽并支持原人物卡重试。居民请求有 60 秒下载预算；瞬态网络错误、408/429/5xx 最多重试一次，取消或 404 不重试。
- 哈希 JS/CSS 一年缓存；模型/媒体一天；材质一周；首页和剧情 JSON 重新验证。线上已验证规则实际生效，5 部 CG 均支持 HTTP 206 Range；热边缘缓存的 JS/CSS 已实测 gzip/Brotli 自动压缩，解压后哈希一致。

### 可复核性能口径

独立全新 Chrome 上下文，模拟 10 Mbps / 40 ms，本地生产预览（同一台电脑）：

| 阶段 | 可进入时间 | 首屏已完成传输 |
|---|---:|---:|
| 优化前 | 29.979 秒 | 31.95 MB |
| 仅改加载调度、素材不变 | 17.350 秒 | 13.09 MB |
| 最终压缩发布副本 | 15.899 秒 | 11.59 MB |

首屏模型请求从 10 个降至 1 个，后台最终仍加载完整 9 位居民。上述为特定条件的诊断测量，不代表所有公网网络的固定等待时间。线上实测单独记录于 `output/qa/edgeone-release/online/`。

### 最终生产线上实测

最终部署 `dpt5l96hwrls`，实际运行主包 `/assets/index-CPEVG6Le.js`，10 Mbps / 40 ms、独立全新 Chrome 上下文：

- 首次可进入 **21.892 秒**，同一上下文刷新后 **13.817 秒**。
- 完整 **10 项实机检查通过**：1080P 序章、接委托、亲手修收音机、9 位居民、男女切换、步行找婆婆、3D 对话、刷新后进度恢复。
- 页面错误、console error、404 与实际资源加载失败均为 **0**；9 位居民 ready、fallback=0，本次没有触发网络重试。
- 暖刷新确认一部分素材直接走浏览器缓存；本次独立隐私上下文仍重新下载主角 VRM，因此不宣称二次进入无需网络。
- 公网与本地时延分开报告，不把本地约 16 秒写成公网等待保证。`online/report.json` 记录请求、缓存和只读游戏状态；测试未操作用户存档。

## 验收证据

- 全量单测：**531/531 通过**，`output/qa/edgeone-loading/full-test-suite-final.txt`。
- 发布目录实机：真实播放 1080P 序章 → 接外公电话 → 旋转线路修好收音机 → 切换男女主角 → 地图步行到婆婆 → 3D 交谈；9 位居民全部 ready、fallback=0，页面错误和非主动取消的失败请求均为 0。
- 运行契约：696 个对白查找用例、5 部 CG 每 0.03 秒字幕/声音时钟比对通过，`output/edgeone-release/audit/runtime-contract-check.json`。
- CDN HTTP：20 项通过，包含首页、全部编译包、5 个媒体 manifest、主角模型、材质、BGM、应用图标和 5 部 CG 分段。内容均与本地发布字节一致；`output/qa/edgeone-release/http/report.json`。
- 压缩后的模型与 CG 验收：`output/edgeone-release/model-audit/model-optimization.json`、`output/edgeone-release/audit/video-optimization.json`。
- 发布文件清单与逐文件 SHA256：`output/edgeone-release/audit/final-artifact.json`。
- 凭证审计：624 个发布文件未包含本机 `.env` 或 `.env.edgeone` 凭证；`output/edgeone-release/audit/private-material-check.json`。

## 发布过程记录

- 初始生产部署 `dpg3c60mo8hz` 上线成功；首轮公网慢网测试暴露一个居民请求的 30 秒超时，后续复测证明是瞬态网络问题。原始失败和通过记录均保留，没有把失败删掉当作通过。
- 修正为 60 秒预算和一次有限重试后，531 项单测通过。前两次更新遇平台 HTTP 524，间隔查询确认没有新部署，旧生产站继续正常服务。
- 第三次官方 SDK 更新成功，最终生产部署为 `dpt5l96hwrls`。日志 `output/edgeone-release/deploy-final-traced.log` 只记录 Action、状态与耗时，不记录请求凭证。
- 初次 CDN/压缩证据归档于 `output/qa/edgeone-release/http-initial-deployment/`；最终 HTTP 证据在 `http/`，最终真实 UI 证据在 `online/`。

## 后续更新 / 获取新体验链接

在项目根目录执行（Node >= 20）：

```sh
# 只刷新当前成功部署的签名体验链接，不重新上传
npm run edgeone:preview

# 只编译新代码到独立 build 目录；不复制原 public 中的旧素材
npm run build:edgeone

# 发布已准备好且验收过的完整 site 目录
npm run deploy:edgeone

# 只读校验线上 HTTP 和发布字节
.venv/bin/python tools/verify-edgeone-http.py
```

实际上传目录为 `output/edgeone-release/site`。**`build:edgeone` 不会自动替换 site**；仅更新代码时，把新 `build/index.html` 与 `build/assets/` 同步到 site，并同步根 `edgeone.json`，保留 site 已压缩的 `media/`、`models/`。变更素材时应重新生成依赖闭包、压缩并验收。不要用整份 `public/` 覆盖发布副本。

首次准备另一台电脑上的官方 SDK：

```sh
npm install --prefix output/edgeone-tooling --no-audit --no-fund @edgeone/makers-sdk@0.1.0
```

Token 只在本地 `.env.edgeone`，权限 0600，已被 Git 忽略；游戏运行不依赖任何生成接口或部署密钥。部署脚本复用同名项目、创建新的 Production 部署，并等待 Success。当前浏览器存档是按网站域名隔离的，本机地址的存档不会自动变成线上存档。

## 进一步公开

用户提供域名/子域名后：绑定 Makers 生产项目，按平台返回记录配置 DNS，等待 HTTPS，再从中国大陆真实网络验收入口、模型和 CG。当前 overseas 区域不要求 ICP 备案；如采用包含大陆节点的加速区，域名需要满足平台备案要求。

官方来源和 API 细节见 [部署研究](/Users/baihe/Documents/ChatGPT/腾讯云游戏开发大赛/docs/edgeone-deployment-research.md)。
