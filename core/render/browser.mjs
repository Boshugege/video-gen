// Playwright 无头 Chromium 的启动与渲染页管理（Node）。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { CACHE_DIR } from '../paths.mjs';

const FONT_HOSTS = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//;
const HTTP_CACHE = path.join(CACHE_DIR, 'http');

export async function launchBrowser() {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    throw new Error('没有找到 playwright。请运行：npm run setup');
  }
  try {
    return await chromium.launch({ headless: true });
  } catch (e) {
    throw new Error(`无法启动 Chromium（${e.message.split('\n')[0]}）。请运行：npx playwright install chromium`);
  }
}

// Google Fonts 请求落盘缓存：第一次渲染联网下载，之后完全离线、结果一致。
async function routeFontCache(context) {
  fs.mkdirSync(HTTP_CACHE, { recursive: true });
  await context.route(FONT_HOSTS, async route => {
    const url = route.request().url();
    const key = crypto.createHash('sha1').update(url).digest('hex');
    const body = path.join(HTTP_CACHE, key + '.bin');
    const meta = path.join(HTTP_CACHE, key + '.json');
    if (fs.existsSync(body) && fs.existsSync(meta)) {
      const m = JSON.parse(fs.readFileSync(meta, 'utf8'));
      return route.fulfill({ status: 200, headers: m.headers, body: fs.readFileSync(body) });
    }
    const resp = await route.fetch();
    const buf = await resp.body();
    if (resp.ok()) {
      const h = resp.headers();
      const headers = { 'content-type': h['content-type'] || 'application/octet-stream', 'access-control-allow-origin': '*' };
      fs.writeFileSync(body, buf);
      fs.writeFileSync(meta, JSON.stringify({ url, headers }));
    }
    return route.fulfill({ response: resp, body: buf });
  });
}

// 打开一个渲染页并初始化 episode。每个渲染页用独立的 context，保证落在独立的渲染进程里并行。
export async function openHost(browser, baseUrl, initOpts) {
  const context = await browser.newContext({ viewport: { width: 400, height: 400 }, deviceScaleFactor: 1 });
  await routeFontCache(context);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e));
  page.on('console', m => { if (m.type() === 'error') errors.push(new Error(m.text())); });
  await page.goto(`${baseUrl}/core/render/host.html`);
  await page.waitForFunction(() => window.__hostReady === true, null, { timeout: 30000 }).catch(() => {
    throw new Error('渲染页没有就绪：' + (errors.map(e => e.message).join('; ') || '未知原因'));
  });
  const info = await page.evaluate(o => window.__host.init(o), initOpts);
  return {
    page,
    info,
    frames: indices => page.evaluate(ix => window.__host.frames(ix), indices),
    audio: opts => page.evaluate(o => window.__host.audio(o), opts),
    cover: opts => page.evaluate(o => window.__host.cover(o), opts),
    warnings: () => page.evaluate(() => window.__host.warnings()),
    close: () => context.close(),
  };
}

export const dataUrlToBuffer = s => Buffer.from(s.slice(s.indexOf(',') + 1), 'base64');
