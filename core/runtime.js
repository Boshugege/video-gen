// 浏览器端运行时：加载 episode、建立 env、按 t 画帧、生成混音。
// 渲染器（core/render/host.js）和预览页（core/preview/）共用它，所以预览看到的就是成片。

import { getPreset, outputSpec } from '../presets/index.js';
import { withPurityGuard } from './episode.js';
import { validateTimeline, frameCount, frameToSec } from './timeline.js';
import { loadFonts, fontsBusy } from './fonts.js';
import { renderOffline, SAMPLE_RATE } from './audio.js';
import { drawSubtitles, subtitleText } from './subtitles.js';
import { loadAssets } from './assets.js';

const ID_RE = /^[A-Za-z0-9_][A-Za-z0-9_-]*$/;

export async function loadEpisode(id, { cacheBust } = {}) {
  if (!ID_RE.test(id || '')) throw new Error(`episode 名不合法：${id}`);
  const url = `/episodes/${id}/episode.js${cacheBust ? `?v=${cacheBust}` : ''}`;
  let mod;
  try {
    mod = await import(url);
  } catch (e) {
    throw new Error(`加载 ${url} 失败：${e.message}`);
  }
  const ep = mod.default;
  if (!ep || !ep.__episode) throw new Error(`episodes/${id}/episode.js 的默认导出必须是 defineEpisode({...})`);
  if (ep.id !== id) throw new Error(`episode.id "${ep.id}" 必须与目录名 "${id}" 一致`);
  return ep;
}

// opts: { canvas, mode: 'render'|'preview', draft, burnSubtitles }
export async function createRuntime(ep, { canvas, mode = 'render', draft = false, burnSubtitles = false } = {}) {
  const preset = getPreset(ep.preset);
  const spec = outputSpec(preset, { draft });
  canvas.width = spec.width;
  canvas.height = spec.height;
  // alpha:false：画布不透明，导出的 PNG 是 RGB，编码更快。
  const ctx = canvas.getContext('2d', { alpha: false });

  const base = {
    W: preset.width,
    H: preset.height,
    width: spec.width,
    height: spec.height,
    scale: spec.width / preset.width,
    fps: spec.fps,
    draft,
    mode,
    preset,
    episode: { id: ep.id, title: ep.title },
    // 素材在 setup 之前加载完：setup 里就能用配音时长排场景。
    assets: await loadAssets(ep.assets, { episodeId: ep.id, sampleRate: preset.encode.sampleRate }),
  };
  const timeline = deepFreeze(validateTimeline(await ep.setup(Object.freeze({ ...base }))));
  const frames = frameCount(timeline.duration, base.fps);
  const env = Object.freeze({ ...base, timeline, frames, duration: frames / base.fps, plannedDuration: timeline.duration });

  const plugins = ep.plugins;
  const active = m => plugins.filter(p => !p.modes || p.modes.includes(m));

  const fontSpec = typeof ep.fonts === 'function' ? ep.fonts(env) : ep.fonts;
  const extraText = active(mode).map(p => (p.fontText ? p.fontText(env) : '')).join('') + (burnSubtitles ? subtitleText(timeline) : '');
  if (fontSpec || extraText) await loadFonts({ ...(fontSpec || {}), text: ((fontSpec && fontSpec.text) || '') + extraText });
  for (const p of plugins) if (p.setup) await p.setup(env);

  const warnings = [];

  function paint(where, fn) {
    ctx.reset();
    ctx.setTransform(env.scale, 0, 0, env.scale, 0, 0);
    withPurityGuard(where, fn);
  }

  function layered(fnEnv, t, draw) {
    for (const p of active(fnEnv.mode)) if (p.beforeFrame) { ctx.save(); p.beforeFrame(ctx, t, fnEnv); ctx.restore(); }
    ctx.save(); draw(); ctx.restore();
    for (const p of active(fnEnv.mode)) if (p.afterFrame) { ctx.save(); p.afterFrame(ctx, t, fnEnv); ctx.restore(); }
    if (burnSubtitles) drawSubtitles(ctx, t, fnEnv);
  }

  function drawFrame(t, fnEnv = env) {
    paint(`renderFrame(t=${t.toFixed(4)})`, () => layered(fnEnv, t, () => ep.renderFrame(ctx, t, fnEnv)));
  }

  // 画完发现浏览器在加载新字形 → 等字体到位后重画，并记录警告（应把这些文字加进 fonts.text）。
  async function stable(t, draw) {
    draw();
    if (fontsBusy()) {
      await document.fonts.ready;
      warnings.push(`t=${t.toFixed(3)} 用到了未预加载的字形，已等待字体后重画。请把相关文字加进 fonts.text`);
      draw();
    }
  }

  const coverEnv = Object.freeze({ ...env, mode: 'cover' });
  const coverT = ep.cover && typeof ep.cover.t === 'number' ? ep.cover.t : Math.round(env.duration * 0.25 * env.fps) / env.fps;

  return {
    env,
    ctx,
    canvas,
    warnings,
    drawFrame,
    drawFrameStable: t => stable(t, () => drawFrame(t)),
    // t 省略时：有 cover.render 就用它，否则取 cover.t。
    async drawCover(t) {
      if (t == null && ep.cover && ep.cover.render) {
        return stable(0, () => paint('cover.render', () => ep.cover.render(ctx, coverEnv)));
      }
      const ct = t == null ? coverT : t;
      return stable(ct, () => drawFrame(ct, coverEnv));
    },
    async renderAudio(sampleRate = SAMPLE_RATE) {
      return renderOffline({ duration: env.duration, sampleRate }, (ac, out) =>
        withPurityGuard('renderAudio', () => {
          if (ep.renderAudio) ep.renderAudio(ac, out, env);
          for (const p of active(mode)) if (p.audio) p.audio(ac, out, env);
        }));
    },
    describe() {
      return {
        id: ep.id,
        title: ep.title,
        preset: preset.id,
        W: env.W,
        H: env.H,
        width: env.width,
        height: env.height,
        fps: env.fps,
        frames: env.frames,
        duration: env.duration,
        plannedDuration: env.plannedDuration,
        draft,
        coverT: ep.cover && ep.cover.render ? null : coverT,
        safeArea: preset.safeArea,
        encode: preset.encode,
        plugins: plugins.map(p => p.name),
        hasAudio: !!ep.renderAudio || plugins.some(p => p.audio),
        assets: env.assets.manifest(),
        timeline,
      };
    },
  };
}

export const frameTime = (i, fps) => frameToSec(i, fps);

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const k of Object.keys(o)) deepFreeze(o[k]);
  }
  return o;
}
