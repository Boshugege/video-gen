// 校验 story.js：一共 540 句、每幕 54 句、中文每句不超过 20 字（含标点）、英文不超过 64 字符、没有重复，
// 并核对定格示范句（#317）和结局（#540）的位置。
// 用法：node episodes/2026-W43-pause-to-read/check-story.mjs
import { ACTS, FRAGMENTS } from './story.js';
import { TOTAL, DEMO, ZH_MAX, EN_MAX } from './stream.js';

const errs = [];
ACTS.forEach((a, i) => {
  const from = ACTS.slice(0, i).reduce((n, x) => n + x.lines.length, 0) + 1;
  const ok = a.lines.length === TOTAL / ACTS.length;
  console.log(`${ok ? '✓' : '✗'} 第 ${i + 1} 幕「${a.title}」${a.lines.length} 句（#${from}–#${from + a.lines.length - 1}）`);
  if (!ok) errs.push(`第 ${i + 1} 幕应为 ${TOTAL / ACTS.length} 句`);
});
if (FRAGMENTS.length !== TOTAL) errs.push(`一共 ${FRAGMENTS.length} 句，应为 ${TOTAL}`);

const seenZh = new Map(), seenEn = new Map();
FRAGMENTS.forEach(([zh, en], i) => {
  const no = `#${String(i + 1).padStart(3, '0')}`;
  const n = [...zh].length;
  if (n > ZH_MAX) errs.push(`${no} 中文 ${n} 字：${zh}`);
  if (!en || en.length > EN_MAX) errs.push(`${no} 英文 ${en ? en.length : 0} 字符：${en}`);
  if (seenZh.has(zh)) errs.push(`${no} 与 #${seenZh.get(zh)} 中文重复：${zh}`);
  if (seenEn.has(en)) errs.push(`${no} 与 #${seenEn.get(en)} 英文重复：${en}`);
  seenZh.set(zh, i + 1);
  seenEn.set(en, i + 1);
});

const demo = FRAGMENTS[DEMO - 1];
if (!demo || !demo[0].includes('别回头')) errs.push(`#${DEMO} 应该是"别回头"那句，现在是：${demo && demo[0]}`);
const last = FRAGMENTS[TOTAL - 1];
if (!last || !last[0].startsWith('落款')) errs.push(`#${TOTAL} 应该是结局，现在是：${last && last[0]}`);

const chars = new Set(FRAGMENTS.map(f => f[0]).join(''));
const lens = FRAGMENTS.map(f => [...f[0]].length);
console.log(`中文共 ${lens.reduce((a, b) => a + b, 0)} 字，${chars.size} 个不同的字；最长 ${Math.max(...lens)} 字；英文最长 ${Math.max(...FRAGMENTS.map(f => f[1].length))} 字符`);
console.log(`#${DEMO}：${demo && demo[0]}`);
console.log(`#${TOTAL}：${last && last[0]}`);

if (errs.length) {
  console.error(`\n✗ ${errs.length} 个问题：\n  ` + errs.join('\n  '));
  process.exit(1);
}
console.log('\n✓ 故事校验通过');
