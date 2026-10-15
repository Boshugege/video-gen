// 文字排版：单行自动缩小、多行折行（中日韩按字、拉丁文按词）。
export const meta = {
  name: 'text',
  kind: 'lib',
  description: '画布文字：超宽自动缩小字号、按宽度折行、从右往左书写',
  exports: ['drawText', 'wrapLines', 'drawParagraph', 'fontString'],
};

export const fontString = (size, family, weight = 500) => `${weight} ${size}px ${family}`;

// 单行文字。超过 maxWidth 时按 step 逐步缩小，最小到 minSize。
export function drawText(ctx, s, x, y, size, o = {}) {
  const {
    font = 'sans-serif', weight = 500, color = '#fff', alpha = 1, rtl = false,
    align = 'center', baseline = 'middle', maxWidth = Infinity, minSize = 20, step = 4,
  } = o;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.font = fontString(size, font, weight);
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  if (rtl) ctx.direction = 'rtl';
  let fs = size;
  while (ctx.measureText(s).width > maxWidth && fs > minSize) {
    fs -= step;
    ctx.font = fontString(fs, font, weight);
  }
  ctx.fillText(s, x, y);
  ctx.restore();
  return fs;
}

const CJK = /[　-鿿가-힯豈-﫿＀-￯]/;
const NO_LINE_START = /^[，。、；：？！）》」』】,.;:?!)\]}]/;

// 按当前 ctx.font 把文字折成不超过 maxWidth 的若干行。
export function wrapLines(ctx, s, maxWidth) {
  const tokens = [];
  for (const part of s.split(/(\s+)/)) {
    if (!part) continue;
    if (CJK.test(part)) tokens.push(...[...part]);
    else tokens.push(part);
  }
  const lines = [];
  let cur = '';
  for (const tok of tokens) {
    const next = cur + tok;
    if (cur && ctx.measureText(next.trimEnd()).width > maxWidth && !NO_LINE_START.test(tok)) {
      lines.push(cur.trimEnd());
      cur = tok.trimStart();
    } else {
      cur = next;
    }
  }
  if (cur.trim()) lines.push(cur.trimEnd());
  return lines;
}

// 多行段落，返回实际占用的高度。
export function drawParagraph(ctx, s, x, y, size, o = {}) {
  const { font = 'sans-serif', weight = 500, color = '#fff', alpha = 1, align = 'center', maxWidth = 900, lineHeight = 1.35 } = o;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.font = fontString(size, font, weight);
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  const lines = wrapLines(ctx, s, maxWidth);
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * size * lineHeight));
  ctx.restore();
  return lines.length * size * lineHeight;
}
