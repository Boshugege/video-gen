// 封面导出（Node）：从指定时间点（或 episode 的 cover.render）导出 PNG。
import fs from 'node:fs';
import { dataUrlToBuffer } from './render/browser.mjs';

// host：openHost() 返回的渲染页。t 为 null 时按 episode 的 cover 设置。
export async function exportCover(host, { t = null, file }) {
  const png = dataUrlToBuffer(await host.cover({ t }));
  fs.writeFileSync(file, png);
  return { file, t: t ?? host.info.coverT, bytes: png.length };
}
