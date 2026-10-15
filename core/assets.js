// 素材：图片和音频文件（背景音乐、配音、音效）。
//
// episode 里声明：
//   assets: {
//     photo: 'assets/photo.jpg',                                   // 相对本期目录
//     logo:  '/assets/logo.png',                                   // 以 / 开头 = 仓库根目录（跨期共用素材）
//     bgm:   { src: 'assets/bgm.mp3', source: 'xx 音乐库', license: 'CC BY 4.0' },
//     vo1:   { src: 'assets/vo-01.wav', sha256: '…' },            // 写了 sha256 就会校验，文件变了直接报错
//   }
//
// 运行时在 setup() 之前把素材全部加载、解码完毕，之后同步取用：
//   env.assets.image('photo')  → ImageBitmap（ctx.drawImage 直接用）
//   env.assets.audio('bgm')    → AudioBuffer（已按混音采样率解码，renderAudio 里用 playClip 放到时间轴上）
//   env.assets.meta('vo1')     → { type, src, bytes, sha256, duration, sampleRate, channels } 或 { width, height }
// setup() 里就能读到配音时长，用它来排场景，画面、字幕、声音自然对齐。
//
// 本模块顶层不碰 DOM：normalizeAssets / assetUrl 在 Node 端也能用（npm run assets）。

const NAME_RE = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;
const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'svg'];
const AUDIO_EXT = ['wav', 'mp3', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'flac', 'aif', 'aiff'];

export function assetType(src) {
  const ext = (/\.([a-z0-9]+)$/i.exec(src) || [])[1]?.toLowerCase();
  if (IMAGE_EXT.includes(ext)) return 'image';
  if (AUDIO_EXT.includes(ext)) return 'audio';
  return null;
}

// 声明 → [{ name, src, type, sha256, source, license }]，非法时抛错。
export function normalizeAssets(spec) {
  if (spec == null) return [];
  if (typeof spec !== 'object' || Array.isArray(spec)) throw new Error('assets 必须是 { 名字: 路径 } 形式的对象');
  return Object.entries(spec).map(([name, v]) => {
    const o = typeof v === 'string' ? { src: v } : { ...v };
    if (!NAME_RE.test(name)) throw new Error(`素材名 "${name}" 不合法（字母、数字、_ . -）`);
    if (typeof o.src !== 'string' || !o.src) throw new Error(`素材 ${name} 缺少 src`);
    if (/^[a-z]+:/i.test(o.src)) throw new Error(`素材 ${name} 不能是网络地址（${o.src}）：先下载到 assets/ 目录，保证离线、可复现`);
    if (o.src.split('/').includes('..')) throw new Error(`素材 ${name} 的路径不能包含 ..`);
    const type = o.type || assetType(o.src);
    if (type !== 'image' && type !== 'audio') throw new Error(`素材 ${name}：无法从扩展名判断类型，请写 type: 'image' 或 'audio'`);
    if (o.sha256 && !/^[0-9a-f]{64}$/.test(o.sha256)) throw new Error(`素材 ${name} 的 sha256 格式不对`);
    return { name, src: o.src, type, sha256: o.sha256 || null, source: o.source || null, license: o.license || null };
  });
}

// 素材在本地服务上的 URL 路径（也就是相对仓库根目录的路径，前面带 /）。
export function assetUrl(episodeId, src) {
  return src.startsWith('/') ? src : `/episodes/${episodeId}/${src.replace(/^\.\//, '')}`;
}

const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');

// 浏览器端：加载并解码全部素材。sampleRate 是混音采样率，音频统一解码到这个采样率。
export async function loadAssets(spec, { episodeId, sampleRate = 48000 } = {}) {
  const list = normalizeAssets(spec);
  const entries = await Promise.all(list.map(async a => {
    const url = assetUrl(episodeId, a.src);
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      throw new Error(`素材 ${a.name} 加载失败：${url.slice(1)} ${res.status === 404 ? '不存在' : `HTTP ${res.status}`}` +
        (a.type === 'audio' ? '（音频素材默认不进 git，换机器后需要自己放回去，见 notes.md 的素材清单）' : ''));
    }
    const bytes = await res.arrayBuffer();
    const sha256 = hex(await crypto.subtle.digest('SHA-256', bytes));
    if (a.sha256 && a.sha256 !== sha256) throw new Error(`素材 ${a.name}（${a.src}）的内容和声明的 sha256 不一致：文件被换过了`);
    const meta = { name: a.name, type: a.type, src: a.src, bytes: bytes.byteLength, sha256, source: a.source, license: a.license };
    let value;
    try {
      if (a.type === 'image') {
        value = await createImageBitmap(new Blob([bytes]));
        Object.assign(meta, { width: value.width, height: value.height });
      } else {
        // 解码上下文的采样率 = 混音采样率：解码时一次性重采样，渲染器和预览页拿到的是同一份数据。
        const dc = new OfflineAudioContext({ numberOfChannels: 1, length: 1, sampleRate });
        value = await dc.decodeAudioData(bytes);
        Object.assign(meta, { duration: value.duration, sampleRate: value.sampleRate, channels: value.numberOfChannels, samples: value.length });
      }
    } catch (e) {
      throw new Error(`素材 ${a.name}（${a.src}）解码失败：${e.message}`);
    }
    return [a.name, { meta: Object.freeze(meta), value }];
  }));
  return createAssetStore(new Map(entries));
}

function createAssetStore(map) {
  const get = (name, type) => {
    const e = map.get(name);
    if (!e) throw new Error(`没有名为 "${name}" 的素材。已声明：${[...map.keys()].join(', ') || '（无）'}`);
    if (type && e.meta.type !== type) throw new Error(`素材 ${name} 是 ${e.meta.type}，不是 ${type}`);
    return e;
  };
  return Object.freeze({
    image: name => get(name, 'image').value,
    audio: name => get(name, 'audio').value,
    meta: name => get(name).meta,
    has: name => map.has(name),
    names: () => [...map.keys()],
    // 可 JSON 序列化的清单：写进 render.json，并用于校验各渲染页加载到的是同一批文件。
    manifest: () => [...map.values()].map(e => e.meta),
  });
}

export const EMPTY_ASSETS = createAssetStore(new Map());
