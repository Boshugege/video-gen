// 生成 _asset-test 用的测试素材（全部由 ffmpeg 合成，没有版权问题）：
//   node episodes/_asset-test/make-assets.mjs
// 故意用 44.1kHz（混音是 48kHz），顺便测试解码时的重采样；
// 同一段嘀声导出成 wav / mp3 / m4a 三种格式，测试有编码器延迟的格式会不会让声音错位。
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '../../core/mux.mjs';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'assets');
export const BLIP_ONSET = 0.2; // 嘀声在文件里的起点（秒），episode.js 里用同一个值

const blip = `aevalsrc='if(between(t,${BLIP_ONSET},${BLIP_ONSET + 0.15}),0.8*sin(2*PI*1000*(t-${BLIP_ONSET})),0)':s=44100:d=0.5`;
// 3 秒一循环的和弦：各频率在 3 秒内都是整数个周期，循环接缝无爆音；1Hz 的音量起伏用来演示音频驱动画面。
const pad = ph => `(0.07*sin(2*PI*220*t+${ph})+0.05*sin(2*PI*275*t)+0.04*sin(2*PI*330*t))*(0.6+0.4*sin(2*PI*t))`;
const bgm = `aevalsrc='${pad(0)}|${pad(0.7)}':s=44100:d=3`;

const jobs = [
  ['-f', 'lavfi', '-i', 'testsrc2=size=1600x1200:rate=1', '-frames:v', '1', 'photo.png'],
  ['-f', 'lavfi', '-i', blip, '-c:a', 'pcm_s16le', 'blip.wav'],
  ['-f', 'lavfi', '-i', blip, '-c:a', 'libmp3lame', '-b:a', '128k', 'blip.mp3'],
  ['-f', 'lavfi', '-i', blip, '-c:a', 'aac', '-b:a', '128k', 'blip.m4a'],
  ['-f', 'lavfi', '-i', bgm, '-c:a', 'libmp3lame', '-b:a', '160k', 'bgm.mp3'],
];

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const j of jobs) {
    const out = j[j.length - 1];
    await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...j.slice(0, -1), path.join(DIR, out)]);
    console.log(`✔ assets/${out}`);
  }
}
