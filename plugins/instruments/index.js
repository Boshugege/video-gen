// 乐器音色。每个乐器都是 (ac, out, note) => void，往任意 BaseAudioContext 排一个音。
export const meta = {
  name: 'instruments',
  kind: 'lib',
  description: '合成乐器音色：pluck（三角波 + 高八度正弦的拨弦音）、bell',
  exports: ['pluck', 'bell'],
};

// 拨弦：三角波基音 + 0.18 倍高八度正弦。dur 越长衰减越慢，尾音约 dur*2.2+0.5 秒。
export function pluck(ac, out, { at, freq, dur = 0.4, vol = 0.2, detune = 0 }) {
  const g = ac.createGain();
  g.connect(out);
  const o1 = ac.createOscillator();
  o1.type = 'triangle';
  o1.frequency.value = freq;
  o1.detune.value = detune;
  const o2 = ac.createOscillator();
  o2.type = 'sine';
  o2.frequency.value = freq * 2;
  o2.detune.value = detune;
  const g2 = ac.createGain();
  g2.gain.value = 0.18;
  o1.connect(g);
  o2.connect(g2);
  g2.connect(g);
  const end = at + dur * 2.2 + 0.5;
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(vol, at + 0.012);
  g.gain.exponentialRampToValueAtTime(vol * 0.35, at + dur);
  g.gain.exponentialRampToValueAtTime(0.0008, end);
  o1.start(at);
  o2.start(at);
  o1.stop(end + 0.05);
  o2.stop(end + 0.05);
  return end;
}

// 钟声：几个非整数倍泛音，长衰减。
export function bell(ac, out, { at, freq, vol = 0.15, decay = 2.5 }) {
  const partials = [[1, 1], [2.76, 0.5], [5.4, 0.25], [8.93, 0.12]];
  for (const [mul, amp] of partials) {
    const o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq * mul;
    const g = ac.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol * amp, at + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0005, at + decay / mul ** 0.3);
    o.connect(g).connect(out);
    o.start(at);
    o.stop(at + decay + 0.05);
  }
  return at + decay;
}
