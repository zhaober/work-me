// issue-65: 应用内小组件入口（一键添加到桌面）
// - 原生：WidgetBridgePlugin.requestPin（API 26+ / launcher 支持检测 / 组件映射）
// - JS：课表页入口按钮、预览面板、requestPin 调用与降级提示
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const HTML = readFileSync(new URL('../work-memo-app.html', import.meta.url), 'utf8');
const PLUGIN = readFileSync(new URL('../WorkMemoApp/android/app/src/main/java/com/workmemo/app/WidgetBridgePlugin.java', import.meta.url), 'utf8');

test('原生：requestPin 方法存在并做能力检测', () => {
  assert.match(PLUGIN, /@PluginMethod\s*\n\s*public void requestPin\(PluginCall call\)/);
  assert.match(PLUGIN, /Build\.VERSION\.SDK_INT < Build\.VERSION_CODES\.O/);
  assert.match(PLUGIN, /mgr\.isRequestPinAppWidgetSupported\(\)/);
  assert.match(PLUGIN, /mgr\.requestPinAppWidget\(cn, null, null\)/);
});

test('原生：requestPin 按 widget 参数映射到对应 Provider', () => {
  assert.match(PLUGIN, /"recent"\.equals\(which\)[\s\S]*?RecentWidgetProvider\.class/);
  assert.match(PLUGIN, /TodayWidgetProvider\.class/);
});

test('JS：课表页有"添加到桌面"入口（有学期 + 空态两处）', () => {
  assert.match(HTML, /id="schWidgetEntry"/);
  const count = (HTML.match(/id="schWidgetEntry"/g) || []).length;
  assert.ok(count >= 2, '有学期 header 与空态都应有入口，实际 ' + count);
  assert.match(HTML, /class="schedule-widget-btn"/);
});

test('JS：面板含两个小组件预览与各自的添加按钮', () => {
  assert.match(HTML, /function openWidgetPanel\(\)/);
  assert.match(HTML, /data-widget-pin="today"/);
  assert.match(HTML, /data-widget-pin="recent"/);
  assert.match(HTML, /function widgetTodayPreviewHtml\(\)/);
  assert.match(HTML, /function widgetRecentPreviewHtml\(\)/);
  assert.match(HTML, /openCustomModal\('课表小组件', html\)/);
});

test('JS：预览使用真实课表数据（buildWidgetPayload）', () => {
  assert.match(HTML, /function widgetTodayPreviewHtml\(\)\{[\s\S]*?buildWidgetPayload\(DB\.courseSchedule, TODAY, 3\)/);
});

test('JS：requestPin 调用与降级提示', () => {
  assert.match(HTML, /function requestPinWidget\(which\)/);
  assert.match(HTML, /bridge\.requestPin\(\{ widget: which \}\)/);
  assert.match(HTML, /当前桌面不支持一键添加，请长按桌面手动添加/);
  assert.match(HTML, /请在手机上使用该功能/);
  assert.match(HTML, /console\.warn\('\[widget\] requestPin 失败:'/);
});

test('JS：事件委托已接入入口与添加按钮', () => {
  assert.match(HTML, /closest\('#schWidgetEntry'\)[\s\S]*?openWidgetPanel\(\)/);
  assert.match(HTML, /closest\('\[data-widget-pin\]'\)[\s\S]*?requestPinWidget\(pinBtn\.getAttribute\('data-widget-pin'\)\)/);
});

test('面板样式：深色卡片 + 彩色课程块（与参考图一致的风格）', () => {
  assert.match(HTML, /\.widget-preview\{background:linear-gradient\(135deg,#5a5a5a,#4a4a4a\)/);
  assert.match(HTML, /\.wp-bar\{width:3px;height:13px;border-radius:2px;background:#F5C518/);
  assert.match(HTML, /\.wp-course\{border-radius:7px/);
});
