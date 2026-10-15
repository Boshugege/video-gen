// npm run plugins [-- --md]：列出 plugins/ 下的所有插件（读取每个插件的 meta）。
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs, main } from './args.mjs';
import { PLUGINS_DIR } from '../core/paths.mjs';

export async function loadPluginMetas() {
  const dirs = fs.readdirSync(PLUGINS_DIR, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort();
  const out = [];
  for (const d of dirs) {
    const file = path.join(PLUGINS_DIR, d, 'index.js');
    if (!fs.existsSync(file)) continue;
    const mod = await import(pathToFileURL(file).href);
    if (!mod.meta) throw new Error(`plugins/${d}/index.js 缺少 export const meta`);
    out.push({ dir: d, ...mod.meta });
  }
  return out;
}

main(async () => {
  const { flags } = parseArgs();
  const metas = await loadPluginMetas();
  if (flags.md) {
    console.log('| 插件 | 类型 | 说明 | 导出 |\n|---|---|---|---|');
    for (const m of metas) console.log(`| \`plugins/${m.dir}\` | ${m.kind === 'hook' ? '钩子' : '函数库'} | ${m.description} | ${m.exports.map(e => `\`${e}\``).join(' ')} |`);
    return;
  }
  for (const m of metas) {
    console.log(`${m.kind === 'hook' ? '⚓' : '▪'} ${m.name.padEnd(14)} ${m.description}\n  ${' '.repeat(14)} 导出：${m.exports.join(', ')}`);
  }
  console.log(`\n共 ${metas.length} 个。▪ 函数库：直接 import 使用　⚓ 钩子：放进 episode 的 plugins: [...]`);
});
