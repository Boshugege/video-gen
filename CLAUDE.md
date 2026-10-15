# video-gen：短视频离线渲染工具箱

每周一期短视频。每一期是 `episodes/<id>/episode.js`：
- 画面：`renderFrame(ctx, t)`，由渲染器按 1/fps 的步长逐帧调用；
- 声音：`OfflineAudioContext` 按同一条 timeline 合成；
- 封装：ffmpeg 输出 H.264 + AAC 的 MP4，ffprobe 自动校验。

不边播边录，所以没有卡顿，也没有音画不同步。

## 新会话从这里开始

这个仓库会在不同的 Claude Code 会话里接力开发，本文件就是交接文档。每次开工：
1. 读完本文件。想知道某个设计为什么这样定，看 [docs/decisions.md](docs/decisions.md)。
2. `npm run doctor` 确认依赖齐全；`git log --oneline -10` 看最近做了什么。
3. 做新一期按下文"新增一期的标准步骤"；项目技能 `.claude/skills/new-episode/` 带着同一套流程。改工具箱按下面的"工作约定"。

**当前状态（2026-10-15）**
- 工具箱已完成并验证：逐帧渲染、离线混音、ffmpeg 封装与校验、双语 SRT、封面、预览页、素材加载（图片、背景音乐、配音）、一条命令跑完的回归测试。
- 已发布：`2026-W42-sound-flowers`（第一期，从原型迁移，与原型逐像素一致）。
- 待办和已知问题见文末"待办与已知问题"。

**工作约定**
- 用中文沟通；代码注释、文档、命令行输出也用中文。
- 新功能或较大的改动，先给用户一个简短方案，确认后再动手；小修小补直接做。
- 改了 `core/`、`plugins/`、`presets/`，提交前必须 `npm run regress` 全部通过。只改某一期时，至少渲染那一期并确认校验全部 ✓。
- 每次改动后同步更新本文件（命令、模块清单、当前状态、待办）；有取舍的决定追加到 `docs/decisions.md`。下一个会话只能靠这些文件了解上下文。
- git：直接提交到 `main` 并推送到 origin（github.com/Boshugege/video-gen，公开仓库），提交信息用中文。成片和音频素材不提交。
- 已发布期数的画面是用户的作品：没有用户明确要求，不要改动。

## 核心原则（改代码前先读）

1. **确定性渲染**：画面只由 `t` 决定。渲染器会**乱序、并行**地调用 `renderFrame`（6 个无头 Chromium 页面各画一部分帧），所以：
   - 不能用 `Math.random`、`Date.now`、`performance.now`、`requestAnimationFrame`。纯度守卫会直接报错，随机数改用 `core/random.js`。
   - 帧与帧之间不能留状态。运行时每帧都会 `ctx.reset()`；`env.timeline` 已被深冻结。
2. **单一数据源**：分镜、音符、字幕全部写进 `setup()` 返回的 timeline。画面、声音、SRT 只读这一份数据，从源头保证同步。
3. **输出规格固定**：H.264 High、yuv420p、BT.709、固定帧率、AAC 48kHz 立体声、`+faststart`。默认 1080×1920 @30fps，可以直接上传抖音、小红书、Reels、Shorts。
4. **分层与依赖方向**：`episodes → plugins → core`。
   - core 不 import plugins 和 episodes，plugins 不 import episodes。
   - 第二期还可能用到的能力，放 core（流水线必需）或 plugins（按需选用）。episodes 只放本期专属的代码。
5. **产物和音频素材不进 git**：`out/`、`.cache/`、所有视频和音频文件（mp4、wav、mp3、m4a 等）都已忽略。仓库是公开的，背景音乐和配音可能有版权限制。图片素材可以提交；pre-commit 钩子会拦截超过 5MB 的文件。

## 命令

