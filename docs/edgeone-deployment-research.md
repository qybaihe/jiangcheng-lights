# 《江城有灯》EdgeOne Makers 部署核查

核查时间：2026-09-13。仅查询官方网页、npm 元数据和官方 SDK/CLI 包源文件；未读取或使用用户 Token，未创建项目、未部署。

## 1. 结论

- 用户的 `console.cloud.tencent.com/edgeone/makers?tab=settings` 对应 **腾讯云中国站 EdgeOne Makers API Token**。Pages 已升级为 Makers，旧项目/域名行为保持；新命令推荐 `edgeone makers`。
- 本游戏已构建静态产物适合 **直接上传项目**。无需 Git 仓库，也无需上传 `.env`、源码、素材制作缓存或 `node_modules`。
- 官方 npm CLI：`edgeone@1.6.39`（本次查询 latest）。官方 Node SDK：`@edgeone/makers-sdk@0.1.0`，Node >= 20。
- CLI `deploy` 可自动创建不存在的同名项目，已有项目则创建新部署；已有项目必须为 `Upload`（直接上传）类型。
- **平台默认项目/部署域名并非中国大陆永久公开分享链接**：官方文档规定，中国大陆访问需系统签名预览 URL，有效 3 小时；非大陆网络可直接访问。正式长期分享应绑定自定义域名。3 小时限制针对链接，不代表已登录生产项目在 3 小时后删除。
- **匿名部署不要用于本次发布**：匿名项目需 60 分钟内认领，且链接有访问人数/IP限制。

## 2. 已核准的命令和 API

### CLI 直接上传（最短路径）

```sh
# EDGEONE_API_TOKEN 由部署进程环境传入；不要写入仓库或前端。
npx --yes edgeone@1.6.39 makers deploy ./DEPLOY_DIR \
  -n PROJECT_NAME \
  -t "$EDGEONE_API_TOKEN" \
  -e production \
  -a overseas \
  --json
```

真实 CLI 1.6.39 源码中已确认：

- `-n, --name`：创建/更新项目名。
- `-t, --token`：API Token。
- `-e, --env`：`production` 或 `preview`，默认 `production`。
- `-a, --area`：`global` 或 `overseas`，默认 **global**；公开 CLI 文档参数表漏列，npm 发布包实际存在。
- `--json`：最终机器可读 JSON 行（过程仍可能有进度日志）。
- `--site china|global`：当前发布包说明/实现用于 **匿名** 部署站点；正常 Token 部署会探测中国/国际 API。不要误以为 `--site china` 就是大陆加速区。
- 也支持进程环境 `EDGEONE_PAGES_API_TOKEN`；显式 `-t` 是官方 CI 文档路径。
- 项目名：5–50字符，小写字母、数字、连字符；首尾不得连字符，不允许连续连字符。
- 第一次应部署生产环境，SDK/CLI 均会拒绝尚无生产部署的 Preview。

`overseas` 指全球可用区不含中国大陆节点，并不表示中国大陆访问者自动免除默认域名的签名限制。

### SDK（更适合本次可审计的非交互部署）

```js
import { Makers } from '@edgeone/makers-sdk';

const makers = new Makers({
  token: process.env.EDGEONE_API_TOKEN,
  region: 'china', // 中国站账号/API；与项目加速区域 area 是两个概念
});

const name = 'PROJECT_NAME';
const listed = await makers.projects.list({ name, pageSize: 100 });
const exact = listed.items.find(p => p.name === name);
const { projectId } = exact ?? await makers.projects.create({
  name,
  area: 'overseas',
});
const deployment = await makers.deployments.deploy({
  projectId,
  artifact: { directory: '/ABSOLUTE/DEPLOY_DIR' },
  env: 'Production',
  wait: true,
  timeout: 900,
  pollInterval: 5,
  onStatusChange: ({ deployment: d }) => console.log(d.status),
});
if (deployment.status !== 'Success') {
  throw new Error(`Deployment status: ${deployment.status}; code: ${deployment.code ?? ''}`);
}
const project = await makers.projects.get({ projectId });
console.log(JSON.stringify({ project, deployment }, null, 2));
```

