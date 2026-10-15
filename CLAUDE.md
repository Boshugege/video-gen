# video-gen：短视频离线渲染工具箱

每周一期短视频。每一期是 `episodes/<id>/episode.js`：
- 画面：`renderFrame(ctx, t)`，由渲染器按 1/fps 的步长逐帧调用；
- 声音：`OfflineAudioContext` 按同一条 timeline 合成；
- 封装：ffmpeg 输出 H.264 + AAC 的 MP4，ffprobe 自动校验。

不边播边录，所以没有卡顿，也没有音画不同步。

## 核心原则（改代码前先读）

1. **确定性渲染**：画面只由 `t` 决定。渲染器会**乱序、并行**地调用 `renderFrame`（6 个无头 Chromium 页面各画一部分帧），所以：
   - 不能用 `Math.random`、`Date.now`、`performance.now`、`requestAnimationFrame`。纯度守卫会直接报错，随机数改用 `core/random.js`。
   - 帧与帧之间不能留状态。运行时每帧都会 `ctx.reset()`；`env.timeline` 已被深冻结。
2. **单一数据源**：分镜、音符、字幕全部写进 `setup()` 返回的 timeline。画面、声音、SRT 只读这一份数据，从源头保证同步。
3. **输出规格固定**：H.264 High、yuv420p、BT.709、固定帧率、AAC 48kHz 立体声、`+faststart`。默认 1080×1920 @30fps，可以直接上传抖音、小红书、Reels、Shorts。
4. **分层与依赖方向**：`episodes → plugins → core`。
   - core 不 import plugins 和 episodes，plugins 不 import episodes。
   - 第二期还可能用到的能力，放 core（流水线必需）或 plugins（按需选用）。episodes 只放本期专属的代码。
5. **产物不进 git**：`out/`、`.cache/`、所有 mp4 / wav 都已忽略；pre-commit 钩子会拦截超过 5MB 的文件。

## 命令

| 命令 | 作用 |
|---|---|
| `npm run setup` | 一条命令装齐依赖：brew 装 ffmpeg、npm install、Playwright Chromium |
| `npm run doctor` | 检查依赖是否齐全，缺什么给出修复命令 |
| `npm run new -- <周号> <英文短名> [--title 中文标题] [--preset horizontal-16x9]` | 用 `episodes/_template` 新建一期。周号可写 `W43`、`43` 或 `2026-W43` |
| `npm run preview -- [episode]` | 打开预览页（带热重载），地址 `http://127.0.0.1:5173/core/preview/?ep=<id>` |
| `npm run render -- <episode> [--draft] [--workers N] [--cover-t 秒] [--burn-subs]` | 渲染成片并校验。`--draft` 输出 540×960 @15fps，用来快速出样 |
| `npm run cover -- <episode> [--t 秒] [--draft]` | 只导出封面 |
| `npm run check:sync -- <episode> [--draft] [--expect N]` | 检测成片里的闪白和嘀声，逐对比较时间差（配合 `_sync-test` 使用） |
| `npm run plugins [-- --md]` | 列出所有插件 |
| `npm test` | 单元测试：时间轴、SRT、WAV、接口，并检查每一期和每个插件都能正常加载 |

输出目录为 `out/<episode>/`，草稿在 `out/<episode>/draft/`：
- `video.mp4`
- `subtitles.srt`
- `cover.png`
- `audio.wav`
- `render.json`：渲染参数、校验结果、git 提交号

## 目录

```
core/                 引擎：流水线必需、接口稳定
  episode.js          defineEpisode / definePlugin 接口定义 + 纯度守卫
  timeline.js         时间轴数据结构、秒↔帧、按 t 查场景/事件/字幕（同构）
  audio.js            离线混音、音阶、ADSR、tone、带种子混响 createRoom、WAV 编码（同构）
  subtitles.js        双语 SRT、可选烧录 drawSubtitles（同构）
  fonts.js            字体加载与校验（浏览器）
  random.js           带种子随机数 rng / noise1（同构）
  runtime.js          浏览器端运行时：加载 episode、画帧、生成混音（渲染器和预览页共用）
  render/             Node 端：server.mjs 静态服务 · browser.mjs Playwright 与字体缓存 · index.mjs 总调度 · host.html/js 渲染页
  mux.mjs             ffmpeg 编码参数、ffprobe 校验（Node）
  cover.mjs           封面导出（Node）
  paths.mjs           标准路径（Node）
  preview/            预览页（浏览器）
plugins/<name>/index.js   可复用组件：每个都 export meta
presets/              画幅：vertical-9x16（默认）、horizontal-16x9
episodes/
  _template/          新一期模板（本身可渲染）
  _sync-test/         音画同步测试
  2026-W42-sound-flowers/   第一期
cli/                  npm 命令入口（Node）
test/                 node:test 单元测试
.githooks/pre-commit  大文件拦截（npm install 时通过 prepare 自动启用）
```

