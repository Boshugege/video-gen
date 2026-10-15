// 钩子插件：画面边缘的播放进度条。默认不画进封面。
import { definePlugin } from '../../core/episode.js';

export const meta = {
  name: 'progress-bar',
  kind: 'hook',
  description: '在画面顶部或底部画一条随时间增长的进度条（afterFrame）',
  exports: ['progressBar'],
};

export function progressBar({ position = 'bottom', height = 6, offset = 0, color = 'rgba(255,255,255,.85)', track = 'rgba(255,255,255,.15)' } = {}) {
  return definePlugin({
    name: 'progress-bar',
    modes: ['render', 'preview'],
    afterFrame(ctx, t, env) {
      const y = position === 'top' ? offset : env.H - height - offset;
      const p = Math.min(1, Math.max(0, t / env.duration));
      ctx.fillStyle = track;
      ctx.fillRect(0, y, env.W, height);
      ctx.fillStyle = color;
      ctx.fillRect(0, y, env.W * p, height);
    },
  });
}
