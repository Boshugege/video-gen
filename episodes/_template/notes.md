# {{title}}（{{id}}）

创建于 {{date}}

## 选题
- 一句话概括：
- 目标平台：抖音 / 小红书 / Reels / Shorts
- 画幅：竖屏 9:16（横屏改 episode.js 里的 preset 为 `horizontal-16x9`）

## 分镜
| 场景 id | 时长 | 画面 | 声音 | 字幕（中 / 英） |
|---|---|---|---|---|
| hook | 3s | | | |

## 素材清单
放在 `episodes/{{id}}/assets/`，在 episode.js 的 `assets` 里声明。音频文件不进 git（仓库公开，注意版权），换机器时按这张表放回去；`npm run assets -- {{id}}` 检查是否齐全。

| 名称 | 文件 | 来源 | 授权 | 备注 |
|---|---|---|---|---|
| | | | | |

## 发布信息
- 标题：
- 简介：
- 话题标签：
- 封面时间点：（episode.js 里的 `cover.t`，或 `npm run cover -- {{id}} --t 秒数`）

## 检查清单
- [ ] `npm run assets -- {{id}}` 素材齐全，来源和授权已记录
- [ ] `npm run preview -- {{id}}` 逐场景过一遍画面和声音
- [ ] 打开"安全区"，确认关键文字不在平台遮挡区
- [ ] `npm run render -- {{id}} --draft` 出样，手机上看一遍
- [ ] `npm run render -- {{id}}` 出成片，校验全部 ✓
- [ ] 上传 `out/{{id}}/video.mp4`，封面用 `cover.png`，字幕用 `subtitles.srt`
