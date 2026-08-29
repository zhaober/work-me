import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getDefaultSettings, normalizeSettings } from '../src/app-core.js';

describe('Issue-19 设置默认值（修复「我的」界面不跳转）', () => {
  it('getDefaultSettings 返回完整默认结构', () => {
    assert.deepStrictEqual(getDefaultSettings(), {
      theme: 'light', soundOn: true, style: 'classic', bgImage: null, fontSize: 'normal', textColor: 'auto',
    });
  });

  it('normalizeSettings(null) 返回默认', () => {
    assert.deepStrictEqual(normalizeSettings(null), getDefaultSettings());
  });

  it('normalizeSettings(undefined) 返回默认', () => {
    assert.deepStrictEqual(normalizeSettings(undefined), getDefaultSettings());
  });

  it('normalizeSettings({}) 仍补全默认字段', () => {
    const r = normalizeSettings({});
    assert.strictEqual(r.theme, 'light');
    assert.strictEqual(r.soundOn, true);
    assert.strictEqual(r.style, 'classic');
    assert.strictEqual(r.bgImage, null);
    assert.strictEqual(r.fontSize, 'normal');
    assert.strictEqual(r.textColor, 'auto');
  });

  it('normalizeSettings 保留合法字段', () => {
    const r = normalizeSettings({ theme: 'dark', soundOn: false, style: 'depth', bgImage: 'data:abc', fontSize: 'large', textColor: 'white' });
    assert.deepStrictEqual(r, { theme: 'dark', soundOn: false, style: 'depth', bgImage: 'data:abc', fontSize: 'large', textColor: 'white' });
  });

  it('normalizeSettings 规范化非法 theme / style，空串 bgImage 回落 null', () => {
    const r = normalizeSettings({ theme: 'xxx', style: 'blur', bgImage: '' });
    assert.strictEqual(r.theme, 'light');   // 非法主题回落浅色
    assert.strictEqual(r.style, 'classic'); // 非法风格回落经典
    assert.strictEqual(r.bgImage, null);    // 空串背景回落 null
  });

  it('normalizeSettings 部分字段输入不覆盖其它默认', () => {
    const r = normalizeSettings({ soundOn: false });
    assert.strictEqual(r.theme, 'light');
    assert.strictEqual(r.soundOn, false);
    assert.strictEqual(r.style, 'classic');
    assert.strictEqual(r.bgImage, null);
    assert.strictEqual(r.fontSize, 'normal');
    assert.strictEqual(r.textColor, 'auto');
  });
});
