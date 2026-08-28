import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getThemeVars, normalizeTheme, THEME_TOKENS } from '../src/app-core.js';

describe('Issue 17: 浅/深主题 Token', () => {
  it('light 主题的背景/卡片/文字变量', () => {
    const v = getThemeVars('light');
    assert.strictEqual(v['--bg'], '#F4F5FA');
    assert.strictEqual(v['--card'], '#FFFFFF');
    assert.strictEqual(v['--text'], '#1A1D29');
  });

  it('dark 主题反转背景与文字（深色底/浅色字）', () => {
    const v = getThemeVars('dark');
    assert.strictEqual(v['--bg'], '#0E1014');
    assert.strictEqual(v['--card'], '#1A1D24');
    assert.strictEqual(v['--text'], '#EDEFF4');
    // 深色主题背景必须明显深于文字
    assert.notStrictEqual(v['--bg'], v['--text']);
  });

  it('dark 主题保留关键强调色且语义正确', () => {
    const v = getThemeVars('dark');
    assert.ok(v['--accent'] && v['--accent'] !== '#FFF');
    assert.strictEqual(v['--danger'], '#FF5B56');
  });

  it('两个主题都包含完整的基础变量集', () => {
    const keys = Object.keys(THEME_TOKENS.light);
    for (const k of keys) {
      assert.ok(THEME_TOKENS.dark[k], 'dark 缺少变量 ' + k);
    }
  });

  it('normalizeTheme 仅 dark 合法，其余回退 light', () => {
    assert.strictEqual(normalizeTheme('dark'), 'dark');
    assert.strictEqual(normalizeTheme('light'), 'light');
    assert.strictEqual(normalizeTheme(''), 'light');
    assert.strictEqual(normalizeTheme(null), 'light');
    assert.strictEqual(normalizeTheme('DARK'), 'light');
    assert.strictEqual(normalizeTheme('sepia'), 'light');
  });

  it('getThemeVars 对非法输入回退到 light', () => {
    assert.strictEqual(getThemeVars('unknown')['--bg'], '#F4F5FA');
  });
});
