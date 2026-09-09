// issue-59: 课表 UI 仿 WakeUp 改版
// - weekdayDateNums 纯函数正确性（表头日期数字）
// - renderSchedule 生成 WakeUp 式结构：hero 信息栏 / 表头周几+日期 / 节次两行时间
// - 课程块去左侧竖条（纯色圆角），功能标记保留（data-sid / 添加课程 / 导入Excel / 当前时间线）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { weekdayDateNums } from '../src/schedule-core.js';

const HTML = readFileSync(new URL('../work-memo-app.html', import.meta.url), 'utf8');

test('weekdayDateNums: 返回本周(周一~周五)日期数字', () => {
  // 2026-09-09 是周三 (dow0=2)，本周一 = 9/7
  assert.deepEqual(weekdayDateNums('2026-09-09', 2, 0), [7, 8, 9, 10, 11]);
});

test('weekdayDateNums: weekDelta=1 得到下一周日期', () => {
  assert.deepEqual(weekdayDateNums('2026-09-09', 2, 1), [14, 15, 16, 17, 18]);
});

test('weekdayDateNums: 周一(dow0=0) 与跨月正确', () => {
  // 2026-08-31 是周一，本周 [31, 1, 2, 3, 4]（跨月）
  assert.deepEqual(weekdayDateNums('2026-08-31', 0, 0), [31, 1, 2, 3, 4]);
});

test('weekdayDateNums: weekDelta=-1 回到上周', () => {
  // 本周一 9/7 → 上周 [31,1,2,3,4]
  assert.deepEqual(weekdayDateNums('2026-09-09', 2, -1), [31, 1, 2, 3, 4]);
});

test('renderSchedule 生成 WakeUp 式顶部信息栏（第N周 周X + 日期）', () => {
  assert.match(HTML, /class="schedule-hero"/);
  assert.match(HTML, /sh-week">第'\+viewWeek\+'周 '\+WEEKDAY_NAMES\[todayDow\]/);
  assert.match(HTML, /sh-date/);
  assert.match(HTML, /nowDate\.getFullYear\(\)\s*\+\s*'\/'/);
});

test('表头含周几与日期数字，今天高亮 today-h', () => {
  assert.match(HTML, /weekdayDateNums\(TODAY, todayDow, schViewWeek\)/);
  assert.match(HTML, /<span class="sg-wd">'\+WEEKDAY_NAMES\[wd\]/);
  assert.match(HTML, /<span class="sg-date">'\+dateNums\[wd\]/);
  assert.match(HTML, /\.schedule-grid \.sg-header\.today-h\{background:var\(--text\)/);
});

test('节次列起止时间拆两行显示', () => {
  assert.match(HTML, /sg-pnum">'\+block\.label/);
  assert.match(HTML, /timeLabel\|\|''\)\.split\(\/\[-\\u2013\]\//);
});

test('课程块改为纯色圆角（无左侧竖条）', () => {
  assert.match(HTML, /\.sg-block\{border-radius:8px;/);
  assert.doesNotMatch(HTML, /\.sg-block\{[^}]*border-left:3px solid/);
  assert.ok(!HTML.includes("border-left-color:'+s.color"), '渲染处不应再输出 border-left-color');
});

test('功能回归：关键交互标记保留', () => {
  assert.match(HTML, /data-sid="\'\+s\.id\+\'"/);
  assert.match(HTML, /id="schAddCourse"/);
  assert.match(HTML, /id="schImportBtn"/);
  assert.match(HTML, /id="schExcelInput"/);
  assert.match(HTML, /class="sg-now-line"/);
  assert.match(HTML, /import \{[^}]*weekdayDateNums[^}]*\} from '\.\/src\/schedule-core\.js';/);
});

test('schedule-core.js 与 Capacitor www 镜像一致（APK 不缺文件）', () => {
  const main = readFileSync(new URL('../src/schedule-core.js', import.meta.url), 'utf8');
  const mirror = readFileSync(new URL('../WorkMemoApp/www/src/schedule-core.js', import.meta.url), 'utf8');
  assert.equal(main, mirror, 'src/schedule-core.js 必须与 WorkMemoApp/www/src/schedule-core.js 完全一致');
});
