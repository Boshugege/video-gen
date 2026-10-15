// 无头 Chromium 里的渲染页。Node 端（core/render/index.mjs）通过 window.__host 驱动它。
import { loadEpisode, createRuntime, frameTime } from '../runtime.js';
import { encodeWav, channelsOf } from '../audio.js';

const canvas = document.getElementById('cv');
let rt = null;

function bytesToBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

window.__host = {
  async init({ episode, mode = 'render', draft = false, burnSubtitles = false }) {
    const ep = await loadEpisode(episode);
    rt = await createRuntime(ep, { canvas, mode, draft, burnSubtitles });
    return rt.describe();
  },
  // 按帧号渲染，返回 PNG 的 data URL。
  async frames(indices) {
    const out = [];
    for (const i of indices) {
      await rt.drawFrameStable(frameTime(i, rt.env.fps));
      out.push(canvas.toDataURL('image/png'));
    }
    return out;
  },
  async audio({ sampleRate = 48000, bitDepth = 24 } = {}) {
    const buf = await rt.renderAudio(sampleRate);
    const ch = channelsOf(buf);
    let peak = 0;
    for (const c of ch) for (let i = 0; i < c.length; i++) { const a = Math.abs(c[i]); if (a > peak) peak = a; }
    return { wav: bytesToBase64(encodeWav(ch, sampleRate, { bitDepth })), peak, samples: buf.length, sampleRate };
  },
  async cover({ t = null } = {}) {
    await rt.drawCover(t);
    return canvas.toDataURL('image/png');
  },
  warnings: () => rt ? rt.warnings.slice() : [],
};
window.__hostReady = true;
