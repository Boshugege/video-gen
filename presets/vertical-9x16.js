// 竖屏 9:16：抖音 / 小红书 / Reels / Shorts 的标准规格。
export default {
  id: 'vertical-9x16',
  label: '竖屏 9:16',
  width: 1080,
  height: 1920,
  fps: 30,
  // --draft 快速出样：一半分辨率、一半帧率。episode 仍按 width×height 的逻辑坐标绘制，由运行时统一缩放。
  draft: { width: 540, height: 960, fps: 15 },
  // 平台界面（标题、头像、点赞栏、描述文字）大致会遮住的区域，单位为逻辑像素。仅用于预览参考线和字幕定位。
  safeArea: { top: 200, right: 150, bottom: 440, left: 60 },
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
