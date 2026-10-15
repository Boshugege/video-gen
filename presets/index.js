// 画幅预设注册表。新增画幅：在本目录加一个文件并在这里登记。
import vertical from './vertical-9x16.js';
import horizontal from './horizontal-16x9.js';

export const PRESETS = Object.freeze({
  [vertical.id]: vertical,
  [horizontal.id]: horizontal,
});

export function getPreset(id) {
  const p = PRESETS[id];
  if (!p) throw new Error(`未知画幅预设 "${id}"，可选：${Object.keys(PRESETS).join(', ')}`);
  return p;
}

// 渲染用的输出规格：成片或草稿。
export function outputSpec(preset, { draft = false } = {}) {
  const o = draft ? preset.draft : preset;
  return { width: o.width, height: o.height, fps: o.fps };
}
