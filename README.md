# video-gen

可复用的竖屏 / 横屏短视频离线渲染工具箱。画面用 Canvas 逐帧绘制，声音由 Web Audio 离线合成，最后用 ffmpeg 封装：

- 画面只由时间 `t` 决定，由无头 Chromium 按 1/fps 逐帧渲染，多页并行；
- 声音用 `OfflineAudioContext` 按同一条时间轴合成，长度精确到帧；
- 输出 H.264 + AAC、yuv420p、+faststart 的 MP4，默认 1080×1920 @30fps，可以直接上传抖音、小红书、Reels、Shorts；
- 支持图片和音频素材（背景音乐、配音）：渲染前全部加载解码完，配音片段采样级对齐，背景音乐可循环、淡入淡出、配音时自动压低；
- 渲染完自动用 ffprobe 校验帧数、时长、音视频对齐。

```bash
npm run setup                                   # brew 装 ffmpeg + npm install + Playwright Chromium
npm run new -- W43 rain-letters                 # 新建一期
npm run preview -- 2026-W43-rain-letters        # 预览：拖时间轴、逐帧、只试听某一段
npm run render -- 2026-W43-rain-letters --draft # 540×960 @15fps 快速出样
npm run render -- 2026-W43-rain-letters         # 成片 → out/<episode>/video.mp4、subtitles.srt、cover.png
npm run regress                                 # 改了工具箱之后：整套回归（单元测试、音画同步、与原型逐像素对比）
```

- episode 接口、模块清单、每周流程、当前状态和待办：[CLAUDE.md](CLAUDE.md)
- 每个设计取舍的日期和理由：[docs/decisions.md](docs/decisions.md)

## 已有的期数

| 期 | 说明 |
|---|---|
| `2026-W42-sound-flowers` | 声音之花：8 种语言的"我想你"变成旋律和花形，57.5 秒 |
| `2026-W43-pause-to-read` | 这条视频里藏着 540 句话：每 3 帧一句，540 句合成一个悬疑短篇，只有暂停才读得到，60 秒 |
| `_sync-test` | 音画同步测试：每秒一次闪白 + 嘀声 |
| `_asset-test` | 素材测试：照片推拉 + 循环背景音乐 + wav / mp3 / m4a 配音片段 |
| `_template` | 新一期模板 |
