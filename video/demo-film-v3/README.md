# 江城有灯 · 新玩法精华参赛片 v3

本版为用户已认可的第一人称故事版 v2 的轻量画面更新；v1、v2 文件与工程原样保留。

## 固定不变

- 1 分 58 秒，1920×1080，30fps，横屏 MP4。
- 阿遥从“我是阿遥”讲起的 12 段旁白；全部原源文件、位置、速率与音量不变。
- 小许 80 秒起的完整实机平安回执、BGM、音效与环境声。
- 骑车找人、武汉意象、开车、划船竞速、风险上报、去留选择、四结局画廊、AIGC 创作记录和两端 CG。
- 全部口述字幕及精确时间边界。

## 本次更换

编辑决策在 `output/demo-film-v3/edit-decision.json`。仅将三处功能展示替换为新实机玩法精华，操作说明与画面一致；不是用菜单标题冒充玩法完成。

- 43–47 秒：热食装盒。
- 51.5–54.5 秒：旧照对景。
- 73–77 秒：行走到达与热食交付。

已选源时码：装盒 1.000–5.000 秒；江边旧照 2.000–5.000 秒；社区交付 5.667–9.667 秒。源视频及 94 次真实输入记录见 `output/demo-film-v3/capture/`。最终影片截图、美术与声音评价由最终审核单独记录。

## 声音一致性

Remotion 中 `lockedMix` 是 v2 已验收完整音轨的 AAC 直接抽轨；原分轨、素材与时间轴仍保留，便于未来编辑。本版导出再直接复制 v2 最终 MP4 的 AAC 音频流，不经过 Remotion 的再次编码或母带处理。`master-final.py` 对压缩 AAC 字节与解码 48kHz 双声道 PCM 都作 SHA-256 一致性核验。

## 重现

```sh
export PATH=/Users/baihe/.nvm/versions/node/v24.16.0/bin:$PATH
node video/demo-film-v3/prepare-final.mjs
node video/demo-film-v3/render.mjs final --skip-stills
python3 video/demo-film-v3/master-final.py
python3 video/demo-film-v3/verify-final.py
```

## 交付条件

技术验收包括 3540 帧、完整解码、黑帧检测、字幕边界、素材哈希、音轨一致性、响度与峰值，以及不超过 500MB。独立最终视听验收完成后，交付脚本才会生成 `output/江城有灯-参赛片交付-v3/`；不会伪造视听验收通过。

晴川里为武汉生活意象的虚构艺术化街区。实机、生成 CG 与 AIGC 制作记录分别标注；功能蒙太奇不宣称来自一次无剪辑通关。

## 继续编辑

在本目录执行 `npm run studio`，默认先打开 `CompetitionDemo`。`prepare-final.mjs` 会同步 `src/final-props.json`，因此编辑器预览不是空时间线。画面源、剪辑时码、片头/片尾层、旁白字幕与操作标题均保持可编辑；本次锁定完整混音是有意保留声音一致性。后续若要重新混音，应先移除 `lockedMix`，再显式复核所有原分轨，不把两种混音同时播放。
