// 第 43 期：这条视频里藏着 540 句话 · Pause to Read
// 每 3 帧换一句，540 句合起来是一个完整的悬疑短篇（story.js）。正常播放读不清，暂停才读得到；
// 结局是只出现 3 帧的第 540 句。正常速度下能看到的是一扇慢慢画出来、慢慢打开的门（door.js）。
//
// 分镜（秒，见 stream.js 的 SCENES）：
//   intro 0–3 · demo 3–6 · freeze 6–8（定格在 #317）· resume 8–10 · door 10–36 · open 36–52
//   ending 52–56（最后 3 帧白底黑字是 #540）· outro 56–60（540 格网格）
//
// 压缩友好：背景纯黑、不加噪点，每帧只有一句字在变，码率都留给文字。
import { defineEpisode } from '../../core/episode.js';
import { createTimeline, sceneAt, eventsOn } from '../../core/timeline.js';
import { tone } from '../../core/audio.js';
import { rng, noise1 } from '../../core/random.js';
import { clamp, fade, smoothstep, easeInOutCubic } from '../../plugins/motion/index.js';
import { drawText, wrapLines, fontString } from '../../plugins/text/index.js';
import { FRAGMENTS } from './story.js';
import { FPS, PER, TOTAL, DEMO, SCENES, lineIndexAt, lineStartTime, streamFrameCount } from './stream.js';
import { drawDoor, DOOR } from './door.js';

const SANS = '"Noto Sans SC",sans-serif';
const MONO = '"IBM Plex Mono",ui-monospace,monospace';
const BG = '#050505', INK = '#f4f1ea', DIM = '#8f8b82', SOFT = '#c2bdb2', PAPER = '#fbf8f0', WARM = '#ffd9a0';
const CX = 540;
const ZH_W = 690;            // 片段中文行宽：62px 一行最多 11 个字
const EN_W = 640;            // 片段英文行宽：比中文窄，避开门把手
const TEXT_CY = 910;         // 片段文字块的垂直中心
const CAPTION_W = 780;       // 顶部旁白宽度：以 540 为中心不越过安全区右边界（930）
const LIGHT_UP = 1;          // outro 开始后第几秒点亮 #317

const COPY = {
  intro: ['这条视频里藏着 540 句话。', 'There are 540 sentences hidden in this video.'],
  demo: ['正常播放，你什么也读不到。', 'At normal speed, you can\'t read a thing.'],
  freeze: ['暂停，你会读到其中一句。', 'Pause, and you\'ll catch one.'],
  door: ['每 3 帧，一句。', 'One sentence every 3 frames.'],
  open: ['没有人能一个人读完它。', 'No one can read it alone.'],
  ending: ['结局在第 540 句，它只出现 3 帧。', 'The ending lasts three frames.'],
  outro: ['把你停到的句子和编号发到评论区，', '我们一起把它拼完。', 'Comment your number. Let\'s finish it together.'],
  found: ['已拼出 1 / 540', '1 of 540 found'],
  cover: ['这条视频里藏着 540 句话', '暂停，才读得到 · Pause to read'],
};

const num = k => '#' + String(k + 1).padStart(3, '0');

/* ---------- 片段文字 ---------- */

const NO_START = /^[，。、；：？！”’）》」』】,.;:?!)\]]/;
const NO_END = /[“‘（《「『【]/;
const BREAK_AFTER = /[，。、；：？！—]/;
const ALNUM = /[0-9A-Za-z]/;

// 中文分词（浏览器自带的 ICU 词典），用来只在词与词之间断行，避免"门 / 缝""收音 / 机"。
const SEG = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('zh', { granularity: 'word' }) : null;
const wordBreaks = s => (SEG ? [...SEG.segment(s)].map(x => x.index).filter(i => i > 0) : []);

