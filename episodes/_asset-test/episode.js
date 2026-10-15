// 素材测试：图片 + 背景音乐 + "配音"片段，验证素材加载后仍然确定、同步。
//   · 照片铺满全屏做 Ken Burns 推拉
//   · 背景音乐 3 秒一循环，每段"配音"响起时自动压低（duck）
//   · 第 1…9 秒各放一段"配音"（同一个嘀声，依次用 wav / mp3 / m4a 三种格式），
//     嘀声响起的那一帧画面闪白 —— npm run check:sync -- _asset-test --expect 9 逐对比较
//   · 底部音量条由背景音乐的音量包络驱动（setup 里算好，按 t 取值）
// 素材由 make-assets.mjs 合成。
import { defineEpisode } from '../../core/episode.js';
import { createTimeline, eventsOn } from '../../core/timeline.js';
import { playClip, duck, audioEnvelope, envelopeAt } from '../../core/audio.js';
import { kenBurns } from '../../plugins/images/index.js';
import { drawText } from '../../plugins/text/index.js';
import { progressBar } from '../../plugins/progress-bar/index.js';

const BLIP_ONSET = 0.2; // 嘀声在素材文件里的起点（秒），与 make-assets.mjs 一致
const FORMATS = ['blip_wav', 'blip_mp3', 'blip_m4a'];
const SANS = '"PingFang SC","Helvetica Neue",sans-serif';
const MONO = '"Menlo","SF Mono",monospace';

export default defineEpisode({
  id: '_asset-test',
  title: '素材测试',
  preset: 'vertical-9x16',
  plugins: [progressBar()],
  cover: { t: 0.5 },
  assets: {
    photo: { src: 'assets/photo.png', source: 'make-assets.mjs（ffmpeg testsrc2）', license: '自制' },
    bgm: { src: 'assets/bgm.mp3', source: 'make-assets.mjs 合成', license: '自制' },
    blip_wav: 'assets/blip.wav',
    blip_mp3: 'assets/blip.mp3',
    blip_m4a: 'assets/blip.m4a',
  },

  setup(env) {
    const tl = createTimeline();
    tl.scene('test', 12);
    for (let k = 1; k <= 9; k++) {
      const asset = FORMATS[Math.floor((k - 1) / 3)];
      // 用素材的真实时长作为事件时长：字幕、闪避都按它对齐
      const dur = env.assets.meta(asset).duration;
      tl.event('voice', k, { asset }, dur);
      tl.subtitle(k + BLIP_ONSET, k + 0.9, { zh: `第 ${k} 秒 · ${asset.slice(5)}`, en: `Second ${k} · ${asset.slice(5)}` });
    }
    return tl.build({ data: { bgmEnv: audioEnvelope(env.assets.audio('bgm'), { rate: 100 }) } });
  },

  renderFrame(ctx, t, env) {
    const { W, H, fps } = env;
    const voice = eventsOn(env.timeline, 'voice');
    const flash = voice.some(e => e.t + BLIP_ONSET >= t - 1e-6 && e.t + BLIP_ONSET < t + 1 / fps - 1e-6);
    if (flash) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, W, H);
      return;
    }
    kenBurns(ctx, env.assets.image('photo'), t, {
      w: W, h: H, start: 0, duration: env.duration,
      from: { zoom: 1, x: 0.2, y: 0.5 }, to: { zoom: 1.35, x: 0.8, y: 0.4 },
    });
    ctx.fillStyle = 'rgba(0,0,0,.62)';
    ctx.fillRect(0, 0, W, H);

    const cur = [...voice].reverse().find(e => e.t <= t);
    drawText(ctx, cur ? cur.data.asset.slice(5).toUpperCase() : '—', W / 2, H * 0.4, 200, { font: MONO, weight: 700, color: '#f2f2f2' });
    drawText(ctx, `t = ${t.toFixed(3)} s   frame ${Math.round(t * fps)}`, W / 2, H * 0.4 + 170, 44, { font: MONO, weight: 400, color: '#bdbdbd' });
    drawText(ctx, '图片 · 背景音乐 · 配音片段', W / 2, H * 0.28, 52, { font: SANS, weight: 600, color: '#ffffff' });

    // 背景音乐音量条（原始包络，未计入闪避）
    const level = Math.min(1, envelopeAt(env.timeline.data.bgmEnv, t, { loop: true }) / 0.12);
    const bw = W - 240;
    ctx.fillStyle = 'rgba(255,255,255,.18)';
    ctx.fillRect(120, H * 0.66, bw, 28);
    ctx.fillStyle = '#7fd18b';
    ctx.fillRect(120, H * 0.66, bw * level, 28);
    drawText(ctx, 'BGM 音量包络', 120, H * 0.66 - 36, 30, { font: SANS, color: '#cfcfcf', align: 'left' });
  },

  renderAudio(ac, out, env) {
    const voice = eventsOn(env.timeline, 'voice');
    const bgm = playClip(ac, out, env.assets.audio('bgm'), { loop: true, gain: 0.8, fadeIn: 0.5, fadeOut: 1 });
    duck(bgm.level.gain, voice.map(e => [e.t + BLIP_ONSET, e.t + e.dur]), { level: 0.25 });
    for (const e of voice) playClip(ac, out, env.assets.audio(e.data.asset), { at: e.t });
  },
});