| 命令 | 作用 |
|---|---|
| `npm run setup` | 一条命令装齐依赖：brew 装 ffmpeg、npm install、Playwright Chromium |
| `npm run doctor` | 检查依赖是否齐全，缺什么给出修复命令 |
| `npm run new -- <周号> <英文短名> [--title 中文标题] [--preset horizontal-16x9]` | 用 `episodes/_template` 新建一期。周号可写 `W43`、`43` 或 `2026-W43` |
| `npm run preview -- [episode]` | 打开预览页（带热重载），地址 `http://127.0.0.1:5173/core/preview/?ep=<id>` |
| `npm run render -- <episode> [--draft] [--workers N] [--cover-t 秒] [--burn-subs]` | 渲染成片并校验。`--draft` 输出 540×960 @15fps，用来快速出样 |
| `npm run cover -- <episode> [--t 秒] [--draft]` | 只导出封面 |
| `npm run assets -- <episode>` | 检查这一期的素材：文件在不在、时长或尺寸、sha256、是否进 git、来源和授权 |
| `npm run check:sync -- <episode> [--draft] [--expect N]` | 检测成片里的闪白和嘀声，逐对比较时间差（配合 `_sync-test` 使用） |
| `npm run plugins [-- --md]` | 列出所有插件 |
| `npm test` | 单元测试：时间轴、SRT、WAV、素材、接口，并检查每一期和每个插件都能正常加载 |
| `npm run regress [-- --draft]` | 整套回归：单元测试 → 两个同步测试 → 第一期与原型对比，约 30 秒。改了 core/plugins/presets 必跑 |

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
  assets.js           素材声明解析（同构）+ 浏览器端加载解码：图片 → ImageBitmap，音频 → AudioBuffer
  audio.js            离线混音、音阶、ADSR、tone、带种子混响、素材片段 playClip、闪避 duck、音量包络、WAV 编码（同构）
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
  _asset-test/        素材测试：图片 + 背景音乐 + wav/mp3/m4a 配音片段（素材由 make-assets.mjs 合成）
  2026-W42-sound-flowers/   第一期
cli/                  npm 命令入口（Node）
docs/decisions.md     决策记录：每个设计取舍的日期和理由
.claude/skills/new-episode/   项目技能：做新一期的标准流程
.claude/launch.json   预览服务配置（Claude Code 浏览器面板用）
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
  assets: { photo: 'assets/a.jpg', bgm: { src: 'assets/bgm.mp3', license: '…' } }, // 可选，见下文"素材"
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
| `assets` | 已加载的素材：`assets.image(name)`、`assets.audio(name)`、`assets.meta(name)`；setup 里就能用 |

字体：
- 用 Google Fonts 时，`fonts.text` 必须包含所有会画出来的字。字体按 unicode-range 分片下载，没列进去的字会触发渲染中途加载；运行时会重画该帧，并在 render.json 里记一条警告。
- 渲染器把字体请求缓存在 `.cache/http/`，第二次渲染起可以离线。

## 素材（图片、背景音乐、配音）

**放哪里**
- 本期专用的放 `episodes/<id>/assets/`，路径写成 `'assets/xx.jpg'`。
- 多期共用的（Logo、片头音效）放仓库根目录的 `assets/`，路径写成 `'/assets/xx.png'`。
- 不支持网络地址，先下载到本地，保证离线可复现。

**怎么声明**：在 episode 的 `assets` 里写 `名字: 路径`，或写成对象：
```js
{ src, type?, sha256?, source?, license? }
```
- 类型按扩展名判断。图片支持 png、jpg、webp、gif、avif、svg；音频支持 wav、mp3、m4a、aac、ogg、opus、flac、aiff。
- 写了 `sha256` 就会校验：文件被换过会直接报错。
- `source` 和 `license` 会写进 render.json，方便署名和查授权。

**加载时机**：运行时在 `setup()` 之前把素材全部加载、解码完。
- 图片解码成 ImageBitmap，直接 `ctx.drawImage`。
- 音频统一解码到混音采样率（48kHz），渲染器和预览页拿到的是同一份数据。
- `setup` 里就能读 `env.assets.meta(name).duration`，用配音时长排场景和字幕。

**用法**
- 图片：`plugins/images` 提供以下三个函数。
  - `drawImageFit`：cover 或 contain 填充，可指定焦点。
  - `kenBurns`：缓动推拉。
  - `fitRect`：只计算裁切区域。
- 声音：`core/audio.js` 提供以下四个函数。
  - `playClip(ac, out, buffer, { at, offset, duration, gain, fadeIn, fadeOut, loop })`：把片段放到时间轴上，采样级精确。返回值里的 `level` 留给闪避用。
  - `duck(bgm.level.gain, spans, { level, attack, release })`：配音响起时压低背景音乐。
  - `audioEnvelope(buffer)` 和 `envelopeAt(envl, t)`：在 setup 里算好音量包络，renderFrame 按 t 取值，让画面跟着声音动。
- 完整示例见 `episodes/_asset-test/episode.js`，模板 `episode.js` 末尾也有一段注释掉的写法。

**git 规则**
- 音频素材默认不进 git，换机器要自己放回去。每期 `notes.md` 里有素材清单（来源、授权），`npm run assets -- <id>` 检查是否齐全。
- 缺文件时，渲染会报出具体是哪个文件。
- 例外：`_asset-test` 的测试素材是合成的，已提交。