文件后缀约定：
- `.mjs`：只在 Node 里运行。
- `.js`：浏览器端或同构代码。模块顶层不能碰 DOM，因为 Node 端的测试会 import 它们。

## Episode 接口

```js
import { defineEpisode } from '../../core/episode.js';
import { createTimeline, sceneAt } from '../../core/timeline.js';

export default defineEpisode({
  id: '2026-W43-xxx',            // 必须与目录名一致
  title: '中文标题',
  preset: 'vertical-9x16',       // 或 'horizontal-16x9'
  plugins: [progressBar()],      // 可选，钩子插件
  fonts: env => ({ stylesheets: [...], faces: ['700 40px "Noto Serif SC"'], text: '所有会画出来的字' }), // 可选
  cover: { t: 12.5 },            // 或 { render(ctx, env) {...} }；不写时取 25% 处
  setup(env) {                   // 必填，可 async，必须确定性
    const tl = createTimeline();
    const s = tl.scene('intro', 4, { 任意数据 });
    tl.event('note', s.start + 0.7, { p: 3 });
    tl.subtitle(0.3, 3.8, { zh: '中文', en: 'English' });
    return tl.build({ data: { 本期载荷 } });
  },
  renderFrame(ctx, t, env) {     // 必填，同步，只依赖 t 和 env
    const { scene, u, p } = sceneAt(env.timeline, t);
  },
  renderAudio(ac, out, env) {    // 可选，往 OfflineAudioContext 排声音，接到 out
  },
});
```

`env` 只读，包含以下字段：

| 字段 | 含义 |
|---|---|
| `W` `H` | 逻辑尺寸（竖屏 1080×1920）。一律按它绘制，草稿模式由运行时自动缩放 |
| `width` `height` `scale` | 实际输出像素 |
| `fps` `frames` `duration` | 帧率、帧数、时长。`duration` 等于 `frames/fps`，是成片的真实时长 |
| `plannedDuration` | timeline 的计划时长 |
| `draft` | 是否草稿模式 |
| `mode` | `render`、`preview` 或 `cover` |
| `preset` | 含 `safeArea` |
| `timeline` | setup 返回的时间轴 |
| `episode` | `{ id, title }` |

字体：
- 用 Google Fonts 时，`fonts.text` 必须包含所有会画出来的字。字体按 unicode-range 分片下载，没列进去的字会触发渲染中途加载；运行时会重画该帧，并在 render.json 里记一条警告。
- 渲染器把字体请求缓存在 `.cache/http/`，第二次渲染起可以离线。

## Timeline（core/timeline.js）

- `createTimeline()`：构建器，主要方法如下。
  - `.scene(id, dur, data)`：在游标处追加场景，返回 `{ start, end }`。
  - `.gap(dur)`、`.event(track, t, data, dur)`、`.subtitle(start, end, { zh, en })`、`.marker(t, label)`。
  - `.build({ duration?, data? })`
- 查询：`sceneAt(tl, t)` 返回 `{ scene, index, u, p }`；另有 `sceneById`、`eventsOn(tl, track)`、`eventsBetween(tl, track, t0, t1)`、`subtitleAt(tl, t)`。
- 换算：
  - `frameToSec(f, fps)`：渲染器只用这个公式算 t。
  - `secToFrame`、`frameCount(duration, fps)`（向上取整）、`timecode(s, fps)`（分:秒:帧）。

## 可复用模块清单

**core（同构/浏览器）**

| 模块 | 主要导出 |
|---|---|
| `core/episode.js` | `defineEpisode` `definePlugin` `withPurityGuard` |
| `core/timeline.js` | `createTimeline` `validateTimeline` `sceneAt` `sceneById` `eventsOn` `eventsBetween` `subtitleAt` `frameToSec` `secToFrame` `frameCount` `timecode` |
| `core/audio.js` | `renderOffline` `SCALES` `midiToFreq` `noteToMidi` `scaleMidi` `adsr` `tone` `noiseIR` `createRoom` `encodeWav` `channelsOf` |
| `core/subtitles.js` | `toSRT` `srtTime` `drawSubtitles` `DEFAULT_SUBTITLE_STYLE` `subtitleText` |
| `core/random.js` | `rng(seed)` `hashString` `noise1(seed, x)` |
| `core/fonts.js` | `loadFonts` `fontsBusy` `uniqueChars` |
| `core/runtime.js` | `loadEpisode` `createRuntime` `frameTime` |
| `presets/index.js` | `PRESETS` `getPreset` `outputSpec` |

**core（Node）**

| 模块 | 主要导出 |
|---|---|
| `core/render/index.mjs` | `renderEpisode` `assertEpisodeExists` `defaultWorkers` |
| `core/render/server.mjs` | `startServer` `listEpisodes` |
| `core/render/browser.mjs` | `launchBrowser` `openHost` `dataUrlToBuffer` |
| `core/mux.mjs` | `encodeArgs` `startEncoder` `probe` `videoFramePts` `verifyOutput` `topLevelAtoms` `requireFfmpeg` `run` |
| `core/cover.mjs` | `exportCover` |

