// 背景：径向渐变、线性渐变、暗角。
export const meta = {
  name: 'backgrounds',
  kind: 'lib',
  description: '整屏背景：径向渐变、线性渐变、暗角',
  exports: ['radialBackground', 'linearBackground', 'vignette'],
};

// stops: [[0, '#1b1c3a'], [.55, '#101126'], [1, '#08080f']]
export function radialBackground(ctx, { W, H, x = W / 2, y = H / 2, r0 = 0, r1 = Math.hypot(W, H) / 2, stops }) {
  const g = ctx.createRadialGradient(x, y, r0, x, y, r1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

export function linearBackground(ctx, { W, H, angle = 90, stops }) {
  const a = (angle * Math.PI) / 180;
  const dx = (Math.cos(a) * W) / 2, dy = (Math.sin(a) * H) / 2;
  const g = ctx.createLinearGradient(W / 2 - dx, H / 2 - dy, W / 2 + dx, H / 2 + dy);
  for (const [o, c] of stops) g.addColorStop(o, c);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

export function vignette(ctx, { W, H, strength = 0.5, inner = 0.45 }) {
  const r = Math.hypot(W, H) / 2;
  const g = ctx.createRadialGradient(W / 2, H / 2, r * inner, W / 2, H / 2, r);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}
