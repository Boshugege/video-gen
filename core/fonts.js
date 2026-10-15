// 字体加载与校验（浏览器端）。
// 确定性渲染的前提：第 0 帧之前，所有要画的字形都已经下载好。否则前几帧会用回退字体，各个并行渲染页也会不一致。
//
// spec = {
//   stylesheets: ['https://fonts.googleapis.com/css2?family=...'],   // @font-face 来源
//   faces: ['700 80px "Noto Serif SC"', '400 32px "IBM Plex Mono"'], // 用到的字重/字族组合（字号随意）
//   text: '会画到画面上的所有文字',                                    // Google Fonts 按 unicode-range 分片，只下载这些字用到的分片
// }
// 渲染器会把 Google Fonts 的请求缓存到 .cache/http/，第二次渲染起不再依赖网络。

export async function loadFonts(spec, { timeoutMs = 30000 } = {}) {
  if (!spec) return { faces: 0 };
  const { stylesheets = [], faces = [], text = '' } = spec;
  for (const href of stylesheets) await addStylesheet(href, timeoutMs);
  const sample = uniqueChars(text + 'AaBb0123');
  const results = await withTimeout(
    Promise.all(faces.map(async f => ({ face: f, loaded: await document.fonts.load(f, sample) }))),
    timeoutMs,
    '字体加载超时',
  );
  const missing = results.filter(r => !r.loaded.length).map(r => r.face);
  if (missing.length) {
    throw new Error(`这些字体没有可用的 @font-face（检查 stylesheets 和字族名）：\n  ${missing.join('\n  ')}`);
  }
  await document.fonts.ready;
  return { faces: results.reduce((n, r) => n + r.loaded.length, 0) };
}

export function uniqueChars(s) {
  return [...new Set([...s])].join('');
}

// 绘制后如果浏览器又开始加载字体，说明某一帧用到了没预加载的字形。
export const fontsBusy = () => document.fonts.status === 'loading';

function addStylesheet(href, timeoutMs) {
  if ([...document.styleSheets].some(s => s.href === href)) return Promise.resolve();
  return withTimeout(new Promise((resolve, reject) => {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = href;
    l.onload = () => resolve();
    l.onerror = () => reject(new Error(`字体样式表加载失败：${href}`));
    document.head.appendChild(l);
  }), timeoutMs, `字体样式表加载超时：${href}`);
}

function withTimeout(p, ms, msg) {
  let timer;
  return Promise.race([p, new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(msg)), ms); })]).finally(() => clearTimeout(timer));
}