// 断点 i 是否落在引号里不该断的位置：短引语（6 字以内）整体不拆，长引语不在开头两字、结尾一字处断。
function badQuoteBreak(s, i) {
  const open = s.lastIndexOf('“', i - 1);
  if (open < 0 || s.lastIndexOf('”', i - 1) > open) return false;
  const close = s.indexOf('”', i);
  if (close < 0) return false;
  return close - open <= 6 || i - open <= 2 || close - i <= 1;
}

// 中文折成一行或两行：两行时能断在标点后面就断在标点后面，其次找最均衡的词边界，实在不行才逐字断；
// 不让标点开头、不让开引号结尾、不拆开数字和短引语。两行都放不下返回 null。
function zhLines(ctx, s, maxW) {
  if (ctx.measureText(s).width <= maxW) return [s];
  const pick = cands => {
    let best = null;
    for (const i of cands) {
      const a = s.slice(0, i), b = s.slice(i);
      if (NO_START.test(b) || NO_END.test(s[i - 1]) || (ALNUM.test(s[i - 1]) && ALNUM.test(s[i])) || badQuoteBreak(s, i)) continue;
      const wa = ctx.measureText(a).width, wb = ctx.measureText(b).width;
      if (wa > maxW || wb > maxW) continue;
      const score = Math.abs(wa - wb) - (BREAK_AFTER.test(s[i - 1]) ? maxW : 0);
      if (!best || score < best.score) best = { score, lines: [a, b] };
    }
    return best && best.lines;
  };
  return pick(wordBreaks(s)) || pick([...Array(s.length).keys()].slice(1));
}

// 中文最多两行、英文最多两行，放不下就逐步缩小字号。导出给排版检查用（见 notes.md）。
export function layoutFragment(ctx, zh, en) {
  let zs = 62, zl;
  for (; ; zs -= 4) {
    ctx.font = fontString(zs, SANS, 700);
    zl = zhLines(ctx, zh, ZH_W);
    if (zl) break;
    if (zs <= 46) { zl = wrapLines(ctx, zh, ZH_W); break; }
  }
  let es = 34, el;
  for (; ; es -= 2) {
    ctx.font = fontString(es, SANS, 400);
    el = wrapLines(ctx, en, EN_W);
    if (el.length <= 2 || es <= 26) break;
  }
  const zlh = zs * 1.34, elh = es * 1.4, gap = 34;
  const h = zl.length * zlh + gap + el.length * elh;
  return { zs, zl, zlh, es, el, elh, top: TEXT_CY - h / 2, gap };
}

// 每行字先用背景色描一圈粗边再填色：门板边线、光从字后面经过时不会碰到笔画，暂停时也读得清。
function haloText(ctx, s, x, y, halo, width) {
  if (halo) {
    ctx.strokeStyle = halo;
    ctx.lineWidth = width;
    ctx.strokeText(s, x, y);
  }
  ctx.fillText(s, x, y);
}

function drawFragment(ctx, k, { ink = INK, dim = SOFT, halo = BG } = {}) {
  const [zh, en] = FRAGMENTS[k];
  const L = layoutFragment(ctx, zh, en);
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = ink;
  ctx.font = fontString(L.zs, SANS, 700);
  L.zl.forEach((s, i) => haloText(ctx, s, CX, L.top + i * L.zlh, halo, 14));
  ctx.fillStyle = dim;
  ctx.font = fontString(L.es, SANS, 400);
  const ey = L.top + L.zl.length * L.zlh + L.gap;
  L.el.forEach((s, i) => haloText(ctx, s, CX, ey + i * L.elh, halo, 10));
  // 编号：门板右下角，安全区以内
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.font = fontString(40, MONO, 500);
  haloText(ctx, num(k), DOOR.x1 - 26, DOOR.y1 - 46, halo, 10);
  ctx.restore();
}

function drawPause(ctx, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = INK;
  for (const dx of [-26, 26]) {
    ctx.beginPath();
    ctx.roundRect(CX + dx - 10, 600, 20, 84, 6);
    ctx.fill();
  }
  ctx.restore();
}

