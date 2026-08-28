import { describe, it } from 'node:test';
import assert from 'node:assert';
import { STYLE_LIST, STYLE_LABELS, STYLE_TOKENS, normalizeStyle, getStyleLabel, getStyleTokens } from '../src/app-core.js';

describe('Issue 18: UI 风格与背景', () => {
  it('STYLE_LIST 包含 经典/液态玻璃/极简/景深', () => {
    assert.deepStrictEqual(STYLE_LIST, ['classic', 'glass', 'minimal', 'depth']);
  });

  it('每个风格都有中文标签', () => {
    STYLE_LIST.forEach(s => assert.ok(STYLE_LABELS[s], '缺少标签: ' + s));
    assert.strictEqual(STYLE_LABELS.glass, '液态玻璃');
    assert.strictEqual(STYLE_LABELS.minimal, '极简');
  });

  it('getStyleTokens 返回风格视觉元数据', () => {
    assert.strictEqual(getStyleTokens('glass').surface, 'glass');
    assert.strictEqual(getStyleTokens('glass').blur, 18);
    assert.strictEqual(getStyleTokens('depth').elevation, 'strong');
    assert.strictEqual(getStyleTokens('minimal').surface, 'flat');
  });

  it('normalizeStyle 仅合法值通过，其余回退 classic', () => {
    assert.strictEqual(normalizeStyle('glass'), 'glass');
    assert.strictEqual(normalizeStyle('depth'), 'depth');
    assert.strictEqual(normalizeStyle(''), 'classic');
    assert.strictEqual(normalizeStyle(null), 'classic');
    assert.strictEqual(normalizeStyle('blur'), 'classic');
  });

  it('getStyleLabel 非法输入回退经典', () => {
    assert.strictEqual(getStyleLabel('unknown'), '经典');
    assert.strictEqual(getStyleLabel('depth'), '景深');
  });
});
