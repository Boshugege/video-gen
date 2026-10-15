// 第一期：声音之花 · Sound Flowers
// 把"我想你"在 8 种语言里的说法变成旋律和花形。每个音节是一个音符，也是一片花瓣。
//
// 分镜（秒）：
//   intro      0 – 4      心跳光点 + 开场问题
//   sentence-k 每句 5 秒   花从中心长出（旋律在 0.7s 处响起），最后 0.7s 缩到顶部缩略图
//   ensemble   9 秒        所有花回到中心叠在一起，1.6s 处全部旋律同时响起
//   outro      4.5 秒      花收拢成光点 + 评论区提问
import { defineEpisode } from '../../core/episode.js';
import { createTimeline, sceneAt } from '../../core/timeline.js';
import { createRoom } from '../../core/audio.js';
import { easeOutCubic as ease, lerp, fade } from '../../plugins/motion/index.js';
import { drawText } from '../../plugins/text/index.js';
import { radialBackground } from '../../plugins/backgrounds/index.js';
import { pluck } from '../../plugins/instruments/index.js';
import { SENTENCES, HUES } from './sentences.js';
import { toNotes, freq } from './melody.js';
import { drawFlower } from './flower.js';

const CX = 540, CY = 880, R = 330;
const DISPLAY = '"Noto Serif SC","Noto Serif KR","Noto Naskh Arabic",serif';
const MONO = '"IBM Plex Mono",ui-monospace,monospace';
const INTRO = 4, PER = 5, ENS = 9, END = 4.5, MEL_OFF = 0.7, ENS_MEL = 1.6;

const COPY = {
  intro: ['如果「我想你」有声音，', '它听起来是什么样？', 'What does "I miss you" sound like?'],
  hint: '每个音节，一个音符，一片花瓣',
  ensemble: ['说法不同，', '想念是同一种。', 'Different words. Same feeling.'],
  outro: ['下一句，想听什么？', 'What should I turn into music next?', '评论区告诉我 · Tell me in the comments'],
  poster: ['我想你，有几种声音？', 'One feeling. Many sounds.'],
  brand: '声音之花 · SOUND FLOWERS',
};

/* ---------- 绘制 ---------- */

function bg(ctx, env) {
  radialBackground(ctx, { W: env.W, H: env.H, x: CX, y: CY, r0: 60, r1: 1300, stops: [[0, '#1b1c3a'], [0.55, '#101126'], [1, '#08080f']] });
  ctx.save();
  ctx.globalAlpha = 0.32;
  ctx.fillStyle = '#9b9dc4';
  ctx.font = '500 26px ' + MONO;
  ctx.textAlign = 'center';
  ctx.fillText(COPY.brand, CX, env.H - 70);
  ctx.restore();
}

function textFn(ctx, env) {
  return (s, x, y, size, o = {}) =>
    drawText(ctx, s, x, y, size, { font: DISPLAY, color: '#ecebf6', weight: 500, maxWidth: env.W - 120, ...o });
}

function thumbPos(k, count) {
  const cols = Math.min(count, 5), row = Math.floor(k / cols), inRow = Math.min(cols, count - row * cols), c = k % cols;
  return { x: CX + (c - (inRow - 1) / 2) * 176, y: 200 + row * 176, r: 64 };
}

function drawCaptions(text, it, u, a, b) {
  const al = fade(u, a + 0.2, b, 0.5, 0.5);
  text(it.lang.toUpperCase(), CX, 1345, 30, { font: MONO, color: `hsl(${it.hue},80%,78%)`, alpha: al, weight: 500 });
  text(it.text, CX, 1445, 96, { alpha: al, weight: 700, rtl: it.rtl });
  text(it.notes.map(n => n.s).join(' · '), CX, 1535, 32, { font: MONO, color: '#9b9dc4', alpha: al, weight: 400 });
  const al2 = fade(u, a + 1.4, b, 0.6, 0.5);
  if (it.zh) text(it.zh, CX, 1650, 44, { alpha: al2 });
  if (it.en) text(it.en, CX, 1720, 32, { font: MONO, color: '#c9cae6', alpha: al2, weight: 400 });
}