**plugins**（可用 `npm run plugins -- --md` 重新生成本表）

| 插件 | 类型 | 说明 | 导出 |
|---|---|---|---|
| `plugins/backgrounds` | 函数库 | 整屏背景：径向渐变、线性渐变、暗角 | `radialBackground` `linearBackground` `vignette` |
| `plugins/instruments` | 函数库 | 合成乐器音色：pluck（三角波 + 高八度正弦的拨弦音）、bell | `pluck` `bell` |
| `plugins/motion` | 函数库 | 缓动、插值、淡入淡出、节拍脉冲等纯函数 | `clamp` `lerp` `invLerp` `easeOutCubic` `easeInOutCubic` `easeOutBack` `smoothstep` `fade` `pulse` |
| `plugins/progress-bar` | 钩子 | 在画面顶部或底部画一条随时间增长的进度条（afterFrame） | `progressBar` |
| `plugins/text` | 函数库 | 画布文字：超宽自动缩小字号、按宽度折行、从右往左书写 | `drawText` `wrapLines` `drawParagraph` `fontString` |
| `plugins/watermark` | 钩子 | 在安全区内的角落画一行水印文字（afterFrame） | `watermark` |

### 写一个新插件

1. 新建 `plugins/<name>/index.js`，导出 `meta = { name: '<name>', kind: 'lib' | 'hook', description, exports: [...] }`。`npm test` 会检查 `meta.name` 和目录名一致，并检查 `exports` 里列出的函数都存在。
2. 选类型：
   - **函数库**：纯函数，episode 直接 import。
   - **钩子**：导出一个工厂函数，返回 `definePlugin({ name, modes?, setup?, beforeFrame?, afterFrame?, audio?, fontText? })`；episode 放进 `plugins: [...]`。`modes` 限定在 `render`、`preview`、`cover` 中的哪些模式启用。
3. 插件同样要遵守确定性规则；运行时会对钩子执行纯度守卫。
4. 更新本文件的插件表。

## 新增一期的标准步骤（每周流程）

1. `npm run new -- W43 rain-letters --title "雨中的信"` 生成 `episodes/2026-W43-rain-letters/`。
2. 在 `notes.md` 里写选题、分镜、发布信息。
3. 改 `episode.js`：
   - `setup` 写时间轴（场景、音符事件、双语字幕）；
   - `renderFrame` 画面；
   - `renderAudio` 排声音。
   本期专属的逻辑拆成同目录下的文件（参考第一期的 `melody.js`、`flower.js`、`sentences.js`）。发现能复用的，提到 `plugins/` 或 `core/`。
4. `npm run preview -- <id>` 检查画面和声音：
   - 拖时间轴、←/→ 逐帧看；
   - 单击场景块选中，按 P 只试听这一段；
   - 打开"安全区"，确认关键文字没被平台界面挡住。
5. `npm run render -- <id> --draft` 出样，手机上看一遍。
6. `npm run render -- <id>` 出成片，确认校验全部 ✓、没有字体警告。
7. 上传 `out/<id>/video.mp4`，封面用 `cover.png`，字幕用 `subtitles.srt`。
8. `git add` 代码（产物不会被加进去），提交并推送。

## 验收与回归

- `npm test`：单元测试。
- 音画同步：先 `npm run render -- _sync-test`，再 `npm run check:sync -- _sync-test --expect 11`；草稿模式两条命令都加 `--draft`。
  - 2026-10-15 实测：成片和草稿的最大差值都是 0.69 ms（成片约 0.02 帧）。这 0.69 ms 是嘀声 2 ms 起音坡道越过检测阈值的时间，不是错位。
- 第一期与原型对比：`node episodes/2026-W42-sound-flowers/verify-prototype.mjs`。
  - 2026-10-15 实测：14 个时间点加封面共 15 帧，与原型逐像素完全相同。
  - 对比拼图保存在 `out/2026-W42-sound-flowers/prototype-compare.png`。
- 改动 core 或 plugins 后，至少重跑同步测试和第一期的原型对比。

## 环境与已知事项

- Playwright 锁定 1.63.0（对应 Chromium 1243）。升级会换 Chromium 版本，抗锯齿可能有细微差异，升级后重跑原型对比。
- 部分字形（例如第一期等宽字体里的日文、阿拉伯文语言名）会回退到 macOS 系统字体，所以只有同一台机器、同一个 Chromium 才能逐字节复现。换机器渲染时，画面看起来一样，但像素不保证完全相同。
- 渲染速度（M1 / 8 核，6 个渲染页）：
  - 第一期 1725 帧成片约 50 秒，草稿约 18 秒；
  - 瓶颈是 PNG 编码和 x264。
- 预览页的声音与成片相同：加载时离线生成整段混音，再从任意位置截取播放。
- 第一期保留了原型的一个小跳变：53 秒 ensemble→outro 时，偶数序号的花朝向会跳一下（原型里 outro 的旋转公式和 ensemble 不连续）。为了与原型逐像素一致，暂时没有修。
