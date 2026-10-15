// 本地预览页：逐帧查看、拖动时间轴、只试听某一段、文件修改后自动刷新。
// 画面用的是和渲染器同一个 runtime，所以这里看到的每一帧就是成片里的那一帧。
// 声音：页面加载时离线生成整段混音（和成片完全相同），播放时从任意位置截取。
import { loadEpisode, createRuntime } from '../runtime.js';
import { sceneAt, subtitleAt, secToFrame, frameToSec, timecode } from '../timeline.js';

const $ = id => document.getElementById(id);
const query = new URLSearchParams(location.search);
const epId = query.get('ep');
const draft = query.get('draft') === '1';
const burn = query.get('burn') === '1';

const state = { t: 0, in: null, out: null, playing: false };
let rt, env, tl, mix = null;

/* ---------- 小工具 ---------- */

const store = {
  get(k, d) { try { const v = localStorage.getItem('preview:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('preview:' + k, JSON.stringify(v)); } catch { /* 无痕模式等 */ } },
};

function showMsg(text, kind = 'err') {
  const d = document.createElement('div');
  d.className = `msg ${kind}`;
  d.textContent = text;
  $('msgs').prepend(d);
}

const fmt = s => `${s.toFixed(3)}s`;

/* ---------- 期数选择 ---------- */

async function fillEpisodeSelect() {
  let list = [];
  try { list = await (await fetch('/__episodes')).json(); } catch { /* 静态托管时没有这个接口 */ }
  const sel = $('epSelect');
  sel.innerHTML = '';
  if (!epId) sel.append(new Option('选择一期…', ''));
  for (const id of list) sel.append(new Option(id, id, false, id === epId));
  sel.onchange = () => { if (sel.value) location.search = `?ep=${encodeURIComponent(sel.value)}`; };
  return list;
}

function showPicker(list) {
  document.querySelector('.main').innerHTML = '';
  document.querySelector('.dock').hidden = true;
  const box = document.createElement('div');
  box.className = 'picker';
  box.innerHTML = '<h2>选择要预览的一期</h2>';
  for (const id of list) {
    const a = document.createElement('a');
    a.href = `?ep=${encodeURIComponent(id)}`;
    a.textContent = id;
    box.append(a);
  }
  document.querySelector('.main').append(box);
}

/* ---------- 画面 ---------- */

const snap = t => frameToSec(Math.max(0, Math.min(env.frames - 1, secToFrame(t, env.fps))), env.fps);
let lastDrawn = -1;

function draw(t, force = false) {
  const f = secToFrame(snap(t), env.fps);
  if (f !== lastDrawn || force) {
    try {
      rt.drawFrame(frameToSec(f, env.fps));
      lastDrawn = f;
    } catch (e) {
      pause();
      showMsg(e.message);
      lastDrawn = -1;
    }
  }
  updateInfo(t);
}

function drawSafeArea() {
  const c = $('overlay');
  c.width = env.width;
  c.height = env.height;
  const x = c.getContext('2d');
  const s = env.preset.safeArea;
  if (!s) return;
  x.setTransform(env.scale, 0, 0, env.scale, 0, 0);
  x.fillStyle = 'rgba(255,70,70,.16)';
  x.fillRect(0, 0, env.W, s.top);
  x.fillRect(0, env.H - s.bottom, env.W, s.bottom);
  x.fillRect(0, s.top, s.left, env.H - s.top - s.bottom);
  x.fillRect(env.W - s.right, s.top, s.right, env.H - s.top - s.bottom);
  x.setLineDash([16, 10]);
  x.strokeStyle = 'rgba(255,120,120,.8)';
  x.lineWidth = 3;
  x.strokeRect(s.left, s.top, env.W - s.left - s.right, env.H - s.top - s.bottom);
  x.fillStyle = 'rgba(255,150,150,.9)';
  x.font = '600 28px system-ui, sans-serif';
  x.fillText('平台界面遮挡区（参考）', s.left + 12, env.H - s.bottom + 44);
}

/* ---------- 信息面板 ---------- */

function updateInfo(t) {
  const f = secToFrame(snap(t), env.fps);
  $('tc').textContent = timecode(snap(t), env.fps);
  $('tinfo').textContent = `${fmt(t)} · 第 ${f} 帧 / 共 ${env.frames} 帧`;
  const sc = sceneAt(tl, t);
  $('sceneInfo').textContent = sc
    ? `${sc.scene.id}\n${fmt(sc.scene.start)} – ${fmt(sc.scene.end)} · 场内 ${sc.u.toFixed(2)}s（${Math.round(sc.p * 100)}%）`
    : '（无场景）';
  const sub = subtitleAt(tl, t);
  const si = $('subInfo');
  si.innerHTML = '';
  if (sub) {
    const zh = document.createElement('div'); zh.className = 'zh'; zh.textContent = sub.zh;
    const en = document.createElement('div'); en.className = 'en'; en.textContent = sub.en;
    si.append(zh, en);
  } else {
    si.textContent = '—';
  }
  $('head').style.left = pct(t);
  scheduleHashSave();
}

function updateSelection() {
  const el = $('sel');
  const has = state.in != null && state.out != null && state.out > state.in;
  el.hidden = !has;
  if (has) {
    el.style.left = pct(state.in);
    el.style.width = `${((state.out - state.in) / env.duration) * 100}%`;
  }
  $('selInfo').textContent = has ? `${fmt(state.in)} → ${fmt(state.out)}（${(state.out - state.in).toFixed(2)}s）` : '未设置：没有选区时"试听选区"播放当前场景';
  scheduleHashSave();
}

let hashTimer = 0;
function scheduleHashSave() {
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    const h = new URLSearchParams();
    h.set('t', snap(state.t).toFixed(4));
    if (state.in != null && state.out != null) { h.set('in', state.in.toFixed(4)); h.set('out', state.out.toFixed(4)); }
    history.replaceState(null, '', `${location.pathname}${location.search}#${h}`);
  }, 250);
}

function restoreHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.has('t')) state.t = Math.max(0, Math.min(env.duration, +h.get('t') || 0));
  if (h.has('in') && h.has('out')) { state.in = +h.get('in'); state.out = +h.get('out'); }
}

