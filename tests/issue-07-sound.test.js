import { describe, it } from 'node:test';
import assert from 'node:assert';
import { SOUNDS, getSoundPreset, playSound } from '../src/sound.js';

describe('Issue 07: 交互音效', () => {
  it('SOUNDS 包含核心交互音效类型', () => {
    assert.ok(SOUNDS.tap, 'tap 音效存在');
    assert.ok(SOUNDS.success, 'success 音效存在');
    assert.ok(SOUNDS.delete, 'delete 音效存在');
    assert.ok(SOUNDS.toggle, 'toggle 音效存在');
    assert.ok(SOUNDS.pop, 'pop 音效存在');
  });

  it('每个音效参数完整且合法', () => {
    Object.values(SOUNDS).forEach(p => {
      assert.strictEqual(typeof p.freq, 'number');
      assert.ok(p.freq > 0 && p.freq <= 8000, '频率在合理范围');
      assert.strictEqual(typeof p.duration, 'number');
      assert.ok(p.duration > 0 && p.duration <= 1000, '时长合理');
      assert.ok(['sine','square','sawtooth','triangle'].includes(p.type), '波形类型合法');
      assert.strictEqual(typeof p.gain, 'number');
      assert.ok(p.gain > 0 && p.gain <= 1, '音量合理');
    });
  });

  it('getSoundPreset 返回对应参数', () => {
    const p = getSoundPreset('success');
    assert.strictEqual(p.freq, SOUNDS.success.freq);
    assert.strictEqual(p.duration, SOUNDS.success.duration);
  });

  it('getSoundPreset 对未知名称回退到 tap', () => {
    const p = getSoundPreset('nonexistent');
    assert.strictEqual(p.freq, SOUNDS.tap.freq);
    assert.strictEqual(p.duration, SOUNDS.tap.duration);
  });

  it('playSound 在 Node 无 AudioContext 时安全降级', () => {
    const res = playSound('tap');
    assert.strictEqual(res, false);
  });
});
