// 图片绘制：按 cover / contain 填进矩形、Ken Burns 推拉摇移。img 一般来自 env.assets.image(name)。
import { clamp, lerp, easeInOutCubic } from '../motion/index.js';

export const meta = {
  name: 'images',
  kind: 'lib',
  description: '图片：cover / contain 填充、按焦点裁切、Ken Burns 缓慢推拉',
  exports: ['fitRect', 'drawImageFit', 'kenBurns'],
};

// 计算图片在目标矩形里的源裁切区域。fit: 'cover' 铺满（裁掉多余）| 'contain' 完整显示（留边）。
// focusX / focusY（0..1）决定 cover 时保留图片的哪一部分。zoom > 1 在 cover 基础上再放大。
export function fitRect(iw, ih, w, h, { fit = 'cover', focusX = 0.5, focusY = 0.5, zoom = 1 } = {}) {
  if (fit === 'contain') {
    const s = Math.min(w / iw, h / ih) * zoom;
    const dw = iw * s, dh = ih * s;
    return { sx: 0, sy: 0, sw: iw, sh: ih, dx: (w - dw) / 2, dy: (h - dh) / 2, dw, dh };
  }
  const s = Math.max(w / iw, h / ih) * zoom;
  const sw = w / s, sh = h / s;
  const sx = clamp((iw - sw) * focusX, 0, iw - sw);
  const sy = clamp((ih - sh) * focusY, 0, ih - sh);
  return { sx, sy, sw, sh, dx: 0, dy: 0, dw: w, dh: h };
}

export function drawImageFit(ctx, img, x, y, w, h, opts = {}) {
  const r = fitRect(img.width, img.height, w, h, opts);
  ctx.save();
  if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, r.sx, r.sy, r.sw, r.sh, x + r.dx, y + r.dy, r.dw, r.dh);
  ctx.restore();
}

// Ken Burns：在 [start, start+duration] 内从 from 过渡到 to。
// from / to: { zoom, x, y }，x / y 是焦点（0..1）。只依赖 t，草稿和成片一致。
export function kenBurns(ctx, img, t, {
  x = 0, y = 0, w, h, start = 0, duration,
  from = { zoom: 1, x: 0.5, y: 0.5 }, to = { zoom: 1.15, x: 0.5, y: 0.5 },
  ease = easeInOutCubic, alpha,
} = {}) {
  const p = ease(clamp((t - start) / duration));
  drawImageFit(ctx, img, x, y, w, h, {
    fit: 'cover',
    zoom: lerp(from.zoom ?? 1, to.zoom ?? 1, p),
    focusX: lerp(from.x ?? 0.5, to.x ?? 0.5, p),
    focusY: lerp(from.y ?? 0.5, to.y ?? 0.5, p),
    alpha,
  });
}