function drawIntro(ctx, text, u) {
  const pulse = 0.5 + 0.5 * Math.sin(u * Math.PI * 2 * 70 / 60);
  ctx.save();
  ctx.fillStyle = `rgba(240,179,195,${0.4 + 0.6 * pulse})`;
  ctx.beginPath();
  ctx.arc(CX, CY, 10 + 6 * pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  const a = fade(u, 0.3, INTRO - 0.2, 0.6, 0.6);
  text(COPY.intro[0], CX, 1280, 72, { alpha: a, weight: 700 });
  text(COPY.intro[1], CX, 1380, 72, { alpha: a, weight: 700 });
  text(COPY.intro[2], CX, 1480, 36, { font: MONO, color: '#9b9dc4', alpha: a, weight: 400 });
}

function drawSentence(ctx, text, list, k, u) {
  const it = list[k];
  for (let i = 0; i < k; i++) { const p = thumbPos(i, list.length); drawFlower(ctx, list[i], p.x, p.y, p.r, null, { alpha: 0.9 }); }
  const tau = u - MEL_OFF;
  const mv = ease((u - (PER - 0.7)) / 0.7), p = thumbPos(k, list.length);
  const a = Math.min(1, u / 0.4);
  drawFlower(ctx, it, lerp(CX, p.x, mv), lerp(CY, p.y, mv), lerp(R, p.r, mv), tau, { alpha: a });
  drawCaptions(text, it, u, 0, PER - 0.6);
  if (k === 0) text(COPY.hint, CX, 1790, 28, { font: DISPLAY, color: '#9b9dc4', alpha: fade(u, 0.4, PER - 0.6, 0.5, 0.5) });
}

function drawEnsemble(ctx, text, list, u) {
  const mv = ease(u / 1.4);
  const rot = k => (k % 2 ? 1 : -1) * u * 0.06 + k * 0.11;
  list.forEach((it, k) => {
    const p = thumbPos(k, list.length);
    drawFlower(ctx, it, lerp(p.x, CX, mv), lerp(p.y, CY, mv), lerp(p.r, R, mv), null, { alpha: lerp(0.9, 0.42, mv), rot: rot(k), add: mv > 0.5 });
  });
  // 正在发声的音符再叠一层亮光
  if (u >= ENS_MEL) {
    const tau = u - ENS_MEL;
    list.forEach((it, k) => { if (tau < it.len) drawFlower(ctx, it, CX, CY, R * 1.02, tau, { alpha: 0.3, rot: rot(k), add: true }); });
  }
  const a = fade(u, 3.4, ENS, 0.8, 0.6);
  text(COPY.ensemble[0], CX, 1430, 80, { alpha: a, weight: 700 });
  text(COPY.ensemble[1], CX, 1530, 80, { alpha: a, weight: 700 });
  text(COPY.ensemble[2], CX, 1630, 36, { font: MONO, color: '#9b9dc4', alpha: a, weight: 400 });
}

function drawOutro(ctx, text, list, v) {
  const sh = 1 - ease(v / 1.3);
  list.forEach((it, k) => drawFlower(ctx, it, CX, CY, R * sh, null, { alpha: 0.42, rot: k * 0.11 + ENS * 0.06, add: true }));
  ctx.save();
  ctx.fillStyle = 'rgba(240,179,195,.9)';
  ctx.beginPath();
  ctx.arc(CX, CY, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  const a = fade(v, 1, END + 1, 0.6, 0.01);
  text(COPY.outro[0], CX, 1150, 76, { alpha: a, weight: 700 });
  text(COPY.outro[1], CX, 1245, 34, { font: MONO, color: '#9b9dc4', alpha: a, weight: 400 });
  ctx.save();
  ctx.globalAlpha = a;
  ctx.strokeStyle = '#3a3d6a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(CX - 330, 1330, 660, 110, 55);
  ctx.stroke();
  if (Math.floor(v * 2) % 2 === 0) { ctx.fillStyle = '#f0b3c3'; ctx.fillRect(CX - 280, 1355, 5, 60); }
  ctx.restore();
  text(COPY.outro[2], CX, 1520, 30, { font: DISPLAY, color: '#9b9dc4', alpha: a });
}

/* ---------- episode ---------- */

export default defineEpisode({
  id: '2026-W42-sound-flowers',
  title: '声音之花',
  preset: 'vertical-9x16',

  setup() {
    const items = SENTENCES.map((s, i) => ({ ...s, ...toNotes(s), hue: HUES[i % HUES.length] }));
    const list = items.filter(it => it.on !== false);
    const tl = createTimeline();

    const intro = tl.scene('intro', INTRO);
    tl.subtitle(intro.start + 0.3, intro.end - 0.2, { zh: COPY.intro[0] + COPY.intro[1], en: COPY.intro[2] });

    list.forEach((it, k) => {
      const s = tl.scene(`sentence-${k + 1}`, PER, { index: k, lang: it.lang });
      for (const n of it.notes) tl.event('note', s.start + MEL_OFF + n.t, { p: n.p, dur: n.dur, vol: 0.2, voice: k }, n.dur);
      tl.subtitle(s.start + 0.2, s.end - 0.6, { zh: `${it.lang}：${it.text}（${it.zh}）`, en: `${it.lang}: ${it.text} — ${it.en}` });
    });

    const ens = tl.scene('ensemble', ENS);
    const vol = Math.max(0.06, 0.22 / Math.sqrt(list.length));
    list.forEach((it, k) => {
      for (const n of it.notes) tl.event('note', ens.start + ENS_MEL + n.t, { p: n.p, dur: n.dur, vol, voice: k }, n.dur);
    });
    tl.subtitle(ens.start + 3.4, ens.end, { zh: COPY.ensemble[0] + COPY.ensemble[1], en: COPY.ensemble[2] });

    const out = tl.scene('outro', END);
    tl.subtitle(out.start + 1, out.end, { zh: `${COPY.outro[0]}${COPY.outro[2].split(' · ')[0]}`, en: `${COPY.outro[1]} ${COPY.outro[2].split(' · ')[1]}` });

    return tl.build({ data: { items: list } });
  },

  fonts: env => ({
    stylesheets: ['https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Noto+Naskh+Arabic:wght@500;700&family=Noto+Serif+KR:wght@500;700&family=Noto+Serif+SC:wght@500;700&display=swap'],
    faces: [
      '500 40px "Noto Serif SC"', '700 40px "Noto Serif SC"',
      '500 40px "Noto Serif KR"', '700 40px "Noto Serif KR"',
      '500 40px "Noto Naskh Arabic"', '700 40px "Noto Naskh Arabic"',
      '400 32px "IBM Plex Mono"', '500 32px "IBM Plex Mono"',
    ],
    text: Object.values(COPY).flat().join('') +
      env.timeline.data.items.map(it => it.lang + it.lang.toUpperCase() + it.text + it.notes.map(n => n.s).join(' · ') + it.zh + it.en).join(''),
  }),

  renderFrame(ctx, t, env) {
    const list = env.timeline.data.items;
    const text = textFn(ctx, env);
    bg(ctx, env);
    const { scene, u } = sceneAt(env.timeline, t);
    if (scene.id === 'intro') drawIntro(ctx, text, u);
    else if (scene.id === 'ensemble') drawEnsemble(ctx, text, list, u);
    else if (scene.id === 'outro') drawOutro(ctx, text, list, u);
    else drawSentence(ctx, text, list, scene.data.index, u);
  },

  renderAudio(ac, out, env) {
    const room = createRoom(ac, out, { master: 0.9, dry: 0.75, wet: 0.45, seconds: 2.6, decay: 2.4, seed: 'sound-flowers' });
    for (const e of env.timeline.events) {
      if (e.track !== 'note') continue;
      const { p, dur, vol, voice } = e.data;
      pluck(ac, room, { at: e.t, freq: freq(p), dur, vol, detune: ((voice % 3) - 1) * 4 });
    }
  },

  // 封面：原型的静止海报画面，所有句子的花叠在一起。
  cover: {
    render(ctx, env) {
      const text = textFn(ctx, env);
      bg(ctx, env);
      env.timeline.data.items.forEach((it, k) => drawFlower(ctx, it, CX, CY, R, null, { alpha: 0.42, rot: k * 0.11, add: true }));
      text(COPY.poster[0], CX, 1430, 78, { weight: 700 });
      text(COPY.poster[1], CX, 1520, 38, { font: MONO, color: '#9b9dc4', weight: 400 });
    },
  },
});
