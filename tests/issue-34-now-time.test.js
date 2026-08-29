// Issue-34: 新建计划时间默认显示 09:00，不是实时时间
// 修复：app-core 新增 getNowTime()，新建记录时 time 默认使用当前时间。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { getNowTime, formatWheelTime } from '../src/app-core.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(__dirname, '..', 'work-memo-app.html'), 'utf8');

test('getNowTime 返回当前 HH:MM', () => {
  const t = getNowTime();
  assert.match(t, /^\d{2}:\d{2}$/);
  const d = new Date();
  assert.equal(t, formatWheelTime(d.getHours(), d.getMinutes()));
});

test('loadEditor 新建记录时 time 默认使用 getNowTime()', () => {
  const fn = html.substring(
    html.indexOf('function loadEditor(type, recId, folderId)'),
    html.indexOf('function renderTags')
  );
  assert.doesNotMatch(fn, /time:'09:00'/);
  assert.match(fn, /time:getNowTime\(\)/);
});

test('app-core.js 导出了 getNowTime 且不等于硬编码 09:00', () => {
  assert.notEqual(getNowTime(), '09:00');
});
