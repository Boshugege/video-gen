// npm run assets -- <episode>
// 检查一期声明的素材：文件在不在、大小、sha256、时长 / 尺寸、是否进 git、来源和授权。缺文件时退出码为 1。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { parseArgs, main } from './args.mjs';
import { ROOT, EPISODES_DIR } from '../core/paths.mjs';
import { normalizeAssets, assetUrl } from '../core/assets.js';
import { assertEpisodeExists } from '../core/render/index.mjs';
import { probe, which } from '../core/mux.mjs';

function gitState(rel) {
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', rel], { cwd: ROOT, stdio: 'ignore' });
    return '已进 git';
  } catch { /* 未追踪 */ }
  try {
    execFileSync('git', ['check-ignore', '-q', rel], { cwd: ROOT, stdio: 'ignore' });
    return '被忽略（不进 git）';
  } catch {
    return '未提交';
  }
}

main(async () => {
  const { positional } = parseArgs();
  const id = positional[0];
  assertEpisodeExists(id);
  const ep = (await import(pathToFileURL(path.join(EPISODES_DIR, id, 'episode.js')).href)).default;
  const list = normalizeAssets(ep.assets);
  if (!list.length) { console.log(`${id} 没有声明素材。`); return; }
  const hasProbe = !!which('ffprobe');
  let missing = 0;
  console.log(`▶ ${id} · ${list.length} 个素材\n`);
  for (const a of list) {
    const rel = assetUrl(id, a.src).slice(1);
    const file = path.join(ROOT, rel);
    if (!fs.existsSync(file)) {
      missing++;
      console.log(`✗ ${a.name.padEnd(12)} ${rel}  文件不存在`);
      continue;
    }
    const buf = fs.readFileSync(file);
    const sha = crypto.createHash('sha256').update(buf).digest('hex');
    let info = '';
    if (hasProbe) {
      try {
        const p = await probe(file);
        const s = p.streams[0] || {};
        info = a.type === 'image'
          ? `${s.width}×${s.height}`
          : `${(+p.format.duration).toFixed(3)}s · ${s.codec_name} ${s.sample_rate}Hz ${s.channels}ch`;
      } catch { info = '（ffprobe 无法识别）'; }
    }
    const pin = a.sha256 ? (a.sha256 === sha ? ' · sha256 ✓' : ' · ✗ sha256 与声明不一致') : '';
    if (a.sha256 && a.sha256 !== sha) missing++;
    console.log(`✓ ${a.name.padEnd(12)} ${rel}`);
    console.log(`  ${''.padEnd(12)} ${a.type} · ${info} · ${(buf.length / 1024).toFixed(0)} KB · ${gitState(rel)}${pin}`);
    console.log(`  ${''.padEnd(12)} sha256 ${sha}`);
    if (a.source || a.license) console.log(`  ${''.padEnd(12)} 来源：${a.source || '—'} · 授权：${a.license || '—'}`);
  }
  if (missing) throw new Error(`${missing} 个素材有问题`);
  console.log('\n素材齐全。');
});
