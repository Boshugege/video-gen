// 时间轴：一期视频的唯一数据源。画面（renderFrame）、声音（renderAudio）、字幕（SRT）都只读它。
//
// Timeline 是可 JSON 序列化的纯数据，浏览器端和 Node 端共用：
// {
//   duration: 57.5,                                  // 秒
//   scenes:    [{ id, start, end, data }],            // 顺序排列、互不重叠
//   events:    [{ track, t, dur, data }],             // 点事件：音符、闪光、转场……按 t 排序
//   subtitles: [{ start, end, zh, en }],              // 双语字幕
//   markers:   [{ t, label }],                        // 预览页时间轴上的标记
//   data:      { ... }                                // episode 自定义载荷（例如句子列表）
// }

const EPS = 1e-6;

export function createTimeline() {
  const tl = { duration: 0, scenes: [], events: [], subtitles: [], markers: [], data: {} };
  let cursor = 0;
  const api = {
    get cursor() { return cursor; },
    // 在当前游标处追加一个场景，游标后移 dur 秒。
    scene(id, dur, data = {}) {
      if (!(dur > 0)) throw new Error(`场景 ${id} 的时长必须大于 0`);
      const s = { id, start: cursor, end: cursor + dur, data };
      tl.scenes.push(s);
      cursor += dur;
      return s;
    },
    gap(dur) { cursor += dur; return api; },
    event(track, t, data = {}, dur = 0) {
      tl.events.push({ track, t, dur, data });
      return api;
    },
    subtitle(start, end, { zh = '', en = '' } = {}) {
      tl.subtitles.push({ start, end, zh, en });
      return api;
    },
    marker(t, label) {
      tl.markers.push({ t, label });
      return api;
    },
    // duration 默认等于最后一个场景的结束时间。
    build({ duration, data } = {}) {
      tl.duration = duration ?? cursor;
      if (data) tl.data = data;
      tl.events.sort((a, b) => a.t - b.t);
      tl.subtitles.sort((a, b) => a.start - b.start);
      tl.markers.sort((a, b) => a.t - b.t);
      validateTimeline(tl);
      return tl;
    },
  };
  return api;
}

export function validateTimeline(tl) {
  const errs = [];
  if (!(tl && tl.duration > 0)) errs.push('duration 必须大于 0');
  let prevEnd = 0;
  for (const s of tl.scenes || []) {
    if (!(s.end > s.start)) errs.push(`场景 ${s.id}：end 必须大于 start`);
    if (s.start < prevEnd - EPS) errs.push(`场景 ${s.id} 与上一个场景重叠`);
    if (s.end > tl.duration + EPS) errs.push(`场景 ${s.id} 超出总时长`);
    prevEnd = s.end;
  }
  for (const c of tl.subtitles || []) {
    if (!(c.end > c.start)) errs.push(`字幕 "${c.zh || c.en}"：end 必须大于 start`);
  }
  for (const e of tl.events || []) {
    if (!(e.t >= 0)) errs.push(`事件 ${e.track} 的 t 必须 ≥ 0`);
  }
  try { JSON.stringify(tl); } catch (e) { errs.push('timeline 必须可 JSON 序列化：' + e.message); }
  if (errs.length) throw new Error('timeline 不合法：\n  - ' + errs.join('\n  - '));
  return tl;
}

/* ---------- 秒 ↔ 帧 ---------- */

// 第 f 帧的时刻。渲染器只用这一个公式算 t，保证画面与声音的时间轴一致。
export const frameToSec = (f, fps) => f / fps;
// 时刻 s 落在哪一帧（向下取整，带浮点容差）。
export const secToFrame = (s, fps) => Math.floor(s * fps + EPS);
// 覆盖 duration 秒需要的帧数。成片的真实时长 = frameCount / fps。
export const frameCount = (duration, fps) => Math.ceil(duration * fps - EPS);

// 12.4 秒 @30fps → "00:12:12"（分:秒:帧）
export function timecode(s, fps) {
  const f = secToFrame(s, fps);
  const sec = Math.floor(f / fps);
  const ff = f - sec * fps;
  const p = n => String(n).padStart(2, '0');
  return `${p(Math.floor(sec / 60))}:${p(sec % 60)}:${p(ff)}`;
}

/* ---------- 查询 ---------- */

// 返回 t 所在的场景，以及场景内的本地时间 u（秒）和进度 p（0..1）。t 超过末尾时归入最后一个场景。
export function sceneAt(tl, t) {
  const ss = tl.scenes;
  for (let i = 0; i < ss.length; i++) {
    const s = ss[i];
    if (t >= s.start - EPS && t < s.end - EPS) return { scene: s, index: i, u: t - s.start, p: (t - s.start) / (s.end - s.start) };
  }
  if (ss.length && t >= ss[ss.length - 1].end - EPS) {
    const i = ss.length - 1, s = ss[i];
    return { scene: s, index: i, u: t - s.start, p: 1 };
  }
  return null;
}

export const sceneById = (tl, id) => tl.scenes.find(s => s.id === id) || null;

export const eventsOn = (tl, track) => tl.events.filter(e => e.track === track);

// [t0, t1) 内的事件。
export const eventsBetween = (tl, track, t0, t1) =>
  tl.events.filter(e => (!track || e.track === track) && e.t >= t0 - EPS && e.t < t1 - EPS);

export const subtitleAt = (tl, t) =>
  tl.subtitles.find(c => t >= c.start - EPS && t < c.end - EPS) || null;
