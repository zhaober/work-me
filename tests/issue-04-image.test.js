import { describe, it } from 'node:test';
import assert from 'node:assert';
import { hasImage } from '../src/app-core.js';

describe('Issue 04: 图片大图预览（hasImage 判定）', () => {
  it('有图片 data URL 时返回 true', () => {
    assert.strictEqual(hasImage({ image: 'data:image/png;base64,AAAA' }), true);
  });

  it('image 为 null 时返回 false', () => {
    assert.strictEqual(hasImage({ image: null }), false);
  });

  it('image 为空字符串时返回 false', () => {
    assert.strictEqual(hasImage({ image: '' }), false);
  });

  it('记录对象缺失 image 字段时返回 false', () => {
    assert.strictEqual(hasImage({ title: '无图' }), false);
  });

  it('入参为 null / undefined 时不抛错且返回 false', () => {
    assert.strictEqual(hasImage(null), false);
    assert.strictEqual(hasImage(undefined), false);
  });
});
