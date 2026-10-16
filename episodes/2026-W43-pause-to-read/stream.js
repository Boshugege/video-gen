// 片段流的时间规则：每句正好 PER 帧（按 30fps 计），只在 stream 场景里走；定格和结尾不走。
// setup（排事件）、renderFrame（取当前句）、check-story.mjs（核对条数）都从这里取数，保证三者一致。
//
// 帧号一律用 Math.round(t * FPS) 换算：渲染器的 t 是 i / fps，草稿 15fps 时得到偶数帧号，
// 所以草稿会跳过一部分句子，但每一帧显示的句子和成片同一时刻完全相同。

export const FPS = 30;
export const PER = 3;        // 每句 3 帧
export const TOTAL = 540;    // 54 秒片段流
export const DEMO = 317;     // 定格示范句
export const ZH_MAX = 20;    // 中文每句最多字数（含标点）
export const EN_MAX = 72;    // 英文每句最多字符数

// 分镜：[场景 id, 时长（秒）, 是否走片段流]。片段流场景的总帧数必须正好是 TOTAL × PER。
export const SCENES = [
  ['intro', 3, true],
  ['demo', 3, true],
  ['freeze', 2, false],
  ['resume', 2, true],
  ['door', 26, true],
  ['open', 16, true],
  ['ending', 4, true],
  ['outro', 4, false],
];

const frames = s => Math.round(s * FPS);

// t 时刻在片段流里的帧号；不在片段流场景里时返回 -1。scenes 来自 timeline（带 start / end / data.stream）。
export function streamFrameAt(scenes, t) {
  const f = frames(t);
  let acc = 0;
  for (const s of scenes) {
    const a = frames(s.start), b = frames(s.end);
    if (f >= a && f < b) return s.data.stream ? acc + f - a : -1;
    if (s.data.stream) acc += b - a;
  }
  return -1;
}

// t 时刻显示第几句（0 起）；不在片段流里返回 -1。
export function lineIndexAt(scenes, t) {
  const sf = streamFrameAt(scenes, t);
  return sf < 0 ? -1 : Math.min(TOTAL - 1, Math.floor(sf / PER));
}

// 第 k 句（0 起）在成片里出现的时刻（秒）。
export function lineStartTime(scenes, k) {
  let need = k * PER;
  for (const s of scenes) {
    if (!s.data.stream) continue;
    const n = frames(s.end) - frames(s.start);
    if (need < n) return (frames(s.start) + need) / FPS;
    need -= n;
  }
  throw new Error(`第 ${k + 1} 句超出了片段流`);
}

export function streamFrameCount(scenes) {
  return scenes.filter(s => s.data.stream).reduce((n, s) => n + frames(s.end) - frames(s.start), 0);
}
