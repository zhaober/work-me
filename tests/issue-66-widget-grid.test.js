// issue-66: 小组件 UI 仿参考图（深色卡片 + 星期表头 + 时间列 + 彩色课程块）
// - 纯逻辑：buildWidgetGridPayload 的整周网格结构、colorIndex 下发、行裁剪
// - 原生：ScheduleWidgetProvider 的 ID 映射表、圆角色块 drawable 映射、空态与 GONE 行
// - 资源：drawable 数量与调色板严格一致；清单注册 + 文案；旧浅色背景已清除
// - JS：面板第三个入口（课表网格）+ 预览函数 + 同步 gridPayload
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  buildWidgetGridPayload, buildWidgetPayload, colorIndexOfCourse, colorForCourse,
  blockIndexForPeriod, blockStartTime, getDefaultSchedule, COURSE_COLORS, DEFAULT_PERIOD_BLOCKS,
} from '../src/schedule-core.js';

const HTML = readFileSync(new URL('../work-memo-app.html', import.meta.url), 'utf8');
const JAVA = readFileSync(new URL('../WorkMemoApp/android/app/src/main/java/com/workmemo/app/ScheduleWidgetProvider.java', import.meta.url), 'utf8');
const PLUGIN = readFileSync(new URL('../WorkMemoApp/android/app/src/main/java/com/workmemo/app/WidgetBridgePlugin.java', import.meta.url), 'utf8');
const TODAY_JAVA = readFileSync(new URL('../WorkMemoApp/android/app/src/main/java/com/workmemo/app/TodayWidgetProvider.java', import.meta.url), 'utf8');
const RECENT_JAVA = readFileSync(new URL('../WorkMemoApp/android/app/src/main/java/com/workmemo/app/RecentWidgetProvider.java', import.meta.url), 'utf8');
const LAYOUT = readFileSync(new URL('../WorkMemoApp/android/app/src/main/res/layout/widget_schedule.xml', import.meta.url), 'utf8');
const MANIFEST = readFileSync(new URL('../WorkMemoApp/android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8');
const STRINGS = readFileSync(new URL('../WorkMemoApp/android/app/src/main/res/values/strings.xml', import.meta.url), 'utf8');
const RES = new URL('../WorkMemoApp/android/app/src/main/res/', import.meta.url);
const root = (p) => fileURLToPath(new URL(p, RES));

function sem(over) {
  const s = getDefaultSchedule();
  s.semesters = {
    s1: Object.assign({
      id: 's1', name: '2025-2026 第一学期', startDate: '2026-08-31', totalWeeks: 20,
      sessions: [
        { id: 'a', courseName: '市场营销学', teacher: '曹欢', weekday: 2, periodStart: 3, periodEnd: 4, classroom: 'E-209', weeks: [[1, 18]], isOddEven: 'all' },
        { id: 'b', courseName: '大学英语', teacher: '马超', weekday: 0, periodStart: 1, periodEnd: 2, classroom: 'E-514', weeks: [[1, 18]], isOddEven: 'all' },
        { id: 'c', courseName: '跨节课程', teacher: '徐媛', weekday: 1, periodStart: 1, periodEnd: 4, classroom: 'C-303', weeks: [[1, 18]], isOddEven: 'all' },
      ],
    }, over),
  };
  s.activeSemesterId = 's1';
  return s;
}

/* ---------------- 纯逻辑 ---------------- */

test('网格：星期表头为 7 列且带日期数字、标出今天', () => {
  const p = buildWidgetGridPayload(sem(), '2026-09-08'); // 周二
  assert.equal(p.weekdays.length, 7);
  assert.deepEqual(p.weekdays.map(w => w.label), ['一', '二', '三', '四', '五', '六', '日']);
  assert.deepEqual(p.weekdays.map(w => w.dateNum), [7, 8, 9, 10, 11, 12, 13]);
  assert.deepEqual(p.weekdays.map(w => w.isToday), [false, true, false, false, false, false, false]);
  assert.equal(p.dowName, '周二');
  assert.equal(p.dateLabel, '2026.09.08');
  assert.equal(p.weekLabel, '第2周');
});

test('网格：课程画在起始节次所属的块上，跨块课程保留真实节次', () => {
  const p = buildWidgetGridPayload(sem(), '2026-09-08');
  // 周一第1-2节 = 大学英语；周二第1-4节 跨两块，落在第 0 行
  const row0 = p.rows.find(r => r.blockIndex === 0);
  assert.equal(row0.cells[0].name, '大学英语');
  assert.equal(row0.cells[0].room, 'E-514');
  assert.equal(row0.cells[0].periodLabel, '1-2节');
  assert.equal(row0.cells[1].name, '跨节课程');
  assert.equal(row0.cells[1].periodLabel, '1-4节');
  assert.equal(p.rows.find(r => r.blockIndex === 1).cells[1], null, '跨块课程不应重复画在第二行');
  assert.equal(p.rows.find(r => r.blockIndex === 1).cells[2].name, '市场营销学');
});

test('网格：只显示本周有课的节次块（行裁剪 + maxRows 上限）', () => {
  const p = buildWidgetGridPayload(sem(), '2026-09-08');
  assert.deepEqual(p.rows.map(r => r.blockIndex), [0, 1]);
  assert.equal(p.rowCount, 2);
  const capped = buildWidgetGridPayload(sem(), '2026-09-08', { maxRows: 1 });
  assert.equal(capped.rows.length, 1);
});

test('网格：整周无课时退回前 maxRows 个节次块，保持网格形态', () => {
  const p = buildWidgetGridPayload(sem({ startDate: '2026-08-31', sessions: [] }), '2026-09-08');
  assert.equal(p.hasSemester, true);
  assert.deepEqual(p.rows.map(r => r.blockIndex), [0, 1, 2, 3, 4]);
  assert.equal(p.rows[0].cells.filter(Boolean).length, 0);
  assert.equal(p.rows[0].time, '08:00');
  assert.equal(p.rows[0].label, DEFAULT_PERIOD_BLOCKS[0].label);
});

test('网格：单双周生效规则沿用（单周课在第2周不出现）', () => {
  const s = sem({
    sessions: [{ id: 'x', courseName: '单周体育', weekday: 0, periodStart: 1, periodEnd: 2, classroom: '操场', weeks: [[1, 18]], isOddEven: 'odd' }],
  });
  const w2 = buildWidgetGridPayload(s, '2026-09-08'); // 第2周（双周）
  assert.equal(w2.rows.length, 5, '无课时退回默认 5 行块');
  assert.equal(w2.rows[0].cells.filter(Boolean).length, 0);
  const w3 = buildWidgetGridPayload(s, '2026-09-15'); // 第3周（单周）
  assert.equal(w3.rows.length, 1);
  assert.equal(w3.rows[0].cells[0].name, '单周体育');
});

test('网格：无学期时仍给出星期表头，但没有周次与网格行', () => {
  const p = buildWidgetGridPayload(getDefaultSchedule(), '2026-09-08');
  assert.equal(p.hasSemester, false);
  assert.equal(p.weekLabel, '');
  assert.equal(p.rowCount, 0);
  assert.deepEqual(p.rows, []);
  assert.equal(p.weekdays.length, 7);
});

test('网格：非法日期不产生 NaN（回退到今天）', () => {
  const p = buildWidgetGridPayload(sem(), 'not-a-date');
  assert.equal(p.weekdays.length, 7);
  p.weekdays.forEach(w => assert.ok(Number.isFinite(w.dateNum), 'dateNum 不应为 NaN'));
  assert.match(p.dateLabel, /^\d{4}\.\d{2}\.\d{2}$/);
});

test('colorIndex：稳定、落在调色板范围内，且与 colorForCourse 一致', () => {
  COURSE_COLORS.forEach((hex) => { /* 断言调色板本身合法 */ assert.match(hex, /^#[0-9A-F]{6}$/i); });
  assert.equal(colorIndexOfCourse('大学英语'), colorIndexOfCourse('大学英语'));
  const idx = colorIndexOfCourse('大学英语');
  assert.ok(idx >= 0 && idx < COURSE_COLORS.length);
  assert.equal(colorForCourse('大学英语'), COURSE_COLORS[idx]);
  assert.equal(colorIndexOfCourse(''), colorIndexOfCourse(null));
  // 2026-09-08 是周二 → 今日唯一课程为「跨节课程」
  const today = buildWidgetPayload(sem(), '2026-09-08').today.courses;
  assert.equal(today.length, 1);
  assert.equal(today[0].name, '跨节课程');
  assert.equal(today[0].colorIndex, colorIndexOfCourse('跨节课程'));
});

test('辅助函数：blockIndexForPeriod / blockStartTime', () => {
  assert.equal(blockIndexForPeriod(4, DEFAULT_PERIOD_BLOCKS), 1);
  assert.equal(blockIndexForPeriod(9, DEFAULT_PERIOD_BLOCKS), 4);
  assert.equal(blockIndexForPeriod(99, DEFAULT_PERIOD_BLOCKS), -1);
  assert.equal(blockStartTime(DEFAULT_PERIOD_BLOCKS[0]), '08:00');
  assert.equal(blockStartTime(null), '');
});

/* ---------------- 原生资源 ---------------- */

test('资源：圆角色块 drawable 与调色板一一对应', () => {
  assert.equal(COURSE_COLORS.length, 10, 'Java 端 CELL_BG 数量需与调色板同步');
  COURSE_COLORS.forEach((hex, i) => {
    const p = root('drawable/wc_bg_' + i + '.xml');
    assert.ok(existsSync(p), '缺少 ' + p);
    const xml = readFileSync(p, 'utf8');
    assert.match(xml, new RegExp(hex, 'i'), 'wc_bg_' + i + ' 颜色应与 COURSE_COLORS[' + i + '] 一致');
    assert.match(xml, /<corners/);
  });
  assert.ok(existsSync(root('drawable/wc_bg_empty.xml')));
  assert.ok(existsSync(root('drawable/wc_head_today.xml')));
  assert.ok(existsSync(root('drawable/widget_bg_dark.xml')));
  assert.ok(!existsSync(root('drawable/widget_bg.xml')), '旧浅色背景应已移除');
});

test('资源：Java 的 CELL_BG 数量与调色板一致且顺序可查', () => {
  const m = JAVA.match(/static final int\[\] CELL_BG = \{([\s\S]*?)\};/);
  assert.ok(m, '未找到 CELL_BG');
  const names = m[1].match(/wc_bg_\d+/g) || [];
  assert.deepEqual(names, COURSE_COLORS.map((_, i) => 'wc_bg_' + i));
});

test('布局：星期表头 7 列 + 5 行 × 7 天格子 + 时间列 + 空态', () => {
  for (let d = 0; d < 7; d++) assert.match(LAYOUT, new RegExp('@\\+id/ws_h' + d + '"'));
  for (let r = 0; r < 5; r++) {
    assert.match(LAYOUT, new RegExp('@\\+id/ws_row' + r + '"'));
    assert.match(LAYOUT, new RegExp('@\\+id/ws_t' + r + '"'));
    for (let d = 0; d < 7; d++) {
      assert.match(LAYOUT, new RegExp('@\\+id/ws_w' + r + d + '"'));
      assert.match(LAYOUT, new RegExp('@\\+id/ws_n' + r + d + '"'));
      assert.match(LAYOUT, new RegExp('@\\+id/ws_rm' + r + d + '"'));
    }
  }
  assert.match(LAYOUT, /@\+id\/ws_empty/);
  assert.match(LAYOUT, /android:visibility="gone"/);
  // 参考图风格要素
  assert.match(LAYOUT, /@drawable\/widget_bg_dark/);
  assert.match(LAYOUT, /android:background="#F5C518"/);   // 黄色强调条
  assert.match(LAYOUT, /@drawable\/wc_bg_empty/);          // 灰色占位格
  assert.match(LAYOUT, /android:textColor="#FFFFFF"/);     // 白色课程名
});

test('原生：ScheduleWidgetProvider 关键实现', () => {
  assert.match(JAVA, /class ScheduleWidgetProvider extends AppWidgetProvider/);
  assert.match(JAVA, /static void pushUpdate\(Context ctx\)/);
  assert.match(JAVA, /mgr\.getAppWidgetIds\(new ComponentName\(ctx, ScheduleWidgetProvider\.class\)\)/);
  assert.match(JAVA, /PREFS_KEY_GRID/);
  // 通过 RemoteViews 反射调用 setBackgroundResource（AOSP 已确认带 @RemotableViewMethod）
  assert.match(JAVA, /setInt\(WRAP_IDS\[r\]\[d\], "setBackgroundResource", colorRes\(/);
  assert.match(JAVA, /setInt\(HEAD_IDS\[d\], "setBackgroundResource", R\.drawable\.wc_head_today\)/);
  // 星期表头今天高亮
  assert.match(JAVA, /optBoolean\("isToday"\)[\s\S]*?0xFFF5C518/);
  // 空行整行 GONE（LinearLayout 会排除 GONE 的权重）
  assert.match(JAVA, /setViewVisibility\(ROW_IDS\[r\], View\.GONE\)/);
  assert.match(JAVA, /setViewVisibility\(ROW_IDS\[r\], View\.VISIBLE\)/);
  // 空态文案
  assert.match(JAVA, /setViewVisibility\(R\.id\.ws_empty, View\.VISIBLE\)/);
  assert.match(JAVA, /打开 App 导入课表/);
  assert.match(JAVA, /本周暂无课程/);
  // 越界 colorIndex 回退，避免宿主端异常
  assert.match(JAVA, /static int colorRes\(int colorIndex\)/);
  assert.match(JAVA, /if \(colorIndex < 0 \|\| colorIndex >= CELL_BG\.length\) return CELL_BG\[0\]/);
  // 数据损坏不崩
  assert.match(JAVA, /catch \(Exception e\) \{[\s\S]{0,80}payload = null/);
});

test('原生：今日/近日小组件也改用同一套彩色块与深色卡片', () => {
  assert.match(TODAY_JAVA, /ScheduleWidgetProvider\.colorRes\(c\.optInt\("colorIndex", 0\)\)/);
  assert.match(RECENT_JAVA, /ScheduleWidgetProvider\.colorRes\(c\.optInt\("colorIndex", 0\)\)/);
  assert.match(RECENT_JAVA, /setInt\(DAY_SLOTS\[d\]\[0\], "setBackgroundResource", R\.drawable\.wc_bg_empty\)/);
  for (const f of ['widget_today.xml', 'widget_recent.xml']) {
    const xml = readFileSync(root('layout/' + f), 'utf8');
    assert.match(xml, /@drawable\/widget_bg_dark/, f + ' 应为深色卡片');
    assert.match(xml, /@drawable\/wc_bg_empty/, f + ' 课程槽位应有占位底色');
    assert.match(xml, /android:background="#F5C518"/, f + ' 应有黄色强调条');
    assert.ok(!/@drawable\/widget_bg"/.test(xml), f + ' 不应再引用旧背景');
  }
});

test('原生：清单注册课表网格小组件 + 文案齐备', () => {
  assert.match(MANIFEST, /android:name="\.ScheduleWidgetProvider"/);
  assert.match(MANIFEST, /android:label="@string\/widget_schedule_label"/);
  assert.match(MANIFEST, /android:resource="@xml\/widget_schedule_info"/);
  assert.match(STRINGS, /<string name="widget_schedule_label">课表网格<\/string>/);
  assert.match(STRINGS, /<string name="widget_schedule_desc">[^<]*课表[^<]*<\/string>/);
  const info = readFileSync(root('xml/widget_schedule_info.xml'), 'utf8');
  assert.match(info, /android:initialLayout="@layout\/widget_schedule"/);
  assert.match(info, /android:previewLayout="@layout\/widget_schedule"/);
  assert.match(info, /android:resizeMode="horizontal\|vertical"/);
  assert.match(info, /android:description="@string\/widget_schedule_desc"/);
});

test('原生：saveToday 同时下发网格数据并刷新三款小组件', () => {
  assert.match(PLUGIN, /static final String PREFS_KEY_GRID = "schedule_grid_payload"/);
  assert.match(PLUGIN, /call\.getString\("gridPayload", null\)/);
  assert.match(PLUGIN, /if \(gridPayload != null\) ed\.putString\(PREFS_KEY_GRID, gridPayload\)/);
  assert.match(PLUGIN, /TodayWidgetProvider\.pushUpdate\(ctx\);[\s\S]*?RecentWidgetProvider\.pushUpdate\(ctx\);[\s\S]*?ScheduleWidgetProvider\.pushUpdate\(ctx\)/);
  assert.match(PLUGIN, /"grid"\.equals\(which\)[\s\S]*?ScheduleWidgetProvider\.class/);
});

/* ---------------- JS 侧 ---------------- */

test('JS：面板新增"课表网格"入口与预览', () => {
  assert.match(HTML, /function widgetGridPreviewHtml\(\)/);
  assert.match(HTML, /buildWidgetGridPayload\(DB\.courseSchedule, TODAY, \{ maxRows: 5 \}\)/);
  assert.match(HTML, /data-widget-pin="grid"/);
  assert.match(HTML, /课表网格/);
  assert.match(HTML, /wpg-cell/);
  assert.match(HTML, /is-today/);
});

test('JS：保存时一并同步网格 payload', () => {
  assert.match(HTML, /buildWidgetGridPayload, pickRoomColumn \} from '\.\/src\/schedule-core\.js'/);
  assert.match(HTML, /var gridPayload = buildWidgetGridPayload\(DB\.courseSchedule, TODAY, \{ maxRows: 5 \}\)/);
  assert.match(HTML, /gridPayload: JSON\.stringify\(gridPayload\)/);
});

/** 设计画布打开 HTML 时会往里注入 data-page-node-id 属性（纯编辑器标记）。
 *  它会让"三处镜像必须逐字节一致"这条不变量误报，比较前统一剥掉。 */
const stripEditorAttrs = (s) => s.replace(/ data-page-node-id="[^"]*"/g, '');

test('镜像：三处 schedule-core.js / HTML 完全一致（含 www 与 APK assets）', () => {
  const src = readFileSync(new URL('../src/schedule-core.js', import.meta.url), 'utf8');
  const www = readFileSync(new URL('../WorkMemoApp/www/src/schedule-core.js', import.meta.url), 'utf8');
  const assets = readFileSync(new URL('../WorkMemoApp/android/app/src/main/assets/public/src/schedule-core.js', import.meta.url), 'utf8');
  assert.equal(src, www);
  assert.equal(src, assets);
  const h1 = readFileSync(new URL('../work-memo-app.html', import.meta.url), 'utf8');
  const h2 = readFileSync(new URL('../WorkMemoApp/www/index.html', import.meta.url), 'utf8');
  assert.equal(stripEditorAttrs(h1), stripEditorAttrs(h2));
  // 另外确认注入没有被同步进镜像（www 必须是干净的）
  assert.equal(/data-page-node-id/.test(h2), false, 'www 镜像里不应有画布注入');
});