/* ---------- 顶部旁白 ---------- */

function drawCaption(ctx, c, t) {
  // fadeIn 为 0 时第一帧就完整显示（fade() 在起点处返回 0）
  const a = c.fadeIn ? fade(t, c.start, c.end, c.fadeIn, 0.3) : t >= c.start && t <= c.end ? Math.min(1, (c.end - t) / 0.3) : 0;
  if (a <= 0) return;
  const zh = COPY[c.copy].slice(0, -1), en = COPY[c.copy].at(-1);
  const o = { font: SANS, alpha: a, maxWidth: CAPTION_W };
  if (c.style === 'small') {
    drawText(ctx, zh[0], CX, 296, 36, { ...o, weight: 700, color: DIM });
    drawText(ctx, en, CX, 346, 26, { ...o, weight: 400, color: DIM });
  } else {
    const size = c.style === 'outro' ? 46 : 54;
    zh.forEach((s, i) => drawText(ctx, s, CX, 280 + i * size * 1.3, size, { ...o, weight: 700, color: INK }));
    drawText(ctx, en, CX, 280 + zh.length * size * 1.3 + 4, 28, { ...o, weight: 400, color: DIM });
  }
}

/* ---------- 门的状态（只由 t 决定） ---------- */

function doorState(S, t) {
  const draw = easeInOutCubic(clamp((t - S.door.start) / 22));
  const crack = smoothstep(S.door.end - 6, S.door.end, t);
  const open = 0.9 * easeInOutCubic(clamp((t - S.open.start) / (S.open.end - S.open.start)))
    + 0.1 * easeInOutCubic(clamp((t - S.ending.start) / 3));
  const light = 0.75 * smoothstep(S.open.start, S.open.end, t) + 0.25 * smoothstep(S.ending.start, S.ending.end - 0.2, t);
  return { draw, crack, open, light };
}

/* ---------- 结尾网格 ---------- */

const GRID = { cols: 20, rows: 27, cell: 28, pitch: 34, top: 470 };

function drawGrid(ctx, u) {
  const { cols, rows, cell, pitch, top } = GRID;
  const left = CX - (cols * pitch - (pitch - cell)) / 2;
  const lit = smoothstep(LIGHT_UP, LIGHT_UP + 0.15, u);
  ctx.save();
  for (let i = 0; i < TOTAL; i++) {
    const r = Math.floor(i / cols), c = i % cols;
    const a = clamp((u - 0.05 - r * 0.02) / 0.25);
    if (a <= 0) continue;
    const x = left + c * pitch, y = top + r * pitch;
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(244,241,234,0.13)';
    ctx.fillRect(x, y, cell, cell);
    if (i === DEMO - 1 && lit > 0) {
      ctx.save();
      ctx.globalAlpha = a * lit;
      ctx.shadowColor = 'rgba(255,240,210,0.9)';
      ctx.shadowBlur = 18;
      ctx.fillStyle = INK;
      ctx.fillRect(x, y, cell, cell);
      ctx.restore();
    }
    if (i === TOTAL - 1) {
      ctx.globalAlpha = a * (0.55 + 0.45 * Math.sin(u * Math.PI * 2 * 1.2));
      ctx.strokeStyle = WARM;
      ctx.lineWidth = 3;
      ctx.strokeRect(x + 1.5, y + 1.5, cell - 3, cell - 3);
    }
  }
  ctx.restore();
  const fa = smoothstep(LIGHT_UP + 0.1, LIGHT_UP + 0.5, u);
  const y = top + rows * pitch + 30;
  drawText(ctx, COPY.found[0], CX, y, 34, { font: MONO, weight: 500, color: INK, alpha: fa });
  drawText(ctx, COPY.found[1], CX, y + 46, 24, { font: SANS, weight: 400, color: DIM, alpha: fa });
}

