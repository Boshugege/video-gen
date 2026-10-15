// 离线声音合成：OfflineAudioContext 封装、音阶、包络、带种子的混响、WAV 编码。
// 渲染器和预览页都用 renderOffline() 生成同一份混音，所以预览听到的就是成片里的声音。
// 模块顶层不碰 DOM / Web Audio，Node 端也能 import（例如 encodeWav、单元测试）。

import { rng } from './random.js';

export const SAMPLE_RATE = 48000;

// 渲染一段精确长度的混音。schedule(ac, out) 负责排声音，可 async。
// length 按 frames/fps 换算成采样数，保证音频与视频一样长。
export async function renderOffline({ duration, sampleRate = SAMPLE_RATE, channels = 2 }, schedule) {
  const length = Math.max(1, Math.round(duration * sampleRate));
  const ac = new OfflineAudioContext({ numberOfChannels: channels, length, sampleRate });
  await schedule(ac, ac.destination);
  return ac.startRendering();
}

/* ---------- 音高 ---------- */

export const SCALES = Object.freeze({
  majorPentatonic: [0, 2, 4, 7, 9],
  minorPentatonic: [0, 3, 5, 7, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
});

export const midiToFreq = m => 440 * Math.pow(2, (m - 69) / 12);

// "C4" / "F#3" / "Bb5" → MIDI 号
export function noteToMidi(name) {
  const m = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(name.trim());
  if (!m) throw new Error(`无法解析音名 ${name}`);
  const base = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[m[1].toLowerCase()];
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return (+m[3] + 1) * 12 + base + acc;
}

// 第 degree 级（可超过音阶长度，自动进八度）→ MIDI。
export function scaleMidi(root, scale, degree) {
  const s = typeof scale === 'string' ? SCALES[scale] : scale;
  const r = typeof root === 'string' ? noteToMidi(root) : root;
  const oct = Math.floor(degree / s.length);
  return r + oct * 12 + s[((degree % s.length) + s.length) % s.length];
}

/* ---------- 包络 ---------- */

// 在 AudioParam 上写一个 ADSR，返回声音完全结束的时刻。
// hold：从起音到开始释放的时长（≈ 音符时值）。
export function adsr(param, at, { peak = 1, attack = 0.01, decay = 0.1, sustain = 0.6, hold = 0.2, release = 0.3 } = {}) {
  const floor = 1e-4;
  const s = Math.max(floor, peak * sustain);
  param.setValueAtTime(0, at);
  param.linearRampToValueAtTime(peak, at + attack);
  param.exponentialRampToValueAtTime(s, at + attack + decay);
  const relAt = Math.max(at + attack + decay, at + hold);
  param.setValueAtTime(s, relAt);
  param.exponentialRampToValueAtTime(floor, relAt + release);
  param.setValueAtTime(0, relAt + release);
  return relAt + release;
}

// 最基础的音：固定频率、短起音、短释放。同步测试的"嘀"声就用它。
export function tone(ac, out, { at, freq = 1000, dur = 0.1, type = 'sine', gain = 0.5, attack = 0.002, release = 0.01 }) {
  const o = ac.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  const g = ac.createGain();
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(gain, at + attack);
  g.gain.setValueAtTime(gain, at + dur - release);
  g.gain.linearRampToValueAtTime(0, at + dur);
  o.connect(g).connect(out);
  o.start(at);
  o.stop(at + dur + 0.01);
  return g;
}

/* ---------- 混响 ---------- */

// 指数衰减的白噪声冲激响应。用种子生成，每次渲染完全一样。
export function noiseIR(ac, { seconds = 2.6, decay = 2.4, seed = 1, channels = 2 } = {}) {
  const len = Math.round(ac.sampleRate * seconds);
  const ir = ac.createBuffer(channels, len, ac.sampleRate);
  const rand = rng(seed);
  for (let c = 0; c < channels; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (rand() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return ir;
}

// 常用的"房间"总线：input → (干声 + 卷积混响) → 压缩器 → out。返回 input 节点，音符都接到它上面。
export function createRoom(ac, out, { master = 0.9, dry = 0.75, wet = 0.45, seconds = 2.6, decay = 2.4, seed = 1, compressor = true } = {}) {
  const input = ac.createGain();
  input.gain.value = master;
  const dryG = ac.createGain(); dryG.gain.value = dry;
  const wetG = ac.createGain(); wetG.gain.value = wet;
  const conv = ac.createConvolver();
  conv.buffer = noiseIR(ac, { seconds, decay, seed });
  const sink = compressor ? ac.createDynamicsCompressor() : ac.createGain();
  input.connect(dryG);
  input.connect(conv);
  conv.connect(wetG);
  dryG.connect(sink);
  wetG.connect(sink);
  sink.connect(out);
  return input;
}

/* ---------- WAV ---------- */

export function channelsOf(audioBuffer) {
  const out = [];
  for (let c = 0; c < audioBuffer.numberOfChannels; c++) out.push(audioBuffer.getChannelData(c));
  return out;
}

// Float32 声道数组 → WAV 文件字节。bitDepth: 16 | 24 | 32（32 为浮点）。
export function encodeWav(channels, sampleRate, { bitDepth = 24 } = {}) {
  const nch = channels.length;
  const n = channels[0].length;
  const bps = bitDepth / 8;
  const isFloat = bitDepth === 32;
  const dataSize = n * nch * bps;
  const buf = new ArrayBuffer(44 + dataSize);
  const v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + dataSize, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true);
  v.setUint16(20, isFloat ? 3 : 1, true);
  v.setUint16(22, nch, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * nch * bps, true);
  v.setUint16(32, nch * bps, true);
  v.setUint16(34, bitDepth, true);
  str(36, 'data'); v.setUint32(40, dataSize, true);
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < nch; c++) {
      const x = Math.max(-1, Math.min(1, channels[c][i]));
      if (isFloat) { v.setFloat32(o, x, true); }
      else if (bitDepth === 16) { v.setInt16(o, Math.round(x * 32767), true); }
      else {
        const s = Math.round(x * 8388607);
        v.setUint8(o, s & 0xff); v.setUint8(o + 1, (s >> 8) & 0xff); v.setUint8(o + 2, (s >> 16) & 0xff);
      }
      o += bps;
    }
  }
  return new Uint8Array(buf);
}
