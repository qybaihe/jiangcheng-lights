# EdgeOne 角色资源无损优化

本轮仅修改独立发布目录 `output/edgeone-release/site/models/`。11个原始`public/models/` SHA256均未变化。

## 实测体积

合计 **47.924 MB → 39.869 MB**，减少 **8.055 MB / 16.81%**。

| 模型 | 原始 | 发布 | 缩减 |
|---|---:|---:|---:|
| `models/residents/walker4.vrm` | 2.669 MB | 2.285 MB | 14.38% |
| `models/residents/dock.vrm` | 3.967 MB | 3.416 MB | 13.91% |
| `models/ayao-male.vrm` | 9.372 MB | 7.369 MB | 21.38% |
| `models/residents/walker2.vrm` | 2.908 MB | 2.428 MB | 16.52% |
| `models/residents/walker3.vrm` | 3.719 MB | 3.159 MB | 15.06% |
| `models/residents/granny.vrm` | 3.775 MB | 3.189 MB | 15.53% |
| `models/residents/community.vrm` | 2.931 MB | 2.444 MB | 16.6% |
| `models/residents/walker1.vrm` | 4.013 MB | 3.449 MB | 14.06% |
| `models/residents/walker0.vrm` | 3.245 MB | 2.783 MB | 14.24% |
| `models/ayao.vrm` | 8.393 MB | 6.904 MB | 17.73% |
| `models/residents/chef.vrm` | 2.932 MB | 2.444 MB | 16.66% |

## 精细度与结构验证

- 312张内嵌纹理：尺寸完全不变；解码后RGBA所有字节完全相同，PSNR=无限，alpha及透明像素RGB都保留。没有q90有损编码、降采样或减面。
- 865个非图像bufferView：payload逐字节一致，byteLength/byteStride/target及索引不变。
- 865个accessor定义、全部骨骼/几何/动画/VRM0元数据/MToon材质索引/许可字段结构完全一致。
- 由于原PNG位于几何数据前方，压缩后BIN重排为4字节对齐；bufferView.byteOffset改变是必要的，但每个引用及其数据不变。
- texture保留原source与sampler，增加标准`EXT_texture_webp.source`同一图像索引；根extensionsUsed和extensionsRequired都声明此扩展。当前Three GLTFLoader内置该扩展。
- 原PNG没有额外ICC/gamma/sRGB元数据，不存在剥离色彩配置的变化。

## 产物与回滚

- 工具：`tools/optimize-edgeone-models.py`
- 汇总报告：`output/edgeone-release/model-audit/model-optimization.json`
- 每个角色都有`*-textures.jpg`原始/发布/差值对照，以及逐纹理字节数/哈希/无损验证报告。
- 原始备份：`output/edgeone-release/model-originals/`，不在公开site中。
- 若浏览器兼容验收需要核心PNG，可执行：`.venv/bin/python tools/optimize-edgeone-models.py --png-fallback`，仅从原始备份重建发布角色，不覆盖源public。
- 真实WebGL加载、人物外观与动作验收由主线程在最终站点进行；本报告验证的是二进制与解码图像等价性。
