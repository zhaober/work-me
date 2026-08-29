// Issue-35: 自定义背景上文字看不清，需支持自定义字体大小与颜色
// 实现：settings 新增 fontSize / textColor；CSS 加 --app-font-scale、文字颜色覆盖、
//       有背景时自动给关键文字加 text-shadow；「我的」页提供选 chips。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  getDefaultSettings,
  normalizeSettings,
  FONT_SIZE_OPTIONS,
  TEXT_COLOR_OPTIONS,
  getFontScale,
  getThemeVars,
} from '../src/app-core.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(__dirname, '..', 'work-memo-app.html'), 'utf8');

test('settings默认值包含 fontSize 与 textColor', () => {
  const d = getDefaultSettings();
  assert.equal(d.fontSize, 'normal');
  assert.equal(d.textColor, 'auto');
});

test('normalizeSettings 规范化 fontSize 与 textColor', () => {
  const r = normalizeSettings({ fontSize: 'large', textColor: 'white' });
  assert.equal(r.fontSize, 'large');
  assert.equal(r.textColor, 'white');
});

test('normalizeSettings 对非法 fontSize/textColor 回落默认值', () => {
  const r = normalizeSettings({ fontSize: 'xxx', textColor: 'red' });
  assert.equal(r.fontSize, 'normal');
  assert.equal(r.textColor, 'auto');
});

test('getFontScale 返回四种档位缩放值', () => {
  assert.equal(getFontScale('small'), 0.875);
  assert.equal(getFontScale('normal'), 1);
  assert.equal(getFontScale('large'), 1.125);
  assert.equal(getFontScale('huge'), 1.25);
});

test('主题 token 包含 text-shadow 用于背景上图', () => {
  assert.ok(getThemeVars('light')['--text-shadow']);
  assert.ok(getThemeVars('dark')['--text-shadow']);
});

test('HTML CSS 定义了字体大小档位与文字颜色覆盖', () => {
  assert.match(html, /\.app\.fs-small\s*\{\s*--app-font-scale:0\.875;\s*\}/);
  assert.match(html, /\.app\.fs-huge\s*\{\s*--app-font-scale:1\.25;\s*\}/);
  assert.match(html, /\[data-text-color="white"\]\s*\{\s*--text:#FFFFFF;/);
  assert.match(html, /\[data-text-color="black"\]\s*\{\s*--text:#000000;/);
});

test('关键文字类使用 --app-font-scale 缩放', () => {
  assert.match(html, /\.t-greet\{font-size:calc\(20px \* var\(--app-font-scale\)\)/);
  assert.match(html, /\.t-title\{font-size:calc\(22px \* var\(--app-font-scale\)\)/);
  assert.match(html, /\.head \.title\{font-size:calc\(18px \* var\(--app-font-scale\)\)/);
});

test('applyBackground 在有背景时给 app 添加/移除 has-bg 类', () => {
  const fn = html.substring(
    html.indexOf('function applyBackground(img)'),
    html.indexOf('function applyFontSize')
  );
  assert.match(fn, /classList\.add\('has-bg'\)/);
  assert.match(fn, /classList\.remove\('has-bg'\)/);
});

test('renderMe 渲染字体大小与文字颜色选项 chips', () => {
  assert.match(html, /data-font-size-opt/);
  assert.match(html, /data-text-color-opt/);
});

test('事件委托中绑定了字体大小与文字颜色 chips', () => {
  assert.match(html, /var fsopt=e\.target\.closest\('\[data-font-size-opt\]'\);/);
  assert.match(html, /var tcopt=e\.target\.closest\('\[data-text-color-opt\]'\);/);
});
