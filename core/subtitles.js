// 字幕：从 timeline.subtitles 生成中英双语 SRT，以及可选的画面烧录。
// toSRT 是纯函数（Node 端写文件用）；drawSubtitles 只用传进来的 ctx（浏览器端用）。

import { subtitleAt } from './timeline.js';

// 1.234 → "00:00:01,234"
export function srtTime(sec) {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(h)}:${p(m)}:${p(s)},${p(ms % 1000, 3)}`;
}

// langs 决定每条字幕里各语言的行序；某语言为空就跳过那一行。
export function toSRT(timeline, { langs = ['zh', 'en'] } = {}) {
  const cues = (timeline.subtitles || [])
    .map(c => ({ ...c, lines: langs.map(l => (c[l] || '').trim()).filter(Boolean) }))
    .filter(c => c.lines.length);
  return cues
    .map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.lines.join('\n')}\n`)
    .join('\n');
}

export const DEFAULT_SUBTITLE_STYLE = Object.freeze({
  zhFont: '600 52px "PingFang SC","Noto Sans SC","Microsoft YaHei",sans-serif',
  enFont: '400 34px "Helvetica Neue",Arial,sans-serif',
  color: '#ffffff',
  enColor: 'rgba(255,255,255,.85)',
  box: 'rgba(0,0,0,.45)',
  lineGap: 14,
  padX: 28,
  padY: 16,
  fadeSec: 0.15,
});

// 把 t 时刻的字幕画在安全区下沿之上。env.preset.safeArea 决定位置。
export function drawSubtitles(ctx, t, env, style = {}) {
  const c = subtitleAt(env.timeline, t);
  if (!c) return;
  const st = { ...DEFAULT_SUBTITLE_STYLE, ...style };
  const lines = [];
  if (c.zh) lines.push({ s: c.zh, font: st.zhFont, color: st.color });
  if (c.en) lines.push({ s: c.en, font: st.enFont, color: st.enColor });
  if (!lines.length) return;
  const alpha = Math.min(1, (t - c.start) / st.fadeSec, (c.end - t) / st.fadeSec);
  const safe = env.preset.safeArea || { bottom: 120, left: 60, right: 60 };
  const maxW = env.W - safe.left - safe.right;
  ctx.save();
  ctx.globalAlpha = Math.max(0, alpha);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const sizes = lines.map(l => {
    ctx.font = l.font;
    const m = ctx.measureText(l.s);
    const h = parseInt(/(\d+)px/.exec(l.font)?.[1] || '40', 10) * 1.25;
    return { w: Math.min(maxW, m.width), h };
  });
  const boxW = Math.max(...sizes.map(s => s.w)) + st.padX * 2;
  const boxH = sizes.reduce((a, s) => a + s.h, 0) + st.lineGap * (lines.length - 1) + st.padY * 2;
  const cx = safe.left + maxW / 2;
  const bottom = env.H - safe.bottom;
  if (st.box) {
    ctx.fillStyle = st.box;
    ctx.beginPath();
    ctx.roundRect(cx - boxW / 2, bottom - boxH, boxW, boxH, 16);
    ctx.fill();
  }
  let y = bottom - boxH + st.padY;
  lines.forEach((l, i) => {
    ctx.font = l.font;
    ctx.fillStyle = l.color;
    ctx.fillText(l.s, cx, y + sizes[i].h / 2, maxW);
    y += sizes[i].h + st.lineGap;
  });
  ctx.restore();
}

// 烧录字幕时需要预加载的文字。
export const subtitleText = timeline => (timeline.subtitles || []).map(c => `${c.zh || ''}${c.en || ''}`).join('');