- 本次解包核查的 SDK `.d.ts` 与实际 JS 均使用 **秒**字段 `timeout` 和 `pollInterval`；网页一段 TypeScript 示例误写成 `timeoutMs`/`pollIntervalMs`，不要照抄那一段。
- `deployments.deploy` 默认立即返回ID；`wait:true` 或后续 `deployments.wait()` 才返回可打开的签名 `previewUrl`。
- `deployments.get()` 中的 URL 未签名，不应把它直接当大陆访问结果。
- SDK在成功等待时优先选已通过验证的生产自定义域名，否则签名项目域名。仍须以实际返回和浏览器验证为准。
- `projects.create` 支持 `mainland` / `overseas` / `global`。`projects.update` 当前不暴露加速区域变更或自定义域名管理。
- SDK目录打包拒绝符号链接；默认忽略点文件（`.well-known`/`.edgeone`有特例）、`node_modules`、日志等，但 **不读取 `.gitignore`**。因此应主动使用纯静态发布目录，而非依赖默认忽略保密。

## 3. 配额及发布预检

官方当前免费版：

| 项目 | 限制 |
|---|---:|
| 单文件 | 25 MB |
| 单项目文件数 | 20,000 |
| 站点所有项目总存储 | 5 GB |
| 项目数量（按站点） | 40 |
| 构建次数 | 500/月 |
| 并发构建 | 1 |
| 构建超时 | 20分钟 |
| 自定义域名 | 200 |
| `headers` 配置 | 最多30条 |

直接上传要求根目录存在 `index.html`；ZIP中应直接是 `index.html`，不能外套 `dist/` 一层。

官方直接上传页说超出单文件/数量限制可调整产物或尝试CLI，但配额页仍声明25MB/20000；本次建议 **每个文件控制在25MB以内**，不依赖未确认的CLI豁免。CG可选择更合理码率、分段或按需托管；首屏不应加载所有视频。

直接上传不在服务端跑 `npm install`/`npm run build`。静态游戏不需附带 `package.json`；官方CLI“附带package.json”说明面向有 Functions 的手动构建包。

## 4. 缓存与压缩

官方默认缓存：

- 带哈希名的资源：浏览器 `max-age=31536000`。
- 非哈希文件（如 `index.html`）：浏览器 `max-age=0`。
- 静态文件边缘缓存最长三个月。
- 每次新部署自动使边缘缓存失效。
- 可通过静态发布根目录的 `edgeone.json` 覆盖 `headers`；直接上传仅支持 `redirects`、`rewrites`、`headers`。

建议配置（文件名不含版本的 `media` 不要直接加一年 immutable）：

```json
{
  "headers": [
    {
      "source": "/assets/*",
      "headers": [
        {"key": "Cache-Control", "value": "public, max-age=31536000, immutable"}
      ]
    },
    {
      "source": "/media/*",
      "headers": [
        {"key": "Cache-Control", "value": "public, max-age=86400"}
      ]
    },
    {
      "source": "/index.html",
      "headers": [
        {"key": "Cache-Control", "value": "no-cache"}
      ]
    },
    {
      "source": "/",
      "headers": [
        {"key": "Cache-Control", "value": "no-cache"}
      ]
    }
  ]
}
```

游戏如果只有单入口+query/hash不需要 SPA rewrite。确有客户端子路径再添加官方精确配置 `{"source":"/*","destination":"/index.html"}`；Makers把它识别为静态文件优先、未命中后回退，不是无条件吞掉资源。

**压缩证据边界**：本次 Makers配置/缓存文档没有公开独立 Brotli/gzip配置项，也未确认自动选择旁置 `.br`/`.gz` 文件。官方文档站的实际响应支持 `content-encoding: br`，但不据此承诺新站点配置。上线后对游戏 JS/CSS 实测 `Accept-Encoding: br,gzip` 响应；没有压缩则查控制台/官方支持，不要把 `.br` 普通文件误当自动压缩已启用。

## 5. 区域与长期分享

| area | 节点 | 自定义域名备案要求 |
|---|---|---|
| mainland | 中国大陆 | 需ICP备案 |
| global | 全球含大陆 | 需ICP备案 |
| overseas | 全球不含大陆 | 不要求ICP备案 |

