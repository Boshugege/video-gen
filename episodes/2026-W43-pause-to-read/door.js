// 一扇单线条的门：正常速度观看时能看到的那一层。
// 先画地平线、门框、门板（draw），门缝透光（crack），门向里打开（open），门洞里的光越来越亮（light）。
// 只画装饰层；文字由 episode.js 画在最上面。所有参数都是 0..1，只由 t 算出。
import { clamp, lerp } from '../../plugins/motion/index.js';

export const DOOR = { x0: 176, x1: 904, y0: 420, y1: 1440 };
const FRAME = 16;                  // 门框比门板外扩的距离
const LINE = '244,241,234';
const LIGHT = '255,216,160';
const BG = '#050505';
const MAX_ANGLE = (84 * Math.PI) / 180;

const rgba = (c, a) => `rgba(${c},${a})`;

// 要按顺序画出来的线：地平线 → 门框 → 门板。
function strokes() {
  const { x0, x1, y0, y1 } = DOOR;
  return [
    [[90, y1], [990, y1]],
    [[x0 - FRAME, y1], [x0 - FRAME, y0 - FRAME], [x1 + FRAME, y0 - FRAME], [x1 + FRAME, y1]],
    [[x0, y1], [x0, y0], [x1, y0], [x1, y1]],
  ];
}

const segLen = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const TOTAL_LEN = strokes().reduce((n, pts) => n + pts.slice(1).reduce((m, p, i) => m + segLen(pts[i], p), 0), 0);

// 按总长度画出前 p 部分，最后几条线可以不画（skipLast）。
function drawStrokes(ctx, p, { skipLast = false } = {}) {
  let left = p * TOTAL_LEN;
  const list = strokes();
  list.forEach((pts, si) => {
    if (left <= 0) return;
    const skip = skipLast && si === list.length - 1;
    if (!skip) {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
    }
    for (let i = 1; i < pts.length && left > 0; i++) {
      const L = segLen(pts[i - 1], pts[i]);
      const f = Math.min(1, left / L);
      if (!skip) ctx.lineTo(lerp(pts[i - 1][0], pts[i][0], f), lerp(pts[i - 1][1], pts[i][1], f));
      left -= L;
    }
    if (!skip) ctx.stroke();
  });
}

// 门板四个角（向里开，铰链在左边，越开越窄、远端越短）。
function panelQuad(open) {
  const { x0, x1, y0, y1 } = DOOR;
  const th = open * MAX_ANGLE;
  const xe = x0 + (x1 - x0) * Math.cos(th);
  const shrink = 46 * Math.sin(th);
  return [[x0, y0], [xe, y0 + shrink], [xe, y1 - shrink], [x0, y1]];
}

function drawKnob(ctx, open, alpha) {
  if (alpha <= 0) return;
  const q = panelQuad(open);
  const f = 0.955;
  const x = lerp(q[0][0], q[1][0], f);
  const y = lerp((q[0][1] + q[3][1]) / 2, (q[1][1] + q[2][1]) / 2, f) + 200;  // 放在文字块下方，开门时不会扫过文字
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.beginPath();
  ctx.arc(x, y, 10 * (0.55 + 0.45 * Math.cos(open * MAX_ANGLE)), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export function drawDoor(ctx, { draw = 0, crack = 0, open = 0, light = 0, H = 1920 } = {}) {
  if (draw <= 0) return;
  const { x0, x1, y0, y1 } = DOOR;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // 1. 门洞里和门前地面的光（之后用门板挡住没打开的部分）
  if (light > 0) {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, rgba(LIGHT, 0.08 * light));
    g.addColorStop(1, rgba(LIGHT, 0.3 * light));
    ctx.fillStyle = g;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    const q = panelQuad(open);
    const xe = q[1][0];
    const spread = 260 * light;
    const f = ctx.createLinearGradient(0, y1, 0, H);
    f.addColorStop(0, rgba(LIGHT, 0.34 * light));
    f.addColorStop(1, rgba(LIGHT, 0));
    ctx.fillStyle = f;
    ctx.beginPath();
    ctx.moveTo(xe, y1);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x1 + spread, H);
    ctx.lineTo(xe - spread * 0.4, H);
    ctx.closePath();
    ctx.fill();
  }

  // 2. 门缝的光：门板右边一条亮线，地面一道微光
  if (crack > 0 && open < 1) {
    const a = crack * (1 - clamp(open * 3));
    ctx.save();
    ctx.shadowColor = rgba(LIGHT, 0.9 * a);
    ctx.shadowBlur = 18;
    ctx.strokeStyle = rgba(LIGHT, 0.85 * a);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x1 - 3, y0 + 4);
    ctx.lineTo(x1 - 3, y1 - 2);
    ctx.stroke();
    ctx.strokeStyle = rgba(LIGHT, 0.5 * a);
    ctx.beginPath();
    ctx.moveTo(x0 + 10, y1 + 4);
    ctx.lineTo(x1, y1 + 4);
    ctx.stroke();
    ctx.restore();
  }

  // 3. 线稿：门开始打开以后，门板改画成透视的四边形
  ctx.strokeStyle = rgba(LINE, 0.78);
  ctx.lineWidth = 4;
  drawStrokes(ctx, draw, { skipLast: open > 0 });
  if (open > 0) {
    const q = panelQuad(open);
    ctx.fillStyle = BG;
    ctx.beginPath();
    q.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  drawKnob(ctx, open, clamp((draw - 0.97) / 0.03));
  ctx.restore();
}
