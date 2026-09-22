# GitHub 上传范围

本仓库包含游戏源码、运行素材、测试、工具、项目文档，以及视频制作工程与源素材。大体积媒体使用 Git LFS 管理。

## 下载与运行

```sh
git lfs install
git clone https://github.com/qybaihe/jiangcheng-lights.git
cd jiangcheng-lights
git lfs pull
npm ci
npm run dev
```

如需云服务功能，将 `.env.example` 复制为 `.env` 并填写本地配置。视频工程使用各自的依赖清单。

## 留在本地的内容

- `.env`、`.env.edgeone` 等密钥与机器配置。
- `node_modules`、Python 虚拟环境、缓存和临时文件。
- 可重建的 `dist`、视频 `build`、部署构建与历史 QA 截图/测试产物。
- `output` 下的生成媒体、安装包和其他非源码输出；其中脚本及文本资料按 `.gitignore` 规则保留。

这些文件未被删除。本仓库是源工程上传，不是本地目录的逐字节备份。
