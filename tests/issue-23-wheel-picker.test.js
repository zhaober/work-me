// Issue-23: 添加重要日子和提醒要求手动输入（YYYY-MM-DD / HH:MM），体验差且易填错
// 修复：改为滚轮（滚盘）选择。
//   - 新增通用滚盘组件 openWheel（原生滚动 + scroll-snap，中央高亮带）
//   - openDateWheel：年/月/日三列，切换年或月时自动重建「日」列（含闰年 2 月 29 日）
//   - openTimeWheel：时/分两列
//   - 应用范围：重要日子日期、记录日期、提醒时间（三者原本都是手写输入）
// 日期/时间的计算逻辑抽到 app-core.js 便于测试。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  isLeapYear,
  daysInMonth,
  buildDateWheelOptions,
  buildTimeWheelOptions,
  clampDay,
  wheelValue,
  wheelIndex,
  formatWheelDate,
  formatWheelTime,
  parseWheelDate,
  parseWheelTime,
} from '../src/app-core.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(__dirname, '..', 'work-memo-app.html'), 'utf8');

/* ---------- 闰年 / 月天数 ---------- */

test('isLeapYear 正确判断闰年，非数字返回 false', () => {
  assert.equal(isLeapYear(2024), true);
  assert.equal(isLeapYear(2000), true, '整百年需被 400 整除才是闰年');
  assert.equal(isLeapYear(1900), false);
  assert.equal(isLeapYear(2026), false);
  assert.equal(isLeapYear('abc'), false);
  assert.equal(isLeapYear(null), false);
});

test('daysInMonth 返回各月天数，2 月随闰年变化，非法月份返回 0', () => {
  assert.equal(daysInMonth(2026, 2), 28);
  assert.equal(daysInMonth(2024, 2), 29);
  assert.equal(daysInMonth(2026, 1), 31);
  assert.equal(daysInMonth(2026, 4), 30);
  assert.equal(daysInMonth(2026, 13), 0);
  assert.equal(daysInMonth(2026, 0), 0);
});

/* ---------- 滚轮选项 ---------- */

test('buildDateWheelOptions 生成 年/月/日 三列', () => {
  const o = buildDateWheelOptions(2026, 8, { yearRange: 10 });
  assert.equal(o.years.length, 21, '前后各 10 年 + 当年');
  assert.equal(o.years[0], 2016);
  assert.equal(o.years[20], 2036);
  assert.deepEqual(o.months, [1,2,3,4,5,6,7,8,9,10,11,12]);
  assert.equal(o.days.length, 31, '8 月 31 天');
});

test('buildDateWheelOptions 的「日」随年月变化（2 月闰年 29 天）', () => {
  assert.equal(buildDateWheelOptions(2026, 2).days.length, 28);
  assert.equal(buildDateWheelOptions(2024, 2).days.length, 29);
  assert.equal(buildDateWheelOptions(2026, 4).days.length, 30);
});

test('buildTimeWheelOptions 生成 0-23 时与按步长的分钟', () => {
  const t = buildTimeWheelOptions(1);
  assert.equal(t.hours.length, 24);
  assert.equal(t.hours[0], 0);
  assert.equal(t.hours[23], 23);
  assert.equal(t.minutes.length, 60);
  const t5 = buildTimeWheelOptions(5);
  assert.equal(t5.minutes.length, 12);
  assert.deepEqual(t5.minutes.slice(0, 4), [0, 5, 10, 15]);
});

/* ---------- 越界夹取 ---------- */

test('clampDay 把越界日期夹到当月最后一天（切换年月时防止 2 月 31 日）', () => {
  assert.equal(clampDay(2026, 2, 31), 28);
  assert.equal(clampDay(2024, 2, 31), 29);
  assert.equal(clampDay(2026, 4, 31), 30);
  assert.equal(clampDay(2026, 1, 0), 1);
  assert.equal(clampDay(2026, 1, 15), 15, '合法日期保持原值');
});

/* ---------- 索引 <-> 值 ---------- */

test('wheelValue 索引越界时夹到首尾', () => {
  const opts = [10, 20, 30];
  assert.equal(wheelValue(opts, 1), 20);
  assert.equal(wheelValue(opts, -5), 10);
  assert.equal(wheelValue(opts, 99), 30);
  assert.equal(wheelValue([], 0), undefined);
});