`region:'china'` 是账号API站点，`area:'overseas'` 是加速区，两者可搭配。

大陆“任何人随时点开”验收应使用用户已有自定义域名，配置控制台域名验证与DNS CNAME，并确认 HTTPS 成功。用户尚未提供域名时可以先完成部署和3小时预览测试，但最终沟通中应把这个区别写清楚。

## 6. 上线验证

1. SDK/CLI回报 Success并记录项目ID、部署ID、精确生产预览URL；不要仅凭上传完成判成功。
2. 先请求返回的签名URL，再以浏览器打开该完整URL，确认浏览器会话内后续资源有访问权。
3. 检查首页、真实哈希JS/CSS、角色GLB、首章CG、TTS、BGM响应：状态码、MIME，不能误返回HTML/鉴权401。
4. 对MP4做Range请求，确认 `206`、`Content-Range`；抽看实际CG播放/拖动。
5. 在首次无缓存会话测试进入游戏，再测试缓存后的二次访问；记录DOMContentLoaded、首屏、点击开始至可移动、传输字节、失败资源。
6. 浏览器实际接委托、骑车、找人、打开画廊；不只检查首页静态图。
7. 不把本机测试网络当大陆全网证据。发布给大陆玩家的最终固定域名，需大陆实际网络访问验证。

可用检查结构（URL必须取部署回传，不自行拼token）：

```sh
curl -IL "$PREVIEW_URL"
curl -I -H 'Accept-Encoding: br, gzip' "$CUSTOM_OR_WORKING_ORIGIN/assets/ACTUAL_HASH.js"
curl -sS -D /tmp/cg-headers.txt -o /tmp/cg-first-bytes.bin \
  -H 'Range: bytes=0-1023' "$CUSTOM_OR_WORKING_ORIGIN/media/ACTUAL_CG.mp4"
```

## 官方来源

- [Makers API Token](https://pages.edgeone.ai/zh/document/api-token)
- [EdgeOne CLI](https://pages.edgeone.ai/zh/document/edgeone-cli)
- [直接上传](https://pages.edgeone.ai/zh/document/direct-upload)
- [限制与配额](https://pages.edgeone.ai/zh/document/limits-and-quotas)
- [域名管理与加速区域](https://pages.edgeone.ai/zh/document/domain-overview)
- [缓存配置](https://pages.edgeone.ai/zh/document/configuring-cache)
- [edgeone.json](https://pages.edgeone.ai/zh/document/edgeone-json)
- [SDK创建部署示例](https://pages.edgeone.ai/zh/document/creating-a-deployment)
- [SDK部署接口](https://pages.edgeone.ai/zh/document/deployment)
- [SDK项目操作](https://pages.edgeone.ai/zh/document/project-operations)
- [官方CLI npm元数据](https://registry.npmjs.org/edgeone)
- [官方SDK npm元数据](https://registry.npmjs.org/@edgeone/makers-sdk)

研究用官方包解包留在 `/tmp/edgeone-cli-research`、`/tmp/edgeone-sdk-research`，不在发布目录中。

## 7. 部署后的压缩实测补充（2026-09-13）

对部署 `dpg3c60mo8hz` 的三份核心CSS/JS进行了无Token只读GET复核。初始Cache Miss/age0时未返回Content-Encoding；后续热缓存 **gzip和Brotli均已生效**。9个编码协商测试全部200，解压后SHA256与发布产物完全一致。合计原始1,772,731字节，gzip528,700字节（减少70.18%），Brotli529,287字节（减少70.14%）。

[通用EdgeOne智能压缩文档](https://edgeone.ai/zh/document/46359)明确支持gzip/br及CSS/JS，且说明chunked源响应可首次未压缩、随后基于缓存压缩；本次未读取源站设置，按观察确认热缓存压缩，不将具体内部机制当作已核实事实。该通用文档的独立EO站点设置不能直接等同Makers配置能力。

本次无需变更已上线配置，也不需要未经确认的`.br`旁置协商方案。证据：`output/qa/edgeone-release/http/compression.json`；说明：`output/qa/edgeone-release/http/COMPRESSION-README.md`。早期“尚未确认压缩”的研究边界已由本次线上实测补齐。
