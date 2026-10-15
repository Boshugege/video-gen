// 与原型逐像素对比：node episodes/2026-W42-sound-flowers/verify-prototype.mjs
// 在同一个无头 Chromium 里，让原型（prototype/sound-flowers-v1.html 暴露的 window.__sf.drawFilm）
// 和新 episode 画同一时刻的帧，比较像素差异；并把"原型 | 新版 | 差异×8"拼图存到 out/<episode>/prototype-compare.png。
import fs from 'node:fs';
import path from 'node:path';
import { startServer } from '../../core/render/server.mjs';
import { launchBrowser, openHost, dataUrlToBuffer } from '../../core/render/browser.mjs';
import { outDirFor } from '../../core/paths.mjs';
import episode from './episode.js';

const ID = '2026-W42-sound-flowers';
const FRAMES = [30, 75, 147, 180, 261, 369, 630, 1128, 1344, 1380, 1500, 1605, 1656, 1722];

const server = await startServer();
const browser = await launchBrowser();
try {
  const host = await openHost(browser, server.url, { episode: ID, mode: 'render' });
  const fps = host.info.fps;
  const fontSpec = episode.fonts({ timeline: host.info.timeline });

  const proto = await browser.newPage();
  await proto.goto(`${server.url}/episodes/${ID}/prototype/sound-flowers-v1.html`);
  await proto.waitForFunction(() => !!window.__sf);
  await proto.evaluate(async ({ faces, text }) => {
    await Promise.all(faces.map(f => document.fonts.load(f, text)));
    await document.fonts.ready;
  }, fontSpec);

  const compare = await browser.newPage();
  await compare.goto(`${server.url}/core/render/host.html`);

  const ours = await host.frames(FRAMES);
  const rows = [];
  const tiles = [];
  for (let k = 0; k < FRAMES.length; k++) {
    const t = FRAMES[k] / fps;
    const theirs = await proto.evaluate(t => { window.__sf.drawFilm(t); return document.getElementById('cv').toDataURL('image/png'); }, t);
    const r = await compare.evaluate(diffImages, { a: theirs, b: ours[k] });
    rows.push({ t, ...r.stats });
    tiles.push(r.tile);
  }
  // 封面 vs 原型的静止海报
  const coverOurs = await host.cover({});
  const coverTheirs = await proto.evaluate(() => { window.__sf.drawPoster(); return document.getElementById('cv').toDataURL('image/png'); });
  const rc = await compare.evaluate(diffImages, { a: coverTheirs, b: coverOurs });
  rows.push({ t: 'cover', ...rc.stats });
  tiles.push(rc.tile);

  console.log('  时刻(s)   平均差(0-255)   最大差   差>8 的像素占比   PSNR(dB)');
  for (const r of rows) {
    const tt = typeof r.t === 'number' ? r.t.toFixed(3) : r.t;
    console.log(`  ${String(tt).padStart(7)}   ${r.mean.toFixed(4).padStart(12)}   ${String(r.max).padStart(6)}   ${(r.over8 * 100).toFixed(4).padStart(14)}%   ${r.psnr === Infinity ? '   ∞（完全相同）' : r.psnr.toFixed(1).padStart(8)}`);
  }
  const sheet = await compare.evaluate(stack, tiles);
  const dir = outDirFor(ID);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'prototype-compare.png'), dataUrlToBuffer(sheet));
  const worst = Math.min(...rows.map(r => r.psnr));
  const identical = rows.filter(r => r.max === 0).length;
  console.log(`\n${identical}/${rows.length} 帧逐像素完全相同；最低 PSNR ${worst === Infinity ? '∞' : worst.toFixed(1) + ' dB'}`);
  console.log(`对比拼图：${path.relative(process.cwd(), path.join(dir, 'prototype-compare.png'))}`);
  if (worst < 40) process.exitCode = 1;
} finally {
  await browser.close();
  await server.close();
}

// ---- 以下函数在浏览器里执行 ----

async function diffImages({ a, b }) {
  const load = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const [ia, ib] = await Promise.all([load(a), load(b)]);
  const w = ia.width, h = ia.height;
  const px = img => { const c = new OffscreenCanvas(w, h); const x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, w, h).data; };
  const da = px(ia), db = px(ib);
  const diff = new ImageData(w, h);
  let sum = 0, sq = 0, max = 0, over8 = 0;
  for (let i = 0; i < da.length; i += 4) {
    let m = 0;
    for (let c = 0; c < 3; c++) {
      const d = Math.abs(da[i + c] - db[i + c]);
      sum += d; sq += d * d; if (d > m) m = d;
    }
    if (m > max) max = m;
    if (m > 8) over8++;
    const v = Math.min(255, m * 8);
    diff.data[i] = v; diff.data[i + 1] = v; diff.data[i + 2] = v; diff.data[i + 3] = 255;
  }
  const n = w * h;
  const mse = sq / (n * 3);
  const s = 1 / 3, tw = Math.round(w * s), th = Math.round(h * s);
  const tile = new OffscreenCanvas(tw * 3 + 20, th);
  const tx = tile.getContext('2d');
  tx.fillStyle = '#000'; tx.fillRect(0, 0, tile.width, th);
  tx.drawImage(ia, 0, 0, tw, th);
  tx.drawImage(ib, tw + 10, 0, tw, th);
  const dc = new OffscreenCanvas(w, h); dc.getContext('2d').putImageData(diff, 0, 0);
  tx.drawImage(dc, (tw + 10) * 2, 0, tw, th);
  const blob = await tile.convertToBlob({ type: 'image/png' });
  const tileUrl = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
  return { stats: { mean: sum / (n * 3), max, over8: over8 / n, psnr: mse === 0 ? Infinity : 10 * Math.log10(255 * 255 / mse) }, tile: tileUrl };
}

async function stack(tiles) {
  const load = src => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = src; });
  const imgs = await Promise.all(tiles.map(load));
  const cols = 3;
  const w = imgs[0].width, h = imgs[0].height, gap = 16;
  const rows = Math.ceil(imgs.length / cols);
  const c = new OffscreenCanvas(cols * w + (cols - 1) * gap, rows * h + (rows - 1) * gap);
  const x = c.getContext('2d');
  x.fillStyle = '#222'; x.fillRect(0, 0, c.width, c.height);
  imgs.forEach((im, i) => x.drawImage(im, (i % cols) * (w + gap), Math.floor(i / cols) * (h + gap)));
  const blob = await c.convertToBlob({ type: 'image/png' });
  return new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
}