**已验证（2026-10-15）**
- mp3 和 m4a 的编码器延迟在解码时已正确去除，三种格式的配音起点误差都只有 0.06 ms。
- 闪避实测把背景音乐压到 0.250（设定 0.25）。

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
| `core/audio.js` | `renderOffline` `SCALES` `midiToFreq` `noteToMidi` `scaleMidi` `adsr` `tone` `noiseIR` `createRoom` `playClip` `duck` `audioEnvelope` `envelopeAt` `encodeWav` `channelsOf` |
| `core/assets.js` | `normalizeAssets` `assetUrl` `assetType` `loadAssets` |
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
| `plugins/images` | 函数库 | 图片：cover / contain 填充、按焦点裁切、Ken Burns 缓慢推拉 | `fitRect` `drawImageFit` `kenBurns` |
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
2. 在 `notes.md` 里写选题、分镜、发布信息。素材放进 `episodes/<id>/assets/`，在素材清单里记下来源和授权，然后 `npm run assets -- <id>` 检查。
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
8. 更新本文件的"当前状态"和 README 的期数表；有取舍的决定写进 `docs/decisions.md`。
9. `git add` 代码（成片和音频素材不会被加进去），提交并推送。

## 验收与回归

一条命令跑完下面全部：`npm run regress`（约 30 秒；加 `--draft` 时两个同步测试用草稿渲染，更快）。

- `npm test`：单元测试。
- 音画同步：先 `npm run render -- _sync-test`，再 `npm run check:sync -- _sync-test --expect 11`；草稿模式两条命令都加 `--draft`。
  - 2026-10-15 实测：成片和草稿的最大差值都是 0.69 ms（成片约 0.02 帧）。这 0.69 ms 是嘀声 2 ms 起音坡道越过检测阈值的时间，不是错位。
- 素材同步：先 `npm run render -- _asset-test`，再 `npm run check:sync -- _asset-test --expect 9`。
  - 2026-10-15 实测：wav、mp3、m4a 三种格式的配音片段起点与闪白帧的最大差值是 0.06 ms。
  - 同一期渲染两次（并行页数分别为 6 和 3），audio.wav、逐帧画面、整个 MP4 文件都逐字节相同。
- 第一期与原型对比：`node episodes/2026-W42-sound-flowers/verify-prototype.mjs`。
  - 2026-10-15 实测：14 个时间点加封面共 15 帧，与原型逐像素完全相同。
  - 对比拼图保存在 `out/2026-W42-sound-flowers/prototype-compare.png`。
- 改动 core、plugins 或 presets 后，跑 `npm run regress`，全部通过才提交。

## 环境与已知事项

- Playwright 锁定 1.63.0（对应 Chromium 1243）。升级会换 Chromium 版本，抗锯齿可能有细微差异，升级后重跑原型对比。
- 部分字形（例如第一期等宽字体里的日文、阿拉伯文语言名）会回退到 macOS 系统字体，所以只有同一台机器、同一个 Chromium 才能逐字节复现。换机器渲染时，画面看起来一样，但像素不保证完全相同。
- 渲染速度（M1 / 8 核，6 个渲染页）：
  - 第一期 1725 帧成片约 50 秒，草稿约 18 秒；
  - 瓶颈是 PNG 编码和 x264。
- 预览页的声音与成片相同：加载时离线生成整段混音，再从任意位置截取播放。

## 待办与已知问题

**已知问题（用户已决定不修）**
- 第一期有两处跳变，都是原型里就有的。用户 2026-10-15 决定第一期保持原样：
  - 53 秒（ensemble→outro）：偶数序号的花朝向会跳一下，因为 outro 的旋转公式和 ensemble 不连续；
  - 44 秒（sentence-8→ensemble）：顶部缩略图整体转一个小角度。
- 以后的期数如果复用这段逻辑，注意让旋转连续。

**还不支持（按需再做，做之前先和用户确认方案）**
- 视频片段素材（实拍画面、录屏）：需要逐帧精确解码。可以考虑渲染前用 ffmpeg 抽成图片序列，再按 t 取帧。
- 配音合成（TTS）。目前只能用录好的音频文件。
- 转场、粒子、图表、Logo 动画等视觉组件。
- 同一期同时导出多种画幅；小红书 3:4 等平台专属封面尺寸。
- 烧录字幕只有一种默认样式（`--burn-subs`）。
- 只在 macOS（Apple M1）上验证过。
