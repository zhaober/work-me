// issue-60: 课表桌面小组件（今日课程 2x2 + 近日课程 4x2）
// - buildWidgetPayload 纯逻辑：无学期 / 正常课表（周次过滤+排序+时间映射）/ recent 三天 / maxPerDay
// - JS 桥接：syncScheduleWidget 定义与挂载点（saveDB + boot）
// - 原生完整性：Java Provider / 插件 / Manifest 注册 / layouts / widget-info
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { buildWidgetPayload, getDefaultSchedule } from '../src/schedule-core.js';

const HTML = readFileSync(new URL('../work-memo-app.html', import.meta.url), 'utf8');
const APK_ROOT = new URL('../WorkMemoApp/android/app/src/main/', import.meta.url);

function semWith(startDate, sessions) {
  const s = getDefaultSchedule();
  const id = 'sem1';
  s.activeSemesterId = id;
  s.semesters = { [id]: { id, name: '测试学期', startDate, totalWeeks: 18, sessions } };
  return s;
}

test('buildWidgetPayload: 无学期时返回 hasSemester=false 且列表为空', () => {
  const p = buildWidgetPayload(getDefaultSchedule(), '2026-09-09', 3);
  assert.equal(p.hasSemester, false);
  assert.equal(p.today.total, 0);
  assert.deepEqual(p.today.courses, []);
  assert.equal(p.recent.length, 0);
});

test('buildWidgetPayload: 正常课表 — 当天课程按节次排序、时间来自节次块', () => {
  // 2026-09-09 周三；8/31 开学 → 第2周
  const s = semWith('2026-08-31', [
    { id: 'a', courseName: '下午课', classroom: 'B201', weekday: 2, periodStart: 5, periodEnd: 6, weeks: null, singleWeeks: null },
    { id: 'b', courseName: '上午课', classroom: 'A101', weekday: 2, periodStart: 3, periodEnd: 4, weeks: null, singleWeeks: null },
  ]);
  const p = buildWidgetPayload(s, '2026-09-09', 3);
  assert.equal(p.hasSemester, true);
  assert.equal(p.weekNum, 2);
  assert.equal(p.dowName, '周三');
  assert.equal(p.today.total, 2);
  assert.equal(p.today.courses[0].name, '上午课'); // 节次靠前在前
  assert.equal(p.today.courses[0].start, '10:00');
  assert.equal(p.today.courses[0].end, '11:40');
  assert.equal(p.today.courses[0].room, 'A101');
});

test('buildWidgetPayload: recent 含今天起3天且逐日dow递增', () => {
  const s = semWith('2026-08-31', [
    { id: 'c', courseName: '周五课', classroom: '', weekday: 4, periodStart: 1, periodEnd: 2, weeks: null, singleWeeks: null },
  ]);
  const p = buildWidgetPayload(s, '2026-09-09', 3);
  assert.equal(p.recent.length, 3);
  assert.deepEqual(p.recent.map(r => r.dow), [2, 3, 4]); // 周三/四/五
  assert.equal(p.recent[0].date, '2026-09-09');
  assert.equal(p.recent[2].courses[0].name, '周五课');
});

test('buildWidgetPayload: maxPerDay 截断但 total 保留全量', () => {
  const mk = (id, ps) => ({ id, courseName: '课' + id, classroom: '', weekday: 2, periodStart: ps, periodEnd: ps + 1, weeks: null, singleWeeks: null });
  const s = semWith('2026-08-31', [mk('x1', 1), mk('x2', 3), mk('x3', 5), mk('x4', 7)]);
  const p = buildWidgetPayload(s, '2026-09-09', 3);
  assert.equal(p.today.courses.length, 3);   // widget 槽位截断
  assert.equal(p.today.total, 4);            // 但统计是全量
});

test('JS 桥接：syncScheduleWidget 定义并在 saveDB 与 boot 挂载', () => {
  assert.match(HTML, /function syncScheduleWidget\(\)/);
  assert.match(HTML, /window\.Capacitor[\s\S]*?Plugins[\s\S]*?WidgetBridge/);
  assert.match(HTML, /bridge\.saveToday\(\{ payload: JSON\.stringify\(payload\) \}\)/);
  assert.match(HTML, /function saveDB\(\)\{\s*\n\s*syncScheduleWidget\(\);/);
  assert.match(HTML, /renderSchedule\(\);\s*\n\s*syncScheduleWidget\(\);\s*\n\s*maybeAutoShowQuote\(\);/);
  assert.match(HTML, /buildWidgetPayload } from '\.\/src\/schedule-core\.js';/);
});

test('原生：Java Provider / 插件 / MainActivity 注册齐全', () => {
  const p = f => existsSync(new URL(f, APK_ROOT));
  assert.ok(p('java/com/workmemo/app/TodayWidgetProvider.java'), 'TodayWidgetProvider 缺失');
  assert.ok(p('java/com/workmemo/app/RecentWidgetProvider.java'), 'RecentWidgetProvider 缺失');
  assert.ok(p('java/com/workmemo/app/WidgetBridgePlugin.java'), 'WidgetBridgePlugin 缺失');
  const main = readFileSync(new URL('java/com/workmemo/app/MainActivity.java', APK_ROOT), 'utf8');
  assert.match(main, /registerPlugin\(WidgetBridgePlugin\.class\)/);
  const today = readFileSync(new URL('java/com/workmemo/app/TodayWidgetProvider.java', APK_ROOT), 'utf8');
  assert.match(today, /extends AppWidgetProvider/);
  assert.match(today, /static RemoteViews buildViews/);
});

test('原生：Manifest 注册两个 widget receiver 与元数据', () => {
  const mf = readFileSync(new URL('AndroidManifest.xml', APK_ROOT), 'utf8');
  assert.match(mf, /<receiver[\s\S]*?\.TodayWidgetProvider[\s\S]*?APPWIDGET_UPDATE[\s\S]*?@xml\/widget_today_info/);
  assert.match(mf, /<receiver[\s\S]*?\.RecentWidgetProvider[\s\S]*?APPWIDGET_UPDATE[\s\S]*?@xml\/widget_recent_info/);
});

test('原生：layouts / widget-info / drawable / strings 资源齐全', () => {
  const p = f => existsSync(new URL(f, APK_ROOT));
  assert.ok(p('res/layout/widget_today.xml'));
  assert.ok(p('res/layout/widget_recent.xml'));
  assert.ok(p('res/drawable/widget_bg.xml'));
  assert.ok(p('res/xml/widget_today_info.xml'));
  assert.ok(p('res/xml/widget_recent_info.xml'));
  const strings = readFileSync(new URL('res/values/strings.xml', APK_ROOT), 'utf8');
  assert.match(strings, /widget_today_desc/);
  assert.match(strings, /widget_recent_desc/);
  const layout = readFileSync(new URL('res/layout/widget_today.xml', APK_ROOT), 'utf8');
  assert.match(layout, /@id\/wt_date|@\+id\/wt_date/);
});

test('schedule-core.js 与 Capacitor www 镜像一致（APK 不缺文件）', () => {
  const main = readFileSync(new URL('../src/schedule-core.js', import.meta.url), 'utf8');
  const mirror = readFileSync(new URL('../WorkMemoApp/www/src/schedule-core.js', import.meta.url), 'utf8');
  assert.equal(main, mirror);
});
