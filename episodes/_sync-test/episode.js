// 音画同步测试：第 1…11 秒的整秒时刻，画面白闪 1 帧，同时响一声 1kHz 嘀声。
// 渲染后用 `npm run check:sync -- _sync-test` 逐个比对闪白和嘀声的起点，要求误差 < 1 帧。
// 闪白和嘀声都读 timeline 里同一组 "sync" 事件，这正是整个工具箱保证同步的方式。
import { defineEpisode } from '../../core/episode.js';
import { createTimeline, eventsOn } from '../../core/timeline.js';
import { tone } from '../../core/audio.js';
import { progressBar } from '../../plugins/progress-bar/index.js';
import { watermark } from '../../plugins/watermark/index.js';

const SECONDS = 12;
const MONO = '"Menlo","SF Mono",monospace';

export default defineEpisode({
  id: '_sync-test',
  title: '音画同步测试',
  preset: 'vertical-9x16',
  plugins: [progressBar(), watermark({ text: 'SYNC TEST' })],
  cover: { t: 0.5 },

  setup() {
    const tl = createTimeline();
    tl.scene('test', SECONDS);
    for (let k = 1; k < SECONDS; k++) {
      tl.event('sync', k);
      tl.subtitle(k, k + 0.8, { zh: `第 ${k} 秒`, en: `Second ${k}` });
    }
    return tl.build();
  },

  renderFrame(ctx, t, env) {
    const { W, H, fps } = env;
    // 闪白：该帧覆盖了某个 sync 事件的时刻，即 e.t ∈ [t, t + 1/fps)
    const flash = eventsOn(env.timeline, 'sync').some(e => e.t >= t - 1e-6 && e.t < t + 1 / fps - 1e-6);
    ctx.fillStyle = flash ? '#ffffff' : '#141414';
    ctx.fillRect(0, 0, W, H);
    if (flash) return;

    // 每秒扫过一次的竖线：肉眼检查运动是否平滑
    const x = (t % 1) * W;
    ctx.fillStyle = '#3d8bff';
    ctx.fillRect(x - 4, H * 0.62, 8, 160);

    ctx.fillStyle = '#e8e8e8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 360px ${MONO}`;
    ctx.fillText(String(Math.floor(t)), W / 2, H * 0.42);
    ctx.font = `400 48px ${MONO}`;
    ctx.fillStyle = '#9a9a9a';
    const f = Math.round(t * fps);
    ctx.fillText(`t = ${t.toFixed(3)} s   frame ${f}`, W / 2, H * 0.56);
  },

  renderAudio(ac, out, env) {
    for (const e of eventsOn(env.timeline, 'sync')) tone(ac, out, { at: e.t, freq: 1000, dur: 0.08, gain: 0.8 });
  },
});
