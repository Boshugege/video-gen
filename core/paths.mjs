// 仓库内的标准路径（Node 端）。
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OUT_DIR = path.join(ROOT, 'out');
export const CACHE_DIR = path.join(ROOT, '.cache');
export const EPISODES_DIR = path.join(ROOT, 'episodes');
export const PLUGINS_DIR = path.join(ROOT, 'plugins');

// out/<episode>/ 或 out/<episode>/draft/
export const outDirFor = (episode, { draft = false } = {}) =>
  draft ? path.join(OUT_DIR, episode, 'draft') : path.join(OUT_DIR, episode);
