// 带种子的伪随机数。渲染期间 Math.random 会被禁用，需要随机性时一律用这里的函数，
// 保证同一种子每次渲染结果完全相同。

// mulberry32：返回 () => [0, 1) 的生成器。
export function rng(seed = 1) {
  let a = (typeof seed === 'string' ? hashString(seed) : seed) >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 字符串 → 32 位种子（FNV-1a）。
export function hashString(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// 无状态噪声：同样的 (seed, x) 永远得到同样的 [0, 1) 值。适合在 renderFrame 里按帧号/坐标取随机数。
export function noise1(seed, x) {
  let h = (hashString(String(seed)) ^ Math.imul(x | 0, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