/* ---------- 时间轴 ---------- */

const pct = t => `${(t / env.duration) * 100}%`;
const HUE_STEP = 47;

function buildTimeline() {
  const ruler = $('ruler');
  const width = $('lanes').clientWidth || 800;
  const pxPerSec = width / env.duration;
  const step = [0.5, 1, 2, 5, 10, 15, 30, 60, 120].find(s => s * pxPerSec >= 56) || 300;
  ruler.innerHTML = '';
  for (let s = 0; s <= env.duration + 1e-6; s += step) {
    const d = document.createElement('div');
    d.className = 'tick';
    d.style.left = pct(s);
    d.textContent = s >= 60 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : `${s}s`;
    ruler.append(d);
  }
  for (const m of tl.markers) {
    const d = document.createElement('div');
    d.className = 'marker';
    d.style.left = pct(m.t);
    d.title = `${m.label} @ ${fmt(m.t)}`;
    ruler.append(d);
  }

  const sc = $('trkScenes');
  sc.innerHTML = '';
  tl.scenes.forEach((s, i) => {
    const d = document.createElement('div');
    d.className = 'blk';
    d.style.left = pct(s.start);
    d.style.width = `calc(${((s.end - s.start) / env.duration) * 100}% - 2px)`;
    d.style.background = `hsl(${(i * HUE_STEP) % 360} 60% 70%)`;
    d.textContent = s.id;
    d.title = `${s.id}  ${fmt(s.start)} – ${fmt(s.end)}\n单击：选中这一段　双击：试听`;
    d.addEventListener('pointerdown', e => e.stopPropagation());
    d.addEventListener('click', () => { state.in = s.start; state.out = s.end; updateSelection(); seek(s.start); });
    d.addEventListener('dblclick', () => playRange(s.start, s.end));
    sc.append(d);
  });

  const st = $('trkSubs');
  st.innerHTML = '';
  for (const c of tl.subtitles) {
    const d = document.createElement('div');
    d.className = 'blk';
    d.style.left = pct(c.start);
    d.style.width = `calc(${((c.end - c.start) / env.duration) * 100}% - 2px)`;
    d.textContent = c.zh || c.en;
    d.title = `${fmt(c.start)} – ${fmt(c.end)}\n${c.zh}\n${c.en}`;
    st.append(d);
  }

  const ev = $('trkEvents');
  ev.innerHTML = '';
  const tracks = [...new Set(tl.events.map(e => e.track))];
  for (const e of tl.events) {
    const d = document.createElement('div');
    d.className = 'ev';
    d.style.left = pct(e.t);
    d.style.background = `hsl(${(tracks.indexOf(e.track) * 97 + 200) % 360} 70% 65%)`;
    d.title = `${e.track} @ ${fmt(e.t)}`;
    ev.append(d);
  }
}

