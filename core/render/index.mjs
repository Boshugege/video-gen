// 离线逐帧渲染的总调度（Node）。
//
//   静态服务 → N 个无头 Chromium 渲染页（各自加载同一个 episode）
//   → 主页面用 OfflineAudioContext 生成 audio.wav（长度 = 帧数 / fps）
//   → 各页面并行画帧（renderFrame 只依赖 t，所以可以乱序算），按帧号顺序把 PNG 管道给 ffmpeg
//   → ffprobe 校验 → subtitles.srt、cover.png、render.json
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, EPISODES_DIR, outDirFor } from '../paths.mjs';
import { startServer } from './server.mjs';
import { launchBrowser, openHost, dataUrlToBuffer } from './browser.mjs';
import { requireFfmpeg, encodeArgs, startEncoder, verifyOutput, formatChecks } from '../mux.mjs';
import { toSRT } from '../subtitles.js';
import { exportCover } from '../cover.mjs';

const CHUNK = 4; // 每个渲染页一次领取的帧数

export function defaultWorkers() {
  const cpus = os.availableParallelism ? os.availableParallelism() : os.cpus().length;
  return Math.max(1, Math.min(6, cpus - 2));
}

function gitInfo() {
  try {
    const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() !== '';
    return { commit, dirty };
  } catch {
    return null;
  }
}

export function assertEpisodeExists(id) {
  if (!id) throw new Error('请指定 episode，例如：npm run render -- 2026-W42-sound-flowers');
  if (!fs.existsSync(path.join(EPISODES_DIR, id, 'episode.js'))) {
    const list = fs.readdirSync(EPISODES_DIR).filter(d => fs.existsSync(path.join(EPISODES_DIR, d, 'episode.js')));
    throw new Error(`找不到 episodes/${id}/episode.js。现有：${list.join(', ')}`);
  }
}

