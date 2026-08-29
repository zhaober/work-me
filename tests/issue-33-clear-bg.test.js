// Issue-33: 自定义背景「清除」按钮点击无效
// 根因：清除按钮 span 位于 data-bg-upload 行内，事件委托中先判断了 data-bg-upload，
//       导致点击清除按钮时被误判为「上传」而触发文件选择，清除逻辑未执行。
// 修复：在事件委托中先判断 data-bg-clear，再判断 data-bg-upload。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(__dirname, '..', 'work-memo-app.html'), 'utf8');

test('存在 data-bg-clear 清除按钮绑定', () => {
  assert.match(html, /data-bg-clear/);
  assert.match(html, /onBgClear\s*\(\)/);
});

test('事件委托中 data-bg-clear 判断须先于 data-bg-upload', () => {
  const clearIdx = html.indexOf("var bc=e.target.closest('[data-bg-clear]');");
  const uploadIdx = html.indexOf("var bu=e.target.closest('[data-bg-upload]');");
  assert.ok(clearIdx > 0, '未找到 data-bg-clear 判断');
  assert.ok(uploadIdx > 0, '未找到 data-bg-upload 判断');
  assert.ok(clearIdx < uploadIdx, 'data-bg-clear 必须排在 data-bg-upload 之前');
});

test('onBgClear 正确清空 settings.bgImage 并移除背景变量', () => {
  const fn = html.substring(
    html.indexOf('function onBgClear()'),
    html.indexOf('function renderMe()')
  );
  assert.match(fn, /s\.bgImage\s*=\s*null/);
  assert.match(fn, /applyBackground\(null\)/);
  assert.match(fn, /saveDB\(\)/);
  assert.match(fn, /renderMe\(\)/);
});