function bindScrub() {
  const lanes = $('lanes');
  let dragging = false, anchor = null;
  const tAt = e => {
    const r = lanes.getBoundingClientRect();
    return Math.max(0, Math.min(env.duration, ((e.clientX - r.left) / r.width) * env.duration));
  };
  lanes.addEventListener('pointerdown', e => {
    dragging = true;
    lanes.setPointerCapture(e.pointerId);
    pause();
    const t = tAt(e);
    anchor = e.shiftKey ? snap(t) : null;
    if (anchor == null) seek(t);
  });
  lanes.addEventListener('pointermove', e => {
    if (!dragging) return;
    const t = tAt(e);
    if (anchor != null) {
      state.in = Math.min(anchor, snap(t));
      state.out = Math.max(anchor, snap(t));
      updateSelection();
    }
    seek(t);
  });
  const up = () => { dragging = false; anchor = null; };
  lanes.addEventListener('pointerup', up);
  lanes.addEventListener('pointercancel', up);
}

/* ---------- 播放 ---------- */

let ac = null, src = null, clock = null, raf = 0;

function seek(t) {
  state.t = Math.max(0, Math.min(env.duration, t));
  draw(state.t);
}

function step(frames) {
  pause();
  const f = secToFrame(snap(state.t), env.fps) + frames;
  seek(frameToSec(Math.max(0, Math.min(env.frames - 1, f)), env.fps));
}

function stopAudio() {
  if (src) { try { src.stop(); } catch { /* 已停止 */ } src.disconnect(); src = null; }
}

function play(from = state.t, to = null) {
  if (to == null && from >= env.duration - 1 / env.fps) from = 0;
  stopAudio();
  cancelAnimationFrame(raf);
  if (mix && !$('optMute').checked) {
    if (!ac) ac = new AudioContext({ sampleRate: mix.sampleRate });
    if (ac.state === 'suspended') ac.resume();
    src = ac.createBufferSource();
    src.buffer = mix;
    src.connect(ac.destination);
    const when = ac.currentTime + 0.05;
    src.start(when, from, to != null ? to - from : undefined);
    clock = { audio: true, start: when, from, to };
  } else {
    clock = { audio: false, start: performance.now() / 1000, from, to };
  }
  state.playing = true;
  $('bPlay').textContent = '❚❚ 暂停';
  raf = requestAnimationFrame(tick);
}

function clockTime() {
  if (clock.audio) return clock.from + Math.max(0, ac.currentTime - clock.start - (ac.outputLatency || 0));
  return clock.from + performance.now() / 1000 - clock.start;
}

function tick() {
  if (!state.playing) return;
  const end = clock.to ?? env.duration;
  const t = clockTime();
  if (t >= end) {
    if (clock.to != null && $('optLoop').checked) { play(clock.from, clock.to); return; }
    pause();
    seek(clock.to != null ? clock.to - 1 / env.fps : env.duration);
    return;
  }
  state.t = t;
  draw(t);
  raf = requestAnimationFrame(tick);
}

function pause() {
  if (!state.playing) return;
  state.playing = false;
  cancelAnimationFrame(raf);
  stopAudio();
  $('bPlay').textContent = '▶ 播放';
  for (const w of rt.warnings.splice(0)) showMsg(w, 'warn');
}

function playRange(a, b) {
  state.t = a;
  play(a, b);
}

function playSelection() {
  if (state.in != null && state.out != null && state.out > state.in) return playRange(state.in, state.out);
  const sc = sceneAt(tl, state.t);
  if (sc) playRange(sc.scene.start, sc.scene.end);
}

/* ---------- 控件与快捷键 ---------- */

