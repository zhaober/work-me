// issue-63: 课表 7 列含周六周日 + WakeUp 细长比例
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { weekdayDateNums } from '../src/schedule-core.js';

const HTML = readFileSync(new URL('../work-memo-app.html', import.meta.url), 'utf8');

test('weekdayDateNums 覆盖 7 天（含周六周日）', () => {
  assert.equal(weekdayDateNums('2026-09-09', 2, 0).length, 7);
  assert.deepEqual(weekdayDateNums('2026-09-09', 2, 0), [7, 8, 9, 10, 11, 12, 13]);
});

test('renderSchedule 网格包含周六周日', () => {
  assert.match(HTML, /var weekdays = \[0,1,2,3,4,5,6\];/);
  assert.match(HTML, /WakeUp 式 7 列/);
});

test('网格为 7 列布局且时间列收窄（WakeUp 比例）', () => {
  assert.match(HTML, /grid-template-columns:40px repeat\(7,1fr\)/);
  assert.doesNotMatch(HTML, /repeat\(5,1fr\)/, '不应残留 5 列布局');
});

test('单元格高度符合 WakeUp 细长比例（一块2节 min-height 88px）', () => {
  assert.match(HTML, /\.sg-cell\{background:var\(--bg\);min-height:88px/);
});

test('窄列字号适配（表头/节次/课程块）', () => {
  assert.match(HTML, /\.schedule-grid \.sg-header\{background:var\(--card\);padding:5px 1px;font-size:10px/);
  assert.match(HTML, /\.sg-pnum\{font-size:12px/);
  assert.match(HTML, /\.sg-block\{border-radius:8px;padding:5px 4px;font-size:9px/);
});

test('schedule-core.js 与 Capacitor www 镜像一致（APK 不缺文件）', () => {
  const main = readFileSync(new URL('../src/schedule-core.js', import.meta.url), 'utf8');
  const mirror = readFileSync(new URL('../WorkMemoApp/www/src/schedule-core.js', import.meta.url), 'utf8');
  assert.equal(main, mirror);
});
