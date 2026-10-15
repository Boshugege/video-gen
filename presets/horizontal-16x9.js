// 横屏 16:9：B 站 / YouTube 长视频。
export default {
  id: 'horizontal-16x9',
  label: '横屏 16:9',
  width: 1920,
  height: 1080,
  fps: 30,
  draft: { width: 960, height: 540, fps: 15 },
  // 横屏平台遮挡较少，主要是底部进度条和标题栏。
  safeArea: { top: 80, right: 100, bottom: 120, left: 100 },
  encode: {
    crf: 18,
    preset: 'medium',
    profile: 'high',
    maxrate: '16M',
    bufsize: '32M',
    gopSeconds: 2,
    audioBitrate: '192k',
    sampleRate: 48000,
  },
};