/* ---------- 声音 ---------- */

// 12ms 的带种子噪声，衰减很快：放映机似的咔哒声。
function clickBuffer(ac) {
  const len = Math.round(ac.sampleRate * 0.012);
  const b = ac.createBuffer(1, len, ac.sampleRate);
  const d = b.getChannelData(0), r = rng('pause-to-read-click');
  for (let i = 0; i < len; i++) d[i] = (r() * 2 - 1) * Math.pow(1 - i / len, 4);
  return b;
}

function click(ac, out, buf, at, gain, rate) {
  const s = ac.createBufferSource();
  s.buffer = buf;
  s.playbackRate.value = rate;
  const g = ac.createGain();
  g.gain.value = gain;
  s.connect(g).connect(out);
  s.start(at);
}

// 低频持续音：门画出来时淡入，开门后音高升一个八度、滤波打开，在 end 处一刀切断。
function drone(ac, out, { at, end, riseAt }) {
  const g = ac.createGain();
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(0.1, at + 4);
  g.gain.setValueAtTime(0.1, riseAt);
  g.gain.linearRampToValueAtTime(0.2, end - 0.012);
  g.gain.linearRampToValueAtTime(0, end);
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(380, at);
  lp.frequency.setValueAtTime(380, riseAt);
  lp.frequency.exponentialRampToValueAtTime(1600, end);
  lp.connect(g).connect(out);
  for (const [mult, type, vol, detune] of [[1, 'sine', 1, 0], [1, 'sine', 0.8, 9], [2, 'triangle', 0.35, 0], [3, 'sine', 0.14, -5]]) {
    const o = ac.createOscillator();
    o.type = type;
    o.detune.value = detune;
    o.frequency.setValueAtTime(55 * mult, at);
    o.frequency.setValueAtTime(55 * mult, riseAt);
    o.frequency.exponentialRampToValueAtTime(110 * mult, end);
    const og = ac.createGain();
    og.gain.value = vol;
    o.connect(og).connect(lp);
    o.start(at);
    o.stop(end + 0.02);
  }
}

/* ---------- episode ---------- */

