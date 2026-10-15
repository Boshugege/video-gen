// npm run new -- <周号> <英文短名> [--title 中文标题] [--preset horizontal-16x9]
// 周号可写 W43、43 或 2026-W43；只写周数时取当前 ISO 年。生成 episodes/2026-W43-<短名>/。
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, main } from './args.mjs';
import { EPISODES_DIR, ROOT } from '../core/paths.mjs';
import { PRESETS } from '../presets/index.js';

function isoWeek(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return { year: date.getUTCFullYear(), week: Math.ceil(((date - yearStart) / 86400000 + 1) / 7) };
}

function parseWeek(s) {
  let m = /^(\d{4})-?W(\d{1,2})$/i.exec(s || '');
  if (m) return { year: +m[1], week: +m[2] };
  m = /^W?(\d{1,2})$/i.exec(s || '');
  if (m) return { year: isoWeek().year, week: +m[1] };
  return null;
}

main(async () => {
  const { positional, flags } = parseArgs();
  const [weekArg, slug] = positional;
  const wk = parseWeek(weekArg);
  if (!wk || wk.week < 1 || wk.week > 53) throw new Error('用法：npm run new -- <周号> <英文短名>，例如 npm run new -- W43 rain-letters');
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug || '')) throw new Error('英文短名只能用小写字母、数字和连字符，例如 rain-letters');
  if (flags.preset && !PRESETS[flags.preset]) throw new Error(`未知画幅 ${flags.preset}，可选：${Object.keys(PRESETS).join(', ')}`);

  const id = `${wk.year}-W${String(wk.week).padStart(2, '0')}-${slug}`;
  const dest = path.join(EPISODES_DIR, id);
  if (fs.existsSync(dest)) throw new Error(`episodes/${id} 已存在`);
  const title = typeof flags.title === 'string' ? flags.title : slug;

  fs.cpSync(path.join(EPISODES_DIR, '_template'), dest, { recursive: true });
  const epFile = path.join(dest, 'episode.js');
  let src = fs.readFileSync(epFile, 'utf8')
    .replace("id: '_template'", `id: '${id}'`)
    .replace("title: '新一期'", `title: ${JSON.stringify(title)}`)
    .replace(/^\/\/ 新一期模板。.*\n\/\/ 模板本身也是.*\n/m, `// ${title}（${id}）\n`);
  if (flags.preset) src = src.replace("preset: 'vertical-9x16'", `preset: '${flags.preset}'`);
  fs.writeFileSync(epFile, src);

  const notes = path.join(dest, 'notes.md');
  fs.writeFileSync(notes, fs.readFileSync(notes, 'utf8')
    .replaceAll('{{id}}', id)
    .replaceAll('{{title}}', title)
    .replaceAll('{{date}}', new Date().toISOString().slice(0, 10)));

  console.log(`✔ 已创建 ${path.relative(ROOT, dest)}/`);
  console.log(`  下一步：
    1. 在 notes.md 里写选题和分镜
    2. 改 episode.js（setup 写时间轴，renderFrame 画画面，renderAudio 排声音）
    3. npm run preview -- ${id}
    4. npm run render -- ${id} --draft   出样
    5. npm run render -- ${id}           出成片`);
});
