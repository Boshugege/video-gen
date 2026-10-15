// 钩子插件：角落水印（账号名、期号）。位置默认避开平台遮挡区。
import { definePlugin } from '../../core/episode.js';

export const meta = {
  name: 'watermark',
  kind: 'hook',
  description: '在安全区内的角落画一行水印文字（afterFrame）',
  exports: ['watermark'],
};

export function watermark({
  text,
  position = 'top-left',
  font = '500 30px "Helvetica Neue",Arial,"PingFang SC",sans-serif',
  color = '#ffffff',
  alpha = 0.55,
  modes = ['render', 'preview'],
} = {}) {
  if (!text) throw new Error('watermark 需要 text');
  return definePlugin({
    name: 'watermark',
    modes,
    fontText: () => text,
    afterFrame(ctx, t, env) {
      const s = env.preset.safeArea || { top: 40, right: 40, bottom: 40, left: 40 };
      const [v, h] = position.split('-');
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.font = font;
      ctx.textAlign = h === 'right' ? 'right' : 'left';
      ctx.textBaseline = v === 'bottom' ? 'bottom' : 'top';
      ctx.fillText(text, h === 'right' ? env.W - s.right : s.left, v === 'bottom' ? env.H - s.bottom : s.top);
    },
  });
}