function bindControls() {
  $('bPlay').onclick = () => (state.playing ? pause() : play());
  $('bPrev').onclick = () => step(-1);
  $('bNext').onclick = () => step(1);
  $('bStart').onclick = () => { pause(); seek(0); };
  $('bEnd').onclick = () => { pause(); seek(env.duration); };
  $('bIn').onclick = () => { state.in = snap(state.t); if (state.out != null && state.out <= state.in) state.out = null; updateSelection(); };
  $('bOut').onclick = () => { state.out = snap(state.t); if (state.in == null || state.in >= state.out) state.in = 0; updateSelection(); };
  $('bClear').onclick = () => { state.in = state.out = null; updateSelection(); };
  $('bPlaySel').onclick = playSelection;
  $('optLoop').checked = store.get('loop', false);
  $('optLoop').onchange = e => store.set('loop', e.target.checked);
  $('optMute').checked = store.get('mute', false);
  $('optMute').onchange = e => { store.set('mute', e.target.checked); if (state.playing) play(state.t, clock.to); };

  const safe = $('optSafe');
  safe.checked = store.get('safe', true);
  const applySafe = () => $('overlay').classList.toggle('hide', !safe.checked);
  safe.onchange = () => { store.set('safe', safe.checked); applySafe(); };
  applySafe();

  const toggleQuery = (key, on) => {
    const q = new URLSearchParams(location.search);
    if (on) q.set(key, '1'); else q.delete(key);
    location.search = q.toString();
  };
  $('optDraft').checked = draft;
  $('optDraft').onchange = e => toggleQuery('draft', e.target.checked);
  $('optBurn').checked = burn;
  $('optBurn').onchange = e => toggleQuery('burn', e.target.checked);

  window.addEventListener('keydown', e => {
    if (e.target.closest('input,select,textarea') && e.key !== ' ') return;
    const k = e.key;
    const sceneIdx = () => { const s = sceneAt(tl, state.t); return s ? s.index : 0; };
    if (k === ' ') { e.preventDefault(); state.playing ? pause() : play(); }
    else if (k === 'ArrowLeft') { e.preventDefault(); e.shiftKey ? (pause(), seek(state.t - 1)) : step(-1); }
    else if (k === 'ArrowRight') { e.preventDefault(); e.shiftKey ? (pause(), seek(state.t + 1)) : step(1); }
    else if (k === 'Home') { pause(); seek(0); }
    else if (k === 'End') { pause(); seek(env.duration); }
    else if (k === '[') { pause(); const s = tl.scenes[sceneIdx()]; seek(state.t - s.start > 0.25 ? s.start : (tl.scenes[sceneIdx() - 1] || s).start); }
    else if (k === ']') { pause(); const s = tl.scenes[sceneIdx() + 1]; if (s) seek(s.start); }
    else if (k === 'i' || k === 'I') $('bIn').click();
    else if (k === 'o' || k === 'O') $('bOut').click();
    else if (k === 'x' || k === 'X') $('bClear').click();
    else if (k === 'p' || k === 'P') playSelection();
    else if (k === 'l' || k === 'L') { $('optLoop').click(); }
    else if (k === 'm' || k === 'M') { $('optMute').click(); }
  });
  window.addEventListener('resize', () => buildTimeline());
}

function bindLiveReload() {
  if (typeof EventSource === 'undefined') return;
  const es = new EventSource('/__events');
  const live = $('live');
  es.onopen = () => live.classList.remove('off');
  es.onerror = () => live.classList.add('off');
  es.onmessage = e => {
    const files = JSON.parse(e.data);
    const relevant = files.some(f => f.startsWith(`episodes/${epId}/`) || /^(core|plugins|presets)\//.test(f));
    if (relevant) {
      clearTimeout(hashTimer);
      history.replaceState(null, '', `${location.pathname}${location.search}#t=${snap(state.t).toFixed(4)}${state.in != null && state.out != null ? `&in=${state.in}&out=${state.out}` : ''}`);
      location.reload();
    }
  };
}

/* ---------- 启动 ---------- */

async function boot() {
  const list = await fillEpisodeSelect();
  if (!epId) { showPicker(list); return; }
  document.title = `预览 · ${epId}`;
  bindLiveReload();
  try {
    const ep = await loadEpisode(epId, { cacheBust: Date.now() });
    rt = await createRuntime(ep, { canvas: $('cv'), mode: 'preview', draft, burnSubtitles: burn });
  } catch (e) {
    showMsg(e.message);
    return;
  }
  env = rt.env;
  tl = env.timeline;
  $('cv').style.aspectRatio = `${env.width} / ${env.height}`;
  $('epMeta').textContent = `${env.episode.title} · ${env.preset.label} · ${env.width}×${env.height} @ ${env.fps}fps · ${env.frames} 帧 · ${env.duration.toFixed(2)}s${draft ? ' · 草稿' : ''}`;
  drawSafeArea();
  restoreHash();
  bindControls();
  bindScrub();
  buildTimeline();
  updateSelection();
  draw(state.t, true);
  for (const w of rt.warnings.splice(0)) showMsg(w, 'warn');

  const t0 = performance.now();
  try {
    mix = await rt.renderAudio(48000);
    let peak = 0;
    for (let c = 0; c < mix.numberOfChannels; c++) { const d = mix.getChannelData(c); for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i])); }
    $('audioInfo').textContent = `混音就绪 · ${mix.duration.toFixed(2)}s · 峰值 ${peak.toFixed(3)}${peak > 1 ? ' ⚠ 削波' : ''} · 生成用时 ${Math.round(performance.now() - t0)}ms`;
    $('audioInfo').classList.remove('muted');
  } catch (e) {
    $('audioInfo').textContent = '混音失败：' + e.message;
    showMsg(e.message);
  }
}

boot();
