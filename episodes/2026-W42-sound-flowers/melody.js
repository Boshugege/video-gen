// 文字 → 音符（本期专属规则）。
//   · 每个音节取第一个元音定音高：a→C e→D i/y→E o→G u→A，全部落在 C 大调五声音阶上
//   · 音节里辅音 ≥ 2 个，升高一个八度；辅音越多，音越短；句尾音拉长 1.8 倍
//   · 非拉丁文字且没填音节时，每个字算一个音节，音高按字符编码取
const VOW = { a: 0, e: 1, i: 2, y: 2, o: 3, u: 4 };
const isV = c => c in VOW;
const clean = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function syllabifyWord(w) {
  const vs = [];
  const re = /[aeiouy]+/g;
  let m;
  while ((m = re.exec(w))) vs.push([m.index, m.index + m[0].length]);
  if (!vs.length) return w ? [w] : [];
  const cuts = [0];
  for (let k = 1; k < vs.length; k++) {
    const a = vs[k - 1][1], b = vs[k][0];
    cuts.push(b - a <= 1 ? a : a + 1);
  }
  cuts.push(w.length);
  const out = [];
  for (let k = 0; k < cuts.length - 1; k++) out.push(w.slice(cuts[k], cuts[k + 1]));
  return out;
}

export function syllables(item) {
  if (item.roman && item.roman.trim()) return clean(item.roman).split(/\s+/).filter(Boolean);
  const c = clean(item.text);
  if (/^[a-z\s'’\-.,!?]+$/.test(c)) return c.replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean).flatMap(syllabifyWord);
  return [...item.text].filter(ch => /\S/.test(ch) && !/[\p{P}]/u.test(ch)).map(ch => '#' + ch.codePointAt(0));
}

// → { notes: [{ s 音节, p 音级 0..9, dur 秒, t 句内起点 }], len 句长 }
export function toNotes(item) {
  const syl = syllables(item);
  let t = 0;
  const notes = syl.map((s, i) => {
    let v, cons;
    if (s[0] === '#') {
      const cp = +s.slice(1);
      v = cp % 5;
      cons = (cp >> 3) % 3;
    } else {
      const f = [...s].find(isV);
      v = f ? VOW[f] : 2;
      cons = [...s].filter(c => /[a-z]/.test(c) && !isV(c)).length;
    }
    const p = v + (cons >= 2 ? 5 : 0);
    let dur = Math.min(0.5, Math.max(0.2, 0.42 - 0.05 * cons));
    if (i === syl.length - 1) dur *= 1.8;
    const n = { s: s[0] === '#' ? String.fromCodePoint(+s.slice(1)) : s, p, dur, t };
    t += dur + 0.04;
    return n;
  });
  return { notes, len: t };
}

// C 大调五声音阶（C4 D4 E4 G4 A4），音级 ≥5 高八度。沿用原型的频率值，保证音高与原型完全一致。
const SCALE = [261.63, 293.66, 329.63, 392.0, 440.0];
export const freq = p => SCALE[p % 5] * (p >= 5 ? 2 : 1);
export const NOTE_NAMES = ['C', 'D', 'E', 'G', 'A'];
