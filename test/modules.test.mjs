// 结构性检查：每一期都能在 Node 里 import、接口合法、id 与目录名一致；每个插件都有 meta。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { EPISODES_DIR, PLUGINS_DIR } from '../core/paths.mjs';
import { PRESETS } from '../presets/index.js';
import { defineEpisode, definePlugin, withPurityGuard } from '../core/episode.js';

const dirs = root => fs.readdirSync(root, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);

for (const id of dirs(EPISODES_DIR)) {
  const file = path.join(EPISODES_DIR, id, 'episode.js');
  if (!fs.existsSync(file)) continue;
  test(`episode ${id}`, async () => {
    const ep = (await import(pathToFileURL(file).href)).default;
    assert.ok(ep && ep.__episode, '默认导出必须是 defineEpisode(...)');
    assert.equal(ep.id, id, 'id 必须与目录名一致');
    assert.ok(PRESETS[ep.preset], `未知画幅 ${ep.preset}`);
  });
}

for (const d of dirs(PLUGINS_DIR)) {
  test(`plugin ${d}`, async () => {
    const mod = await import(pathToFileURL(path.join(PLUGINS_DIR, d, 'index.js')).href);
    assert.ok(mod.meta, '缺少 export const meta');
    assert.equal(mod.meta.name, d, 'meta.name 必须与目录名一致');
    assert.ok(['lib', 'hook'].includes(mod.meta.kind));
    for (const e of mod.meta.exports) assert.equal(typeof mod[e], 'function', `meta.exports 里的 ${e} 没有导出`);
  });
}

test('defineEpisode 会拒绝缺少必填项的定义', () => {
  assert.throws(() => defineEpisode({ id: 'x', title: 't', preset: 'vertical-9x16', setup() {} }), /renderFrame/);
  assert.throws(() => defineEpisode({ id: 'x y', title: 't', preset: 'p', setup() {}, renderFrame() {} }), /id/);
  assert.throws(() => defineEpisode({ id: 'x', title: 't', preset: 'p', setup() {}, renderFrame() {}, plugins: [{}] }), /definePlugin/);
  assert.throws(() => definePlugin({ name: 'p', afterFrame: 1 }), /函数/);
});

test('纯度守卫：渲染期间禁止 Math.random / Date.now，结束后恢复', () => {
  assert.throws(() => withPurityGuard('renderFrame', () => Math.random()), /Math\.random/);
  assert.throws(() => withPurityGuard('renderFrame', () => Date.now()), /Date\.now/);
  assert.equal(typeof Math.random(), 'number');
  assert.equal(withPurityGuard('x', () => 42), 42);
});