export default defineEpisode({
  id: '2026-W43-pause-to-read',
  title: '这条视频里藏着 540 句话',
  preset: 'vertical-9x16',

  setup() {
    const tl = createTimeline();
    const S = {};
    for (const [id, dur, stream] of SCENES) S[id] = tl.scene(id, dur, { stream });
    const scenes = Object.values(S);
    const n = streamFrameCount(scenes);
    if (n !== TOTAL * PER) throw new Error(`片段流有 ${n} 帧，应为 ${TOTAL * PER}（${TOTAL} 句 × ${PER} 帧）`);
    if (FRAGMENTS.length !== TOTAL) throw new Error(`story.js 有 ${FRAGMENTS.length} 句，应为 ${TOTAL}`);

    for (let k = 0; k < TOTAL; k++) tl.event('line', lineStartTime(scenes, k), { k }, PER / FPS);
    const last = lineStartTime(scenes, TOTAL - 1);
    tl.event('drone', S.door.start, { riseAt: S.open.start }, last - S.door.start);
    tl.event('hit', last, {}, 0.12);
    tl.event('click', S.outro.start + LIGHT_UP, {});

    const captions = [
      { copy: 'intro', style: 'big', start: S.intro.start, end: S.intro.end - 0.05, fadeIn: 0 },
      { copy: 'demo', style: 'big', start: S.demo.start + 0.1, end: S.demo.end - 0.05, fadeIn: 0.25 },
      { copy: 'freeze', style: 'big', start: S.freeze.start, end: S.resume.start + 1.6, fadeIn: 0 },
      { copy: 'door', style: 'small', start: S.door.start + 1, end: S.door.end - 0.5, fadeIn: 0.5 },
      { copy: 'open', style: 'big', start: S.open.start + 3, end: S.open.end - 0.4, fadeIn: 0.5 },
      { copy: 'ending', style: 'big', start: S.ending.start + 0.3, end: last - 0.05, fadeIn: 0.4 },
      { copy: 'outro', style: 'outro', start: S.outro.start + 0.3, end: S.outro.end, fadeIn: 0.4 },
    ];
    for (const c of captions) {
      const lines = COPY[c.copy];
      tl.subtitle(c.start, c.end, { zh: lines.slice(0, -1).join(''), en: lines.at(-1) });
    }
    tl.marker(S.freeze.start, `${num(DEMO - 1)} 定格`);
    tl.marker(last, `${num(TOTAL - 1)} 结局`);

    return tl.build({ data: { captions } });
  },

  fonts: () => ({
    stylesheets: ['https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500&family=Noto+Sans+SC:wght@400;700&display=swap'],
    faces: ['700 40px "Noto Sans SC"', '400 40px "Noto Sans SC"', '500 40px "IBM Plex Mono"'],
    text: FRAGMENTS.flat().join('') + Object.values(COPY).flat().join('') + '#0123456789/ ',
  }),

  renderFrame(ctx, t, env) {
    const tl = env.timeline;
    const { scene, u } = sceneAt(tl, t);
    const k = lineIndexAt(tl.scenes, t);

    // 最后 3 帧：白底黑字的第 540 句
    if (k === TOTAL - 1) {
      ctx.fillStyle = PAPER;
      ctx.fillRect(0, 0, env.W, env.H);
      drawFragment(ctx, k, { ink: '#0a0a0a', dim: '#3a3833', halo: null });
      return;
    }

    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, env.W, env.H);

    if (scene.id === 'outro') {
      drawGrid(ctx, u);
    } else {
      const S = Object.fromEntries(tl.scenes.map(s => [s.id, s]));
      const d = doorState(S, t);
      drawDoor(ctx, { ...d, H: env.H });
      if (scene.id === 'freeze') {
        drawFragment(ctx, DEMO - 1);
        drawPause(ctx, 1);
      } else {
        drawFragment(ctx, k);
      }
    }
    for (const c of tl.data.captions) drawCaption(ctx, c, t);
  },

  renderAudio(ac, out, env) {
    const tl = env.timeline;
    const master = ac.createGain();
    master.gain.value = 0.9;
    master.connect(out);
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 900;
    hp.connect(master);
    const buf = clickBuffer(ac);

    for (const e of eventsOn(tl, 'line')) {
      const k = e.data.k;
      if (k === TOTAL - 1) continue;   // 最后一句只有高音
      click(ac, hp, buf, e.t, 0.2 * (0.75 + 0.5 * noise1('gain', k)), 0.8 + 0.4 * noise1('rate', k));
    }
    for (const e of eventsOn(tl, 'click')) click(ac, hp, buf, e.t, 0.45, 0.7);
    for (const e of eventsOn(tl, 'drone')) drone(ac, master, { at: e.t, end: e.t + e.dur, riseAt: e.data.riseAt });
    for (const e of eventsOn(tl, 'hit')) tone(ac, master, { at: e.t, freq: 1760, dur: e.dur, gain: 0.3, attack: 0.002, release: 0.04 });
  },

  // 封面：定格画面（门已画好、开了一条缝）+ 标题。
  cover: {
    render(ctx, env) {
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, env.W, env.H);
      drawDoor(ctx, { draw: 1, crack: 1, open: 0.12, light: 0.45, H: env.H });
      drawFragment(ctx, DEMO - 1);
      drawPause(ctx, 1);
      drawText(ctx, COPY.cover[0], CX, 272, 64, { font: SANS, weight: 700, color: INK, maxWidth: CAPTION_W });
      drawText(ctx, COPY.cover[1], CX, 348, 30, { font: SANS, weight: 400, color: DIM, maxWidth: CAPTION_W });
    },
  },
});
