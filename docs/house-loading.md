# 小屋开场加载组件

## 视觉与资产

- 主视觉复用 `public/media/game-icon-v2-512.png`，实际查看后按窗格位置叠加低强度灯光；没有新生成图片、重新绘制房子或改动原始素材。
- 字标复用 `public/media/game-logo-v1-transparent.webp`。512 像素原图以 265–350 CSS 像素展示，保持瓦片、窗棂与金色水纹清晰。
- 深青绿江面与暖纸以一条低起伏岸线衔接。图标没有外框或额外阴影；仅空白边缘的静态 mask 与背景融合。
- 四扇窗灯缓亮、江面细纹轻移、两片小叶轻摆。纸纹和光晕完全静态。所有 keyframes 与 transition 只改变 `transform` / `opacity`。
- 手机竖屏保留上下构图；低高度横屏改为左屋右纸，不缩小文字挤进一列。

## 宿主接入

```js
import { mountHouseLoading } from './ui/house-loading.js';
import './ui/house-loading.css';

// 在 #boot 已插入 DOM 后挂载；模块保留同一个 #boot，不删除节点。
const loading = mountHouseLoading(document.querySelector('#boot'), {
  reduced: state.settings.reduced,
  // 可选。默认重试会重新载入当前页面。
  onRetry: () => window.location.reload(),
});

let completed = 0;
const reportCompletedTask = () => loading.update({ completed: ++completed, total: 3 });

try {
  loading.setStage('scene');
  world = new World(canvas, options);
  // restoreProps、位置、质量、镜头与 HUD 等真实初始化在这里执行。
  reportCompletedTask();
  loading.setStage('hero');

  const hero = world.heroReady.then(() => {
    reportCompletedTask();
    loading.setStage('neighbors');
  });
  const neighbors = world.residentAvatarsReady.then(reportCompletedTask);
  Promise.all([hero, neighbors]).then(() => {
    // 先同步宿主自身的 ready / start 状态；不 await 动画。
    loading.complete();
  }).catch(error => loading.fail(error));
} catch (error) {
  loading.fail(error, {
    title: '巷口的灯，稍等一下',
    message: '请使用支持 WebGL 的新版浏览器，并开启硬件加速后重试。',
  });
}
```

上例三项为 **World 和界面初始化完成、主角准备完成、居民准备完成**。角色使用既有降级模型时，宿主按该 Promise 的真实 settled 语义决定就绪与提示；模块不替宿主判断素材是否成功。

并发任务可先后乱序完成：使用统一完成计数，当前阶段标签按仍未完成的任务选择即可。`setStage()` **只改文字，不增加进度**。没有计时涨幅，没有随机百分比，也没有把任务数称作下载字节百分比。

## API

| 方法 | 行为 |
| --- | --- |
| `setStage(id, {label?, detail?})` | `scene` / `hero` / `neighbors` / `ready`；只改变当前阶段文字。 |
| `update({completed, total, stage?, label?, detail?})` | 更新真实完成的整数任务数；忽略非有限值；进度单调，范围 `0..total`。不调用就不变化。 |
| `complete({label?, detail?, immediate?})` | 同步设置 `pointer-events:none`、`inert=true`、`aria-busy=false`，然后短退场并 `hidden=true`。返回快照，不返回延迟 Promise。 |
| `fail(error, {title?, message?, detail?, onRetry?, retryLabel?})` | 隐藏进度条、暂停装饰动画，显示并聚焦可操作的重试按钮。宿主文字均经 `textContent` 写入。 |
| `setReduced(value)` | 应用游戏内减弱动态设置，与系统设置取逻辑或。 |
| `getSnapshot()` | 返回 `state / stage / completed / total / reduced / hidden`，供只读诊断。 |
| `dispose()` | 清理事件/计时器，隐藏但不移除根节点。重复调用无副作用。 |

重试回调收到当前 controller，可重新执行真实初始化并自行 `update()` / `complete()`；返回 rejected Promise 会恢复失败界面。重复点击只触发一次在途重试。`onHidden` 可选回调最多调用一次；重新挂载会清理前一次 controller。

## 时间、可访问性与性能边界

- 内容有 120 ms 的淡入起点，用来避免快速完成时闪一下图文；**没有最短停留时间**。
- 120 ms 内完成、后台页完成、系统/游戏减弱动态模式完成，全部立即 `hidden=true`。
- 正常完成最多留 180 ms 的视觉淡出；点击和键盘拦截在 `complete()` 调用当下释放。淡出不是开始游戏的前置条件。
- 真实初始化未就绪时维持当前任务数；没有 15 秒片头、超时后冒充完成或假进度。
- `visibilitychange` 暂停所有装饰动画；后台完成不依赖易被节流的淡出计时器。
- `prefers-reduced-motion` 媒体查询与用户设置都停用动画/过渡；系统偏好运行时变化也响应。
- 进度使用原生 ARIA progressbar 语义和中文 `aria-valuetext`；状态为 polite live region；失败重试按钮至少 44×44 CSS 像素，支持 Enter/Space。
- 没有 `requestAnimationFrame`、循环 JS 定时器、网络调用或每帧阴影刷新。

## 已验证

2026-09-12：

1. `node --test tests/house-loading.test.js`：**13 / 13 通过**。覆盖真实进度、不自动推进、不阻塞完成、保留节点、错误文案、重试成功/拒绝、生命周期清理、后台暂停与两种减弱动态。
2. `node tests/house-loading-ui.mjs`：**10 项浏览器检查通过**。Chrome 独立无头上下文，1440×900、390×844、844×390，以及系统/用户 reduced-motion。
3. 实际查看桌面、手机、横屏和失败截图，房屋瓦片/灯窗清楚，字号与按钮可读，未出现横向溢出。
4. 浏览器脚本自行启动临时随机端口，仅提供组件/两张既有品牌图，不加载 `main.js` / `world.js`，不启动 WebGL、不写存档、不接触 4173、不执行构建。

截图与报告：`output/qa/house-loading/`（`desktop-loading.png`、`mobile-loading.png`、`landscape-loading.png`、对应失败截图、`mobile-reduced.png`、`report.json`）。
