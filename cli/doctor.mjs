// npm run doctor：检查渲染所需的依赖，缺什么就给出安装命令。
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { which } from '../core/mux.mjs';
import { ROOT } from '../core/paths.mjs';

const rows = [];
const ok = (name, detail) => rows.push(['✓', name, detail]);
const bad = (name, detail, fix) => rows.push(['✗', name, detail, fix]);

const major = +process.versions.node.split('.')[0];
major >= 20 ? ok('Node.js', process.version) : bad('Node.js', process.version, '需要 Node 20+：brew install node');

for (const bin of ['ffmpeg', 'ffprobe']) {
  const p = which(bin);
  if (!p) { bad(bin, '未安装', 'brew install ffmpeg'); continue; }
  const v = execFileSync(bin, ['-version']).toString().split('\n')[0];
  ok(bin, v.replace(/ Copyright.*/, ''));
}
if (which('ffmpeg')) {
  const enc = execFileSync('ffmpeg', ['-hide_banner', '-encoders']).toString();
  /\blibx264\b/.test(enc) ? ok('ffmpeg: libx264', 'H.264 编码器') : bad('ffmpeg: libx264', '缺少', 'brew reinstall ffmpeg');
  /\baac\b/.test(enc) ? ok('ffmpeg: aac', 'AAC 编码器') : bad('ffmpeg: aac', '缺少', 'brew reinstall ffmpeg');
}

try {
  const { chromium } = await import('playwright');
  const pkg = JSON.parse(fs.readFileSync(new URL('../node_modules/playwright/package.json', import.meta.url)));
  ok('playwright', pkg.version);
  const exe = chromium.executablePath();
  fs.existsSync(exe) ? ok('Chromium', exe.replace(process.env.HOME, '~')) : bad('Chromium', '未下载', 'npx playwright install chromium');
} catch {
  bad('playwright', '未安装', 'npm install');
}

try {
  const hooks = execFileSync('git', ['config', 'core.hooksPath'], { cwd: ROOT }).toString().trim();
  hooks === '.githooks' ? ok('git hooks', '.githooks（拦截大文件）') : bad('git hooks', hooks || '未设置', 'git config core.hooksPath .githooks');
} catch {
  bad('git hooks', '未设置', 'git config core.hooksPath .githooks');
}

for (const [mark, name, detail, fix] of rows) console.log(`${mark} ${name.padEnd(18)} ${detail}${fix ? `\n    → ${fix}` : ''}`);
const missing = rows.filter(r => r[0] === '✗');
if (missing.length) {
  console.log('\n一条命令装齐：npm run setup');
  process.exit(1);
}
console.log('\n一切就绪。');
