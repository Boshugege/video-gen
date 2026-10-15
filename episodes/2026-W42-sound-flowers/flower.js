// 声音之花的花形（本期专属）。每个音节一片花瓣：音越高花瓣越长，音越长花瓣越宽；
// 整组花瓣按对称重复，音节少的句子重复次数多。
import { easeOutCubic as ease } from '../../plugins/motion/index.js';

const symm = n => (n <= 3 ? 5 : n <= 5 ? 3 : 2);

// tau：句内时间（秒），null 表示整朵花静态盛开。o: { alpha, rot, add }
export function drawFlower(ctx, it, cx, cy, r, tau, o = {}) {
  const alpha = o.alpha ?? 1, rot = o.rot || 0;
  const n = it.notes.length;
  if (!n || r < 1) return;
  const m = symm(n), dir = it.rtl ? -1 : 1;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.globalAlpha = alpha;
  if (o.add) ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < n; i++) {
    const nt = it.notes[i];
    const g = tau == null ? 1 : ease((tau - nt.t) / 0.35);
    if (g <= 0) continue;
    const live = tau != null && tau >= nt.t && tau < nt.t + nt.dur + 0.15;
    const L = r * (0.36 + 0.64 * (nt.p / 9)) * g * (live ? 1.05 : 1);
    const w = 0.15 + nt.dur * 0.55;
    for (let j = 0; j < m; j++) {
      const ang = rot + dir * ((i / n) + j) / m * Math.PI * 2 - Math.PI / 2;
      const cr = L * 0.6;
      const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(1, L));
      gr.addColorStop(0, `hsla(${it.hue},90%,86%,${live ? 0.95 : 0.75})`);
      gr.addColorStop(0.6, `hsla(${it.hue},78%,${58 + nt.p * 2}%,${live ? 0.75 : 0.5})`);
      gr.addColorStop(1, `hsla(${it.hue},70%,45%,.15)`);
      ctx.fillStyle = gr;
      ctx.strokeStyle = `hsla(${it.hue},90%,85%,${live ? 0.9 : 0.45})`;
      ctx.lineWidth = Math.max(1, r / 170);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(Math.cos(ang - w) * cr, Math.sin(ang - w) * cr, Math.cos(ang) * L, Math.sin(ang) * L);
      ctx.quadraticCurveTo(Math.cos(ang + w) * cr, Math.sin(ang + w) * cr, 0, 0);
      ctx.fill();
      ctx.stroke();
      if (j === 0 && r > 120) {
        ctx.fillStyle = `hsla(${it.hue},95%,90%,${g})`;
        ctx.beginPath();
        ctx.arc(Math.cos(ang) * (L + r * 0.06), Math.sin(ang) * (L + r * 0.06), r * 0.018, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.fillStyle = `hsla(${it.hue},95%,92%,.95)`;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
