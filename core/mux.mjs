// ffmpeg 合成与 ffprobe 校验（Node）。
// 输出规格：H.264 High / yuv420p / BT.709 / 固定帧率 + AAC 48kHz 立体声 + faststart。
// 这是抖音、小红书、Reels、Shorts、B 站、YouTube 都能直接接受的组合。
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';

export function which(bin) {
  try {
    return execFileSync('/usr/bin/which', [bin], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || null;
  } catch {
    return null;
  }
}

export function requireFfmpeg() {
  const missing = ['ffmpeg', 'ffprobe'].filter(b => !which(b));
  if (missing.length) throw new Error(`缺少 ${missing.join('、')}。请运行：brew install ffmpeg（或 npm run setup）`);
}

// 视频帧从 stdin 以 PNG 流输入，音频来自 WAV 文件。
export function encodeArgs({ fps, width, height, audio, out, encode, title = '' }) {
  return [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', 'pipe:0',
    '-i', audio,
    '-map', '0:v:0', '-map', '1:a:0',
    '-vf', `scale=${width}:${height}:out_color_matrix=bt709:out_range=tv,format=yuv420p`,
    '-c:v', 'libx264',
    '-preset', encode.preset,
    '-crf', String(encode.crf),
    '-profile:v', encode.profile,
    '-maxrate', encode.maxrate,
    '-bufsize', encode.bufsize,
    '-g', String(Math.round(encode.gopSeconds * fps)),
    '-pix_fmt', 'yuv420p',
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv',
    '-c:a', 'aac', '-b:a', encode.audioBitrate, '-ar', String(encode.sampleRate), '-ac', '2',
    '-movflags', '+faststart',
    '-metadata', `title=${title}`,
    out,
  ];
}

// 启动 ffmpeg，返回 { write(buf), end() → Promise }。write 遵守背压。
export function startEncoder(args) {
  const proc = spawn('ffmpeg', args, { stdio: ['pipe', 'ignore', 'pipe'] });
  let stderr = '';
  proc.stderr.on('data', d => { stderr += d; });
  const done = new Promise((resolve, reject) => {
    proc.on('error', reject);
    proc.on('close', code => (code === 0 ? resolve() : reject(new Error(`ffmpeg 退出码 ${code}\n${stderr.trim()}`))));
  });
  done.catch(() => {});
  return {
    write(buf) {
      if (proc.stdin.destroyed) return done;
      return proc.stdin.write(buf) ? Promise.resolve() : new Promise(r => proc.stdin.once('drain', r));
    },
    end() {
      proc.stdin.end();
      return done;
    },
    kill() { proc.kill('SIGKILL'); },
  };
}

export function run(bin, args, { encoding = 'utf8', maxBuffer = 1 << 30 } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const out = [];
    let size = 0;
    let err = '';
    p.stdout.on('data', d => { size += d.length; if (size <= maxBuffer) out.push(d); });
    p.stderr.on('data', d => { err += d; });
    p.on('error', reject);
    p.on('close', code => {
      if (code !== 0) return reject(new Error(`${bin} 退出码 ${code}: ${err.trim()}`));
      const buf = Buffer.concat(out);
      resolve(encoding ? buf.toString(encoding) : buf);
    });
  });
}

export async function probe(file) {
  return JSON.parse(await run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]));
}

// 解码全部视频帧，返回每帧的 PTS（秒）。
export async function videoFramePts(file) {
  const s = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'frame=pts_time', '-of', 'json', file]);
  return (JSON.parse(s).frames || []).map(f => Number(f.pts_time));
}

