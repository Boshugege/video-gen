import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createTimeline, validateTimeline, sceneAt, frameCount, frameToSec, secToFrame, timecode, eventsBetween, subtitleAt,
} from '../core/timeline.js';

test('场景按顺序排列，游标累加', () => {
  const tl = createTimeline();
  tl.scene('a', 4);
  tl.scene('b', 5, { k: 1 });
  const built = tl.build();
  assert.equal(built.duration, 9);
  assert.deepEqual(built.scenes.map(s => [s.id, s.start, s.end]), [['a', 0, 4], ['b', 4, 9]]);
});

test('sceneAt：边界归下一个场景，末尾归最后一个场景', () => {
  const tl = createTimeline();
  tl.scene('a', 4);
  tl.scene('b', 5);
  const t = tl.build();
  assert.equal(sceneAt(t, 0).scene.id, 'a');
  assert.equal(sceneAt(t, 3.999).scene.id, 'a');
  assert.equal(sceneAt(t, 4).scene.id, 'b');
  assert.equal(sceneAt(t, 4).u, 0);
  assert.equal(sceneAt(t, 9).scene.id, 'b');
  assert.equal(sceneAt(t, 9).p, 1);
  assert.ok(Math.abs(sceneAt(t, 6.5).p - 0.5) < 1e-9);
});

test('帧数与秒互转', () => {
  assert.equal(frameCount(57.5, 30), 1725);
  assert.equal(frameCount(57.5, 15), 863);
  assert.equal(frameCount(12, 30), 360);
  for (let f = 0; f < 2000; f++) assert.equal(secToFrame(frameToSec(f, 30), 30), f);
  assert.equal(timecode(12.4, 30), '00:12:12');
  assert.equal(timecode(61, 30), '01:01:00');
});

test('事件与字幕查询', () => {
  const tl = createTimeline();
  tl.scene('a', 10);
  tl.event('note', 2).event('note', 1).event('flash', 1);
  tl.subtitle(1, 2, { zh: '一', en: 'one' });
  const t = tl.build();
  assert.deepEqual(t.events.map(e => e.t), [1, 1, 2]);
  assert.equal(eventsBetween(t, 'note', 0, 2).length, 1);
  assert.equal(eventsBetween(t, null, 0, 3).length, 3);
  assert.equal(subtitleAt(t, 1.5).zh, '一');
  assert.equal(subtitleAt(t, 2), null);
});

test('非法时间轴会报错', () => {
  assert.throws(() => validateTimeline({ duration: 0, scenes: [], events: [], subtitles: [] }), /duration/);
  assert.throws(() => validateTimeline({
    duration: 10,
    scenes: [{ id: 'a', start: 0, end: 5 }, { id: 'b', start: 4, end: 8 }],
    events: [],
    subtitles: [],
  }), /重叠/);
  assert.throws(() => createTimeline().scene('x', 0), /大于 0/);
});
