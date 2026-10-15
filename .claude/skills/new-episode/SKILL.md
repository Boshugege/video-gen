---
name: new-episode
description: 在 video-gen 工具箱里做新的一期短视频，或修改已有的某一期。用户说"做第 N 期""新建一期""这周的视频""把某个主题做成视频""改一下某一期"时使用。
---

# 做新一期

背景、接口和模块清单都在仓库根目录的 `CLAUDE.md`，先读它。按下面的顺序做。

## 1. 对齐方案（先问，再动手）
和用户确认以下内容，然后给一个简短的分镜方案（场景、时长、画面、声音、字幕），用户确认后再写代码：
- 主题、目标时长、画幅（默认竖屏 9:16，长视频用横屏 16:9）；
- 需要哪些素材（图片、背景音乐、配音）以及它们的来源和授权。

## 2. 建目录
```bash
npm run new -- <周号> <英文短名> --title "<中文标题>"
```
周号用当前 ISO 周，例如 `W43`。生成 `episodes/<年>-W<周>-<短名>/`。

## 3. 写 notes.md、放素材
- 选题、分镜、素材清单（来源、授权）、发布信息都写进 `notes.md`。
- 素材放进本期的 `assets/`，在 `episode.js` 的 `assets` 里声明，然后 `npm run assets -- <id>` 检查。
- 音频素材不会进 git，素材清单是换机器时唯一的线索，一定要写全。

## 4. 写 episode.js
- `setup(env)`：把场景、事件（音符、配音片段）、双语字幕全部写进 timeline。配音时长用 `env.assets.meta(name).duration`。
- `renderFrame(ctx, t, env)`：只依赖 t，按 `env.W × env.H` 的逻辑坐标画。
- `renderAudio(ac, out, env)`：
  - 合成音用 `core/audio.js`、`plugins/instruments`；
  - 素材用 `playClip`；
  - 配音时用 `duck` 压低背景音乐。
- 先看 `npm run plugins` 有什么能复用的。本期专属逻辑拆成同目录下的文件。
- 写出了通用能力，就提到 `plugins/`（带 `meta`），并更新 CLAUDE.md 的插件表。

## 5. 预览
- `npm run preview -- <id>`，或在 Claude Code 浏览器面板里用 `.claude/launch.json` 的 `preview` 配置打开 `/core/preview/?ep=<id>`。
- 逐场景检查画面和声音，打开"安全区"，确认关键文字不被平台界面挡住。

## 6. 出片
1. `npm run render -- <id> --draft` 出样，把草稿发给用户看。
2. 用户确认后，`npm run render -- <id>` 出成片。要求校验全部 ✓、没有字体警告。
3. 把 `out/<id>/video.mp4` 和 `cover.png` 发给用户。

## 7. 收尾
1. 改过 `core/`、`plugins/`、`presets/` 的话，`npm run regress` 必须全部通过。
2. 更新文档：
   - `CLAUDE.md` 的"当前状态"（以及新命令、新模块）；
   - `README.md` 的期数表；
   - 有取舍的决定追加到 `docs/decisions.md`。
3. 提交并推送：直接提交到 `main`，提交信息用中文。

## 不要做
- 不要改动已发布期数的画面，除非用户明确要求。
- 不要在 `renderFrame`、`renderAudio` 里用 `Math.random`、`Date.now`、`requestAnimationFrame`；随机性用 `core/random.js`。
- 不要提交背景音乐、配音等音频文件，也不要提交 `out/` 里的成片。
- 不要用网络地址当素材，先下载到 `assets/`。
