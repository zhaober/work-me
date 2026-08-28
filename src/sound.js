/**
 * 工作计划与复盘备忘录 App - 交互音效（纯函数 + 轻量 Web Audio 封装）
 */

export const SOUNDS = {
  tap:    { freq: 800,  duration: 60,  type: 'sine',     gain: 0.06 },
  pop:    { freq: 1000, duration: 50,  type: 'sine',     gain: 0.07 },
  toggle: { freq: 600,  duration: 40,  type: 'triangle', gain: 0.06 },
  success:{ freq: 1200, duration: 100, type: 'sine',     gain: 0.07 },
  delete: { freq: 200,  duration: 90,  type: 'sawtooth', gain: 0.08 },
  warn:   { freq: 350,  duration: 100, type: 'sawtooth', gain: 0.07 }
};

/** 按名称返回音效参数，未知名称回退为 tap */
export function getSoundPreset(name) {
  return SOUNDS[name] || SOUNDS.tap;
}

/**
 * 播放指定音效。在浏览器环境下使用 Web Audio API 生成短促合成音，
 * 无需外部音频文件；在 Node/无 AudioContext 环境安全降级为静默返回 false。
 */
export function playSound(name) {
  if (typeof window === 'undefined') return false;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;

  const ctx = new AC();
  if (ctx.state === 'suspended') {
    ctx.resume();
  }

  const p = getSoundPreset(name);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = p.type;
  osc.frequency.setValueAtTime(p.freq, ctx.currentTime);

  gain.gain.setValueAtTime(p.gain, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + p.duration / 1000);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + p.duration / 1000);

  // 播放结束后关闭上下文，避免资源占用
  setTimeout(() => { try { ctx.close(); } catch (e) {} }, p.duration + 50);
  return true;
}
