import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SYSTEM_FONT_STACK } from '../src/app-core.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(__dirname, '..', 'work-memo-app.html'), 'utf8');

/** 把 CSS 的 font-family 列表解析成数组，便于与常量比对 */
function parseFontList(cssValue) {
  return cssValue
    .split(',')
    .map((s) => s.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
}

test('不再引用 Google Fonts 域名', () => {
  assert.doesNotMatch(html, /fonts\.googleapis\.com/, '仍引用 fonts.googleapis.com');
  assert.doesNotMatch(html, /fonts\.gstatic\.com/, '仍引用 fonts.gstatic.com');
});

test('没有任何指向外部域的阻塞渲染资源（stylesheet / preconnect）', () => {
  const externalCss = /<link[^>]+rel=["']stylesheet["'][^>]+href=["']https?:\/\//i;
  assert.doesNotMatch(html, externalCss, '存在外部样式表，弱网时会阻塞首屏');
  assert.doesNotMatch(html, /<link[^>]+rel=["']preconnect["']/i, '存在 preconnect 外部连接');
});

test('页面不含任何远程脚本', () => {
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:\/\//i, '存在远程脚本，离线时会导致白屏');
});

test('字体栈不再依赖远程字体 Inter', () => {
  // Inter 是 Google Fonts 提供的远程字体，本地不存在时必须从 font-family 中移除
  assert.doesNotMatch(html, /font-family:[^;}]*["']?Inter["']?/i, 'font-family 仍包含远程字体 Inter');
});

test('body 使用系统字体栈，且与 SYSTEM_FONT_STACK 常量一致', () => {
  const m = html.match(/body\s*\{[^}]*?font-family:\s*([^;}]+)/);
  assert.ok(m, '未找到 body 的 font-family 声明');
  const fromCss = parseFontList(m[1]);
  const fromConst = parseFontList(SYSTEM_FONT_STACK);
  assert.deepStrictEqual(fromCss, fromConst, 'CSS 字体栈与 app-core 常量不一致，容易漂移');
});

test('系统字体栈覆盖中文与西文，并以通用族结尾', () => {
  const list = parseFontList(SYSTEM_FONT_STACK);
  assert.ok(list.length >= 3, '字体栈过于单薄');
  assert.ok(
    list.some((f) => /PingFang/i.test(f)),
    '缺少苹方（iOS / macOS 中文）'
  );
  assert.ok(
    list.some((f) => /YaHei/i.test(f)),
    '缺少微软雅黑（Windows 中文）'
  );
  assert.strictEqual(list[list.length - 1], 'sans-serif', '应以 sans-serif 兜底');
});

test('SYSTEM_FONT_STACK 不含任何需要联网加载的字体', () => {
  const remote = ['Inter', 'Roboto Mono', 'Noto Sans SC', 'Lato', 'Open Sans'];
  parseFontList(SYSTEM_FONT_STACK).forEach((f) => {
    assert.ok(!remote.includes(f), '字体栈含需联网加载的字体：' + f);
  });
});
