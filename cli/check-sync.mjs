// npm run check:sync -- <episode> [--draft] [--expect N]
// 解码成片，找出每次闪白（帧亮度突变）和每声嘀（音频起振），逐对比较时间差，要求全部 < 1 帧。
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, main } from './args.mjs';
import { outDirFor } from '../core/paths.mjs';
import { run, probe, videoFramePts, requireFfmpeg } from '../core/mux.mjs';

const GRID = 32;          // 亮度取样缩到 32×32
const LUMA_THRESHOLD = 128;
const SR = 48000;
const SILENCE_GAP = 0.3;  // 起振前至少 0.3 秒安静

async function flashOnsets(file) {
  const raw = await run('ffmpeg', ['-v', 'error', '-i', file, '-map', '0:v:0', '-vf', `scale=${GRID}:${GRID},format=gray`, '-f', 'rawvideo', '-'], { encoding: null });
  const px = GRID * GRID;
  const n = raw.length / px;
  const pts = await videoFramePts(file);
  if (pts.length !== n) throw new Error(`帧数不一致：PTS ${pts.length}，像素 ${n}`);
  const means = [];
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < px; j++) s += raw[i * px + j];
    means.push(s / px);
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    if (means[i] > LUMA_THRESHOLD && (i === 0 || means[i - 1] <= LUMA_THRESHOLD)) out.push({ frame: i, t: pts[i], luma: means[i] });
  }
  return { onsets: out, frames: n };
}

async function beepOnsets(file) {
  const info = await probe(file);
  const a = info.streams.find(s => s.codec_type === 'audio');
  if (!a) throw new Error('成片没有音频流');
  const start = +a.start_time || 0;
  const pcm = await run('ffmpeg', ['-v', 'error', '-i', file, '-map', '0:a:0', '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { encoding: null });
  const x = new Float32Array(new Uint8Array(pcm).buffer);
  let peak = 0;
  for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]));
  if (peak < 1e-3) throw new Error('音频是静音');
  const thr = peak * 0.3;
  const gap = SILENCE_GAP * SR;
  const out = [];
  let lastLoud = -Infinity;
  for (let i = 0; i < x.length; i++) {
    if (Math.abs(x[i]) > thr) {
      if (i - lastLoud > gap) out.push({ sample: i, t: start + i / SR });
      lastLoud = i;
    }
  }
  return { onsets: out, peak };
}

main(async () => {
  requireFfmpeg();
  const { positional, flags } = parseArgs();
  const id = positional[0] || '_sync-test';
  const dir = outDirFor(id, { draft: !!flags.draft });
  const file = path.join(dir, 'video.mp4');
  if (!fs.existsSync(file)) throw new Error(`找不到 ${path.relative(process.cwd(), file)}，先运行：npm run render -- ${id}${flags.draft ? ' --draft' : ''}`);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'render.json'), 'utf8'));
  const fps = manifest.fps;
  const frameMs = 1000 / fps;

  const [v, a] = await Promise.all([flashOnsets(file), beepOnsets(file)]);
  console.log(`▶ ${id}${flags.draft ? ' [草稿]' : ''} · ${fps}fps（1 帧 = ${frameMs.toFixed(2)} ms）· 闪白 ${v.onsets.length} 次 · 嘀声 ${a.onsets.length} 次`);
  console.log('   #   闪白帧   闪白时刻(s)   嘀声时刻(s)   差值(ms)   差值(帧)');

  const rows = v.onsets.map((f, k) => {
    const b = a.onsets.reduce((best, o) => (!best || Math.abs(o.t - f.t) < Math.abs(best.t - f.t) ? o : best), null);
    const d = b ? (b.t - f.t) * 1000 : NaN;
    return { k: k + 1, f, b, d };
  });
  for (const r of rows) {
    const ok = Math.abs(r.d) < frameMs;
    console.log(`  ${ok ? '✓' : '✗'} ${String(r.k).padStart(2)}   ${String(r.f.frame).padStart(5)}   ${r.f.t.toFixed(4).padStart(10)}   ${r.b ? r.b.t.toFixed(4).padStart(10) : '        —'}   ${r.d.toFixed(2).padStart(8)}   ${(r.d / frameMs).toFixed(3).padStart(7)}`);
  }

  const errs = [];
  if (!v.onsets.length) errs.push('没有检测到闪白');
  if (v.onsets.length !== a.onsets.length) errs.push(`闪白 ${v.onsets.length} 次，嘀声 ${a.onsets.length} 次，数量不一致`);
  if (flags.expect && v.onsets.length !== +flags.expect) errs.push(`期望 ${flags.expect} 次，实际 ${v.onsets.length} 次`);
  const worst = Math.max(...rows.map(r => Math.abs(r.d)));
  if (!(worst < frameMs)) errs.push(`最大差值 ${worst.toFixed(2)} ms ≥ 1 帧（${frameMs.toFixed(2)} ms）`);
  if (errs.length) throw new Error('同步检查未通过：' + errs.join('；'));
  console.log(`\n✔ 同步检查通过：${rows.length} 对，最大差值 ${worst.toFixed(2)} ms（${(worst / frameMs).toFixed(3)} 帧）< 1 帧`);
});