// opts: { draft, workers, burnSubtitles, coverT, log }
export async function renderEpisode(id, opts = {}) {
  const { draft = false, burnSubtitles = false, coverT = null, log = console.log } = opts;
  assertEpisodeExists(id);
  requireFfmpeg();
  const outDir = outDirFor(id, { draft });
  fs.mkdirSync(outDir, { recursive: true });
  const files = {
    video: path.join(outDir, 'video.mp4'),
    audio: path.join(outDir, 'audio.wav'),
    srt: path.join(outDir, 'subtitles.srt'),
    cover: path.join(outDir, 'cover.png'),
    manifest: path.join(outDir, 'render.json'),
  };
  const started = Date.now();
  const server = await startServer();
  const browser = await launchBrowser();
  let enc = null;
  try {
    const initOpts = { episode: id, mode: 'render', draft, burnSubtitles };
    const main = await openHost(browser, server.url, initOpts);
    const info = main.info;
    log(`▶ ${info.title}（${id}）${draft ? ' [草稿]' : ''}`);
    log(`  ${info.preset} · ${info.width}×${info.height} @ ${info.fps}fps · ${info.frames} 帧 · ${info.duration.toFixed(3)}s`);

    // 声音：与画面同一条时间轴，长度精确到帧。
    const a = await main.audio({ sampleRate: info.encode.sampleRate, bitDepth: 24 });
    fs.writeFileSync(files.audio, Buffer.from(a.wav, 'base64'));
    const expectSamples = Math.round(info.duration * a.sampleRate);
    if (a.samples !== expectSamples) throw new Error(`音频长度 ${a.samples} 采样，应为 ${expectSamples}`);
    log(`  ♪ audio.wav  ${a.samples} 采样 @ ${a.sampleRate}Hz，峰值 ${a.peak.toFixed(3)}${a.peak > 1 ? '（⚠ 削波）' : ''}`);

    // 并行渲染页
    const n = Math.max(1, Math.min(opts.workers || defaultWorkers(), Math.ceil(info.frames / CHUNK)));
    const extra = await Promise.all(Array.from({ length: n - 1 }, () => openHost(browser, server.url, initOpts)));
    const hosts = [main, ...extra];
    for (const h of extra) {
      if (h.info.frames !== info.frames || JSON.stringify(h.info.timeline) !== JSON.stringify(info.timeline)) {
        throw new Error('各渲染页的 setup() 结果不一致：setup 也必须是确定性的');
      }
    }
    log(`  ⚙ ${n} 个渲染页并行`);

    enc = startEncoder(encodeArgs({ fps: info.fps, width: info.width, height: info.height, audio: files.audio, out: files.video, encode: info.encode, title: info.title }));

    const per = n * CHUNK;
    const batches = Math.ceil(info.frames / per);
    const renderBatch = async b => {
      const start = b * per;
      const end = Math.min(info.frames, start + per);
      const jobs = [];
      for (let k = 0; k < n; k++) {
        const s = start + k * CHUNK;
        if (s >= end) break;
        const ix = [];
        for (let i = s; i < Math.min(end, s + CHUNK); i++) ix.push(i);
        jobs.push(hosts[k].frames(ix));
      }
      return (await Promise.all(jobs)).flat().map(dataUrlToBuffer);
    };

    const tty = process.stdout.isTTY;
    let done = 0;
    let lastLog = 0;
    const loopStart = Date.now();
    let next = renderBatch(0);
    for (let b = 0; b < batches; b++) {
      const cur = await next;
      next = b + 1 < batches ? renderBatch(b + 1) : null;
      for (const buf of cur) await enc.write(buf);
      done += cur.length;
      const now = Date.now();
      if (now - lastLog > 1500 || done === info.frames) {
        lastLog = now;
        const fps = done / ((now - loopStart) / 1000);
        const eta = (info.frames - done) / Math.max(fps, 0.01);
        const line = `  ▣ ${done}/${info.frames} 帧 · ${fps.toFixed(1)} 帧/秒 · 剩余 ${Math.ceil(eta)}s`;
        if (tty) process.stdout.write(`\r${line}   `); else log(line);
      }
    }
    if (tty) process.stdout.write('\n');
    await enc.end();
    enc = null;

    const warnings = [...new Set((await Promise.all(hosts.map(h => h.warnings()))).flat())];
    await Promise.all(extra.map(h => h.close()));

    fs.writeFileSync(files.srt, toSRT(info.timeline));
    const cover = await exportCover(main, { t: coverT, file: files.cover });

    const verify = await verifyOutput(files.video, { ...info, sampleRate: info.encode.sampleRate });
    log(`  ✔ 校验${verify.ok ? '通过' : '未通过'}\n${formatChecks(verify.checks)}`);
    for (const w of warnings) log(`  ⚠ ${w}`);

    const manifest = {
      episode: id,
      title: info.title,
      preset: info.preset,
      draft,
      width: info.width,
      height: info.height,
      fps: info.fps,
      frames: info.frames,
      duration: info.duration,
      plannedDuration: info.plannedDuration,
      workers: n,
      renderSeconds: +((Date.now() - started) / 1000).toFixed(1),
      cover: { t: cover.t ?? 'cover.render' },
      audio: { sampleRate: a.sampleRate, peak: +a.peak.toFixed(4) },
      subtitles: info.timeline.subtitles.length,
      plugins: info.plugins,
      verify,
      warnings,
      git: gitInfo(),
      renderedAt: new Date().toISOString(),
    };
    fs.writeFileSync(files.manifest, JSON.stringify(manifest, null, 2));
    log(`  → ${path.relative(ROOT, outDir)}/  video.mp4 (${verify.stats.sizeMB} MB) · subtitles.srt · cover.png · audio.wav · render.json  用时 ${manifest.renderSeconds}s`);
    if (!verify.ok) {
      const err = new Error('成片校验未通过（见上方 ✗ 项）');
      err.manifest = manifest;
      throw err;
    }
    return { files, manifest };
  } finally {
    if (enc) enc.kill();
    await browser.close().catch(() => {});
    await server.close();
  }
}