test('wheelIndex 找不到值时回退到 0', () => {
  assert.equal(wheelIndex([10, 20, 30], 20), 1);
  assert.equal(wheelIndex([10, 20, 30], 99), 0);
});

/* ---------- 格式化 / 解析 ---------- */

test('formatWheelDate / formatWheelTime 补零到两位', () => {
  assert.equal(formatWheelDate(2026, 8, 9), '2026-08-09');
  assert.equal(formatWheelDate(2026, 12, 31), '2026-12-31');
  assert.equal(formatWheelTime(9, 5), '09:05');
  assert.equal(formatWheelTime(18, 0), '18:00');
});

test('parseWheelDate 解析合法日期并拒绝非法日期', () => {
  assert.deepEqual(parseWheelDate('2026-08-09'), { y: 2026, m: 8, d: 9 });
  assert.equal(parseWheelDate('2026-02-30'), null, '2 月 30 日应判非法');
  assert.equal(parseWheelDate('2026-13-01'), null);
  assert.equal(parseWheelDate('2026/08/09'), null);
  assert.equal(parseWheelDate(''), null);
  assert.equal(parseWheelDate(null), null);
});

test('parseWheelTime 解析合法时间并拒绝越界时间', () => {
  assert.deepEqual(parseWheelTime('09:05'), { h: 9, m: 5 });
  assert.deepEqual(parseWheelTime('18:00'), { h: 18, m: 0 });
  assert.equal(parseWheelTime('25:00'), null);
  assert.equal(parseWheelTime('12:60'), null);
  assert.equal(parseWheelTime('1200'), null);
});

/* ---------- 源码接线 ---------- */

test('页面存在滚盘组件：遮罩、列容器、中央高亮带、可吸附滚动项', () => {
  for (const id of ['wheelOverlay', 'wheelCols', 'wheelTitle', 'wheelOk', 'wheelCancel']) {
    assert.ok(html.includes(`id="${id}"`), `缺少滚盘元素 #${id}`);
  }
  assert.match(html, /\.wheel-item\{[^}]*scroll-snap-align:center/, '滚盘项需 scroll-snap-align:center');
  assert.match(html, /\.wheel-col\{[^}]*scroll-snap-type:y mandatory/, '滚盘列需 scroll-snap-type:y mandatory');
  assert.match(html, /\.wheel-band\{/, '缺少中央高亮带');
});

test('「日」列声明 rebuild，切换年/月时自动重建', () => {
  assert.match(html, /rebuild:\s*function\(v\)\{ return buildDateWheelOptions/, '日列需随年月重建');
  assert.match(html, /function refreshWheelCols/, '缺少依赖列刷新逻辑');
  assert.match(html, /sameArray\(next, col\.options\)/, '内容未变时不重建，避免滚动事件递归');
});

test('重要日子：日期改为滚盘按钮，不再是手写输入框', () => {
  assert.match(html, /class="wheel-field" id="eventDate"/, '重要日子日期应为可点击的滚盘字段');
  assert.match(html, /id="eventDateText"/, '缺少日期显示节点');
  assert.ok(
    !html.includes('placeholder="YYYY-MM-DD"'),
    '不应再保留手写的 YYYY-MM-DD 输入框'
  );
});

test('重要日子 / 记录日期 / 提醒时间 均改为打开滚盘', () => {
  assert.match(html, /openDateWheel\('选择日期'/, '重要日子日期应打开日期滚盘');
  assert.match(html, /openTimeWheel\('设置提醒时间'/, '提醒应打开时间滚盘');
  // 编辑器里的日期也一并改为滚盘（原本同为手写 YYYY-MM-DD）
  assert.match(html, /parseWheelDate\(editing\.data\.date\)/, '记录日期应改用滚盘');
  assert.ok(
    !html.includes("openPromptModal('设置提醒时间'"),
    '提醒不应再用文本输入'
  );
  assert.ok(
    !html.includes("openPromptModal('选择日期'"),
    '记录日期不应再用文本输入'
  );
});

test('滚盘确定后回填格式化结果', () => {
  assert.match(html, /formatWheelDate\(v\.year, v\.month, v\.day\)/, '日期滚盘结果需格式化回填');
  assert.match(html, /formatWheelTime\(v\.hour, v\.minute\)/, '时间滚盘结果需格式化回填');
});
