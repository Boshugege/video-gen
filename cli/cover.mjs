// npm run cover -- <episode> [--t 12.5] [--draft]
// 单独导出封面到 out/<episode>/cover.png。不给 --t 时按 episode 的 cover 设置。
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, main } from './args.mjs';
import { startServer } from '../core/render/server.mjs';
import { launchBrowser, openHost } from '../core/render/browser.mjs';
import { assertEpisodeExists } from '../core/render/index.mjs';
import { exportCover } from '../core/cover.mjs';
import { outDirFor, ROOT } from '../core/paths.mjs';

main(async () => {
  const { positional, flags } = parseArgs();
  const id = positional[0];
  assertEpisodeExists(id);
  const draft = !!flags.draft;
  const dir = outDirFor(id, { draft });
  fs.mkdirSync(dir, { recursive: true });
  const server = await startServer();
  const browser = await launchBrowser();
  try {
    const host = await openHost(browser, server.url, { episode: id, mode: 'render', draft });
    const t = flags.t != null ? +flags.t : null;
    if (t != null && !(t >= 0 && t <= host.info.duration)) throw new Error(`--t 必须在 0 到 ${host.info.duration} 之间`);
    const r = await exportCover(host, { t, file: path.join(dir, 'cover.png') });
    console.log(`✔ ${path.relative(ROOT, r.file)}  ${host.info.width}×${host.info.height}  ${r.t == null ? '(cover.render)' : `t=${r.t}s`}`);
  } finally {
    await browser.close();
    await server.close();
  }
});
