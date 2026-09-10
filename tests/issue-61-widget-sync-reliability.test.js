// issue-61: 小组件数据同步可靠性
// - MainActivity：registerPlugin 必须在 super.onCreate 之前（bridge 时序根因）
// - MainActivity：onResume 自愈刷新两个 widget
// - JS：syncScheduleWidget 可观测（不可用 warn / 失败 warn / 成功时间戳）
// - JS：回前台 appStateChange isActive=true 时同步
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const HTML = readFileSync(new URL('../work-memo-app.html', import.meta.url), 'utf8');
const MAIN = readFileSync(new URL('../WorkMemoApp/android/app/src/main/java/com/workmemo/app/MainActivity.java', import.meta.url), 'utf8');

test('MainActivity: registerPlugin 必须先于 super.onCreate（bridge 创建时序）', () => {
  const reg = MAIN.indexOf('registerPlugin(WidgetBridgePlugin.class);');
  const sup = MAIN.indexOf('super.onCreate(savedInstanceState);');
  assert.ok(reg >= 0, '缺少 registerPlugin');
  assert.ok(sup >= 0, '缺少 super.onCreate');
  assert.ok(reg < sup, 'registerPlugin 必须出现在 super.onCreate 之前，否则 bridge 已创建、插件注册无效');
});

test('MainActivity: onResume 主动刷新两个小组件（自愈）', () => {
  assert.match(MAIN, /public void onResume\(\)/);
  assert.match(MAIN, /TodayWidgetProvider\.pushUpdate\(this\)/);
  assert.match(MAIN, /RecentWidgetProvider\.pushUpdate\(this\)/);
});

test('syncScheduleWidget: 插件不可用/调用失败均有可观测警告', () => {
  assert.match(HTML, /WidgetBridge 插件不可用/);
  assert.match(HTML, /saveToday 失败:/);
  assert.match(HTML, /window\.__widgetSyncAt = Date\.now\(\)/);
  // issue-66 起 saveToday 改为同时下发 payload 与 gridPayload
  assert.match(HTML, /Promise\.resolve\(bridge\.saveToday\(\{\s*payload: JSON\.stringify\(payload\),/);
});

test('回前台（appStateChange isActive=true）触发同步', () => {
  assert.match(HTML, /appStateChange', function\(state\)\{\s*\n\s*if\(state && state\.isActive\)\{\s*syncScheduleWidget\(\);/);
});

test('既有挂载点保留：saveDB 与 boot', () => {
  assert.match(HTML, /function saveDB\(\)\{\s*\n\s*syncScheduleWidget\(\);/);
  assert.match(HTML, /renderSchedule\(\);\s*\n\s*syncScheduleWidget\(\);\s*\n\s*maybeAutoShowQuote\(\);/);
});