// MP4 顶层 atom 顺序：faststart 要求 moov 在 mdat 之前。
export function topLevelAtoms(file) {
  const fd = fs.openSync(file, 'r');
  const size = fs.fstatSync(fd).size;
  const atoms = [];
  const hdr = Buffer.alloc(16);
  let pos = 0;
  try {
    while (pos + 8 <= size && atoms.length < 64) {
      fs.readSync(fd, hdr, 0, 16, pos);
      let len = hdr.readUInt32BE(0);
      const type = hdr.toString('latin1', 4, 8);
      if (len === 1) len = Number(hdr.readBigUInt64BE(8));
      else if (len === 0) len = size - pos;
      if (len < 8) break;
      atoms.push(type);
      pos += len;
    }
  } finally {
    fs.closeSync(fd);
  }
  return atoms;
}

const ratio = s => { const [a, b] = String(s).split('/').map(Number); return b ? a / b : a; };

// 校验成片。expected: { width, height, fps, frames, plannedDuration, sampleRate }
// 返回 { ok, checks: [{ name, ok, detail }], stats }
export async function verifyOutput(file, expected) {
  const info = await probe(file);
  const v = info.streams.find(s => s.codec_type === 'video');
  const a = info.streams.find(s => s.codec_type === 'audio');
  const pts = await videoFramePts(file);
  const frameDur = 1 / expected.fps;
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });

  add('视频编码 H.264 High', v && v.codec_name === 'h264' && /high/i.test(v.profile || ''), v ? `${v.codec_name} ${v.profile}` : '无视频流');
  add('像素格式 yuv420p', v && v.pix_fmt === 'yuv420p', v && v.pix_fmt);
  add('分辨率', v && v.width === expected.width && v.height === expected.height, v && `${v.width}x${v.height}`);
  add('固定帧率', v && Math.abs(ratio(v.r_frame_rate) - expected.fps) < 1e-6 && Math.abs(ratio(v.avg_frame_rate) - expected.fps) < 1e-3, v && `r=${v.r_frame_rate} avg=${v.avg_frame_rate}`);
  add('帧数（逐帧解码）', pts.length === expected.frames, `${pts.length} / 计划 ${expected.frames}`);

  let maxJitter = 0;
  for (let i = 0; i < pts.length; i++) maxJitter = Math.max(maxJitter, Math.abs(pts[i] - i * frameDur));
  add('无掉帧（每帧 PTS = i/fps）', pts.length > 0 && maxJitter < frameDur / 4, `最大偏差 ${(maxJitter * 1000).toFixed(2)} ms`);

  const vDur = pts.length * frameDur;
  add('时长符合计划', Math.abs(vDur - expected.plannedDuration) < frameDur, `${vDur.toFixed(3)}s / 计划 ${expected.plannedDuration.toFixed(3)}s`);

  add('音频 AAC 48kHz 立体声', a && a.codec_name === 'aac' && +a.sample_rate === (expected.sampleRate || 48000) && a.channels === 2, a ? `${a.codec_name} ${a.sample_rate}Hz ${a.channels}ch` : '无音频流');
  const aStart = a ? +a.start_time : NaN;
  const aDur = a ? +a.duration : NaN;
  add('音频从 0 开始', Math.abs(aStart) < frameDur, `start=${aStart}`);
  add('音视频时长差 < 1 帧', Math.abs(aDur - vDur) < frameDur, `音频 ${aDur.toFixed(3)}s / 视频 ${vDur.toFixed(3)}s`);

  const atoms = topLevelAtoms(file);
  add('faststart（moov 在 mdat 前）', atoms.indexOf('moov') >= 0 && atoms.indexOf('moov') < atoms.indexOf('mdat'), atoms.join(' '));

  return {
    ok: checks.every(c => c.ok),
    checks,
    stats: {
      frames: pts.length,
      videoDuration: vDur,
      audioDuration: aDur,
      bitrateKbps: Math.round(+info.format.bit_rate / 1000),
      sizeMB: +(+info.format.size / 1048576).toFixed(2),
    },
  };
}

export function formatChecks(checks) {
  return checks.map(c => `  ${c.ok ? '✓' : '✗'} ${c.name}  ${c.detail ?? ''}`).join('\n');
}
