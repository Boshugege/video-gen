// 运动曲线：缓动、插值、淡入淡出。全部是纯函数，只依赖传入的时间。
export const meta = {
  name: 'motion',
  kind: 'lib',
  description: '缓动、插值、淡入淡出、节拍脉冲等纯函数',
  exports: ['clamp', 'lerp', 'invLerp', 'easeOutCubic', 'easeInOutCubic', 'easeOutBack', 'smoothstep', 'fade', 'pulse'],
};

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, x) => (x - a) / (b - a);

export const easeOutCubic = x => 1 - Math.pow(1 - clamp(x), 3);
export const easeInOutCubic = x => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
export const easeOutBack = (x, s = 1.70158) => { x = clamp(x) - 1; return x * x * ((s + 1) * x + s) + 1; };
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// 在 [a, b] 区间内可见：开头 inT 秒淡入、结尾 outT 秒淡出；区间外为 0。
export function fade(u, a, b, inT, outT) {
  if (u < a || u > b) return 0;
  return Math.min(1, (u - a) / inT, (b - u) / outT);
}

// 按 bpm 跳动的 0..1 正弦脉冲。
export const pulse = (t, bpm = 60) => 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * bpm / 60);
