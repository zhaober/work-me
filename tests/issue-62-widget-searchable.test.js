// issue-62: 小组件在桌面启动器搜索中可被识别
// - 每个 widget receiver 必须有独立 android:label（搜索与选择器显示的标题）
// - description 字符串包含可搜索关键词（课表/课程表/备忘录）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const APK_ROOT = new URL('../WorkMemoApp/android/app/src/main/', import.meta.url);
const manifest = readFileSync(new URL('AndroidManifest.xml', APK_ROOT), 'utf8');
const strings = readFileSync(new URL('res/values/strings.xml', APK_ROOT), 'utf8');

test('TodayWidgetProvider receiver 声明了独立 label', () => {
  assert.match(manifest, /<receiver[\s\S]*?\.TodayWidgetProvider[\s\S]*?android:label="@string\/widget_today_label"/);
});

test('RecentWidgetProvider receiver 声明了独立 label', () => {
  assert.match(manifest, /<receiver[\s\S]*?\.RecentWidgetProvider[\s\S]*?android:label="@string\/widget_recent_label"/);
});

test('strings.xml 定义两个 widget label', () => {
  assert.match(strings, /<string name="widget_today_label">[^<]*今日课程<\/string>/);
  assert.match(strings, /<string name="widget_recent_label">[^<]*近日课程<\/string>/);
});

test('widget 描述包含可搜索关键词（课表/备忘录）', () => {
  const todayDesc = strings.match(/<string name="widget_today_desc">([^<]*)<\/string>/)?.[1] || '';
  const recentDesc = strings.match(/<string name="widget_recent_desc">([^<]*)<\/string>/)?.[1] || '';
  assert.ok(todayDesc.includes('课表') && todayDesc.includes('备忘录'), 'today 描述需含课表/备忘录关键词');
  assert.ok(recentDesc.includes('课表') && recentDesc.includes('备忘录'), 'recent 描述需含课表/备忘录关键词');
});
