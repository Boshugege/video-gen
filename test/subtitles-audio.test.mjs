import test from 'node:test';
import assert from 'node:assert/strict';
import { srtTime, toSRT } from '../core/subtitles.js';
import { encodeWav, noteToMidi, scaleMidi, midiToFreq } from '../core/audio.js';
import { rng, noise1 } from '../core/random.js';

test('SRT 时间格式', () => {
  assert.equal(srtTime(0), '00:00:00,000');
  assert.equal(srtTime(1.2345), '00:00:01,235');
  assert.equal(srtTime(3723.5), '01:02:03,500');
});

test('双语 SRT：中文在上，空行跳过', () => {
  const srt = toSRT({ subtitles: [{ start: 1, end: 2, zh: '你好', en: 'Hello' }, { start: 3, end: 4, zh: '', en: 'Only English' }] });
  assert.equal(srt, '1\n00:00:01,000 --> 00:00:02,000\n你好\nHello\n\n2\n00:00:03,000 --> 00:00:04,000\nOnly English\n');
});

test('WAV 头和长度', () => {
  const ch = [new Float32Array([0, 0.5, -1, 1]), new Float32Array([0, -0.5, 1, -1])];
  for (const [bits, fmt] of [[16, 1], [24, 1], [32, 3]]) {
    const w = encodeWav(ch, 48000, { bitDepth: bits });
    const v = new DataView(w.buffer);
    assert.equal(String.fromCharCode(...w.slice(0, 4)), 'RIFF');
    assert.equal(v.getUint16(20, true), fmt);
    assert.equal(v.getUint16(22, true), 2);
    assert.equal(v.getUint32(24, true), 48000);
    assert.equal(v.getUint16(34, true), bits);
    assert.equal(v.getUint32(40, true), 4 * 2 * (bits / 8));
    assert.equal(w.length, 44 + 4 * 2 * (bits / 8));
  }
  const w16 = encodeWav([new Float32Array([1, -1])], 48000, { bitDepth: 16 });
  const v16 = new DataView(w16.buffer);
  assert.equal(v16.getInt16(44, true), 32767);
  assert.equal(v16.getInt16(46, true), -32767);
});

test('音高换算', () => {
  assert.equal(noteToMidi('A4'), 69);
  assert.equal(noteToMidi('C4'), 60);
  assert.equal(noteToMidi('F#3'), 54);
  assert.equal(noteToMidi('Bb5'), 82);
  assert.equal(midiToFreq(69), 440);
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(d => scaleMidi('C4', 'majorPentatonic', d)), [60, 62, 64, 67, 69, 72]);
  assert.equal(scaleMidi('C4', 'majorPentatonic', -1), 57);
});

test('带种子的随机数可复现', () => {
  const a = rng('seed'), b = rng('seed'), c = rng('other');
  const xs = Array.from({ length: 5 }, a);
  assert.deepEqual(xs, Array.from({ length: 5 }, b));
  assert.notDeepEqual(xs, Array.from({ length: 5 }, c));
  assert.ok(xs.every(x => x >= 0 && x < 1));
  assert.equal(noise1('s', 42), noise1('s', 42));
});
