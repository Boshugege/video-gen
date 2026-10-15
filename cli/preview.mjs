// npm run preview -- [episode] [--port 5173] [--no-open]
// 启动本地预览服务（带热重载）并在默认浏览器里打开预览页。Ctrl+C 退出。
import { spawn } from 'node:child_process';
import { parseArgs, main } from './args.mjs';
import { startServer } from '../core/render/server.mjs';
import { assertEpisodeExists } from '../core/render/index.mjs';

main(async () => {
  const { positional, flags } = parseArgs();
  const id = positional[0];
  if (id) assertEpisodeExists(id);
  const want = flags.port ? +flags.port : 5173;
  let server;
  try {
    server = await startServer({ port: want, watch: true });
  } catch (e) {
    if (e.code !== 'EADDRINUSE') throw e;
    server = await startServer({ port: 0, watch: true });
  }
  const url = `${server.url}/core/preview/${id ? `?ep=${encodeURIComponent(id)}` : ''}`;
  console.log(`预览：${url}\n修改 episodes/、core/、plugins/、presets/ 下的文件会自动刷新。Ctrl+C 退出。`);
  if (!flags['no-open'] && process.platform === 'darwin') spawn('open', [url], { stdio: 'ignore', detached: true }).unref();
  const stop = async () => { await server.close(); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
});
