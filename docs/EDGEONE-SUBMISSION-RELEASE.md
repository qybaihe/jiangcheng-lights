# 《江城有灯》参赛提交版 EdgeOne 更新

发布日期：2026-09-14。发布完整游戏；宣传片不加入游戏首屏或运行资源库。

## 当前生产版本

| 项目 | 结果 |
|---|---|
| 项目 | `jiangcheng-lights` / `makers-esms8yh8juk5` |
| 生产部署 | `dpvdk0teoe3o` / `Success` |
| 完成时间 | 北京时间 2026-09-14 20:31 |
| JavaScript | `/assets/index-Cj12P5EM.js` |
| CSS | `/assets/index-Kk-2cAy9.css` |
| Three.js | `/assets/three-D6OvJLrH.js` |
| 发布体积 | 626 文件 / 192,003,000 字节（约 192.00 MB） |
| 加速区 | `overseas`，未改变项目区域 |

包含本轮两项完整新玩法：**旧照对景**、**热食接力／次晨送过早**。男女主角、九位精细居民、交通玩法、四种结局、画廊、CG、原有配音与音乐全部保留。

本次只更新 HTML、3 个编译资源、缓存配置，并新增两张对景照片（合计 209,064 字节）。所有现存模型、压缩后的 1080P CG、声音和经清理的运行 manifest 均与上一生产发布逐字节相同，没有把约 755 MB 的制作素材目录重新上传。

## 验收

- 根任务全量单测：**613 / 613 通过**，证据 `output/qa/submission-v3/full-tests.txt`。
- 本次发布闭包：缺失资源 0；非预期运行资源变更 0。优化后的模型和 CG 均保留。
- 626 个文件的私密材料检查：`.env`、`.env.edgeone` 中凭证值匹配 0；源码、source map、日志等私密或离线文件 0。
- 线上 HTTP **22 / 22 通过**：首页、3 个编译包、5 个运行 manifest、主角模型、材质、BGM、浏览器图标、两张对景图及全部 5 部 CG 的 206 Range。
- 所有上述响应均与发布目录字节一致；哈希编译包的一年缓存、媒体的一天缓存、JSON 的重新验证规则仍生效。
- 编译包压缩协商 9 / 9 通过；实测出现 gzip、Brotli 与未预热边缘的 identity，解压后内容全部一致。不宣称所有边缘节点首次即已压缩。
- 本次官方 SDK 一次上传成功，未出现 524 或重试发布。
- 本次独立 Chrome 1440×900 真实界面烟测 8 / 8 通过：新主包、女主角、全部九居民、1080P 序章实际播放（1.15×）、新生活菜单、两张 1080P 旧照实际解码、刷新后显示继续存档、console error/warning=0。自己的测试浏览器已关闭，未操作用户浏览器或存档。
- 本次是快速上线烟测，不是全主线重跑，也未测新版本冷启动秒数。两个新玩法的完整实际交互证据保留在上一轮生活玩法验收中；不沿用旧版性能数字冒充新版实测。

## 正式入口

**正式体验与参赛地址：[https://jcyd.classby.cn/](https://jcyd.classby.cn/)**。2026-09-14 20:46–20:49 已通过正常 DNS、TLS、HTTP 和独立浏览器验收；无需登录或平台预览签名。

- Makers 原项目已列出 `jcyd.classby.cn`，仍指向新生产 `dpvdk0teoe3o`，未新建项目。
- DNS：`jcyd.classby.cn CNAME jcyd.classby.cn.pages.dnsoe6.com.`；普通系统 DNS 当前解析到 `43.174.246.103` / `43.174.247.103`。
- TLS：正常系统信任链和主机名验证通过，TLS 1.3；证书 SAN 为 `jcyd.classby.cn`，签发方 `TrustAsia DV TLS RSA CA 2025`，当前证书有效至 2026-12-12 23:59:59 UTC。
- **正式域名 22 / 22 HTTP 检查通过**，响应与本地提交发布逐字节一致；全部五部 CG Range 均为 206。
- **正式域名独立 Chrome 烟测 7 / 7 通过**：进入游戏、完整场景启动、1920px 序章实际播放、新生活菜单、两张旧照真实解码、console error/warning=0、已记录动态请求无 4xx/5xx/失败。未重跑全主线，不将其称为全流程测试。
- 早期 20:40–20:42 曾遇到 CNAME 终点权威 NXDOMAIN；20:46 普通 DNS 和 HTTPS 已自然恢复。传播中的原始失败记录仍保留，不删除。
- 所有最终验收都使用普通解析与正常证书校验，没有 `--resolve`、hosts 改写、忽略证书或临时签名。

主收据 `output/edgeone-release/deployment.json` 的 **`publicUrl` 是首选入口**，`publicAccess` 记录上述验收证据。SDK 的 `deployment.previewUrl` 仍是临时诊断链接：当前 SDK 只收到 `CustomDomains.Domain` 而没有 `Status`，因此不自动选自定义域；不把这项 SDK 行为误判为正式域未上线。`edgeone:preview` 会保留主收据已有的 `publicUrl`，HTTP/压缩验证工具也优先使用正式域。

复核命令：

```sh
EDGEONE_HTTP_BASE_URL=https://jcyd.classby.cn/ \
EDGEONE_HTTP_QA_DIR=output/qa/edgeone-release/submission-v1/custom-domain \
.venv/bin/python tools/verify-edgeone-http.py

# 刷新平台诊断预览；主收据已有 publicUrl 保持为正式域名。
npm run edgeone:preview
```

## 证据与回滚

- 当前部署收据：`output/edgeone-release/submission-v1/deployment.json`。
- 发布差异、逐文件 SHA256：`output/edgeone-release/submission-v1/stage-check.json`。
- 部署前后项目及自定义域名状态：`status-before.json`、`status-after.json`。
- 私密材料审计：`output/edgeone-release/submission-v1/private-material-check.json`。
- HTTP 验收：`output/qa/edgeone-release/submission-v1/http/report.json`。
- 压缩协商：`output/qa/edgeone-release/submission-v1/http/compression.json`。
- 真实界面烟测：`output/playwright/edgeone-submission/report.json`，同目录保留欢迎界面、生活菜单截图及实际诊断原始输出。
- 正式域名 DNS / TLS / HTTP：`output/qa/edgeone-release/submission-v1/custom-domain/`。
- 正式域名浏览器：`output/playwright/edgeone-submission-domain/report.json`。
- 旧生产 `dpt5l96hwrls` 的完整静态站点、收据和原审计已保存到 `output/edgeone-release/submission-v1/rollback-dpt5l96hwrls/`，旧生产部署也仍在平台保留。
- `.env.edgeone` 未变更；不复制进公开目录。审计中的授权材料只输出是否匹配，不输出内容。

## 域名配置的官方依据

- [自定义域名：项目详情 → 域名管理 → 添加自定义域名](https://pages.edgeone.ai/zh/document/custom-domain)
- [免费 HTTPS：配置证书 → 申请免费证书 → 自动验证](https://pages.edgeone.ai/zh/document/apply-for-free-certificate)
- [默认域名的 3 小时预览限制及 overseas 区域](https://pages.edgeone.ai/zh/document/domain-overview)

DNS 记录值必须取自该域名实际绑定界面，不直接猜成默认项目域名。免费证书应在 CNAME 生效后等待 CA 签发和部署；验收使用正常证书校验，不忽略 TLS 错误。
