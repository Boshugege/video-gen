import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAssets, assetUrl, assetType } from '../core/assets.js';
import { audioEnvelope, envelopeAt } from '../core/audio.js';
import { fitRect } from '../plugins/images/index.js';

test('素材声明：字符串和对象两种写法', () => {
  const list = normalizeAssets({ photo: 'assets/a.JPG', bgm: { src: '/assets/bgm.mp3', license: 'CC0' }, x: { src: 'a.bin', type: 'audio' } });
  assert.deepEqual(list.map(a => [a.name, a.type, a.src, a.license]), [
    ['photo', 'image', 'assets/a.JPG', null],
    ['bgm', 'audio', '/assets/bgm.mp3', 'CC0'],
    ['x', 'audio', 'a.bin', null],
  ]);
  assert.deepEqual(normalizeAssets(undefined), []);
});

test('素材声明：非法写法会报错', () => {
  assert.throws(() => normalizeAssets({ 'a b': 'x.png' }), /素材名/);
  assert.throws(() => normalizeAssets({ a: 'https://example.com/x.png' }), /网络地址/);
  assert.throws(() => normalizeAssets({ a: '../other/x.png' }), /\.\./);
  assert.throws(() => normalizeAssets({ a: 'x.bin' }), /type/);
  assert.throws(() => normalizeAssets({ a: { src: 'x.png', sha256: 'abc' } }), /sha256/);
  assert.throws(() => normalizeAssets(['x.png']), /对象/);
});

test('素材路径：相对本期目录，或以 / 开头表示仓库根目录', () => {
  assert.equal(assetUrl('2026-W43-x', 'assets/a.png'), '/episodes/2026-W43-x/assets/a.png');
  assert.equal(assetUrl('2026-W43-x', './assets/a.png'), '/episodes/2026-W43-x/assets/a.png');
  assert.equal(assetUrl('2026-W43-x', '/assets/logo.png'), '/assets/logo.png');
  assert.equal(assetType('a.M4A'), 'audio');
  assert.equal(assetType('a.webp'), 'image');
  assert.equal(assetType('a.txt'), null);
});

test('音量包络与插值取值', () => {
  const sr = 1000;
  const data = new Float32Array(sr * 2);
  for (let i = sr; i < sr * 2; i++) data[i] = i % 2 ? 0.5 : -0.5; // 前 1 秒静音，后 1 秒 RMS 0.5
  const buf = { sampleRate: sr, duration: 2, numberOfChannels: 1, getChannelData: () => data };
  const e = audioEnvelope(buf, { rate: 10 });
  assert.equal(e.values.length, 20);
  assert.equal(e.values[5], 0);
  assert.equal(e.values[15], 0.5);
  assert.equal(envelopeAt(e, 0.5), 0);
  assert.equal(envelopeAt(e, 1.5), 0.5);
  assert.ok(Math.abs(envelopeAt(e, 0.95) - 0.25) < 1e-9);
  assert.equal(envelopeAt(e, 2.5, { loop: true }), envelopeAt(e, 0.5));
  assert.equal(envelopeAt({ rate: 10, values: [] }, 1), 0);
});

test('图片填充：cover 裁切、contain 留边', () => {
  const c = fitRect(1600, 1200, 1080, 1920, { fit: 'cover' });
  assert.ok(Math.abs(c.sh - 1200) < 1e-9);
  assert.ok(Math.abs(c.sw - 675) < 1e-9);
  assert.ok(Math.abs(c.sx - (1600 - 675) / 2) < 1e-9);
  const left = fitRect(1600, 1200, 1080, 1920, { fit: 'cover', focusX: 0 });
  assert.equal(left.sx, 0);
  const z = fitRect(1600, 1200, 1080, 1920, { fit: 'cover', zoom: 2 });
  assert.ok(Math.abs(z.sw - 337.5) < 1e-9);
  const k = fitRect(1600, 1200, 1080, 1920, { fit: 'contain' });
  assert.equal(k.dw, 1080);
  assert.equal(k.dh, 810);
  assert.equal(k.dy, (1920 - 810) / 2);
});
