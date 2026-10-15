// Episode 与 Plugin 接口的唯一定义处。
//
// 一期视频 = episodes/<id>/episode.js 的默认导出：
//
//   export default defineEpisode({
//     id: '2026-W42-sound-flowers',          // 必须与目录名一致
//     title: '声音之花',
//     preset: 'vertical-9x16',               // presets/ 里的画幅
//     setup(env) → timeline,                 // 必填。可 async。构建时间轴（唯一数据源）
//     renderFrame(ctx, t, env),              // 必填。同步。画出时刻 t 的画面，只能依赖 t 和 env
//     renderAudio(ac, out, env),             // 可选。往 OfflineAudioContext 排声音，接到 out
//     fonts: { stylesheets, faces, text } | (env) => {...},   // 可选。渲染前必须加载好的字体
//     plugins: [progressBar(), ...],         // 可选。钩子型插件
//     cover: { t } | { render(ctx, env) },   // 可选。封面取哪一帧，或单独画
//   });
//
// env（运行时提供，只读）：
//   W, H           逻辑画布尺寸（预设的成片尺寸，例如 1080×1920）。renderFrame 一律按它绘制
//   width, height  实际输出像素（草稿时更小），scale = width / W，运行时已经帮你 setTransform
//   fps, frames, duration, draft, mode ('render' | 'preview' | 'cover')
//   preset, timeline, episode: { id, title }

export function defineEpisode(def) {
  const errs = [];
  if (!def || typeof def !== 'object') throw new Error('defineEpisode 需要一个对象');
  if (!/^[A-Za-z0-9_][A-Za-z0-9_-]*$/.test(def.id || '')) errs.push('id 必须是目录名（字母、数字、- 和 _）');
  if (!def.title) errs.push('缺少 title');
  if (!def.preset) errs.push('缺少 preset（例如 "vertical-9x16"）');
  if (typeof def.setup !== 'function') errs.push('缺少 setup(env) → timeline');
  if (typeof def.renderFrame !== 'function') errs.push('缺少 renderFrame(ctx, t, env)');
  if (def.renderAudio && typeof def.renderAudio !== 'function') errs.push('renderAudio 必须是函数');
  if (def.cover && !(typeof def.cover.t === 'number' || typeof def.cover.render === 'function')) errs.push('cover 需要 { t } 或 { render(ctx, env) }');
  for (const p of def.plugins || []) if (!p || !p.__plugin) errs.push('plugins 里的每一项都必须由 definePlugin() 创建');
  if (errs.length) throw new Error(`episode "${def.id}" 不合法：\n  - ` + errs.join('\n  - '));
  return Object.freeze({ plugins: [], ...def, __episode: true });
}

// 钩子型插件。所有钩子可选：
//   setup(env)                    渲染开始前调用一次，可 async（例如加载图片）
//   beforeFrame(ctx, t, env)      在 renderFrame 之前画（背景层）
//   afterFrame(ctx, t, env)       在 renderFrame 之后画（覆盖层：水印、进度条）
//   audio(ac, out, env)           往混音里加声音
//   fontText(env) → string        插件会画的文字，让运行时提前加载字形
// modes: ['render','preview','cover'] 的子集，只在这些模式下启用；默认全部启用。
export function definePlugin(def) {
  if (!def || !def.name) throw new Error('definePlugin 需要 name');
  const hooks = ['setup', 'beforeFrame', 'afterFrame', 'audio', 'fontText'];
  for (const h of hooks) if (def[h] && typeof def[h] !== 'function') throw new Error(`插件 ${def.name} 的 ${h} 必须是函数`);
  return Object.freeze({ ...def, __plugin: true });
}

/* ---------- 纯度守卫 ---------- */
// renderFrame / renderAudio / cover.render 执行期间，禁止读取真实时钟和全局随机数。
// 违反时立刻抛错，而不是悄悄渲染出每次都不一样的画面。

const BANNED = [
  ['Math', () => Math, 'random', '用 core/random.js 的 rng(seed) 或 noise1(seed, x)'],
  ['Date', () => Date, 'now', '画面只能依赖 t'],
  ['performance', () => globalThis.performance, 'now', '画面只能依赖 t'],
  ['window', () => globalThis, 'requestAnimationFrame', '由渲染器逐帧调用 renderFrame，不要自己驱动动画'],
];

export function withPurityGuard(where, fn) {
  const saved = [];
  for (const [label, getObj, key, hint] of BANNED) {
    const obj = getObj();
    if (!obj || typeof obj[key] !== 'function') continue;
    saved.push([obj, key, obj[key]]);
    obj[key] = () => { throw new Error(`${where} 里调用了 ${label}.${key}()：${hint}`); };
  }
  try {
    return fn();
  } finally {
    for (const [obj, key, orig] of saved) obj[key] = orig;
  }
}
