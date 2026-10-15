// 新一期模板。`npm run new -- <周号> <英文短名>` 会复制本目录并改好 id / title。
// 模板本身也是一期可以渲染的视频：npm run render -- _template --draft
//
// 写法要点（详见 CLAUDE.md）：
//   1. setup() 里把分镜、音符、字幕都写进 timeline —— 画面、声音、字幕只读这一份数据
//   2. renderFrame(ctx, t, env) 只依赖 t：不要用 Math.random / Date.now / requestAnimationFrame，
//      也不要在帧与帧之间保存状态（渲染器会乱序、并行地调用它）
//   3. 一律按 env.W × env.H（竖屏 1080×1920）的逻辑坐标画，草稿模式运行时会自动缩放
//   4. 模块顶层不要碰 DOM（Node 端的测试会 import 它）
import { defineEpisode } from '../../core/episode.js';
import { createTimeline, sceneAt } from '../../core/timeline.js';
import { createRoom, scaleMidi, midiToFreq } from '../../core/audio.js';
import { easeOutCubic, fade, lerp } from '../../plugins/motion/index.js';
import { drawText } from '../../plugins/text/index.js';
import { linearBackground } from '../../plugins/backgrounds/index.js';
import { pluck } from '../../plugins/instruments/index.js';
import { progressBar } from '../../plugins/progress-bar/index.js';

// 用系统字体可以免去网络加载；需要网络字体时参考第一期的 fonts 写法。
const SANS = '"PingFang SC","Helvetica Neue",sans-serif';

// 分镜：[场景 id, 时长(秒), 中文, 英文]
const STORYBOARD = [
  ['hook', 3, '这里写开场的问题', 'An opening question goes here'],
  ['point-1', 3, '第一个要点', 'First point'],
  ['point-2', 3, '第二个要点', 'Second point'],
  ['cta', 3, '评论区告诉我', 'Tell me in the comments'],
];

export default defineEpisode({
  id: '_template',
  title: '新一期',
  preset: 'vertical-9x16',
  plugins: [progressBar()],
  cover: { t: 1.5 },

  setup() {
    const tl = createTimeline();
    STORYBOARD.forEach(([id, dur, zh, en], i) => {
      const s = tl.scene(id, dur, { zh, en });
      tl.subtitle(s.start + 0.3, s.end - 0.2, { zh, en });
      // 每个场景开头一串上行琶音（C 大调五声音阶）
      for (let k = 0; k < 3; k++) tl.event('note', s.start + 0.2 + k * 0.15, { degree: i * 2 + k });
    });
    return tl.build();
  },

  renderFrame(ctx, t, env) {
    const { W, H } = env;
    linearBackground(ctx, { W, H, angle: 90, stops: [[0, '#1d2340'], [1, '#0b0d18']] });
    const { scene, u, p } = sceneAt(env.timeline, t);
    const a = fade(u, 0, scene.end - scene.start, 0.4, 0.3);
    const rise = lerp(40, 0, easeOutCubic(u / 0.6));
    drawText(ctx, scene.data.zh, W / 2, H * 0.45 + rise, 84, { font: SANS, weight: 700, alpha: a, maxWidth: W - 160 });
    drawText(ctx, scene.data.en, W / 2, H * 0.45 + 110 + rise, 38, { font: SANS, weight: 400, color: '#a9b0d6', alpha: a, maxWidth: W - 160 });
    // 场景进度圆环
    ctx.strokeStyle = 'rgba(169,176,214,.5)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(W / 2, H * 0.3, 60, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2);
    ctx.stroke();
  },

  renderAudio(ac, out, env) {
    const room = createRoom(ac, out, { seed: env.episode.id });
    for (const e of env.timeline.events) {
      if (e.track === 'note') pluck(ac, room, { at: e.t, freq: midiToFreq(scaleMidi('C4', 'majorPentatonic', e.data.degree)), dur: 0.3, vol: 0.2 });
    }
  },
});
