// npm run regress [-- --draft]
// 一条命令跑完整套回归：单元测试 → 音画同步测试 → 素材同步测试 → 第一期与原型逐像素对比。
// 改动 core/、plugins/、presets/ 之后、提交之前都要跑；全部通过才算没有破坏已有功能。
// --draft：两个同步测试用草稿模式渲染（更快），原型对比不受影响。
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { parseArgs, main } from './args.mjs';
import { ROOT } from '../core/paths.mjs';

function exec(args) {
  return new Promise(resolve => {
    const p = spawn(process.execPath, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', d => { out += d; });
    p.stderr.on('data', d => { out += d; });
    p.on('close', code => resolve({ code, out }));
  });
}

const lastMatch = (out, re) => out.split('\n').filter(l => re.test(l)).pop()?.trim() || '';

main(async () => {
  const { flags } = parseArgs();
  const d = flags.draft ? ['--draft'] : [];
  const tests = fs.readdirSync(path.join(ROOT, 'test')).filter(f => f.endsWith('.test.mjs')).map(f => path.join('test', f));
  const steps = [
    { name: '单元测试', args: ['--test', ...tests], summary: out => `${lastMatch(out, /^ℹ pass/)} ${lastMatch(out, /^ℹ fail/)}` },
    { name: '渲染 _sync-test', args: ['cli/render.mjs', '_sync-test', ...d], summary: out => lastMatch(out, /校验(通过|未通过)/) },
    { name: '音画同步', args: ['cli/check-sync.mjs', '_sync-test', '--expect', '11', ...d], summary: out => lastMatch(out, /同步检查/) },
    { name: '渲染 _asset-test', args: ['cli/render.mjs', '_asset-test', ...d], summary: out => lastMatch(out, /校验(通过|未通过)/) },
    { name: '素材同步', args: ['cli/check-sync.mjs', '_asset-test', '--expect', '9', ...d], summary: out => lastMatch(out, /同步检查/) },
    { name: '第一期 vs 原型', args: ['episodes/2026-W42-sound-flowers/verify-prototype.mjs'], summary: out => lastMatch(out, /逐像素/) },
  ];
  const results = [];
  for (const s of steps) {
    const t0 = Date.now();
    const tty = process.stdout.isTTY;
    if (tty) process.stdout.write(`… ${s.name}`);
    const r = await exec(s.args);
    const sec = ((Date.now() - t0) / 1000).toFixed(1);
    const ok = r.code === 0;
    process.stdout.write(`${tty ? '\r' : ''}${ok ? '✓' : '✗'} ${s.name.padEnd(16)} ${sec.padStart(5)}s  ${s.summary(r.out)}\n`);
    if (!ok) console.log(r.out.split('\n').slice(-25).map(l => '    ' + l).join('\n'));
    results.push(ok);
  }
  const failed = results.filter(x => !x).length;
  if (failed) throw new Error(`回归未通过：${failed} 项失败`);
  console.log('\n✔ 回归全部通过');
});
